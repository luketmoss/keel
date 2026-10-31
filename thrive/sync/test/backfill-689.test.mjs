// #689: scripts/backfill-689-workouts-trails.mjs — tags Workouts!AD `trails` for
// older activities with the sync's own matcher, client and encoder. Fakes only:
// a fake API, an in-memory Drive and archive, a fake fetch, an injected clock
// and wait, and cache and progress files in a temp dir. No network, no real
// data: synthetic geometry around 0°, 0°, invented trail names, 2000-01-01.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createArchive } from '../src/archive.mjs';
import { paddedBox, trailQuery, USER_AGENT } from '../src/overpass.mjs';
import { ThriveApiError, MAX_ENCODED_PAYLOAD } from '../src/thrive-api.mjs';
import { matchTrails, TRAILS_MATCHER_VERSION } from '../src/trail-match.mjs';
import { createTrailStep, encodedPayloadSize, encodeTrails, fitTrails } from '../src/trail-step.mjs';
import { TRACK_VERSION } from '../src/track.mjs';
import {
  backfill, CACHE_MAX_AGE_MS, DEFAULTS, loadProgress, parseArgs, patience, planBackfill, readTrailsCell,
} from '../../scripts/backfill-689-workouts-trails.mjs';
import { memoryDrive } from './helpers.mjs';
import { GOLDEN, GOLDEN_ELEMENTS, GOLDEN_FEATURE, track, way } from './trail-geometry.mjs';

const FIT_AT = '2000-01-01T14:00:00.000Z';
const T0 = Date.parse('2000-01-02T00:00:00.000Z');
const THRIVE = new URL('../../', import.meta.url);

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'backfill-689-'));
  dirs.push(d);
  return d;
};

const v1 = (m, u = 0) => JSON.stringify({ v: 1, m, u, n: [], p: [] });

// --- Fixtures ------------------------------------------------------------------

/** The golden feature moved `i` * 0.05° east, so every row has its own box. */
function shifted(feature, i) {
  const f = JSON.parse(JSON.stringify(feature));
  for (const c of f.geometry.coordinates) c[0] += i * 0.05;
  return f;
}

const walk = (activityId, n) => ({
  activityId,
  localDate: '2000-01-01',
  tool: 'getActivityDetail',
  args: { labelId: activityId, sportType: 900 },
  listEntry: { activityId, sportType: 900, name: `Walk ${n}`, date: '2000-01-01', text: `${n}. Walk — 2000-01-01` },
  payload: JSON.stringify('Walk Activity Details'),
});

/**
 * An archive holding one stored track per spec, a COROS archive file for each
 * COROS row, and the sheet's rows. A spec: { id, date, source ('coros' or
 * 'garmin_import'), trails, feature, trackRef, noTrack }.
 */
async function world(specs) {
  const drive = memoryDrive();
  const archive = createArchive(drive, { now: () => T0 });
  const rows = [];
  for (const [i, s] of specs.entries()) {
    const id = s.id ?? `w_${String(i + 1).padStart(8, '0')}`;
    const activityId = `70000000000000${String(i + 1).padStart(4, '0')}`;
    const source = s.source ?? 'coros';
    const trackId = await archive.storeTrack({ activityId, localDate: '2000-01-01', feature: s.feature ?? shifted(GOLDEN_FEATURE, i) });
    let rawRef = '';
    if (source === 'coros') {
      const { fileId } = await archive.upsertActivity(walk(activityId, i + 1));
      await archive.writeTrack(fileId, { status: 'stored', file_id: trackId, fit_fetched_at: FIT_AT, version: TRACK_VERSION, points: 7 });
      rawRef = fileId;
    }
    rows.push({
      id, date: s.date ?? '2000-01-01', source, source_activity_id: activityId, raw_ref: rawRef,
      track_ref: s.noTrack ? '' : (s.trackRef ?? trackId), trails: s.trails ?? '',
    });
  }
  drive.writes.length = 0;
  drive.calls.readJson = 0;
  return { drive, archive, rows };
}

const resetCells = (rows) => { for (const r of rows) r.trails = ''; };

function makeClock(start = T0) {
  const clock = { t: start, waits: [] };
  clock.now = () => clock.t;
  clock.wait = async (ms) => { clock.waits.push(ms); clock.t += ms; };
  return clock;
}

/** A fake API over `rows`. `failOn` is the 1-based write that throws; `echo` changes what is read back. */
function fakeApi(rows, { failOn = null, echo = null } = {}) {
  const writes = [];
  let attempts = 0;
  return {
    writes,
    async get(action) {
      assert.equal(action, 'getWorkouts');
      return rows;
    },
    async updateWorkout(payload) {
      attempts += 1;
      if (attempts === failOn) throw new ThriveApiError('updateWorkout', 'SENTINEL-API-MESSAGE');
      writes.push(payload);
      const row = rows.find((r) => r.id === payload.id);
      Object.assign(row, payload.changes);
      return { ...row, ...(echo ? { trails: echo } : {}) };
    },
  };
}

/**
 * A fetch answering Overpass POSTs from `answer`: an object, an array used in
 * order (the last one repeating), or a function of the call index. An Error
 * rejects; `'hang'` waits for the abort.
 */
