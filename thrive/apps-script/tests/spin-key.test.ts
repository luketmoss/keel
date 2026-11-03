// #765 - SPIN_API_KEY: a fourth kind of key caller that may run the seven SPIN_ACTIONS and
// nothing else, and the sheet rows of the new fields every read returns.

import { describe, it, expect } from 'vitest';
import { callEntry, callDoGet, workoutRow } from './apps-script-sandbox';
import { loadSpin, call, SPIN_KEY, MCP_KEY, WIDGET_KEY, rideWorkoutRow, EXAMPLE_STEPS, makeRide, saveRide } from './spin-fixtures';

const SPIN_ACTIONS = [
  'getRideWorkouts', 'saveRideWorkout', 'deleteRideWorkout', 'getFtp', 'addFtp', 'getPlannedWorkouts', 'saveRide',
];
const FORBIDDEN = { success: false, error: 'Spin caller: this action is not permitted', code: 'spin_forbidden' };
const REFUSED = { success: false, error: 'Invalid or missing API key' };

describe('the Spin key runs the seven SPIN_ACTIONS', () => {
  it('names exactly those seven', () => {
    expect([...loadSpin().sandbox.SPIN_ACTIONS]).toEqual(SPIN_ACTIONS);
  });

  it('runs each of them through doGet and doPost', () => {
    for (const entry of ['doGet', 'doPost'] as const) {
      const api = loadSpin({ rideWorkouts: [rideWorkoutRow()] });
      const run = (action: string, payload?: unknown, extra: Record<string, string> = {}) => callEntry<any>(
        api.sandbox, entry,
        { action, key: SPIN_KEY, ...(payload ? { payload: JSON.stringify(payload) } : {}), ...extra });

      expect(run('getRideWorkouts').res.success).toBe(true);
      expect(run('getFtp').res.data).toEqual({ current: null, history: [] });
      expect(run('getPlannedWorkouts', undefined, { date: '2026-11-07' }).res.data).toEqual([]);
      expect(run('addFtp', { id: 'f1', date: '2026-11-07', ftp_w: 250, source: 'manual' }).res.success).toBe(true);
      expect(run('saveRideWorkout', { name: 'A', category: 'Endurance', steps: EXAMPLE_STEPS }).res.success).toBe(true);
      expect(run('deleteRideWorkout', { id: 'rw_1a2b3c4d' }).res.data).toEqual({ id: 'rw_1a2b3c4d', deleted: true });

      const ride = makeRide();
      const saved = run('saveRide', ride.payload, { fit: ride.fit, streams: ride.streams });
      expect(saved.res.success, saved.text).toBe(true);
    }
  });
});

describe('the Spin key is refused on everything else, with text that names no action', () => {
  const others = [
    'getWorkouts', 'getWorkout', 'getWorkoutStreams', 'getWorkoutTrack', 'logDrink', 'getDrinkTotals',
    'getDrinks', 'createWorkout', 'updateWorkout', 'deleteWorkout', 'getSettings', 'upsertJournal',
    'requestSync', 'undoCall', 'getChangeLog', 'noSuchAction',
  ];
  for (const action of others) {
    it(`refuses ${action}, and nothing runs`, () => {
      const api = loadSpin({ workouts: [workoutRow({ id: 'w_001' })] });
      const before = JSON.stringify([api.rows, api.rideWorkoutRows, api.ftpRows]);
      const { res, text } = callEntry<any>(api.sandbox, 'doGet', {
        action, key: SPIN_KEY, id: 'w_001', payload: JSON.stringify({ id: 'x', data: { type: 'bike', name: 'x' } }),
      });
      expect(res).toEqual(FORBIDDEN);
      expect(text).not.toContain(action === 'noSuchAction' ? action : 'zzzz');
      expect(JSON.stringify([api.rows, api.rideWorkoutRows, api.ftpRows])).toBe(before);
      expect(api.lock.acquired).toBe(0);
    });
  }

  it('refuses a missing action the same way, quoting nothing', () => {
    const { res } = callEntry<any>(loadSpin().sandbox, 'doGet', { key: SPIN_KEY });
    expect(res).toEqual(FORBIDDEN);
  });
});

