// #576: every path that creates a workout's sets writes each set's
// rest_target_s (Sets!K): planning or starting from a template, Build Custom,
// and copying a workout. Drives the REAL actions.ts + workouts-api.ts through
// an in-memory `../api/sheets`, with the Settings read (`getSettings`) faked.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workouts, sets, templates, toasts, activeWorkoutId, activeWorkoutSets } from './store';
import type { Template, TemplateRowWithRow, BuilderExercise } from '../api/types';
import { DEFAULT_REST_SETTINGS } from '../api/rest-times';

let sheet: { Workouts: string[][]; Sets: string[][]; Templates: string[][] };

const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;

function parseRange(range: string) {
  const [tab, cells] = range.split('!');
  const m = cells.match(/^([A-Z]+)(\d*):([A-Z]+)(\d*)$/);
  if (!m) throw new Error(`Unsupported range: ${range}`);
  const [, colStart, rowStart, colEnd, rowEnd] = m;
  return {
    tab: tab as keyof typeof sheet,
    colStart: colIndex(colStart),
    colEnd: colIndex(colEnd),
    rowStart: rowStart ? Number(rowStart) : null,
    rowEnd: rowEnd ? Number(rowEnd) : null,
  };
}

vi.mock('../api/sheets', () => ({
  SheetsApiError: class extends Error {
    status = 0;
  },
  withReauth: vi.fn(async (token: string, fn: (t: string) => Promise<unknown>) => fn(token)),
  sheetsGet: vi.fn(async (range: string) => {
    const { tab, colStart, colEnd, rowStart, rowEnd } = parseRange(range);
    const rows = sheet[tab];
    const out: string[][] = [];
    for (let r = rowStart ?? 2; r <= (rowEnd ?? rows.length + 1); r++) {
      if (rows[r - 2]) out.push(rows[r - 2].slice(colStart, colEnd + 1));
    }
    return out;
  }),
  sheetsUpdate: vi.fn(),
  sheetsAppend: vi.fn(async (range: string, values: (string | number)[][]) => {
    const [tab] = range.split('!') as [keyof typeof sheet];
    for (const row of values) sheet[tab].push(row.map(String));
  }),
  sheetsDeleteRow: vi.fn(),
  getSheetId: vi.fn(async () => 1),
}));

vi.mock('../api/demo-data', () => ({
  isDemo: () => false,
  DEMO_WORKOUTS: [],
  DEMO_SETS: [],
  DEMO_TEMPLATE_ROWS: [],
  shiftDemoWorkouts: (w: unknown) => w,
}));
vi.mock('../auth/reauth', () => ({ attemptReauth: vi.fn(), ReauthFailedError: class extends Error {} }));

const callAction = vi.fn();
vi.mock('../api/thrive-api', () => ({ callAction: (...a: unknown[]) => callAction(...a) }));

const { saveWorkoutForLater, startWorkout, copyWorkout, editTemplate } = await import('./actions');
const { resetRestSettings, saveRestSetting } = await import('./rest-settings');

const TOKEN = 'test-token';

/** Upper Push B, with Superset 1's rest at 1:00 and every other section at Default. */
function upperPushB(): Template {
  const row = (order: number, id: string, name: string, section: string, sets: string, rest = '') =>
    ({
      template_id: 'tpl_upb',
      template_name: 'Upper Push B',
      order,
      exercise_id: id,
      exercise_name: name,
      section,
      sets,
      reps: section === 'warmup' ? '' : '10',
      rest_s: rest,
      switch_s: '',
      sheetRow: order + 1,
    }) as TemplateRowWithRow;
  return {
    id: 'tpl_upb',
    name: 'Upper Push B',
    exercises: [
      row(1, 'ex_cars', 'Shoulder CARs', 'warmup', ''),
      row(2, 'ex_ohp', 'OH Press', 'warmup', ''),
      row(3, 'ex_ohp', 'OH Press', 'primary', '4'),
      row(4, 'ex_arnold', 'Arnold Press', 'SS1', '3', '60'),
      row(5, 'ex_lat', 'Lateral Raise', 'SS1', '3', '60'),
      row(6, 'ex_cgpu', 'Close Grip Push Ups', 'SS2', '3'),
      row(7, 'ex_tri', 'Tricep Pushdown', 'SS2', '3'),
      row(8, 'ex_abw', 'Ab Wheel', 'burnout', '2'),
      row(9, 'ex_wext', 'Wrist Extensor', 'burnout', '2'),
      row(10, 'ex_wflex', 'Wrist Flexor', 'burnout', '2'),
    ],
  };
}

const UPPER_PUSH_B_REST = {
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
};

/** Sets!K of one workout's rows, by "<exercise name> <section>". */
function restOf(workoutId: string) {
  const out: Record<string, string[]> = {};
  for (const r of sheet.Sets.filter((row) => row[0] === workoutId)) {
    expect(r, 'a new row is A:M').toHaveLength(13);
    (out[`${r[2]} ${r[3]}`] ??= []).push(r[10]);
  }
  return out;
}