function makeFetch(clock, answer = { body: { elements: GOLDEN_ELEMENTS } }) {
  const calls = [];
  let active = 0;
  const fetchImpl = async (url, init) => {
    const index = calls.length;
    calls.push({ at: clock.now(), url: String(url), init, query: new URLSearchParams(init.body).get('data') });
    const next = typeof answer === 'function' ? answer(index)
      : Array.isArray(answer) ? answer[Math.min(index, answer.length - 1)] : answer;
    active += 1;
    calls.maxActive = Math.max(calls.maxActive ?? 0, active);
    try {
      await Promise.resolve();
      if (next === 'hang') {
        return await new Promise((_, reject) => {
          if (init.signal.aborted) reject(new Error('aborted'));
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      if (next instanceof Error) throw next;
      const { status = 200, body = { elements: [] } } = next;
      return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
    } finally {
      active -= 1;
    }
  };
  return { fetchImpl, calls };
}

/** One backfill run over a world, with everything faked and everything captured. */
async function run(w, opts = {}) {
  const dir = opts.dir ?? tempDir();
  const clock = opts.clock ?? makeClock();
  const api = opts.api ?? fakeApi(w.rows, opts.apiOpts);
  const overpass = opts.overpass ?? makeFetch(clock, opts.answer);
  const out = [];
  const err = [];
  let code;
  let thrown = null;
  try {
    code = await backfill({
      api, drive: w.drive, archive: w.archive,
      fetchImpl: overpass.fetchImpl, startTimer: opts.startTimer,
      cacheDir: opts.cacheDir ?? join(dir, 'cache'), progressPath: opts.progressPath ?? join(dir, 'progress.json'),
      now: clock.now, wait: opts.wait ?? clock.wait, pauseMs: 0,
      log: (l) => out.push(l), error: (l) => err.push(l),
      ...opts.args,
    });
  } catch (e) {
    thrown = e;
  }
  const cacheDir = opts.cacheDir ?? join(dir, 'cache');
  return {
    code, thrown, api, clock, overpass, dir, out: out.join('\n'), err: err.join('\n'),
    lines: [...out, ...err],
    progressPath: opts.progressPath ?? join(dir, 'progress.json'),
    cacheFiles: (() => { try { return readdirSync(cacheDir); } catch { return []; } })(),
    cacheDir,
  };
}

// --- Which rows ------------------------------------------------------------------

test('the plan holds blank and older-version rows with a track, newest first, and leaves the rest alone', () => {
  const rows = [
    { id: 'a', date: '2000-01-05', track_ref: 't', source: 'coros', trails: '' },
    { id: 'b', date: '2000-01-05', track_ref: 't', source: 'garmin_import', trails: '' },
    { id: 'c', date: '2000-01-09', track_ref: 't', source: 'coros', trails: v1(1) }, // older than the injected 2
    { id: 'd', date: '2000-01-02', track_ref: 't', source: 'coros', trails: v1(2) }, // equal: done
    { id: 'e', date: '2000-01-02', track_ref: 't', source: 'coros', trails: v1(3) }, // newer: untouched
    { id: 'f', date: '2000-01-02', track_ref: '', source: '', trails: '' }, // hand-logged: no track
    { id: 'g', date: '2000-01-02', track_ref: '', source: 'coros', trails: '' }, // no track
    { id: 'h', date: '2000-01-03', track_ref: 't', source: 'coros', trails: '{"v":2}' }, // not v1
    { id: 'i', date: '2000-01-03', track_ref: 't', source: 'coros', trails: 'not json' },
    { id: 'j', date: '2000-01-01', track_ref: 't', source: 'coros', trails: '' },
  ];
  const plan = planBackfill({ rows, matcherVersion: 2 });
  assert.deepEqual(plan.todo.map((t) => t.id), ['c', 'a', 'b', 'j'], 'newest first, ties by id');
  assert.deepEqual(plan.todo.map((t) => t.retag), [true, false, false, false]);
  assert.deepEqual(plan.counts, { toTag: 3, toRetag: 1, current: 1, newer: 1, tooLarge: 0, unreadable: 2 });
  assert.deepEqual(plan.notTagged.map((n) => n.id), ['h', 'i']);
  assert.equal(plan.withTrack, 8);
});

test('a cell is blank, valid v1 with its matcher version, or unreadable, as the API judges it', () => {
  assert.deepEqual(readTrailsCell(''), { state: 'blank' });
  assert.deepEqual(readTrailsCell('  '), { state: 'blank' });
  assert.deepEqual(readTrailsCell(GOLDEN), { state: 'v1', m: TRAILS_MATCHER_VERSION });
  assert.deepEqual(readTrailsCell(JSON.stringify({ v: 1, m: 1, u: 5, n: [], p: [], x: 2 })), { state: 'v1', m: 1 });
  for (const bad of [
    'x', '[]', '{}', '{"v":1,"m":1,"u":0,"n":[]}', '{"v":2,"m":1,"u":0,"n":[],"p":[]}',
    '{"v":1,"m":0,"u":0,"n":[],"p":[]}', '{"v":1,"m":1,"u":0,"n":[["a",1]],"p":[]}', '{"v":1,"m":1,"u":0,"n":[],"p":[],"z":1}',
  ]) {
    assert.equal(readTrailsCell(bad).state, 'unreadable', bad);
  }
});

test('a Garmin row with a track is tagged, its track read from Drive by that ref', async () => {
  const w = await world([{ source: 'garmin_import', feature: GOLDEN_FEATURE }]);
  const r = await run(w);
  assert.equal(r.code, 0, r.err + r.out);
  assert.deepEqual(r.api.writes, [{ id: 'w_00000001', changes: { trails: GOLDEN } }]);
  assert.equal(w.drive.calls.readJson, 1, 'the track alone: a Garmin row has no archive file to read');
  assert.deepEqual(w.drive.writes, [], 'a Garmin row records nothing in an archive');
});

test('rows without a trails key are refused naming the #688 migration, with no request and no write', async () => {
  const w = await world([{}]);
  for (const row of w.rows) delete row.trails;
  const r = await run(w);
  assert.equal(r.code, 1);
  assert.match(r.err, /REFUSING/);
  assert.match(r.err, /#688/);
  assert.match(r.err, /migrate-688-workouts-trails/);
  assert.equal(r.overpass.calls.length, 0);
  assert.deepEqual(r.api.writes, []);
  assert.deepEqual(w.drive.writes, []);
});

// --- Writing ---------------------------------------------------------------------

test('one Overpass POST with the sync\'s query and User-Agent, then one updateWorkout with trails alone, equal to the golden string', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const r = await run(w);
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(r.overpass.calls.length, 1);
  const call = r.overpass.calls[0];
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['User-Agent'], USER_AGENT);
  assert.equal(call.query, trailQuery(paddedBox(GOLDEN_FEATURE).box, { timeoutS: 90 }), 'the patient server timeout');
  assert.equal(r.api.writes.length, 1);
  assert.deepEqual(Object.keys(r.api.writes[0]), ['id', 'changes']);
  assert.deepEqual(Object.keys(r.api.writes[0].changes), ['trails']);
  assert.equal(r.api.writes[0].changes.trails, GOLDEN);
  assert.match(r.out, /Trails: 1 tagged, 0 no named trail, 0 too large, 0 failed, 0 unreadable track, 0 cached answers used\./);
});

test('a "no named trail" answer is written as an empty tagged value for the current matcher', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const r = await run(w, { answer: { body: { elements: [] } } });
  assert.equal(r.code, 0);
  const written = r.api.writes[0].changes.trails;
  assert.match(written, /^\{"v":1,"m":1,"u":\d+,"n":\[\],"p":\[\]\}$/);
  assert.equal(written, JSON.stringify(encodeTrails(matchTrails(GOLDEN_FEATURE, []))));
  assert.match(r.out, /0 tagged, 1 no named trail/);
});

test('a value too big for the column is written with the sync\'s overflow rule', async () => {
  // 100 named trails of 400 m, walked in a snake: more passes and names than 5000 characters hold.
  const ways = [];
  const vertices = [];
  for (let k = 0; k < 100; k++) {
    ways.push(way(`Trail ${String(k).padStart(3, '0')} of the invented long-name set`, [[0, k * 100], [400, k * 100]]));
    vertices.push(...(k % 2 === 0 ? [[0, k * 100], [400, k * 100]] : [[400, k * 100], [0, k * 100]]));
  }
  const feature = track(vertices);
  const w = await world([{ feature }]);
  const r = await run(w, { answer: { body: { elements: ways } } });
  assert.equal(r.code, 0, r.err);
  const written = r.api.writes[0].changes.trails;
  const expected = fitTrails(encodeTrails(matchTrails(feature, ways)), 'w_00000001');
  assert.ok(expected.omitted > 0, 'the fixture must overflow');
  assert.equal(written, expected.text);
  assert.ok(JSON.parse(written).x > 0);
  assert.ok(encodedPayloadSize('w_00000001', written) <= MAX_ENCODED_PAYLOAD);
  assert.match(r.out, /left out to fit/);
});

test('a row tagged by an older matcher is re-tagged to the current one in one write', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE, trails: v1(1, 999) }]);
  const r = await run(w, { args: { matcherVersion: 2 } });
  assert.equal(r.code, 0);
  assert.equal(r.api.writes.length, 1);
  assert.equal(JSON.parse(r.api.writes[0].changes.trails).m, 2);
  assert.equal(readTrailsCell(w.rows[0].trails).m, 2);
});

