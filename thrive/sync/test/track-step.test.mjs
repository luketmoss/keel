// #432 AC1 and AC2: the run's track step, over a fake archive.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DriveError } from '../src/drive.mjs';
import { DriveAuthError } from '../src/errors.mjs';
import { TRACK_VERSION } from '../src/track.mjs';
import { createTrackStep, trackSheetFields, trackSummary } from '../src/track-step.mjs';
import { line, makeFit } from './fit-fixture.mjs';

const OUTDOOR = { text: '1. Mountain Bike\nStart Coordinates: 45.0000, -100.0000\nDistance: 12 km' };
const INDOOR = { text: '1. Indoor Bike\nDistance: 12 km' };
const FIT = makeFit([...line(60), ...line(40, { lon0: -99.99, lat: 45.002 })].map((p, i) => ({ ...p, ms: p.ms + i * 1000 })));

/** The archive's track and FIT methods, with every call recorded. */
function fakeArchive({ fits = {}, tracks = {}, failures = {} } = {}) {
  const calls = [];
  let n = 0;
  const trackFiles = new Map(Object.entries(tracks));
  const archive = {
    calls,
    records: [],
    trackFiles,
    async readFit(id) {
      calls.push(['readFit', id]);
      if (failures.readFit) throw failures.readFit;
      return fits[id];
    },
    async findTrack(activityId) {
      calls.push(['findTrack', activityId]);
      const found = [...trackFiles.keys()].find((k) => k.startsWith(`trk-${activityId}`));
      return found ? { id: found } : null;
    },
    async storeTrack({ activityId, localDate, feature }) {
      calls.push(['storeTrack', activityId, localDate]);
      if (failures.storeTrack) throw failures.storeTrack;
      const id = `trk-${activityId}-${++n}`;
      trackFiles.set(id, feature);
      return id;
    },
    async replaceTrack(id, feature) {
      calls.push(['replaceTrack', id]);
      if (failures.replaceTrack) throw failures.replaceTrack;
      trackFiles.set(id, feature);
    },
    async writeTrack(fileId, track) {
      calls.push(['writeTrack', fileId]);
      if (failures.writeTrack) throw failures.writeTrack;
      archive.records.push(track);
    },
  };
  return archive;
}

const step = (archive) => createTrackStep({ archive, startedAt: '2026-10-19T12:00:00.000Z', log: () => {} });
const activity = (over = {}) => ({
  activityId: '4711', fileId: 'act-file', record: undefined,
  fitRef: 'fit-1', fitFetchedAt: '2026-10-19T06:00:00.000Z',
  listEntry: OUTDOOR, localDate: '2026-10-18', ...over,
});
const names = (archive) => archive.calls.map((c) => c[0]);

test('builds a track from the FIT in Drive, stores it by local date, records it and answers track_ref', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT } });
  const s = step(archive);
  const out = await s.ensure(activity());
  assert.match(out.track_ref, /^trk-4711-/);
  assert.deepEqual(names(archive), ['readFit', 'findTrack', 'storeTrack', 'writeTrack']);
  assert.deepEqual(archive.calls[2], ['storeTrack', '4711', '2026-10-18']);
  assert.deepEqual(archive.records[0], {
    status: 'stored', file_id: out.track_ref, fit_fetched_at: '2026-10-19T06:00:00.000Z',
    version: TRACK_VERSION, built_at: '2026-10-19T12:00:00.000Z', points: archive.records[0].points,
  });
  assert.ok(archive.records[0].points >= 2);
  assert.deepEqual(s.counts, { built: 1, rebuilt: 0, none: 0, unreadable: 0, failed: 0 });
  assert.equal(trackSummary(s), 'Tracks: 1 built, 0 rebuilt, 0 none, 0 unreadable, 0 failed.');
});

test('uses the bytes the run just downloaded, with no Drive read', async () => {
  const archive = fakeArchive();
  const out = await step(archive).ensure(activity({ bytes: FIT }));
  assert.ok(out.track_ref);
  assert.ok(!names(archive).includes('readFit'));
});

test('a later run with nothing changed downloads nothing and writes no track', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT } });
  const record = { status: 'stored', file_id: 'trk-4711-1', fit_fetched_at: '2026-10-19T06:00:00.000Z', version: TRACK_VERSION };
  const out = await step(archive).ensure(activity({ record }));
  assert.deepEqual(out, { track_ref: 'trk-4711-1' });
  assert.deepEqual(archive.calls, []);
});

test('a different FIT rebuilds the track in place: same Drive id, counted as rebuilt', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT }, tracks: { 'trk-4711-1': {} } });
  const record = { status: 'stored', file_id: 'trk-4711-1', fit_fetched_at: 'older', version: TRACK_VERSION };
  const s = step(archive);
  const out = await s.ensure(activity({ record }));
  assert.equal(out.track_ref, 'trk-4711-1');
  assert.deepEqual(names(archive), ['readFit', 'replaceTrack', 'writeTrack']);
  assert.equal(s.counts.rebuilt, 1);
  assert.equal(s.counts.built, 0);
});

test('an older format version rebuilds', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT }, tracks: { 'trk-4711-1': {} } });
  const record = { status: 'stored', file_id: 'trk-4711-1', fit_fetched_at: '2026-10-19T06:00:00.000Z', version: TRACK_VERSION - 1 };
  await step(archive).ensure(activity({ record }));
  assert.ok(names(archive).includes('replaceTrack'));
});

