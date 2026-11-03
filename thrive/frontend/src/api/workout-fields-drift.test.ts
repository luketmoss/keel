// #576 adds the Sets and Templates mirrors (SET_FIELDS, TEMPLATE_FIELDS).
// #260 AC4 — the SPA's Workouts row mirrors WORKOUT_FIELDS in
// apps-script/src/types.js (CLAUDE.md: change both together). This test is
// what notices when only one side changed, as sync-log-api.test.ts does for
// SyncLog. It also pins AB `sport_type` on every SPA path: the read, the
// append (always ''), and the fresh-read-then-write edit (preserved), and AD
// `trails` (#688) the same way, and AE:AM (#765) as the Spin columns.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const sheetsGet = vi.fn();
const sheetsAppend = vi.fn();
const sheetsUpdate = vi.fn();

vi.mock('./sheets', () => ({
  sheetsGet: (...args: unknown[]) => sheetsGet(...args),
  sheetsAppend: (...args: unknown[]) => sheetsAppend(...args),
  sheetsUpdate: (...args: unknown[]) => sheetsUpdate(...args),
  sheetsDeleteRow: vi.fn(),
  getSheetId: vi.fn(),
  withReauth: (_token: string, fn: (t: string) => unknown) => fn('t'),
}));
vi.mock('./demo-data', () => ({
  isDemo: () => false,
  DEMO_WORKOUTS: [],
  DEMO_SETS: [],
  DEMO_TEMPLATE_ROWS: [],
}));

const {
  workoutToRow,
  rowToWorkout,
  createWorkout,
  updateWorkout,
  SET_FIELDS,
  setToNewRow,
  rowToSet,
  fetchSets,
  updateSet,
  appendSets,
} = await import('./workouts-api');
const { TEMPLATE_FIELDS, templateRowValues, rowToTemplateRow, fetchTemplateRows } = await import('./templates-api');
import type { TemplateRow, Workout, WorkoutSet } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

