import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbortedError, planRoute, costFieldFor, DETOUR_BUDGETS, type PlanRequest, type RoutePoint } from '../../src/navigate/core/routePlanner.ts';
import { SLOPE_LIMIT_DEG } from '../../src/navigate/core/costModel.ts';
import { traverseCells } from '../../src/navigate/core/smoothing.ts';
import { distanceKm, distanceToPathKm } from '../../src/navigate/core/marsGeo.ts';
import { LOCATIONS, locationById } from '../../src/navigate/core/locations.ts';
import { discoverAlongRoute } from '../../src/navigate/core/discover.ts';
import { loadJezero, noPause } from './helpers.ts';

const point = (id: string): RoutePoint => {
  const l = locationById(id);
  assert.ok(l, `location ${id}`);
  return { lat: l.lat, lon: l.lon, name: l.name, id: l.id };
};
const LANDING = point('octavia-e-butler-landing');
const DELTA = point('jezero-delta-front');
const RIM = point('witch-hazel-hill');
const candidates = LOCATIONS.filter((l) => l.scale !== 'global').map((l) => ({ id: l.id, name: l.name, lat: l.lat, lon: l.lon, value: l.scienceValue }));

const request = (over: Partial<PlanRequest> = {}): PlanRequest => ({
  start: LANDING,
  destination: DELTA,
  waypoints: [],
  mode: 'terrain',
  detour: 'moderate',
  ...over,
});
const ctx = () => ({ terrain: loadJezero(), candidates, pause: noPause });

/** Every cell touched by every straight piece of the route is traversable (exact grid traversal). */
function assertTraversable(coords: Array<{ lat: number; lon: number }>) {
  const grid = loadJezero();
  const field = costFieldFor(grid, 'terrain');
  for (let i = 1; i < coords.length; i++) {
    const a = grid.toGrid(coords[i - 1]);
    const b = grid.toGrid(coords[i]);
    traverseCells(grid.cols, grid.rows, a.gx, a.gy, b.gx, b.gy, (cell) => {
      assert.ok(field.passable[cell], `segment ${i} touches impassable ground (${grid.slope[cell]}°)`);
      return true;
    });
  }
}

test('route endpoints are exactly the requested start and destination', async () => {
  const r = await planRoute(request(), ctx());
  assert.equal(r.kind, 'terrain');
  assert.deepEqual(r.coordinates[0], { lat: LANDING.lat, lon: LANDING.lon });
  assert.deepEqual(r.coordinates[r.coordinates.length - 1], { lat: DELTA.lat, lon: DELTA.lon });
  assert.equal(r.stops[0].kind, 'start');
  assert.equal(r.stops[r.stops.length - 1].kind, 'destination');
});

test('route distance is the measured polyline, never shorter than the straight line', async () => {
  for (const mode of ['shortest', 'terrain'] as const) {
    const r = await planRoute(request({ mode }), ctx());
    assert.ok(r.distanceKm >= r.directKm - 1e-9, `${mode}: ${r.distanceKm} vs direct ${r.directKm}`);
    let sum = 0;
    for (let i = 1; i < r.coordinates.length; i++) sum += distanceKm(r.coordinates[i - 1], r.coordinates[i]);
    assert.ok(Math.abs(sum - r.distanceKm) < 1e-6);
    assert.ok(Math.abs(r.legsKm.reduce((s, v) => s + v, 0) - r.distanceKm) < 1e-6);
  }
});

test('terrain restrictions: no route crosses ground steeper than the limit', async () => {
  for (const mode of ['shortest', 'terrain'] as const) {
    const r = await planRoute(request({ mode, destination: RIM }), ctx());
    assert.ok(r.terrain);
    assert.ok(r.terrain.maxSlopeDeg <= SLOPE_LIMIT_DEG, `${mode}: max slope ${r.terrain.maxSlopeDeg}°`);
    assertTraversable(r.coordinates);
  }
});

test('long routes across the crater rim stay within the slope limit everywhere', async () => {
  for (const mode of ['shortest', 'terrain'] as const) {
    const r = await planRoute(request({ mode, start: point('iau-sava-vallis'), destination: point('iau-sedona') }), ctx());
    assert.ok(r.distanceKm > 70, 'rim to rim');
    assert.ok(r.terrain!.maxSlopeDeg <= SLOPE_LIMIT_DEG, `${mode}: max slope ${r.terrain!.maxSlopeDeg}°`);
    assertTraversable(r.coordinates);
  }
});

test('a destination on steep ground is reached at the nearest traversable ground, with a note', async () => {
  // Find a genuinely impassable cell in the real data that has gentler ground close by
  const grid = loadJezero();
  const field = costFieldFor(grid, 'terrain');
  let target = -1;
  for (let r = 300; r < grid.rows - 300 && target < 0; r += 7) {
    for (let c = 300; c < grid.cols - 300; c += 7) {
      const k = r * grid.cols + c;
      if (!field.passable[k] && field.passable[k + 2]) {
        target = k;
        break;
      }
    }
  }
  assert.ok(target >= 0, 'found a steep cell');
  const steep = { ...grid.cellCenter(target % grid.cols, Math.floor(target / grid.cols)), name: 'Steep spot' };
  for (const mode of ['shortest', 'terrain'] as const) {
    const r = await planRoute(request({ mode, destination: steep }), ctx());
    assert.ok(r.notes.some((n) => /nearest traversable ground/.test(n)), `${mode}: explains the adjusted endpoint`);
    const end = r.coordinates[r.coordinates.length - 1];
    assert.ok(field.passable[grid.cellAt(end)!.k], 'route ends on traversable ground');
    assert.ok(distanceKm(end, steep) < 1, 'close to the requested spot');
    assertTraversable(r.coordinates);
  }
});

