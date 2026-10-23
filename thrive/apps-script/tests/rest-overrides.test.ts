// #583 - rest set by a caller: appendSets' `rest_plans` (a workout's template
// and section overrides, sent before the workout row exists) and
// setWorkoutRest (re-resolving a planned or active workout's rest targets).

import { describe, it, expect } from 'vitest';
import {
  loadApi, callDoGet, callEntry, exerciseRow, templateRow, workoutRow, type CellValue,
} from './apps-script-sandbox';

const NOW = new Date('2026-10-23T15:00:00.000Z');
const MCP = 'mcp-key';

function setup(fixtures: Parameters<typeof loadApi>[0] = {}) {
  const api = loadApi(
    { changeLog: [], ...fixtures },
    { now: NOW, properties: { MCP_API_KEY: MCP }, uuids: ['uuid-a', 'uuid-b', 'uuid-c'] },
  );
  const call = (action: string, payload?: unknown, key = 'test-key') =>
    callEntry<any>(api.sandbox, 'doGet', {
      action, key, ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
    }).res;
  return { ...api, call };
}

// The owner's Upper Push B, as the issue's criteria describe it.
const EX = [
  ['ex_cars', 'Shoulder CARs'], ['ex_ohp', 'OH Press'], ['ex_arnold', 'Arnold Press'],
  ['ex_lat', 'Lateral Raise'], ['ex_cgpu', 'Close Grip Push Ups'], ['ex_tri', 'Tricep Pushdown'],
  ['ex_abw', 'Ab Wheel'], ['ex_wext', 'Wrist Extensor'], ['ex_wflex', 'Wrist Flexor'],
];
const exercises = () => EX.map(([id, name]) => exerciseRow({ id, name }));

/** Upper Push B with Superset 1 rest at 1:00 and everything else Default. */
function upperPushB() {
  const t = (order: number, id: string, section: string, sets: string, rest = '') =>
    templateRow({
      template_id: 'tpl_upb', template_name: 'Upper Push B', order, exercise_id: id,
      exercise_name: EX.find((e) => e[0] === id)![1], section, sets, reps: '10', rest_s: rest,
    });
  return [
    t(1, 'ex_cars', 'warmup', '1'),
    t(2, 'ex_ohp', 'warmup', '1'),
    t(3, 'ex_ohp', 'primary', '4'),
    t(4, 'ex_arnold', 'SS1', '3', '60'),
    t(5, 'ex_lat', 'SS1', '3', '60'),
    t(6, 'ex_cgpu', 'SS2', '3'),
    t(7, 'ex_tri', 'SS2', '3'),
    t(8, 'ex_abw', 'burnout', '2'),
    t(9, 'ex_wext', 'burnout', '2'),
    t(10, 'ex_wflex', 'burnout', '2'),
  ];
}

/** The sets the MCP sends for a template: no rest field at all. */
function setsFor(workoutId: string, rows: CellValue[][]) {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const section = String(r[5]);
    for (let s = 1; s <= Number(r[6]); s++) {
      out.push({
        workout_id: workoutId, exercise_id: r[3], exercise_name: r[4], section,
        exercise_order: r[2], set_number: s, planned_reps: '10', weight: '', reps: '', effort: '',
      });
    }
  }
  return out;
}

const restByName = (setRows: CellValue[][], workoutId?: string) => {
  const out: Record<string, string[]> = {};
  for (const r of setRows) {
    if (workoutId && r[0] !== workoutId) continue;
    const key = `${r[2]} ${r[3]}`;
    (out[key] = out[key] || []).push(String(r[10]));
  }
  return out;
};

