import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCATIONS, locationById, searchLocations } from '../../src/navigate/core/locations.ts';
import { distanceKm } from '../../src/navigate/core/marsGeo.ts';
import { loadJezero } from './helpers.ts';

test('every location has the required, sourced fields', () => {
  const ids = new Set<string>();
  for (const l of LOCATIONS) {
    assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
    ids.add(l.id);
    assert.ok(l.lat >= -90 && l.lat <= 90 && l.lon >= -180 && l.lon <= 180, l.id);
    for (const field of ['name', 'category', 'region', 'description', 'source', 'sourceUrl', 'convention', 'accuracy'] as const) {
      assert.ok(typeof l[field] === 'string' && l[field].length > 2, `${l.id}.${field}`);
    }
    assert.ok(/^https:\/\//.test(l.sourceUrl), `${l.id} source URL`);
    assert.ok(Array.isArray(l.datasets) && l.datasets.length > 0, `${l.id} datasets`);
  }
});

test('the Jezero examples from the brief all resolve to real coordinates', () => {
  const grid = loadJezero();
  for (const q of ['Jezero Crater', 'Octavia E. Butler Landing Site', 'Séítah', 'Hogwallow Flats', 'Skinner Ridge', 'Jezero Delta']) {
    const hit = searchLocations(q)[0];
    assert.ok(hit, `search "${q}"`);
    if (q !== 'Jezero Crater') assert.ok(grid.contains(hit), `${q} inside the Jezero terrain model`);
  }
  for (const q of ['Gale Crater', 'Olympus Mons', 'Valles Marineris', 'Elysium Planitia', 'Gusev', 'Meridiani']) {
    assert.ok(searchLocations(q)[0], `search "${q}"`);
  }
});

test('the landing site matches NASA’s published coordinates', () => {
  const l = locationById('octavia-e-butler-landing')!;
  // NASA: 18.4447° N, 77.4508° E
  assert.ok(distanceKm(l, { lat: 18.4447, lon: 77.4508 }) < 0.05);
});

test('search ignores accents and case, and finds aliases', () => {
  assert.equal(searchLocations('seitah')[0].id, 'seitah-south');
  assert.equal(searchLocations('PERSEVERANCE LANDING')[0].id, 'octavia-e-butler-landing');
  assert.equal(searchLocations('olymp')[0].name, 'Olympus Mons');
  assert.deepEqual(searchLocations(''), []);
  assert.deepEqual(searchLocations('zzzzzz'), []);
});
