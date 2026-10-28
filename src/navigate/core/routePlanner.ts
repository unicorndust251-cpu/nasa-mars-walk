import { CostField, MODE_WEIGHTS, SLOPE_LIMIT_DEG, slopeClass, type RouteMode, type SlopeClassKey } from './costModel.ts';
import { AbortedError, Pathfinder } from './pathfinding.ts';
import { smoothPath, traverseCells } from './smoothing.ts';
import { distanceKm, distanceToPathKm, greatCirclePath, pathLengthKm, type LatLon } from './marsGeo.ts';
import type { TerrainGrid } from './terrain.ts';

/**
 * RoutePlanner: turns a start, destination, waypoints and a mode into a route.
 *
 *  - Inside the terrain model (Jezero Crater), each leg is found with A* over the terrain cost
 *    field, then smoothed without increasing its cost. Reported distances are great-circle lengths
 *    of the resulting polyline on the Mars mean sphere.
 *  - Anywhere else, or if terrain data is unavailable, the result is a clearly labelled DIRECT
 *    PREVIEW along great circles: a planetary distance, never presented as a traversable route.
 *  - Scientific Discovery chooses extra stops with a greedy orienteering heuristic: the most
 *    valuable sites per kilometre of detour, within the visitor's detour budget, then verified by
 *    pathfinding (stops that blow the budget once real terrain is considered are dropped).
 */

export type DetourLevel = 'minimal' | 'moderate' | 'extensive';

/** Extra distance the Scientific Discovery mode may add, relative to the plain terrain-aware route. */
export const DETOUR_BUDGETS: Record<DetourLevel, { fraction: number; minKm: number; maxStops: number; label: string }> = {
  minimal: { fraction: 0.1, minKm: 0.5, maxStops: 2, label: 'Minimal detour' },
  moderate: { fraction: 0.35, minKm: 2, maxStops: 4, label: 'Moderate detour' },
  extensive: { fraction: 0.8, minKm: 5, maxStops: 6, label: 'Extensive exploration' },
};

export interface RoutePoint extends LatLon {
  name: string;
  id?: string;
}

export interface PlanRequest {
  start: RoutePoint;
  destination: RoutePoint;
  waypoints: RoutePoint[];
  mode: RouteMode;
  detour: DetourLevel;
}

export interface ScienceCandidate extends LatLon {
  id: string;
  name: string;
  /** Curated scientific weight, 1–3 */
  value: number;
}

export interface PlannerContext {
  terrain: TerrainGrid | null;
  candidates?: ScienceCandidate[];
  signal?: { aborted: boolean };
  pause?: () => Promise<void>;
  /** Pathfinder expansions between pauses (lower = more responsive to cancellation) */
  yieldEvery?: number;
}

export type StopKind = 'start' | 'waypoint' | 'science' | 'destination';

export interface RouteStop extends LatLon {
  name: string;
  kind: StopKind;
  id?: string;
  /** Distance along the route at this stop, km */
  atKm: number;
}

export interface ElevationSummary {
  gainM: number;
  lossM: number;
  minM: number;
  maxM: number;
  startM: number;
  endM: number;
  /** Profile for charts: distance along route (km), elevation (m, relative to the MOLA areoid) and position */
  profile: Array<{ km: number; m: number; lat: number; lon: number }>;
}

export interface TerrainSummary {
  /** Distance in each slope class, km */
  classKm: Record<SlopeClassKey, number>;
  maxSlopeDeg: number;
  /** Distance over rough ground (> 1 m RMS within 100 m), km */
  roughKm: number;
  /** Distance over cells without elevation data, km */
  unknownKm: number;
}

export type Difficulty = 'Easy' | 'Moderate' | 'Challenging' | 'Not assessed';
export type Confidence = 'High' | 'Medium' | 'Low';

