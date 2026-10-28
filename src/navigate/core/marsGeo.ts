/**
 * Mars geography for the route planner. Pure functions, no map library.
 *
 * Conventions used everywhere in navigation:
 *  - Planetocentric latitude, degrees, north positive.
 *  - Longitude, degrees, EAST positive, normalised to −180…180 internally (the map's convention).
 *    Interfaces show it as 0–360° E, the IAU/USGS Gazetteer convention, and accept either.
 *  - Distances on the sphere use the Mars mean (volumetric) radius, 3,389.5 km (NASA Mars Fact
 *    Sheet). Local terrain routes are measured on the DEM's own projected grid (see terrain.ts).
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Mars mean radius, km (NASA Mars Fact Sheet: volumetric mean radius 3389.5 km). */
export const MARS_MEAN_RADIUS_KM = 3389.5;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Wrap a longitude to −180…180 (east positive). */
export function normalizeLon(lon: number): number {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return l === -180 && lon > 0 ? 180 : l;
}

/** Wrap a longitude to 0…360 east. */
export function toLon360(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Great-circle distance (haversine) in km. */
export function distanceKm(a: LatLon, b: LatLon, radiusKm = MARS_MEAN_RADIUS_KM): number {
  const dLat = (b.lat - a.lat) * D2R;
  const dLon = (b.lon - a.lon) * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * D2R;
  const φ2 = b.lat * D2R;
  const Δλ = (b.lon - a.lon) * D2R;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Point a fraction f (0–1) of the way along the great circle from a to b. */
export function interpolateGreatCircle(a: LatLon, b: LatLon, f: number): LatLon {
  const φ1 = a.lat * D2R;
  const λ1 = a.lon * D2R;
  const φ2 = b.lat * D2R;
  const λ2 = b.lon * D2R;
  const δ = distanceKm(a, b, 1);
  if (δ < 1e-12) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) * R2D, lon: normalizeLon(Math.atan2(y, x) * R2D) };
}

/** The great circle from a to b, sampled at most every `stepKm`, endpoints included exactly. */
export function greatCirclePath(a: LatLon, b: LatLon, stepKm = 25): LatLon[] {
  const d = distanceKm(a, b);
  const n = Math.max(1, Math.ceil(d / stepKm));
  const pts: LatLon[] = [{ lat: a.lat, lon: a.lon }];
  for (let i = 1; i < n; i++) pts.push(interpolateGreatCircle(a, b, i / n));
  pts.push({ lat: b.lat, lon: b.lon });
  return pts;
}

/** Total great-circle length of a polyline, km. */
export function pathLengthKm(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceKm(points[i - 1], points[i]);
  return total;
}

/**
 * Shortest distance from point p to the great-circle segment a–b, km (cross-track distance,
 * falling back to the nearer endpoint when the closest point lies beyond the segment).
 */
export function distanceToSegmentKm(p: LatLon, a: LatLon, b: LatLon): number {
  const dAB = distanceKm(a, b);
  if (dAB < 1e-9) return distanceKm(p, a);
  const R = MARS_MEAN_RADIUS_KM;
  const δ13 = distanceKm(a, p) / R;
  const θ13 = bearingDeg(a, p) * D2R;
  const θ12 = bearingDeg(a, b) * D2R;
  const xt = Math.asin(Math.max(-1, Math.min(1, Math.sin(δ13) * Math.sin(θ13 - θ12))));
  const at = Math.acos(Math.max(-1, Math.min(1, Math.cos(δ13) / Math.max(1e-12, Math.cos(xt))))) * R;
  if (Math.cos(θ13 - θ12) < 0 || at > dAB) return Math.min(distanceKm(p, a), distanceKm(p, b));
  return Math.abs(xt) * R;
}

