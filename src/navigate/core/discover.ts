import { distanceKm, distanceToPathKm, pathLengthKm, type LatLon } from './marsGeo.ts';
import type { MarsLocation } from './locations.ts';
import type { RouteResult } from './routePlanner.ts';

/**
 * Discover Along the Way: documented places near a planned route.
 *
 * Distance from the route is the true shortest distance to the route line. The extra distance of
 * a visit is an ESTIMATE (out and back from the nearest point of the route, plus 15% for
 * winding); adding the stop recalculates the real route, which replaces the estimate.
 */

export interface Discovery {
  location: MarsLocation;
  distanceFromRouteKm: number;
  estimatedExtraKm: number;
  /** Distance along the route of the nearest point, km */
  alongKm: number;
  /** Where to insert it in the visitor's waypoint list so the route order stays sensible */
  insertAt: number;
}

export function discoveryCorridorKm(route: RouteResult): number {
  if (route.kind === 'preview') return 250;
  return Math.max(0.75, Math.min(3, route.distanceKm * 0.2));
}

export function discoverAlongRoute(route: RouteResult, locations: MarsLocation[], limit = 12): Discovery[] {
  const corridor = discoveryCorridorKm(route);
  const stopIds = new Set(route.stops.map((s) => s.id).filter(Boolean));
  const userStops = route.stops.filter((s) => s.kind !== 'science');

  // Cumulative distance at each vertex, to place a discovery between the right stops
  const cumulative = [0];
  for (let i = 1; i < route.coordinates.length; i++) cumulative.push(cumulative[i - 1] + distanceKm(route.coordinates[i - 1], route.coordinates[i]));
  const scale = route.distanceKm / Math.max(1e-9, cumulative[cumulative.length - 1] || pathLengthKm(route.coordinates));

  const found: Discovery[] = [];
  for (const location of locations) {
    // Planet-scale previews only suggest planet-scale landmarks, and terrain routes local sites
    if (route.kind === 'preview' ? location.scale !== 'global' : location.scale === 'global' || location.scienceValue < 1) continue;
    if (stopIds.has(location.id)) continue;
    if (route.stops.some((s) => distanceKm(s, location) < 0.2)) continue;
    const { km, segment } = distanceToPathKm(location, route.coordinates);
    if (km > corridor) continue;

    const a = route.coordinates[segment];
    const b = route.coordinates[segment + 1] ?? a;
    const segKm = distanceKm(a, b);
    const t = segKm > 0 ? Math.max(0, Math.min(1, projectFraction(location, a, b))) : 0;
    const alongKm = (cumulative[segment] + segKm * t) * scale;

    // Insert after the last visitor stop that comes before this point on the route
    let after = 0;
    userStops.forEach((s, i) => {
      if (s.atKm <= alongKm && i < userStops.length - 1) after = i;
    });

    found.push({ location, distanceFromRouteKm: km, estimatedExtraKm: 2 * km * 1.15, alongKm, insertAt: after });
  }
  return found
    .sort((p, q) => p.distanceFromRouteKm - q.distanceFromRouteKm || q.location.scienceValue - p.location.scienceValue)
    .slice(0, limit);
}

/** Fraction along a→b of the point nearest p (planar approximation, fine at segment scale). */
function projectFraction(p: LatLon, a: LatLon, b: LatLon): number {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const ax = a.lon * k;
  const bx = b.lon * k;
  const px = p.lon * k;
  const dx = bx - ax;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  return len2 > 0 ? ((px - ax) * dx + (p.lat - a.lat) * dy) / len2 : 0;
}