test('a failed re-tag leaves the old value untouched and makes no write', async () => {
  const old = v1(1, 999);
  const w = await world([{ feature: GOLDEN_FEATURE, trails: old }]);
  const r = await run(w, { answer: { status: 503, body: 'down' }, args: { matcherVersion: 2 } });
  assert.equal(r.code, 1);
  assert.deepEqual(r.api.writes, []);
  assert.equal(w.rows[0].trails, old);
});

test('a COROS row it tags is recorded as the sync records it, so a following sync run makes no request and no write', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const row = w.rows[0];
  const r = await run(w);
  assert.equal(r.code, 0);
  const file = w.drive.files.get(row.raw_ref).data;
  assert.equal(file.trails.status, 'tagged');
  assert.equal(file.trails.matcher_version, TRAILS_MATCHER_VERSION);
  assert.equal(file.trails.fit_fetched_at, FIT_AT);
  assert.equal(file.trails.track_version, TRACK_VERSION);

  const syncCalls = [];
  const sync = makeFetch(makeClock());
  const step = createTrailStep({
    archive: w.archive, api: { updateWorkout: async (p) => { syncCalls.push(p); } }, startedAt: '2000-01-03T00:00:00.000Z',
    fetchImpl: sync.fetchImpl, wait: async () => {}, log: () => {},
  });
  await step.ensure({ activityId: row.source_activity_id, fileId: row.raw_ref, rowId: row.id, track: file.track, record: file.trails });
  assert.equal(sync.calls.length, 0);
  assert.deepEqual(syncCalls, []);
});

