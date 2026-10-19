// #434 — the MCP change log and undoCall. AC numbers refer to #434's
// Acceptance Criteria.
//
// Driven through the real sources and doGet, over the sandbox's fake sheets,
// which store writes the way Sheets does, so a logged row and its restore
// round-trip through the same text escape as production.

import { describe, it, expect } from 'vitest';
import {
  loadApi, callEntry, workoutRow, exerciseRow, templateRow, setRow,
  type CellValue, type Fixtures, type LoadedApi,
} from './apps-script-sandbox';

const MCP = 'mcp-key';
const API = 'test-key';

function load(fixtures: Fixtures = {}, withLog = true) {
  return loadApi(
    { changeLog: withLog ? [] : undefined, ...fixtures },
    { properties: { MCP_API_KEY: MCP }, uuids: ['uuid-a', 'uuid-b', 'uuid-c', 'uuid-d'] },
  );
}

type Res = { success: boolean; data?: any; error?: string; code?: string };

function call(api: LoadedApi, action: string, payload?: unknown, key = MCP, extra: Record<string, string> = {}): Res {
  const params: Record<string, string> = { action, key, ...extra };
  if (payload !== undefined) params.payload = JSON.stringify(payload);
  return callEntry<any>(api.sandbox, 'doGet', params).res as Res;
}

interface LogRow {
  call_id: string; action: string; tab: string; key: any; before: any; after: any; logged_at: string;
}
function log(api: LoadedApi): LogRow[] {
  return api.changeLogRows!.map((r) => ({
    logged_at: String(r[0]), call_id: String(r[1]), action: String(r[2]), tab: String(r[3]),
    key: JSON.parse(String(r[4])), before: r[5] ? JSON.parse(String(r[5])) : null,
    after: r[6] ? JSON.parse(String(r[6])) : null,
  }));
}
const rowsOf = (api: LoadedApi, tab: 'rows' | 'exerciseRows' | 'templateRows' | 'setRows' | 'journalRows') =>
  (api[tab] as CellValue[][]).map((r) => r.map((c) => String(c)));

const journalRow = (date: string, note: string) => [date, note, '2026-09-20T10:00:00.000Z', '2026-09-20T10:00:00.000Z'];