export interface RouteResult {
  kind: 'terrain' | 'preview';
  mode: RouteMode;
  detour: DetourLevel;
  coordinates: LatLon[];
  distanceKm: number;
  /** Great-circle distance from start to destination, km */
  directKm: number;
  legsKm: number[];
  stops: RouteStop[];
  elevation: ElevationSummary | null;
  terrain: TerrainSummary | null;
  difficulty: Difficulty;
  confidence: Confidence;
  /** Terrain-aware and science routes: how they differ from the shortest route */
  comparison: { shortestKm: number; steepKmAvoided: number; climbAvoidedM: number; explanation: string } | null;
  science: { budgetKm: number; baseKm: number; extraKm: number; added: RouteStop[]; considered: number } | null;
  /** Limitations and adjustments, in plain language */
  notes: string[];
  dataSource: string | null;
}

export class RoutePlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutePlanningError';
  }
}

/* ------------------------------------------------------- shared state */

interface GridTools {
  pathfinder: Pathfinder;
  fields: Map<string, CostField>;
}
const tools = new WeakMap<TerrainGrid, GridTools>();

function toolsFor(grid: TerrainGrid): GridTools {
  let t = tools.get(grid);
  if (!t) {
    t = { pathfinder: new Pathfinder(grid.cols, grid.rows), fields: new Map() };
    tools.set(grid, t);
  }
  return t;
}

/** Cost field for a mode, built once per grid. Science routes use the terrain-aware weights. */
export function costFieldFor(grid: TerrainGrid, mode: RouteMode): CostField {
  const key = mode === 'shortest' ? 'shortest' : 'terrain';
  const t = toolsFor(grid);
  let f = t.fields.get(key);
  if (!f) {
    f = new CostField(grid, MODE_WEIGHTS[key]);
    t.fields.set(key, f);
  }
  return f;
}

/* ---------------------------------------------------------------- legs */

interface Leg {
  points: LatLon[];
  km: number;
  snappedM: [number, number];
}

/** True when the straight piece between two points touches only passable cells. */
function pieceClear(field: CostField, p: LatLon, q: LatLon): boolean {
  const grid = field.grid;
  const a = grid.toGrid(p);
  const b = grid.toGrid(q);
  let clear = true;
  traverseCells(grid.cols, grid.rows, a.gx, a.gy, b.gx, b.gy, (cell) => (clear = field.passable[cell] === 1));
  return clear;
}

/** Nearest passable cell to k (searching outward up to `radius` cells), or −1. */
function snapToPassable(field: CostField, k: number, radius = 8): number {
  if (field.passable[k]) return k;
  const { cols, rows } = field.grid;
  const c0 = k % cols;
  const r0 = Math.floor(k / cols);
  let best = -1;
  let bestD = Infinity;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const c = c0 + dc;
      const r = r0 + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const kk = r * cols + c;
      const d = dc * dc + dr * dr;
      if (field.passable[kk] && d < bestD) {
        bestD = d;
        best = kk;
      }
    }
  }
  return best;
}