test('a too-large COROS row is recorded too_large in its archive, as the sync does', async () => {
  const w = await world([{ feature: track([[0, 0], [60_000, 0]]) }]);
  const r = await run(w);
  assert.equal(r.code, 0);
  assert.equal(w.drive.files.get(w.rows[0].raw_ref).data.trails.status, 'too_large');
});

test('a write the API refuses ends the run with exit 1 after the rows already written, and the next run skips them', async () => {
  const w = await world([{}, {}, {}]);
  const first = await run(w, { apiOpts: { failOn: 2 } });
  assert.equal(first.code, 1);
  assert.deepEqual(first.api.writes.map((x) => x.id), ['w_00000001']);
  assert.match(first.err, /FAILED writing w_00000002/);
  assert.match(first.err, /1 row\(s\) were written before it/);

  const second = await run(w, { dir: first.dir });
  assert.equal(second.code, 0);
  assert.deepEqual(second.api.writes.map((x) => x.id), ['w_00000002', 'w_00000003']);
});

test('a trails value that reads back different stops the run with exit 1', async () => {
  const w = await world([{}, {}]);
  const r = await run(w, { apiOpts: { echo: v1(1, 4) } });
  assert.equal(r.code, 1);
  assert.match(r.err, /UNEXPECTED: w_00000001/);
  assert.equal(r.api.writes.length, 1, 'stopped at the first');
});

test('a Sheets write is followed by --pause-ms', async () => {
  const w = await world([{}, {}]);
  const clock = makeClock();
  const r = await run(w, { clock, args: { pauseMs: 1000 } });
  assert.equal(r.code, 0);
  assert.equal(clock.waits.filter((ms) => ms === 1000).length, 2);
});

// --- A failed lookup never writes ------------------------------------------------

const FAILURES = [
  ['no response in 120 s', 'hang', 5, 'no response'],
  ['HTTP 429', { status: 429, body: 'busy' }, 5, 'HTTP 429'],
  ['HTTP 502', { status: 502, body: 'x' }, 5, 'HTTP 502'],
  ['HTTP 503', { status: 503, body: 'x' }, 5, 'HTTP 503'],
  ['HTTP 504', { status: 504, body: 'x' }, 5, 'HTTP 504'],
  ['a 200 with a remark', { body: { elements: [], remark: 'runtime error: out of memory' } }, 5, 'partial result'],
  ['a body that is not JSON', { body: '<html>nope</html>' }, 1, 'unreadable response'],
  ['a body with no elements', { body: { version: 0.6 } }, 1, 'unreadable response'],
  ['HTTP 400', { status: 400, body: 'bad query' }, 1, 'HTTP 400'],
];

for (const [label, answer, attempts, reason] of FAILURES) {
  test(`${label}: no write, no archive record, nothing cached, and the next run looks it up again`, async () => {
    const w = await world([{ feature: GOLDEN_FEATURE }]);
    const timers = [];
    const r = await run(w, {
      answer,
      startTimer: (ms, onTimeout) => { timers.push(ms); if (answer === 'hang') onTimeout(); return () => {}; },
    });
    assert.equal(r.code, 1);
    assert.equal(r.overpass.calls.length, attempts);
    assert.deepEqual(timers, Array(attempts).fill(120_000));
    assert.deepEqual(r.clock.waits, attempts === 5 ? [15_000, 60_000, 120_000, 180_000] : []);
    assert.deepEqual(r.api.writes, []);
    assert.deepEqual(w.drive.writes, []);
    assert.deepEqual(r.cacheFiles, []);
    assert.equal(w.rows[0].trails, '');
    assert.match(r.out, new RegExp(`w_00000001  OpenStreetMap lookup failed \\(${reason}\\)`));

    const again = await run(w, { dir: r.dir });
    assert.equal(again.code, 0);
    assert.equal(again.overpass.calls.length, 1);
    assert.equal(again.api.writes.length, 1);
  });
}

test('after a lookup fails every attempt no further lookup is made, the rest are left, and the failed row is listed', async () => {
  const w = await world([{}, {}, {}]);
  const r = await run(w, { answer: { status: 503, body: 'x' } });
  assert.equal(r.code, 1);
  assert.equal(r.overpass.calls.length, 5, 'five attempts at the first row, nothing for the others');
  assert.deepEqual(r.api.writes, []);
  assert.match(r.out, /NOT TAGGED: 1\n  w_00000001  OpenStreetMap lookup failed \(HTTP 503\)/);
  assert.match(r.out, /Left: 3\. Re-run to continue\./);
  assert.match(r.err, /struggling/);
});

// --- Cap, pace and time ------------------------------------------------------------

test('a default run looks up exactly 30 of 40 candidates and reports 10 left; --max-lookups changes it', async () => {
  assert.equal(DEFAULTS.maxLookups, 30);
  const w = await world(Array.from({ length: 40 }, () => ({})));
  const r = await run(w);
  assert.equal(r.code, 0);
  assert.equal(r.overpass.calls.length, 30);
  assert.equal(r.api.writes.length, 30);
  assert.match(r.out, /this run: 30/);
  assert.match(r.out, /left for a later run: 10/);
  assert.match(r.out, /Left: 10\. Re-run to continue\./);

  const w5 = await world(Array.from({ length: 12 }, () => ({})));
  const r5 = await run(w5, { args: { maxLookups: 5 } });
  assert.equal(r5.overpass.calls.length, 5);
  assert.match(r5.out, /Left: 7\./);
});

