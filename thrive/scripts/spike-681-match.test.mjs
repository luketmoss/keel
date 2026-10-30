// Tests for the #681 matching rules, on synthetic tracks and trails.
//
// Everything is laid out in metres on a plane around 0°, 0° and converted to
// degrees, so no real place appears here. Run: node --test spike-681-*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchActivity, score, comboKey } from './spike-681-match.mjs';

const R = 6_371_008.8;
const toDeg = (m) => (m / R) * (180 / Math.PI);
const ll = ([x, y]) => ({ lon: toDeg(x), lat: toDeg(y) });

/** A stored-track Feature through `vertices` (metres), at `speed` m/s, climbing `grade`. */
function track(vertices, { speed = 4, grade = 0 } = {}) {
  let cum = 0;
  const t = [0];
  const ele = [1000];
  for (let i = 1; i < vertices.length; i++) {
    const d = Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1]);
    cum += d;
    t.push(Math.round(cum / speed));
    ele.push(1000 + cum * grade);
  }
  return {
    type: 'Feature',
    properties: { format: 'thrive-track', start_utc: '2000-01-01T00:00:00.000Z', t, ele },
    geometry: { type: 'LineString', coordinates: vertices.map((v) => [ll(v).lon, ll(v).lat]) },
  };
}

const way = (name, vertices, highway = 'path') => ({
  type: 'way',
  tags: { name, highway },
  geometry: vertices.map(ll),
});

const route = (name, members) => ({
  type: 'relation',
  tags: { name, route: 'mtb' },
  members: members.map((vertices) => ({ type: 'way', geometry: vertices.map(ll) })),
});

const run = (feature, elements, buffer = 20, heading = 45) => {
  const result = matchActivity(feature, elements, { buffers: [buffer], headings: [heading] });
  return result.combos[0];
};
const passes = (combo) => combo.sequence.filter((s) => !s.gap);

test('rides a trail end to end: one forward pass, 0→100%, full share', () => {
  const combo = run(track([[0, 0], [1000, 0]]), [way('A', [[0, 0], [1000, 0]])]);
  const [p] = passes(combo);
  assert.equal(passes(combo).length, 1);
  assert.equal(p.trail, 'A');
  assert.equal(p.direction, 'forward');
  assert.ok(p.startPct < 1 && p.endPct > 99, `${p.startPct}→${p.endPct}`);
  assert.ok(p.share > 0.99);
  assert.ok(Math.abs(p.metres - 1000) < 1);
  assert.equal(p.durationS, 250);
  assert.equal(p.entry, '2000-01-01T00:00:00.000Z');
});

test('records climb and position along the trail for a part ridden in reverse', () => {
  // The trail runs 0→1000 m; the track rides it from 800 m back to 200 m.
  const combo = run(track([[800, 3], [200, 3]], { grade: 0.05 }), [way('A', [[0, 0], [1000, 0]])]);
  const [p] = passes(combo);
  assert.equal(p.direction, 'reverse');
  assert.ok(Math.abs(p.startPct - 80) < 1 && Math.abs(p.endPct - 20) < 1, `${p.startPct}→${p.endPct}`);
  assert.ok(Math.abs(p.share - 0.6) < 0.01);
  assert.ok(Math.abs(p.climbM - 30) < 0.5, `climb ${p.climbM}`);
});

test('nearest trail only: a parallel trail 12 m away gets no pass', () => {
  const elements = [way('Near', [[0, 2], [1000, 2]]), way('Parallel', [[0, 14], [1000, 14]])];
  const combo = run(track([[0, 0], [1000, 0]]), elements, 25);
  assert.deepEqual(combo.trailsFound, ['Near']);
  assert.ok(Math.abs(combo.matchedM - 1000) < 1, 'no metre is counted twice');
});

test('nearest trail only: riding between two trails splits by which is nearer, never both', () => {
  // The track drifts from 3 m off A to 3 m off B, which run 10 m apart.
  const elements = [way('A', [[0, 0], [1000, 0]]), way('B', [[0, 10], [1000, 10]])];
  const combo = run(track([[0, 3], [500, 3], [520, 7], [1000, 7]]), elements, 25);
  const ps = passes(combo);
  assert.deepEqual(ps.map((p) => p.trail), ['A', 'B']);
  assert.ok(ps[0].toIndex < ps[1].fromIndex, 'the passes do not overlap');
  assert.ok(combo.matchedM <= 1000 + 1);
});

test('crossing a trail at an angle produces no pass on it', () => {
  const elements = [way('Ridden', [[0, 0], [1000, 0]]), way('Crossed', [[500, -500], [500, 500]])];
  const combo = run(track([[0, 0], [1000, 0]]), elements);
  assert.deepEqual(combo.trailsFound, ['Ridden']);
  assert.equal(passes(combo).length, 1, 'the crossing does not split the pass either');
});

test('cutting straight across a lone trail produces no pass', () => {
  const combo = run(track([[0, -300], [0, 300]]), [way('Crossed', [[-500, 0], [500, 0]])]);
  assert.equal(passes(combo).length, 0);
  assert.ok(Math.abs(combo.unmatchedM - 600) < 1);
});

test('crossing a short trail at 60° produces no pass, though the crossing spans over half of it', () => {
  // At 25 m the crossing covers ~29 m of a 40 m trail's length: the coverage rule alone would pass it.
  const angle = (60 * Math.PI) / 180;
  const at = (s) => [20 + s * Math.cos(angle), s * Math.sin(angle)];
  const combo = run(track([at(-200), at(200)]), [way('Short', [[0, 0], [40, 0]])], 25, 45);
  assert.equal(passes(combo).length, 0);
});

