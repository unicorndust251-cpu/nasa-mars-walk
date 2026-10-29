// Builds the Mars navigator's place-name index from the IAU/USGS Gazetteer of Planetary
// Nomenclature.
//
//   1. Download https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.zip
//   2. Unzip it anywhere
//   3. node scripts/build-mars-places.mjs path/to/MARS_nomenclature_center_pts.dbf
//
// Writes src/explore/nav/data/marsGazetteer.json: one row per approved Mars feature,
// [name, lat, lon, diameterKm, type, gazetteerId], with planetocentric latitude and
// east-positive longitude 0–360°, exactly as the Gazetteer publishes them.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-mars-places.mjs MARS_nomenclature_center_pts.dbf');
  process.exit(1);
}
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/explore/nav/data/marsGazetteer.json');

/** Minimal dBASE III reader: the Gazetteer's .dbf is plain fixed-width UTF-8 records. */
function readDbf(buf) {
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) {
    fields.push({ name: buf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: buf[o + 16] });
  }
  const utf8 = new TextDecoder('utf-8');
  const rows = [];
  for (let i = 0; i < count; i++) {
    let o = headerLen + i * recordLen;
    if (buf[o] === 0x2a) continue; // deleted record
    o += 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = utf8.decode(buf.subarray(o, o + f.len)).trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const seen = new Set();
const places = [];
for (const r of readDbf(readFileSync(src))) {
  if (!/adopted/i.test(r.approval)) continue;
  const id = Number(r.link.split('/').pop());
  if (seen.has(id)) continue; // the dataset repeats a few records verbatim
  seen.add(id);
  const lat = Number(r.center_lat);
  const lon = ((Number(r.center_lon) % 360) + 360) % 360;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const type = r.type.split(',')[0].trim(); // "Crater, craters" → "Crater"
  places.push([r.name, round(lat, 3), round(lon, 3), round(Number(r.diameter) || 0, 1), type, id]);
}
places.sort((a, b) => a[0].localeCompare(b[0]));

writeFileSync(out, JSON.stringify(places).replace(/\],\[/g, '],\n['));
console.log(`${places.length} Mars features → ${out}`);