describe('AC1: every MCP-key write is logged, row by row', () => {
  it('createWorkout logs the created row with a blank before', () => {
    const api = load();
    const res = call(api, 'createWorkout', { data: { type: 'bike', name: 'Ride' }, call_id: 'call-1' });
    expect(res.success, res.error).toBe(true);
    const rows = log(api);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ call_id: 'call-1', action: 'createWorkout', tab: 'Workouts', before: null });
    expect(rows[0].key).toEqual({ id: res.data.id });
    expect(rows[0].after).toMatchObject({ id: res.data.id, type: 'bike', name: 'Ride' });
    expect(Object.keys(rows[0].after)).toHaveLength(29);
    expect(rows[0].logged_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('updateWorkout logs the whole row before and after', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'Old' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'New' }, call_id: 'c2' });
    const [r] = log(api);
    expect(r).toMatchObject({ action: 'updateWorkout', tab: 'Workouts', key: { id: 'w_001' } });
    expect(r.before.name).toBe('Old');
    expect(r.after.name).toBe('New');
  });

  it('deleteWorkout logs the workout and each of its set rows as deleted', () => {
    const api = load({
      workouts: [workoutRow({ id: 'w_001' }), workoutRow({ id: 'w_002' })],
      sets: [setRow({ set_number: 1 }), setRow({ set_number: 2 }), setRow({ workout_id: 'w_002' })],
    });
    call(api, 'deleteWorkout', { id: 'w_001', call_id: 'del' });
    const rows = log(api);
    expect(rows.map((r) => r.tab).sort()).toEqual(['Sets', 'Sets', 'Workouts']);
    expect(rows.every((r) => r.after === null && r.before !== null && r.call_id === 'del')).toBe(true);
    const sets = rows.filter((r) => r.tab === 'Sets');
    expect(sets.map((s) => s.key)).toEqual([
      { workout_id: 'w_001', section: 'primary', exercise_order: '1', set_number: '1' },
      { workout_id: 'w_001', section: 'primary', exercise_order: '1', set_number: '2' },
    ]);
  });

  it('appendSets and updateSets log each set row', () => {
    const api = load({ workouts: [workoutRow()], exercises: [exerciseRow()], sets: [setRow()] });
    const added = call(api, 'appendSets', {
      sets: [{ workout_id: 'w_001', exercise_id: 'ex_001', exercise_name: 'Bench Press', section: 'primary',
        exercise_order: 1, set_number: 2, planned_reps: '6' }],
      call_id: 'app',
    });
    expect(added.success, added.error).toBe(true);
    expect(log(api)).toHaveLength(1);
    expect(log(api)[0]).toMatchObject({ action: 'appendSets', tab: 'Sets', before: null });

    const upd = call(api, 'updateSets', {
      workout_id: 'w_001', updates: [{ exercise: 'Bench Press', set_number: 1, reps: '8', weight: '185' }], call_id: 'upd',
    });
    expect(upd.success, upd.error).toBe(true);
    const last = log(api).filter((r) => r.call_id === 'upd');
    expect(last).toHaveLength(1);
    expect(last[0].before.reps).toBe('');
    expect(last[0].after).toMatchObject({ reps: '8', weight: '185' });
  });

  it('createExercise, updateExercise (rename cascade) and deleteExercise are logged', () => {
    const api = load({
      exercises: [exerciseRow({ id: 'ex_001', name: 'Bench Press' })],
      templates: [templateRow({ exercise_name: 'Bench Press' })],
      sets: [setRow({ exercise_name: 'Bench Press' })],
    });
    call(api, 'createExercise', { data: { name: 'Squat' }, call_id: 'ce' });
    expect(log(api).filter((r) => r.call_id === 'ce')).toHaveLength(1);

    call(api, 'updateExercise', { id: 'ex_001', changes: { name: 'Flat Bench' }, call_id: 'ue' });
    const tabs = log(api).filter((r) => r.call_id === 'ue').map((r) => r.tab).sort();
    expect(tabs).toEqual(['Exercises', 'Sets', 'Templates']);

    call(api, 'deleteExercise', { id: 'ex_001', call_id: 'de' });
    const del = log(api).filter((r) => r.call_id === 'de');
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ tab: 'Exercises', after: null });
  });

  it('createTemplate logs created rows; replaceTemplate logs every old row deleted and every new one created', () => {
    const api = load({
      exercises: [exerciseRow({ id: 'ex_001', name: 'Bench Press' }), exerciseRow({ id: 'ex_002', name: 'Squat' })],
    });
    const created = call(api, 'createTemplate', {
      data: { name: 'Day A', exercises: [{ exercise: 'Bench Press', section: 'primary', sets: 3, reps: '8' }] },
      call_id: 'ct',
    });
    expect(created.success, created.error).toBe(true);
    expect(log(api)).toHaveLength(1);
    expect(log(api)[0]).toMatchObject({ tab: 'Templates', before: null });
    expect(log(api)[0].key).toEqual({ template_id: created.data.id, order: '1' });

    const replaced = call(api, 'replaceTemplate', {
      template_id: created.data.id,
      data: { exercises: [{ exercise: 'Squat', section: 'primary', sets: 5, reps: '5' }, { exercise: 'Bench Press', section: 'SS1', sets: 2, reps: '10' }] },
      call_id: 'rt',
    });
    expect(replaced.success, replaced.error).toBe(true);
    const rt = log(api).filter((r) => r.call_id === 'rt');
    // order 1 is rewritten in place (an update); order 2 is new.
    expect(rt.map((r) => [r.key.order, r.before === null, r.after === null])).toEqual([
      ['1', false, false], ['2', true, false],
    ]);
    expect(rt[0].before.exercise_name).toBe('Bench Press');
    expect(rt[0].after.exercise_name).toBe('Squat');
  });

  it('upsertJournal logs a create, an update, and a blanked note as a deletion', () => {
    const api = load({ journal: [journalRow('2026-09-20', 'old')] });
    call(api, 'upsertJournal', { date: '2026-09-23', note: 'new', call_id: 'j1' });
    call(api, 'upsertJournal', { date: '2026-09-20', note: 'changed', call_id: 'j2' });
    call(api, 'upsertJournal', { date: '2026-09-20', note: '', call_id: 'j3' });
    const rows = log(api);
    expect(rows.map((r) => [r.call_id, r.tab, r.before === null, r.after === null])).toEqual([
      ['j1', 'Journal', true, false], ['j2', 'Journal', false, false], ['j3', 'Journal', false, true],
    ]);
    expect(rows[0].key).toEqual({ date: '2026-09-23' });
  });
});

