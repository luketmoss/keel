// #773 - saveRide reconciles with a COROS row the watch added first: exactly one source = coros
// bike/indoor row within 15 minutes takes the ride, and the end state is one row. Fake Drive, fake sheet.

import { describe, it, expect } from 'vitest';
import { workoutRow, type CellValue, type DriveNode } from './apps-script-sandbox';
import { loadSpin, makeRide, saveRide, driveFilesNamed, NOW } from './spin-fixtures';

const COROS_ID = '471166302945817204';

function setup(workouts: any[] = []) {
  const drive: Record<string, DriveNode> = {};
  const api = loadSpin({ workouts }, { drive, uuids: ['a1b2c3d4-0000'] });
  return { api, drive };
}

/**
 * The row the COROS sync wrote for the watch's recording: indoor bike, 10 minutes after the
 * phone's start (15:02:11Z), the watch's own numbers, its archive in raw_ref and its FIT.
 */
const corosRow = (overrides: Record<string, CellValue> = {}) => workoutRow({
  id: 'w_coros', date: '2026-11-07', time: '08:12', type: 'bike', sub_type: 'indoor', name: 'Indoor Cycling',
  source: 'coros', source_activity_id: COROS_ID, started_at_utc: '2026-11-07T08:12:11-07:00',
  elapsed_seconds: '3700', moving_seconds: '3620', avg_hr: '139', calories: '700', distance_m: '21000',
  ascent_m: '', descent_m: '', created: '2026-11-07T19:00:00.000Z', copied_from: 'w_src',
  raw_ref: 'corosArchive', fit_ref: 'corosFit', fit_fetched_at: '2026-11-07T19:00:00.000Z', synced_at: '2026-11-07T19:00:00.000Z',
  sport_type: '201', track_ref: 'trk', trails: '', status: '',
  ...overrides,
});

const fieldsOf = (api: { rows: CellValue[][]; sandbox: any }, i = 0): Record<string, CellValue> =>
  Object.fromEntries((api.sandbox.WORKOUT_FIELDS as string[]).map((f, c) => [f, api.rows[i][c]]));

