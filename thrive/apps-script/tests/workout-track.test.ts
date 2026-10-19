// #432 AC4 — Workouts!AC track_ref, and getWorkoutTrack: a workout's simplified
// GPS track, read by workout id and confirmed to be that activity's track.
// Every coordinate here is invented: the repo is public.

import { describe, it, expect } from 'vitest';
import { loadApi, callDoGet, callEntry, workoutRow, type DriveNode, type CellValue, type FetchReply } from './apps-script-sandbox';

const ACTIVITY = '480573149960765546';
const FILE = '1_trackFileId-abc';
const NOT_TRACK =
  'track_ref on this workout does not name its GPS track, so nothing was read from it. The next sync run rewrites track_ref.';

function feature(over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  return {
    type: 'Feature',
    bbox: [-100.01, 45, -100, 45.002],
    properties: {
      format: 'thrive-track', version: 1, source: 'coros', activity_id: ACTIVITY,
      start_utc: '2026-06-01T14:00:00.000Z', t: [0, 60], ele: [800, null],
      simplify: { algorithm: 'rdp', tolerance_m: 5 }, points_in: 100, ...props,
    },
    geometry: { type: 'LineString', coordinates: [[-100, 45], [-100.01, 45.002]] },
    ...over,
  };
}

/** `Thrive COROS/tracks/2026/06/<file>`, with the token file beside the root. */
function drive(fileOver: Partial<DriveNode> = {}, content: unknown = feature()): Record<string, DriveNode> {
  return {
    root: { name: 'Thrive COROS', parents: ['myDrive'] },
    myDrive: { name: 'My Drive', parents: [] },
    tracks: { name: 'tracks', parents: ['root'] },
    y2026: { name: '2026', parents: ['tracks'] },
    m06: { name: '06', parents: ['y2026'] },
    [FILE]: {
      name: `${ACTIVITY}.json`,
      parents: ['m06'],
      content: typeof content === 'string' ? content : JSON.stringify(content),
      ...fileOver,
    },
    tokenFile: { name: 'coros-token.json', parents: ['root'], content: '{"refresh_token":"secret"}' },
  };
}

const ride = (over: Record<string, CellValue> = {}) =>
  workoutRow({ id: 'w_ride', type: 'bike', source: 'coros', source_activity_id: ACTIVITY, track_ref: FILE, ...over });

function read(rows: CellValue[][], nodes: Record<string, DriveNode>, params: Record<string, string> = {}, fails?: string) {
  const api = loadApi(rows, { drive: nodes, driveFails: fails });
  return { api, res: callDoGet<any>(api.sandbox, { action: 'getWorkoutTrack', id: 'w_ride', ...params }) };
}

describe('getWorkoutTrack returns the stored Feature unchanged, by workout id', () => {
  it('answers the workout, the activity, the ref and the track', () => {
    const { res, api } = read([ride()], drive());
    expect(res.success, res.error).toBe(true);
    expect(res.data).toEqual({ workout_id: 'w_ride', source_activity_id: ACTIVITY, track_ref: FILE, track: feature() });
    expect(api.driveCalls).toEqual([FILE]);
  });

  it('takes no Drive id from the caller', () => {
    const { res, api } = read([ride()], drive(), { track_ref: 'tokenFile', file_id: 'tokenFile' });
    expect(res.success).toBe(true);
    expect(api.driveCalls).toEqual([FILE]);
    expect(JSON.stringify(res)).not.toContain('refresh_token');
  });

  it('is on the token read list: the signed-in app reads it with its Google token', () => {
    const api = loadApi([ride()], {
      drive: drive(),
      properties: { TOKEN_CLIENT_ID: 'cid', TOKEN_ALLOWED_EMAIL: 'owner@example.com' },
      tokeninfo: (): FetchReply => ({
        status: 200,
        body: JSON.stringify({ azp: 'cid', aud: 'cid', expires_in: '3500', email: 'owner@example.com', email_verified: 'true' }),
      }),
    });
    expect(api.sandbox.TOKEN_READ_ACTIONS).toContain('getWorkoutTrack');
    const { res } = callEntry<any>(api.sandbox, 'doPost', { action: 'getWorkoutTrack', id: 'w_ride', access_token: 'tok' });
    expect(res.success, res.error).toBe(true);
    expect(res.data.track.properties.format).toBe('thrive-track');
  });
});