describe('appendSets with rest_plans', () => {
  it('fixes the #576 bug: the template named in the plan resolves before the workout row exists', () => {
    const tpl = upperPushB();
    // No workout row: the MCP appends sets first.
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    const res = s.call('appendSets', {
      sets: setsFor('w_new', tpl), rest_plans: { w_new: { template_id: 'tpl_upb' } },
    });
    expect(res.success, res.error).toBe(true);
    expect(restByName(s.setRows)['Lateral Raise SS1']).toEqual(['60', '60', '60']);
  });

  it('without a plan and without the workout row the template is not found (the old behaviour)', () => {
    const tpl = upperPushB();
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    s.call('appendSets', { sets: setsFor('w_new', tpl) });
    expect(restByName(s.setRows)['Lateral Raise SS1']).toEqual(['45', '45', '45']);
  });

  it('an entry rest outranks the template, which outranks the Settings default', () => {
    const tpl = upperPushB();
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    const res = s.call('appendSets', {
      sets: setsFor('w_new', tpl),
      rest_plans: { w_new: { template_id: 'tpl_upb', rest: [{ section: 'primary', rest_s: 120 }] } },
    });
    expect(res.success, res.error).toBe(true);
    expect(restByName(s.setRows)).toEqual({
      'Shoulder CARs warmup': [''],
      'OH Press warmup': [''],
      'OH Press primary': ['120', '120', '120', '120'],
      'Arnold Press SS1': ['15', '15', '15'],
      'Lateral Raise SS1': ['60', '60', '60'],
      'Close Grip Push Ups SS2': ['15', '15', '15'],
      'Tricep Pushdown SS2': ['45', '45', '45'],
      'Ab Wheel burnout': ['10', '10'],
      'Wrist Extensor burnout': ['10', '10'],
      'Wrist Flexor burnout': ['45', '45'],
    });
  });

  it('resolves each workout of one call independently', () => {
    const tpl = upperPushB();
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    // Superset 1 alone, so both workouts fit in one payload.
    const ss1 = tpl.filter((r) => r[5] === 'SS1');
    const res = s.call('appendSets', {
      sets: [...setsFor('w_a', ss1), ...setsFor('w_b', ss1)],
      rest_plans: {
        w_a: { template_id: 'tpl_upb', rest: [{ section: 'SS1', rest_s: 90, switch_s: 30 }] },
        w_b: { template_id: 'tpl_upb' },
      },
    });
    expect(res.success, res.error).toBe(true);
    expect(restByName(s.setRows, 'w_a')['Arnold Press SS1']).toEqual(['30', '30', '30']);
    expect(restByName(s.setRows, 'w_a')['Lateral Raise SS1']).toEqual(['90', '90', '90']);
    expect(restByName(s.setRows, 'w_b')['Arnold Press SS1']).toEqual(['15', '15', '15']);
    expect(restByName(s.setRows, 'w_b')['Lateral Raise SS1']).toEqual(['60', '60', '60']);
  });

  it('a blank template_id means no template: the overrides, then the Settings defaults', () => {
    const tpl = upperPushB();
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    s.call('appendSets', {
      sets: setsFor('w_x', tpl),
      rest_plans: { w_x: { template_id: '', rest: [{ section: 'SS1', rest_s: 75, switch_s: 20 }] } },
    });
    const rest = restByName(s.setRows);
    expect(rest['Arnold Press SS1']).toEqual(['20', '20', '20']);
    expect(rest['Lateral Raise SS1']).toEqual(['75', '75', '75']);
    expect(rest['OH Press primary']).toEqual(['90', '90', '90', '90']);
    expect(rest['Tricep Pushdown SS2']).toEqual(['45', '45', '45']);
  });

  it('null is the Settings default, past the template', () => {
    const tpl = upperPushB();
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    s.call('appendSets', {
      sets: setsFor('w_x', tpl),
      rest_plans: { w_x: { template_id: 'tpl_upb', rest: [{ section: 'SS1', rest_s: null }] } },
    });
    expect(restByName(s.setRows)['Lateral Raise SS1']).toEqual(['45', '45', '45']);
  });

  it('refuses a bad plan, naming the workout, the entry and its section, and writes nothing', () => {
    const tpl = upperPushB();
    const cases: [unknown, RegExp][] = [
      [{ section: 'primary', rest_s: 14 }, /rest_plans\.w_x rest\[0\] \(primary\): rest_s must be whole seconds, 15 to 600/],
      [{ section: 'SS1', rest_s: 601 }, /rest\[0\] \(SS1\): rest_s must be whole seconds, 15 to 600/],
      [{ section: 'SS1', switch_s: 121 }, /rest\[0\] \(SS1\): switch_s must be whole seconds, 0 to 120/],
      [{ section: 'SS1', switch_s: -1 }, /switch_s must be whole seconds, 0 to 120/],
      [{ section: 'SS1', rest_s: 60.5 }, /rest_s must be whole seconds/],
      [{ section: 'primary', switch_s: 10 }, /rest\[0\] \(primary\): switch_s applies only to SS1, SS2, SS3 and burnout/],
      [{ section: 'warmup', rest_s: 30 }, /rest\[0\] \(warmup\): section must be one of primary, SS1, SS2, SS3, burnout/],
      [{ section: 'SS1' }, /rest\[0\] \(SS1\): nothing to change/],
      [{ section: 'SS1', rest_s: 60, wait: 3 }, /rest\[0\] \(SS1\): unknown field "wait"/],
    ];
    for (const [entry, message] of cases) {
      const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
      const res = s.call('appendSets', { sets: setsFor('w_x', tpl), rest_plans: { w_x: { rest: [entry] } } });
      expect(res.success, JSON.stringify(entry)).toBe(false);
      expect(res.error).toMatch(message);
      expect(s.setRows).toHaveLength(0);
    }
    const s = setup({ exercises: exercises(), templates: tpl, workouts: [] });
    const twice = s.call('appendSets', {
      sets: setsFor('w_x', tpl),
      rest_plans: { w_x: { rest: [{ section: 'SS1', rest_s: 60 }, { section: 'SS1', switch_s: 5 }] } },
    });
    expect(twice.error).toMatch(/rest\[1\] \(SS1\): section SS1 is named twice/);
    expect(s.setRows).toHaveLength(0);
  });
});