test('a Drive 404 on the replace finds or re-creates the file, and the new id is recorded', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT }, failures: {} });
  const real = archive.replaceTrack;
  archive.replaceTrack = async (id, f) => {
    if (id === 'trk-gone') {
      archive.calls.push(['replaceTrack', id]);
      throw new DriveError(404, 'File not found');
    }
    return real(id, f);
  };
  const record = { status: 'stored', file_id: 'trk-gone', fit_fetched_at: 'older', version: TRACK_VERSION };
  const out = await step(archive).ensure(activity({ record }));
  assert.match(out.track_ref, /^trk-4711-/);
  assert.notEqual(out.track_ref, 'trk-gone');
  assert.deepEqual(names(archive), ['readFit', 'replaceTrack', 'findTrack', 'storeTrack', 'writeTrack']);
});

test('adopts a track file already in Drive that the archive does not record, replacing it in place', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT }, tracks: { 'trk-4711-0': {} } });
  const out = await step(archive).ensure(activity());
  assert.equal(out.track_ref, 'trk-4711-0');
  assert.deepEqual(names(archive), ['readFit', 'findTrack', 'replaceTrack', 'writeTrack']);
});

test('an indoor session is none: no FIT download, no file, a blank track_ref', async () => {
  const archive = fakeArchive();
  const s = step(archive);
  const out = await s.ensure(activity({ listEntry: INDOOR }));
  assert.deepEqual(out, { track_ref: '' });
  assert.deepEqual(names(archive), ['writeTrack']);
  assert.equal(archive.records[0].status, 'none');
  assert.equal(archive.records[0].file_id, undefined);
  assert.equal(s.counts.none, 1);
});

test('a FIT with fewer than 2 valid positions is none, and no file is written', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': makeFit([{ lat: 45, lon: -100, ms: Date.UTC(2026, 5, 1) }]) } });
  const out = await step(archive).ensure(activity());
  assert.deepEqual(out, { track_ref: '' });
  assert.deepEqual(names(archive), ['readFit', 'writeTrack']);
  assert.equal(archive.records[0].status, 'none');
});

test('an unreadable FIT is a note naming the activity, not a failure, and is not retried', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': Buffer.from('garbage') } });
  const s = step(archive);
  const out = await s.ensure(activity());
  assert.deepEqual(out, { track_ref: '' });
  assert.equal(archive.records[0].status, 'unreadable');
  assert.deepEqual(s.failures, []);
  assert.deepEqual(s.notes, ['track 4711: the FIT could not be decoded, so no track was built']);
  assert.equal(s.counts.unreadable, 1);

  const again = fakeArchive({ fits: { 'fit-1': Buffer.from('garbage') } });
  await step(again).ensure(activity({ record: archive.records[0] }));
  assert.deepEqual(again.calls, []);
});

test('a FIT not stored yet (budget, unavailable) does nothing, and the track follows later', async () => {
  const archive = fakeArchive();
  const out = await step(archive).ensure(activity({ fitRef: '', fitFetchedAt: '' }));
  assert.deepEqual(out, { track_ref: '' });
  assert.deepEqual(archive.calls, []);
});

test('a Drive failure reading the FIT or writing the track records nothing, fails the run, and the next run tries again', async () => {
  for (const failures of [{ readFit: new DriveError(500, 'backend error') }, { storeTrack: new DriveError(503, 'unavailable') }]) {
    const archive = fakeArchive({ fits: { 'fit-1': FIT }, failures });
    const s = step(archive);
    const out = await s.ensure(activity());
    assert.deepEqual(out, { track_ref: '' });
    assert.equal(s.failures.length, 1);
    assert.match(s.failures[0], /^activity 4711: /);
    assert.deepEqual(archive.records, []);
    assert.equal(s.counts.failed, 1);
  }
});

test('a Drive failure keeps the track the row already has', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT }, failures: { replaceTrack: new DriveError(500, 'boom') } });
  const record = { status: 'stored', file_id: 'trk-4711-1', fit_fetched_at: 'older', version: TRACK_VERSION };
  const out = await step(archive).ensure(activity({ record }));
  assert.deepEqual(out, { track_ref: 'trk-4711-1' });
});

test('a failure writing the archive record fails the run and leaves track_ref as it was', async () => {
  const archive = fakeArchive({ fits: { 'fit-1': FIT }, failures: { writeTrack: new DriveError(500, 'boom') } });
  const s = step(archive);
  const out = await s.ensure(activity());
  assert.deepEqual(out, { track_ref: '' });
  assert.equal(s.failures.length, 1);
});

test('a Drive auth failure is not swallowed', async () => {
  const archive = fakeArchive({ failures: { readFit: new DriveAuthError('Drive answered 401') } });
  await assert.rejects(step(archive).ensure(activity()), DriveAuthError);
});

test('no coordinate ever reaches a failure, a note or a log line', async () => {
  const lines = [];
  const archive = fakeArchive({ fits: { 'fit-1': FIT, 'fit-2': Buffer.from('garbage') }, failures: {} });
  const s = createTrackStep({ archive, startedAt: 'now', log: (l) => lines.push(l) });
  await s.ensure(activity());
  await s.ensure(activity({ activityId: '4712', fitRef: 'fit-2' }));
  const text = [...lines, ...s.failures, ...s.notes].join('\n');
  assert.doesNotMatch(text, /-?\d{2,3}\.\d{3,}/);
});

test('trackSheetFields: a stored track is its file id, anything else is blank', () => {
  assert.deepEqual(trackSheetFields({ status: 'stored', file_id: 'x' }), { track_ref: 'x' });
  for (const status of ['none', 'unreadable']) assert.deepEqual(trackSheetFields({ status }), { track_ref: '' });
  assert.deepEqual(trackSheetFields(undefined), { track_ref: '' });
});
