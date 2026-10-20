// #510 — scripts/import-510-garmin-fits.mjs: activity FITs with positions are
// matched to garmin_import rows by START TIME, stored in Drive, and linked
// through updateWorkout; wellness and indoor files are never uploaded; a re-run
// writes nothing. Then the track backfill builds Garmin tracks. Fakes only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArchive } from '../src/archive.mjs';
import { createGarminArchive } from '../src/garmin-archive.mjs';
import { inspectFit } from '../src/garmin-fit.mjs';
import { createTrackStep } from '../src/track-step.mjs';
import { TRACK_VERSION } from '../src/track.mjs';
import { backfill } from '../../scripts/backfill-421-workouts-track.mjs';
import { importFits, listFits, matchFits, zipPaths } from '../../scripts/import-510-garmin-fits.mjs';
import { line, makeFit } from './fit-fixture.mjs';
import { memoryDrive } from './helpers.mjs';
import { tempDir, writeZip } from './zip-fixture.mjs';

const T1 = Date.UTC(2026, 5, 1, 14, 0, 0);
const T2 = Date.UTC(2026, 5, 2, 14, 0, 0);
const T3 = Date.UTC(2026, 5, 3, 14, 0, 0);
const T4 = Date.UTC(2026, 5, 4, 14, 0, 0);
const iso = (ms, offset = '-06:00') => `${new Date(ms - 6 * 3600e3).toISOString().slice(0, 19)}${offset}`;
const fit = (ms, { gps = true, type = 'activity' } = {}) =>
  makeFit(gps ? line(30) : [{ ms }, { ms: ms + 1000 }], { timeCreated: new Date(ms), type });

const row = (n, ms, over = {}) => ({
  id: `w_${n}`, date: new Date(ms - 6 * 3600e3).toISOString().slice(0, 10), source: 'garmin_import',
  source_activity_id: String(9000 + n), started_at_utc: iso(ms), raw_ref: '', fit_ref: '', fit_fetched_at: '', track_ref: '',
  ...over,
});

/** Two zips: overlapping names, a wellness file, an indoor activity, three outdoor ones. */
function zips() {
  const dir = tempDir();
  writeZip(dir, 'Part1.zip', [
    { name: 'me_1001.fit', data: fit(T1) },
    { name: 'me_1002.fit', data: fit(T2 + 40_000) }, // 40 s off the row: matched as the single nearest
    { name: 'me_1003.fit', data: fit(T3, { gps: false }) }, // indoor
    { name: 'me_1004.fit', data: fit(T1 + 5000, { type: 'monitoringB' }) },
    { name: 'me_9999.gpx', data: Buffer.from('<gpx/>') },
  ]);
  writeZip(dir, 'Part2.zip', [
    { name: 'me_1001.fit', data: fit(T1) }, // the parts overlap: same name, counted once
    { name: 'me_1005.fit', data: fit(T4) },
  ]);
  return dir;
}

function world(rows) {
  const drive = memoryDrive();
  const archive = createGarminArchive(drive);
  const writes = [];
  const api = {
    async get(action) {
      assert.equal(action, 'getWorkouts');
      return rows;
    },
    async write(action, payload) {
      assert.equal(action, 'updateWorkout');
      writes.push(payload);
      Object.assign(rows.find((r) => r.id === payload.id), payload.changes);
      return {};
    },
  };
  return { drive, archive, api, writes };
}