describe('AC2: other callers are not logged', () => {
  it('a write with API_KEY adds nothing', () => {
    const api = load({ workouts: [workoutRow()] });
    const res = call(api, 'createWorkout', { data: { type: 'bike', name: 'Ride' } }, API);
    expect(res.success).toBe(true);
    expect(api.rows).toHaveLength(2);
    expect(api.changeLogRows).toEqual([]);
  });

  it('sync-only actions are never logged, whatever key they arrive with', () => {
    const api = load({ syncLog: [] });
    const res = call(api, 'appendSyncLog', { row: { run_id: 'r1', started_at: '2026-09-20T10:00:00.000Z', finished_at: '2026-09-20T10:01:00.000Z', window_start: '2026-09-19', window_end: '2026-09-20', n_seen: 0, n_new: 0, n_updated: 0, n_enriched: 0, n_fit_fetched: 0, n_errors: 0, status: 'ok' } }, MCP);
    expect(res.success, res.error).toBe(true);
    expect(api.changeLogRows).toEqual([]);
  });

  it('a read with the MCP key writes nothing', () => {
    const api = load({ workouts: [workoutRow()] });
    call(api, 'getWorkouts');
    expect(api.changeLogRows).toEqual([]);
  });
});

describe('AC3: call id groups one tool call', () => {
  it('stamps every request of a call with the id it sent', () => {
    const api = load({ workouts: [workoutRow()], exercises: [exerciseRow()] });
    call(api, 'appendSets', {
      sets: [{ workout_id: 'w_001', exercise_id: 'ex_001', exercise_name: 'Bench Press', section: 'primary', exercise_order: 1, set_number: 1 }],
      call_id: 'same_call-1',
    });
    call(api, 'createWorkout', { data: { type: 'bike', name: 'Ride' }, call_id: 'same_call-1' });
    expect(log(api).map((r) => r.call_id)).toEqual(['same_call-1', 'same_call-1']);
  });

  it('replaces a missing or invalid id with a fresh one, and the write still succeeds', () => {
    const api = load();
    const bad = ['has space', 'x'.repeat(65), '', 'ünï'];
    for (const id of bad) {
      expect(call(api, 'createWorkout', { data: { type: 'bike', name: 'R' }, call_id: id }).success).toBe(true);
    }
    expect(call(api, 'createWorkout', { data: { type: 'bike', name: 'R' } }).success).toBe(true);
    for (const r of log(api)) expect(r.call_id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(log(api).map((r) => r.call_id)).not.toContain('has space');
  });
});

describe('AC4: the log records what landed', () => {
  it('logs nothing when validation refuses the write', () => {
    const api = load({ workouts: [workoutRow()] });
    const res = call(api, 'createWorkout', { data: { type: 'not-a-type', name: 'x' }, call_id: 'bad' });
    expect(res.success).toBe(false);
    const missing = call(api, 'updateWorkout', { id: 'w_nope', changes: { name: 'x' } });
    expect(missing.success).toBe(false);
    expect(api.changeLogRows).toEqual([]);
  });

  it('logs exactly the rows that landed when a write fails halfway, and rethrows as an error', () => {
    const api = load({ workouts: [workoutRow()], exercises: [exerciseRow()] });
    const real = api.sandbox.appendSets;
    const mk = (n: number) => ({ workout_id: 'w_001', exercise_id: 'ex_001', exercise_name: 'Bench Press', section: 'primary', exercise_order: 1, set_number: n });
    api.sandbox.appendSets = (sets: unknown[]) => { real([sets[0]]); throw new Error('boom'); };
    const res = call(api, 'appendSets', { sets: [mk(1), mk(2), mk(3)], call_id: 'half' });
    expect(res).toMatchObject({ success: false, error: 'boom' });
    expect(api.setRows).toHaveLength(1);
    const rows = log(api);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ call_id: 'half', tab: 'Sets', before: null });
    expect(api.lock.held).toBe(false);
  });

  it('logs under the same lock as the write', () => {
    const api = load({ workouts: [workoutRow()] });
    call(api, 'createWorkout', { data: { type: 'bike', name: 'R' } });
    expect(api.lock.acquired).toBe(1);
    expect(api.lock.held).toBe(false);
  });
});

