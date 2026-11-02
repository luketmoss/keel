// #403 — a new synced activity completes the day's one matching plan instead
// of appending a second row beside it.

import { describe, it, expect } from 'vitest';
import { loadApi, callDoGet, workoutRow, type CellValue } from './apps-script-sandbox';

const NOW = new Date('2026-10-11T23:10:00Z');
const T1 = '2026-10-11T23:10:00.000Z';
const T2 = '2026-10-12T05:00:00.000Z';
const ID = '471166302945817999';

const ORDER = [
  'id', 'date', 'time', 'type', 'name', 'template_id', 'notes',
  'elapsed_seconds', 'created', 'copied_from', 'status',
  'moving_seconds', 'effort', 'distance_m', 'ascent_m', 'descent_m', 'avg_hr',
  'sub_type', 'source', 'source_activity_id', 'raw_ref', 'fit_ref',
  'fit_fetched_at', 'synced_at', 'started_at_utc', 'calories',
  'estimated_seconds', 'sport_type',
];
const C = Object.fromEntries(ORDER.map((f, i) => [f, i])) as Record<string, number>;

const RIDE = {
  date: '2026-10-11', time: '16:05', type: 'bike', sub_type: 'mountain', name: 'Mountain Bike',
  elapsed_seconds: '5400', moving_seconds: '5100', distance_m: '28000', ascent_m: '610', descent_m: '605',
  avg_hr: '138', calories: '980', started_at_utc: '2026-10-11T16:05:12-06:00',
};

/** A ride planned in Thrive for that day: no time, no activity yet. */
const plan = (over: Record<string, CellValue> = {}) => workoutRow({
  id: 'w_plan0001', date: '2026-10-11', time: '', type: 'bike', sub_type: 'gravel',
  name: 'Zone 2 - 90 min', notes: 'keep HR under 140', template_id: 'tpl_ride01',
  estimated_seconds: '5400', effort: 'Easy', status: 'planned', created: '2026-10-09T12:00:00.000Z',
  ...over,
});

function upsert(rows: CellValue[][], body: Record<string, unknown> = {}) {
  const api = loadApi(rows, { now: NOW, uuids: ['a1b2c3d4e5f6'] });
  const res = callDoGet<any>(api.sandbox, {
    action: 'upsertSyncedWorkout',
    payload: JSON.stringify({
      source: 'coros', source_activity_id: ID, incoming: RIDE, last_written: null,
      raw_ref: 'drive-file-1', synced_at: T1, sport_type: '204', ...body,
    }),
  });
  return { ...api, res };
}

const display = (row: CellValue[]) => row.map((v) => (v instanceof Date ? v.toISOString() : String(v ?? '')));

describe('AC1: a single matching plan is completed, not duplicated', () => {
  it('writes the activity onto the plan, finishes it, and appends nothing', () => {
    const { res, rows } = upsert([plan()]);
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ status: 'claimed', claimed_from: 'planned', id: 'w_plan0001', sheetRow: 2 });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r[C.status]).toBe('');
    for (const [f, v] of Object.entries(RIDE)) {
      if (f !== 'name') expect(r[C[f]], f).toBe(v);
    }
    expect(r[C.source]).toBe('coros');
    expect(r[C.source_activity_id]).toBe(ID);
    expect(r[C.raw_ref]).toBe('drive-file-1');
    expect(r[C.synced_at]).toBe(T1);
    expect(r[C.sport_type]).toBe('204');
  });

  it('keeps the plan\'s name, notes, template, estimate, effort and created', () => {
    const { rows } = upsert([plan()]);
    const r = rows[0];
    expect(r[C.id]).toBe('w_plan0001');
    expect(r[C.name]).toBe('Zone 2 - 90 min');
    expect(r[C.notes]).toBe('keep HR under 140');
    expect(r[C.template_id]).toBe('tpl_ride01');
    expect(r[C.estimated_seconds]).toBe('5400');
    expect(r[C.effort]).toBe('Easy');
    expect(r[C.created]).toBe('2026-10-09T12:00:00.000Z');
  });

  it('records the kept name as edited, so the sync\'s next last_written never overwrites it', () => {
    const { res } = upsert([plan()]);
    expect(res.data.written).toMatchObject({ name: 'Zone 2 - 90 min', distance_m: '28000', sub_type: 'mountain' });
    expect(res.data.written.edited).toEqual(['name']);
    expect(res.data.kept).toEqual(['name']);
  });

  it('a plan with no name takes the activity\'s, and nothing is marked edited', () => {
    const { res, rows } = upsert([plan({ name: '' })]);
    expect(rows[0][C.name]).toBe('Mountain Bike');
    expect(res.data.written.edited).toEqual([]);
    expect(res.data.kept).toEqual([]);
  });

  it('on the next run the row is an ordinary synced row: matched by ID, COROS changes merge, the name stays', () => {
    const first = upsert([plan()]);
    const second = upsert(first.rows.map(display), {
      last_written: first.res.data.written,
      incoming: { ...RIDE, avg_hr: '139' },
      synced_at: T2,
    });
    expect(second.res.data).toMatchObject({ status: 'updated', id: 'w_plan0001' });
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0][C.avg_hr]).toBe('139');
    expect(second.rows[0][C.name]).toBe('Zone 2 - 90 min');
    expect(second.res.data.written.edited).toEqual(['name']);
  });
});

