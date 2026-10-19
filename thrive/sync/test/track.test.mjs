// #432 AC3: the track file's contract, over a synthetic FIT.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkFit } from '../src/fit.mjs';
import {
  BASE_TOLERANCE_M, MAX_POINTS, TRACK_FORMAT, TRACK_VERSION, TrackUnreadableError,
  buildTrack, decodePositions, simplifyIndices,
} from '../src/track.mjs';
import { line, makeFit } from './fit-fixture.mjs';

const T0 = Date.UTC(2026, 5, 1, 14, 0, 0);

test('the synthetic FIT is a whole FIT as the sync checks one', () => {
  checkFit(makeFit(line(10)));
});

test('a straight line collapses to its two ends, keeping the first and last point', () => {
  const built = buildTrack(makeFit(line(100)), '4711');
  assert.equal(built.status, 'stored');
  assert.equal(built.points, 2);
  const { geometry, properties } = built.feature;
  assert.equal(geometry.type, 'LineString');
  assert.deepEqual(geometry.coordinates[0], [-100, 45]);
  assert.deepEqual(geometry.coordinates[1], [-99.9901, 45]);
  assert.equal(properties.points_in, 100);
});

test('the Feature has the stored shape: format, version, ids, bbox, t, ele, simplify', () => {
  const points = [
    { lat: 45.0, lon: -100.0, ms: T0, altitude: 800.04 },
    { lat: 45.001, lon: -100.0005, ms: T0 + 30_000, altitude: 801.26 },
    { lat: 45.0, lon: -100.001, ms: T0 + 61_000 },
  ];
  const built = buildTrack(makeFit(points), '4711');
  const { feature } = built;
  assert.equal(feature.type, 'Feature');
  assert.deepEqual(Object.keys(feature.properties), [
    'format', 'version', 'source', 'activity_id', 'start_utc', 't', 'ele', 'simplify', 'points_in',
  ]);
  assert.equal(feature.properties.format, TRACK_FORMAT);
  assert.equal(feature.properties.version, TRACK_VERSION);
  assert.equal(feature.properties.source, 'coros');
  assert.equal(feature.properties.activity_id, '4711');
  assert.equal(feature.properties.start_utc, '2026-06-01T14:00:00.000Z');
  assert.deepEqual(feature.properties.t, [0, 30, 61]);
  assert.equal(feature.properties.ele.length, 3);
  assert.ok(Math.abs(feature.properties.ele[0] - 800) < 0.2);
  assert.equal(feature.properties.ele[2], null); // the FIT had none for that record
  assert.deepEqual(feature.properties.simplify, { algorithm: 'rdp', tolerance_m: BASE_TOLERANCE_M });
  assert.equal(feature.properties.points_in, 3);
  assert.deepEqual(feature.bbox, [-100.001, 45, -100, 45.001]);
  for (const [lon, lat] of feature.geometry.coordinates) {
    assert.equal(lon, Math.round(lon * 1e5) / 1e5);
    assert.equal(lat, Math.round(lat * 1e5) / 1e5);
  }
});

test('records with no position, no timestamp, or 0,0 are dropped before simplifying', () => {
  const points = [
    { lat: 45.0, lon: -100.0, ms: T0 },
    { ms: T0 + 1000 }, // a record with no position
    { lat: 0, lon: 0, ms: T0 + 2000 }, // the null island fix
    { lat: 45.0, lon: -100.001, ms: T0 + 3000 },
  ];
  assert.equal(decodePositions(makeFit(points)).length, 2);
  assert.equal(buildTrack(makeFit(points), '1').feature.properties.points_in, 2);
});

test('a FIT with fewer than two valid positions is none', () => {
  assert.deepEqual(buildTrack(makeFit([{ lat: 45, lon: -100, ms: T0 }, { ms: T0 + 1000 }]), '1'), { status: 'none' });
  assert.deepEqual(buildTrack(makeFit([{ ms: T0 }]), '1'), { status: 'none' });
});

test('a corner more than the tolerance is kept, one less is not', () => {
  // About 11 m of sideways bend at the middle point (0.0001 degrees of latitude).
  const bent = (dLat) => [
    { lat: 45.0, lon: -100.0, ms: T0 },
    { lat: 45.0 + dLat, lon: -100.001, ms: T0 + 1000 },
    { lat: 45.0, lon: -100.002, ms: T0 + 2000 },
  ];
  assert.equal(buildTrack(makeFit(bent(0.0001)), '1').points, 3);
  assert.equal(buildTrack(makeFit(bent(0.00002)), '1').points, 2);
});

test('the build is deterministic: the same FIT gives byte-identical JSON', () => {
  const bytes = makeFit(line(300).map((p, i) => ({ ...p, lat: p.lat + Math.sin(i / 7) * 0.0003 })));
  const a = JSON.stringify(buildTrack(bytes, '9').feature);
  const b = JSON.stringify(buildTrack(Buffer.from(bytes), '9').feature);
  assert.equal(a, b);
});

test('over 5,000 surviving points the tolerance grows by 1.5 until 5,000 or fewer remain', () => {
  // A zig-zag of about 22 m amplitude, so every point survives a 5 m tolerance.
  const n = 5_600;
  const points = Array.from({ length: n }, (_, i) => ({
    lat: 45.0 + (i % 2 ? 0.0002 : 0),
    lon: -100.0 + i * 0.00001,
    ms: T0 + i * 1000,
  }));
  const built = buildTrack(makeFit(points), '1');
  assert.ok(built.points <= MAX_POINTS, `kept ${built.points}`);
  const { tolerance_m: tolerance } = built.feature.properties.simplify;
  assert.ok(tolerance > BASE_TOLERANCE_M);
  const steps = Math.log(tolerance / BASE_TOLERANCE_M) / Math.log(1.5);
  assert.ok(Math.abs(steps - Math.round(steps)) < 0.01, 'tolerance is 5 x 1.5^k');
  assert.equal(built.feature.properties.points_in, n);
  // The first and last point are always kept.
  const { coordinates } = built.feature.geometry;
  assert.deepEqual(coordinates[0], [-100, 45]);
});

test('t is whole seconds, ascending, one per coordinate', () => {
  const built = buildTrack(makeFit(line(50).map((p, i) => ({ ...p, lat: p.lat + (i % 2) * 0.001 }))), '1');
  const { t } = built.feature.properties;
  assert.equal(t.length, built.feature.geometry.coordinates.length);
  assert.equal(t[0], 0);
  assert.ok(t.every((v, i) => Number.isInteger(v) && (i === 0 || v > t[i - 1])));
});

test('simplifyIndices agrees with the recursive form on a known shape', () => {
  // An L: the corner is the only interior point that matters.
  const pts = [[0, 0], [0, 0.0005], [0, 0.001], [0.0005, 0.001], [0.001, 0.001]].map(([la, lo]) => ({ lat: 45 + la, lon: -100 + lo }));
  assert.deepEqual(simplifyIndices(pts, 5), [0, 2, 4]);
});

test('bytes that are not a FIT are unreadable, with a message that quotes nothing', () => {
  for (const bytes of [Buffer.from('not a fit file at all'), Buffer.alloc(0), makeFit(line(5)).subarray(0, 40)]) {
    assert.throws(() => buildTrack(bytes, '1'), (err) => {
      assert.ok(err instanceof TrackUnreadableError);
      assert.equal(err.message, 'the FIT could not be decoded');
      return true;
    });
  }
});
