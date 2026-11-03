// #773 - enrichRide: a COROS indoor-bike activity (sport code 201) links to its Spin ride and
// fills the ride's blanks. Never creates a row. Real source in the sandbox, fake sheet.

import { describe, it, expect } from 'vitest';
import { workoutRow, type CellValue } from './apps-script-sandbox';
import { loadSpin, call, NOW } from './spin-fixtures';

const ID = '471166302945817204';
const T1 = '2026-11-07T17:00:00.000Z';
const T2 = '2026-11-07T23:00:00.000Z';
const KEY = 'test-key';

/** The watch's view of the ride: it started at 15:02:11Z, the phone's start. */
const ACTIVITY = {
  date: '2026-11-07', time: '08:02', started_at_utc: '2026-11-07T08:02:11-07:00',
  elapsed_seconds: '3650', moving_seconds: '3610', avg_hr: '139', calories: '700',
};

/** A Spin ride as saveRide leaves it, starting 15:02:11Z. */
const spinRide = (overrides: Record<string, CellValue> = {}) => workoutRow({
  id: 'w_spin', date: '2026-11-07', time: '08:02', type: 'bike', sub_type: 'indoor', name: 'Sweet Spot 3x12',
  source: 'spin', source_activity_id: 'ride-1', started_at_utc: '2026-11-07T15:02:11Z',
  elapsed_seconds: '3645', moving_seconds: '3600', avg_hr: '', calories: '',
  notes: 'felt strong', effort: 'Hard', created: '2026-11-07T16:00:00.000Z', template_id: 'tpl_1',
  raw_ref: '', fit_ref: 'fitFile', fit_fetched_at: '2026-11-07T16:00:00.000Z', synced_at: '2026-11-07T16:00:00.000Z',
  avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', ftp_w: '250',
  intensity_pct: '100', ride_workout_id: 'rw_1a2b3c4d', streams_ref: 'streamsFile', track_ref: 'trk', trails: '',
  distance_m: '', ascent_m: '', descent_m: '', status: '', estimated_seconds: '3600', copied_from: 'w_src',
  ...overrides,
});

const corosRow = (overrides: Record<string, CellValue> = {}) => workoutRow({
  id: 'w_coros', date: '2026-11-07', time: '08:03', type: 'bike', sub_type: 'indoor', name: 'Indoor Cycling',
  source: 'coros', source_activity_id: ID, started_at_utc: '2026-11-07T08:03:30-07:00', ...overrides,
});

function enrich(rows: CellValue[][], activity: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const api = loadSpin({ workouts: rows });
  const res = call<any>(api, 'enrichRide', {
    source_activity_id: ID, activity: { ...ACTIVITY, ...activity }, last_written: null, synced_at: T1, sport_type: '201', ...extra,
  }, KEY);
  return { api, ...res };
}

/** The activity's start moved by `minutes`, as an instant. */
const startedAt = (minutes: number, seconds = 0) =>
  new Date(Date.parse('2026-11-07T15:02:11Z') + (minutes * 60 + seconds) * 1000).toISOString().replace('.000Z', 'Z');

const snapshot = (rows: CellValue[][]) => JSON.stringify(rows);