describe('only the row\'s own track file can be read', () => {
  it.each([
    ['no id', [ride()], drive(), { id: '' }, 'id parameter required'],
    ['an unknown workout', [ride()], drive(), { id: 'w_nope' }, 'Workout "w_nope" not found'],
    ['a blank track_ref', [ride({ track_ref: '' })], drive(), {}, 'has no GPS track (track_ref is blank)'],
    ['a blank source_activity_id', [ride({ source_activity_id: '' })], drive(), {}, 'has a track_ref but no source_activity_id'],
  ])('refuses %s without touching Drive', (_n, rows, nodes, params, message) => {
    const { res, api } = read(rows as CellValue[][], nodes, params as Record<string, string>);
    expect(res.success).toBe(false);
    expect(res.error).toContain(message);
    expect(api.driveCalls).toEqual([]);
  });

  it.each([
    ['a different name', { name: '1.json' }],
    ['a trashed file', { trashed: true }],
    ['a file over 1 MB', { content: JSON.stringify(feature({}, { pad: 'x'.repeat(1024 * 1024) })) }],
    ['a file in the activities archive', { parents: ['m06b'] }],
    ['invalid JSON', { content: '{"type":' }],
  ])('refuses %s with the fixed text', (_n, over) => {
    const nodes = {
      ...drive(over as Partial<DriveNode>),
      acts: { name: 'activities', parents: ['root'] },
      y2026b: { name: '2026', parents: ['acts'] },
      m06b: { name: '06', parents: ['y2026b'] },
    };
    const { res } = read([ride()], nodes);
    expect(res).toEqual({ success: false, error: NOT_TRACK });
  });

  it.each([
    ['not a Feature', { ...feature(), type: 'FeatureCollection' }],
    ['a different format', feature({}, { format: 'something-else' })],
    ['another activity\'s track', feature({}, { activity_id: '999' })],
    ['an array', [feature()]],
    ['no properties', { type: 'Feature', geometry: {} }],
  ])('refuses a file that is %s', (_n, content) => {
    const { res } = read([ride()], drive({}, content));
    expect(res).toEqual({ success: false, error: NOT_TRACK });
  });

  it('refuses a file two folders away from where the sync puts tracks', () => {
    const nodes = drive();
    nodes.tracks = { name: 'elsewhere', parents: ['root'] };
    expect(read([ride()], nodes).res).toEqual({ success: false, error: NOT_TRACK });
  });

  it('refuses the token file even when track_ref points at it, and quotes nothing from it', () => {
    const { res } = read([ride({ track_ref: 'tokenFile' })], drive());
    expect(res).toEqual({ success: false, error: NOT_TRACK });
    expect(JSON.stringify(res)).not.toContain('refresh_token');
  });

  it('says the owner must re-authorize when Drive refuses for want of the scope', () => {
    const { res } = read([ride()], drive(), {}, 'You do not have permission to call DriveApp.getFileById. Required permissions: https://www.googleapis.com/auth/drive.readonly');
    expect(res.success).toBe(false);
    expect(res.error).toContain('re-authorize');
  });

  it('does not mistake a missing file for a missing scope', () => {
    const { res } = read([ride({ track_ref: 'gone' })], drive());
    expect(res).toEqual({ success: false, error: NOT_TRACK });
  });
});

