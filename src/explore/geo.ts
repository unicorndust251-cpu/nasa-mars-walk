/**
 * Geographic math for the 3D globe. Plain number tuples, no three.js, so it can be
 * shared by the scene (JavaScript) and the interface (TypeScript) and tested alone.
 *
 * Convention: the globe is three's SphereGeometry wrapped with an equirectangular map
 * whose left edge (u = 0) is 180° W. Seen from outside with north up, east runs to the
 * right. A point at latitude φ, longitude λ (east positive) sits at
 *   x = −cos(λ + 180°)·cos φ,  y = sin φ,  z = sin(λ + 180°)·cos φ
 * which puts 0° E on +x and 90° W facing +z. This is the same convention the intro
 * uses (spinForLongitude in introConfig.js).
 */

export type Vec3 = [number, number, number];

/** Mars mean radius on the IAU 2000 sphere used by Mars Trek. */
export const MARS_RADIUS_KM = 3396.19;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Wrap a longitude to −180…180. */
export function toLon180(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Wrap a longitude to 0…360 (the Gazetteer's east-positive convention). */
export function toLon360(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** The copy of `lon` closest to `reference`, so animations take the short way round. */
export function nearestLon(lon: number, reference: number): number {
  return lon + 360 * Math.round((reference - lon) / 360);
}

/** Unit vector on the globe for a latitude/longitude in degrees. */
export function latLonToVec(lat: number, lon: number): Vec3 {
  const phi = (lon + 180) * D2R;
  const la = lat * D2R;
  return [-Math.cos(phi) * Math.cos(la), Math.sin(la), Math.sin(phi) * Math.cos(la)];
}

/** Inverse of latLonToVec. Longitude comes back in −180…180. */
export function vecToLatLon(v: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, v[1] / r))) * R2D;
  const lon = toLon180(Math.atan2(v[2], -v[0]) * R2D - 180);
  return { lat, lon };
}

/**
 * Local east / north / up unit vectors at a point. East is the direction of increasing
 * longitude and is well defined everywhere except exactly at the poles.
 */
export function tangentBasis(lat: number, lon: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const phi = (lon + 180) * D2R;
  const la = lat * D2R;
  const east: Vec3 = [Math.sin(phi), 0, Math.cos(phi)];
  const north: Vec3 = [Math.cos(phi) * Math.sin(la), Math.cos(la), -Math.sin(phi) * Math.sin(la)];
  return { east, north, up: latLonToVec(lat, lon) };
}

/** Great-circle angle between two points, in degrees. */
export function angularDistanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = latLonToVec(lat1, lon1);
  const b = latLonToVec(lat2, lon2);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, dot))) * R2D;
}

/**
 * Converts a point given in km on the local tangent plane at (lat, lon) — x east, y north —
 * to latitude/longitude on the sphere. The point is dropped vertically onto the sphere.
 */
export function localKmToLatLon(lat: number, lon: number, xKm: number, yKm: number): { lat: number; lon: number } {
  const { east, north, up } = tangentBasis(lat, lon);
  const R = MARS_RADIUS_KM;
  const h = Math.sqrt(Math.max(0, R * R - xKm * xKm - yKm * yKm));
  const p: Vec3 = [
    xKm * east[0] + yKm * north[0] + h * up[0],
    xKm * east[1] + yKm * north[1] + h * up[1],
    xKm * east[2] + yKm * north[2] + h * up[2],
  ];
  return vecToLatLon(p);
}

/** Height of the sphere surface below the tangent plane at a horizontal offset, in km (≤ 0). */
export function surfaceDropKm(xKm: number, yKm: number): number {
  const R = MARS_RADIUS_KM;
  return Math.sqrt(Math.max(0, R * R - xKm * xKm - yKm * yKm)) - R;
}

export function formatLat(lat: number, digits = 2): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}`;
}

/** Longitudes are shown east-positive 0–360, the Gazetteer's convention. */
export function formatLon(lon: number, digits = 2): string {
  return `${toLon360(lon).toFixed(digits)}° E`;
}