describe('matching: the 15-minute window, compared as instants', () => {
  it('links a Spin row starting 14 minutes away: enriched, with coros_activity_id and sport_type 201', () => {
    const { api, res, text } = enrich([spinRide()], { started_at_utc: startedAt(14) });
    expect(res.success, text).toBe(true);
    expect(res.data).toMatchObject({ status: 'enriched', id: 'w_spin', sheetRow: 2, linked: true });
    const w = fieldsOf(api, 0);
    expect(w.coros_activity_id).toBe(ID);
    expect(w.sport_type).toBe('201');
    expect(w.synced_at).toBe(T1);
    expect(api.rows).toHaveLength(1);
    expect(api.lock.acquired).toBe(1);
  });

  it('answers unmatched, reason no match, 16 minutes away, and writes nothing', () => {
    const rows = [spinRide()];
    const { api, res } = enrich(rows, { started_at_utc: startedAt(16) });
    expect(res.data).toEqual({ status: 'unmatched', reason: 'no match', candidates: [] });
    expect(snapshot(api.rows)).toBe(snapshot([spinRide()]));
  });

  it('matches at exactly 15 minutes, either side, and not one second past', () => {
    expect(enrich([spinRide()], { started_at_utc: startedAt(15) }).res.data.status).toBe('enriched');
    expect(enrich([spinRide()], { started_at_utc: startedAt(-15) }).res.data.status).toBe('enriched');
    expect(enrich([spinRide()], { started_at_utc: startedAt(15, 1) }).res.data).toMatchObject({ status: 'unmatched', reason: 'no match' });
    expect(enrich([spinRide()], { started_at_utc: startedAt(-15, -1) }).res.data).toMatchObject({ status: 'unmatched', reason: 'no match' });
  });

  it('matches across midnight: activity at 23:55 one day, ride at 00:05 the next', () => {
    const ride = spinRide({ date: '2026-11-08', time: '00:05', started_at_utc: '2026-11-08T07:05:00Z' });
    const { api, res } = enrich([ride], { date: '2026-11-07', time: '23:55', started_at_utc: '2026-11-07T23:55:00-07:00' });
    expect(res.data).toMatchObject({ status: 'enriched', id: 'w_spin', linked: true });
    expect(fieldsOf(api, 0).coros_activity_id).toBe(ID);
  });

  it('compares instants, so an offset is no obstacle: the same moment written with Z or a Denver offset', () => {
    expect(enrich([spinRide()], { started_at_utc: '2026-11-07T08:02:11-07:00' }).res.data.status).toBe('enriched');
    expect(enrich([spinRide()], { started_at_utc: '2026-11-07T15:02:11.000Z' }).res.data.status).toBe('enriched');
  });
});

describe('what enrichRide fills', () => {
  it('fills only blanks: avg_hr and calories here, and the answer names them', () => {
    const { api, res } = enrich([spinRide()]);
    expect(res.data.filled).toEqual(['avg_hr', 'calories']);
    expect(res.data.written).toEqual({ workout_id: 'w_spin', filled: ['avg_hr', 'calories'] });
    const w = fieldsOf(api, 0);
    expect(w).toMatchObject({ elapsed_seconds: '3645', moving_seconds: '3600', avg_hr: '139', calories: '700' });
  });

  it('never writes a blank over anything, and fills nothing COROS has no value for', () => {
    const { api, res } = enrich([spinRide()], { avg_hr: '', calories: '700' });
    expect(res.data.filled).toEqual(['calories']);
    expect(fieldsOf(api, 0).avg_hr).toBe('');
  });

  it('a field cleared by hand after it was filled is not filled again, sent with the returned written', () => {
    const first = enrich([spinRide()]);
    const written = first.res.data.written;
    // The owner clears avg_hr in Thrive.
    first.api.rows[0][16] = '';
    const second = call<any>(first.api, 'enrichRide', {
      source_activity_id: ID, activity: ACTIVITY, last_written: written, synced_at: T2, sport_type: '201',
    }, KEY);
    expect(second.res.data).toMatchObject({ status: 'unchanged', filled: [], linked: false });
    expect(first.api.rows[0][16]).toBe('');
    expect(first.api.rows[0][23]).toBe(T1); // synced_at was not rewritten
  });

  it('refills a cleared field when last_written is lost (null): the strength rule', () => {
    const first = enrich([spinRide()]);
    first.api.rows[0][16] = '';
    const again = call<any>(first.api, 'enrichRide', {
      source_activity_id: ID, activity: ACTIVITY, last_written: null, synced_at: T2, sport_type: '201',
    }, KEY);
    expect(again.res.data).toMatchObject({ status: 'enriched', filled: ['avg_hr'] });
  });

  it('a last_written for another workout carries no history', () => {
    const first = enrich([spinRide()]);
    first.api.rows[0][16] = '';
    const again = call<any>(first.api, 'enrichRide', {
      source_activity_id: ID, activity: ACTIVITY, last_written: { workout_id: 'w_other', filled: ['avg_hr'] }, synced_at: T2, sport_type: '201',
    }, KEY);
    expect(again.res.data.filled).toEqual(['avg_hr']);
  });
});