/** Distance from a point to a polyline and the index of the nearest segment. */
export function distanceToPathKm(p: LatLon, path: LatLon[]): { km: number; segment: number } {
  let best = Infinity;
  let segment = 0;
  if (path.length === 1) return { km: distanceKm(p, path[0]), segment: 0 };
  for (let i = 1; i < path.length; i++) {
    const d = distanceToSegmentKm(p, path[i - 1], path[i]);
    if (d < best) {
      best = d;
      segment = i - 1;
    }
  }
  return { km: best, segment };
}

/* ------------------------------------------------------------ parsing */

export type ParsedCoordinates = { ok: true; value: LatLon; note?: string } | { ok: false; error: string };

const NUMBER = String.raw`[-+]?\d+(?:\.\d+)?`;
const PART = new RegExp(String.raw`^\s*(${NUMBER})\s*°?\s*([NSEW])?\s*$`, 'i');

/**
 * Parses Mars coordinates typed by a visitor: "18.4447, 77.4508", "18.44 N 77.45 E",
 * "18.44°N, 282.55°W", "-14.53 175.52". Latitude comes first. Longitude may be −180…180 or
 * 0…360 east, or west with a W suffix. These are Martian planetocentric coordinates; nothing
 * here assumes Earth's datum.
 */
export function parseCoordinates(text: string): ParsedCoordinates {
  const cleaned = text.trim().replace(/[;|]/g, ',');
  if (!cleaned) return { ok: false, error: 'Enter a latitude and longitude, e.g. 18.4447, 77.4508' };
  let parts = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) {
    // "18.44N 77.45E" or "18.44 77.45"
    const m = new RegExp(String.raw`^(${NUMBER}\s*°?\s*[NS]?)\s+(${NUMBER}\s*°?\s*[EW]?)$`, 'i').exec(cleaned);
    if (m) parts = [m[1], m[2]];
  }
  if (parts.length !== 2) return { ok: false, error: 'Use two numbers: latitude, longitude' };

  const latM = PART.exec(parts[0]);
  const lonM = PART.exec(parts[1]);
  if (!latM || !lonM) return { ok: false, error: 'Couldn’t read those numbers. Try: 18.4447, 77.4508' };

  let lat = Number(latM[1]);
  const latHem = latM[2]?.toUpperCase();
  let lon = Number(lonM[1]);
  const lonHem = lonM[2]?.toUpperCase();

  if (latHem === 'E' || latHem === 'W' || lonHem === 'N' || lonHem === 'S') {
    return { ok: false, error: 'Give latitude (N/S) first, then longitude (E/W)' };
  }
  if (latHem === 'S') lat = -Math.abs(lat);
  if (latHem === 'N' && lat < 0) return { ok: false, error: 'A northern latitude can’t be negative' };
  if (lat < -90 || lat > 90) return { ok: false, error: 'Latitude must be between −90 and 90' };

  let note: string | undefined;
  if (lonHem === 'W') {
    if (lon < 0 || lon > 180) return { ok: false, error: 'A west longitude must be between 0 and 180' };
    lon = -lon;
    note = `${Math.abs(lon)}° W = ${toLon360(lon).toFixed(4).replace(/\.?0+$/, '')}° E`;
  } else {
    if (lon < -180 || lon > 360) return { ok: false, error: 'Longitude must be between −180 and 360 (east)' };
    if (lonHem === 'E' && lon < 0) return { ok: false, error: 'An east longitude can’t be negative' };
  }
  return { ok: true, value: { lat, lon: normalizeLon(lon) }, note };
}

/* --------------------------------------------------------- formatting */

export function formatLat(lat: number, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}`;
}

/** Longitudes are shown east-positive 0–360, the Gazetteer convention. */
export function formatLon(lon: number, digits = 4): string {
  return `${toLon360(lon).toFixed(digits)}° E`;
}

export function formatLatLon(p: LatLon, digits = 4): string {
  return `${formatLat(p.lat, digits)}, ${formatLon(p.lon, digits)}`;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(km < 10 ? 2 : 1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
