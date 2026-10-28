import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARS_MEAN_RADIUS_KM,
  distanceKm,
  distanceToSegmentKm,
  greatCirclePath,
  interpolateGreatCircle,
  normalizeLon,
  parseCoordinates,
  pathLengthKm,
  toLon360,
  formatLon,
} from '../../src/navigate/core/marsGeo.ts';

const near = (a: number, b: number, eps: number, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b} (±${eps})`);

test('distances use the Mars mean radius, not Earth’s', () => {
  // A quarter of a meridian is πR/2
  near(distanceKm({ lat: 0, lon: 0 }, { lat: 90, lon: 0 }), (Math.PI * MARS_MEAN_RADIUS_KM) / 2, 1e-6);
  // Half the equator
  near(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }), Math.PI * MARS_MEAN_RADIUS_KM, 1e-6);
  // One degree of latitude is about 59.16 km on Mars (it would be 111 km on Earth)
  near(distanceKm({ lat: 18, lon: 77 }, { lat: 19, lon: 77 }), 59.157, 0.01);
});

test('distance is symmetric and wraps across the ±180° meridian', () => {
  const a = { lat: 10, lon: 179.5 };
  const b = { lat: 10, lon: -179.5 };
  near(distanceKm(a, b), distanceKm(b, a), 1e-9);
  assert.ok(distanceKm(a, b) < 60, 'one degree apart, not 359');
});

test('longitude conventions convert both ways', () => {
  assert.equal(normalizeLon(282.5), -77.5);
  assert.equal(normalizeLon(-77.5), -77.5);
  assert.equal(normalizeLon(540), 180);
  near(toLon360(-77.5), 282.5, 1e-9);
  assert.equal(formatLon(-77.5, 1), '282.5° E');
});

test('great circles: endpoints exact, midpoint equidistant, length matches', () => {
  const a = { lat: 18.4447, lon: 77.4508 };
  const b = { lat: 18.65, lon: -133.8 };
  const path = greatCirclePath(a, b, 50);
  assert.deepEqual(path[0], a);
  assert.deepEqual(path[path.length - 1], b);
  near(pathLengthKm(path), distanceKm(a, b), 0.5);
  const mid = interpolateGreatCircle(a, b, 0.5);
  near(distanceKm(a, mid), distanceKm(mid, b), 1e-6);
});

test('cross-track distance to a segment', () => {
  // A point 1° north of the middle of an equatorial segment is 1° of arc away
  near(distanceToSegmentKm({ lat: 1, lon: 5 }, { lat: 0, lon: 0 }, { lat: 0, lon: 10 }), (MARS_MEAN_RADIUS_KM * Math.PI) / 180, 0.01);
  // Beyond the end of the segment, distance is to the endpoint
  near(distanceToSegmentKm({ lat: 0, lon: 12 }, { lat: 0, lon: 0 }, { lat: 0, lon: 10 }), distanceKm({ lat: 0, lon: 12 }, { lat: 0, lon: 10 }), 1e-6);
});

test('parses the coordinate formats visitors type', () => {
  const cases: Array<[string, number, number]> = [
    ['18.4447, 77.4508', 18.4447, 77.4508],
    ['18.4447 77.4508', 18.4447, 77.4508],
    ['18.44°N, 77.45°E', 18.44, 77.45],
    ['18.44 N 77.45 E', 18.44, 77.45],
    ['14.53 S, 175.52 E', -14.53, 175.52],
    ['-14.53, 175.52', -14.53, 175.52],
    ['18.65, 226.2', 18.65, -133.8], // 0–360 east
    ['18.65 N, 133.8 W', 18.65, -133.8], // west
  ];
  for (const [text, lat, lon] of cases) {
    const r = parseCoordinates(text);
    assert.ok(r.ok, `${text}: ${!r.ok && r.error}`);
    if (r.ok) {
      near(r.value.lat, lat, 1e-9, text);
      near(r.value.lon, lon, 1e-9, text);
    }
  }
});

test('rejects invalid or ambiguous coordinates', () => {
  for (const bad of ['', 'Jezero', '95, 10', '10, 400', '10 W, 20 N', '10, 200 W', '-10 N, 20', '10, -20 E', '1, 2, 3']) {
    assert.equal(parseCoordinates(bad).ok, false, bad);
  }
});