describe('AC5: getChangeLog reads it back', () => {
  function seeded() {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'A' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'B' }, call_id: 'one' });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'C' }, call_id: 'two' });
    call(api, 'createWorkout', { data: { type: 'bike', name: 'R' }, call_id: 'three' });
    return api;
  }

  it('returns newest call first, with before and after parsed', () => {
    const api = seeded();
    const res = call(api, 'getChangeLog');
    expect(res.data.map((r: any) => r.call_id)).toEqual(['three', 'two', 'one']);
    expect(res.data[2].before.name).toBe('A');
    expect(res.data[2].after.name).toBe('B');
    expect(res.data[2].row_key).toEqual({ id: 'w_001' });
    expect(res.data[0].before).toBeNull();
  });

  it('filters by call_id and since, and caps by limit', () => {
    const api = seeded();
    expect(call(api, 'getChangeLog', undefined, MCP, { call_id: 'two' }).data).toHaveLength(1);
    expect(call(api, 'getChangeLog', undefined, MCP, { since: '9999-01-01T00:00:00Z' }).data).toEqual([]);
    expect(call(api, 'getChangeLog', undefined, MCP, { limit: '2' }).data).toHaveLength(2);
    expect(call(api, 'getChangeLog', undefined, MCP, { limit: '999999' }).data).toHaveLength(3);
  });

  it('is open to either key and refused to a token caller', () => {
    const api = seeded();
    expect(call(api, 'getChangeLog', undefined, API).success).toBe(true);
    const tokenApi = loadApi({ changeLog: [] }, {
      properties: { MCP_API_KEY: MCP, TOKEN_CLIENT_ID: 'cid', TOKEN_ALLOWED_EMAIL: 'o@example.com' },
      tokeninfo: () => ({ status: 200, body: JSON.stringify({ azp: 'cid', aud: 'cid', expires_in: '3000', email: 'o@example.com', email_verified: 'true' }) }),
    });
    const refused = callEntry<any>(tokenApi.sandbox, 'doPost', { action: 'getChangeLog', access_token: 'tok' }).res;
    expect(refused.code).toBe('read_only');
  });
});

describe('AC6: the tab must exist', () => {
  it('refuses an MCP write, writing nothing, when MCPChangeLog is missing', () => {
    const api = load({ workouts: [workoutRow()] }, false);
    const res = call(api, 'createWorkout', { data: { type: 'bike', name: 'R' } });
    expect(res).toMatchObject({
      success: false,
      error: 'MCPChangeLog tab missing — run scripts/migrate-423-mcp-change-log-tab.mjs',
    });
    expect(api.rows).toHaveLength(1);
  });

  it('does not stop API_KEY writes or MCP reads', () => {
    const api = load({ workouts: [workoutRow()] }, false);
    expect(call(api, 'createWorkout', { data: { type: 'bike', name: 'R' } }, API).success).toBe(true);
    expect(call(api, 'getWorkouts').success).toBe(true);
  });
});

