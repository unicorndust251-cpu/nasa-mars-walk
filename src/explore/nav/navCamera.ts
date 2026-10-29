/**
 * Camera framing for the navigator. The globe camera always looks at the planet's centre
 * from a distance `dist` (radii) above the point (lat, lon); these work out that pose.
 */

import type { MarsPlace } from './places';
import { routeMidpoint, type GeoRoute } from './routeGeometry';
import { MARS_RADIUS_KM } from '../geo';

export interface GlobeView {
  lat: number;
  lon: number;
  dist: number;
}

export interface FrameLimits {
  /** tan(vertical FOV / 2) */
  tanHalfFov: number;
  /**
   * tan of the half-angle that is actually free to show the route in: the view minus the
   * panels and header covering it, with a margin for labels and the beacon's beam
   */
  fitTan: number;
  minDist: number;
  maxDist: number;
  /** Distance that shows a whole hemisphere comfortably */
  overviewDist: number;
}

/** Frames a single place: wider features get more context, points a regional view. */
export function frameForPlace(place: MarsPlace, limits: FrameLimits): GlobeView {
  const spanKm = Math.max(place.diameterKm * 2.6, 900);
  const alt = Math.min(1.9, Math.max(0.36, spanKm / MARS_RADIUS_KM / (2 * limits.tanHalfFov)));
  return { lat: place.lat, lon: place.lon, dist: Math.max(limits.minDist, 1 + alt) };
}

/**
 * Frames a route: centred on its midpoint, at the distance where both endpoints sit inside
 * the view with a margin, and in front of the planet's horizon. Routes too long for that
 * (more than ~140° of arc) get the hemisphere overview; the globe can then be turned by hand.
 */
export function frameForRoute(route: GeoRoute, limits: FrameLimits): GlobeView {
  const mid = routeMidpoint(route);
  const half = ((route.angleDeg / 2) * Math.PI) / 180;
  if (half > (70 * Math.PI) / 180) return { lat: mid.lat, lon: mid.lon, dist: limits.overviewDist };
  let dist = Math.cos(half) + Math.sin(half) / limits.fitTan;
  dist = Math.max(dist, (1 / Math.cos(half)) * 1.12); // endpoints well clear of the limb
  dist = Math.min(Math.max(dist, limits.minDist, 1.42), Math.min(limits.maxDist, limits.overviewDist * 1.15));
  return { lat: mid.lat, lon: mid.lon, dist };
}