describe('track_ref is sync-owned column AC', () => {
  it('is the 29th column, after sport_type', () => {
    const { sandbox } = loadApi([]);
    expect(sandbox.WORKOUT_FIELDS[28]).toBe('track_ref');
    expect(sandbox.COL.TRACK_REF).toBe(28);
    expect(sandbox.WORKOUT_COLUMN_COUNT).toBe(29);
  });

  it('reads blank for a row written before it existed, and every read returns it', () => {
    const short = workoutRow().slice(0, 28);
    const { sandbox } = loadApi([short]);
    const [w] = callDoGet<any>(sandbox, { action: 'getWorkouts' }).data;
    expect(w.track_ref).toBe('');
  });

  it('updateWorkout writes it, preserves it on a full-row write, and refuses anything but a Drive id', () => {
    const api = loadApi([workoutRow({ id: 'w_1' })]);
    const w = callDoGet<any>(api.sandbox, { action: 'updateWorkout', payload: JSON.stringify({ id: 'w_1', changes: { track_ref: FILE } }) });
    expect(w.success, w.error).toBe(true);
    expect(api.rows[0][28]).toBe(FILE);
    callDoGet(api.sandbox, { action: 'updateWorkout', payload: JSON.stringify({ id: 'w_1', changes: { name: 'Renamed' } }) });
    expect(api.rows[0][28]).toBe(FILE);
    for (const bad of ['https://example.test/x', 'a/b', 'a b', 'x.json']) {
      const r = callDoGet<any>(api.sandbox, { action: 'updateWorkout', payload: JSON.stringify({ id: 'w_1', changes: { track_ref: bad } }) });
      expect(r.success).toBe(false);
      expect(r.error).not.toContain(bad);
    }
    callDoGet(api.sandbox, { action: 'updateWorkout', payload: JSON.stringify({ id: 'w_1', changes: { track_ref: '' } }) });
    expect(api.rows[0][28]).toBe('');
  });
});

describe('upsertSyncedWorkout takes an optional top-level track_ref', () => {
  const incoming = { date: '2026-06-01', time: '08:00', type: 'bike', sub_type: 'gravel', name: 'Ride' };
  const upsert = (rows: CellValue[][], extra: Record<string, unknown>) => {
    const api = loadApi(rows);
    const res = callDoGet<any>(api.sandbox, {
      action: 'upsertSyncedWorkout',
      payload: JSON.stringify({
        source: 'coros', source_activity_id: ACTIVITY, incoming, last_written: null,
        raw_ref: 'rawfile', synced_at: '2026-06-01T15:00:00.000Z', ...extra,
      }),
    });
    return { api, res };
  };

  it('writes it on a new row, as text', () => {
    const { api, res } = upsert([], { track_ref: FILE });
    expect(res.success, res.error).toBe(true);
    expect(api.rows[0]).toHaveLength(29);
    expect(api.rows[0][28]).toBe(FILE);
  });

  it('overwrites on an existing row, "" clears, and absent leaves it alone', () => {
    const existing = () => ride({ raw_ref: 'rawfile', date: '2026-06-01', time: '08:00', sub_type: 'gravel', name: 'Ride' });
    const sent = upsert([existing()], { track_ref: 'newTrackFile' });
    expect(sent.res.success, sent.res.error).toBe(true);
    expect(sent.api.rows[0][28]).toBe('newTrackFile');

    const cleared = upsert([existing()], { track_ref: '' });
    expect(cleared.api.rows[0][28]).toBe('');

    const absent = upsert([existing()], {});
    expect(absent.res.success, absent.res.error).toBe(true);
    expect(absent.api.rows[0][28]).toBe(FILE);
  });

  it('refuses anything but a Drive id, without echoing it', () => {
    const { res, api } = upsert([], { track_ref: 'https://drive.example/x?token=secret' });
    expect(res.success).toBe(false);
    expect(res.error).not.toContain('secret');
    expect(api.rows).toHaveLength(0);
  });

  it('never merges: track_ref is not in written or edited', () => {
    const { res } = upsert([], { track_ref: FILE });
    expect(JSON.stringify(res.data.written)).not.toContain('track_ref');
  });
});