describe('saveRide merges onto the one COROS row within 15 minutes', () => {
  it('answers merged with that row id, and leaves exactly one row for the ride', () => {
    const { api } = setup([corosRow()]);
    const ride = makeRide();
    const { res, text } = saveRide(api, ride);
    expect(res.success, text).toBe(true);
    expect(res.data).toMatchObject({ status: 'merged', id: 'w_coros', coros_activity_id: COROS_ID });
    expect(res.data.ambiguous_coros).toBeUndefined();
    expect(api.rows).toHaveLength(1);

    const w = fieldsOf(api);
    expect(w).toMatchObject({
      id: 'w_coros', created: '2026-11-07T19:00:00.000Z', copied_from: 'w_src',
      source: 'spin', source_activity_id: 'ride-1', coros_activity_id: COROS_ID, status: '', raw_ref: '',
      fit_ref: res.data.fit_ref, streams_ref: res.data.streams_ref,
      fit_fetched_at: NOW.toISOString(), synced_at: NOW.toISOString(),
      avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', ftp_w: '250',
      intensity_pct: '100', ride_workout_id: 'rw_1a2b3c4d',
      type: 'bike', sub_type: 'indoor',
    });
    expect(w.fit_ref).not.toBe('corosFit');
    expect(w.fit_ref).not.toBe('');
    expect(w.streams_ref).not.toBe('');
  });

  it('Spin is the authority for the ride: its date, time, start, durations, heart rate and calories replace the row', () => {
    const { api } = setup([corosRow()]);
    saveRide(api, makeRide());
    expect(fieldsOf(api)).toMatchObject({
      date: '2026-11-07', time: '08:02', started_at_utc: '2026-11-07T15:02:11Z',
      elapsed_seconds: '3645', moving_seconds: '3600', avg_hr: '141', calories: '683',
    });
  });

  it('keeps the row value where Spin sent null: avg_hr, calories and distance_m stay the watch', () => {
    const { api } = setup([corosRow()]);
    saveRide(api, makeRide({ avg_hr: null, calories: null, distance_m: null }));
    expect(fieldsOf(api)).toMatchObject({ avg_hr: '139', calories: '700', distance_m: '21000' });
    // And where Spin sends one, it wins.
    const second = setup([corosRow()]);
    saveRide(second.api, makeRide({ avg_hr: 150, distance_m: 22000 }));
    expect(fieldsOf(second.api)).toMatchObject({ avg_hr: '150', distance_m: '22000', calories: '683' });
  });

  it('keeps everything a COROS row owns that Spin does not: sport_type, track_ref, trails, ascent and descent', () => {
    const trails = '{"v":1,"m":1,"u":0,"n":[],"p":[]}';
    const { api } = setup([corosRow({ trails, ascent_m: '4', descent_m: '5', template_id: 'tpl_x', estimated_seconds: '3600' })]);
    saveRide(api, makeRide());
    expect(fieldsOf(api)).toMatchObject({
      sport_type: '201', track_ref: 'trk', trails, ascent_m: '4', descent_m: '5', template_id: 'tpl_x', estimated_seconds: '3600',
    });
  });

  it('name is Spin\'s unless the row carries a template_id or estimated_seconds, the marks of a claimed plan', () => {
    const plain = setup([corosRow()]);
    saveRide(plain.api, makeRide());
    expect(fieldsOf(plain.api).name).toBe('Sweet Spot 3x12');

    for (const mark of [{ template_id: 'tpl_x' }, { estimated_seconds: '3600' }] as Record<string, string>[]) {
      const claimed = setup([corosRow({ name: 'Planned Sweet Spot', ...mark })]);
      saveRide(claimed.api, makeRide());
      expect(fieldsOf(claimed.api).name, JSON.stringify(mark)).toBe('Planned Sweet Spot');
    }
  });

  it('Spin\'s non-blank notes and effort win, and blank ones leave the row\'s', () => {
    const wins = setup([corosRow({ notes: 'plan notes', effort: 'Easy' })]);
    saveRide(wins.api, makeRide({ notes: 'legs were heavy', effort: 'Hard' }));
    expect(fieldsOf(wins.api)).toMatchObject({ notes: 'legs were heavy', effort: 'Hard' });

    const blank = setup([corosRow({ notes: 'plan notes', effort: 'Easy' })]);
    saveRide(blank.api, makeRide({ notes: '', effort: null }));
    expect(fieldsOf(blank.api)).toMatchObject({ notes: 'plan notes', effort: 'Easy' });
  });

  it('a merged row is a Spin row from then on: the same saveRide again answers exists, writing nothing', () => {
    const { api, drive } = setup([corosRow()]);
    const ride = makeRide();
    const first = saveRide(api, ride).res.data;
    const rowsAfter = JSON.stringify(api.rows);
    const nodes = Object.keys(drive).length;
    const again = saveRide(api, ride);
    expect(again.res.data).toEqual({ status: 'exists', id: 'w_coros', fit_ref: first.fit_ref, streams_ref: first.streams_ref });
    expect(JSON.stringify(api.rows)).toBe(rowsAfter);
    expect(Object.keys(drive)).toHaveLength(nodes);
    expect(api.rows).toHaveLength(1);
  });

  it('after an attempt that wrote both files but not the row, a retry merges: one row, one file of each name', () => {
    const { api, drive } = setup([corosRow()]);
    const ride = makeRide();
    const merge = api.sandbox.mergeRideOntoCorosRow;
    api.sandbox.mergeRideOntoCorosRow = () => { throw new Error('execution timed out'); };
    const failed = saveRide(api, ride);
    expect(failed.res.success).toBe(false);
    expect(fieldsOf(api)).toMatchObject({ source: 'coros', source_activity_id: COROS_ID, raw_ref: 'corosArchive' });
    expect(driveFilesNamed(drive, 'ride-1.fit')).toHaveLength(1);
    const orphan = driveFilesNamed(drive, 'ride-1.fit')[0][0];

    api.sandbox.mergeRideOntoCorosRow = merge;
    const retry = saveRide(api, ride);
    expect(retry.res.data).toMatchObject({ status: 'merged', id: 'w_coros' });
    expect(api.rows).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.fit')).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.json')).toHaveLength(1);
    expect(drive[orphan].trashed).toBe(true);
    expect(fieldsOf(api).fit_ref).toBe(driveFilesNamed(drive, 'ride-1.fit')[0][0]);
  });

  it('is checked before the plan claim: a planned bike row of the day is left alone', () => {
    const plan = workoutRow({ id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-07', name: 'Plan' });
    const { api } = setup([plan, corosRow()]);
    const { res } = saveRide(api, makeRide());
    expect(res.data).toMatchObject({ status: 'merged', id: 'w_coros' });
    expect(fieldsOf(api, 0)).toMatchObject({ id: 'w_plan', status: 'planned', source: '' });
  });

  it('merges at exactly 15 minutes and not past it', () => {
    const edge = setup([corosRow({ started_at_utc: '2026-11-07T15:17:11Z' })]);
    expect(saveRide(edge.api, makeRide()).res.data.status).toBe('merged');
    const past = setup([corosRow({ started_at_utc: '2026-11-07T15:17:12Z' })]);
    expect(saveRide(past.api, makeRide()).res.data.status).toBe('created');
  });
});

