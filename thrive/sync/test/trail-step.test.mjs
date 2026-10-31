// #688: the trail step, its encoder and its Overpass client. Fake fetch, fake
// API, fake archive, no network. Synthetic geometry around 0°, 0°, invented
// trail names, the placeholder date 2000-01-01.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DriveError } from '../src/drive.mjs';
import { DriveAuthError } from '../src/errors.mjs';
import {
  ATTEMPT_TIMEOUT_MS, createOverpass, DEFAULT_OVERPASS_URL, OverpassError, paddedBox, trailQuery,
} from '../src/overpass.mjs';
import { MAX_ENCODED_PAYLOAD, ThriveApiError } from '../src/thrive-api.mjs';
import { matchTrails, TRAILS_MATCHER_VERSION } from '../src/trail-match.mjs';
import {
  createTrailStep, encodedPayloadSize, encodeTrails, fitTrails, trailSummary,
} from '../src/trail-step.mjs';
import { TRACK_VERSION } from '../src/track.mjs';
import { GOLDEN, GOLDEN_ELEMENTS, GOLDEN_FEATURE, track, way } from './trail-geometry.mjs';

/** Words no note or log line may contain: a trail name or an Overpass body. */
const CANARIES = ['Heron', 'Aspen', 'Kestrel', 'Alder', 'runtime error', 'out geom', '0.000'];
const assertClean = (lines) => {
  for (const line of lines) for (const c of CANARIES) assert.ok(!line.includes(c), `"${c}" leaked: ${line}`);
};

// --- Encoder -----------------------------------------------------------------

test('golden: a synthetic activity encodes to the committed string exactly', () => {
  const value = encodeTrails(matchTrails(GOLDEN_FEATURE, GOLDEN_ELEMENTS));
  assert.equal(JSON.stringify(value), GOLDEN);
  // What the golden string pins: names in order of first pass, passes in time
  // order (the null entries by track order), Math.round, d, and the nulls.
  const parsed = JSON.parse(GOLDEN);
  assert.deepEqual(Object.keys(parsed), ['v', 'm', 'u', 'n', 'p']);
  assert.deepEqual(parsed.n.map((n) => n[0]), ['Heron Ridge Trail', 'Aspen Draw;Kestrel Connector', 'Lower Heron']);
  assert.deepEqual(parsed.p.map((p) => p[3]), [1, 1, -1, -1, 1]);
  assert.deepEqual(parsed.p[3].slice(1, 3), [100, 41], '99.5 and 40.5 round up');
  assert.deepEqual(parsed.p[1].slice(5), [35, null, 326], 'no ele: climb is null');
  assert.deepEqual(parsed.p[2].slice(5), [null, null, null], 'no t: duration and entry are null');
});

test('no named way, or no pass meeting the coverage rule, encodes to an empty tagged value', () => {
  const ride = track([[0, 0], [1000, 0]]);
  assert.equal(JSON.stringify(encodeTrails(matchTrails(ride, []))), '{"v":1,"m":1,"u":1000,"n":[],"p":[]}');
  // A 60 m brush on a 1 km trail: a way, but no kept pass.
  const brush = track([[0, 0], [60, 0], [60, 300]]);
  assert.equal(
    JSON.stringify(encodeTrails(matchTrails(brush, [way('Alder Path', [[0, 0], [1000, 0]])]))),
    '{"v":1,"m":1,"u":360,"n":[],"p":[]}',
  );
});

/** A match result with `count` passes over `trails` names of `nameLength` characters. */
function syntheticMatch(count, trails, { nameLength = 30, metres = (i) => 300 + i } = {}) {
  const names = Array.from({ length: trails }, (_, k) => `Trail ${String(k).padStart(2, '0')} `.padEnd(nameLength, 'x'));
  const passes = Array.from({ length: count }, (_, i) => ({
    trail: names[i % trails], trailLengthM: 1234, fromIndex: i * 10, metres: metres(i),
    durationS: 123, climbM: 45, entryOffsetS: i * 60, startM: 0, endM: 1, startPct: 0, endPct: 100,
  }));
  return { totalM: 100_000, passes };
}

test('40 passes on 15 trails with 30-character names are written whole, with no x', () => {
  const value = encodeTrails(syntheticMatch(40, 15));
  const fitted = fitTrails(value, 'w_00000001');
  assert.equal(fitted.omitted, 0);
  assert.equal(fitted.text, JSON.stringify(value));
  assert.equal(JSON.parse(fitted.text).x, undefined);
  assert.equal(JSON.parse(fitted.text).p.length, 40);
});