test('cache hits, too-large rows and unreadable tracks do not count toward the cap', async () => {
  const big = track([[0, 0], [60_000, 0]]);
  const w = await world([
    { feature: big }, { feature: big }, { trackRef: 'no-such-file' }, {}, {}, {},
  ]);
  const r = await run(w, { args: { maxLookups: 3 } });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.overpass.calls.length, 3);
  assert.equal(r.api.writes.length, 3);
  assert.match(r.out, /Trails: 0 tagged, 3 no named trail, 2 too large, 0 failed, 1 unreadable track, 0 cached answers used\./);
  assert.match(r.out, /Nothing to do\./);

  // Everything answered is cached: a fresh sheet with a cap of 1 needs no request at all.
  resetCells(w.rows);
  const cached = await run(w, { dir: r.dir, args: { maxLookups: 1 } });
  assert.equal(cached.overpass.calls.length, 0);
  assert.equal(cached.api.writes.length, 3);
  assert.match(cached.out, /3 cached answers used/);
});

test('requests are at least 5 s apart and one at a time, cache hits are not paced', async () => {
  const w = await world(Array.from({ length: 6 }, () => ({})));
  const r = await run(w);
  const at = r.overpass.calls.map((c) => c.at);
  assert.equal(at.length, 6);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 5000, `gap ${i}: ${at[i] - at[i - 1]}`);
  assert.equal(r.overpass.calls.maxActive, 1);

  resetCells(w.rows);
  const clock = makeClock();
  const cached = await run(w, { dir: r.dir, clock });
  assert.equal(cached.overpass.calls.length, 0);
  assert.deepEqual(clock.waits, []);
});

test('no lookup starts once --max-minutes have passed since the first request', async () => {
  const w = await world(Array.from({ length: 40 }, () => ({})));
  const r = await run(w, { args: { maxMinutes: 1, maxLookups: 1000 } });
  const at = r.overpass.calls.map((c) => c.at);
  assert.ok(at.length > 5 && at.length < 40);
  assert.ok(at.every((t) => t - at[0] < 60_000));
  assert.equal(r.code, 0);
  assert.match(r.out, /time limit \(--max-minutes 1\)/);
  assert.match(r.out, new RegExp(`Left: ${40 - at.length}\\. Re-run to continue\\.`));
  assert.equal(DEFAULTS.maxMinutes, 20);
});

test('an area over 50 km gets no request and no write, is listed and remembered, and is not read again', async () => {
  const w = await world([{ feature: track([[0, 0], [60_000, 0]]) }, {}]);
  const readsOf = (id) => { let n = 0; const orig = w.drive.readJson; w.drive.readJson = async (x) => { if (x === id) n += 1; return orig(x); }; return () => n; };
  const trackRef = w.rows[0].track_ref;
  const reads = readsOf(trackRef);

  const r = await run(w);
  assert.equal(r.code, 0);
  assert.equal(r.overpass.calls.length, 1, 'only the second row');
  assert.deepEqual(r.api.writes.map((x) => x.id), ['w_00000002']);
  assert.match(r.out, /NOT TAGGED: 1\n  w_00000001  area over 50 km/);
  assert.equal(w.rows[0].trails, '');
  assert.deepEqual(JSON.parse(readFileSync(r.progressPath, 'utf8')), {
    tooLarge: [{ id: 'w_00000001', track_ref: trackRef, m: TRAILS_MATCHER_VERSION }],
  });
  assert.equal(reads(), 1);

  const again = await run(w, { dir: r.dir });
  assert.equal(reads(), 1, 'its track is not read again');
  assert.match(again.out, /area over 50 km \(remembered, skipped\): 1/);
  assert.match(again.out, /Nothing to do\./);

  // A new track_ref, or a raised matcher version, looks at it again.
  w.rows[0].track_ref = 'other-ref';
  assert.equal(planBackfill({ rows: w.rows, tooLarge: loadProgress(r.progressPath) }).todo.some((t) => t.id === 'w_00000001'), true);
  w.rows[0].track_ref = trackRef;
  assert.equal(planBackfill({ rows: w.rows, tooLarge: loadProgress(r.progressPath), matcherVersion: 2 }).todo.some((t) => t.id === 'w_00000001'), true);
  assert.equal(planBackfill({ rows: w.rows, tooLarge: loadProgress(r.progressPath) }).todo.some((t) => t.id === 'w_00000001'), false);
});

// --- Resumable and idempotent -------------------------------------------------------

test('a run stopped by the API throwing after k rows and re-run tags each row once, asking Overpass once per area', async () => {
  for (const k of [1, 2, 3, 4]) {
    const w = await world(Array.from({ length: 4 }, () => ({})));
    const dir = tempDir();
    const clock = makeClock();
    const overpass = makeFetch(clock);
    const written = [];
    const first = await run(w, { dir, clock, overpass, apiOpts: { failOn: k } });
    written.push(...first.api.writes.map((x) => x.id));
    assert.equal(first.code, 1);
    const second = await run(w, { dir, clock, overpass });
    written.push(...second.api.writes.map((x) => x.id));
    assert.equal(second.code, 0);
    assert.deepEqual([...written].sort(), w.rows.map((r) => r.id), `k=${k}: each row once, none skipped`);
    assert.equal(overpass.calls.length, 4, `k=${k}: no area asked twice`);
  }
});