describe('AC7: undoCall previews, then reverts one call exactly', () => {
  it('a dry run writes nothing and lists each row with current and restore', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'Old' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'New' }, call_id: 'u1' });
    const before = JSON.stringify([api.rows, api.changeLogRows]);
    const res = call(api, 'undoCall', { call_id: 'u1' });
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ dry_run: true, call_id: 'u1', count: 1 });
    expect(res.data.rows[0]).toMatchObject({ tab: 'Workouts', row_key: { id: 'w_001' } });
    expect(res.data.rows[0].current.name).toBe('New');
    expect(res.data.rows[0].restore.name).toBe('Old');
    expect(JSON.stringify([api.rows, api.changeLogRows])).toBe(before);
  });

  it('restores an updated row whole', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'Old', notes: 'n' })] });
    const original = rowsOf(api, 'rows');
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'New', notes: '' }, call_id: 'u1' });
    const res = call(api, 'undoCall', { call_id: 'u1', confirm: true });
    expect(res.success, res.error).toBe(true);
    expect(rowsOf(api, 'rows')).toEqual(original);
  });

  it('puts a deleted workout and its sets back with their original ids', () => {
    const api = load({
      workouts: [workoutRow({ id: 'w_001', name: 'Keep' }), workoutRow({ id: 'w_002' })],
      sets: [setRow({ weight: '135', set_number: 1 }), setRow({ weight: '145', set_number: 2 })],
    });
    const wBefore = rowsOf(api, 'rows')[0];
    const sBefore = rowsOf(api, 'setRows');
    call(api, 'deleteWorkout', { id: 'w_001', call_id: 'dw' });
    expect(api.rows).toHaveLength(1);
    expect(api.setRows).toHaveLength(0);

    const res = call(api, 'undoCall', { call_id: 'dw', confirm: true });
    expect(res.success, res.error).toBe(true);
    expect(res.data.count).toBe(3);
    expect(rowsOf(api, 'rows').find((r) => r[0] === 'w_001')).toEqual(wBefore);
    expect(rowsOf(api, 'setRows').sort()).toEqual(sBefore.sort());
  });

  it('removes a created row', () => {
    const api = load({ workouts: [workoutRow()] });
    const made = call(api, 'createWorkout', { data: { type: 'bike', name: 'R' }, call_id: 'cw' });
    expect(api.rows).toHaveLength(2);
    call(api, 'undoCall', { call_id: 'cw', confirm: true });
    expect(api.rows.map((r) => r[0])).toEqual(['w_001']);
    expect(made.data.id).not.toBe('w_001');
  });

  it('restores a replaced template: old rows back, new rows gone', () => {
    const api = load({
      exercises: [exerciseRow({ id: 'ex_001', name: 'Bench Press' }), exerciseRow({ id: 'ex_002', name: 'Squat' })],
      templates: [templateRow({ order: 1 }), templateRow({ order: 2, exercise_id: 'ex_002', exercise_name: 'Squat' })],
    });
    const original = rowsOf(api, 'templateRows');
    const res = call(api, 'replaceTemplate', {
      template_id: 'tpl_001', data: { exercises: [{ exercise: 'Squat', section: 'primary', sets: 1, reps: '1' }] }, call_id: 'rep',
    });
    expect(res.success, res.error).toBe(true);
    expect(api.templateRows).toHaveLength(1);
    expect(call(api, 'undoCall', { call_id: 'rep', confirm: true }).success).toBe(true);
    expect(rowsOf(api, 'templateRows').sort()).toEqual(original.sort());
  });

  it('restores a deleted journal note', () => {
    const api = load({ journal: [journalRow('2026-09-20', 'a note')] });
    call(api, 'upsertJournal', { date: '2026-09-20', note: '', call_id: 'jd' });
    expect(api.journalRows).toHaveLength(0);
    call(api, 'undoCall', { call_id: 'jd', confirm: true });
    expect(rowsOf(api, 'journalRows')).toEqual([journalRow('2026-09-20', 'a note')]);
  });

  it('is itself logged as a new call with action undo, and can be undone', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'Old' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'New' }, call_id: 'u1' });
    const first = call(api, 'undoCall', { call_id: 'u1', confirm: true });
    expect(first.data.undo_call_id).toBeTruthy();
    expect(first.data.undo_call_id).not.toBe('u1');
    const undoRows = log(api).filter((r) => r.call_id === first.data.undo_call_id);
    expect(undoRows).toHaveLength(1);
    expect(undoRows[0]).toMatchObject({ action: 'undo', tab: 'Workouts' });
    expect(undoRows[0].before.name).toBe('New');
    expect(undoRows[0].after.name).toBe('Old');
    expect(api.rows[0][4]).toBe('Old');

    const again = call(api, 'undoCall', { call_id: first.data.undo_call_id, confirm: true });
    expect(again.success, again.error).toBe(true);
    expect(api.rows[0][4]).toBe('New');
  });

  it('reverts a call that touched one row twice, newest first', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'A' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'B' }, call_id: 'multi' });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'C' }, call_id: 'multi' });
    const res = call(api, 'undoCall', { call_id: 'multi', confirm: true });
    expect(res.success, res.error).toBe(true);
    expect(api.rows[0][4]).toBe('A');
  });
});

