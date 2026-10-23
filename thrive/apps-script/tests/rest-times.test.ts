// #576 - rest times: the Settings defaults (getSettings, updateSetting), a
// template section's rest_s/switch_s (createTemplate, replaceTemplate,
// getTemplates), and the rest_target_s appendSets resolves for a new workout.

import { describe, it, expect } from 'vitest';
import {
  loadApi, callDoGet, exerciseRow, templateRow, setRow, workoutRow, type CellValue,
} from './apps-script-sandbox';

const NOW = new Date('2026-10-22T15:00:00.000Z');

function setup(fixtures: Parameters<typeof loadApi>[0] = {}) {
  const api = loadApi(fixtures, { now: NOW });
  const call = (action: string, payload?: unknown, extra: Record<string, string> = {}) =>
    callDoGet<any>(api.sandbox, {
      action, ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}), ...extra,
    });
  return { ...api, call };
}

const DEFAULTS = {
  rest_primary_s: 90, rest_superset_s: 45, switch_superset_s: 15, rest_burnout_s: 45, switch_burnout_s: 10,
};

describe('Settings defaults', () => {
  it('getSettings supplies every default with the tab absent, or present and empty', () => {
    expect(setup().call('getSettings').data).toEqual({ ...DEFAULTS, water_goal_ml: 1893 });
    expect(setup({ settings: [] }).call('getSettings').data).toEqual({ ...DEFAULTS, water_goal_ml: 1893 });
  });

  it('stores each of the five keys and reads it back; the others keep their defaults', () => {
    const s = setup({ settings: [] });
    const res = s.call('updateSetting', { key: 'rest_primary_s', value: 120 });
    expect(res.success, res.error).toBe(true);
    expect(res.data).toEqual({ key: 'rest_primary_s', value: '120', updated: NOW.toISOString() });
    s.call('updateSetting', { key: 'switch_burnout_s', value: 0 });
    expect(s.call('getSettings').data).toEqual({
      ...DEFAULTS, rest_primary_s: 120, switch_burnout_s: 0, water_goal_ml: 1893,
    });
    s.call('updateSetting', { key: 'rest_primary_s', value: 150 });
    expect(s.settingRows!.filter((r) => r[0] === 'rest_primary_s')).toHaveLength(1);
    expect(s.call('getSettings').data.rest_primary_s).toBe(150);
  });

  it('accepts the bounds: rest 15-600, switch 0-120', () => {
    const s = setup({ settings: [] });
    for (const key of ['rest_primary_s', 'rest_superset_s', 'rest_burnout_s']) {
      expect(s.call('updateSetting', { key, value: 15 }).success, key).toBe(true);
      expect(s.call('updateSetting', { key, value: 600 }).success, key).toBe(true);
    }
    for (const key of ['switch_superset_s', 'switch_burnout_s']) {
      expect(s.call('updateSetting', { key, value: 0 }).success, key).toBe(true);
      expect(s.call('updateSetting', { key, value: 120 }).success, key).toBe(true);
    }
  });

  it('refuses a rest outside 15-600 or a switch outside 0-120, naming the key and range, and stores nothing', () => {
    const s = setup({ settings: [] });
    for (const key of ['rest_primary_s', 'rest_superset_s', 'rest_burnout_s']) {
      for (const value of [14, 601, 0, -15, 90.5, 'soon', null]) {
        const res = s.call('updateSetting', { key, value });
        expect(res.success, `${key} ${value}`).toBe(false);
        expect(res.error).toBe(`${key} must be whole seconds, 15 to 600`);
      }
    }
    for (const key of ['switch_superset_s', 'switch_burnout_s']) {
      for (const value of [-1, 121, 7.5, '']) {
        const res = s.call('updateSetting', { key, value });
        expect(res.success, `${key} ${value}`).toBe(false);
        expect(res.error).toBe(`${key} must be whole seconds, 0 to 120`);
      }
    }
    expect(s.settingRows).toHaveLength(0);
  });

  it('names every settable key when refusing an unknown one', () => {
    const res = setup({ settings: [] }).call('updateSetting', { key: 'rest_warmup_s', value: 30 });
    expect(res.error).toBe(
      'only water_goal_ml, rest_primary_s, rest_superset_s, switch_superset_s, rest_burnout_s, ' +
      'switch_burnout_s can be set');
  });

  it('reads a stored value outside its range as the default', () => {
    const s = setup({ settings: [['rest_primary_s', '5', ''], ['switch_superset_s', 'x', '']] });
    expect(s.call('getSettings').data).toMatchObject({ rest_primary_s: 90, switch_superset_s: 15 });
  });
});