test('a run stopped by the wait throwing and re-run tags each row once', async () => {
  const w = await world(Array.from({ length: 4 }, () => ({})));
  const dir = tempDir();
  const clock = makeClock();
  const overpass = makeFetch(clock);
  let n = 0;
  const wait = async (ms) => { n += 1; if (n === 2) throw new Error('killed'); await clock.wait(ms); };
  const first = await run(w, { dir, clock, overpass, wait });
  assert.ok(first.thrown || first.code === 1);
  const second = await run(w, { dir, clock, overpass });
  assert.equal(second.code, 0);
  assert.ok(w.rows.every((r) => readTrailsCell(r.trails).state === 'v1'));
  assert.equal(overpass.calls.length, 4);
  assert.equal(new Set([...first.api.writes, ...second.api.writes].map((x) => x.id)).size, 4);
  assert.equal(first.api.writes.length + second.api.writes.length, 4, 'no row written twice');
});

test('a run when everything is tagged says Nothing to do, with no Drive read, request or write', async () => {
  const w = await world([{ trails: v1(1) }, { trails: v1(1) }]);
  const r = await run(w);
  assert.equal(r.code, 0);
  assert.match(r.out, /Nothing to do\./);
  assert.equal(r.overpass.calls.length, 0);
  assert.deepEqual(r.api.writes, []);
  assert.equal(w.drive.calls.readJson, 0);
});

test('raising the matcher version re-tags every row, and a re-run with the same cache makes no request', async () => {
  const w = await world([{}, {}, {}]);
  const dir = tempDir();
  const first = await run(w, { dir });
  assert.equal(first.overpass.calls.length, 3);
  const bumped = await run(w, { dir, args: { matcherVersion: 2 } });
  assert.equal(bumped.code, 0);
  assert.equal(bumped.overpass.calls.length, 0, 'the answers were cached');
  assert.deepEqual(bumped.api.writes.map((x) => JSON.parse(x.changes.trails).m), [2, 2, 2]);
  assert.match(bumped.out, /to re-tag: 3/);
});

test('--ids limits the run and still applies the states table; --restart deletes the progress file', async () => {
  const w = await world([{}, {}, { trails: v1(1) }]);
  const r = await run(w, { args: { ids: ['w_00000002', 'w_00000003'] } });
  assert.deepEqual(r.api.writes.map((x) => x.id), ['w_00000002'], 'w_00000003 is done, w_00000001 not asked for');
  assert.match(r.out, /left for a later run: 0/);

  const dir = tempDir();
  const progressPath = join(dir, 'progress.json');
  writeFileSync(progressPath, JSON.stringify({ tooLarge: [{ id: 'x', track_ref: 'y', m: 1 }] }));
  const kept = await run(await world([{}]), { dir, progressPath });
  assert.equal(existsSync(progressPath), true, 'without --restart it is kept');
  const restarted = await run(await world([{}]), { dir, progressPath, args: { restart: true } });
  assert.equal(restarted.code, 0);
  assert.equal(existsSync(progressPath), false);
  assert.ok(kept.code === 0);
});

// --- The cache -----------------------------------------------------------------------

test('an identical query within 30 days is served from the cache; after 30 days, with --no-cache, or from a bad file it asks again', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const dir = tempDir();
  const clock = makeClock();
  const first = await run(w, { dir, clock });
  assert.equal(first.overpass.calls.length, 1);
  assert.equal(first.cacheFiles.length, 1);
  const file = join(first.cacheDir, first.cacheFiles[0]);
  assert.equal(first.cacheFiles[0].length, 64 + '.json'.length, 'named by a hash of the query');
  const cached = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(cached.elements, GOLDEN_ELEMENTS);

  resetCells(w.rows);
  const second = await run(w, { dir, clock });
  assert.equal(second.overpass.calls.length, 0);
  assert.equal(second.api.writes[0].changes.trails, GOLDEN);

  resetCells(w.rows);
  clock.t += CACHE_MAX_AGE_MS + 1000;
  const old = await run(w, { dir, clock });
  assert.equal(old.overpass.calls.length, 1, 'older than 30 days');
  assert.ok(Date.parse(JSON.parse(readFileSync(file, 'utf8')).at) > T0 + CACHE_MAX_AGE_MS, 'a good answer replaces it');

  resetCells(w.rows);
  const fresh = await run(w, { dir, clock });
  assert.equal(fresh.overpass.calls.length, 0);

  resetCells(w.rows);
  const noCache = await run(w, { dir, clock, args: { noCache: true } });
  assert.equal(noCache.overpass.calls.length, 1, '--no-cache does not read it');

  for (const bad of ['{not json', JSON.stringify({ at: new Date(clock.t).toISOString() }), JSON.stringify({ at: 'garbage', elements: [] })]) {
    writeFileSync(file, bad);
    resetCells(w.rows);
    const r = await run(w, { dir, clock });
    assert.equal(r.overpass.calls.length, 1, `ignored: ${bad.slice(0, 12)}`);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).elements, GOLDEN_ELEMENTS, 'replaced by the good answer');
  }
});

// --- Patience (#697) -----------------------------------------------------------------

test('the patient defaults: 120 s attempts, a 90 s server timeout, 5 attempts, waits of 15, 60, 120 and 180 s', () => {
  assert.deepEqual(patience(), {
    attemptTimeoutMs: 120_000, serverTimeoutS: 90, attempts: 5, retryDelaysMs: [15_000, 60_000, 120_000, 180_000],
  });
  const tuned = patience({ attemptTimeoutS: 60, attempts: 2 });
  assert.equal(tuned.attemptTimeoutMs, 60_000);
  assert.equal(tuned.serverTimeoutS, 45);
  assert.equal(tuned.attempts, 2);
  for (const s of [1, 10, 45, 300]) {
    const p = patience({ attemptTimeoutS: s });
    assert.ok(p.serverTimeoutS >= 1 && (s === 1 || p.serverTimeoutS < s), `server timeout under the client's for ${s}`);
  }
});

