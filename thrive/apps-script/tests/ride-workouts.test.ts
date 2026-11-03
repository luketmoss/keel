// #765 - the RideWorkouts library: saveRideWorkout, getRideWorkouts, deleteRideWorkout.

import { describe, it, expect } from 'vitest';
import { workoutRow } from './apps-script-sandbox';
import { loadSpin, call, rideWorkoutRow, EXAMPLE_STEPS, NOW } from './spin-fixtures';

const body = (overrides: Record<string, unknown> = {}) => ({
  name: 'Sweet Spot 3x12', category: 'Sweet spot', description: 'Three blocks', steps: EXAMPLE_STEPS, ...overrides,
});

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('saveRideWorkout', () => {
  it('stores the example steps and computes duration_s: 600 + 3 x (720 + 240) + 300 + 300 + 360 = 4440', () => {
    const api = loadSpin({}, { uuids: ['1a2b3c4d-0000'] });
    const { res, text } = call<any>(api, 'saveRideWorkout', body());
    expect(res.success, text).toBe(true);
    expect(res.data).toMatchObject({
      id: 'rw_1a2b3c4d', name: 'Sweet Spot 3x12', category: 'Sweet spot', description: 'Three blocks',
      duration_s: '4440', created: NOW.toISOString(), updated: NOW.toISOString(), last_ridden_date: '',
    });
    expect(res.data.steps).toEqual(EXAMPLE_STEPS);
    expect(api.rideWorkoutRows).toHaveLength(1);
    const row = api.rideWorkoutRows![0];
    expect(row).toHaveLength(8);
    expect(JSON.parse(row[4] as string)).toEqual(EXAMPLE_STEPS);
    expect(row[5]).toBe('4440');
  });

  it('never accepts duration_s from a caller', () => {
    const api = loadSpin();
    const { res } = call<any>(api, 'saveRideWorkout', body({ duration_s: 1 }));
    expect(res.data.duration_s).toBe('4440');
  });

  it('keeps the caller\'s id, and the same id sent again with a new name leaves one row with the original created', () => {
    const api = loadSpin();
    const first = call<any>(api, 'saveRideWorkout', body({ id: 'offline-1' }));
    expect(first.res.data.id).toBe('offline-1');
    const later = new Date('2026-12-01T00:00:00.000Z');
    api.sandbox.Date = new Proxy(Date, { construct: (t, a) => (a.length ? new (t as any)(...a) : new (t as any)(later)) });
    const again = call<any>(api, 'saveRideWorkout', body({ id: 'offline-1', name: 'Renamed' }));
    expect(again.res.success, again.text).toBe(true);
    expect(again.res.data).toMatchObject({ id: 'offline-1', name: 'Renamed', created: NOW.toISOString(), updated: later.toISOString() });
    expect(api.rideWorkoutRows).toHaveLength(1);
    expect(api.rideWorkoutRows![0][1]).toBe('Renamed');
    expect(api.rideWorkoutRows![0][6]).toBe(NOW.toISOString());
  });

  it('an unknown id appends beside the others', () => {
    const api = loadSpin({ rideWorkouts: [rideWorkoutRow()] });
    call(api, 'saveRideWorkout', body({ id: 'rw_other' }));
    expect(api.rideWorkoutRows).toHaveLength(2);
  });

  const refusals: [string, (steps: any) => unknown][] = [
    ['a nested repeat', (s) => { s.steps[1].steps.push({ repeat: 2, steps: [{ label: 'x', dur_s: 60, mode: 'free' }] }); return s; }],
    ['an unknown key', (s) => { s.steps[0].colour = 'red'; return s; }],
    ['pct 301', (s) => { s.steps[0].pct = 301; return s; }],
    ['pct_end 301', (s) => { s.steps[0].pct_end = 301; return s; }],
    ['grade 4.55', (s) => { s.steps[2].grade = 4.55; return s; }],
    ['grade 20.1', (s) => { s.steps[2].grade = 20.1; return s; }],
    ['grade -10.1', (s) => { s.steps[2].grade = -10.1; return s; }],
    ['a slope step carrying pct', (s) => { s.steps[2].pct = 80; return s; }],
    ['an erg step carrying level', (s) => { s.steps[0].level = 5; return s; }],
    ['a free step carrying a target', (s) => { s.steps[4].pct = 50; return s; }],
    ['an erg step with no pct', (s) => { delete s.steps[0].pct; return s; }],
    ['an unknown mode', (s) => { s.steps[0].mode = 'sprint'; return s; }],
    ['a blank label', (s) => { s.steps[0].label = '  '; return s; }],
    ['a 41 character label', (s) => { s.steps[0].label = 'x'.repeat(41); return s; }],
    ['dur_s 0', (s) => { s.steps[0].dur_s = 0; return s; }],
    ['dur_s 14401', (s) => { s.steps[0].dur_s = 14401; return s; }],
    ['a fractional dur_s', (s) => { s.steps[0].dur_s = 60.5; return s; }],
    ['a string dur_s', (s) => { s.steps[0].dur_s = '60'; return s; }],
    ['cadence 39', (s) => { s.steps[1].steps[0].cadence = 39; return s; }],
    ['cadence 151', (s) => { s.steps[1].steps[0].cadence = 151; return s; }],
    ['resistance level 101', (s) => { s.steps[3].level = 101; return s; }],
    ['a repeat of 1', (s) => { s.steps[1].repeat = 1; return s; }],
    ['a repeat of 51', (s) => { s.steps[1].repeat = 51; return s; }],
    ['a repeat with no steps', (s) => { s.steps[1].steps = []; return s; }],
    ['a repeat of 21 steps', (s) => { s.steps[1].steps = Array.from({ length: 21 }, () => ({ label: 'x', dur_s: 10, mode: 'free' })); return s; }],
    ['a repeat with another key', (s) => { s.steps[1].label = 'x'; return s; }],
    ['no steps', (s) => { s.steps = []; return s; }],
    ['101 blocks', (s) => { s.steps = Array.from({ length: 101 }, () => ({ label: 'x', dur_s: 10, mode: 'free' })); return s; }],
    ['another version', (s) => { s.v = 2; return s; }],
    ['a top-level extra key', (s) => { s.note = 'x'; return s; }],
    ['a total over 21600 s', (s) => { s.steps = [{ repeat: 50, steps: [{ label: 'x', dur_s: 440, mode: 'free' }] }]; return s; }],
    ['steps that are not an object', () => 'not json at all'],
    ['steps over 5000 characters', () => ({
      v: 1, steps: Array.from({ length: 58 }, (_, i) => ({ label: `Interval number ${i}`, dur_s: 60, mode: 'erg', pct: 100, pct_end: 110, cadence: 90 })),
    })],
  ];
  for (const [name, mutate] of refusals) {
    it(`refuses ${name} as bad_request, writing nothing`, () => {
      const api = loadSpin({ rideWorkouts: [rideWorkoutRow()] });
      const before = JSON.stringify(api.rideWorkoutRows);
      const { res, text } = call<any>(api, 'saveRideWorkout', body({ steps: mutate(clone(EXAMPLE_STEPS)) }));
      expect(res.success, text).toBe(false);
      expect(res.code).toBe('bad_request');
      expect(JSON.stringify(api.rideWorkoutRows)).toBe(before);
    });
  }

  it('the steps-over-5000 case is over 5000 characters but under the payload cap', () => {
    const steps = {
      v: 1, steps: Array.from({ length: 58 }, (_, i) => ({ label: `Interval number ${i}`, dur_s: 60, mode: 'erg', pct: 100, pct_end: 110, cadence: 90 })),
    };
    const text = JSON.stringify(steps);
    expect(text.length).toBeGreaterThan(5000);
    expect(JSON.stringify(body({ steps })).length).toBeLessThan(6000);
  });

  it('refuses an unknown category, a blank or long name, a long description and a bad id', () => {
    const cases: Record<string, unknown>[] = [
      { category: 'Tempo' }, { name: '' }, { name: '   ' }, { name: 'x'.repeat(81) }, { name: 5 },
      { description: 'x'.repeat(1001) }, { id: 'has space' }, { id: 'x'.repeat(65) }, { id: 5 },
    ];
    for (const c of cases) {
      const api = loadSpin();
      const { res } = call<any>(api, 'saveRideWorkout', body(c));
      expect(res.code, JSON.stringify(c)).toBe('bad_request');
      expect(api.rideWorkoutRows).toEqual([]);
    }
    expect(call<any>(loadSpin(), 'saveRideWorkout', []).res.code).toBe('bad_request');
  });

  it('accepts the five categories, an empty description, and steps as JSON text', () => {
    for (const category of ['Endurance', 'Sweet spot', 'Threshold', 'VO2', 'Recovery']) {
      const api = loadSpin();
      expect(call<any>(api, 'saveRideWorkout', body({ category, description: undefined })).res.data.category).toBe(category);
    }
    const api = loadSpin();
    const { res } = call<any>(api, 'saveRideWorkout', body({ steps: JSON.stringify(EXAMPLE_STEPS) }));
    expect(res.data.steps).toEqual(EXAMPLE_STEPS);
  });

  it('writes text: a formula-looking name is stored as text', () => {
    const api = loadSpin();
    call(api, 'saveRideWorkout', body({ name: '=SUM(1)' }));
    expect(api.rideWorkoutRows![0][1]).toBe('=SUM(1)');
  });

  it('takes the script lock, and a refusal quotes nothing the caller sent', () => {
    const api = loadSpin();
    call(api, 'saveRideWorkout', body());
    expect(api.lock.acquired).toBe(1);
    const { text } = call<any>(api, 'saveRideWorkout', body({ category: 'SECRETWORD' }));
    expect(text).not.toContain('SECRETWORD');
  });
});