function workoutFields(): string[] {
  const src = readFileSync(resolve(__dirname, '../../../apps-script/src/types.js'), 'utf-8');
  const block = src.match(/var WORKOUT_FIELDS = \[([\s\S]*?)\];/)?.[1];
  expect(block, 'WORKOUT_FIELDS not found in types.js').toBeTruthy();
  return Array.from(block!.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
}

describe('Workouts row mapping', () => {
  it('#773: reads row[39] as coros_activity_id, and a row with no AN cell as ""', () => {
    const row = Array.from({ length: 40 }, () => '');
    row[0] = 'w_1';
    row[39] = '471166302945817201';
    expect(rowToWorkout(row, 2).coros_activity_id).toBe('471166302945817201');
    expect(rowToWorkout(row.slice(0, 39), 2).coros_activity_id).toBe('');
    expect(rowToWorkout([], 2).coros_activity_id).toBe('');
  });

  it('#765: reads row[30..38] as the Spin columns, and a row with no AE:AM cell as ""', () => {
    const row = Array.from({ length: 40 }, () => '');
    row[0] = 'w_1';
    ['190', '215', '0.86', '74', '683', '250', '100', 'rw_1a2b3c4d', 'streamsFile'].forEach((v, i) => {
      row[30 + i] = v;
    });
    expect(rowToWorkout(row, 2)).toMatchObject({
      avg_power_w: '190',
      np_w: '215',
      intensity_factor: '0.86',
      tss: '74',
      work_kj: '683',
      ftp_w: '250',
      intensity_pct: '100',
      ride_workout_id: 'rw_1a2b3c4d',
      streams_ref: 'streamsFile',
    });
    const old = rowToWorkout(row.slice(0, 30), 2);
    for (const f of [
      'avg_power_w',
      'np_w',
      'intensity_factor',
      'tss',
      'work_kj',
      'ftp_w',
      'intensity_pct',
      'ride_workout_id',
      'streams_ref',
    ] as const) {
      expect(old[f], f).toBe('');
    }
  });

  it('workoutToRow emits WORKOUT_FIELDS from apps-script/src/types.js, in order', () => {
    const fields = workoutFields();
    // Each field holds its own name, so the row reads back as the field order.
    const named = Object.fromEntries(fields.map((f) => [f, f])) as unknown as Workout;
    expect(workoutToRow(named)).toEqual(fields);
    expect(fields).toHaveLength(40); // A:AN
    expect(fields[27]).toBe('sport_type');
    expect(fields[28]).toBe('track_ref'); // #432
    expect(fields[29]).toBe('trails'); // #688
    expect(fields.slice(30)).toEqual([
      'avg_power_w',
      'np_w',
      'intensity_factor',
      'tss',
      'work_kj',
      'ftp_w',
      'intensity_pct',
      'ride_workout_id',
      'streams_ref',
      'coros_activity_id',
    ]); // #765, then #773's link, emitted last
  });

  it('rowToWorkout reads every WORKOUT_FIELDS column back into its field', () => {
    const fields = workoutFields();
    const w = rowToWorkout(fields, 2) as unknown as Record<string, unknown>;
    for (const f of fields) {
      // `type` and `effort` are typed unions; the value is still the cell.
      expect(w[f], f).toBe(f);
    }
  });

  it('reads row[27] as sport_type, and a short row as ""', () => {
    const row = Array.from({ length: 28 }, () => '');
    row[0] = 'w_1';
    row[27] = '204';
    expect(rowToWorkout(row, 2).sport_type).toBe('204');
    expect(rowToWorkout(row.slice(0, 27), 2).sport_type).toBe('');
  });

  it('#688: reads row[29] as trails, and a row with no AD cell as ""', () => {
    const row = Array.from({ length: 30 }, () => '');
    row[0] = 'w_1';
    row[29] = '{"v":1,"m":1,"u":0,"n":[],"p":[]}';
    expect(rowToWorkout(row, 2).trails).toBe('{"v":1,"m":1,"u":0,"n":[],"p":[]}');
    expect(rowToWorkout(row.slice(0, 29), 2).trails).toBe('');
  });
});

// #576: Templates I/J and Sets K:M, mirrored the same way.
function fieldsOf(name: string): string[] {
  const src = readFileSync(resolve(__dirname, '../../../apps-script/src/types.js'), 'utf-8');
  const block = src.match(new RegExp(`var ${name} = \\[([\\s\\S]*?)\\];`))?.[1];
  expect(block, `${name} not found in types.js`).toBeTruthy();
  return Array.from(block!.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
}

describe('#576: Sets and Templates row mappings mirror types.js', () => {
  it('SET_FIELDS and TEMPLATE_FIELDS match apps-script/src/types.js, in order', () => {
    expect([...SET_FIELDS]).toEqual(fieldsOf('SET_FIELDS'));
    expect([...TEMPLATE_FIELDS]).toEqual(fieldsOf('TEMPLATE_FIELDS'));
    expect(SET_FIELDS.slice(10)).toEqual(['rest_target_s', 'set_s', 'rest_s']);
    expect(TEMPLATE_FIELDS.slice(8)).toEqual(['rest_s', 'switch_s']);
  });

  it('setToNewRow and rowToSet round-trip every SET_FIELDS column', () => {
    const named = Object.fromEntries(SET_FIELDS.map((f) => [f, f])) as unknown as WorkoutSet;
    expect(setToNewRow(named)).toEqual([...SET_FIELDS]);
    const s = rowToSet([...SET_FIELDS], 2) as unknown as Record<string, unknown>;
    for (const f of SET_FIELDS) if (f !== 'exercise_order' && f !== 'set_number') expect(s[f], f).toBe(f);
  });

  it('templateRowValues and rowToTemplateRow round-trip every TEMPLATE_FIELDS column', () => {
    const named = Object.fromEntries(TEMPLATE_FIELDS.map((f) => [f, f])) as unknown as TemplateRow;
    expect(templateRowValues(named)).toEqual([...TEMPLATE_FIELDS]);
    const t = rowToTemplateRow([...TEMPLATE_FIELDS], 2) as unknown as Record<string, unknown>;
    for (const f of ['template_id', 'exercise_id', 'section', 'rest_s', 'switch_s']) expect(t[f], f).toBe(f);
  });

  it('a row written before the migration reads back with blank rest, and nothing else changes', () => {
    const oldSet = ['w_1', 'ex_1', 'Bench', 'primary', '1', '2', '6', '185', '6', 'Hard'];
    expect(rowToSet(oldSet, 7)).toEqual({
      workout_id: 'w_1',
      exercise_id: 'ex_1',
      exercise_name: 'Bench',
      section: 'primary',
      exercise_order: 1,
      set_number: 2,
      planned_reps: '6',
      weight: '185',
      reps: '6',
      effort: 'Hard',
      rest_target_s: '',
      set_s: '',
      rest_s: '',
      sheetRow: 7,
    });
    const oldTemplate = ['tpl_1', 'Push', '3', 'ex_1', 'Bench', 'primary', '4', '4-6'];
    expect(rowToTemplateRow(oldTemplate, 4)).toEqual({
      template_id: 'tpl_1',
      template_name: 'Push',
      order: 3,
      exercise_id: 'ex_1',
      exercise_name: 'Bench',
      section: 'primary',
      sets: '4',
      reps: '6',
      rest_s: '',
      switch_s: '',
      sheetRow: 4,
    });
  });

  it('fetchSets reads A2:M; an edit writes A:J only, so K:M stay as the sheet holds them', async () => {
    sheetsGet.mockReset();
    sheetsUpdate.mockReset();
    sheetsGet.mockResolvedValue([]);
    await fetchSets('token');
    expect(sheetsGet).toHaveBeenCalledWith('Sets!A2:M', 't');
    await updateSet(9, { ...rowToSet([], 9), workout_id: 'w_1', rest_target_s: '90' }, 'token');
    const [range, rows] = sheetsUpdate.mock.calls[0];
    expect(range).toBe('Sets!A9:J9');
    expect(rows[0]).toHaveLength(10);
  });

  it('appendSets writes A:M with the planned rest the set carries', async () => {
    sheetsAppend.mockReset();
    await appendSets([{ ...rowToSet([], 0), workout_id: 'w_1', rest_target_s: '45' }], 'token');
    const [range, rows] = sheetsAppend.mock.calls[0];
    expect(range).toBe('Sets!A:M');
    expect(rows[0]).toHaveLength(13);
    expect(rows[0][10]).toBe('45');
  });

  it('fetchTemplateRows reads A2:J', async () => {
    sheetsGet.mockReset();
    sheetsGet.mockResolvedValue([['tpl_1', 'Push', '1', 'ex_1', 'Bench', 'SS1', '3', '10', '60', '15']]);
    const [row] = await fetchTemplateRows('token');
    expect(sheetsGet).toHaveBeenCalledWith('Templates!A2:J', 't');
    expect([row.rest_s, row.switch_s]).toEqual(['60', '15']);
  });
});

describe("#260 AC4: the SPA never sets sport_type, and an edit keeps the sheet's", () => {
  beforeEach(() => {
    sheetsGet.mockReset();
    sheetsAppend.mockReset();
    sheetsUpdate.mockReset();
  });

  it('createWorkout appends A:AN with a blank AB, a blank AD and nine blank Spin columns and a blank COROS link (#688, #765, #773)', async () => {
    const w = await createWorkout({ type: 'hike', name: 'Hike' }, 'token');
    expect(sheetsAppend).toHaveBeenCalledTimes(1);
    const [range, rows] = sheetsAppend.mock.calls[0];
    expect(range).toBe('Workouts!A:AN');
    expect(rows[0]).toHaveLength(40);
    expect(rows[0][27]).toBe('');
    expect(rows[0][29]).toBe('');
    expect(rows[0].slice(30)).toEqual(Array.from({ length: 10 }, () => ''));
    expect(w.trails).toBe('');
    expect(w.ride_workout_id).toBe('');
  });

  it('fetchWorkouts reads A2:AN (#765)', async () => {
    const { fetchWorkouts } = await import('./workouts-api');
    sheetsGet.mockResolvedValue([]);
    await fetchWorkouts('token');
    expect(sheetsGet).toHaveBeenCalledWith('Workouts!A2:AN', 't');
  });

  it('updateWorkout reads A:AN fresh and writes back the sport_type and trails the sheet holds', async () => {
    const tagged = '{"v":1,"m":1,"u":12,"n":[["Invented Path",400]],"p":[[0,0,100,1,400,90,5,0]]}';
    const fresh = Array.from({ length: 40 }, () => '');
    fresh[0] = 'w_1';
    fresh[18] = 'coros';
    fresh[19] = '700000000000000001';
    fresh[27] = '204';
    fresh[29] = tagged;
    sheetsGet.mockResolvedValue([fresh]);
    // The cached copy predates the backfill and the tagging: AB and AD are still blank.
    const cached = { ...rowToWorkout(fresh, 5), sport_type: '', track_ref: '', trails: '' };
    const written = await updateWorkout(cached, { notes: 'muddy' }, 'token');
    expect(sheetsGet).toHaveBeenCalledWith('Workouts!A5:AN5', 't');
    const [range, rows] = sheetsUpdate.mock.calls[0];
    expect(range).toBe('Workouts!A5:AN5');
    expect(rows[0]).toHaveLength(40);
    expect(rows[0][27]).toBe('204');
    expect(rows[0][29]).toBe(tagged);
    expect(rows[0][6]).toBe('muddy');
    expect(written.sport_type).toBe('204');
    expect(written.trails).toBe(tagged);
  });

  it('#773: an edit keeps the coros_activity_id the sheet holds, even over a stale cached copy', async () => {
    const fresh = Array.from({ length: 40 }, () => '');
    fresh[0] = 'w_1';
    fresh[18] = 'spin';
    fresh[19] = 'ride-1';
    fresh[39] = '471166302945817201';
    sheetsGet.mockResolvedValue([fresh]);
    // The cached copy predates the link: AN is still blank in it.
    const cached = { ...rowToWorkout(fresh, 5), coros_activity_id: '' };
    const written = await updateWorkout(cached, { notes: 'felt good' }, 'token');
    const [, rows] = sheetsUpdate.mock.calls[sheetsUpdate.mock.calls.length - 1];
    expect(rows[0]).toHaveLength(40);
    expect(rows[0][39]).toBe('471166302945817201');
    expect(written.coros_activity_id).toBe('471166302945817201');
  });
});
