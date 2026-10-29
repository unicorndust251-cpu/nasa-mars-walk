/**
 * The navigator's searchable Mars places: the 26 featured landmarks (which keep their
 * glowing globe markers) plus every IAU-approved Mars feature name from the USGS Gazetteer
 * of Planetary Nomenclature (about 2,000 craters, valleys, plains, mountains...).
 *
 * The Gazetteer index (data/marsGazetteer.json, built by scripts/build-mars-places.mjs) is
 * loaded on demand, so the globe itself never waits for it. Gazetteer records that are the
 * same feature as a featured landmark (Jezero → Jezero Crater) are folded into the landmark.
 */

import { LANDMARKS } from '../landmarks';
import { formatLat, formatLon, toLon360 } from '../geo';

export type PlaceKind = 'landmark' | 'feature' | 'coordinates';

export interface MarsPlace {
  /** Stable key: landmark id, "iau-<Gazetteer id>" or "coord-<lat>,<lon>" */
  id: string;
  name: string;
  /** Planetocentric latitude, degrees north */
  lat: number;
  /** Degrees east, 0–360 */
  lon: number;
  kind: PlaceKind;
  /** Feature type, e.g. "Crater", "Planitia", "Shield volcano" */
  type: string;
  /** Feature diameter from the Gazetteer (km); 0 for points */
  diameterKm: number;
  /** Featured landmark id, when this is (or matches) one of the 26 */
  landmarkId?: string;
  /** Gazetteer feature id, for a link to the official record */
  gazetteerId?: number;
}

/** Features wider than this have their centre flagged as a reference point, not a position. */
export const LARGE_FEATURE_KM = 60;

export const FEATURED_PLACES: MarsPlace[] = LANDMARKS.map((l) => ({
  id: l.id,
  name: l.name,
  lat: l.lat,
  lon: toLon360(l.lon),
  kind: 'landmark',
  type: l.category,
  diameterKm: l.diameterKm,
  landmarkId: l.id,
}));

export function coordinatePlace(lat: number, lon: number): MarsPlace {
  const lon360 = toLon360(lon);
  return {
    id: `coord-${lat.toFixed(4)},${lon360.toFixed(4)}`,
    name: `${formatLat(lat)}, ${formatLon(lon360)}`,
    lat,
    lon: lon360,
    kind: 'coordinates',
    type: 'Manual coordinates',
    diameterKm: 0,
  };
}

export function gazetteerUrl(place: MarsPlace): string | null {
  return place.gazetteerId ? `https://planetarynames.wr.usgs.gov/Feature/${place.gazetteerId}` : null;
}

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type GazetteerRow = [name: string, lat: number, lon: number, diameterKm: number, type: string, id: number];

/** Same feature: the landmark's name starts with the Gazetteer name and the centres agree. */
function isFeaturedDuplicate(row: GazetteerRow): boolean {
  const name = fold(row[0]);
  return FEATURED_PLACES.some((p) => fold(p.name).startsWith(name) && Math.abs(p.lat - row[1]) < 0.05 && Math.abs(toLon360(p.lon - row[2] + 180) - 180) < 0.05);
}

let loading: Promise<MarsPlace[]> | null = null;

/** All searchable places: featured first, then the Gazetteer. Loads once and caches. */
export function loadAllPlaces(): Promise<MarsPlace[]> {
  loading ??= import('./data/marsGazetteer.json')
    .then((mod) => {
      const rows = mod.default as unknown as GazetteerRow[];
      const features: MarsPlace[] = [];
      for (const row of rows) {
        if (isFeaturedDuplicate(row)) continue;
        const [name, lat, lon, diameterKm, type, id] = row;
        features.push({ id: `iau-${id}`, name, lat, lon: toLon360(lon), kind: 'feature', type, diameterKm, gazetteerId: id });
      }
      return [...FEATURED_PLACES, ...features];
    })
    .catch((err) => {
      loading = null; // let a later search try again
      throw err;
    });
  return loading;
}
