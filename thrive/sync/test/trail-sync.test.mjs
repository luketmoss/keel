// #688: the trail step inside the COROS run. A synthetic activity (a walk on
// 2000-01-01, around 0°, 0°) whose FIT and track are already stored, the real
// archive over an in-memory Drive, the real activity, track and trail steps,
// a fake API and a fake fetch. No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createArchive } from '../src/archive.mjs';
import { DriveAuthError } from '../src/errors.mjs';
import { FIT_TOOL } from '../src/fit.mjs';
import { REQUIRED_TOOLS } from '../src/ingest.mjs';
import { DEFAULT_OVERPASS_URL } from '../src/overpass.mjs';
import { createRunOutput } from '../src/run-log.mjs';
import { syncActivities } from '../src/sync-activities.mjs';
import { syncRun } from '../src/sync-run.mjs';
import { ThriveApiError } from '../src/thrive-api.mjs';
import { createTrackStep } from '../src/track-step.mjs';
import { TRACK_VERSION } from '../src/track.mjs';
import { createTrailStep } from '../src/trail-step.mjs';
import { memoryDrive } from './helpers.mjs';
import { GOLDEN, GOLDEN_ELEMENTS, GOLDEN_FEATURE } from './trail-geometry.mjs';

const SYNCED = '2000-01-02T13:00:00.000Z';
const FIT_AT = '2000-01-01T14:00:00.000Z';
const START_S = Date.parse('2000-01-01T13:00:00Z') / 1000;

/** A COROS walk archive file in #152's shape, every value invented. */
function walk(id, n) {
  const prose = `Walk Activity Details\n====\n\nWorkout Time: 45:00\nDistance: 2.70 km\nAverage Heart Rate: 100 bpm\nCalories: 150 kcal`;
  return {
    activityId: id,
    localDate: '2000-01-01',
    tool: 'getActivityDetail',
    args: { labelId: id, sportType: 900 },
    listEntry: {
      activityId: id, sportType: 900, name: `Walk ${n}`, date: '2000-01-01',
      startTimestamp: START_S + n * 3600, endTimestamp: START_S + n * 3600 + 2700,
      text: `${n}. Walk — 2000-01-01\n   Start Coordinates: 0.000000, 0.000000\n   LabelId: ${id} | SportType: 900`,
    },
    payload: JSON.stringify(prose),
  };
}

/** An archive holding `count` walks, each with a stored FIT and an up-to-date stored track. */
async function archiveWith(count = 1) {
  const drive = memoryDrive();
  const archive = createArchive(drive, { now: () => Date.parse(SYNCED) });
  const ids = [];
  for (let n = 1; n <= count; n++) {
    const id = `70000000000000000${n}`;
    const { fileId } = await archive.upsertActivity(walk(id, n));
    const trackId = await archive.storeTrack({ activityId: id, localDate: '2000-01-01', feature: GOLDEN_FEATURE });
    await archive.writeFit(fileId, { status: 'stored', file_id: `fit-${n}`, fetched_at: FIT_AT });
    await archive.writeTrack(fileId, { status: 'stored', file_id: trackId, fit_fetched_at: FIT_AT, version: TRACK_VERSION, points: 7 });
    ids.push(id);
  }
  return { drive, archive, ids };
}

/** Workouts by vendor id, and every call. `refuseTrails` makes `updateWorkout` refuse. */
function fakeApi({ refuseTrails = false } = {}) {
  const calls = [];
  const rows = new Map();
  let seq = 0;
  return {
    calls,
    rows,
    async upsertSyncedWorkout(payload) {
      calls.push({ action: 'upsertSyncedWorkout', ...payload });
      const row = rows.get(payload.source_activity_id);
      const id = row?.id ?? `w_${String(++seq).padStart(8, '0')}`;
      rows.set(payload.source_activity_id, { ...row, id, ...payload.incoming, track_ref: payload.track_ref });
      return { status: row ? 'updated' : 'created', id, written: { ...payload.incoming, edited: [] }, kept: [] };
    },
    async updateWorkout(payload) {
      calls.push({ action: 'updateWorkout', ...payload });
      if (refuseTrails) throw new ThriveApiError('updateWorkout', 'Unknown field: "trails"');
      const row = [...rows.values()].find((r) => r.id === payload.id);
      Object.assign(row, payload.changes);
      return row;
    },
    rows_: rows,
  };
}

