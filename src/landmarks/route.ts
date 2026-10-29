import { mapLon, type Landmark } from './landmarks';

/** Kilometres per degree of latitude on the Mars 2000 sphere (π × 3,396.19 km / 180). */
export const KM_PER_DEG = 59.274;

export type LatLng = [number, number];

/**
 * A local exploration route around a landmark.
 *
 * Routes are laid out in "map kilometres": a kilometre of latitude in both directions, so a
 * path looks the same on the plate carrée map at any latitude. Arc length `s` is measured in
 * those units; `realKmAt(s)` gives the true distance on the Martian surface for display.
 */
export interface ExplorationRoute {
  landmark: Landmark;
  /** Densely sampled, smoothed path */
  points: LatLng[];
  /** Cumulative map-km at each point */
  cum: number[];
  /** Cumulative true surface km at each point */
  realCum: number[];
  length: number;
  start: LatLng;
  /** Position and arc length of each checkpoint, in order; the last one ends the route */
  checkpoints: { latLng: LatLng; s: number }[];
  bounds: [LatLng, LatLng];
}

/** Small deterministic PRNG, seeded from the landmark id, so every visit walks the same path. */
function rng(seedText: string) {
  let s = 2166136261;
  for (let i = 0; i < seedText.length; i++) s = Math.imul(s ^ seedText.charCodeAt(i), 16777619);
  s >>>= 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function catmullRom(p0: number[], p1: number[], p2: number[], p3: number[], t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map(
    (k) =>
      0.5 *
      (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
  );
}

/**
 * Builds the route for a landmark. `nearLng` picks the copy of the world closest to the
 * current map view, so the walk never jumps across the ±180° seam.
 */
export function buildRoute(landmark: Landmark, nearLng: number): ExplorationRoute {
  const rand = rng(landmark.id);
  const n = landmark.checkpoints.length;

  // Waypoints in local km (x east, y north): a start, then one leg per checkpoint
  const way: number[][] = [[0, 0]];
  let heading = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    heading += (rand() - 0.5) * 1.7;
    const leg = 1.9 + rand() * 0.9;
    const [x, y] = way[way.length - 1];
    way.push([x + leg * Math.cos(heading), y + leg * Math.sin(heading)]);
  }

  // Meander: a sideways nudge halfway along each leg, so the path wanders like a real traverse
  const control: number[][] = [way[0]];
  const checkpointControl: number[] = [];
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1];
    const [bx, by] = way[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const side = (rand() - 0.5) * 0.9;
    control.push([(ax + bx) / 2 + (-dy / len) * side, (ay + by) / 2 + (dx / len) * side]);
    control.push(way[i]);
    checkpointControl.push(control.length - 1);
  }

  // Centre the route on the landmark
  const xs = control.map((p) => p[0]);
  const ys = control.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const local = control.map(([x, y]) => [x - cx, y - cy]);

  // Smooth through every control point
  const SAMPLES = 18;
  const dense: number[][] = [];
  const controlIndex: number[] = [];
  for (let i = 0; i < local.length - 1; i++) {
    const p0 = local[Math.max(0, i - 1)];
    const p3 = local[Math.min(local.length - 1, i + 2)];
    controlIndex[i] = dense.length;
    for (let j = 0; j < SAMPLES; j++) dense.push(catmullRom(p0, local[i], local[i + 1], p3, j / SAMPLES));
  }
  controlIndex[local.length - 1] = dense.length;
  dense.push(local[local.length - 1]);

  const lat0 = landmark.lat;
  const lng0 = mapLon(landmark.lon) + 360 * Math.round((nearLng - mapLon(landmark.lon)) / 360);
  const cosLat = (lat: number) => Math.cos((lat * Math.PI) / 180);

  const points: LatLng[] = dense.map(([x, y]) => [lat0 + y / KM_PER_DEG, lng0 + x / KM_PER_DEG]);
  const cum = [0];
  const realCum = [0];
  for (let i = 1; i < dense.length; i++) {
    const dx = dense[i][0] - dense[i - 1][0];
    const dy = dense[i][1] - dense[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
    realCum.push(realCum[i - 1] + Math.hypot(dx * cosLat(points[i][0]), dy));
  }

  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);

  return {
    landmark,
    points,
    cum,
    realCum,
    length: cum[cum.length - 1],
    start: points[0],
    checkpoints: checkpointControl.map((ci) => {
      const idx = controlIndex[ci];
      return { latLng: points[idx], s: cum[idx] };
    }),
    bounds: [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ],
  };
}

function locate(route: ExplorationRoute, s: number) {
  const { cum } = route;
  const clamped = Math.min(route.length, Math.max(0, s));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  return { i: lo, t: span > 0 ? (clamped - cum[lo]) / span : 0 };
}

/** Position along the route at arc length s. */
export function pointAt(route: ExplorationRoute, s: number): LatLng {
  const { i, t } = locate(route, s);
  const a = route.points[i];
  const b = route.points[Math.min(i + 1, route.points.length - 1)];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** True surface distance walked at arc length s, in km. */
export function realKmAt(route: ExplorationRoute, s: number): number {
  const { i, t } = locate(route, s);
  const a = route.realCum[i];
  const b = route.realCum[Math.min(i + 1, route.realCum.length - 1)];
  return a + (b - a) * t;
}

/** The path walked so far, ending exactly at s. */
export function walkedPath(route: ExplorationRoute, s: number): LatLng[] {
  const { i } = locate(route, s);
  return [...route.points.slice(0, i + 1), pointAt(route, s)];
}
