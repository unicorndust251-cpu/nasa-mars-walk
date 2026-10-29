/**
 * Great-circle route geometry between two points on Mars, as evenly spaced waypoints.
 *
 * Points are produced by spherical interpolation in the globe's own 3D convention
 * (geo.ts latLonToVec), so they line up exactly with the globe and its markers, and wrap
 * across 0°/360° and over the poles without special cases.
 *
 * The route is a geographic preview only: it ignores terrain. The waypoint list is kept so a
 * future astronaut animation can follow local segments of it (see pointAtKm).
 */

import { latLonToVec, tangentBasis, toLon360, vecToLatLon, type Vec3 } from '../geo';
import { centralAngle, haversineKm } from './distance';
import type { LatLon } from './coordinates';

export interface RoutePoint extends LatLon {
  /** Distance from the start along the route (km) */
  km: number;
}

export interface GeoRoute {
  start: LatLon;
  end: LatLon;
  distanceKm: number;
  /** Central angle between the endpoints, degrees */
  angleDeg: number;
  /** Evenly spaced along the arc; first is the start, last the destination */
  points: RoutePoint[];
  /** Start and destination are (almost) the same point */
  identical: boolean;
  /** (Almost) opposite sides of Mars: many shortest routes exist, one stable arc is shown */
  nearlyAntipodal: boolean;
}

/** Waypoint spacing along the arc, degrees (≈3 km). The renderer thins them out by zoom. */
export const ROUTE_STEP_DEG = 0.05;
const MAX_SEGMENTS = 4096;
/** Even a route of a few km gets enough waypoints to draw as a dotted line */
const MIN_SEGMENTS = 16;
const R2D = 180 / Math.PI;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Orthonormal frame of the arc: the route is cos(θ)·a + sin(θ)·u for θ from 0 to the
 * central angle. When b is (almost) opposite a, b no longer fixes the plane, so u falls
 * back to due north from the start (east at a pole): a deterministic choice, not a
 * flickering one.
 */
function arcFrame(a: Vec3, b: Vec3, start: LatLon): Vec3 {
  const d = dot(a, b);
  const perp: Vec3 = [b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]];
  if (Math.hypot(perp[0], perp[1], perp[2]) > 1e-4) return norm(perp);
  const { north, east } = tangentBasis(start.lat, start.lon);
  return Math.abs(start.lat) > 89.999 ? east : norm(north);
}

export function buildGreatCircleRoute(start: LatLon, end: LatLon): GeoRoute {
  const a = latLonToVec(start.lat, start.lon);
  const b = latLonToVec(end.lat, end.lon);
  const angle = centralAngle(start.lat, start.lon, end.lat, end.lon);
  const angleDeg = angle * R2D;
  const distanceKm = haversineKm(start.lat, start.lon, end.lat, end.lon);
  const identical = angleDeg < 1e-6;
  const nearlyAntipodal = angleDeg > 179;

  const points: RoutePoint[] = [{ lat: start.lat, lon: toLon360(start.lon), km: 0 }];
  if (!identical) {
    const u = arcFrame(a, b, start);
    const n = Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Math.ceil(angleDeg / ROUTE_STEP_DEG)));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const th = angle * t;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const p = vecToLatLon([c * a[0] + s * u[0], c * a[1] + s * u[1], c * a[2] + s * u[2]]);
      points.push({ lat: p.lat, lon: toLon360(p.lon), km: distanceKm * t });
    }
    points.push({ lat: end.lat, lon: toLon360(end.lon), km: distanceKm });
  }
  return { start, end, distanceKm, angleDeg, points, identical, nearlyAntipodal };
}

/**
 * Position at a distance along the route (clamped to its ends), interpolated on the sphere
 * between neighbouring waypoints. For the future astronaut: walk a local stretch of the
 * route by stepping km forward.
 */
export function pointAtKm(route: GeoRoute, km: number): LatLon {
  const pts = route.points;
  if (pts.length === 1 || km <= 0) return { lat: pts[0].lat, lon: pts[0].lon };
  if (km >= route.distanceKm) {
    const last = pts[pts.length - 1];
    return { lat: last.lat, lon: last.lon };
  }
  const step = route.distanceKm / (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(km / step));
  const t = (km - pts[i].km) / Math.max(1e-9, pts[i + 1].km - pts[i].km);
  const p = latLonToVec(pts[i].lat, pts[i].lon);
  const q = latLonToVec(pts[i + 1].lat, pts[i + 1].lon);
  const v = vecToLatLon(norm([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]));
  return { lat: v.lat, lon: toLon360(v.lon) };
}

/** Halfway point along the route. */
export function routeMidpoint(route: GeoRoute): LatLon {
  return pointAtKm(route, route.distanceKm / 2);
}
