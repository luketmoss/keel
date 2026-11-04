// #765 - Workouts AE:AM: the Spin-owned columns are written by saveRide alone, the plan link AL
// is settable on a bike row, and every other full-row write leaves all nine as they were.

import { describe, it, expect } from 'vitest';
import { workoutRow, callDoGet } from './apps-script-sandbox';
import { loadSpin, call, rideWorkoutRow, NOW } from './spin-fixtures';

const SPIN_OWNED = ['avg_power_w', 'np_w', 'intensity_factor', 'tss', 'work_kj', 'ftp_w', 'intensity_pct', 'streams_ref'];
const NINE = [...SPIN_OWNED.slice(0, 7), 'ride_workout_id', 'streams_ref'];

const SPIN_VALUES = {
  avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683',
  ftp_w: '250', intensity_pct: '100', ride_workout_id: 'rw_1a2b3c4d', streams_ref: 'streamsFileId',
};

const spinRide = (overrides: Record<string, string> = {}) => workoutRow({
  id: 'w_ride', type: 'bike', sub_type: 'indoor', name: 'Ride', date: '2026-11-07',
  source: 'spin', source_activity_id: 'ride-1', ...SPIN_VALUES, ...overrides,
});

const run = (api: ReturnType<typeof loadSpin>, action: string, payload: unknown) =>
  call<any>(api, action, payload, 'test-key');

describe('createWorkout and updateWorkout refuse the Spin-owned fields', () => {
  for (const field of SPIN_OWNED) {
    it(`createWorkout refuses a value for ${field}, writing nothing`, () => {
      const api = loadSpin();
      const { res } = run(api, 'createWorkout', { data: { type: 'bike', name: 'x', [field]: '5' } });
      expect(res.success).toBe(false);
      expect(res.error).toContain(field);
      expect(api.rows).toEqual([]);
    });

    it(`updateWorkout refuses ${field}, even blank, leaving the row as it was`, () => {
      const api = loadSpin({ workouts: [spinRide()] });
      const before = JSON.stringify(api.rows);
      for (const value of ['5', '']) {
        const { res } = run(api, 'updateWorkout', { id: 'w_ride', changes: { [field]: value } });
        expect(res.success).toBe(false);
        expect(res.error).toContain(field);
      }
      expect(JSON.stringify(api.rows)).toBe(before);
    });
  }

  it('createWorkout accepts the nine fields blank, as the MCP Worker\'s new-workout object sends them', () => {
    const api = loadSpin();
    const blank = Object.fromEntries(NINE.map((f) => [f, '']));
    const { res, text } = run(api, 'createWorkout', { data: { type: 'bike', name: 'x', ...blank } });
    expect(res.success, text).toBe(true);
    expect(api.rows[0]).toHaveLength(40);
    for (let i = 30; i < 39; i++) expect(api.rows[0][i]).toBe('');
  });

  it('the Spin key cannot run either', () => {
    const api = loadSpin();
    const { res } = call<any>(api, 'updateWorkout', { id: 'w', changes: { tss: '1' } });
    expect(res.code).toBe('spin_forbidden');
  });
});