/** A fetch answering every Overpass POST with `answer`, and recording each. */
function overpassFetch(answer) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (answer instanceof Error) throw answer;
      return { status: answer.status ?? 200, text: async () => JSON.stringify(answer.body ?? {}) };
    },
  };
}

const noWait = async () => {};

async function runActivities({ archive, ids, api = fakeApi(), fetch = overpassFetch({ body: { elements: GOLDEN_ELEMENTS } }), env = {} }) {
  const track = createTrackStep({ archive, startedAt: SYNCED, log: () => {} });
  const trails = createTrailStep({
    archive, api, startedAt: SYNCED, env, fetchImpl: fetch.fetchImpl, wait: noWait, featureFor: track.featureFor, log: () => {},
  });
  const out = await syncActivities({ archive, api, activityIds: ids, syncedAt: SYNCED, track, trails, log: () => {} });
  return { api, fetch, trails, out };
}

test('one Overpass POST to the default URL, then updateWorkout with the id upsertSyncedWorkout returned and the encoded value', async () => {
  const { archive, ids } = await archiveWith();
  const { api, fetch, out } = await runActivities({ archive, ids });
  assert.deepEqual(out.failures, []);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, DEFAULT_OVERPASS_URL);
  assert.equal(fetch.calls[0].init.method, 'POST');
  assert.match(fetch.calls[0].init.headers['User-Agent'], /keel-thrive-sync/);
  assert.deepEqual(api.calls.map((c) => c.action), ['upsertSyncedWorkout', 'updateWorkout']);
  const upsert = api.calls[0];
  assert.equal(Object.hasOwn(upsert, 'trails'), false, 'the upsert never carries trails');
  assert.deepEqual(api.calls[1], { action: 'updateWorkout', id: 'w_00000001', changes: { trails: GOLDEN } });
});

test('THRIVE_OVERPASS_URL replaces the default', async () => {
  const { archive, ids } = await archiveWith();
  const { fetch } = await runActivities({ archive, ids, env: { THRIVE_OVERPASS_URL: 'https://overpass.invalid/api/interpreter' } });
  assert.equal(fetch.calls[0].url, 'https://overpass.invalid/api/interpreter');
});

test('settled across runs: the second run looks nothing up and writes no trails, and an ingest update keeps the record', async () => {
  const { drive, archive, ids } = await archiveWith();
  await runActivities({ archive, ids });
  const file = [...drive.files.values()].find((f) => f.props.activity_id === ids[0]);
  assert.equal(file.data.trails.status, 'tagged');
  // The ingest's own update of the file keeps the trails record, as it keeps `track`.
  await archive.upsertActivity({ ...walk(ids[0], 1), payload: JSON.stringify('Walk Activity Details\n====\n\nWorkout Time: 46:00\nDistance: 2.70 km') });
  assert.equal([...drive.files.values()].find((f) => f.props.activity_id === ids[0]).data.trails.status, 'tagged');

  const second = await runActivities({ archive, ids });
  assert.equal(second.fetch.calls.length, 0);
  assert.ok(!second.api.calls.some((c) => c.action === 'updateWorkout'));
});

test('a deleted row is not tagged', async () => {
  const { archive, ids } = await archiveWith();
  const api = fakeApi();
  api.upsertSyncedWorkout = async () => ({ status: 'deleted' });
  const { fetch } = await runActivities({ archive, ids, api });
  assert.equal(fetch.calls.length, 0);
});

