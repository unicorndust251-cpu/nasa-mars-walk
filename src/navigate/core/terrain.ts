import type { LatLon } from './marsGeo.ts';

/**
 * A terrain grid derived from a real Mars digital elevation model (see
 * scripts/build-jezero-terrain.mjs). Each cell carries elevation, the 90th-percentile slope of the
 * full-resolution DEM pixels inside it, and roughness. Cells without DEM data are UNKNOWN: they are
 * never treated as safe, flat ground.
 *
 * Geometry follows the DEM itself: equirectangular on the Mars 2000 sphere with true scale at the
 * grid's standard parallel, so cell sizes are true metres on the ground.
 */

export interface TerrainHeader {
  format: string;
  version: number;
  name: string;
  source: string;
  sourceUrl: string;
  projection: 'equirectangular';
  radiusM: number;
  latTrueScaleDeg: number;
  originX: number;
  originY: number;
  cellM: number;
  cols: number;
  rows: number;
  elevationNoData: number;
  slopeUnitDeg: number;
  roughnessUnitM: number;
  unknown: number;
}

const D2R = Math.PI / 180;

export class TerrainGrid {
  readonly header: TerrainHeader;
  readonly cols: number;
  readonly rows: number;
  readonly cellM: number;
  /** Elevation in metres, NaN where unknown */
  readonly elevation: Float32Array;
  /** 90th-percentile slope in degrees, NaN where unknown */
  readonly slope: Float32Array;
  /** Roughness (RMS departure from a plane) in metres, NaN where unknown */
  readonly roughness: Float32Array;
  private readonly kx: number;
  private readonly ky: number;

  constructor(header: TerrainHeader, elevation: Float32Array, slope: Float32Array, roughness: Float32Array) {
    this.header = header;
    this.cols = header.cols;
    this.rows = header.rows;
    this.cellM = header.cellM;
    this.elevation = elevation;
    this.slope = slope;
    this.roughness = roughness;
    this.kx = header.radiusM * Math.cos(header.latTrueScaleDeg * D2R) * D2R; // metres per degree of longitude
    this.ky = header.radiusM * D2R; // metres per degree of latitude
  }

  /** Decodes the (already decompressed) terrain file. */
  static decode(data: ArrayBuffer | Uint8Array): TerrainGrid {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength))) as TerrainHeader;
    if (header.format !== 'beyond-terra-terrain' || header.version !== 1) throw new Error('Unsupported terrain file');
    let offset = 4 + headerLength;
    offset += (4 - (offset % 4)) % 4;
    const n = header.cols * header.rows;

    const elevation = new Float32Array(n);
    for (let r = 0; r < header.rows; r++) {
      let prev = 0;
      for (let c = 0; c < header.cols; c++) {
        const k = r * header.cols + c;
        const d = view.getInt16(offset + k * 2, true);
        if (d === header.elevationNoData) {
          elevation[k] = NaN;
          continue;
        }
        prev += d;
        elevation[k] = prev;
      }
    }
    offset += n * 2;
    const slope = new Float32Array(n);
    const roughness = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const s = bytes[offset + k];
      const r = bytes[offset + n + k];
      slope[k] = s === header.unknown ? NaN : s * header.slopeUnitDeg;
      roughness[k] = r === header.unknown ? NaN : r * header.roughnessUnitM;
    }
    return new TerrainGrid(header, elevation, slope, roughness);
  }

  index(c: number, r: number): number {
    return r * this.cols + c;
  }

  isKnown(k: number): boolean {
    return !Number.isNaN(this.elevation[k]) && !Number.isNaN(this.slope[k]);
  }

  /** Projected metres (x east, y north) for a lat/lon. */
  project(p: LatLon): { x: number; y: number } {
    return { x: p.lon * this.kx, y: p.lat * this.ky };
  }

  unproject(x: number, y: number): LatLon {
    return { lat: y / this.ky, lon: x / this.kx };
  }

  /** Fractional grid position (column, row) of a lat/lon; cell (c, r) spans [c, c+1) × [r, r+1). */
  toGrid(p: LatLon): { gx: number; gy: number } {
    const { x, y } = this.project(p);
    return { gx: (x - this.header.originX) / this.cellM, gy: (this.header.originY - y) / this.cellM };
  }

  /** Cell containing a lat/lon, or null outside the grid. */
  cellAt(p: LatLon): { c: number; r: number; k: number } | null {
    const { gx, gy } = this.toGrid(p);
    const c = Math.floor(gx);
    const r = Math.floor(gy);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return { c, r, k: this.index(c, r) };
  }

  contains(p: LatLon): boolean {
    return this.cellAt(p) !== null;
  }

  /** Centre of a cell as lat/lon. */
  cellCenter(c: number, r: number): LatLon {
    return this.unproject(this.header.originX + (c + 0.5) * this.cellM, this.header.originY - (r + 0.5) * this.cellM);
  }

  /** Lat/lon of a fractional grid position. */
  gridToLatLon(gx: number, gy: number): LatLon {
    return this.unproject(this.header.originX + gx * this.cellM, this.header.originY - gy * this.cellM);
  }

  /** Bilinearly interpolated elevation at a fractional grid position (NaN if any corner is unknown). */
  elevationAtGrid(gx: number, gy: number): number {
    const x = Math.min(this.cols - 1.001, Math.max(0, gx - 0.5));
    const y = Math.min(this.rows - 1.001, Math.max(0, gy - 0.5));
    const c = Math.floor(x);
    const r = Math.floor(y);
    const tx = x - c;
    const ty = y - r;
    const e = this.elevation;
    const k = this.index(c, r);
    const a = e[k] + (e[k + 1] - e[k]) * tx;
    const b = e[k + this.cols] + (e[k + this.cols + 1] - e[k + this.cols]) * tx;
    return a + (b - a) * ty;
  }

  elevationAt(p: LatLon): number {
    const { gx, gy } = this.toGrid(p);
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return NaN;
    return this.elevationAtGrid(gx, gy);
  }

  bounds(): { south: number; north: number; west: number; east: number } {
    const nw = this.gridToLatLon(0, 0);
    const se = this.gridToLatLon(this.cols, this.rows);
    return { north: nw.lat, west: nw.lon, south: se.lat, east: se.lon };
  }

  /** Planar distance in metres between two lat/lons, on this grid's projection. */
  planarDistanceM(a: LatLon, b: LatLon): number {
    const p = this.project(a);
    const q = this.project(b);
    return Math.hypot(q.x - p.x, q.y - p.y);
  }
}