describe('ride_workout_id (AL) is settable on a bike row to an existing library id or ""', () => {
  const library = [rideWorkoutRow()];

  it('createWorkout sets it on a bike row to an existing id', () => {
    const api = loadSpin({ rideWorkouts: library });
    const { res, text } = run(api, 'createWorkout', {
      data: { type: 'bike', name: 'Planned spin', status: 'planned', ride_workout_id: 'rw_1a2b3c4d' },
    });
    expect(res.success, text).toBe(true);
    expect(res.data.ride_workout_id).toBe('rw_1a2b3c4d');
    expect(api.rows[0][37]).toBe('rw_1a2b3c4d');
  });

  it('updateWorkout sets and clears it, keeping every other field', () => {
    const api = loadSpin({
      rideWorkouts: library,
      workouts: [workoutRow({ id: 'w_bike', type: 'bike', name: 'Plan', status: 'planned', notes: 'keep', ...{ tss: '9' } })],
    });
    expect(run(api, 'updateWorkout', { id: 'w_bike', changes: { ride_workout_id: 'rw_1a2b3c4d' } }).res.success).toBe(true);
    expect(api.rows[0][37]).toBe('rw_1a2b3c4d');
    expect(api.rows[0][6]).toBe('keep');
    expect(api.rows[0][33]).toBe('9'); // AH tss, untouched
    expect(run(api, 'updateWorkout', { id: 'w_bike', changes: { ride_workout_id: '' } }).res.success).toBe(true);
    expect(api.rows[0][37]).toBe('');
  });

  it('refuses an unknown id, a malformed id, and a non-bike row', () => {
    const api = loadSpin({
      rideWorkouts: library,
      workouts: [workoutRow({ id: 'w_bike', type: 'bike' }), workoutRow({ id: 'w_weight', type: 'weight' })],
    });
    const before = JSON.stringify(api.rows);
    for (const [id, value] of [['w_bike', 'rw_unknown'], ['w_bike', 'has space'], ['w_weight', 'rw_1a2b3c4d']]) {
      const { res } = run(api, 'updateWorkout', { id, changes: { ride_workout_id: value } });
      expect(res.success, `${id} ${value}`).toBe(false);
      expect(res.error).toContain('ride_workout_id');
    }
    expect(run(api, 'createWorkout', { data: { type: 'weight', name: 'x', ride_workout_id: 'rw_1a2b3c4d' } }).res.success).toBe(false);
    expect(run(api, 'createWorkout', { data: { type: 'bike', name: 'x', ride_workout_id: 'rw_unknown' } }).res.success).toBe(false);
    expect(JSON.stringify(api.rows)).toBe(before);
    // Clearing is allowed on any row.
    expect(run(api, 'updateWorkout', { id: 'w_weight', changes: { ride_workout_id: '' } }).res.success).toBe(true);
  });

  it('is refused when the RideWorkouts tab does not exist', () => {
    const api = loadSpin({ workouts: [workoutRow({ id: 'w_bike', type: 'bike' })] });
    const get = api.sandbox.getSpreadsheet;
    api.sandbox.getSpreadsheet = () => ({ getSheetByName: (n: string) => (n === 'RideWorkouts' ? null : get().getSheetByName(n)) });
    expect(run(api, 'updateWorkout', { id: 'w_bike', changes: { ride_workout_id: 'rw_1a2b3c4d' } }).res.success).toBe(false);
  });

  it('an unrelated edit to a row whose link points at a deleted workout still works', () => {
    const api = loadSpin({ workouts: [workoutRow({ id: 'w_bike', type: 'bike', ride_workout_id: 'rw_gone' })] });
    expect(run(api, 'updateWorkout', { id: 'w_bike', changes: { notes: 'hello' } }).res.success).toBe(true);
    expect(api.rows[0][37]).toBe('rw_gone');
  });
});

describe('full-row writes leave AE:AM exactly as they were', () => {
  it('updateWorkout', () => {
    const api = loadSpin({ workouts: [spinRide()] });
    expect(run(api, 'updateWorkout', { id: 'w_ride', changes: { notes: 'edited', effort: 'Hard' } }).res.success).toBe(true);
    const w = callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_ride' }).data;
    for (const f of NINE) expect(w[f], f).toBe((SPIN_VALUES as any)[f]);
    expect(w.notes).toBe('edited');
  });

  it('upsertSyncedWorkout, on an update and on a plan claim', () => {
    const payload = (id: string, date: string) => ({
      source: 'coros', source_activity_id: id, synced_at: NOW.toISOString(), raw_ref: 'raw',
      incoming: { date, type: 'bike', name: 'Indoor Bike', elapsed_seconds: '3600' }, last_written: null,
    });
    const claimable = workoutRow({
      id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-08', name: 'Plan',
      ride_workout_id: 'rw_1a2b3c4d',
    });
    const api = loadSpin({ workouts: [claimable, spinRide({ source: 'coros', source_activity_id: 'c1' })] });
    const claimed = run(api, 'upsertSyncedWorkout', payload('c2', '2026-11-08'));
    expect(claimed.res.data.status).toBe('claimed');
    expect(api.rows[0][37]).toBe('rw_1a2b3c4d'); // the plan link survives the claim
    const updated = run(api, 'upsertSyncedWorkout', payload('c1', '2026-11-07'));
    expect(updated.res.data.status).toBe('updated');
    for (const [i, f] of NINE.entries()) expect(api.rows[1][30 + i], f).toBe((SPIN_VALUES as any)[f]);
  });

  it('enrichWorkout', () => {
    const hand = workoutRow({
      id: 'w_hand', type: 'weight', date: '2026-11-07', time: '07:00', ride_workout_id: '', ftp_w: '250', tss: '12',
    });
    const api = loadSpin({ workouts: [hand] });
    const { res, text } = run(api, 'enrichWorkout', {
      source_activity_id: 'act-1', raw_ref: 'raw', synced_at: NOW.toISOString(), last_written: null,
      activity: { date: '2026-11-07', time: '07:10', avg_hr: '120' },
    });
    expect(res.data.status, text).toBe('enriched');
    expect(api.rows[0][35]).toBe('250');
    expect(api.rows[0][33]).toBe('12');
    expect(api.rows[0]).toHaveLength(40);
  });
});