test('overflow: shortest passes left out first (ties: the later first), the rest in time order, names renumbered', () => {
  // Pass i is 300 + i metres, except a tie: 0 and 1 are both the shortest.
  const value = encodeTrails(syntheticMatch(150, 60, { metres: (i) => (i < 2 ? 200 : 300 + i) }));
  assert.ok(encodedPayloadSize('w_00000001', JSON.stringify(value)) > MAX_ENCODED_PAYLOAD);
  const fitted = fitTrails(value, 'w_00000001');
  const out = JSON.parse(fitted.text);

  assert.ok(encodedPayloadSize('w_00000001', fitted.text) <= MAX_ENCODED_PAYLOAD);
  assert.ok(fitted.omitted > 2);
  assert.equal(out.x, fitted.omitted);
  assert.equal(out.p.length, 150 - fitted.omitted);
  assert.equal(out.u, value.u, 'u is the full value\'s');
  // The two 200 m passes went first, then 302, 303, ...: what is left is the longest, in time order.
  const offsets = out.p.map((p) => p[7]);
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
  const keptMetres = out.p.map((p) => p[4]);
  assert.ok(Math.min(...keptMetres) > 300 + fitted.omitted - 1);
  // Every name is used, once each, and indices are in range.
  const used = new Set(out.p.map((p) => p[0]));
  assert.equal(used.size, out.n.length);
  assert.deepEqual([...used].sort((a, b) => a - b), out.n.map((_, i) => i));
  assert.deepEqual(Object.keys(out), ['v', 'm', 'u', 'n', 'p', 'x']);
});

test('overflow ties: between equal metres the later pass is left out first', () => {
  const value = encodeTrails(syntheticMatch(150, 60, { metres: () => 500 }));
  const out = JSON.parse(fitTrails(value, 'w_00000001').text);
  // All equal: the earliest passes are the ones kept.
  assert.deepEqual(out.p.map((p) => p[7]), Array.from({ length: out.p.length }, (_, i) => i * 60));
});

// --- Overpass client ---------------------------------------------------------

