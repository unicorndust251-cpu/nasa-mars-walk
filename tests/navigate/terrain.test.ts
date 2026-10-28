import { test } from 'node:test';
import assert from 'node:assert/strict';
import sampleData from '../../src/navigate/data/jezero-sample-sites.json' with { type: 'json' };
import { loadJezero } from './helpers.ts';

test('terrain grid decodes with the documented geometry', () => {
  const grid = loadJezero();
  assert.equal(grid.cols, 891);
  assert.equal(grid.rows, 1013);
  assert.equal(grid.cellM, 100);
  const b = grid.bounds();
  assert.ok(Math.abs(b.north - 19.2902) < 0.001 && Math.abs(b.south - 17.5812) < 0.001, JSON.stringify(b));
  assert.ok(Math.abs(b.west - 76.9974) < 0.001 && Math.abs(b.east - 78.5822) < 0.001, JSON.stringify(b));
});

test('lat/lon ↔ cell conversion round-trips to within a cell', () => {
  const grid = loadJezero();
  for (const [c, r] of [
    [0, 0],
    [445, 506],
    [890, 1012],
    [123, 877],
  ]) {
    const p = grid.cellCenter(c, r);
    const cell = grid.cellAt(p);
    assert.deepEqual([cell?.c, cell?.r], [c, r]);
    // Projected distance between centres of neighbouring cells is the cell size
    const q = grid.cellCenter(Math.min(890, c + 1), r);
    if (c < 890) assert.ok(Math.abs(grid.planarDistanceM(p, q) - 100) < 1e-6);
  }
  assert.equal(grid.cellAt({ lat: 18.65, lon: -133.8 }), null, 'Olympus Mons is outside the Jezero grid');
});

test('DEM elevations agree with NASA rover elevations at the sample sites', () => {
  // Independent check of georeferencing: Perseverance's own localized elevations vs the DEM grid
  const grid = loadJezero();
  const diffs = sampleData.samples
    .filter((s) => s.elevationM !== null)
    .map((s) => grid.elevationAt(s) - (s.elevationM as number))
    .sort((a, b) => a - b);
  assert.ok(diffs.length >= 25);
  const median = diffs[Math.floor(diffs.length / 2)];
  assert.ok(Math.abs(median) < 10, `median difference ${median} m`);
  assert.ok(diffs.every((d) => Math.abs(d) < 40), `all within 40 m: ${diffs.map((d) => d.toFixed(0)).join(',')}`);
});

test('terrain values are physically sensible', () => {
  const grid = loadJezero();
  let min = Infinity;
  let max = -Infinity;
  let maxSlope = 0;
  for (let k = 0; k < grid.cols * grid.rows; k++) {
    if (!grid.isKnown(k)) continue;
    min = Math.min(min, grid.elevation[k]);
    max = Math.max(max, grid.elevation[k]);
    maxSlope = Math.max(maxSlope, grid.slope[k]);
  }
  // Jezero's floor sits around −2.6 km; its rim rises above −1 km relative to the MOLA areoid
  assert.ok(min > -4000 && min < -2500, `min ${min}`);
  assert.ok(max > -1000 && max < 0, `max ${max}`);
  assert.ok(maxSlope > 30 && maxSlope <= 90, `steepest ${maxSlope}°`);
});