// The owner's Upper Push B, as the issue's resolution criterion describes it.
const EX = [
  ['ex_cars', 'Shoulder CARs'], ['ex_ohp', 'OH Press'], ['ex_arnold', 'Arnold Press'],
  ['ex_lat', 'Lateral Raise'], ['ex_cgpu', 'Close Grip Push Ups'], ['ex_tri', 'Tricep Pushdown'],
  ['ex_abw', 'Ab Wheel'], ['ex_wext', 'Wrist Extensor'], ['ex_wflex', 'Wrist Flexor'],
];
const exercises = () => EX.map(([id, name]) => exerciseRow({ id, name }));

function upperPushB(ss1Rest = '') {
  const t = (order: number, id: string, section: string, sets: string, rest = '', sw = '') =>
    templateRow({
      template_id: 'tpl_upb', template_name: 'Upper Push B', order, exercise_id: id,
      exercise_name: EX.find((e) => e[0] === id)![1], section, sets, reps: '10', rest_s: rest, switch_s: sw,
    });
  return [
    t(1, 'ex_cars', 'warmup', '1'),
    t(2, 'ex_ohp', 'warmup', '1'),
    t(3, 'ex_ohp', 'primary', '4'),
    t(4, 'ex_arnold', 'SS1', '3', ss1Rest),
    t(5, 'ex_lat', 'SS1', '3', ss1Rest),
    t(6, 'ex_cgpu', 'SS2', '3'),
    t(7, 'ex_tri', 'SS2', '3'),
    t(8, 'ex_abw', 'burnout', '2'),
    t(9, 'ex_wext', 'burnout', '2'),
    t(10, 'ex_wflex', 'burnout', '2'),
  ];
}

/** The sets a scheduler sends for a template: no rest field at all. */
function setsFor(workoutId: string, rows: CellValue[][]) {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const section = String(r[5]);
    const n = section === 'warmup' ? 1 : Number(r[6]);
    for (let s = 1; s <= n; s++) {
      out.push({
        workout_id: workoutId, exercise_id: r[3], exercise_name: r[4], section,
        exercise_order: r[2], set_number: s, planned_reps: section === 'warmup' ? '' : '10',
        weight: '', reps: '', effort: '',
      });
    }
  }
  return out;
}

const restByName = (setRows: CellValue[][]) => {
  const out: Record<string, string[]> = {};
  for (const r of setRows) {
    const key = `${r[2]} ${r[3]}`;
    (out[key] = out[key] || []).push(String(r[10]));
  }
  return out;
};