describe('AC8: undoCall is all or nothing', () => {
  it('restores nothing and names every conflict when a row changed since, dry run or not', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'A' }), workoutRow({ id: 'w_002', name: 'X' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'B' }, call_id: 'two' });
    call(api, 'updateWorkout', { id: 'w_002', changes: { name: 'Y' }, call_id: 'two' });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'edited later' } }, API);
    const snapshot = JSON.stringify([api.rows, api.changeLogRows]);

    for (const confirm of [false, true]) {
      const res = call(api, 'undoCall', { call_id: 'two', confirm });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^Nothing undone/);
      expect(res.data.conflicts).toHaveLength(1);
      expect(res.data.conflicts[0]).toMatchObject({ tab: 'Workouts', row_key: { id: 'w_001' } });
      expect(res.data.conflicts[0].current.name).toBe('edited later');
      expect(res.data.conflicts[0].expected.name).toBe('B');
    }
    expect(JSON.stringify([api.rows, api.changeLogRows])).toBe(snapshot);
  });

  it('conflicts when a created row was edited, or a deleted key exists again', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001' })] });
    const made = call(api, 'createWorkout', { data: { type: 'bike', name: 'R' }, call_id: 'cw' });
    call(api, 'updateWorkout', { id: made.data.id, changes: { notes: 'edited' } }, API);
    expect(call(api, 'undoCall', { call_id: 'cw', confirm: true }).success).toBe(false);
    expect(api.rows).toHaveLength(2);

    const b = load({ workouts: [workoutRow({ id: 'w_009' })] });
    call(b, 'deleteWorkout', { id: 'w_009', call_id: 'dw' });
    b.rows.push(workoutRow({ id: 'w_009', name: 'came back' }));
    const res = call(b, 'undoCall', { call_id: 'dw', confirm: true });
    expect(res.success).toBe(false);
    expect(res.data.conflicts[0]).toMatchObject({ row_key: { id: 'w_009' }, expected: null });
    expect(res.data.conflicts[0].current.name).toBe('came back');
  });

  it('says so, and changes nothing, for an unknown call id', () => {
    const api = load({ workouts: [workoutRow()] });
    const res = call(api, 'undoCall', { call_id: 'nope', confirm: true });
    expect(res).toMatchObject({ success: false, error: 'No MCP call nope in the change log' });
    expect(api.changeLogRows).toEqual([]);
  });

  it('refuses API_KEY, and requires a call_id', () => {
    const api = load({ workouts: [workoutRow({ id: 'w_001', name: 'A' })] });
    call(api, 'updateWorkout', { id: 'w_001', changes: { name: 'B' }, call_id: 'u1' });
    const res = call(api, 'undoCall', { call_id: 'u1', confirm: true }, API);
    expect(res).toMatchObject({ success: false, error: 'undoCall requires the MCP key' });
    expect(api.rows[0][4]).toBe('B');
    expect(call(api, 'undoCall', {}).error).toBe('payload.call_id field required');
  });
});