async function run(w, dir, opts = {}) {
  const out = [];
  const err = [];
  const code = await importFits({
    api: w.api, archive: w.archive, paths: zipPaths(dir), now: () => '2026-10-19T12:00:00.000Z',
    wait: async () => {}, log: (l) => out.push(l), error: (l) => err.push(l), ...opts,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('inspectFit tells an activity with positions from an indoor one and a wellness file', () => {
  assert.deepEqual(inspectFit(fit(T1)), { kind: 'activity', startMs: T1, positions: 30 });
  assert.equal(inspectFit(fit(T1, { gps: false })).positions, 0);
  assert.deepEqual(inspectFit(fit(T1, { type: 'monitoringB' })), { kind: 'other', type: 'monitoringB' });
  assert.deepEqual(inspectFit(Buffer.from('not a fit')), { kind: 'unreadable' });
});

test('listFits counts an entry name once across overlapping zips and skips non-FIT files', () => {
  const names = listFits(zipPaths(zips())).map((f) => f.name);
  assert.deepEqual(names, ['me_1001.fit', 'me_1002.fit', 'me_1003.fit', 'me_1004.fit', 'me_1005.fit']);
});

test('matchFits: exact, single nearest within 120 s, ambiguous, unmatched, already linked', () => {
  const rows = [
    row(1, T1), row(2, T2), row(3, T3, { fit_ref: 'already' }),
    row(4, T4), { ...row(5, T4), id: 'w_5b', source_activity_id: '9055' }, // two rows, same second
    { ...row(6, T1 + 1000), source: 'coros' }, // not a Garmin row
  ];
  const fits = [
    { name: 'a', startMs: T1 }, { name: 'b', startMs: T2 + 40_000 }, { name: 'c', startMs: T3 },
    { name: 'd', startMs: T4 }, { name: 'e', startMs: T4 + 999_000 },
  ];
  const m = matchFits(fits, rows);
  assert.deepEqual(m.matched.map((x) => [x.fit.name, x.row.id]), [['a', 'w_1'], ['b', 'w_2']]);
  assert.deepEqual(m.linked.map((x) => x.fit.name), ['c']);
  assert.deepEqual(m.ambiguous.map((f) => f.name), ['d']);
  assert.deepEqual(m.unmatched.map((f) => f.name), ['e']);
});

test('matchFits: a row two FITs claim is ambiguous for both, never attached', () => {
  const m = matchFits([{ name: 'a', startMs: T1 }, { name: 'b', startMs: T1 + 30_000 }], [row(1, T1 + 10_000)]);
  assert.deepEqual(m.matched, []);
  assert.deepEqual(m.ambiguous.map((f) => f.name), ['a', 'b']);
});

test('--dry-run reports what it would do and writes nothing', async () => {
  const rows = [row(1, T1), row(2, T2), row(3, T3), row(5, T4)];
  const w = world(rows);
  const r = await run(w, zips(), { dryRun: true });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /FIT files in 2 zip\(s\): 5/);
  assert.match(r.out, /not activities \(wellness, monitoring\): 1/);
  assert.match(r.out, /no usable positions \(indoor, strength\): 1/);
  assert.match(r.out, /activities with positions: 3/);
  assert.match(r.out, /matched by start time, to attach: 3/);
  assert.match(r.out, /--dry-run: nothing written/);
  assert.deepEqual(w.writes, []);
  assert.deepEqual(w.drive.writes, []);
});

test('stores only matched outdoor FITs, links fit_ref and fit_fetched_at alone, and a re-run writes nothing', async () => {
  const rows = [row(1, T1), row(2, T2), row(3, T3), row(5, T4)];
  const w = world(rows);
  const dir = zips();
  const first = await run(w, dir);
  assert.equal(first.code, 0, first.err);
  assert.equal(w.writes.length, 3);
  for (const x of w.writes) {
    assert.deepEqual(Object.keys(x.changes), ['fit_ref', 'fit_fetched_at']);
    assert.equal(x.changes.fit_fetched_at, '2026-10-19T12:00:00.000Z');
    const file = w.drive.files.get(x.changes.fit_ref);
    assert.equal(file.props.source, 'garmin_import');
    assert.equal(file.props.kind, 'fit');
  }
  assert.equal(rows[2].fit_ref, ''); // the indoor one has none
  assert.match(w.drive.pathOf(rows[0].fit_ref), /Thrive Garmin\/fit\/2026\/06\/9001\.fit$/);
  assert.match(first.out, /uploaded 3 FIT\(s\)/);

  const writesBefore = w.drive.writes.length;
  const second = await run(w, dir);
  assert.equal(second.code, 0);
  assert.equal(w.writes.length, 3);
  assert.equal(w.drive.writes.length, writesBefore);
  assert.match(second.out, /already linked \(row has a fit_ref\): 3/);
  assert.match(second.out, /Nothing to write/);
});

test('is capped per run and reports how many are left', async () => {
  const rows = [row(1, T1), row(2, T2), row(5, T4)];
  const w = world(rows);
  const dir = zips();
  const first = await run(w, dir, { maxRows: 2 });
  assert.equal(w.writes.length, 2);
  assert.match(first.out, /1 left: re-run to continue/);
  await run(w, dir, { maxRows: 2 });
  assert.equal(w.writes.length, 3);
});

test('a run that stopped after the upload attaches the FIT already in Drive instead of uploading again', async () => {
  const rows = [row(1, T1)];
  const w = world(rows);
  const dir = zips();
  const real = w.api.write;
  w.api.write = async () => { throw new Error('API 500'); };
  const failed = await run(w, dir);
  assert.equal(failed.code, 1);
  assert.match(failed.err, /FAILED activity 9001/);
  assert.equal([...w.drive.files.values()].filter((f) => f.props.kind === 'fit').length, 1);

  w.api.write = real;
  const again = await run(w, dir);
  assert.equal(again.code, 0);
  assert.equal([...w.drive.files.values()].filter((f) => f.props.kind === 'fit').length, 1); // not uploaded twice
  assert.match(again.out, /reused 1 already in Drive/);
  assert.match(rows[0].fit_ref, /^file-/);
});

test('refuses when getWorkouts does not return fit_ref', async () => {
  const rows = [row(1, T1)];
  delete rows[0].fit_ref;
  const r = await run(world(rows), zips());
  assert.equal(r.code, 1);
  assert.match(r.err, /REFUSING: getWorkouts does not return fit_ref/);
});

test('no coordinate reaches the report', async () => {
  const r = await run(world([row(1, T1)]), zips());
  assert.doesNotMatch(r.out + r.err, /-?\d{2,3}\.\d{4,}/);
});

test('the track backfill then builds a track for a Garmin row, and ends an indoor FIT as no track', async () => {
  const rows = [row(1, T1), row(2, T2)];
  const w = world(rows);
  // row 1: outdoor; row 2: a FIT that holds one position only, as a stored FIT that turns out to have no usable track.
  const dir = tempDir();
  writeZip(dir, 'P.zip', [{ name: 'a.fit', data: fit(T1) }, { name: 'b.fit', data: fit(T2) }]);
  await run(w, dir);
  // Swap row 2's stored FIT for one with a single position: the backfill must record "none", not fail.
  w.drive.files.get(rows[1].fit_ref).bytes = makeFit([{ lat: 45, lon: -100, ms: T2 }], { timeCreated: new Date(T2) });
  // The Garmin activity archive file the row's raw_ref names, as import-159 lands it.
  for (const r of rows) {
    r.raw_ref = await w.archive.upsertActivity({ activityId: r.source_activity_id, startTimeGmt: 1 }, r.date).then((x) => x.fileId);
  }

  const out = [];
  const writes = [];
  const api = {
    async get() { return rows; },
    async write(action, p) { writes.push(p); Object.assign(rows.find((r) => r.id === p.id), p.changes); return {}; },
  };
  const code = await backfill({
    api, drive: w.drive, archive: createArchive(w.drive), garminArchive: w.archive, createTrackStep,
    trackVersion: TRACK_VERSION, pauseMs: 0, log: (l) => out.push(l), error: (l) => out.push(l),
  });
  const report = out.join('\n');
  assert.equal(code, 0, report);
  assert.deepEqual(writes.map((x) => x.id), ['w_1']);
  assert.deepEqual(Object.keys(writes[0].changes), ['track_ref']);
  const track = w.drive.files.get(rows[0].track_ref);
  assert.equal(track.props.kind, 'track');
  assert.match(w.drive.pathOf(rows[0].track_ref), /Thrive COROS\/tracks\/2026\/06\/9001\.json$/);
  assert.equal(track.data.properties.activity_id, '9001');
  assert.match(report, /w_2 .*no track/);
  assert.equal(w.drive.files.get(rows[1].raw_ref).data.track.status, 'none');
  assert.doesNotMatch(report, /-?\d{2,3}\.\d{4,}/);
});