describe('what enrichRide never touches', () => {
  it('changes only coros_activity_id, sport_type and synced_at on a fully populated Spin row, whatever the activity sends', () => {
    const make = () => spinRide({ avg_hr: '141', calories: '683', distance_m: '25000', ascent_m: '12', descent_m: '12', sport_type: '' });
    const before = make(); // the sandbox writes into the rows it is given, so keep a copy of its own
    const { api, res } = enrich([make()], {
      date: '2030-01-01', time: '03:00', elapsed_seconds: '1', moving_seconds: '2', avg_hr: '3', calories: '4',
      started_at_utc: startedAt(3),
    });
    expect(res.data.status).toBe('enriched');
    expect(res.data.filled).toEqual([]);
    const names = api.sandbox.WORKOUT_FIELDS as string[];
    const changed = names.filter((n, i) => String(api.rows[0][i]) !== String(before[i]));
    expect(changed.sort()).toEqual(['coros_activity_id', 'sport_type', 'synced_at']);
    for (const f of [
      'avg_power_w', 'np_w', 'intensity_factor', 'tss', 'work_kj', 'ftp_w', 'intensity_pct', 'ride_workout_id',
      'streams_ref', 'fit_ref', 'fit_fetched_at', 'raw_ref', 'source', 'source_activity_id', 'name', 'notes',
      'effort', 'status', 'date', 'time', 'started_at_utc', 'distance_m', 'track_ref', 'trails', 'template_id',
      'estimated_seconds', 'copied_from', 'ascent_m', 'descent_m', 'created', 'id', 'type', 'sub_type',
    ]) {
      const i = names.indexOf(f);
      expect(String(api.rows[0][i]), f).toBe(String(before[i]));
    }
  });

  it('a second identical call answers unchanged and writes nothing, synced_at included', () => {
    const first = enrich([spinRide()]);
    const after = snapshot(first.api.rows);
    const second = call<any>(first.api, 'enrichRide', {
      source_activity_id: ID, activity: ACTIVITY, last_written: first.res.data.written, synced_at: T2, sport_type: '201',
    }, KEY);
    expect(second.res.data).toMatchObject({ status: 'unchanged', id: 'w_spin', linked: false, filled: [] });
    expect(snapshot(first.api.rows)).toBe(after);
    expect(first.api.rows).toHaveLength(1);
  });

  it('the same call with last_written null is also unchanged once the blanks are filled', () => {
    const first = enrich([spinRide()]);
    const after = snapshot(first.api.rows);
    const second = call<any>(first.api, 'enrichRide', {
      source_activity_id: ID, activity: ACTIVITY, last_written: null, synced_at: T2, sport_type: '201',
    }, KEY);
    expect(second.res.data.status).toBe('unchanged');
    expect(snapshot(first.api.rows)).toBe(after);
  });
});

describe('who is a candidate', () => {
  it('two candidates within 15 minutes are ambiguous, even when one is nearer, naming both, and nothing is written', () => {
    const near = spinRide({ id: 'w_near', source_activity_id: 'ride-1', started_at_utc: startedAt(1) });
    const far = spinRide({ id: 'w_far', source_activity_id: 'ride-2', started_at_utc: startedAt(12) });
    const rows = [near, far];
    const { api, res } = enrich(rows, { started_at_utc: startedAt(0) });
    expect(res.data).toEqual({
      status: 'unmatched', reason: 'ambiguous',
      candidates: [
        { id: 'w_near', started_at_utc: startedAt(1) },
        { id: 'w_far', started_at_utc: startedAt(12) },
      ],
    });
    expect(snapshot(api.rows)).toBe(snapshot([near, far]));
  });

  const notCandidates: [string, () => CellValue[]][] = [
    ['a Spin row linked to a different COROS activity', () => spinRide({ coros_activity_id: '999' })],
    ['a planned row', () => spinRide({ status: 'planned' })],
    ['a non-indoor bike row', () => spinRide({ sub_type: 'gravel' })],
    ['a bike row with no sub_type', () => spinRide({ sub_type: '' })],
    ['a source = coros row (another activity)', () => spinRide({ source: 'coros', source_activity_id: '123' })],
    ['a hand-logged row', () => spinRide({ source: '', source_activity_id: '' })],
    ['a Spin row with a blank started_at_utc', () => spinRide({ started_at_utc: '' })],
    ['a Spin row with an unreadable started_at_utc', () => spinRide({ started_at_utc: 'yesterday' })],
    ['a weight row', () => spinRide({ type: 'weight' })],
  ];
  for (const [label, make] of notCandidates) {
    it(`${label} is no candidate: no match, nothing written, and it does not make a valid ride ambiguous`, () => {
      const alone = enrich([make()]);
      expect(alone.res.data).toMatchObject({ status: 'unmatched', reason: 'no match' });
      expect(snapshot(alone.api.rows)).toBe(snapshot([make()]));

      const withValid = enrich([make(), spinRide({ id: 'w_valid', source_activity_id: 'ride-9' })]);
      expect(withValid.res.data).toMatchObject({ status: 'enriched', id: 'w_valid' });
    });
  }

  it('with a source = coros row holding this source_activity_id: unmatched, reason own row, nothing written', () => {
    const rows = [corosRow(), spinRide()];
    const { api, res } = enrich(rows);
    expect(res.data).toEqual({ status: 'unmatched', reason: 'own row', candidates: [] });
    expect(snapshot(api.rows)).toBe(snapshot([corosRow(), spinRide()]));
  });

  it('an already linked row is the activity row wherever its start is', () => {
    const linked = spinRide({ coros_activity_id: ID, started_at_utc: '2026-11-07T20:00:00Z', avg_hr: '', calories: '' });
    const { res, api } = enrich([linked, spinRide({ id: 'w_other', source_activity_id: 'ride-2' })]);
    expect(res.data).toMatchObject({ status: 'enriched', id: 'w_spin', linked: false, filled: ['avg_hr', 'calories'] });
    expect(fieldsOf(api, 1).coros_activity_id).toBe('');
  });

  it('two rows carrying the same coros_activity_id are refused, naming them, and nothing is written', () => {
    const rows = [spinRide({ coros_activity_id: ID }), spinRide({ id: 'w_dup', source_activity_id: 'ride-2', coros_activity_id: ID })];
    const { api, res } = enrich(rows);
    expect(res.success).toBe(false);
    expect(res.error).toContain('w_spin at row 2');
    expect(res.error).toContain('w_dup at row 3');
    expect(snapshot(api.rows)).toBe(snapshot([
      spinRide({ coros_activity_id: ID }), spinRide({ id: 'w_dup', source_activity_id: 'ride-2', coros_activity_id: ID }),
    ]));
  });
});

