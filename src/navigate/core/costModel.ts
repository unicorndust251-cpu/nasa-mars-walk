import type { TerrainGrid } from './terrain.ts';

/**
 * Terrain cost model: how expensive it is to cross each part of the grid.
 *
 * Every edge between neighbouring cells costs, in metres-equivalent of easy flat driving:
 *
 *   cost = length × (1 + slopePenalty + roughnessPenalty + uncertaintyPenalty)
 *        + climbWeight × metres climbed + descentWeight × metres descended
 *
 * with each penalty normalised to a 0–1 scale before weighting:
 *   slopePenalty       = wSlope × (slope / SLOPE_LIMIT_DEG)²
 *   roughnessPenalty   = wRough × min(1, roughness / ROUGHNESS_REF_M)
 *   uncertaintyPenalty = wUnknown × (1 if the cell has no DEM data, else 0)
 *
 * All terms are ≥ 0, so every edge costs at least its length: plain distance is an admissible A*
 * heuristic in every mode. Edges steeper than SLOPE_LIMIT_DEG are impassable in every mode.
 *
 * "Slope" for an edge is the larger of the two cells' 90th-percentile 20 m slopes (from the full
 * DEM) and the 100 m slope between the cells, so neither fine nor broad steepness is missed.
 *
 * This is an educational model, not a validated rover mobility model. SLOPE_LIMIT_DEG reflects the
 * tilt NASA rover planners avoid exceeding (Perseverance is designed to withstand 45° without
 * tipping, and drives keep well below that); the other weights are documented choices.
 */

export type RouteMode = 'shortest' | 'terrain' | 'science';

/** Slopes steeper than this are impassable in every mode. */
export const SLOPE_LIMIT_DEG = 30;
/** Roughness at which the roughness penalty saturates (RMS metres within a 100 m cell). */
export const ROUGHNESS_REF_M = 4;

export interface CostWeights {
  slope: number;
  roughness: number;
  unknown: number;
  /** Metres-equivalent of flat travel per metre climbed */
  climbPerM: number;
  /** Metres-equivalent of flat travel per metre descended */
  descentPerM: number;
}

export const MODE_WEIGHTS: Record<RouteMode, CostWeights> = {
  // Distance only, but still never through impassable slopes, and unknown ground costs extra
  shortest: { slope: 0, roughness: 0, unknown: 0.5, climbPerM: 0, descentPerM: 0 },
  // Prefers gentle, smooth, level ground even when that is longer
  terrain: { slope: 6, roughness: 1.5, unknown: 1.5, climbPerM: 6, descentPerM: 2 },
  // Science routes are driven with terrain-aware costs; the science comes from the stops chosen
  science: { slope: 6, roughness: 1.5, unknown: 1.5, climbPerM: 6, descentPerM: 2 },
};

const SQRT2 = Math.SQRT2;
const R2D = 180 / Math.PI;

/**
 * Per-mode cost field over a terrain grid: per-cell multipliers precomputed once, edges evaluated
 * on demand. This is what the pathfinder searches.
 */
export class CostField {
  readonly grid: TerrainGrid;
  readonly weights: CostWeights;
  readonly cols: number;
  readonly rows: number;
  /** Per-cell multiplier on distance (≥ 1) */
  readonly multiplier: Float32Array;
  /** 1 where a cell's own 20 m slope is within the limit (or unknown), 0 where impassable */
  readonly passable: Uint8Array;
  private readonly elevForStep: Float32Array;

  constructor(grid: TerrainGrid, weights: CostWeights) {
    this.grid = grid;
    this.weights = weights;
    this.cols = grid.cols;
    this.rows = grid.rows;
    const n = grid.cols * grid.rows;
    this.multiplier = new Float32Array(n);
    this.passable = new Uint8Array(n);
    this.elevForStep = grid.elevation;
    for (let k = 0; k < n; k++) {
      const s = grid.slope[k];
      const r = grid.roughness[k];
      const known = !Number.isNaN(s) && !Number.isNaN(grid.elevation[k]);
      this.passable[k] = !known || s <= SLOPE_LIMIT_DEG ? 1 : 0;
      let m = 1;
      if (known) {
        m += weights.slope * (s / SLOPE_LIMIT_DEG) ** 2;
        m += weights.roughness * Math.min(1, (Number.isNaN(r) ? 0 : r) / ROUGHNESS_REF_M);
      } else {
        m += weights.unknown;
      }
      this.multiplier[k] = m;
    }
  }

  /**
   * Cost of moving between neighbouring cells a and b (8-connected). Infinity if impassable.
   * `diagonal` is true for diagonal moves.
   */
  edgeCost(a: number, b: number, diagonal: boolean): number {
    if (!this.passable[a] || !this.passable[b]) return Infinity;
    if (diagonal) {
      // No corner cutting: a diagonal move touches both side cells at their shared corner
      const cols = this.cols;
      const ra = Math.floor(a / cols);
      const rb = Math.floor(b / cols);
      if (!this.passable[ra * cols + (b - rb * cols)] || !this.passable[rb * cols + (a - ra * cols)]) return Infinity;
    }
    const len = this.grid.cellM * (diagonal ? SQRT2 : 1);
    const ea = this.elevForStep[a];
    const eb = this.elevForStep[b];
    let climb = 0;
    if (!Number.isNaN(ea) && !Number.isNaN(eb)) {
      const dz = eb - ea;
      // The broad (100 m) slope between the cells counts against the limit too
      if (Math.atan(Math.abs(dz) / len) * R2D > SLOPE_LIMIT_DEG) return Infinity;
      climb = dz > 0 ? this.weights.climbPerM * dz : -this.weights.descentPerM * dz;
    }
    return len * 0.5 * (this.multiplier[a] + this.multiplier[b]) + climb;
  }
}

/** Slope classes used in route summaries. */
export const SLOPE_CLASSES = [
  { key: 'gentle', label: 'Gentle', maxDeg: 5 },
  { key: 'moderate', label: 'Moderate', maxDeg: 15 },
  { key: 'steep', label: 'Steep', maxDeg: 25 },
  { key: 'verySteep', label: 'Very steep', maxDeg: SLOPE_LIMIT_DEG },
] as const;

export type SlopeClassKey = (typeof SLOPE_CLASSES)[number]['key'];

export function slopeClass(deg: number): SlopeClassKey {
  for (const c of SLOPE_CLASSES) if (deg <= c.maxDeg) return c.key;
  return 'verySteep';
}