describe('getRideWorkouts', () => {
  it('returns every row ordered by name, with parsed steps', () => {
    const api = loadSpin({
      rideWorkouts: [
        rideWorkoutRow({ id: 'rw_b', name: 'zebra' }),
        rideWorkoutRow({ id: 'rw_a', name: 'Alpha' }),
        rideWorkoutRow({ id: 'rw_c', name: 'beta' }),
      ],
    });
    const { res } = call<any>(api, 'getRideWorkouts', undefined);
    expect(res.data.map((w: any) => w.name)).toEqual(['Alpha', 'beta', 'zebra']);
    expect(res.data[0].steps).toEqual(EXAMPLE_STEPS);
    expect(Object.keys(res.data[0])).toEqual([
      'id', 'name', 'category', 'description', 'steps', 'duration_s', 'created', 'updated', 'last_ridden_date',
    ]);
  });

  it('is empty on an empty tab and on a missing one', () => {
    expect(call<any>(loadSpin(), 'getRideWorkouts', undefined).res.data).toEqual([]);
    const api = loadSpin();
    const sheets = api.sandbox.getSpreadsheet;
    api.sandbox.getSpreadsheet = () => ({ getSheetByName: (n: string) => (n === 'RideWorkouts' ? null : sheets().getSheetByName(n)) });
    expect(call<any>(api, 'getRideWorkouts', undefined).res.data).toEqual([]);
  });

  it('last_ridden_date is the newest date of a completed Spin ride of that workout, or ""', () => {
    const ridden = (id: string, date: string, extra: Record<string, string> = {}) => workoutRow({
      id, date, type: 'bike', source: 'spin', source_activity_id: id, ride_workout_id: 'rw_1a2b3c4d', ...extra,
    });
    const api = loadSpin({
      rideWorkouts: [rideWorkoutRow(), rideWorkoutRow({ id: 'rw_never', name: 'Never ridden' })],
      workouts: [
        ridden('w_1', '2026-10-01'),
        ridden('w_2', '2026-10-20'),
        ridden('w_3', '2026-10-10'),
        ridden('w_plan', '2026-11-30', { status: 'planned', source: '', source_activity_id: '' }),
        ridden('w_other_source', '2026-11-29', { source: 'coros' }),
        workoutRow({ id: 'w_elsewhere', date: '2026-11-01', source: 'spin', ride_workout_id: 'rw_never_linked' }),
      ],
    });
    const { res } = call<any>(api, 'getRideWorkouts', undefined);
    const byId = Object.fromEntries(res.data.map((w: any) => [w.id, w.last_ridden_date]));
    expect(byId).toEqual({ rw_1a2b3c4d: '2026-10-20', rw_never: '' });
  });

  it('shows steps as null for a hand-edited cell that is not JSON, rather than failing the list', () => {
    const api = loadSpin({ rideWorkouts: [rideWorkoutRow({ steps: 'oops' })] });
    expect(call<any>(api, 'getRideWorkouts', undefined).res.data[0].steps).toBeNull();
  });
});

