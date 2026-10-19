// #432 AC5 — scripts/backfill-421-workouts-track.mjs: builds tracks for
// existing COROS rows from the FITs already in Drive, writes track_ref alone
// through updateWorkout, makes no COROS call, is capped per run, and reports
// by workout id and date every row it cannot fill. Fakes only, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createArchive } from '../src/archive.mjs';
import { createTrackStep } from '../src/track-step.mjs';
import { TRACK_VERSION } from '../src/track.mjs';
import { backfill, isCandidate, planBackfill } from '../../scripts/backfill-421-workouts-track.mjs';
import { line, makeFit } from './fit-fixture.mjs';
import { memoryDrive } from './helpers.mjs';

const DIR = new URL('./fixtures/activities/', import.meta.url);
const FIXTURES = readdirSync(DIR).filter((n) => n.endsWith('.json'))
  .map((n) => JSON.parse(readFileSync(new URL(n, DIR), 'utf8')));
const byPrefix = (p) => FIXTURES.find((f) => f.list_entry.name.startsWith(p));
const GRAVEL = byPrefix('Gravel');
const HIKE = byPrefix('Hike');
const INDOOR = byPrefix('Indoor');

const FETCHED = '2026-09-24T17:41:12.000Z';
const FIT_BYTES = makeFit([...line(80), ...line(40, { lon0: -99.99, lat: 45.003 })].map((p, i) => ({ ...p, ms: p.ms + i * 1000 })));

/** A Drive holding these activities' archive files and FITs, landed as the sync lands them. */
async function world(activities, { fitFor = () => FIT_BYTES } = {}) {
  const drive = memoryDrive();
  const archive = createArchive(drive, { now: () => Date.parse(FETCHED) });
  const rows = [];
  for (const [i, f] of activities.entries()) {
    const { fileId } = await archive.upsertActivity({
      activityId: f.activity_id, localDate: f.list_entry.date, tool: f.tool, args: f.args,
      listEntry: f.list_entry, payload: f.payload,
    });
    const fitId = await archive.storeFit({ activityId: f.activity_id, localDate: f.list_entry.date, bytes: fitFor(f) });
    await archive.writeFit(fileId, { status: 'stored', file_id: fitId, fetched_at: FETCHED });
    rows.push({
      id: `w_${i}`, date: f.list_entry.date, source: 'coros', source_activity_id: f.activity_id,
      raw_ref: fileId, fit_ref: fitId, fit_fetched_at: FETCHED, track_ref: '',
    });
  }
  drive.writes.length = 0;
  return { drive, archive, rows };
}

function fakes(rows) {
  const writes = [];
  const api = {
    async get(action) {
      assert.equal(action, 'getWorkouts');
      return rows;
    },
    async write(action, payload) {
      assert.equal(action, 'updateWorkout');
      writes.push(payload);
      const r = rows.find((x) => x.id === payload.id);
      Object.assign(r, payload.changes);
      return { ...r };
    },
  };
  return { api, writes };
}

async function run(w, opts = {}) {
  const f = fakes(w.rows);
  const out = [];
  const err = [];
  const waits = [];
  const code = await backfill({
    api: f.api, drive: w.drive, archive: w.archive, createTrackStep, trackVersion: TRACK_VERSION,
    now: () => new Date('2026-10-19T12:00:00.000Z'),
    wait: async (ms) => { waits.push(ms); }, log: (l) => out.push(l), error: (l) => err.push(l), ...opts,
  });
  return { ...f, code, waits, out: out.join('\n'), err: err.join('\n') };
}

test('only COROS-synced rows with a FIT and no track are candidates', () => {
  assert.equal(isCandidate({ source: 'coros', fit_ref: 'f', track_ref: '' }), true);
  assert.equal(isCandidate({ source: 'coros', fit_ref: 'f', track_ref: 't' }), false);
  assert.equal(isCandidate({ source: 'coros', fit_ref: '', track_ref: '' }), false);
  assert.equal(isCandidate({ source: 'garmin_import', fit_ref: 'f', track_ref: '' }), false);
  assert.equal(isCandidate({ source: '', source_activity_id: '1', fit_ref: 'f', track_ref: '' }), false);
});

test('builds the track from the FIT already in Drive and writes track_ref alone, making no COROS call', async () => {
  const w = await world([GRAVEL, HIKE]);
  const r = await run(w);
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(r.writes.length, 2);
  for (const write of r.writes) {
    assert.deepEqual(Object.keys(write.changes), ['track_ref']); // no other cell, synced_at included
    assert.match(write.changes.track_ref, /^file-/);
    assert.equal(w.drive.files.get(write.changes.track_ref).props.kind, 'track');
  }
  assert.match(r.out, /Filled 2 row\(s\)/);
  assert.match(r.out, /2 built/);
  // The archive now records each track, so a re-run has nothing to do.
  assert.equal(w.drive.files.get(w.rows[0].raw_ref).data.track.status, 'stored');
});

