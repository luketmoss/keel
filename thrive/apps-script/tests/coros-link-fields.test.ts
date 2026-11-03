// #773 - Workouts!AN coros_activity_id: read back as '' when unset, written by enrichRide and
// saveRide's merge alone, refused by createWorkout and updateWorkout (blank on create only), and
// kept exactly by every full-row write.

import { describe, it, expect } from 'vitest';
import { workoutRow, callDoGet, type CellValue } from './apps-script-sandbox';
import { loadSpin, call, makeRide, saveRide, NOW } from './spin-fixtures';

const LINK = '471166302945817204';

const linked = (overrides: Record<string, CellValue> = {}) => workoutRow({
  id: 'w_ride', type: 'bike', sub_type: 'indoor', name: 'Ride', date: '2026-11-07',
  source: 'spin', source_activity_id: 'ride-1', coros_activity_id: LINK, ...overrides,
});

const run = (api: ReturnType<typeof loadSpin>, action: string, payload: unknown) => call<any>(api, action, payload, 'test-key');

describe('the column', () => {
  it('is the 40th, AN, named coros_activity_id, and last in WORKOUT_FIELDS', () => {
    const { sandbox } = loadSpin();
    expect(sandbox.WORKOUT_FIELDS).toHaveLength(40);
    expect(sandbox.WORKOUT_FIELDS[39]).toBe('coros_activity_id');
    expect(sandbox.WORKOUT_COLUMN_COUNT).toBe(40);
    expect(sandbox.COL.COROS_ACTIVITY_ID).toBe(39);
  });

  it('getWorkout and getWorkouts return it, and "" when unset', () => {
    const api = loadSpin({ workouts: [linked(), workoutRow({ id: 'w_plain', type: 'weight' })] });
    const one = callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_ride' }).data;
    expect(one.coros_activity_id).toBe(LINK);
    const all = callDoGet<any>(api.sandbox, { action: 'getWorkouts' }).data;
    expect(all.map((w: any) => w.coros_activity_id)).toEqual([LINK, '']);
  });

  it('reads as "" from a row that predates it: 39 cells, as the sheet held before the migration', () => {
    const short = workoutRow({ id: 'w_old', type: 'weight' }).slice(0, 39);
    const api = loadSpin({ workouts: [short] });
    expect(callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_old' }).data.coros_activity_id).toBe('');
  });
});

describe('createWorkout and updateWorkout refuse it', () => {
  it('createWorkout refuses a value, writing nothing', () => {
    const api = loadSpin();
    const { res } = run(api, 'createWorkout', { data: { type: 'bike', name: 'x', coros_activity_id: LINK } });
    expect(res.success).toBe(false);
    expect(res.error).toContain('coros_activity_id');
    expect(api.rows).toEqual([]);
  });

  it('createWorkout accepts it blank, as the MCP Worker\'s new-workout object sends it', () => {
    const api = loadSpin();
    const { res, text } = run(api, 'createWorkout', { data: { type: 'bike', name: 'x', coros_activity_id: '' } });
    expect(res.success, text).toBe(true);
    expect(api.rows[0]).toHaveLength(40);
    expect(api.rows[0][39]).toBe('');
  });

  it('updateWorkout refuses it, even blank, leaving the row as it was', () => {
    const api = loadSpin({ workouts: [linked()] });
    const before = JSON.stringify(api.rows);
    for (const value of [LINK, '999', '']) {
      const { res } = run(api, 'updateWorkout', { id: 'w_ride', changes: { coros_activity_id: value } });
      expect(res.success, value).toBe(false);
      expect(res.error).toContain('coros_activity_id');
    }
    expect(JSON.stringify(api.rows)).toBe(before);
  });

  it('the Spin key cannot run either', () => {
    const api = loadSpin();
    expect(call<any>(api, 'updateWorkout', { id: 'w', changes: { coros_activity_id: '1' } }).res.code).toBe('spin_forbidden');
    expect(call<any>(api, 'createWorkout', { data: { type: 'bike', name: 'x' } }).res.code).toBe('spin_forbidden');
  });
});

describe('every full-row write keeps it exactly as it was', () => {
  it('updateWorkout', () => {
    const api = loadSpin({ workouts: [linked()] });
    expect(run(api, 'updateWorkout', { id: 'w_ride', changes: { notes: 'edited', effort: 'Hard' } }).res.success).toBe(true);
    expect(callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_ride' }).data.coros_activity_id).toBe(LINK);
    expect(api.rows[0]).toHaveLength(40);
  });

  it('upsertSyncedWorkout, on an update and on a plan claim', () => {
    const payload = (id: string, date: string) => ({
      source: 'coros', source_activity_id: id, synced_at: NOW.toISOString(), raw_ref: 'raw',
      incoming: { date, type: 'bike', name: 'Indoor Bike', elapsed_seconds: '3600' }, last_written: null,
    });
    const claimable = workoutRow({
      id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-08', name: 'Plan', coros_activity_id: '555',
    });
    const api = loadSpin({ workouts: [claimable, linked({ source: 'coros', source_activity_id: 'c1' })] });
    const claimed = run(api, 'upsertSyncedWorkout', payload('c2', '2026-11-08'));
    expect(claimed.res.data.status).toBe('claimed');
    expect(api.rows[0][39]).toBe('555'); // claimRow keeps AN
    const updated = run(api, 'upsertSyncedWorkout', payload('c1', '2026-11-07'));
    expect(updated.res.data.status).toBe('updated');
    expect(api.rows[1][39]).toBe(LINK);
  });

  it('enrichWorkout', () => {
    const hand = workoutRow({ id: 'w_hand', type: 'weight', date: '2026-11-07', time: '07:00', coros_activity_id: '777' });
    const api = loadSpin({ workouts: [hand] });
    const { res, text } = run(api, 'enrichWorkout', {
      source_activity_id: 'act-1', raw_ref: 'raw', synced_at: NOW.toISOString(), last_written: null,
      activity: { date: '2026-11-07', time: '07:10', avg_hr: '120' },
    });
    expect(res.data.status, text).toBe('enriched');
    expect(api.rows[0][39]).toBe('777');
    expect(api.rows[0]).toHaveLength(40);
  });

  it('saveRide\'s plan claim', () => {
    const plan = workoutRow({
      id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-07', name: 'Plan', coros_activity_id: '555',
    });
    const api = loadSpin({ workouts: [plan] });
    const { res, text } = saveRide(api, makeRide());
    expect(res.data.status, text).toBe('claimed');
    expect(api.rows[0][39]).toBe('555');
    expect(api.rows[0]).toHaveLength(40);
  });
});