describe('deleteRideWorkout', () => {
  it('removes the row and answers deleted: true, then deleted: false for the same id', () => {
    const api = loadSpin({ rideWorkouts: [rideWorkoutRow({ id: 'rw_a' }), rideWorkoutRow({ id: 'rw_b' })] });
    expect(call<any>(api, 'deleteRideWorkout', { id: 'rw_a' }).res.data).toEqual({ id: 'rw_a', deleted: true });
    expect(api.rideWorkoutRows).toHaveLength(1);
    expect(api.rideWorkoutRows![0][0]).toBe('rw_b');
    const again = call<any>(api, 'deleteRideWorkout', { id: 'rw_a' });
    expect(again.res).toEqual({ success: true, data: { id: 'rw_a', deleted: false } });
    expect(api.rideWorkoutRows).toHaveLength(1);
  });

  it('leaves the id on plans and rides that name it', () => {
    const api = loadSpin({
      rideWorkouts: [rideWorkoutRow()],
      workouts: [workoutRow({ id: 'w_plan', type: 'bike', status: 'planned', ride_workout_id: 'rw_1a2b3c4d' })],
    });
    call(api, 'deleteRideWorkout', { id: 'rw_1a2b3c4d' });
    expect(api.rows[0][37]).toBe('rw_1a2b3c4d');
  });

  it('refuses a missing or malformed id as bad_request', () => {
    expect(call<any>(loadSpin(), 'deleteRideWorkout', {}).res.code).toBe('bad_request');
    expect(call<any>(loadSpin(), 'deleteRideWorkout', { id: 'a b' }).res.code).toBe('bad_request');
  });
});