async function routeLeg(
  grid: TerrainGrid,
  field: CostField,
  a: RoutePoint,
  b: RoutePoint,
  ctx: PlannerContext,
  cache: Map<string, Leg>
): Promise<Leg> {
  const key = `${field.weights === MODE_WEIGHTS.shortest ? 's' : 't'}|${a.lat},${a.lon}|${b.lat},${b.lon}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const ca = grid.cellAt(a)!;
  const cb = grid.cellAt(b)!;
  const sa = snapToPassable(field, ca.k);
  const sb = snapToPassable(field, cb.k);
  if (sa < 0) throw new RoutePlanningError(`${a.name} sits on terrain steeper than ${SLOPE_LIMIT_DEG}° with no gentler ground nearby.`);
  if (sb < 0) throw new RoutePlanningError(`${b.name} sits on terrain steeper than ${SLOPE_LIMIT_DEG}° with no gentler ground nearby.`);

  let cells: number[];
  if (sa === sb) cells = [sa];
  else {
    const found = await toolsFor(grid).pathfinder.search(field, sa, sb, {
      cellM: grid.cellM,
      signal: ctx.signal,
      pause: ctx.pause,
      yieldEvery: ctx.yieldEvery,
    });
    if (!found) throw new RoutePlanningError(`No route avoiding slopes over ${SLOPE_LIMIT_DEG}° connects ${a.name} and ${b.name}.`);
    cells = smoothPath(field, found.path);
  }

  const center = (k: number) => grid.cellCenter(k % grid.cols, Math.floor(k / grid.cols));
  const vertices = cells.map(center);
  // A stop on impassable ground is reached at the nearest traversable cell; the route never
  // continues onto the steep spot itself. Otherwise the route starts and ends exactly at the
  // stop, keeping the cell centre only if the direct piece would touch impassable ground.
  const points: LatLon[] = [];
  if (sa !== ca.k) points.push(vertices[0]);
  else {
    points.push({ lat: a.lat, lon: a.lon });
    if (vertices.length > 1 && !pieceClear(field, a, vertices[1])) points.push(vertices[0]);
  }
  for (let i = 1; i < vertices.length - 1; i++) points.push(vertices[i]);
  if (sb !== cb.k) {
    if (vertices.length > 1 || sa === ca.k) points.push(vertices[vertices.length - 1]);
  } else {
    const prev = points[points.length - 1];
    if (vertices.length > 1 && !pieceClear(field, prev, b)) points.push(vertices[vertices.length - 1]);
    points.push({ lat: b.lat, lon: b.lon });
  }
  if (points.length === 1) points.push(points[0]);

  const leg: Leg = {
    points,
    km: pathLengthKm(points),
    snappedM: [sa === ca.k ? 0 : distanceKm(a, center(sa)) * 1000, sb === cb.k ? 0 : distanceKm(b, center(sb)) * 1000],
  };
  cache.set(key, leg);
  return leg;
}

async function routeThrough(grid: TerrainGrid, field: CostField, stops: RoutePoint[], ctx: PlannerContext, cache: Map<string, Leg>) {
  const legs: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    // A newer request may have arrived while the previous leg was computed
    if (ctx.signal?.aborted) throw new AbortedError();
    legs.push(await routeLeg(grid, field, stops[i - 1], stops[i], ctx, cache));
  }
  return legs;
}

/* ------------------------------------------------------------ analysis */

/** Walks the route on the terrain grid, measuring slopes, roughness and elevation every half cell. */
export function analyzeRoute(grid: TerrainGrid, points: LatLon[]): { elevation: ElevationSummary; terrain: TerrainSummary } {
  const classKm: Record<SlopeClassKey, number> = { gentle: 0, moderate: 0, steep: 0, verySteep: 0 };
  let maxSlope = 0;
  let roughKm = 0;
  let unknownKm = 0;
  const samples: Array<{ km: number; m: number; lat: number; lon: number }> = [];
  let along = 0;

  const sample = (p: LatLon, segKm: number) => {
    const cell = grid.cellAt(p);
    if (cell) {
      const s = grid.slope[cell.k];
      const r = grid.roughness[cell.k];
      if (!grid.isKnown(cell.k)) unknownKm += segKm;
      else {
        classKm[slopeClass(s)] += segKm;
        maxSlope = Math.max(maxSlope, s);
        if (r > 1) roughKm += segKm;
      }
    }
    const e = grid.elevationAt(p);
    if (!Number.isNaN(e)) samples.push({ km: along, m: e, lat: p.lat, lon: p.lon });
  };

  sample(points[0], 0);
  const stepKm = grid.cellM / 2000;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = distanceKm(a, b);
    const n = Math.max(1, Math.ceil(d / stepKm));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      along += d / n;
      sample({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }, d / n);
    }
  }

  // Elevation gain and loss with a 2 m hysteresis, so DEM noise doesn't inflate the totals
  let gain = 0;
  let loss = 0;
  let ref = samples[0]?.m ?? 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    min = Math.min(min, s.m);
    max = Math.max(max, s.m);
    if (s.m - ref >= 2) {
      gain += s.m - ref;
      ref = s.m;
    } else if (ref - s.m >= 2) {
      loss += ref - s.m;
      ref = s.m;
    }
  }
  const stride = Math.max(1, Math.ceil(samples.length / 180));
  const profile = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);

  return {
    elevation: {
      gainM: Math.round(gain),
      lossM: Math.round(loss),
      minM: Math.round(min),
      maxM: Math.round(max),
      startM: Math.round(samples[0]?.m ?? NaN),
      endM: Math.round(samples[samples.length - 1]?.m ?? NaN),
      profile,
    },
    terrain: { classKm, maxSlopeDeg: Math.round(maxSlope * 10) / 10, roughKm, unknownKm },
  };
}

export function classifyDifficulty(t: TerrainSummary, totalKm: number): Difficulty {
  const steepShare = (t.classKm.steep + t.classKm.verySteep) / Math.max(1e-6, totalKm);
  if (t.maxSlopeDeg <= 10) return 'Easy';
  if (t.maxSlopeDeg <= 20 && steepShare <= 0.1) return 'Moderate';
  return 'Challenging';
}

/* -------------------------------------------------------------- planner */

function validate(req: PlanRequest) {
  const all = [req.start, ...req.waypoints, req.destination];
  for (const p of all) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat < -90 || p.lat > 90) {
      throw new RoutePlanningError(`${p.name || 'A point'} has invalid coordinates.`);
    }
  }
  if (distanceKm(req.start, req.destination) < 0.001 && req.waypoints.length === 0) {
    throw new RoutePlanningError('Start and destination are the same place.');
  }
}

function stopsFor(points: RoutePoint[], kinds: StopKind[], legsKm: number[]): RouteStop[] {
  let at = 0;
  return points.map((p, i) => {
    if (i > 0) at += legsKm[i - 1];
    return { lat: p.lat, lon: p.lon, name: p.name, id: p.id, kind: kinds[i], atKm: at };
  });
}

function joinLegs(legs: Leg[]): LatLon[] {
  const out: LatLon[] = [];
  legs.forEach((leg, i) => out.push(...(i === 0 ? leg.points : leg.points.slice(1))));
  return out;
}

const steepKm = (t: TerrainSummary) => t.classKm.steep + t.classKm.verySteep;

function previewRoute(req: PlanRequest, reason: 'outside' | 'unavailable'): RouteResult {
  const pts: RoutePoint[] = [req.start, ...req.waypoints, req.destination];
  const legs = pts.slice(1).map((p, i) => greatCirclePath(pts[i], p, 20));
  const legsKm = legs.map(pathLengthKm);
  const coordinates: LatLon[] = [];
  legs.forEach((l, i) => coordinates.push(...(i === 0 ? l : l.slice(1))));
  const kinds: StopKind[] = pts.map((_, i) => (i === 0 ? 'start' : i === pts.length - 1 ? 'destination' : 'waypoint'));
  return {
    kind: 'preview',
    mode: req.mode,
    detour: req.detour,
    coordinates,
    distanceKm: legsKm.reduce((s, v) => s + v, 0),
    directKm: distanceKm(req.start, req.destination),
    legsKm,
    stops: stopsFor(pts, kinds, legsKm),
    elevation: null,
    terrain: null,
    difficulty: 'Not assessed',
    confidence: 'Low',
    comparison: null,
    science: null,
    notes: [
      reason === 'unavailable'
        ? 'Terrain data could not be loaded, so no terrain-aware route can be calculated.'
        : 'Part of this journey lies outside the area with terrain data (Jezero Crater), so a traversable route cannot be calculated.',
      'This is a direct-distance preview along great circles on the Mars mean sphere (radius 3,389.5 km). It is not a path anyone could safely drive.',
      ...(req.mode !== 'shortest' ? ['Terrain-aware and scientific planning need elevation data, which is only integrated for Jezero Crater so far.'] : []),
    ],
    dataSource: null,
  };
}

export async function planRoute(req: PlanRequest, ctx: PlannerContext): Promise<RouteResult> {
  validate(req);
  const grid = ctx.terrain;
  const userStops: RoutePoint[] = [req.start, ...req.waypoints, req.destination];
  if (!grid) return previewRoute(req, 'unavailable');
  if (!userStops.every((p) => grid.contains(p))) return previewRoute(req, 'outside');

  const cache = new Map<string, Leg>();
  const field = costFieldFor(grid, req.mode);
  const notes: string[] = [
    'Educational exploration route, not a certified rover-safe path.',
    `Terrain: USGS Mars 2020 CTX DEM (20 m), analysed on a ${grid.cellM} m grid. Boulders, sand and anything smaller than this are not represented.`,
  ];

  let stops: RoutePoint[] = userStops;
  let kinds: StopKind[] = userStops.map((_, i) => (i === 0 ? 'start' : i === userStops.length - 1 ? 'destination' : 'waypoint'));
  let legs = await routeThrough(grid, field, stops, ctx, cache);
  let science: RouteResult['science'] = null;

  if (req.mode === 'science') {
    const chosen = await chooseScienceStops(grid, field, userStops, legs, req.detour, ctx, cache);
    stops = chosen.stops;
    kinds = chosen.kinds;
    legs = chosen.legs;
    science = chosen.summary;
  }

  const legsKm = legs.map((l) => l.km);
  const coordinates = joinLegs(legs);
  const distance = legsKm.reduce((s, v) => s + v, 0);
  const { elevation, terrain } = analyzeRoute(grid, coordinates);

  const snapped = legs.flatMap((l) => l.snappedM).filter((m) => m > 1);
  if (snapped.length) {
    notes.push(
      `A stop lies on ground steeper than ${SLOPE_LIMIT_DEG}°, so the route reaches the nearest traversable ground instead (up to ${Math.round(Math.max(...snapped))} m away).`
    );
  }
  if (terrain.unknownKm > 0.05) notes.push(`${terrain.unknownKm.toFixed(1)} km crosses ground without elevation data; it was given an uncertainty penalty, not treated as safe.`);

  let comparison: RouteResult['comparison'] = null;
  if (req.mode !== 'shortest') {
    const shortestLegs = await routeThrough(grid, costFieldFor(grid, 'shortest'), userStops, ctx, cache);
    const shortestCoords = joinLegs(shortestLegs);
    const shortestKm = shortestLegs.reduce((s, l) => s + l.km, 0);
    const shortestStats = analyzeRoute(grid, shortestCoords);
    const baseKm = science ? science.baseKm : distance;
    const baseStats = science ? analyzeRoute(grid, joinLegs(await routeThrough(grid, field, userStops, ctx, cache))) : { terrain, elevation };
    const steepAvoided = Math.max(0, steepKm(shortestStats.terrain) - steepKm(baseStats.terrain));
    const climbAvoided = Math.max(0, shortestStats.elevation.gainM - baseStats.elevation.gainM);
    const extra = baseKm - shortestKm;
    let explanation: string;
    if (extra < 0.05) explanation = 'Here the shortest route is already the gentlest: the terrain-aware planner found nothing worth avoiding.';
    else {
      const parts: string[] = [];
      if (steepAvoided >= 0.05) parts.push(`${steepAvoided.toFixed(1)} km of slopes steeper than 15°`);
      if (climbAvoided >= 5) parts.push(`${climbAvoided} m of climbing`);
      const shortestMax = shortestStats.terrain.maxSlopeDeg;
      if (shortestMax - baseStats.terrain.maxSlopeDeg >= 2) parts.push(`a steepest slope of ${shortestMax.toFixed(0)}° (this route tops out at ${baseStats.terrain.maxSlopeDeg.toFixed(0)}°)`);
      explanation = `${extra.toFixed(2)} km (${Math.round((extra / shortestKm) * 100)}%) longer than the shortest route${
        parts.length ? `, to avoid ${parts.join(', ')}` : ', trading distance for gentler, smoother ground'
      }.`;
    }
    comparison = { shortestKm, steepKmAvoided: steepAvoided, climbAvoidedM: climbAvoided, explanation };
  }

  return {
    kind: 'terrain',
    mode: req.mode,
    detour: req.detour,
    coordinates,
    distanceKm: distance,
    directKm: distanceKm(req.start, req.destination),
    legsKm,
    stops: stopsFor(stops, kinds, legsKm),
    elevation,
    terrain,
    difficulty: classifyDifficulty(terrain, distance),
    confidence: terrain.unknownKm > 0.05 ? 'Medium' : 'High',
    comparison,
    science,
    notes,
    dataSource: grid.header.source,
  };
}

/* --------------------------------------------- scientific orienteering */

async function chooseScienceStops(
  grid: TerrainGrid,
  field: CostField,
  userStops: RoutePoint[],
  baseLegs: Leg[],
  detour: DetourLevel,
  ctx: PlannerContext,
  cache: Map<string, Leg>
) {
  const cfg = DETOUR_BUDGETS[detour];
  const baseKm = baseLegs.reduce((s, l) => s + l.km, 0);
  const budgetKm = Math.max(cfg.minKm, baseKm * cfg.fraction);

  // Candidates: inside the terrain model, reachable ground, not already a stop
  const candidates = (ctx.candidates ?? []).filter(
    (c) => c.value > 0 && grid.contains(c) && userStops.every((s) => distanceKm(s, c) > 0.2) && snapToPassable(field, grid.cellAt(c)!.k) >= 0
  );

  // Estimated detour for visiting c from leg i: out and back from the nearest point of the leg
  type Pick = { c: ScienceCandidate; leg: number; along: number; extra: number };
  const estimate = (c: ScienceCandidate): Pick => {
    let best: Pick = { c, leg: 0, along: 0, extra: Infinity };
    baseLegs.forEach((leg, i) => {
      const { km, segment } = distanceToPathKm(c, leg.points);
      const extra = 2 * km * 1.15;
      if (extra < best.extra) best = { c, leg: i, along: segment + 1 - 1e-6 * km, extra };
    });
    return best;
  };

  let picks: Pick[] = [];
  let spent = 0;
  const pool = candidates.map(estimate).filter((p) => p.extra <= budgetKm);
  while (picks.length < cfg.maxStops) {
    let bestIdx = -1;
    let bestRatio = 0;
    pool.forEach((p, i) => {
      if (spent + p.extra > budgetKm) return;
      // Don't stack near-duplicate stops (sites within 300 m of an already chosen one)
      if (picks.some((q) => distanceKm(q.c, p.c) < 0.3)) return;
      const ratio = p.c.value / (p.extra + 0.25);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) break;
    const [pick] = pool.splice(bestIdx, 1);
    picks.push(pick);
    spent += pick.extra;
  }

  const build = (chosen: Pick[]) => {
    const stops: RoutePoint[] = [];
    const kinds: StopKind[] = [];
    userStops.forEach((s, i) => {
      stops.push(s);
      kinds.push(i === 0 ? 'start' : i === userStops.length - 1 ? 'destination' : 'waypoint');
      if (i < userStops.length - 1) {
        chosen
          .filter((p) => p.leg === i)
          .sort((a, b) => a.along - b.along)
          .forEach((p) => {
            stops.push({ lat: p.c.lat, lon: p.c.lon, name: p.c.name, id: p.c.id });
            kinds.push('science');
          });
      }
    });
    return { stops, kinds };
  };

  // Verify with real pathfinding; drop the least valuable stops while the detour is over budget
  let { stops, kinds } = build(picks);
  let legs = await routeThrough(grid, field, stops, ctx, cache);
  let total = legs.reduce((s, l) => s + l.km, 0);
  for (let attempt = 0; attempt < 4 && picks.length > 0 && total - baseKm > budgetKm * 1.15; attempt++) {
    const worst = picks.reduce((w, p) => (p.c.value / (p.extra + 0.25) < w.c.value / (w.extra + 0.25) ? p : w));
    picks = picks.filter((p) => p !== worst);
    ({ stops, kinds } = build(picks));
    legs = await routeThrough(grid, field, stops, ctx, cache);
    total = legs.reduce((s, l) => s + l.km, 0);
  }

  const legsKm = legs.map((l) => l.km);
  const routeStops = stopsFor(stops, kinds, legsKm);
  return {
    stops,
    kinds,
    legs,
    summary: {
      budgetKm,
      baseKm,
      extraKm: Math.max(0, total - baseKm),
      added: routeStops.filter((s) => s.kind === 'science'),
      considered: candidates.length,
    },
  };
}

export { AbortedError };