test('--dry-run reads the archive, lists what it would do, and writes and downloads nothing', async () => {
  const w = await world([GRAVEL, HIKE]);
  const readsBefore = w.drive.calls.readJson;
  const r = await run(w, { dryRun: true });
  assert.equal(r.code, 0);
  assert.deepEqual(r.writes, []);
  assert.deepEqual(w.drive.writes, []);
  assert.match(r.out, /to build: 2/);
  assert.match(r.out, /--dry-run: nothing written/);
  assert.ok(w.drive.calls.readJson > readsBefore);
});

test('is capped per run, paced, and re-runnable until nothing is left', async () => {
  const w = await world([GRAVEL, HIKE]);
  const first = await run(w, { maxRows: 1 });
  assert.equal(first.writes.length, 1);
  assert.match(first.out, /1 this run, capped by --max-rows 1; 1 for a later run/);
  assert.match(first.out, /1 left: re-run to continue/);
  const second = await run(w, { maxRows: 1 });
  assert.equal(second.writes.length, 1);
  const third = await run(w, { maxRows: 1 });
  assert.equal(third.writes.length, 0);
  assert.match(third.out, /Nothing to do/);

  const paced = await world([GRAVEL, HIKE]);
  const r = await run(paced, { batch: 1, pauseMs: 250 });
  assert.deepEqual(r.waits, [250]);
});

test('an indoor row gets no track, is listed with why, and is recorded so it is not retried', async () => {
  const w = await world([GRAVEL, INDOOR]);
  const r = await run(w);
  assert.equal(r.writes.length, 1);
  assert.match(r.out, new RegExp(`NOT BUILT, needs a look: 1\\n  w_1  ${INDOOR.list_entry.date}  no track`));
  assert.equal(w.drive.files.get(w.rows[1].raw_ref).data.track.status, 'none');
  const again = await run(w);
  assert.match(again.out, /already tried, nothing to build \(none or unreadable, not retried\): 1/);
  assert.equal(again.writes.length, 0);
});

test('an unreadable FIT is listed by workout id and date, without any detail from it', async () => {
  const w = await world([GRAVEL], { fitFor: () => Buffer.from('not a fit') });
  const r = await run(w);
  assert.equal(r.code, 0);
  assert.equal(r.writes.length, 0);
  assert.match(r.out, /w_0  .*  the FIT could not be decoded \(recorded, not retried\)/);
});

test('lists rows it cannot even try: no raw_ref, an unreadable one, a different activity, a wrong FIT', async () => {
  const w = await world([GRAVEL, HIKE]);
  w.rows.push({ ...w.rows[0], id: 'w_noref', raw_ref: '' });
  w.rows.push({ ...w.rows[0], id: 'w_gone', raw_ref: 'missing-file' });
  w.rows.push({ ...w.rows[0], id: 'w_other', source_activity_id: 'not-this-activity' });
  w.rows[1].fit_ref = 'some-other-fit';
  const r = await run(w);
  assert.equal(r.code, 0);
  assert.match(r.out, /w_noref .*no raw_ref/);
  assert.match(r.out, /w_gone .*raw_ref missing-file is unreadable/);
  assert.match(r.out, /w_other .*is activity .*but the row is activity not-this-activity/);
  assert.match(r.out, /w_1 .*fit_ref some-other-fit is not the FIT tagged for activity/);
  assert.deepEqual(r.writes.map((x) => x.id), ['w_0']);
});

test('refuses to write when getWorkouts does not return track_ref', async () => {
  const w = await world([GRAVEL]);
  for (const row of w.rows) delete row.track_ref;
  const r = await run(w);
  assert.equal(r.code, 1);
  assert.deepEqual(r.writes, []);
  assert.match(r.err, /REFUSING: getWorkouts does not return track_ref/);
});

test('a failed write stops the run, naming how many were written before it', async () => {
  const w = await world([GRAVEL, HIKE]);
  const f = fakes(w.rows);
  let n = 0;
  const api = { get: f.api.get, write: async (a, p) => { if (++n === 2) throw new Error('API 500'); return f.api.write(a, p); } };
  const err = [];
  const code = await backfill({
    api, drive: w.drive, archive: w.archive, createTrackStep, trackVersion: TRACK_VERSION,
    log: () => {}, error: (l) => err.push(l), pauseMs: 0,
  });
  assert.equal(code, 1);
  assert.match(err.join('\n'), /FAILED writing w_1/);
  assert.match(err.join('\n'), /1 row\(s\) were written before it/);
});

test('planBackfill reads only: nothing is downloaded or written', async () => {
  const w = await world([GRAVEL]);
  const reads = [];
  const plan = await planBackfill({
    rows: w.rows, readFile: async (id) => { reads.push(id); return w.drive.readJson(id); }, settled: () => false,
  });
  assert.equal(plan.todo.length, 1);
  assert.deepEqual(reads, [w.rows[0].raw_ref]);
  assert.deepEqual(w.drive.writes, []);
});

test('no coordinate reaches the report', async () => {
  const w = await world([GRAVEL, INDOOR]);
  const r = await run(w);
  assert.doesNotMatch(r.out + r.err, /-?\d{2,3}\.\d{3,}/);
});
