/**
 * Great-circle surface distance on Mars (Haversine).
 *
 * Uses the Mars mean radius, 3389.5 km. This is the shortest distance over a smooth sphere,
 * not a walking distance: it ignores relief, slopes and hazards.
 */

export const MARS_MEAN_RADIUS_KM = 3389.5;

const D2R = Math.PI / 180;

/** Central angle between two points, in radians. Inputs in degrees (longitude in any convention). */
export function centralAngle(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  // Clamped: rounding can push a a hair outside 0–1 for identical or antipodal points
  const a = Math.min(1, Math.max(0, s1 * s1 + Math.cos(p1) * Math.cos(p2) * s2 * s2));
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return MARS_MEAN_RADIUS_KM * centralAngle(lat1, lon1, lat2, lon2);
}

export function formatKm(km: number): string {
  if (km < 10) return `${km.toFixed(2)} KM`;
  if (km < 100) return `${km.toFixed(1)} KM`;
  return `${Math.round(km).toLocaleString('en-US')} KM`;
}
