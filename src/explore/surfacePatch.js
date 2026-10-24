import { TREK_LAYERS, trekTileUrl } from '../map/marsTrek';
import { localKmToLatLon, nearestLon } from './geo';
import { EXPLORE } from './exploreConfig';

/**
 * Builds a sharp image of the ground around an exploration site from NASA Mars Trek's
 * Viking colour mosaic (about 230 m per pixel, ~45× sharper than the globe texture).
 *
 * The image covers a square on the local tangent plane, x east and y north, ±halfSizeKm,
 * resampled from Trek's equirectangular tiles so it works at any latitude, poles included.
 * Its colours are matched to the globe texture underneath, and its edges fade out
 * smoothly, so the patch blends into the planet instead of reading as a pasted square.
 *
 * Trek serves tiles with Access-Control-Allow-Origin: *, which lets WebGL use them.
 */

const VIKING = TREK_LAYERS.find((d) => d.key === 'viking');
const TILE = 256;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function loadImage(url, timeoutMs, signal) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(ok ? img : null);
    };
    const onAbort = () => {
      img.src = '';
      finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener('abort', onAbort);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

/** Tiles at `zoom` touched by the patch, as a bounding box in unwrapped tile columns. */
function tileBox(samples, zoom) {
  const deg = 180 / 2 ** zoom;
  const rows = 2 ** zoom;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const { lat, lonU } of samples) {
    const x = Math.floor((lonU + 180) / deg);
    const y = Math.min(rows - 1, Math.max(0, Math.floor((90 - lat) / deg)));
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { zoom, deg, x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

let globeSampler = null;
/** The globe texture, shrunk once to a readable canvas, for colour matching. */
function getGlobeSampler(globeImage) {
  if (globeSampler?.image === globeImage) return globeSampler;
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(globeImage, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  globeSampler = {
    image: globeImage,
    sample(lat, lon) {
      const u = ((((lon + 180) / 360) % 1) + 1) % 1;
      const v = Math.min(0.999, Math.max(0, (90 - lat) / 180));
      const i = (Math.floor(v * h) * w + Math.floor(u * w)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    },
  };
  return globeSampler;
}

/**
 * Resolves to { canvas, zoom, tiles, loaded } or rejects if no imagery could be loaded.
 * `globeImage` is the globe's colour texture image (used for colour matching; optional).
 */
export async function buildSurfacePatch({ lat, lon, globeImage, signal }) {
  const { halfSizeKm: S, textureSize: N, maxTiles, tileTimeoutMs } = EXPLORE.site;
  const centreLon = nearestLon(lon, 0);

  // Footprint of the patch on the sphere, sampled on a coarse grid
  const footprint = [];
  const G = 24;
  for (let j = 0; j <= G; j++) {
    for (let i = 0; i <= G; i++) {
      const p = localKmToLatLon(lat, lon, -S + (2 * S * i) / G, -S + (2 * S * j) / G);
      footprint.push({ lat: p.lat, lonU: nearestLon(p.lon, centreLon) });
    }
  }

  // The sharpest zoom whose tile count stays reasonable (polar sites need a coarser one)
  let box = null;
  for (let z = VIKING.maxNativeZoom; z >= 2; z--) {
    box = tileBox(footprint, z);
    if (box.count <= maxTiles) break;
  }

  const cols = 2 * 2 ** box.zoom;
  const mosaicW = (box.x1 - box.x0 + 1) * TILE;
  const mosaicH = (box.y1 - box.y0 + 1) * TILE;
  const mosaic = document.createElement('canvas');
  mosaic.width = mosaicW;
  mosaic.height = mosaicH;
  const mctx = mosaic.getContext('2d', { willReadFrequently: true });

  const jobs = [];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const wrapped = ((x % cols) + cols) % cols;
      const url = trekTileUrl(VIKING, box.zoom, wrapped, y);
      jobs.push(
        loadImage(url, tileTimeoutMs, signal).then((img) => {
          if (img) mctx.drawImage(img, (x - box.x0) * TILE, (y - box.y0) * TILE, TILE, TILE);
          return !!img;
        })
      );
    }
  }
  const results = await Promise.all(jobs);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const loaded = results.filter(Boolean).length;
  if (loaded === 0) throw new Error('No Mars Trek imagery could be loaded for this site');

  const src = mctx.getImageData(0, 0, mosaicW, mosaicH).data;

  /** Bilinear sample of the mosaic at a lat/lon; returns alpha 0 where a tile is missing. */
  const out4 = [0, 0, 0, 0];
  const sampleMosaic = (la, lonU) => {
    const fx = ((lonU + 180) / box.deg - box.x0) * TILE - 0.5;
    const fy = ((90 - la) / box.deg - box.y0) * TILE - 0.5;
    const x0 = Math.max(0, Math.min(mosaicW - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(mosaicH - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const i00 = (y0 * mosaicW + x0) * 4;
    const i10 = i00 + 4;
    const i01 = i00 + mosaicW * 4;
    const i11 = i01 + 4;
    for (let c = 0; c < 4; c++) {
      const a = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * tx;
      const b = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * tx;
      out4[c] = a + (b - a) * ty;
    }
    return out4;
  };

  // Colour matching: compare the patch with the globe texture over the same ground
  let gain = [1, 1, 1];
  if (globeImage) {
    try {
      const globe = getGlobeSampler(globeImage);
      const sumP = [0, 0, 0];
      const sumG = [0, 0, 0];
      let n = 0;
      for (const { lat: la, lonU } of footprint) {
        const p = sampleMosaic(la, lonU);
        if (p[3] < 250) continue;
        const g = globe.sample(la, lonU);
        for (let c = 0; c < 3; c++) {
          sumP[c] += p[c];
          sumG[c] += g[c];
        }
        n++;
      }
      if (n > 20) gain = sumP.map((s, c) => Math.min(1.9, Math.max(0.55, (sumG[c] + 1) / (s + 1))));
    } catch {
      // A tainted or unreadable globe texture only costs us the colour match
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(N, N);
  const dst = out.data;

  // Resample in chunks so building the patch never stalls the camera flight
  const ROWS_PER_CHUNK = 96;
  for (let row = 0; row < N; row += ROWS_PER_CHUNK) {
    const end = Math.min(N, row + ROWS_PER_CHUNK);
    for (let j = row; j < end; j++) {
      const yKm = S - ((j + 0.5) / N) * 2 * S; // row 0 is the north edge
      for (let i = 0; i < N; i++) {
        const xKm = -S + ((i + 0.5) / N) * 2 * S;
        const r = Math.hypot(xKm, yKm) / S;
        const k = (j * N + i) * 4;
        if (r >= 0.99) {
          dst[k + 3] = 0;
          continue;
        }
        const p = localKmToLatLon(lat, lon, xKm, yKm);
        const s = sampleMosaic(p.lat, nearestLon(p.lon, centreLon));
        // Round fade at the edge, so the patch melts into the globe
        const t = Math.min(1, Math.max(0, (r - 0.7) / 0.28));
        const fade = 1 - t * t * (3 - 2 * t);
        dst[k] = Math.min(255, s[0] * gain[0]);
        dst[k + 1] = Math.min(255, s[1] * gain[1]);
        dst[k + 2] = Math.min(255, s[2] * gain[2]);
        dst[k + 3] = s[3] * fade;
      }
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await nextFrame();
  }
  ctx.putImageData(out, 0, 0);

  return { canvas, zoom: box.zoom, tiles: results.length, loaded };
}