describe('the Spin key is identified last, so it never shadows a wider key', () => {
  it('API_KEY and MCP_API_KEY run every new action, as they run everything', () => {
    for (const key of ['test-key', MCP_KEY]) {
      const api = loadSpin({ rideWorkouts: [rideWorkoutRow()], changeLog: [] }); // MCP writes need the change log tab
      const asKey = (action: string, payload?: unknown) => call<any>(api, action, payload, key);
      expect(asKey('getRideWorkouts').res.success).toBe(true);
      expect(asKey('getFtp').res.success).toBe(true);
      expect(asKey('addFtp', { id: 'k', date: '2026-11-07', ftp_w: 250, source: 'manual' }).res.success).toBe(true);
      expect(asKey('getWorkouts').res.success).toBe(true);
    }
  });

  it('a Spin key set equal to API_KEY is the full key, not the narrow one', () => {
    const api = loadSpin({}, { properties: { SPIN_API_KEY: 'test-key' } });
    expect(call<any>(api, 'getWorkouts', undefined, 'test-key').res.success).toBe(true);
  });

  it('the widget key cannot run any Spin action', () => {
    for (const action of SPIN_ACTIONS) {
      const api = loadSpin();
      const { res } = callEntry<any>(api.sandbox, 'doGet', {
        action, key: WIDGET_KEY, date: '2026-11-07', payload: JSON.stringify({ id: 'x' }),
      });
      expect(res, action).toEqual({ success: false, error: 'Widget caller: this action is not permitted', code: 'widget_forbidden' });
    }
  });
});

describe('with SPIN_API_KEY unset or blank, that key and an empty key are refused as invalid', () => {
  for (const [name, properties] of [['unset', { SPIN_API_KEY: undefined }], ['blank', { SPIN_API_KEY: '' }]] as const) {
    it(`is refused when the property is ${name}`, () => {
      const api = loadSpin({}, { properties });
      for (const key of [SPIN_KEY, '']) {
        expect(callEntry<any>(api.sandbox, 'doGet', { action: 'getFtp', key }).res, key).toEqual(REFUSED);
      }
      // No key at all is refused the same way.
      expect(callEntry<any>(api.sandbox, 'doGet', { action: 'getFtp' }).res).toEqual(REFUSED);
    });
  }
});

describe('the nine new Workouts fields are on every read', () => {
  const NINE = ['avg_power_w', 'np_w', 'intensity_factor', 'tss', 'work_kj', 'ftp_w', 'intensity_pct', 'ride_workout_id', 'streams_ref'];

  it('getWorkout and getWorkouts return them, "" when unset', () => {
    const api = loadSpin({ workouts: [workoutRow({ id: 'w_001' })] });
    const one = callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_001' }).data;
    const list = callDoGet<any>(api.sandbox, { action: 'getWorkouts' }).data[0];
    for (const f of NINE) {
      expect(one[f], f).toBe('');
      expect(list[f], f).toBe('');
    }
  });

  it('a row written before the migration (30 cells) reads them as ""', () => {
    const api = loadSpin({ workouts: [workoutRow({ id: 'w_001' }).slice(0, 30)] });
    const w = callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_001' }).data;
    for (const f of NINE) expect(w[f], f).toBe('');
  });

  it('getPlannedWorkouts carries them too, and the Spin key can read them', () => {
    const api = loadSpin({
      workouts: [workoutRow({ id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-08', ride_workout_id: 'rw_1a2b3c4d' })],
    });
    const { res } = call<any>(api, 'getPlannedWorkouts', undefined, SPIN_KEY, { date: '2026-11-08' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].ride_workout_id).toBe('rw_1a2b3c4d');
    for (const f of NINE) expect(res.data[0], f).toHaveProperty(f);
  });

  it('a Spin ride shows its fields after saveRide', () => {
    const api = loadSpin();
    const ride = makeRide();
    expect(saveRide(api, ride).res.success).toBe(true);
    const w = callDoGet<any>(api.sandbox, { action: 'getWorkouts' }).data[0];
    expect(w).toMatchObject({ avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', ftp_w: '250', intensity_pct: '100' });
  });

  it('the Spin key refuses a malformed date for getPlannedWorkouts without quoting it', () => {
    const { res, text } = call<any>(loadSpin(), 'getPlannedWorkouts', undefined, SPIN_KEY, { date: 'banana' });
    expect(res).toEqual({ success: false, error: 'date must be YYYY-MM-DD', code: 'bad_request' });
    expect(text).not.toContain('banana');
  });

  it('a Spin payload that is not JSON is refused as bad_request without quoting it', () => {
    const api = loadSpin();
    const { res, text } = callEntry<any>(api.sandbox, 'doPost', { action: 'addFtp', key: SPIN_KEY, payload: '{"secret":nope' });
    expect(res.code).toBe('bad_request');
    expect(text).not.toContain('nope');
    const long = callEntry<any>(api.sandbox, 'doPost', { action: 'saveRideWorkout', key: SPIN_KEY, payload: JSON.stringify({ d: 'x'.repeat(6001) }) });
    expect(long.res.code).toBe('bad_request');
  });
});
