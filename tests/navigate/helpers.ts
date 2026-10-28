import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { TerrainGrid } from '../../src/navigate/core/terrain.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let cached: TerrainGrid | null = null;

/** The real Jezero terrain grid shipped with the site. */
export function loadJezero(): TerrainGrid {
  if (!cached) cached = TerrainGrid.decode(zlib.gunzipSync(fs.readFileSync(path.join(root, 'public', 'data', 'jezero-terrain.bin'))));
  return cached;
}

/** Runs searches without real pauses, so tests stay fast. */
export const noPause = () => Promise.resolve();
