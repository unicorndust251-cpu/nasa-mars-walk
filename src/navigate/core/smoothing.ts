import { SLOPE_LIMIT_DEG, type CostField } from './costModel.ts';

/**
 * Removes the staircase from an 8-connected grid path ("string pulling"), without cheating:
 * a run of cells is replaced by a straight segment only when the straight segment
 *  - crosses no impassable cell or impassable step (every cell it touches is checked), and
 *  - costs no more, under the same cost model, than the cells it replaces.
 * So smoothing straightens routes on open ground but never shortcuts across a slope the
 * planner deliberately went around.
 */

const R2D = 180 / Math.PI;

/**
 * Visits every grid cell a straight segment passes through, in order, with the length of the
 * segment inside each (Amanatides–Woo traversal). Coordinates are fractional grid units.
 * Returning false from the visitor stops the walk.
 */
export function traverseCells(
  cols: number,
  rows: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (cell: number, lengthCells: number) => boolean
): void {
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = stepX > 0 ? (cx + 1 - x0) / dx : stepX < 0 ? (x0 - cx) / -dx : Infinity;
  let tMaxY = stepY > 0 ? (cy + 1 - y0) / dy : stepY < 0 ? (y0 - cy) / -dy : Infinity;
  let t = 0;
  for (let guard = 0; guard < cols + rows + 4; guard++) {
    const inside = cx >= 0 && cy >= 0 && cx < cols && cy < rows;
    const tNext = Math.min(tMaxX, tMaxY, 1);
    if (inside && !visit(cy * cols + cx, (tNext - t) * len)) return;
    if (tNext >= 1 || (cx === ex && cy === ey)) return;
    t = tNext;
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxX) {
      cy += stepY;
      tMaxY += tDeltaY;
    } else {
      // Exactly through a corner: both neighbours are touched, so both must be passable
      if (inside) {
        const sideA = cy * cols + (cx + stepX);
        const sideB = (cy + stepY) * cols + cx;
        if (cx + stepX >= 0 && cx + stepX < cols && !visit(sideA, 0)) return;
        if (cy + stepY >= 0 && cy + stepY < rows && !visit(sideB, 0)) return;
      }
      cx += stepX;
      cy += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    }
  }
}

/** Cost of the straight segment between two cell centres, or Infinity if it touches impassable ground. */
export function segmentCost(field: CostField, from: number, to: number): number {
  const { grid, multiplier, passable, weights } = field;
  const cols = grid.cols;
  const x0 = (from % cols) + 0.5;
  const y0 = Math.floor(from / cols) + 0.5;
  const x1 = (to % cols) + 0.5;
  const y1 = Math.floor(to / cols) + 0.5;

  let cost = 0;
  let prevCell = -1;
  let prevElev = NaN;
  let ok = true;
  traverseCells(cols, grid.rows, x0, y0, x1, y1, (cell, lengthCells) => {
    if (!passable[cell]) return (ok = false);
    cost += lengthCells * grid.cellM * multiplier[cell];
    if (prevCell >= 0 && cell !== prevCell && lengthCells > 0) {
      const e = grid.elevation[cell];
      if (!Number.isNaN(e) && !Number.isNaN(prevElev)) {
        const run = Math.hypot((cell % cols) - (prevCell % cols), Math.floor(cell / cols) - Math.floor(prevCell / cols)) * grid.cellM;
        const dz = e - prevElev;
        if (Math.atan(Math.abs(dz) / run) * R2D > SLOPE_LIMIT_DEG) return (ok = false);
        cost += dz > 0 ? weights.climbPerM * dz : -weights.descentPerM * dz;
      }
    }
    if (lengthCells > 0) {
      prevCell = cell;
      prevElev = grid.elevation[cell];
    }
    return true;
  });
  return ok ? cost : Infinity;
}

/** Smoothed subset of `path` (cell indices), always keeping the first and last cell. */
export function smoothPath(field: CostField, path: number[], maxLook = 48): number[] {
  if (path.length <= 2) return path.slice();
  // Cost along the original path up to each node
  const prefix = new Float64Array(path.length);
  const cols = field.grid.cols;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const diagonal = a % cols !== b % cols && Math.floor(a / cols) !== Math.floor(b / cols);
    prefix[i] = prefix[i - 1] + field.edgeCost(a, b, diagonal);
  }

  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let next = i + 1;
    for (let j = Math.min(path.length - 1, i + maxLook); j > i + 1; j--) {
      const original = prefix[j] - prefix[i];
      if (segmentCost(field, path[i], path[j]) <= original * 1.0001) {
        next = j;
        break;
      }
    }
    out.push(path[next]);
    i = next;
  }
  return out;
}
