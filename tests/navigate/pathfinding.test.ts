import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbortedError, Pathfinder, dijkstraCost, type CostGraph } from '../../src/navigate/core/pathfinding.ts';
import { noPause } from './helpers.ts';

/** A synthetic grid: per-cell multipliers ≥ 1 and optional walls, like the real cost field. */
function makeGraph(cols: number, rows: number, seed: number, wallChance = 0): CostGraph & { blocked: Uint8Array; mult: Float64Array } {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mult = new Float64Array(cols * rows).map(() => 1 + rand() * 4);
  const blocked = new Uint8Array(cols * rows).map(() => (rand() < wallChance ? 1 : 0));
  return {
    cols,
    rows,
    mult,
    blocked,
    edgeCost(a, b, diagonal) {
      if (blocked[a] || blocked[b]) return Infinity;
      return (diagonal ? Math.SQRT2 : 1) * 0.5 * (mult[a] + mult[b]);
    },
  };
}

test('A* finds the optimal cost (matches Dijkstra) on random terrain', async () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = makeGraph(40, 30, seed, seed % 3 === 0 ? 0.2 : 0);
    const start = 0;
    const goal = g.cols * g.rows - 1;
    g.blocked[start] = 0;
    g.blocked[goal] = 0;
    const pf = new Pathfinder(g.cols, g.rows);
    const result = await pf.search(g, start, goal, { cellM: 1, pause: noPause });
    const reference = dijkstraCost(g, start, goal);
    if (reference === Infinity) {
      assert.equal(result, null, `seed ${seed}: unreachable`);
      continue;
    }
    assert.ok(result, `seed ${seed}: path expected`);
    assert.ok(Math.abs(result.cost - reference) < 1e-9, `seed ${seed}: A* ${result.cost} vs Dijkstra ${reference}`);
    // The path is connected, starts and ends where asked, and its cost adds up
    assert.equal(result.path[0], start);
    assert.equal(result.path[result.path.length - 1], goal);
    let sum = 0;
    for (let i = 1; i < result.path.length; i++) {
      const a = result.path[i - 1];
      const b = result.path[i];
      const dx = Math.abs((a % g.cols) - (b % g.cols));
      const dy = Math.abs(Math.floor(a / g.cols) - Math.floor(b / g.cols));
      assert.ok(dx <= 1 && dy <= 1 && dx + dy > 0, 'neighbouring cells');
      sum += g.edgeCost(a, b, dx + dy === 2);
    }
    assert.ok(Math.abs(sum - result.cost) < 1e-9);
  }
});

test('never steps on blocked cells, and goes around a wall', async () => {
  const g = makeGraph(20, 20, 7);
  g.mult.fill(1);
  // Vertical wall at column 10 with a single gap at row 18
  for (let r = 0; r < 20; r++) if (r !== 18) g.blocked[r * 20 + 10] = 1;
  const pf = new Pathfinder(20, 20);
  const result = await pf.search(g, 5 * 20 + 2, 5 * 20 + 17, { cellM: 1, pause: noPause });
  assert.ok(result);
  assert.ok(result.path.every((k) => !g.blocked[k]));
  assert.ok(result.path.includes(18 * 20 + 10), 'passes through the gap');
});

test('reports no path when the goal is walled off', async () => {
  const g = makeGraph(15, 15, 3);
  for (let r = 0; r < 15; r++) g.blocked[r * 15 + 7] = 1;
  const pf = new Pathfinder(15, 15);
  assert.equal(await pf.search(g, 0, 14, { cellM: 1, pause: noPause }), null);
});

test('start equal to goal is a one-cell path', async () => {
  const g = makeGraph(5, 5, 1);
  const pf = new Pathfinder(5, 5);
  const r = await pf.search(g, 12, 12, { cellM: 1, pause: noPause });
  assert.deepEqual(r?.path, [12]);
  assert.equal(r?.cost, 0);
});

test('a search can be cancelled mid-flight', async () => {
  const g = makeGraph(300, 300, 11);
  const pf = new Pathfinder(300, 300);
  const signal = { aborted: false };
  let pauses = 0;
  const pause = async () => {
    pauses++;
    signal.aborted = true; // a newer request arrives during the first pause
  };
  await assert.rejects(pf.search(g, 0, 300 * 300 - 1, { cellM: 1, signal, pause, yieldEvery: 500 }), AbortedError);
  assert.equal(pauses, 1);
  // The same pathfinder works normally afterwards (buffers are reset per search)
  const ok = await pf.search(g, 0, 299, { cellM: 1, pause: noPause });
  assert.ok(ok && ok.path[0] === 0 && ok.path[ok.path.length - 1] === 299);
});
