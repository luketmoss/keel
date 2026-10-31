// #688 — Workouts!AD `trails`: sync-owned, written only by `updateWorkout`,
// validated strictly, and kept by every other write. Trail names are
// invented; the date is the placeholder 2000-01-01.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadApi, callDoGet, workoutRow, type CellValue } from './apps-script-sandbox';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The sync's golden value, committed once (sync/test/fixtures). */
const GOLDEN = readFileSync(path.resolve(here, '..', '..', 'sync', 'test', 'fixtures', 'trails-688-golden.txt'), 'utf8').trim();
const EMPTY = '{"v":1,"m":1,"u":2700,"n":[],"p":[]}';
const AD = 29;
const REFUSAL =
  'trails must be "" or a Workouts!AD trails value in the #688 format (version 1); the value sent was not one, so nothing was written';

const ACTIVITY = '700000000000000001';
const walk = (over: Record<string, CellValue> = {}) =>
  workoutRow({
    id: 'w_walk', date: '2000-01-01', time: '06:00', type: 'walk', name: 'Walk', source: 'coros',
    source_activity_id: ACTIVITY, raw_ref: 'rawfile', synced_at: '2000-01-02T13:00:00.000Z', track_ref: 'trk1', ...over,
  });

const call = (api: ReturnType<typeof loadApi>, action: string, payload: unknown) =>
  callDoGet<any>(api.sandbox, { action, payload: JSON.stringify(payload) });
const update = (api: ReturnType<typeof loadApi>, trails: unknown) =>
  call(api, 'updateWorkout', { id: 'w_walk', changes: { trails } });

describe('#688: AD is trails, after track_ref', () => {
  it('ends WORKOUT_FIELDS with sport_type, track_ref, trails; COL.TRAILS is 29 and a row is 30 cells', () => {
    const { sandbox } = loadApi([]);
    expect([...sandbox.WORKOUT_FIELDS].slice(-3)).toEqual(['sport_type', 'track_ref', 'trails']);
    expect(sandbox.COL.TRAILS).toBe(AD);
    expect(sandbox.WORKOUT_COLUMN_COUNT).toBe(30);
  });

  it('getWorkouts and getWorkout return trails as stored; a row with no AD cell reads ""', () => {
    const api = loadApi([walk({ trails: GOLDEN }), walk({ id: 'w_old' }).slice(0, 29)]);
    const all = callDoGet<any>(api.sandbox, { action: 'getWorkouts' }).data;
    expect(all.map((w: any) => w.trails)).toEqual([GOLDEN, '']);
    const one = callDoGet<any>(api.sandbox, { action: 'getWorkout', id: 'w_walk' });
    expect(one.success, one.error).toBe(true);
    expect(one.data.trails).toBe(GOLDEN);
  });
});

describe('#688: updateWorkout writes trails, and only trails', () => {
  it('writes a valid v1 value to AD and leaves every other cell as it was, synced_at included', () => {
    const api = loadApi([walk()]);
    const before = [...api.rows[0]];
    const res = update(api, GOLDEN);
    expect(res.success, res.error).toBe(true);
    expect(api.rows[0][AD]).toBe(GOLDEN);
    for (let i = 0; i < AD; i++) expect(api.rows[0][i], String(i)).toBe(before[i]);
  });

  it('accepts the empty tagged value, an x, and nulls; "" clears', () => {
    const api = loadApi([walk()]);
    expect(update(api, EMPTY).success).toBe(true);
    expect(api.rows[0][AD]).toBe(EMPTY);
    const withX = '{"v":1,"m":2,"u":0,"n":[["Invented Path",400]],"p":[[0,0,100,1,400,null,null,null]],"x":3}';
    expect(update(api, withX).success).toBe(true);
    expect(api.rows[0][AD]).toBe(withX);
    expect(update(api, '').success).toBe(true);
    expect(api.rows[0][AD]).toBe('');
  });

  const golden = () => JSON.parse(GOLDEN);
  const withPass = (i: number, value: unknown) => {
    const t = golden();
    t.p[0][i] = value;
    return JSON.stringify(t);
  };
  const REFUSED: Record<string, string> = {
    'text that is not JSON': '{"v":1,',
    'a non-object': '[1,2,3]',
    'a missing key': JSON.stringify((({ u: _u, ...rest }) => rest)(golden())),
    'an unknown key': JSON.stringify({ ...golden(), z: 1 }),
    'v other than 1': JSON.stringify({ ...golden(), v: 2 }),
    'm not a positive integer': JSON.stringify({ ...golden(), m: 0 }),
    'm fractional': JSON.stringify({ ...golden(), m: 1.5 }),
    'u negative': JSON.stringify({ ...golden(), u: -1 }),
    'u fractional': JSON.stringify({ ...golden(), u: 2.5 }),
    'an empty name': JSON.stringify({ ...golden(), n: [['', 1000], ...golden().n.slice(1)] }),
    'a non-string name': JSON.stringify({ ...golden(), n: [[7, 1000], ...golden().n.slice(1)] }),
    'a name no pass uses': JSON.stringify({ ...golden(), n: [...golden().n, ['Unused Invented Path', 10]] }),
    'an index out of range': withPass(0, 3),
    's outside 0–100': withPass(1, 101),
    'e fractional': withPass(2, 40.5),
    'd other than 1 or -1': withPass(3, 0),
    'a pass with 7 elements': JSON.stringify({ ...golden(), p: [golden().p[0].slice(0, 7), ...golden().p.slice(1)] }),
    'a pass with 9 elements': JSON.stringify({ ...golden(), p: [[...golden().p[0], 1], ...golden().p.slice(1)] }),
    'a negative metres': withPass(4, -5),
    'a fractional duration': withPass(5, 1.5),
    'a negative climb': withPass(6, -1),
    'a fractional entry offset': withPass(7, 0.5),
    'x present but 0': JSON.stringify({ ...golden(), x: 0 }),
    'x fractional': JSON.stringify({ ...golden(), x: 1.5 }),
  };
  for (const [name, value] of Object.entries(REFUSED)) {
    it(`refuses ${name} with the fixed text, writing nothing`, () => {
      const api = loadApi([walk({ trails: EMPTY })]);
      const before = [...api.rows[0]];
      const res = update(api, value);
      expect(res.success).toBe(false);
      expect(res.error).toBe(REFUSAL);
      expect(res.error).not.toContain('Heron');
      expect(api.rows[0]).toEqual(before);
    });
  }

  it('updateWorkout of any other field preserves AD', () => {
    const api = loadApi([walk({ trails: GOLDEN })]);
    expect(call(api, 'updateWorkout', { id: 'w_walk', changes: { notes: 'muddy', effort: 'Hard' } }).success).toBe(true);
    expect(api.rows[0][AD]).toBe(GOLDEN);
  });
});

