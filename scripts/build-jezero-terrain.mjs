// Builds the Jezero terrain grid used by the route planner (public/data/jezero-terrain.bin).
//
// Source: USGS Astrogeology, "Mars 2020 Science Investigation CTX DEM Mosaic" (Calef et al., 2021),
// M20_JezeroCrater_CTXDEM_20m.tif, public domain:
//   https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif
//   https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic
// 20 m/pixel, float32 metres (vertically controlled to MOLA), equirectangular on the Mars 2000
// sphere (R = 3,396,190 m) with true scale at 18.4663° N, so pixels are 20 m on the ground both ways.
//
// Usage: node scripts/build-jezero-terrain.mjs <path to M20_JezeroCrater_CTXDEM_20m.tif>
//
// Output: one gzip-compressed file holding, per 100 m cell (5 × 5 DEM pixels):
//   elevation  Int16  mean elevation in metres, −32768 where the DEM has no data
//   slope      Uint8  90th-percentile slope of the 20 m pixels in the cell, in 0.5° steps, 255 = unknown
//   roughness  Uint8  RMS departure of the pixels from the cell's best-fit plane, in 0.25 m steps, 255 = unknown
// Elevation rows are delta-encoded (each value minus the one to its left) so they compress well.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-jezero-terrain.mjs <M20_JezeroCrater_CTXDEM_20m.tif>');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'public', 'data', 'jezero-terrain.bin');

const PX = 20; // metres per DEM pixel
const BLOCK = 5; // pixels per grid cell side → 100 m cells
const NODATA = -3.4028234663852886e38;

/* ------------------------------------------------------------------ TIFF */
const buf = fs.readFileSync(src);
const le = buf.toString('ascii', 0, 2) === 'II';
const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const f64 = (o) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));

const tags = new Map();
const ifd = u32(4);
for (let i = 0; i < u16(ifd); i++) {
  const e = ifd + 2 + i * 12;
  const type = u16(e + 2);
  const count = u32(e + 4);
  const size = { 3: 2, 4: 4, 12: 8 }[type] ?? 1;
  const at = size * count <= 4 ? e + 8 : u32(e + 8);
  const read = (k) => (type === 3 ? u16(at + 2 * k) : type === 4 ? u32(at + 4 * k) : type === 12 ? f64(at + 8 * k) : 0);
  tags.set(u16(e), Array.from({ length: count }, (_, k) => read(k)));
}

const width = tags.get(256)[0];
const height = tags.get(257)[0];
if (tags.get(258)[0] !== 32 || tags.get(339)?.[0] !== 3 || tags.get(259)[0] !== 1) {
  throw new Error('Expected an uncompressed float32 GeoTIFF');
}
const [scaleX, scaleY] = tags.get(33550);
const tie = tags.get(33922); // [i, j, k, x, y, z]
const geoDoubles = tags.get(34736); // includes the standard parallel and the sphere radius
const x0 = tie[3];
const y0 = tie[4];
const latTs = geoDoubles[2];
const radius = geoDoubles[5];
if (scaleX !== PX || scaleY !== PX) throw new Error(`Unexpected pixel size ${scaleX} × ${scaleY}`);

const offsets = tags.get(273);
const rowsPerStrip = tags.get(278)?.[0] ?? height;
const elevationAt = (col, row) => {
  const strip = Math.floor(row / rowsPerStrip);
  const v = le
    ? buf.readFloatLE(offsets[strip] + ((row % rowsPerStrip) * width + col) * 4)
    : buf.readFloatBE(offsets[strip] + ((row % rowsPerStrip) * width + col) * 4);
  return v <= NODATA * 0.5 || !Number.isFinite(v) ? NaN : v;
};

console.log(`DEM ${width} × ${height} px, origin (${x0}, ${y0}) m, true scale at ${latTs}°, R = ${radius} m`);

/* ---------------------------------------------------------- 20 m slopes */
// Horn's method on the full-resolution DEM, in degrees; NaN where any neighbour is missing
const dem = new Float32Array(width * height);
for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) dem[r * width + c] = elevationAt(c, r);
const slope20 = new Float32Array(width * height).fill(NaN);
for (let r = 1; r < height - 1; r++) {
  for (let c = 1; c < width - 1; c++) {
    const z = (dc, dr) => dem[(r + dr) * width + (c + dc)];
    const a = z(-1, -1), b = z(0, -1), cc = z(1, -1), d = z(-1, 0), f = z(1, 0), g = z(-1, 1), h = z(0, 1), i = z(1, 1);
    const dzdx = (cc + 2 * f + i - (a + 2 * d + g)) / (8 * PX);
    const dzdy = (g + 2 * h + i - (a + 2 * b + cc)) / (8 * PX);
    const s = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    if (Number.isFinite(s)) slope20[r * width + c] = s;
  }
}