describe('AC2: matching is exact and refuses to guess', () => {
  it('ignores sub_type and time: an indoor plan with a time is still this ride\'s', () => {
    const { res } = upsert([plan({ sub_type: 'indoor', time: '06:00' })]);
    expect(res.data.status).toBe('claimed');
  });

  it('with no candidate, appends as before', () => {
    const { res, rows } = upsert([]);
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toBeUndefined();
    expect(rows).toHaveLength(1);
  });

  it('with two candidates, appends as before, touches neither plan, and names them', () => {
    const a = plan({ id: 'w_plan000a' });
    const b = plan({ id: 'w_plan000b' });
    const before = [display(a), display(b)];
    const { res, rows } = upsert([a, b]);
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toEqual(['w_plan000a', 'w_plan000b']);
    expect(rows).toHaveLength(3);
    expect(display(rows[0])).toEqual(before[0]);
    expect(display(rows[1])).toEqual(before[1]);
  });

  it('never claims a row that is not a plan for this day and type', () => {
    const notCandidates = [
      plan({ id: 'w_active01', status: 'active' }),
      plan({ id: 'w_other_dt', date: '2026-10-12' }),
      plan({ id: 'w_hike0001', type: 'hike' }),
      plan({ id: 'w_linked01', source_activity_id: '471166302945810000' }),
      plan({ id: 'w_srcd0001', source: 'coros' }),
    ];
    const before = notCandidates.map(display);
    const { res, rows } = upsert([...notCandidates]);
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toBeUndefined();
    expect(rows).toHaveLength(before.length + 1);
    before.forEach((_, i) => expect(display(rows[i]), String(i)).toEqual(before[i]));
  });

  it('re-reads the plan and refuses to write if the sheet changed under it', () => {
    const api = loadApi([plan()], { now: NOW, uuids: ['a1b2c3d4e5f6'] });
    const scan = api.sandbox.getAllRows;
    // Another execution inserts a row above between the scan and the write.
    api.sandbox.getAllRows = (sheet: any) => {
      const out = scan(sheet);
      api.rows.unshift(workoutRow({ id: 'w_other001' }));
      return out;
    };
    const res = callDoGet<any>(api.sandbox, {
      action: 'upsertSyncedWorkout',
      payload: JSON.stringify({
        source: 'coros', source_activity_id: ID, incoming: RIDE, last_written: null,
        raw_ref: 'drive-file-1', synced_at: T1,
      }),
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sheet changed during the write/);
    expect(api.rows).toHaveLength(2);
    expect(api.rows[0][C.id]).toBe('w_other001');
    expect(api.rows[1][C.status]).toBe('planned');
    expect(api.rows[1][C.source]).toBe('');
  });
});

describe('AC3: only the create path claims', () => {
  it('an activity already in Thrive updates its own row and leaves the plan alone', () => {
    const synced = workoutRow({
      id: 'w_ride0001', ...RIDE, source: 'coros', source_activity_id: ID, raw_ref: 'drive-file-1', synced_at: T1,
    });
    const p = plan();
    const { res, rows } = upsert([p, synced], { last_written: RIDE, synced_at: T2 });
    expect(res.data).toMatchObject({ status: 'updated', id: 'w_ride0001' });
    expect(display(rows[0])).toEqual(display(p));
  });

  it('an activity whose row was deleted in Thrive is not recreated by taking over a plan', () => {
    const p = plan();
    const { res, rows } = upsert([p], { last_written: RIDE });
    expect(res.data.status).toBe('deleted');
    expect(rows).toHaveLength(1);
    expect(display(rows[0])).toEqual(display(p));
  });
});

// #736 — a finished hand-logged row is claimed too, the same way.

const finished = (over: Record<string, CellValue> = {}) => plan({
  id: 'w_done0001', time: '16:30', name: 'Mountain Bike Ride', notes: 'flat tire', template_id: '',
  estimated_seconds: '', effort: 'Hard', status: '', elapsed_seconds: '4000', distance_m: '20000', ...over,
});

describe('#736: a finished hand-logged row is claimed', () => {
  it.each(['', 'complete'])('writes the activity onto a row with status "%s" and appends nothing', (status) => {
    const { res, rows } = upsert([finished({ status })]);
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ status: 'claimed', claimed_from: 'finished', id: 'w_done0001', sheetRow: 2 });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r[C.status]).toBe('');
    expect(r[C.source]).toBe('coros');
    expect(r[C.source_activity_id]).toBe(ID);
    for (const [f, v] of Object.entries(RIDE)) {
      if (f !== 'name') expect(r[C[f]], f).toBe(v);
    }
  });

  it('keeps name, notes, effort, template and estimate, and records the name as edited', () => {
    const { res, rows } = upsert([finished({ template_id: 'tpl_ride01', estimated_seconds: '3000' })]);
    const r = rows[0];
    expect(r[C.name]).toBe('Mountain Bike Ride');
    expect(r[C.notes]).toBe('flat tire');
    expect(r[C.effort]).toBe('Hard');
    expect(r[C.template_id]).toBe('tpl_ride01');
    expect(r[C.estimated_seconds]).toBe('3000');
    expect(res.data.written.edited).toEqual(['name']);
  });

  it("a finished row with no name takes the activity's", () => {
    const { res, rows } = upsert([finished({ name: '' })]);
    expect(rows[0][C.name]).toBe('Mountain Bike');
    expect(res.data.written.edited).toEqual([]);
  });

  it('an active row is not claimed: a new row is appended', () => {
    const { res, rows } = upsert([finished({ status: 'active' })]);
    expect(res.data.status).toBe('created');
    expect(rows).toHaveLength(2);
  });

  it('one planned and one finished row are ambiguous: neither is claimed, both are named', () => {
    const a = plan();
    const b = finished();
    const before = [display(a), display(b)];
    const { res, rows } = upsert([a, b]);
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toEqual(['w_plan0001', 'w_done0001']);
    expect(rows).toHaveLength(3);
    expect(display(rows[0])).toEqual(before[0]);
    expect(display(rows[1])).toEqual(before[1]);
  });

  it('two finished rows are ambiguous too', () => {
    const { res, rows } = upsert([finished({ id: 'w_done000a' }), finished({ id: 'w_done000b' })]);
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toEqual(['w_done000a', 'w_done000b']);
    expect(rows).toHaveLength(3);
  });

  it('a finished row of another type, another date, or already linked is not a candidate', () => {
    const others = [
      finished({ id: 'w_other_dt', date: '2026-10-12' }),
      finished({ id: 'w_hike0001', type: 'hike' }),
      finished({ id: 'w_linked01', source_activity_id: '471166302945810000' }),
      finished({ id: 'w_srcd0001', source: 'coros' }),
    ];
    const before = others.map(display);
    const { res, rows } = upsert([...others]);
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toBeUndefined();
    before.forEach((_, i) => expect(display(rows[i]), String(i)).toEqual(before[i]));
  });

  it('a garmin_import activity claims no finished row', () => {
    const f = finished();
    const { res, rows } = upsert([f], { source: 'garmin_import' });
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toBeUndefined();
    expect(display(rows[0])).toEqual(display(f));
  });

  it('an activity already in Thrive, or whose row was deleted, claims no finished row', () => {
    const f = finished();
    const synced = workoutRow({
      id: 'w_ride0001', ...RIDE, source: 'coros', source_activity_id: ID, raw_ref: 'drive-file-1', synced_at: T1,
    });
    const upd = upsert([f, synced], { last_written: RIDE, synced_at: T2 });
    expect(upd.res.data).toMatchObject({ status: 'updated', id: 'w_ride0001' });
    expect(display(upd.rows[0])).toEqual(display(f));
    const del = upsert([f], { last_written: RIDE });
    expect(del.res.data.status).toBe('deleted');
    expect(display(del.rows[0])).toEqual(display(f));
  });

  it('refuses to write if the sheet changed between choosing the finished row and writing', () => {
    const api = loadApi([finished()], { now: NOW, uuids: ['a1b2c3d4e5f6'] });
    const scan = api.sandbox.getAllRows;
    api.sandbox.getAllRows = (sheet: any) => {
      const out = scan(sheet);
      api.rows.unshift(workoutRow({ id: 'w_other001' }));
      return out;
    };
    const res = callDoGet<any>(api.sandbox, {
      action: 'upsertSyncedWorkout',
      payload: JSON.stringify({
        source: 'coros', source_activity_id: ID, incoming: RIDE, last_written: null,
        raw_ref: 'drive-file-1', synced_at: T1,
      }),
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sheet changed during the write/);
    expect(api.rows[1][C.source]).toBe('');
  });
});

describe('AC4: two rides, one plan', () => {
  it('the earlier ride claims the plan; the later one appends', () => {
    const first = upsert([plan()]);
    expect(first.res.data.status).toBe('claimed');
    const api = loadApi(first.rows.map(display), { now: NOW, uuids: ['f0e1d2c3b4a5'] });
    const res = callDoGet<any>(api.sandbox, {
      action: 'upsertSyncedWorkout',
      payload: JSON.stringify({
        source: 'coros', source_activity_id: '471166302945818000',
        incoming: { ...RIDE, time: '18:30', started_at_utc: '2026-10-11T18:30:00-06:00' },
        last_written: null, raw_ref: 'drive-file-2', synced_at: T1,
      }),
    });
    expect(res.data.status).toBe('created');
    expect(api.rows).toHaveLength(2);
    expect(api.rows[0][C.source_activity_id]).toBe(ID);
  });
});