test('--attempt-timeout-s 60 --attempts 2: a 60 s timer, [timeout:45], two attempts and one 15 s wait', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const timers = [];
  const r = await run(w, {
    answer: { status: 502, body: 'x' },
    startTimer: (ms) => { timers.push(ms); return () => {}; },
    args: { attemptTimeoutS: 60, attempts: 2 },
  });
  assert.equal(r.code, 1);
  assert.equal(r.overpass.calls.length, 2);
  assert.deepEqual(timers, [60_000, 60_000]);
  assert.deepEqual(r.clock.waits, [15_000]);
  assert.ok(r.overpass.calls.every((c) => c.query === trailQuery(paddedBox(GOLDEN_FEATURE).box, { timeoutS: 45 })));
  assert.deepEqual(r.api.writes, []);
});

test('retry waits are paced: none is under the 5 s lookup spacing, and requests stay one at a time', async () => {
  assert.ok(patience().retryDelaysMs.every((ms) => ms >= 5_000));
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const r = await run(w, { answer: { status: 502, body: 'x' } });
  const at = r.overpass.calls.map((c) => c.at);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 5_000, `gap ${i}`);
  assert.equal(r.overpass.calls.maxActive, 1);
});

test('a retry that succeeds after failures is written like any answer', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const r = await run(w, { answer: [{ status: 502, body: 'x' }, { status: 504, body: 'x' }, { body: { elements: GOLDEN_ELEMENTS } }] });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.overpass.calls.length, 3);
  assert.equal(r.api.writes[0].changes.trails, GOLDEN);
  assert.deepEqual(r.clock.waits, [15_000, 60_000]);
});

test('the cache key is the hash of the [timeout:40] query, so answers cached before #697 still hit, and a patient run caches under it', async () => {
  const w = await world([{ feature: GOLDEN_FEATURE }]);
  const dir = tempDir();
  const clock = makeClock();
  const box = paddedBox(GOLDEN_FEATURE).box;
  assert.match(trailQuery(box), /^\[out:json\]\[timeout:40\];/);
  const key = createHash('sha256').update(trailQuery(box)).digest('hex');
  mkdirSync(join(dir, 'cache'), { recursive: true });
  writeFileSync(join(dir, 'cache', `${key}.json`), JSON.stringify({ at: new Date(clock.t).toISOString(), elements: GOLDEN_ELEMENTS }));
  const hit = await run(w, { dir, clock });
  assert.equal(hit.overpass.calls.length, 0, 'served from the file an earlier run wrote');
  assert.equal(hit.api.writes[0].changes.trails, GOLDEN);

  for (const attemptTimeoutS of [1, 60, 300]) {
    resetCells(w.rows);
    const other = await run(w, { dir, clock, args: { attemptTimeoutS } });
    assert.equal(other.overpass.calls.length, 0, `--attempt-timeout-s ${attemptTimeoutS} does not change the key`);
  }

  resetCells(w.rows);
  const first = await run(w, { dir: tempDir(), clock });
  assert.equal(first.overpass.calls.length, 1);
  assert.deepEqual(first.cacheFiles, [`${key}.json`]);
});

test('--no-cache neither reads nor writes the cache folder', async () => {
  const w = await world([{}]);
  const r = await run(w, { args: { noCache: true } });
  assert.equal(r.overpass.calls.length, 1);
  assert.equal(existsSync(r.cacheDir), false);
});

test('a cache folder that cannot be read or written costs a fixed-text warning, never the run', async () => {
  const w = await world([{}, {}]);
  const dir = tempDir();
  const blocker = join(dir, 'a-file-not-a-folder');
  writeFileSync(blocker, 'x');
  const r = await run(w, { dir, cacheDir: join(blocker, 'cache') });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.api.writes.length, 2);
  assert.equal(r.out.match(/WARNING: the cache folder could not be read or written; continuing without it\./g).length, 1);
  const asFile = await run(await world([{}]), { dir, cacheDir: blocker });
  assert.equal(asFile.code, 0);
  assert.match(asFile.out, /WARNING: the cache folder/);
});

test('thrive/.gitignore ignores the cache folder and the progress file', () => {
  const text = readFileSync(new URL('.gitignore', THRIVE), 'utf8').split(/\r?\n/);
  assert.ok(text.includes('scripts/.backfill-689-cache/'));
  assert.ok(text.includes('scripts/.backfill-*-progress.json'));
  for (const path of ['scripts/.backfill-689-cache/', 'scripts/.backfill-689-cache/abc.json', 'scripts/.backfill-689-progress.json']) {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: THRIVE.pathname.replace(/^\/([A-Za-z]:)/, '$1') });
  }
});

// --- Dry run and reporting -----------------------------------------------------------