describe('the request', () => {
  it('is key-only: a token caller is refused (token-auth.test.ts lists it) and the Spin key is forbidden', () => {
    const api = loadSpin({ workouts: [spinRide()] });
    const res = call<any>(api, 'enrichRide', { source_activity_id: ID, activity: ACTIVITY, last_written: null, synced_at: T1 }).res;
    expect(res.code).toBe('spin_forbidden');
  });

  it('needs activity and last_written, a digits-only id, synced_at, and only sport code 201', () => {
    const api = loadSpin({ workouts: [spinRide()] });
    const send = (p: Record<string, unknown>) => call<any>(api, 'enrichRide', p, KEY).res;
    expect(send({ source_activity_id: ID, last_written: null, synced_at: T1 }).error).toMatch(/activity field required/);
    expect(send({ source_activity_id: ID, activity: ACTIVITY, synced_at: T1 }).error).toMatch(/last_written field required/);
    expect(send({ source_activity_id: 'abc', activity: ACTIVITY, last_written: null, synced_at: T1 }).error).toMatch(/source_activity_id is required/);
    expect(send({ source_activity_id: ID, activity: ACTIVITY, last_written: null }).error).toMatch(/synced_at is required/);
    expect(send({ source_activity_id: ID, activity: ACTIVITY, last_written: null, synced_at: T1, sport_type: '200' }).error)
      .toMatch(/sport code 201/);
    expect(send({ source_activity_id: ID, activity: { ...ACTIVITY, started_at_utc: '' }, last_written: null, synced_at: T1 }).error)
      .toMatch(/started_at_utc must be an ISO 8601 instant/);
    expect(send({ source_activity_id: ID, activity: { ...ACTIVITY, distance_m: '5' }, last_written: null, synced_at: T1 }).error)
      .toMatch(/not a ride field/);
    expect(send({ source_activity_id: ID, activity: { ...ACTIVITY, avg_hr: '12x' }, last_written: null, synced_at: T1 }).error)
      .toMatch(/avg_hr must be a whole number/);
    expect(snapshot(api.rows)).toBe(snapshot([spinRide()]));
  });

  it('a sport_type left out still writes 201', () => {
    const { api, res } = enrich([spinRide()], {}, { sport_type: undefined });
    expect(res.success).toBe(true);
    expect(fieldsOf(api, 0).sport_type).toBe('201');
  });

  it('writes the cells through the text escape: the id stays text, not a number', () => {
    const { api } = enrich([spinRide()]);
    expect(api.sandbox.WORKOUT_FIELDS.indexOf('coros_activity_id')).toBe(39);
    expect(typeof api.rows[0][39]).toBe('string');
    expect(NOW).toBeTruthy();
  });
});

function fieldsOf(api: { rows: CellValue[][]; sandbox: any }, row: number): Record<string, CellValue> {
  return Object.fromEntries((api.sandbox.WORKOUT_FIELDS as string[]).map((f, i) => [f, api.rows[row][i]]));
}
