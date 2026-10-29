/**
 * Coordinate parsing and validation for the navigator.
 *
 * Convention throughout: planetocentric latitude −90…+90° (north positive) and longitude
 * 0–360° east, the Gazetteer's convention. Input is forgiving: "18.4, 77.5", "18.4 77.5",
 * "18.4°N 77.5°E", "5.4S, 137.8E", "lat 18.4 lon 77.5". A west longitude ("282.5W") or a
 * negative one (−137.8, i.e. −180…180 east-positive) is converted to 0–360° east.
 */

import { toLon360 } from '../geo';

export interface LatLon {
  lat: number;
  /** Degrees east, 0–360 */
  lon: number;
}

export type CoordinateParse = { ok: true; value: LatLon } | { ok: false; error: string };

const NUM = String.raw`([+-]?\d+(?:\.\d+)?|[+-]?\.\d+)`;
const PAIR = new RegExp(String.raw`^${NUM}\s*°?\s*([NS])?\s*[,;/\s]\s*${NUM}\s*°?\s*([EW])?$`, 'i');

/** True when the text looks like an attempt at coordinates rather than a place name. */
export function looksLikeCoordinates(text: string): boolean {
  return /^\s*(lat|[+-]?\.?\d)/i.test(text);
}

/** Validates a latitude/longitude pair (longitude in any of 0–360 E or −180…180 E) and normalises it. */
export function validateLatLon(lat: number, lon: number): CoordinateParse {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: 'Enter numbers in decimal degrees, e.g. 18.40, 77.50' };
  if (lat < -90 || lat > 90) return { ok: false, error: `Latitude ${lat}° is outside −90° to +90°` };
  if (lon < -180 || lon > 360) return { ok: false, error: `Longitude ${lon}° is outside 0° to 360° E (or −180° to 180°)` };
  return { ok: true, value: { lat, lon: toLon360(lon) } };
}

/** Parses free text into coordinates. Returns null when the text isn't coordinate-shaped at all. */
export function parseCoordinates(text: string): CoordinateParse | null {
  const cleaned = text
    .trim()
    .replace(/\b(latitude|lat)\b\s*[:=]?/gi, '')
    .replace(/\b(longitude|lon|long|lng)\b\s*[:=]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = PAIR.exec(cleaned);
  if (!m) return looksLikeCoordinates(text) ? { ok: false, error: 'Enter latitude and longitude, e.g. 18.40, 77.50' } : null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  const ns = m[2]?.toUpperCase();
  const ew = m[4]?.toUpperCase();
  if (ns) {
    if (lat < 0) return { ok: false, error: 'Use either a minus sign or N/S, not both' };
    if (ns === 'S') lat = -lat;
  }
  if (ew) {
    if (lon < 0) return { ok: false, error: 'Use either a minus sign or E/W, not both' };
    if (lon > 360) return { ok: false, error: `Longitude ${lon}° is outside 0° to 360°` };
    if (ew === 'W') lon = 360 - lon;
  }
  return validateLatLon(lat, lon);
}