test('terrain-aware route is no steeper than the shortest and explains the difference', async () => {
  const shortest = await planRoute(request({ mode: 'shortest', destination: RIM }), ctx());
  const terrain = await planRoute(request({ mode: 'terrain', destination: RIM }), ctx());
  assert.ok(terrain.distanceKm >= shortest.distanceKm - 0.05, 'terrain-aware is not shorter than shortest');
  const steep = (r: typeof shortest) => r.terrain!.classKm.steep + r.terrain!.classKm.verySteep;
  assert.ok(steep(terrain) <= steep(shortest) + 0.05, `steep km ${steep(terrain)} vs ${steep(shortest)}`);
  assert.ok(terrain.comparison && terrain.comparison.explanation.length > 20);
  assert.ok(Math.abs(terrain.comparison.shortestKm - shortest.distanceKm) < 1e-6);
});

test('waypoints: the route passes through each one, in order; removing it restores the original', async () => {
  const via = point('iau-belva');
  const original = await planRoute(request(), ctx());
  const withStop = await planRoute(request({ waypoints: [via] }), ctx());
  assert.equal(withStop.stops.length, 3);
  assert.equal(withStop.stops[1].name, 'Belva');
  assert.ok(withStop.coordinates.some((c) => c.lat === via.lat && c.lon === via.lon), 'route visits the waypoint exactly');
  assert.ok(withStop.stops[1].atKm > 0 && withStop.stops[1].atKm < withStop.distanceKm);
  assert.ok(withStop.distanceKm > original.distanceKm);
  const restored = await planRoute(request({ waypoints: [] }), ctx());
  assert.deepEqual(restored.coordinates, original.coordinates);
});

test('scientific discovery adds verified sites within the detour budget', async () => {
  for (const detour of ['minimal', 'moderate', 'extensive'] as const) {
    const r = await planRoute(request({ mode: 'science', destination: RIM, detour }), ctx());
    assert.ok(r.science);
    const budget = Math.max(DETOUR_BUDGETS[detour].minKm, r.science.baseKm * DETOUR_BUDGETS[detour].fraction);
    assert.ok(Math.abs(r.science.budgetKm - budget) < 1e-9);
    assert.ok(r.science.extraKm <= budget * 1.15 + 1e-6, `${detour}: extra ${r.science.extraKm} over budget ${budget}`);
    assert.ok(r.science.added.length <= DETOUR_BUDGETS[detour].maxStops);
    for (const s of r.science.added) assert.ok(locationById(s.id), `added stop ${s.name} comes from the database`);
    assertTraversable(r.coordinates);
  }
  const extensive = await planRoute(request({ mode: 'science', destination: RIM, detour: 'extensive' }), ctx());
  assert.ok(extensive.science!.added.length >= 1, 'a long route past the sample sites picks up at least one');
});

test('outside the terrain model: a labelled direct preview, never a traversable route', async () => {
  const olympus = point('landmark-olympus-mons');
  const r = await planRoute(request({ destination: olympus }), ctx());
  assert.equal(r.kind, 'preview');
  assert.equal(r.confidence, 'Low');
  assert.equal(r.difficulty, 'Not assessed');
  assert.equal(r.elevation, null, 'no invented elevation');
  assert.equal(r.terrain, null, 'no invented hazards');
  assert.ok(Math.abs(r.distanceKm - distanceKm(LANDING, olympus)) < 0.5, 'great-circle distance');
  assert.ok(r.notes.some((n) => /not a path/i.test(n)));
});

test('missing terrain data falls back to the preview with an explanation', async () => {
  const r = await planRoute(request(), { terrain: null });
  assert.equal(r.kind, 'preview');
  assert.ok(r.notes.some((n) => /could not be loaded/.test(n)));
});

test('invalid requests are rejected', async () => {
  await assert.rejects(planRoute(request({ destination: { ...LANDING } }), ctx()), /same place/);
  await assert.rejects(planRoute(request({ destination: { lat: 120, lon: 0, name: 'Nowhere' } }), ctx()), /invalid/);
});

test('recalculation can be cancelled', async () => {
  const signal = { aborted: false };
  const pause = async () => {
    signal.aborted = true;
  };
  // Mid-search: a newer request arrives during the pathfinder's first pause
  await assert.rejects(planRoute(request({ destination: RIM }), { terrain: loadJezero(), signal, pause, yieldEvery: 50 }), AbortedError);
  // Between legs: already superseded before the next leg starts
  await assert.rejects(planRoute(request({ waypoints: [point('iau-belva')] }), { terrain: loadJezero(), signal: { aborted: true }, pause: noPause }), AbortedError);
  // A fresh request afterwards succeeds
  const r = await planRoute(request({ destination: RIM }), ctx());
  assert.equal(r.kind, 'terrain');
});

test('discover along the way finds nearby documented sites with an insertion point', async () => {
  const r = await planRoute(request({ destination: RIM, mode: 'terrain' }), ctx());
  const found = discoverAlongRoute(r, LOCATIONS);
  assert.ok(found.length > 0);
  for (const d of found) {
    assert.ok(d.distanceFromRouteKm <= 3 + 1e-9);
    assert.ok(Math.abs(distanceToPathKm(d.location, r.coordinates).km - d.distanceFromRouteKm) < 1e-9);
    assert.ok(d.estimatedExtraKm >= 0);
    assert.notEqual(d.location.scale, 'global');
    assert.ok(d.insertAt >= 0 && d.insertAt <= r.stops.length - 2);
  }
  // Sorted nearest first
  for (let i = 1; i < found.length; i++) assert.ok(found[i].distanceFromRouteKm >= found[i - 1].distanceFromRouteKm);
});