test('the heading tolerance decides a diagonal: 40° off counts at 45° but not at 30°', () => {
  const angle = (40 * Math.PI) / 180;
  const end = [600 * Math.cos(angle), 600 * Math.sin(angle)];
  const feature = track([[0, 0], end]);
  const trail = [way('A', [[0, 0], [1000, 0]])];
  const loose = matchActivity(feature, trail, { buffers: [1000], headings: [45, 30] });
  assert.deepEqual(loose.combos.map((c) => c.trailsFound.length), [1, 0]);
});

test('out and back on one trail is two passes in opposite directions', () => {
  const combo = run(track([[0, 0], [800, 0], [0, 0]]), [way('A', [[0, 0], [1000, 0]])]);
  const ps = passes(combo);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps.map((p) => p.trail), ['A', 'A']);
  assert.deepEqual(ps.map((p) => p.direction), ['forward', 'reverse']);
  assert.ok(ps[0].endPct > 75 && ps[1].startPct > 75);
});

test('a short connector ridden end to end counts; a brush past one does not', () => {
  // A (0→600 m along y=0), connector C (120 m, north), then D (along y=120).
  const elements = [
    way('A', [[0, 0], [600, 0]]),
    way('C', [[600, 0], [600, 120]]),
    way('D', [[600, 120], [1200, 120]]),
  ];
  const combo = run(track([[0, 0], [600, 0], [600, 120], [1200, 120]]), elements);
  const ps = passes(combo);
  assert.deepEqual(ps.map((p) => p.trail), ['A', 'C', 'D']);
  const c = ps[1];
  assert.ok(c.metres < 200 && c.share >= 0.5, `${c.metres} m, ${c.share}`);
  assert.ok(c.startPct < 15 && c.endPct > 85, `${c.startPct}→${c.endPct}`);

  // 60 m along the first 120 m of a 1 km trail: under 200 m and under 50%.
  const brush = run(track([[0, 0], [60, 0], [60, 300]]), [way('Long', [[0, 0], [1000, 0]])]);
  assert.equal(passes(brush).length, 0);
});

test('ways with the same name are one trail, with positions running across both', () => {
  const elements = [way('A', [[500, 0], [1000, 0]]), way('A', [[500, 0], [0, 0]])];
  const combo = run(track([[0, 0], [1000, 0]]), elements);
  const ps = passes(combo);
  assert.equal(ps.length, 1);
  assert.ok(ps[0].share > 0.99);
  assert.ok(Math.abs(ps[0].trailLengthM - 1000) < 1);
});

test('a short gap under 50 m is bridged; a longer one ends the pass', () => {
  // Off the trail and back twice, measured along the track: about 41 m, then about 240 m.
  const t = track([[0, 0], [400, 0], [410, 18], [420, 0], [700, 0], [700, 100], [740, 100], [740, 0], [1000, 0]]);
  const ps = passes(run(t, [way('A', [[0, 0], [1000, 0]])], 15));
  assert.equal(ps.length, 2, ps.map((p) => `${p.startPct}→${p.endPct}`).join(', '));
});

test('a route relation is reported alongside its member trail, not instead of it', () => {
  const geometry = [[0, 0], [1000, 0]];
  const combo = run(track(geometry), [way('Member', geometry), route('The Route', [geometry])]);
  assert.deepEqual(combo.trailsFound, ['Member']);
  assert.deepEqual(combo.routePasses.map((p) => p.trail), ['The Route']);
});

test('the sequence shows passes and unmatched gaps in order', () => {
  const combo = run(track([[0, 0], [300, 0], [300, 400], [900, 400]]), [way('B', [[300, 400], [900, 400]])]);
  assert.deepEqual(combo.sequence.map((s) => (s.gap ? 'gap' : s.trail)), ['gap', 'B']);
  const total = combo.sequence.reduce((sum, s) => sum + s.metres, 0);
  assert.ok(Math.abs(total - 1300) < 15, `${total}`);
});

test('unnamed ways, roads and unknown route kinds are ignored', () => {
  const geometry = [[0, 0], [1000, 0]];
  const elements = [
    { type: 'way', tags: { highway: 'path' }, geometry: geometry.map(ll) },
    way('Main Street', geometry, 'residential'),
    { type: 'relation', tags: { name: 'Bus 1', route: 'bus' }, members: [{ type: 'way', geometry: geometry.map(ll) }] },
  ];
  const result = matchActivity(track(geometry), elements, { buffers: [20], headings: [45] });
  assert.equal(result.trailCount, 0);
  assert.equal(result.routeCount, 0);
});

test('score: precision from marks, recall against trails ridden, by combination and type', () => {
  const combos = [
    { bufferM: 15, headingDeg: 30, trailsFound: ['A'] },
    { bufferM: 25, headingDeg: 45, trailsFound: ['A', 'X', 'Q'] },
  ];
  const activities = [{ id: 'w1', type: 'bike', combos }];
  const marks = { w1: { trails: { A: true, X: false, Q: null }, missed: ['M'] } };
  const rows = score(activities, marks);
  const tight = rows.find((r) => r.combo === comboKey(combos[0]) && r.group === 'all');
  const wide = rows.find((r) => r.combo === comboKey(combos[1]) && r.group === 'bike');
  assert.equal(tight.precision, 1);
  assert.equal(tight.recall, 0.5);
  assert.equal(wide.precision, 0.5);
  assert.equal(wide.unmarked, 1);
  assert.equal(wide.recall, 0.5);
});