describe('Resolution: appendSets writes rest_target_s', () => {
  it('Upper Push B with Superset 1 rest at 1:00 and everything else Default', () => {
    const tpl = upperPushB('60');
    const s = setup({
      exercises: exercises(), templates: tpl,
      workouts: [workoutRow({ id: 'w_upb', template_id: 'tpl_upb', status: 'planned' })],
    });
    const res = s.call('appendSets', { sets: setsFor('w_upb', tpl) });
    expect(res.success, res.error).toBe(true);
    expect(restByName(s.setRows)).toEqual({
      'Shoulder CARs warmup': [''],
      'OH Press warmup': [''],
      'OH Press primary': ['90', '90', '90', '90'],
      'Arnold Press SS1': ['15', '15', '15'],
      'Lateral Raise SS1': ['60', '60', '60'],
      'Close Grip Push Ups SS2': ['15', '15', '15'],
      'Tricep Pushdown SS2': ['45', '45', '45'],
      'Ab Wheel burnout': ['10', '10'],
      'Wrist Extensor burnout': ['10', '10'],
      'Wrist Flexor burnout': ['45', '45'],
    });
    expect(res.data[2].rest_target_s).toBe('90');
  });

  it('takes the Settings defaults as they are when the sets are created', () => {
    const tpl = upperPushB();
    const s = setup({
      exercises: exercises(), templates: tpl,
      settings: [['rest_primary_s', '120', ''], ['switch_burnout_s', '5', '']],
      workouts: [workoutRow({ id: 'w_upb', template_id: 'tpl_upb' })],
    });
    s.call('appendSets', { sets: setsFor('w_upb', tpl) });
    const rest = restByName(s.setRows);
    expect(rest['OH Press primary']).toEqual(['120', '120', '120', '120']);
    expect(rest['Wrist Extensor burnout']).toEqual(['5', '5']);
    expect(rest['Lateral Raise SS1']).toEqual(['45', '45', '45']);
  });

  it('uneven rounds: A has 3 sets and B has 2, so A set 3 gets the round rest', () => {
    const s = setup({ workouts: [workoutRow({ id: 'w_1' })] });
    const set = (exercise_id: string, exercise_order: number, set_number: number) => ({
      workout_id: 'w_1', exercise_id, exercise_name: exercise_id, section: 'SS1', exercise_order, set_number,
    });
    s.call('appendSets', { sets: [set('A', 1, 1), set('A', 1, 2), set('A', 1, 3), set('B', 2, 1), set('B', 2, 2)] });
    expect(s.setRows.map((r) => `${r[1]}${r[5]}:${r[10]}`)).toEqual(['A1:15', 'A2:15', 'A3:45', 'B1:45', 'B2:45']);
  });

  it('a workout with no template, or an unknown one, takes the defaults', () => {
    const s = setup({ workouts: [workoutRow({ id: 'w_1' }), workoutRow({ id: 'w_2', template_id: 'tpl_gone' })] });
    s.call('appendSets', { sets: [
      { workout_id: 'w_1', exercise_id: 'x', section: 'primary', exercise_order: 1, set_number: 1 },
      { workout_id: 'w_2', exercise_id: 'x', section: 'burnout', exercise_order: 1, set_number: 1 },
      { workout_id: 'w_2', exercise_id: 'y', section: 'cooldown', exercise_order: 2, set_number: 1 },
    ] });
    expect(s.setRows.map((r) => r[10])).toEqual(['90', '45', '']);
  });

  it('keeps a rest_target_s the caller sends, blank included, and computes none for that workout', () => {
    const s = setup({ workouts: [workoutRow({ id: 'w_1' })] });
    s.call('appendSets', { sets: [
      { workout_id: 'w_1', exercise_id: 'x', section: 'primary', exercise_order: 1, set_number: 1, rest_target_s: '75' },
      { workout_id: 'w_1', exercise_id: 'x', section: 'primary', exercise_order: 1, set_number: 2 },
    ] });
    expect(s.setRows.map((r) => r[10])).toEqual(['75', '']);
  });

  it('no retroactive change: a later default or template change leaves written sets alone', () => {
    const tpl = upperPushB();
    const s = setup({
      exercises: exercises(), templates: tpl, settings: [],
      workouts: [workoutRow({ id: 'w_upb', template_id: 'tpl_upb' })],
    });
    s.call('appendSets', { sets: setsFor('w_upb', tpl) });
    const before = JSON.stringify(s.setRows);
    s.call('updateSetting', { key: 'rest_primary_s', value: 200 });
    s.call('replaceTemplate', {
      template_id: 'tpl_upb',
      data: { exercises: [{ exercise: 'ex_ohp', section: 'primary', sets: 4, reps: '5', rest_s: 300 }] },
    });
    expect(JSON.stringify(s.setRows)).toBe(before);
  });
});

