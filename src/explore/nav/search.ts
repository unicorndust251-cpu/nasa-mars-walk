/**
 * Place search for the navigator: case- and accent-insensitive, partial matching on names
 * (then feature types), with coordinates recognised directly.
 */

import { coordinatePlace, fold, type MarsPlace } from './places';
import { parseCoordinates } from './coordinates';

export type PlaceQuery =
  | { kind: 'empty' }
  | { kind: 'coordinates'; place: MarsPlace }
  | { kind: 'invalid'; error: string }
  | { kind: 'names'; results: MarsPlace[] };

const KIND_RANK = { landmark: 0, feature: 1, coordinates: 2 } as const;

/**
 * Best matches first: exact name, name prefix, word prefix, anywhere in the name, then
 * feature type. Within a tier, featured landmarks first, then larger (better known) features.
 */
export function searchPlaces(query: string, places: MarsPlace[], limit = 12): MarsPlace[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: Array<[number, MarsPlace]> = [];
  for (const p of places) {
    const name = fold(p.name);
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    else if (q.length >= 3 && fold(p.type).startsWith(q)) score = 4;
    if (score >= 0) scored.push([score, p]);
  }
  scored.sort(
    (a, b) => a[0] - b[0] || KIND_RANK[a[1].kind] - KIND_RANK[b[1].kind] || b[1].diameterKm - a[1].diameterKm || a[1].name.localeCompare(b[1].name)
  );
  return scored.slice(0, limit).map(([, p]) => p);
}

/** Interprets what was typed: coordinates (valid or not), or a name search. */
export function interpretQuery(query: string, places: MarsPlace[], limit?: number): PlaceQuery {
  if (!query.trim()) return { kind: 'empty' };
  const coords = parseCoordinates(query);
  if (coords?.ok) return { kind: 'coordinates', place: coordinatePlace(coords.value.lat, coords.value.lon) };
  if (coords && !coords.ok) {
    // Malformed coordinates: a name that happens to start with a digit still wins over the error
    const results = searchPlaces(query, places, limit);
    return results.length ? { kind: 'names', results } : { kind: 'invalid', error: coords.error };
  }
  return { kind: 'names', results: searchPlaces(query, places, limit) };
}

/** Names that occur more than once in a result list, so the UI can tell them apart. */
export function duplicateNames(results: MarsPlace[]): Set<string> {
  const seen = new Map<string, number>();
  results.forEach((p) => seen.set(fold(p.name), (seen.get(fold(p.name)) ?? 0) + 1));
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}