/** A workout scheduled from Upper Push B, sets in the sheet, rest as the template and defaults resolve it. */
function scheduled(status: string) {
  const tpl = upperPushB();
  const s = setup({
    exercises: exercises(), templates: tpl,
    workouts: [workoutRow({ id: 'w_upb', template_id: 'tpl_upb', status })],
  });
  const res = s.call('appendSets', { sets: setsFor('w_upb', tpl) });
  expect(res.success, res.error).toBe(true);
  return s;
}

describe('setWorkoutRest', () => {
  it('dry run lists each changed set with its old and new target, and writes nothing', () => {
    const s = scheduled('planned');
    const before = JSON.stringify(s.setRows);
    const res = s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'burnout', rest_s: 60, switch_s: 5 }],
    });
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ dry_run: true, workout_id: 'w_upb', count: 6, kept_done: 0 });
    expect(res.data.changes.map((c: any) => `${c.exercise_name} ${c.set_number}: ${c.before}->${c.after}`)).toEqual([
      'Ab Wheel 1: 10->5', 'Ab Wheel 2: 10->5',
      'Wrist Extensor 1: 10->5', 'Wrist Extensor 2: 10->5',
      'Wrist Flexor 1: 45->60', 'Wrist Flexor 2: 45->60',
    ]);
    expect(JSON.stringify(s.setRows)).toBe(before);
  });

  it('confirm writes the named section only: 5 on Ab Wheel and Wrist Extensor, 60 on Wrist Flexor', () => {
    const s = scheduled('planned');
    const before = restByName(s.setRows);
    const res = s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'burnout', rest_s: 60, switch_s: 5 }], confirm: true,
    });
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ dry_run: false, count: 6 });
    expect(restByName(s.setRows)).toEqual({
      ...before,
      'Ab Wheel burnout': ['5', '5'],
      'Wrist Extensor burnout': ['5', '5'],
      'Wrist Flexor burnout': ['60', '60'],
    });
  });

  it('a rest given alone leaves the switch sets as they are', () => {
    const s = scheduled('planned');
    s.call('setWorkoutRest', { workout_id: 'w_upb', rest: [{ section: 'SS1', switch_s: 30 }], confirm: true });
    expect(restByName(s.setRows)['Arnold Press SS1']).toEqual(['30', '30', '30']);
    s.call('setWorkoutRest', { workout_id: 'w_upb', rest: [{ section: 'SS1', rest_s: 90 }], confirm: true });
    const rest = restByName(s.setRows);
    expect(rest['Arnold Press SS1']).toEqual(['30', '30', '30']);
    expect(rest['Lateral Raise SS1']).toEqual(['90', '90', '90']);
  });

  it('null puts a section back to the Settings default', () => {
    const s = scheduled('planned');
    s.call('setWorkoutRest', { workout_id: 'w_upb', rest: [{ section: 'SS1', rest_s: null }], confirm: true });
    expect(restByName(s.setRows)['Lateral Raise SS1']).toEqual(['45', '45', '45']);
  });

  it('an active workout keeps the targets of its done sets: OH Press sets 1-2 logged, 3-4 change', () => {
    const s = scheduled('active');
    const ohp = s.setRows.filter((r) => r[2] === 'OH Press' && r[3] === 'primary');
    ohp[0][8] = '5';      // set 1: reps logged
    ohp[1][11] = '42';    // set 2: Lift Mode's set_s, reps not yet saved
    ohp[2][7] = '95';     // set 3: a prescribed weight alone is not done
    const res = s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'primary', rest_s: 120 }], confirm: true,
    });
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ count: 2, kept_done: 2 });
    expect(restByName(s.setRows)['OH Press primary']).toEqual(['90', '90', '120', '120']);
    // Only K is written: the rest of each row is as it was.
    expect(ohp.map((r) => [r[7], r[8], r[11]])).toEqual([['', '5', ''], ['', '', '42'], ['95', '', ''], ['', '', '']]);
  });

  it('refuses a completed workout and writes nothing', () => {
    const s = scheduled('');
    const before = JSON.stringify(s.setRows);
    const res = s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'primary', rest_s: 120 }], confirm: true,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe(
      'Workout w_upb is completed: rest can be changed only on a planned or active workout. Nothing was written.');
    expect(JSON.stringify(s.setRows)).toBe(before);
  });

  it('refuses an unknown workout, a section the workout lacks, and a bad value, writing nothing', () => {
    const s = scheduled('planned');
    const before = JSON.stringify(s.setRows);
    expect(s.call('setWorkoutRest', { workout_id: 'w_nope', rest: [{ section: 'primary', rest_s: 120 }] }).error)
      .toBe('Workout "w_nope" not found');
    expect(s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'primary', rest_s: 120 }, { section: 'SS3', rest_s: 60 }], confirm: true,
    }).error).toBe('rest[1] (SS3): workout w_upb has no SS3 sets');
    expect(s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'primary', switch_s: 10 }], confirm: true,
    }).error).toMatch(/rest\[0\] \(primary\): switch_s applies only to SS1, SS2, SS3 and burnout/);
    expect(s.call('setWorkoutRest', { workout_id: 'w_upb', rest: [], confirm: true }).error)
      .toMatch(/rest is required/);
    expect(JSON.stringify(s.setRows)).toBe(before);
  });

  it('is logged with the MCP key and undone by undoCall, every target put back', () => {
    const s = scheduled('planned');
    const before = JSON.stringify(s.setRows);
    const dry = s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'burnout', rest_s: 60, switch_s: 5 }], call_id: 'dry',
    }, MCP);
    expect(dry.success, dry.error).toBe(true);
    expect(s.changeLogRows).toHaveLength(0);

    const res = s.call('setWorkoutRest', {
      workout_id: 'w_upb', rest: [{ section: 'burnout', rest_s: 60, switch_s: 5 }], confirm: true, call_id: 'rest-1',
    }, MCP);
    expect(res.success, res.error).toBe(true);
    const logged = s.changeLogRows!.map((r) => [String(r[1]), String(r[2]), String(r[3])]);
    expect(logged).toHaveLength(6);
    expect(logged.every(([id, action, tab]) => id === 'rest-1' && action === 'setWorkoutRest' && tab === 'Sets')).toBe(true);

    const undone = s.call('undoCall', { call_id: 'rest-1', confirm: true }, MCP);
    expect(undone.success, undone.error).toBe(true);
    expect(undone.data.count).toBe(6);
    expect(JSON.stringify(s.setRows)).toBe(before);
  });
});

describe('the round rule is shared', () => {
  it('appendSets without a plan resolves as before (#576 unchanged)', () => {
    const s = setup({ workouts: [workoutRow({ id: 'w_1' })] });
    const set = (exercise_id: string, exercise_order: number, set_number: number) => ({
      workout_id: 'w_1', exercise_id, exercise_name: exercise_id, section: 'SS1', exercise_order, set_number,
    });
    callDoGet<any>(s.sandbox, {
      action: 'appendSets',
      payload: JSON.stringify({ sets: [set('A', 1, 1), set('A', 1, 2), set('A', 1, 3), set('B', 2, 1), set('B', 2, 2)] }),
    });
    expect(s.setRows.map((r) => `${r[1]}${r[5]}:${r[10]}`)).toEqual(['A1:15', 'A2:15', 'A3:45', 'B1:45', 'B2:45']);
  });
});