describe('Template sections carry rest', () => {
  it('getTemplates reads rest_s and switch_s, blank where unset', () => {
    const s = setup({ templates: upperPushB('60') });
    const [tpl] = s.call('getTemplates').data;
    const ss1 = tpl.exercises.filter((e: any) => e.section === 'SS1');
    expect(ss1.map((e: any) => [e.rest_s, e.switch_s])).toEqual([['60', ''], ['60', '']]);
    expect(tpl.exercises[2]).toMatchObject({ section: 'primary', rest_s: '', switch_s: '' });
  });

  it('createTemplate writes a section value to every row of it, and blank where none is given', () => {
    const s = setup({ exercises: exercises() });
    const res = s.call('createTemplate', { data: { name: 'T', exercises: [
      { exercise: 'ex_ohp', section: 'primary', sets: 4, reps: '5', rest_s: 120 },
      { exercise: 'ex_arnold', section: 'SS1', sets: 3, reps: '10', rest_s: 60, switch_s: 20 },
      { exercise: 'ex_lat', section: 'SS1', sets: 3, reps: '12' },
      { exercise: 'ex_abw', section: 'burnout', sets: 2, reps: '10' },
    ] } });
    expect(res.success, res.error).toBe(true);
    expect(s.templateRows.map((r) => [r[5], r[8], r[9]])).toEqual([
      ['primary', '120', ''], ['SS1', '60', '20'], ['SS1', '60', '20'], ['burnout', '', ''],
    ]);
  });

  it('refuses a value out of range, a switch on primary, rest on a warm-up, and two values for one section', () => {
    const s = setup({ exercises: exercises() });
    const create = (exs: unknown[]) => s.call('createTemplate', { data: { name: 'T', exercises: exs } });
    expect(create([{ exercise: 'ex_ohp', section: 'primary', sets: 1, reps: '5', rest_s: 10 }]).error)
      .toMatch(/rest_s must be whole seconds, 15 to 600, or blank/);
    expect(create([{ exercise: 'ex_ohp', section: 'SS1', sets: 1, reps: '5', switch_s: 121 }]).error)
      .toMatch(/switch_s must be whole seconds, 0 to 120, or blank/);
    expect(create([{ exercise: 'ex_ohp', section: 'primary', sets: 1, reps: '5', switch_s: 10 }]).error)
      .toMatch(/switch_s applies only to SS1, SS2, SS3 and burnout/);
    expect(create([{ exercise: 'ex_ohp', section: 'warmup', sets: 1, reps: '', rest_s: 30 }]).error)
      .toMatch(/section "warmup" has no rest/);
    expect(create([
      { exercise: 'ex_arnold', section: 'SS1', sets: 3, reps: '10', rest_s: 60 },
      { exercise: 'ex_lat', section: 'SS1', sets: 3, reps: '10', rest_s: 75 },
    ]).error).toMatch(/every exercise in section SS1 must have the same rest_s/);
    expect(s.templateRows).toHaveLength(0);
  });

  it('replaceTemplate keeps a section value the payload says nothing about, as the MCP sends it', () => {
    const s = setup({ exercises: exercises(), templates: upperPushB('60') });
    const res = s.call('replaceTemplate', { template_id: 'tpl_upb', data: { exercises: [
      { exercise: 'ex_ohp', section: 'primary', sets: 5, reps: '5' },
      { exercise: 'ex_arnold', section: 'SS1', sets: 3, reps: '10' },
      { exercise: 'ex_lat', section: 'SS1', sets: 3, reps: '12' },
      { exercise: 'ex_cgpu', section: 'SS1', sets: 3, reps: '12' },
    ] } });
    expect(res.success, res.error).toBe(true);
    expect(s.templateRows.map((r) => [r[4], r[8], r[9]])).toEqual([
      ['OH Press', '', ''], ['Arnold Press', '60', ''], ['Lateral Raise', '60', ''], ['Close Grip Push Ups', '60', ''],
    ]);
  });

  it('replaceTemplate blanks a section value only when asked to, with an explicit blank', () => {
    const s = setup({ exercises: exercises(), templates: upperPushB('60') });
    s.call('replaceTemplate', { template_id: 'tpl_upb', data: { exercises: [
      { exercise: 'ex_arnold', section: 'SS1', sets: 3, reps: '10', rest_s: '' },
      { exercise: 'ex_lat', section: 'SS1', sets: 3, reps: '12' },
    ] } });
    expect(s.templateRows.map((r) => r[8])).toEqual(['', '']);
  });

  it('an exercise moved to another section takes that section values', () => {
    const tpl = upperPushB('60');
    tpl[5][8] = '90'; tpl[6][8] = '90'; // SS2 rest 1:30
    const s = setup({ exercises: exercises(), templates: tpl });
    s.call('replaceTemplate', { template_id: 'tpl_upb', data: { exercises: [
      { exercise: 'ex_arnold', section: 'SS2', sets: 3, reps: '10' },
      { exercise: 'ex_tri', section: 'SS2', sets: 3, reps: '10' },
    ] } });
    expect(s.templateRows.map((r) => r[8])).toEqual(['90', '90']);
  });

  it('an exercise rename leaves a template rest alone', () => {
    const s = setup({ exercises: exercises(), templates: upperPushB('60'), sets: [setRow({ rest_target_s: '60' })] });
    const res = s.call('updateExercise', { id: 'ex_arnold', changes: { name: 'Arnold Press DB' } });
    expect(res.success, res.error).toBe(true);
    const arnold = s.templateRows.find((r) => r[3] === 'ex_arnold')!;
    expect([arnold[4], arnold[8]]).toEqual(['Arnold Press DB', '60']);
    expect(s.setRows[0][10]).toBe('60');
  });
});