test('a DriveAuthError from the trail step fails the activity, as from every step', async () => {
  const { archive, ids } = await archiveWith();
  archive.writeTrails = async () => { throw new DriveAuthError('Drive answered 401'); };
  const { out } = await runActivities({ archive, ids });
  assert.equal(out.failures.length, 1);
  assert.match(out.failures[0], /Google refused the sync's Drive credential/);
});

// --- The whole run ---------------------------------------------------------------

const ACTIONS_ENV = { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'schedule', SYNC_LOG: 'summary' };

/** The COROS run over the synthetic archive, every step real but COROS, ingest and the FIT step. */
async function wholeRun({ count = 3, api = fakeApi(), fetch, trailStep = true, breakArchive } = {}) {
  const { archive, ids } = await archiveWith(count);
  if (breakArchive) breakArchive(archive);
  const rows = [];
  api.appendSyncLog = async (row) => { rows.push(row); return { status: 'appended' }; };
  const lines = [];
  const output = createRunOutput('summary', { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  const times = ['2000-01-02T13:00:00.000Z', '2000-01-02T13:01:00.000Z'];
  const result = await syncRun({
    env: ACTIONS_ENV,
    now: () => new Date(times.length > 1 ? times.shift() : times[0]),
    output,
    deps: {
      createDrive: () => ({}),
      createTokenStore: () => ({}),
      getAccessToken: async () => ({ accessToken: 'at', refreshed: false }),
      connectCoros: async () => ({
        async listTools() { return { tools: [...REQUIRED_TOOLS, FIT_TOOL].map((name) => ({ name })) }; },
        async close() {},
      }),
      createArchive: () => archive,
      ingest: async () => ({
        window: { start: '1999-12-22', end: '2000-01-03', runDate: '2000-01-02' },
        activities: { created: 0, updated: 0, unchanged: count }, activityIds: ids, failures: [], health: 'unchanged',
      }),
      createFitStep: () => ({
        counts: { requested: 0, stored: 0, adopted: 0, failed: 0, gaveUp: 0, waiting: 0 }, failures: [], remaining: 'unread',
        async ensure({ record }) { return { fit_ref: record.file_id, fit_fetched_at: record.fetched_at }; },
      }),
      // The sheet step without DailyHealth and the rollup, which have nothing to do with trails.
      writeSheet: async (args) => {
        const activities = await syncActivities(args);
        return { activities, failures: activities.failures };
      },
      createApi: () => api,
      createTrailStep: trailStep
        ? (opts) => createTrailStep({ ...opts, fetchImpl: fetch.fetchImpl, wait: noWait })
        : () => null,
    },
  });
  return { ...result, rows, api, lines, text: lines.join('\n') };
}

const sameCounts = (a, b) => {
  for (const k of ['status', 'n_errors', 'n_new', 'n_updated', 'n_seen']) assert.equal(a[k], b[k], k);
};

test('the activity sync never fails because of trails: every lookup failing, a refused write, an unreadable track', async () => {
  const baseline = await wholeRun({ trailStep: false });
  assert.equal(baseline.exitCode, 0);
  assert.equal(baseline.rows[0].n_new, 3);

  const cases = {
    'every Overpass request failing': { fetch: overpassFetch({ status: 503 }) },
    'the trails updateWorkout refused': { fetch: overpassFetch({ body: { elements: GOLDEN_ELEMENTS } }), api: fakeApi({ refuseTrails: true }) },
    'a track file that cannot be read from Drive': {
      fetch: overpassFetch({ body: { elements: GOLDEN_ELEMENTS } }),
      breakArchive: (archive) => { archive.readTrack = async () => { throw new Error('Drive answered 500'); }; },
    },
  };
  for (const [name, opts] of Object.entries(cases)) {
    const r = await wholeRun(opts);
    assert.equal(r.exitCode, 0, name);
    sameCounts(r.rows[0], baseline.rows[0]);
    assert.equal(r.rows[0].error_detail, '', name);
    assert.equal(r.api.calls.filter((c) => c.action === 'upsertSyncedWorkout').length, 3, `${name}: every row landed`);
    assert.ok(r.rows[0].notes.startsWith('trails 700000000000000001: '), `${name}: ${r.rows[0].notes}`);
  }
});

test('reporting: one counts line, no note text in the summary-mode log, notes in the private row', async () => {
  const r = await wholeRun({ fetch: overpassFetch({ status: 429 }) });
  assert.match(r.text, /^Trails: 0 tagged, 0 no named trail, 0 too large, 1 failed, 2 deferred\.$/m);
  assert.equal(r.lines.filter((l) => l.startsWith('Trails:')).length, 1);
  assert.equal(r.rows[0].notes, [
    'trails 700000000000000001: not tagged, the OpenStreetMap lookup failed (HTTP 429); a later run retries',
    'trails: 2 activities not looked up this run (a failed lookup); a later run retries',
  ].join('\n'));
  assert.doesNotMatch(r.text, /not tagged|not looked up|OpenStreetMap|700000000000000001/);
  for (const c of ['Heron', 'Aspen', '0.000']) assert.ok(!r.text.includes(c));
});

test('a clean run tags every activity and says so in counts', async () => {
  const r = await wholeRun({ fetch: overpassFetch({ body: { elements: GOLDEN_ELEMENTS } }) });
  assert.equal(r.exitCode, 0);
  assert.match(r.text, /^Trails: 3 tagged, 0 no named trail, 0 too large, 0 failed, 0 deferred\.$/m);
  assert.equal(r.rows[0].notes, '');
  assert.equal(r.api.calls.filter((c) => c.action === 'updateWorkout').length, 3);
});
