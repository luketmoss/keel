// #688: the matcher, ported from scripts/spike-681-match.test.mjs and run at
// the values #681 chose, 20 m and 30°. Synthetic geometry around 0°, 0°.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUFFER_M, HEADING_TOLERANCE_DEG, matchTrails, TRAILS_MATCHER_VERSION,
} from '../src/trail-match.mjs';
import { track, way } from './trail-geometry.mjs';

const passes = (feature, elements) => matchTrails(feature, elements).passes;
const matched = (ps) => ps.reduce((sum, p) => sum + p.metres, 0);

test('the matcher runs at 20 m and 30°, version 1', () => {
  assert.equal(BUFFER_M, 20);
  assert.equal(HEADING_TOLERANCE_DEG, 30);
  assert.equal(TRAILS_MATCHER_VERSION, 1);
});

test('rides a trail end to end: one forward pass, 0→100%, full share', () => {
  const [p, ...rest] = passes(track([[0, 0], [1000, 0]]), [way('Alder Path', [[0, 0], [1000, 0]])]);
  assert.equal(rest.length, 0);
  assert.equal(p.trail, 'Alder Path');
  assert.equal(p.direction, 'forward');
  assert.ok(p.startPct < 1 && p.endPct > 99, `${p.startPct}→${p.endPct}`);
  assert.ok(Math.abs(p.metres - 1000) < 1);
  assert.equal(p.durationS, 250);
  assert.equal(p.entryOffsetS, 0);
});

test('an out-and-back gives two passes in opposite directions', () => {
  const ps = passes(track([[0, 0], [800, 0], [0, 0]]), [way('Alder Path', [[0, 0], [1000, 0]])]);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps.map((p) => p.trail), ['Alder Path', 'Alder Path']);
  assert.deepEqual(ps.map((p) => p.direction), ['forward', 'reverse']);
  assert.ok(ps[0].endPct > 75 && ps[1].startPct > 75);
});

test('side-by-side trails take each point once, for the nearer trail', () => {
  const near = [way('Near Path', [[0, 2], [1000, 2]]), way('Far Path', [[0, 14], [1000, 14]])];
  const ps = passes(track([[0, 0], [1000, 0]]), near);
  assert.deepEqual(ps.map((p) => p.trail), ['Near Path']);
  assert.ok(Math.abs(matched(ps) - 1000) < 1, 'no metre is counted twice');

  // Drifting from 3 m off one to 3 m off the other splits by which is nearer, never both.
  const split = passes(track([[0, 3], [500, 3], [520, 7], [1000, 7]]),
    [way('South Path', [[0, 0], [1000, 0]]), way('North Path', [[0, 10], [1000, 10]])]);
  assert.deepEqual(split.map((p) => p.trail), ['South Path', 'North Path']);
  assert.ok(split[0].toIndex < split[1].fromIndex, 'the passes do not overlap');
  assert.ok(matched(split) <= 1001);
});

test('crossing a trail gives no pass', () => {
  const ps = passes(track([[0, 0], [1000, 0]]),
    [way('Ridden Path', [[0, 0], [1000, 0]]), way('Crossed Path', [[500, -500], [500, 500]])]);
  assert.deepEqual(ps.map((p) => p.trail), ['Ridden Path']);

  assert.equal(passes(track([[0, -300], [0, 300]]), [way('Crossed Path', [[-500, 0], [500, 0]])]).length, 0);

  // At 60° the crossing spans over half a 40 m trail: the coverage rule alone would keep it.
  const angle = (60 * Math.PI) / 180;
  const at = (s) => [20 + s * Math.cos(angle), s * Math.sin(angle)];
  assert.equal(passes(track([at(-200), at(200)]), [way('Short Path', [[0, 0], [40, 0]])]).length, 0);
});

test('a 25° diagonal is ridden, a 35° one is not (the 30° tolerance)', () => {
  const along = (deg) => {
    const a = (deg * Math.PI) / 180;
    return track([[-150 * Math.cos(a), -150 * Math.sin(a)], [150 * Math.cos(a), 150 * Math.sin(a)]]);
  };
  const trail = [way('Level Path', [[-40, 0], [40, 0]])];
  assert.equal(passes(along(25), trail).length, 1);
  assert.equal(passes(along(35), trail).length, 0);
});

test('a short connector ridden end to end is kept', () => {
  const elements = [
    way('Alder Path', [[0, 0], [600, 0]]),
    way('Birch Link', [[600, 0], [600, 120]]),
    way('Cedar Path', [[600, 120], [1200, 120]]),
  ];
  const ps = passes(track([[0, 0], [600, 0], [600, 120], [1200, 120]]), elements);
  assert.deepEqual(ps.map((p) => p.trail), ['Alder Path', 'Birch Link', 'Cedar Path']);
  const c = ps[1];
  assert.ok(c.metres < 200 && c.share >= 0.5, `${c.metres} m, ${c.share}`);
  assert.ok(c.startPct < 15 && c.endPct > 85, `${c.startPct}→${c.endPct}`);
});

test('a gap under 50 m is bridged, and a longer one ends the pass', () => {
  // Off the trail and back twice, measured along the track: about 41 m, then about 240 m.
  const t = track([[0, 0], [400, 0], [410, 18], [420, 0], [700, 0], [700, 100], [740, 100], [740, 0], [1000, 0]]);
  const ps = passes(t, [way('Alder Path', [[0, 0], [1000, 0]])]);
  assert.equal(ps.length, 2, ps.map((p) => `${p.startPct}→${p.endPct}`).join(', '));
});

test('a 60 m pass on a 1 km trail is left out', () => {
  // Under 200 m and under 50% of the trail.
  assert.equal(passes(track([[0, 0], [60, 0], [60, 300]]), [way('Long Path', [[0, 0], [1000, 0]])]).length, 0);
});

test('ways with the same name are one trail, with positions running across both', () => {
  const ps = passes(track([[0, 0], [1000, 0]]),
    [way('Alder Path', [[500, 0], [1000, 0]]), way('Alder Path', [[500, 0], [0, 0]])]);
  assert.equal(ps.length, 1);
  assert.ok(ps[0].share > 0.99);
  assert.ok(Math.abs(ps[0].trailLengthM - 1000) < 1);
});

test('unnamed ways, roads and relations are ignored', () => {
  const g = [[0, 0], [1000, 0]];
  const elements = [
    { type: 'way', tags: { highway: 'path' }, geometry: way('x', g).geometry },
    way('Invented Street', g, 'residential'),
    { type: 'relation', tags: { name: 'Invented Route', route: 'mtb' }, members: [{ type: 'way', geometry: way('x', g).geometry }] },
  ];
  const r = matchTrails(track(g), elements);
  assert.deepEqual(r.passes, []);
  assert.ok(Math.abs(r.totalM - 1000) < 1);
});