const settingsAnswer = (over: Partial<typeof DEFAULT_REST_SETTINGS> = {}) =>
  callAction.mockImplementation(async (action: string) =>
    action === 'getSettings'
      ? { ok: true, data: { ...DEFAULT_REST_SETTINGS, water_goal_ml: 1893, ...over } }
      : { ok: true, data: { key: 'rest_primary_s', value: '200', updated: 'now' } },
  );

beforeEach(() => {
  sheet = { Workouts: [], Sets: [], Templates: [] };
  workouts.value = [];
  sets.value = [];
  templates.value = [upperPushB()];
  toasts.value = [];
  activeWorkoutId.value = null;
  activeWorkoutSets.value = [];
  callAction.mockReset();
  settingsAnswer();
  resetRestSettings();
});

const newestWorkoutId = () => sheet.Workouts[sheet.Workouts.length - 1][0];

describe('Resolution through the app', () => {
  it('starting from Upper Push B writes the issue’s values', async () => {
    const id = await startWorkout({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    expect(restOf(id)).toEqual(UPPER_PUSH_B_REST);
    expect(activeWorkoutSets.value.find((s) => s.section === 'primary')?.rest_target_s).toBe('90');
  });

  it('planning from Upper Push B writes the same values', async () => {
    await saveWorkoutForLater({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    expect(restOf(newestWorkoutId())).toEqual(UPPER_PUSH_B_REST);
  });

  it('uses the stored Settings defaults where a section is at Default', async () => {
    settingsAnswer({ rest_primary_s: 120, switch_burnout_s: 5 });
    const id = await startWorkout({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    const rest = restOf(id);
    expect(rest['OH Press primary']).toEqual(['120', '120', '120', '120']);
    expect(rest['Ab Wheel burnout']).toEqual(['5', '5']);
    expect(rest['Lateral Raise SS1']).toEqual(['60', '60', '60']);
  });

  it('falls back to the built-in defaults when Settings cannot be read', async () => {
    callAction.mockResolvedValue({ ok: false, kind: 'network' });
    const id = await startWorkout({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    expect(restOf(id)).toEqual(UPPER_PUSH_B_REST);
  });
});

describe('No template', () => {
  const custom: BuilderExercise[] = [
    { exercise_id: 'ex_wu', exercise_name: 'Band', section: 'warmup', sets: 1, planned_reps: '' },
    { exercise_id: 'ex_sq', exercise_name: 'Squat', section: 'primary', sets: 2, planned_reps: '5' },
    { exercise_id: 'ex_a', exercise_name: 'A', section: 'SS1', sets: 3, planned_reps: '10' },
    { exercise_id: 'ex_b', exercise_name: 'B', section: 'SS1', sets: 2, planned_reps: '10' },
  ];

  it('Build Custom takes the Settings defaults by the same rules, uneven rounds included', async () => {
    settingsAnswer({ rest_primary_s: 150 });
    const id = await startWorkout({ type: 'weight', name: 'Custom', exercises: custom }, TOKEN);
    expect(restOf(id)).toEqual({
      'Band warmup': [''],
      'Squat primary': ['150', '150'],
      'A SS1': ['15', '15', '45'],
      'B SS1': ['45', '45'],
    });
  });

  it('a planned Build Custom does too', async () => {
    await saveWorkoutForLater({ type: 'weight', name: 'Custom', exercises: custom }, TOKEN);
    expect(restOf(newestWorkoutId())['A SS1']).toEqual(['15', '15', '45']);
  });

  it('a copied workout takes the defaults, not the source template’s section rest', async () => {
    const source = await startWorkout({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    activeWorkoutId.value = null;
    const copy = await copyWorkout(source, TOKEN);
    expect(copy).not.toBe(source);
    expect(restOf(copy)).toEqual({ ...UPPER_PUSH_B_REST, 'Lateral Raise SS1': ['45', '45', '45'] });
  });
});

describe('No retroactive change', () => {
  it('a later Settings default or template rest leaves planned and started workouts alone', async () => {
    await saveWorkoutForLater({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    await startWorkout({ type: 'weight', name: 'Upper Push B', template_id: 'tpl_upb' }, TOKEN);
    const before = JSON.stringify(sheet.Sets);

    expect(await saveRestSetting('rest_primary_s', 200, TOKEN)).toBe(true);
    const tpl = templates.value[0];
    await editTemplate(
      tpl.id,
      tpl.name,
      tpl.exercises.map((e) => ({ ...e, rest_s: e.section === 'primary' ? '300' : (e.rest_s ?? '') })),
      tpl.exercises,
      TOKEN,
    );
    expect(JSON.stringify(sheet.Sets)).toBe(before);
  });
});