describe('a COROS row is not always a candidate', () => {
  it('a COROS row 16 minutes away: the ride is appended, as in #765', () => {
    const { api } = setup([corosRow({ started_at_utc: '2026-11-07T15:18:11Z' })]);
    const { res } = saveRide(api, makeRide());
    expect(res.data).toMatchObject({ status: 'created', id: 'w_a1b2c3d4' });
    expect(res.data.ambiguous_coros).toBeUndefined();
    expect(api.rows).toHaveLength(2);
    expect(fieldsOf(api, 0)).toMatchObject({ id: 'w_coros', source: 'coros' });
  });

  it('a COROS row 16 minutes away leaves the day\'s one plan to be claimed, as in #765', () => {
    const plan = workoutRow({ id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-07', name: 'Plan', template_id: 'tpl_x' });
    const { api } = setup([plan, corosRow({ started_at_utc: '2026-11-07T15:18:11Z' })]);
    const { res } = saveRide(api, makeRide());
    expect(res.data).toMatchObject({ status: 'claimed', id: 'w_plan' });
    expect(api.rows).toHaveLength(2);
  });

  const notCandidates: [string, () => CellValue[]][] = [
    ['a planned COROS row', () => corosRow({ status: 'planned' })],
    ['a non-indoor COROS bike row', () => corosRow({ sub_type: 'gravel' })],
    ['a COROS row with no sub_type', () => corosRow({ sub_type: '' })],
    ['a COROS row of another type', () => corosRow({ type: 'run' })],
    ['a COROS row with a blank started_at_utc', () => corosRow({ started_at_utc: '' })],
    ['a hand-logged row', () => corosRow({ source: '', source_activity_id: '' })],
    ['another Spin ride', () => corosRow({ source: 'spin', source_activity_id: 'ride-0' })],
  ];
  for (const [label, make] of notCandidates) {
    it(`${label} is none: the ride is appended and nothing is merged`, () => {
      const { api } = setup([make()]);
      const { res } = saveRide(api, makeRide());
      expect(res.data.status).toBe('created');
      expect(res.data.ambiguous_coros).toBeUndefined();
      expect(api.rows).toHaveLength(2);
    });
  }

  it('two COROS candidates: the ride is appended and never refused, and ambiguous_coros names both', () => {
    const a = corosRow({ id: 'w_c1', source_activity_id: '111', started_at_utc: '2026-11-07T15:05:00Z' });
    const b = corosRow({ id: 'w_c2', source_activity_id: '222', started_at_utc: '2026-11-07T15:14:00Z' });
    const { api, drive } = setup([a, b]);
    const { res, text } = saveRide(api, makeRide());
    expect(res.success, text).toBe(true);
    expect(res.data).toMatchObject({ status: 'created', id: 'w_a1b2c3d4', ambiguous_coros: ['w_c1', 'w_c2'] });
    expect(api.rows).toHaveLength(3);
    expect(fieldsOf(api, 0)).toMatchObject({ id: 'w_c1', source: 'coros', raw_ref: 'corosArchive' });
    expect(fieldsOf(api, 1)).toMatchObject({ id: 'w_c2', source: 'coros' });
    expect(fieldsOf(api, 2)).toMatchObject({ source: 'spin', source_activity_id: 'ride-1', coros_activity_id: '' });
    expect(driveFilesNamed(drive, 'ride-1.fit')).toHaveLength(1);
  });

  it('two COROS candidates and one plan: the plan is claimed and the answer still names both rows', () => {
    const plan = workoutRow({ id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-07', name: 'Plan' });
    const a = corosRow({ id: 'w_c1', source_activity_id: '111', started_at_utc: '2026-11-07T15:05:00Z' });
    const b = corosRow({ id: 'w_c2', source_activity_id: '222', started_at_utc: '2026-11-07T15:14:00Z' });
    const { api } = setup([plan, a, b]);
    const { res } = saveRide(api, makeRide());
    expect(res.data).toMatchObject({ status: 'claimed', id: 'w_plan', ambiguous_coros: ['w_c1', 'w_c2'] });
  });

  it('an upload queue that treats any success: true as done is unaffected by the new statuses', () => {
    const { api } = setup([corosRow()]);
    const { res } = saveRide(api, makeRide());
    expect(res.success).toBe(true);
  });
});
