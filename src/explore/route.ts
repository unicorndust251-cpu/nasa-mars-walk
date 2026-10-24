/**
 * Simulated local exploration routes.
 *
 * No verified, terrain-safe walking paths exist for most of these sites, so each route is
 * generated: a smooth loop around the landmark's reference point, seeded by the landmark's
 * id so it is the same on every visit. Coordinates are km on the local tangent plane
 * (x east, y north) centred on the landmark. The interface labels every route as simulated.
 */

export interface Route {
  /** Sampled path, interleaved x, y (km) */
  points: Float32Array;
  /** Cumulative distance along the path at each sample (km) */
  distances: Float32Array;
  totalKm: number;
  /** Distance along the path of each checkpoint (km), in order; the last one ends the route */
  checkpointKm: number[];
  /** Positions of the start and of each checkpoint (km) */
  start: [number, number];
  checkpoints: Array<[number, number]>;
}

export interface RoutePose {
  x: number;
  y: number;
  /** Unit tangent: the direction of travel */
  dx: number;
  dy: number;
}

const SAMPLES_PER_SEGMENT = 48;

/** Small seeded PRNG (mulberry32) so routes are stable. */
function rng(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centripetal Catmull–Rom point between p1 and p2 (no cusps or self-loops on uneven spacing). */
function catmullRom(p0: number[], p1: number[], p2: number[], p3: number[], t: number): [number, number] {
  const knot = (a: number[], b: number[]) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: number[], b: number[], ta: number, tb: number) => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  const c = lerp(b1, b2, t1, t2);
  return [c[0], c[1]];
}

/**
 * Builds the route for a landmark: a start point about 60 km out, then checkpoints that
 * spiral inward to the landmark itself, with a gentle detour between each pair.
 */
export function buildRoute(seed: string, checkpointCount: number): Route {
  const rand = rng(seed);
  const startAngle = rand() * Math.PI * 2;
  const turn = (rand() < 0.5 ? -1 : 1) * ((Math.PI * 2) / (checkpointCount + 1.4));

  const start: [number, number] = [Math.cos(startAngle) * 62, Math.sin(startAngle) * 62];
  const checkpoints: Array<[number, number]> = [];
  for (let i = 0; i < checkpointCount; i++) {
    const last = i === checkpointCount - 1;
    const r = last ? 4 + rand() * 6 : 52 - (i * 34) / Math.max(1, checkpointCount - 1) + (rand() - 0.5) * 10;
    const a = startAngle + turn * (i + 1) + (rand() - 0.5) * 0.4;
    checkpoints.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  // Control points: start, then a detour before every checkpoint
  const control: number[][] = [start];
  let prev = start;
  for (const cp of checkpoints) {
    const mx = (prev[0] + cp[0]) / 2;
    const my = (prev[1] + cp[1]) / 2;
    const len = Math.hypot(cp[0] - prev[0], cp[1] - prev[1]);
    const nx = -(cp[1] - prev[1]) / (len || 1);
    const ny = (cp[0] - prev[0]) / (len || 1);
    const off = (rand() < 0.5 ? -1 : 1) * len * (0.12 + rand() * 0.16);
    control.push([mx + nx * off, my + ny * off], cp);
    prev = cp;
  }

  // Phantom end points so the curve starts and ends exactly on the first and last control points
  const first = control[0];
  const second = control[1];
  const end = control[control.length - 1];
  const beforeEnd = control[control.length - 2];
  const padded = [
    [2 * first[0] - second[0], 2 * first[1] - second[1]],
    ...control,
    [2 * end[0] - beforeEnd[0], 2 * end[1] - beforeEnd[1]],
  ];

  const segments = control.length - 1;
  const count = segments * SAMPLES_PER_SEGMENT + 1;
  const points = new Float32Array(count * 2);
  for (let s = 0; s < segments; s++) {
    for (let k = 0; k < SAMPLES_PER_SEGMENT; k++) {
      const [x, y] = catmullRom(padded[s], padded[s + 1], padded[s + 2], padded[s + 3], k / SAMPLES_PER_SEGMENT);
      const i = s * SAMPLES_PER_SEGMENT + k;
      points[i * 2] = x;
      points[i * 2 + 1] = y;
    }
  }
  points[(count - 1) * 2] = end[0];
  points[(count - 1) * 2 + 1] = end[1];

  const distances = new Float32Array(count);
  for (let i = 1; i < count; i++) {
    distances[i] = distances[i - 1] + Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]);
  }

  // Checkpoints sit on every second control point, which the curve passes through exactly
  const checkpointKm = checkpoints.map((_, i) => distances[(i + 1) * 2 * SAMPLES_PER_SEGMENT]);

  return { points, distances, totalKm: distances[count - 1], checkpointKm, start, checkpoints };
}

/** Position and heading at a distance along the route (clamped to the route). */
export function poseAt(route: Route, km: number, out: RoutePose = { x: 0, y: 0, dx: 1, dy: 0 }): RoutePose {
  const { points, distances } = route;
  const n = distances.length;
  const d = Math.max(0, Math.min(route.totalKm, km));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = distances[hi] - distances[lo] || 1;
  const t = Math.max(0, Math.min(1, (d - distances[lo]) / span));
  const x0 = points[lo * 2];
  const y0 = points[lo * 2 + 1];
  const x1 = points[hi * 2];
  const y1 = points[hi * 2 + 1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  out.x = x0 + (x1 - x0) * t;
  out.y = y0 + (y1 - y0) * t;
  out.dx = (x1 - x0) / len;
  out.dy = (y1 - y0) / len;
  return out;
}