test('--dry-run reads the sheet only and lists the ids a real run then tags', async () => {
  const w = await world(Array.from({ length: 5 }, () => ({})));
  const untouched = new Proxy({}, { get: (_, name) => () => { throw new Error(`dry run touched ${String(name)}`); } });
  const dir = tempDir();
  const dry = await run(w, {
    dir, args: { dryRun: true, maxLookups: 3 },
    overpass: { fetchImpl: () => { throw new Error('dry run used the network'); }, calls: [] },
  });
  assert.equal(dry.code, 0);
  assert.match(dry.out, /to tag: 5/);
  assert.match(dry.out, /this run: 3/);
  assert.match(dry.out, /left for a later run: 2/);
  assert.match(dry.out, /--dry-run/);
  assert.equal(w.drive.calls.readJson, 0);
  assert.deepEqual(w.drive.writes, []);
  assert.deepEqual(dry.api.writes, []);
  assert.equal(existsSync(dry.cacheDir), false);
  assert.ok(untouched);
  const planned = dry.out.split('\n').filter((l) => /^ {2}w_\d+$/.test(l)).map((l) => l.trim());

  const real = await run(w, { dir, args: { maxLookups: 3 } });
  assert.deepEqual(real.api.writes.map((x) => x.id), planned);
});

test('the closing line has the specified form, and a run that stopped early says to re-run', async () => {
  const w = await world([{}, {}, {}]);
  const stopped = await run(w, { args: { maxLookups: 2 } });
  assert.match(stopped.out, /^Trails: \d+ tagged, \d+ no named trail, \d+ too large, \d+ failed, \d+ unreadable track, \d+ cached answers used\.$/m);
  assert.match(stopped.out, /^Left: 1\. Re-run to continue\.$/m);
  const done = await run(w, { dir: stopped.dir });
  assert.match(done.out, /^Nothing to do\.$/m);
});

test('privacy: no sentinel reaches a log line, an error, or the progress file, whatever fails', async () => {
  const S = 'SENTINEL';
  const named = way(`${S}-TRAIL`, [[0, 0], [1000, 0]]);
  const feature = track([[0, 0], [1000, 0]]);
  feature.properties.start_utc = `${S}-START`;
  const forbidden = [S, 'runtime error', 'Heron', 'Aspen'];
  const box = paddedBox(feature).box;
  const numbers = Object.values(box).flatMap((v) => [String(v), v.toFixed(6), v.toFixed(4)]);
  const lines = [];
  const files = [];

  const bodies = [
    { body: { elements: [named] } },
    { status: 503, body: `${S} ${trailQuery(box)}` },
    { status: 400, body: `${S} ${trailQuery(box)}` },
    { body: { elements: [], remark: `${S} runtime error` } },
    { body: `${S} not json` },
    'hang',
  ];
  for (const answer of bodies) {
    const w = await world([{ date: `${S}-DATE`, feature }, { date: `${S}-DATE`, feature: track([[0, 0], [60_000, 0]]) }]);
    const r = await run(w, { answer, startTimer: (ms, cb) => { if (answer === 'hang') cb(); return () => {}; } });
    lines.push(...r.lines);
    files.push(existsSync(r.progressPath) ? readFileSync(r.progressPath, 'utf8') : '');
  }
  const refused = await run(await world([{ date: `${S}-DATE`, feature }]), { answer: { body: { elements: [named] } }, apiOpts: { failOn: 1 } });
  lines.push(...refused.lines);
  assert.equal(refused.code, 1);

  assert.ok(lines.length > 10);
  for (const text of [...lines, ...files]) {
    for (const bad of [...forbidden, ...numbers]) assert.ok(!text.includes(bad), `"${bad}" leaked: ${text}`);
  }
  assert.ok(files.some((f) => f.includes('tooLarge')), 'the progress file holds the too-large row');
});

test('invalid flags are refused with a message naming the flag', () => {
  for (const [args, flag] of [
    [['--max-lookups', 'x'], '--max-lookups'], [['--max-lookups', '0'], '--max-lookups'], [['--max-lookups', '1.5'], '--max-lookups'],
    [['--max-lookups'], '--max-lookups'], [['--max-minutes', '-3'], '--max-minutes'], [['--max-minutes', '0'], '--max-minutes'],
    [['--pause-ms', '-1'], '--pause-ms'], [['--ids'], '--ids'], [['--nonsense'], '--nonsense'],
  ]) {
    const parsed = parseArgs(args);
    assert.equal(parsed.ok, false, args.join(' '));
    assert.ok(parsed.message.includes(flag), parsed.message);
  }
  const ok = parseArgs(['--dry-run', '--max-lookups', '1', '--max-minutes', '5', '--pause-ms', '0', '--ids', 'a,b', '--restart', '--no-cache']);
  assert.deepEqual(ok, {
    ok: true,
    options: { '--dry-run': true, '--max-lookups': 1, '--max-minutes': 5, '--pause-ms': 0, '--ids': ['a', 'b'], '--restart': true, '--no-cache': true },
  });
  assert.deepEqual(parseArgs(['--max-lookups', '5', '--max-minutes', '30']), {
    ok: true, options: { '--max-lookups': 5, '--max-minutes': 30 },
  });
  assert.deepEqual(parseArgs(['--attempt-timeout-s', '60', '--attempts', '2']), {
    ok: true, options: { '--attempt-timeout-s': 60, '--attempts': 2 },
  });
  assert.deepEqual(DEFAULTS, { maxLookups: 30, maxMinutes: 20, pauseMs: 1000, attemptTimeoutS: 120, attempts: 5 });
  for (const flag of ['--attempt-timeout-s', '--attempts']) {
    for (const bad of ['0', '-1', '1.5', 'abc', '']) {
      const parsed = parseArgs([flag, bad]);
      assert.equal(parsed.ok, false, `${flag} ${bad}`);
      assert.ok(parsed.message.includes(flag), parsed.message);
    }
    const missing = parseArgs([flag]);
    assert.equal(missing.ok, false);
    assert.ok(missing.message.includes(flag));
  }
});