describe('#688: every other write leaves AD alone', () => {
  it('createWorkout writes "" to AD', () => {
    const api = loadApi([]);
    const res = call(api, 'createWorkout', { data: { type: 'walk', name: 'Walk' } });
    expect(res.success, res.error).toBe(true);
    expect(api.rows[0]).toHaveLength(30);
    expect(api.rows[0][AD]).toBe('');
    expect(res.data.trails).toBe('');
  });

  const incoming = { date: '2000-01-01', time: '06:00', type: 'walk', sub_type: '', name: 'Walk' };
  const upsert = (rows: CellValue[][], extra: Record<string, unknown> = {}) => {
    const api = loadApi(rows);
    const res = call(api, 'upsertSyncedWorkout', {
      source: 'coros', source_activity_id: ACTIVITY, incoming, last_written: null,
      raw_ref: 'rawfile', synced_at: '2000-01-03T13:00:00.000Z', track_ref: 'trk1', ...extra,
    });
    return { api, res };
  };

  it('upsertSyncedWorkout, updating a row, leaves a tagged AD exactly as it was', () => {
    const { api, res } = upsert([walk({ trails: GOLDEN })]);
    expect(res.success, res.error).toBe(true);
    expect(res.data.status).toBe('updated');
    expect(api.rows[0][AD]).toBe(GOLDEN);
  });

  it('upsertSyncedWorkout, claiming a plan, leaves a tagged AD exactly as it was', () => {
    const plan = workoutRow({ id: 'w_plan', date: '2000-01-01', type: 'walk', name: 'Planned walk', status: 'planned', trails: GOLDEN });
    const { api, res } = upsert([plan]);
    expect(res.success, res.error).toBe(true);
    expect(res.data.status).toBe('claimed');
    expect(api.rows[0][AD]).toBe(GOLDEN);
  });

  it('upsertSyncedWorkout refuses trails inside incoming: only updateWorkout sets it', () => {
    const { res } = upsert([walk()], { incoming: { ...incoming, trails: GOLDEN } });
    expect(res.success).toBe(false);
  });

  it('enrichWorkout leaves a tagged AD exactly as it was', () => {
    const lift = workoutRow({ id: 'w_lift', date: '2000-01-01', time: '07:00', type: 'weight', name: 'Lift', trails: GOLDEN });
    const api = loadApi([lift]);
    const res = call(api, 'enrichWorkout', {
      source_activity_id: '700000000000000009',
      activity: { date: '2000-01-01', time: '07:05', elapsed_seconds: '3600', moving_seconds: '3000', avg_hr: '100', calories: '300' },
      last_written: null, raw_ref: 'rawlift', synced_at: '2000-01-03T13:00:00.000Z',
    });
    expect(res.success, res.error).toBe(true);
    expect(res.data.status).toBe('enriched');
    expect(api.rows[0][AD]).toBe(GOLDEN);
  });
});