/** A fetch answering from `responses` in order; an Error rejects; 'hang' waits for the abort. */
function overpassFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init, query: new URLSearchParams(init.body).get('data') });
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next === 'hang') {
      return new Promise((_, reject) => {
        if (init.signal.aborted) reject(new Error('aborted'));
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    if (next instanceof Error) throw next;
    const { status = 200, body = { elements: [] } } = next;
    return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return { fetchImpl, calls };
}

const fakeWait = () => {
  const waits = [];
  return { waits, wait: async (ms) => { waits.push(ms); } };
};

test('one POST to the default URL with a keel-thrive-sync User-Agent, asking only for named trail ways in the padded box', async () => {
  const { fetchImpl, calls } = overpassFetch([{ body: { elements: [] } }]);
  const client = createOverpass({ fetchImpl, ...fakeWait() });
  const { box } = paddedBox(track([[0, 0], [1000, 0]]));
  assert.deepEqual(await client.lookup(box), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DEFAULT_OVERPASS_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.headers['User-Agent'], /keel-thrive-sync/);
  assert.match(calls[0].init.headers['User-Agent'], /github\.com\/luketmoss\/keel/);
  const q = calls[0].query;
  assert.equal(q, trailQuery(box));
  assert.match(q, /^\[out:json\]\[timeout:40\];way\["highway"~"\^\(path\|track\|footway\|bridleway\|cycleway\)\$"\]\["name"\]\(/);
  assert.match(q, /out geom;$/);
  assert.doesNotMatch(q, /relation/);
});

test('the box is the track\'s, padded by 50 m on every side', () => {
  const { box, widthKm, heightKm } = paddedBox(track([[0, 0], [1000, 0]]));
  const m = (deg) => (deg * Math.PI / 180) * 6_371_008.8;
  assert.ok(Math.abs(m(box.n) - 50) < 0.01 && Math.abs(m(box.s) + 50) < 0.01);
  assert.ok(Math.abs(m(box.w) + 50) < 0.01 && Math.abs(m(box.e) - 1050) < 0.01);
  assert.ok(Math.abs(widthKm - 1.1) < 0.001 && Math.abs(heightKm - 0.1) < 0.001);
  const [s, w, n, e] = trailQuery(box).match(/\(([^)]*)\);out/)[1].split(',').map(Number);
  assert.ok(s < 0 && w < 0 && n > 0 && e > 0);
});

const FAILURES = [
  { name: 'no response within 45 s', response: 'hang', reason: 'no response', attempts: 3 },
  { name: 'a network error', response: new Error('socket hang up'), reason: 'no response', attempts: 3 },
  { name: 'HTTP 429', response: { status: 429, body: 'rate limited' }, reason: 'HTTP 429', attempts: 3 },
  { name: 'HTTP 502', response: { status: 502, body: '<html>' }, reason: 'HTTP 502', attempts: 3 },
  { name: 'HTTP 503', response: { status: 503, body: '<html>' }, reason: 'HTTP 503', attempts: 3 },
  { name: 'HTTP 504', response: { status: 504, body: '<html>' }, reason: 'HTTP 504', attempts: 3 },
  { name: 'a 200 with a remark', response: { body: { elements: [], remark: 'runtime error: out geom (0.000,0.000)' } }, reason: 'partial result', attempts: 3 },
  { name: 'a body that is not JSON', response: { body: '<html>runtime error</html>' }, reason: 'unreadable response', attempts: 1 },
  { name: 'a body with no elements', response: { body: { version: 0.6 } }, reason: 'unreadable response', attempts: 1 },
  { name: 'HTTP 400', response: { status: 400, body: 'runtime error: out geom (0.000,0.000)' }, reason: 'HTTP 400', attempts: 1 },
];

for (const f of FAILURES) {
  test(`client: ${f.name} fails as "${f.reason}" after ${f.attempts} attempt(s), with fixed text`, async () => {
    const { fetchImpl, calls } = overpassFetch([f.response]);
    const { waits, wait } = fakeWait();
    const timers = [];
    const startTimer = (ms, fire) => {
      timers.push(ms);
      queueMicrotask(fire);
      return () => {};
    };
    const client = createOverpass({ fetchImpl, wait, startTimer });
    const err = await client.lookup(paddedBox(track([[0, 0], [100, 0]])).box).catch((e) => e);
    assert.ok(err instanceof OverpassError);
    assert.equal(err.reason, f.reason);
    assert.equal(err.message, `the OpenStreetMap lookup failed (${f.reason})`);
    assert.equal(calls.length, f.attempts);
    assert.deepEqual(waits, [10_000, 30_000].slice(0, f.attempts - 1));
    assert.ok(timers.every((ms) => ms === ATTEMPT_TIMEOUT_MS) && ATTEMPT_TIMEOUT_MS === 45_000);
  });
}

test('client: a retry that then succeeds answers the elements', async () => {
  const { fetchImpl, calls } = overpassFetch([{ status: 504, body: '' }, { body: { elements: GOLDEN_ELEMENTS } }]);
  const client = createOverpass({ fetchImpl, ...fakeWait() });
  assert.equal((await client.lookup(paddedBox(GOLDEN_FEATURE).box)).length, 3);
  assert.equal(calls.length, 2);
});

// --- The step ------------------------------------------------------------------

const STARTED = '2000-01-02T13:00:00.000Z';
const FIT_AT = '2000-01-01T14:00:00.000Z';
const trackRecord = (over = {}) => ({ status: 'stored', file_id: 'trk-1', fit_fetched_at: FIT_AT, version: TRACK_VERSION, ...over });

/** The archive's trails methods, recorded. `features` holds the stored tracks by Drive id. */
function fakeArchive({ features = { 'trk-1': GOLDEN_FEATURE }, readError, writeError } = {}) {
  const calls = [];
  return {
    calls,
    records: [],
    async readTrack(id) {
      calls.push(['readTrack', id]);
      if (readError) throw readError;
      return JSON.parse(JSON.stringify(features[id]));
    },
    async writeTrails(fileId, trails) {
      calls.push(['writeTrails', fileId]);
      if (writeError) throw writeError;
      this.records.push(trails);
    },
  };
}

function fakeApi({ refuse } = {}) {
  const calls = [];
  return {
    calls,
    async updateWorkout(payload) {
      calls.push(payload);
      if (refuse) throw refuse;
      return { id: payload.id };
    },
  };
}

/** An Overpass stand-in on an injected clock: each lookup takes `takesMs`. */
function fakeOverpass(clock, { elements = GOLDEN_ELEMENTS, fail, takesMs = 1000 } = {}) {
  const starts = [];
  return {
    starts,
    async lookup() {
      starts.push(clock.t);
      clock.t += takesMs;
      if (fail) throw fail;
      return JSON.parse(JSON.stringify(elements));
    },
  };
}

const makeClock = () => {
  const clock = { t: 0, waits: [] };
  clock.now = () => clock.t;
  clock.wait = async (ms) => { clock.waits.push(ms); clock.t += ms; };
  return clock;
};

function step({ archive = fakeArchive(), api = fakeApi(), clock = makeClock(), overpass, ...over } = {}) {
  const lines = [];
  const op = overpass ?? fakeOverpass(clock);
  const s = createTrailStep({
    archive, api, startedAt: STARTED, now: clock.now, wait: clock.wait, overpass: op, log: (l) => lines.push(l), ...over,
  });
  return { s, archive, api, clock, overpass: op, lines };
}

const activity = (over = {}) => ({
  activityId: '700000000000000001', fileId: 'act-1', rowId: 'w_00000001', track: trackRecord(), record: undefined, ...over,
});

test('tags an activity: one lookup, updateWorkout with the row id and the encoded value, then records it settled', async () => {
  const t = step();
  await t.s.ensure(activity());
  assert.equal(t.overpass.starts.length, 1);
  assert.deepEqual(t.api.calls, [{ id: 'w_00000001', changes: { trails: GOLDEN } }]);
  assert.deepEqual(t.archive.records, [{
    status: 'tagged', matcher_version: TRAILS_MATCHER_VERSION, fit_fetched_at: FIT_AT, track_version: TRACK_VERSION,
    at: STARTED, passes: 5, omitted: 0,
  }]);
  assert.deepEqual(t.s.counts, { tagged: 1, noTrail: 0, tooLarge: 0, failed: 0, deferred: 0 });
  assert.deepEqual(t.s.notes(), []);
  assertClean(t.lines);
});

test('the track this run built is used from memory, with no Drive read', async () => {
  const t = step({ featureFor: () => GOLDEN_FEATURE });
  await t.s.ensure(activity());
  assert.ok(!t.archive.calls.some((c) => c[0] === 'readTrack'));
  assert.equal(t.api.calls.length, 1);
});

test('no track, or no stored one, is not looked up', async () => {
  const t = step();
  await t.s.ensure(activity({ track: undefined }));
  await t.s.ensure(activity({ track: trackRecord({ status: 'none', file_id: undefined }) }));
  assert.equal(t.overpass.starts.length, 0);
  assert.deepEqual(t.archive.calls, []);
});

test('settled: a second run over the same track and matcher makes no request and no write', async () => {
  const first = step();
  await first.s.ensure(activity());
  const record = first.archive.records[0];
  const second = step();
  await second.s.ensure(activity({ record }));
  assert.equal(second.overpass.starts.length, 0);
  assert.deepEqual(second.api.calls, []);
  assert.deepEqual(second.archive.calls, []);
});

test('settled: a rebuilt track (new fit_fetched_at or TRACK_VERSION) or a raised matcher version re-tags once', async () => {
  const first = step();
  await first.s.ensure(activity());
  const record = first.archive.records[0];
  const cases = [
    activity({ record, track: trackRecord({ fit_fetched_at: '2000-01-01T15:00:00.000Z' }) }),
    activity({ record, track: trackRecord({ version: TRACK_VERSION + 1 }) }),
    // The record was made by the matcher before this one.
    activity({ record: { ...record, matcher_version: TRAILS_MATCHER_VERSION - 1 } }),
  ];
  for (const a of cases) {
    const t = step();
    await t.s.ensure(a);
    assert.equal(t.overpass.starts.length, 1);
    assert.equal(t.api.calls.length, 1);
    const again = step();
    await again.s.ensure({ ...a, record: t.archive.records[0] });
    assert.equal(again.overpass.starts.length, 0, 'and only once');
  }
});

test('a failed lookup never writes: no trails sent, nothing settled, and the next run looks again', async () => {
  for (const f of FAILURES) {
    const { fetchImpl } = overpassFetch([f.response]);
    const startTimer = (ms, fire) => { queueMicrotask(fire); return () => {}; };
    const clock = makeClock();
    const overpass = createOverpass({ fetchImpl, wait: clock.wait, startTimer });
    // Previously tagged by an older matcher: AD holds a value, and it must keep it.
    const previous = { status: 'tagged', matcher_version: 0, fit_fetched_at: FIT_AT, track_version: TRACK_VERSION };
    const t = step({ clock, overpass });
    await t.s.ensure(activity({ record: previous }));
    assert.deepEqual(t.api.calls, [], f.name);
    assert.ok(!t.archive.calls.some((c) => c[0] === 'writeTrails'), f.name);
    assert.equal(t.s.counts.failed, 1);
    assert.deepEqual(t.s.notes(), [
      `trails 700000000000000001: not tagged, the OpenStreetMap lookup failed (${f.reason}); a later run retries`,
    ]);
    assertClean([...t.s.notes(), ...t.lines]);

    const next = step();
    await next.s.ensure(activity({ record: previous }));
    assert.equal(next.overpass.starts.length, 1, `${f.name}: the next run looks it up again`);
  }
});

test('run budget: 7 eligible activities, 5 looked up, at least 5 s apart; the rest deferred, not failed', async () => {
  const t = step();
  for (let i = 1; i <= 7; i++) await t.s.ensure(activity({ activityId: `70000000000000000${i}`, rowId: `w_0000000${i}` }));
  assert.equal(t.overpass.starts.length, 5);
  const gaps = t.overpass.starts.slice(1).map((s, i) => s - t.overpass.starts[i]);
  assert.ok(gaps.every((g) => g >= 5000), gaps.join(','));
  assert.equal(t.api.calls.length, 5);
  assert.deepEqual(t.api.calls.map((c) => c.id), ['w_00000001', 'w_00000002', 'w_00000003', 'w_00000004', 'w_00000005']);
  assert.equal(t.s.counts.deferred, 2);
  assert.equal(t.s.counts.failed, 0);
  assert.deepEqual(t.s.notes(), ['trails: 2 activities not looked up this run (the per-run limit); a later run retries']);
});

test('run budget: no lookup starts once 3 minutes have passed since the first request', async () => {
  const clock = makeClock();
  const t = step({ clock, overpass: fakeOverpass(clock, { takesMs: 70_000 }) });
  for (let i = 1; i <= 5; i++) await t.s.ensure(activity({ activityId: `70000000000000000${i}`, rowId: `w_0000000${i}` }));
  // 0 → 70 s, 75 → 145 s, 150 → 220 s; at 225 s the window is spent.
  assert.deepEqual(t.overpass.starts, [0, 75_000, 150_000]);
  assert.ok(t.overpass.starts.every((s) => s < 180_000));
  assert.equal(t.s.counts.deferred, 2);
  assert.equal(t.api.calls.length, 3);
  assert.deepEqual(t.s.notes(), ['trails: 2 activities not looked up this run (the time limit); a later run retries']);
});

test('run budget: after one lookup fails all its attempts, the rest are not looked up', async () => {
  const clock = makeClock();
  const t = step({ clock, overpass: fakeOverpass(clock, { fail: new OverpassError('HTTP 429', true) }) });
  for (let i = 1; i <= 4; i++) await t.s.ensure(activity({ activityId: `70000000000000000${i}`, rowId: `w_0000000${i}` }));
  assert.equal(t.overpass.starts.length, 1);
  assert.deepEqual(t.api.calls, []);
  assert.deepEqual(t.s.counts, { tagged: 0, noTrail: 0, tooLarge: 0, failed: 1, deferred: 3 });
  assert.deepEqual(t.s.notes(), [
    'trails 700000000000000001: not tagged, the OpenStreetMap lookup failed (HTTP 429); a later run retries',
    'trails: 3 activities not looked up this run (a failed lookup); a later run retries',
  ]);
});

const BIG = track([[0, 0], [40_000, 0], [40_000, 51_000]]);

test('too large: a padded box over 50 km on a side gets no request and no write, and is recorded until the track or matcher changes', async () => {
  const t = step({ archive: fakeArchive({ features: { 'trk-1': BIG } }) });
  await t.s.ensure(activity());
  assert.equal(t.overpass.starts.length, 0);
  assert.deepEqual(t.api.calls, []);
  assert.deepEqual(t.archive.records, [{
    status: 'too_large', matcher_version: TRAILS_MATCHER_VERSION, fit_fetched_at: FIT_AT, track_version: TRACK_VERSION, at: STARTED,
  }]);
  assert.deepEqual(t.s.counts, { tagged: 0, noTrail: 0, tooLarge: 1, failed: 0, deferred: 0 });
  assert.deepEqual(t.s.notes(), [
    'trails 700000000000000001: not tagged, its area is over 50 km across; not retried until its track or the matcher changes',
  ]);

  const later = step({ archive: fakeArchive({ features: { 'trk-1': BIG } }) });
  await later.s.ensure(activity({ record: t.archive.records[0] }));
  assert.deepEqual(later.archive.calls, [], 'skipped, not even read');
  const rebuilt = step({ archive: fakeArchive({ features: { 'trk-1': BIG } }) });
  await rebuilt.s.ensure(activity({ record: t.archive.records[0], track: trackRecord({ version: TRACK_VERSION + 1 }) }));
  assert.equal(rebuilt.s.counts.tooLarge, 1, 'a new track is measured again');
  // 40 km by 51 km: the height alone is over.
  assert.ok(paddedBox(BIG).heightKm > 50 && paddedBox(BIG).widthKm < 50);
});

test('a track that cannot be read from Drive is a note, and a DriveAuthError is rethrown', async () => {
  const t = step({ archive: fakeArchive({ readError: new DriveError(500, 'Drive answered 500') }) });
  await t.s.ensure(activity());
  assert.equal(t.overpass.starts.length, 0);
  assert.deepEqual(t.s.notes(), ['trails 700000000000000001: not tagged, its track could not be read from Drive; a later run retries']);
  assert.equal(t.s.counts.failed, 1);

  const auth = step({ archive: fakeArchive({ readError: new DriveAuthError('Drive answered 401') }) });
  await assert.rejects(auth.s.ensure(activity()), DriveAuthError);
  const authWrite = step({ archive: fakeArchive({ writeError: new DriveAuthError('Drive answered 401') }) });
  await assert.rejects(authWrite.s.ensure(activity()), DriveAuthError);
});

test('a refused updateWorkout is a note with the redacted message; nothing is recorded, so the next run retries', async () => {
  const t = step({ api: fakeApi({ refuse: new ThriveApiError('updateWorkout', 'Unknown field: "trails"') }) });
  await t.s.ensure(activity());
  assert.deepEqual(t.archive.records, []);
  assert.deepEqual(t.s.notes(), [
    'trails 700000000000000001: tagged but not written (updateWorkout: Unknown field: "trails"); a later run retries',
  ]);
  assert.equal(t.s.counts.failed, 1);
});

test('an activity with no named trail is tagged empty and counted as such', async () => {
  const clock = makeClock();
  const t = step({ clock, overpass: fakeOverpass(clock, { elements: [] }) });
  await t.s.ensure(activity());
  assert.equal(t.api.calls[0].changes.trails, '{"v":1,"m":1,"u":2700,"n":[],"p":[]}');
  assert.equal(t.s.counts.noTrail, 1);
  assert.equal(t.archive.records[0].status, 'tagged');
});

test('overflow adds one note with the counts', async () => {
  // 160 short trails side by side, each ridden end to end.
  const vertices = [];
  const elements = [];
  for (let k = 0; k < 160; k++) {
    const y = k * 100;
    vertices.push([0, y], [250, y], [250, y + 50], [0, y + 50], [0, y + 100]);
    elements.push(way(`Invented Spur ${String(k).padStart(3, '0')} of the Long Ridge`, [[0, y], [250, y]]));
  }
  const feature = track(vertices);
  const clock = makeClock();
  const t = step({ clock, overpass: fakeOverpass(clock, { elements }), featureFor: () => feature });
  // The box is 250 m by 16 km: under the limit.
  await t.s.ensure(activity());
  const sent = t.api.calls[0];
  assert.ok(encodedPayloadSize(sent.id, sent.changes.trails) <= MAX_ENCODED_PAYLOAD);
  const value = JSON.parse(sent.changes.trails);
  assert.ok(value.x > 0);
  assert.deepEqual(t.s.notes(), [
    `trails 700000000000000001: tagged, but ${value.x} of ${value.x + value.p.length} passes were left out to fit the column`,
  ]);
  assert.equal(t.archive.records[0].omitted, value.x);
  assertClean([...t.s.notes(), ...t.lines]);
});

test('the counts line is counts only', async () => {
  const t = step();
  await t.s.ensure(activity());
  assert.equal(trailSummary(t.s), 'Trails: 1 tagged, 0 no named trail, 0 too large, 0 failed, 0 deferred.');
});