/* -------------------------------------------------------- 100 m cells */
const cols = Math.floor(width / BLOCK);
const rows = Math.floor(height / BLOCK);
const elevation = new Int16Array(cols * rows);
const slope = new Uint8Array(cols * rows);
const roughness = new Uint8Array(cols * rows);
let known = 0;

for (let R = 0; R < rows; R++) {
  for (let C = 0; C < cols; C++) {
    const zs = [];
    const xs = [];
    const ys = [];
    const ss = [];
    for (let dr = 0; dr < BLOCK; dr++) {
      for (let dc = 0; dc < BLOCK; dc++) {
        const idx = (R * BLOCK + dr) * width + (C * BLOCK + dc);
        const z = dem[idx];
        if (Number.isFinite(z)) {
          zs.push(z);
          xs.push(dc * PX);
          ys.push(dr * PX);
        }
        if (Number.isFinite(slope20[idx])) ss.push(slope20[idx]);
      }
    }
    const k = R * cols + C;
    // A cell counts as known only when most of it has data
    if (zs.length < (BLOCK * BLOCK) / 2 || ss.length < (BLOCK * BLOCK) / 2) {
      elevation[k] = -32768;
      slope[k] = 255;
      roughness[k] = 255;
      continue;
    }
    known++;
    const n = zs.length;
    const mean = zs.reduce((s, v) => s + v, 0) / n;
    elevation[k] = Math.max(-32767, Math.min(32767, Math.round(mean)));

    ss.sort((p, q) => p - q);
    const p90 = ss[Math.min(ss.length - 1, Math.floor(ss.length * 0.9))];
    slope[k] = Math.min(254, Math.round(p90 * 2));

    // Best-fit plane z = a + bx + cy by least squares; roughness is the RMS residual
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
    for (let j = 0; j < n; j++) {
      const x = xs[j], y = ys[j], z = zs[j] - mean;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z;
    }
    const m = [
      [n, sx, sy],
      [sx, sxx, sxy],
      [sy, sxy, syy],
    ];
    const v = [sz, sxz, syz];
    const det3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det3(m);
    let rms = 0;
    if (Math.abs(D) > 1e-9) {
      const solve = (col) => det3(m.map((row, ri) => row.map((val, ci) => (ci === col ? v[ri] : val)))) / D;
      const a = solve(0), b = solve(1), c = solve(2);
      for (let j = 0; j < n; j++) rms += (zs[j] - mean - (a + b * xs[j] + c * ys[j])) ** 2;
      rms = Math.sqrt(rms / n);
    }
    roughness[k] = Math.min(254, Math.round(rms * 4));
  }
}

/* --------------------------------------------------------------- write */
const header = {
  format: 'beyond-terra-terrain',
  version: 1,
  name: 'Jezero Crater',
  source: 'USGS Astrogeology, Mars 2020 Science Investigation CTX DEM Mosaic (Calef et al., 2021), M20_JezeroCrater_CTXDEM_20m.tif, public domain',
  sourceUrl: 'https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic',
  projection: 'equirectangular',
  radiusM: radius,
  latTrueScaleDeg: latTs,
  // Projected coordinates (metres) of the grid's north-west corner
  originX: x0,
  originY: y0,
  cellM: PX * BLOCK,
  cols,
  rows,
  elevationNoData: -32768,
  slopeUnitDeg: 0.5,
  roughnessUnitM: 0.25,
  unknown: 255,
};

// Delta-encode elevation along each row (NoData kept as an explicit marker)
const delta = new Int16Array(cols * rows);
for (let R = 0; R < rows; R++) {
  let prev = 0;
  for (let C = 0; C < cols; C++) {
    const k = R * cols + C;
    const e = elevation[k];
    if (e === -32768) {
      delta[k] = -32768;
      continue;
    }
    let d = e - prev;
    if (d === -32768) d = -32767; // never collide with the marker (impossible for real terrain)
    delta[k] = d;
    prev = e;
  }
}

const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
const lenBytes = Buffer.alloc(4);
lenBytes.writeUInt32LE(headerBytes.length, 0);
const pad = Buffer.alloc((4 - ((4 + headerBytes.length) % 4)) % 4, 0x20);
const raw = Buffer.concat([
  lenBytes,
  headerBytes,
  pad,
  Buffer.from(delta.buffer),
  Buffer.from(slope.buffer),
  Buffer.from(roughness.buffer),
]);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, zlib.gzipSync(raw, { level: 9 }));

const lat = (y) => (y / radius) * (180 / Math.PI);
const lon = (x) => (x / (radius * Math.cos((latTs * Math.PI) / 180))) * (180 / Math.PI);
console.log(`Grid ${cols} × ${rows} cells of ${PX * BLOCK} m, ${((known / (cols * rows)) * 100).toFixed(1)}% with data`);
console.log(`Covers ${lat(y0 - rows * PX * BLOCK).toFixed(4)}–${lat(y0).toFixed(4)}° N, ${lon(x0).toFixed(4)}–${lon(x0 + cols * PX * BLOCK).toFixed(4)}° E`);
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(2)} MB)`);
