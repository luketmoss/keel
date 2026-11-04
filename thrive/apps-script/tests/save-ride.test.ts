// #765 - saveRide: the ride upload. Fake Drive, fake sheet.

import { describe, it, expect } from 'vitest';
import { workoutRow, type DriveNode } from './apps-script-sandbox';
import {
  loadSpin, makeRide, saveRide, call, fitBytes, streamsFile, sha256, driveFilesNamed, NOW, SPIN_KEY,
} from './spin-fixtures';

function setup(workouts: any[] = []) {
  const drive: Record<string, DriveNode> = {};
  const api = loadSpin({ workouts }, { drive, uuids: ['a1b2c3d4-0000'] });
  return { api, drive };
}

const planned = (overrides: Record<string, string> = {}) => workoutRow({
  id: 'w_plan', type: 'bike', status: 'planned', date: '2026-11-07', name: 'Planned Sweet Spot',
  template_id: 'tpl_x', estimated_seconds: '3600', notes: 'plan notes', effort: 'Easy',
  ride_workout_id: 'rw_planned', ...overrides,
});

/** The path of a Drive file below the root, as `Thrive Spin/fit/2026/11/ride-1.fit`. */
function pathOf(drive: Record<string, DriveNode>, id: string): string {
  const parts: string[] = [];
  let node: DriveNode | undefined = drive[id];
  while (node && node.parents.length) {
    parts.unshift(node.name);
    node = drive[node.parents[0]];
  }
  return parts.join('/');
}

describe('a valid saveRide creates one indoor Spin row', () => {
  it('writes the row: bike, indoor, spin, complete, the Denver clock, AE:AL as sent', () => {
    const { api } = setup();
    const ride = makeRide();
    const { res, text } = saveRide(api, ride);
    expect(res.success, text).toBe(true);
    expect(res.data).toMatchObject({ status: 'created', id: 'w_a1b2c3d4' });
    expect(res.data.ambiguous_plans).toBeUndefined();
    expect(api.rows).toHaveLength(1);

    const w = Object.fromEntries(api.sandbox.WORKOUT_FIELDS.map((f: string, i: number) => [f, api.rows[0][i]]));
    expect(w).toMatchObject({
      id: 'w_a1b2c3d4', type: 'bike', sub_type: 'indoor', source: 'spin', source_activity_id: 'ride-1', status: '',
      name: 'Sweet Spot 3x12',
      // 15:02:11Z on 7 November 2026 is 08:02 MST.
      date: '2026-11-07', time: '08:02', started_at_utc: '2026-11-07T15:02:11Z',
      elapsed_seconds: '3645', moving_seconds: '3600', avg_hr: '141', calories: '683', distance_m: '', effort: 'Hard', notes: '',
      avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', ftp_w: '250',
      intensity_pct: '100', ride_workout_id: 'rw_1a2b3c4d',
      fit_fetched_at: NOW.toISOString(), synced_at: NOW.toISOString(), created: NOW.toISOString(),
      raw_ref: '', sport_type: '', track_ref: '', trails: '',
    });
    expect(w.fit_ref).toBe(res.data.fit_ref);
    expect(w.streams_ref).toBe(res.data.streams_ref);
    expect(api.rows[0]).toHaveLength(40);
  });

  it('the date is the Denver date even when UTC has rolled over', () => {
    const { api } = setup();
    // 03:30Z on 8 November is 20:30 on the 7th in Denver.
    const ride = makeRide({ started_at_utc: '2026-11-08T03:30:00Z' });
    ride.streams = JSON.stringify(streamsFile('ride-1', { started_at_utc: '2026-11-08T03:30:00Z' }));
    ride.payload.streams_sha256 = sha256(ride.streams);
    expect(saveRide(api, ride).res.success).toBe(true);
    expect(api.rows[0][1]).toBe('2026-11-07');
    expect(api.rows[0][2]).toBe('20:30');
  });

  it('stores intensity_factor as text with two decimals, and a free ride has a blank ride_workout_id', () => {
    const { api } = setup();
    expect(saveRide(api, makeRide({ intensity_factor: 1, ride_workout_id: '' })).res.success).toBe(true);
    expect(api.rows[0][32]).toBe('1.00');
    expect(api.rows[0][37]).toBe('');
  });

  it('does not check that ride_workout_id exists, so a workout deleted before the upload does not block the queue', () => {
    const { api } = setup();
    expect(saveRide(api, makeRide({ ride_workout_id: 'rw_deleted_long_ago' })).res.success).toBe(true);
    expect(api.rows[0][37]).toBe('rw_deleted_long_ago');
  });

  it('accepts null for avg_hr, calories and distance_m, and whole numbers for them', () => {
    const { api } = setup();
    expect(saveRide(api, makeRide({ avg_hr: null, calories: null, distance_m: 12000 })).res.success).toBe(true);
    expect(api.rows[0][16]).toBe('');
    expect(api.rows[0][25]).toBe('');
    expect(api.rows[0][13]).toBe('12000');
  });

  it('writes the files where the issue says, with the decoded FIT bytes as sent', () => {
    const { api, drive } = setup();
    const ride = makeRide();
    const { res } = saveRide(api, ride);
    const [[fitId, fitNode]] = driveFilesNamed(drive, 'ride-1.fit');
    const [[streamsId, streamsNode]] = driveFilesNamed(drive, 'ride-1.json');
    expect(res.data.fit_ref).toBe(fitId);
    expect(res.data.streams_ref).toBe(streamsId);
    expect(pathOf(drive, fitId)).toBe('Thrive Spin/fit/2026/11/ride-1.fit');
    expect(pathOf(drive, streamsId)).toBe('Thrive Spin/streams/2026/11/ride-1.json');
    expect(Buffer.from(fitNode.bytes!.map((b) => b & 255)).equals(ride.fitBuffer)).toBe(true);
    expect(streamsNode.content).toBe(ride.streams);
  });

  it('takes the script lock and reuses folders across rides', () => {
    const { api, drive } = setup();
    saveRide(api, makeRide({}, 'ride-1'));
    const second = makeRide({}, 'ride-2');
    saveRide(api, second);
    expect(api.lock.acquired).toBe(2);
    const folders = Object.values(drive).filter((n) => n.content === undefined && n.bytes === undefined && n.name === 'Thrive Spin');
    expect(folders).toHaveLength(1);
    expect(Object.values(drive).filter((n) => n.name === '2026' && n.content === undefined)).toHaveLength(2); // fit/2026, streams/2026
    expect(api.rows).toHaveLength(2);
  });
});

describe('a retry is idempotent', () => {
  it('the same saveRide again answers exists with the same id and refs, leaving one row and one file of each name', () => {
    const { api, drive } = setup();
    const ride = makeRide();
    const first = saveRide(api, ride).res.data;
    const files = Object.keys(drive).length;
    const again = saveRide(api, ride);
    expect(again.res.data).toEqual({
      status: 'exists', id: first.id, fit_ref: first.fit_ref, streams_ref: first.streams_ref,
    });
    expect(api.rows).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.fit')).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.json')).toHaveLength(1);
    expect(Object.keys(drive)).toHaveLength(files); // not one new node
  });

  it('answers exists whatever else the payload says, writing nothing', () => {
    const { api, drive } = setup();
    const first = saveRide(api, makeRide()).res.data;
    const nodes = Object.keys(drive).length;
    const odd = makeRide({ name: 'A different name', effort: 'Moderate', avg_power_w: 'lots', fit_sha256: 'nope' });
    const again = saveRide(api, odd, { fit: 'not base64!!', streams: '{}' });
    expect(again.res.data).toMatchObject({ status: 'exists', id: first.id });
    expect(api.rows).toHaveLength(1);
    expect(api.rows[0][4]).toBe('Sweet Spot 3x12');
    expect(Object.keys(drive)).toHaveLength(nodes);
  });

  it('after a first attempt that wrote the files but not the row, a retry leaves one row and one file of each name', () => {
    const { api, drive } = setup();
    const ride = makeRide();
    // The first attempt died after the Drive writes: files, no row. Simulate by failing the append once.
    const create = api.sandbox.createWorkout;
    api.sandbox.createWorkout = () => { throw new Error('execution timed out'); };
    const failed = saveRide(api, ride);
    expect(failed.res.success).toBe(false);
    expect(api.rows).toHaveLength(0);
    expect(driveFilesNamed(drive, 'ride-1.fit')).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.json')).toHaveLength(1);
    const orphan = driveFilesNamed(drive, 'ride-1.fit')[0][0];

    api.sandbox.createWorkout = create;
    const retry = saveRide(api, ride);
    expect(retry.res.data.status).toBe('created');
    expect(api.rows).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.fit')).toHaveLength(1);
    expect(driveFilesNamed(drive, 'ride-1.json')).toHaveLength(1);
    // The earlier file was replaced, not left beside the new one.
    expect(drive[orphan].trashed).toBe(true);
    expect(retry.res.data.fit_ref).toBe(driveFilesNamed(drive, 'ride-1.fit')[0][0]);
  });

  it('two Spin rows for one ride are refused, naming them', () => {
    const row = (id: string) => workoutRow({ id, type: 'bike', source: 'spin', source_activity_id: 'ride-1' });
    const { api, drive } = setup([row('w_a'), row('w_b')]);
    const { res } = saveRide(api, makeRide());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/w_a at row 2/);
    expect(res.error).toMatch(/w_b at row 3/);
    expect(Object.keys(drive)).toEqual(['root']);
  });
});

describe('saveRide refuses bad input as bad_request, writing no row and no file', () => {
  const bigFit = () => {
    const buf = Buffer.alloc(5 * 1024 * 1024 + 1, 1);
    buf.write('.FIT', 8, 'ascii');
    return buf;
  };

  const cases: [string, () => ReturnType<typeof makeRide> & { fit?: string; streams?: string }][] = [
    ['a fit_sha256 mismatch', () => makeRide({ fit_sha256: sha256('other') })],
    ['a streams_sha256 mismatch', () => makeRide({ streams_sha256: sha256('other') })],
    ['a malformed hash', () => makeRide({ fit_sha256: 'ABC' })],
    ['FIT bytes without .FIT at 8-11', () => {
      const b = fitBytes();
      b.write('.FXT', 8, 'ascii');
      return { ...makeRide({ fit_sha256: sha256(b) }), fit: b.toString('base64') };
    }],
    ['FIT bytes shorter than a header', () => {
      const b = Buffer.from('.FIT');
      return { ...makeRide({ fit_sha256: sha256(b) }), fit: b.toString('base64') };
    }],
    ['a FIT over 5 MB', () => {
      const b = bigFit();
      return { ...makeRide({ fit_sha256: sha256(b) }), fit: b.toString('base64') };
    }],
    ['streams over 4 MB', () => {
      const text = JSON.stringify(streamsFile('ride-1', { pad: 'x'.repeat(4 * 1024 * 1024) }));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['fit that is not base64', () => ({ ...makeRide(), fit: 'not base64!!' })],
    ['a missing fit', () => ({ ...makeRide(), fit: '' })],
    ['a missing streams', () => ({ ...makeRide(), streams: '' })],
    ['streams whose arrays differ in length', () => {
      const text = JSON.stringify(streamsFile('ride-1', { hr_bpm: [1, 2, 3] }));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['streams whose ride_id differs from the payload', () => {
      const text = JSON.stringify(streamsFile('another-ride'));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['streams with the wrong format', () => {
      const text = JSON.stringify(streamsFile('ride-1', { format: 'thrive-track' }));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['streams with the wrong version', () => {
      const text = JSON.stringify(streamsFile('ride-1', { v: 2 }));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['streams that are not JSON', () => {
      const text = 'not json {';
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['streams with a fractional reading', () => {
      const text = JSON.stringify(streamsFile('ride-1', { power_w: [0, 1.5, 2, 3, 4] }));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['streams with an empty array', () => {
      const text = JSON.stringify(streamsFile('ride-1', { power_w: [], target_w: [], hr_bpm: [], cadence_rpm: [] }));
      return { ...makeRide({ streams_sha256: sha256(text) }), streams: text };
    }],
    ['effort Moderate', () => makeRide({ effort: 'Moderate' })],
    ['a missing power field', () => makeRide({ np_w: undefined })],
    ['a fractional power field', () => makeRide({ avg_power_w: 190.5 })],
    ['a text power field', () => makeRide({ tss: 'lots' })],
    ['a missing ftp_w', () => makeRide({ ftp_w: undefined })],
    ['an out-of-range ftp_w', () => makeRide({ ftp_w: 5000 })],
    ['a missing ride_id', () => makeRide({ ride_id: undefined })],
    ['a malformed ride_id', () => makeRide({ ride_id: 'a/b' })],
    ['a malformed ride_workout_id', () => makeRide({ ride_workout_id: 'a b' })],
    ['a bad started_at_utc', () => makeRide({ started_at_utc: 'yesterday' })],
    ['a blank name', () => makeRide({ name: ' ' })],
    ['a fractional avg_hr', () => makeRide({ avg_hr: 140.5 })],
  ];
  for (const [name, build] of cases) {
    it(`refuses ${name}`, () => {
      const { api, drive } = setup();
      const ride = build();
      const { res, text } = saveRide(api, ride, { fit: ride.fit, streams: ride.streams });
      expect(res.success, text).toBe(false);
      expect(res.code).toBe('bad_request');
      expect(api.rows).toEqual([]);
      expect(Object.keys(drive)).toEqual(['root']); // no folder, no file
    });
  }

  it('accepts a FIT of exactly 5 MB', () => {
    const { api } = setup();
    const b = Buffer.alloc(5 * 1024 * 1024, 1);
    b.write('.FIT', 8, 'ascii');
    const ride = { ...makeRide({ fit_sha256: sha256(b) }), fit: b.toString('base64') };
    expect(saveRide(api, ride, { fit: ride.fit }).res.success).toBe(true);
  });

  it('a refusal quotes nothing the caller sent', () => {
    const { api } = setup();
    for (const ride of [
      makeRide({ effort: 'SECRETWORD' }), makeRide({ name: undefined, notes: 5 }), makeRide({ ride_id: 'SECRET WORD' }),
    ]) {
      const { text } = saveRide(api, ride);
      expect(text).not.toContain('SECRET');
    }
  });

  it('only the Spin key and the full keys may call it; a token caller is read-only', () => {
    const { api } = setup();
    const ride = makeRide();
    const { res } = call<any>(api, 'saveRide', ride.payload, 'test-key', { fit: ride.fit, streams: ride.streams });
    expect(res.success).toBe(true);
    const asToken = call<any>(api, 'saveRide', ride.payload, undefined as unknown as string, { access_token: 'x' });
    expect(asToken.res.success).toBe(false);
  });
});

describe('the plan claim (luketmoss/thrive#403\'s rule)', () => {
  it('with exactly one planned bike row on the ride\'s date and blank source, claims it', () => {
    const { api, drive } = setup([planned()]);
    const { res, text } = saveRide(api, makeRide({ effort: 'Hard', notes: '' }));
    expect(res.success, text).toBe(true);
    expect(res.data).toMatchObject({ status: 'claimed', id: 'w_plan' });
    expect(api.rows).toHaveLength(1);
    const w = Object.fromEntries(api.sandbox.WORKOUT_FIELDS.map((f: string, i: number) => [f, api.rows[0][i]]));
    expect(w).toMatchObject({
      id: 'w_plan', status: '', type: 'bike', sub_type: 'indoor', source: 'spin', source_activity_id: 'ride-1',
      // The plan keeps its name, template and estimate.
      name: 'Planned Sweet Spot', template_id: 'tpl_x', estimated_seconds: '3600',
      // The ride's notes and effort win when non-blank, else the plan's stay: effort is Hard, notes stay.
      effort: 'Hard', notes: 'plan notes',
      avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', ftp_w: '250', intensity_pct: '100',
      // ride_workout_id becomes the workout ridden.
      ride_workout_id: 'rw_1a2b3c4d',
      elapsed_seconds: '3645', moving_seconds: '3600', avg_hr: '141', calories: '683',
      date: '2026-11-07', time: '08:02', started_at_utc: '2026-11-07T15:02:11Z',
    });
    expect(w.fit_ref).toBe(res.data.fit_ref);
    expect(w.streams_ref).toBe(res.data.streams_ref);
    expect(driveFilesNamed(drive, 'ride-1.json')).toHaveLength(1);
  });

  it('the ride\'s notes win when non-blank, and the plan\'s effort stays when the ride has none', () => {
    const { api } = setup([planned()]);
    expect(saveRide(api, makeRide({ effort: '', notes: 'felt great' })).res.data.status).toBe('claimed');
    expect(api.rows[0][6]).toBe('felt great');
    expect(api.rows[0][12]).toBe('Easy');
  });

  it('a free ride claims a plan and clears its link: the row records what was ridden', () => {
    const { api } = setup([planned()]);
    saveRide(api, makeRide({ ride_workout_id: '' }));
    expect(api.rows[0][37]).toBe('');
  });

  it('with two such plans, appends a new row and returns both ids as ambiguous_plans, touching neither', () => {
    const { api } = setup([planned(), planned({ id: 'w_plan2', name: 'Second plan' })]);
    const before = JSON.stringify(api.rows);
    const { res } = saveRide(api, makeRide());
    expect(res.data).toMatchObject({ status: 'created', ambiguous_plans: ['w_plan', 'w_plan2'] });
    expect(api.rows).toHaveLength(3);
    expect(JSON.stringify(api.rows.slice(0, 2))).toBe(before);
  });

  it('with a planned weight row only, appends', () => {
    const { api } = setup([planned({ type: 'weight' })]);
    const { res } = saveRide(api, makeRide());
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toBeUndefined();
    expect(api.rows).toHaveLength(2);
    expect(api.rows[0][10]).toBe('planned');
  });

  it('does not claim a plan on another date, one that is already claimed, or a finished hand-logged row', () => {
    const { api } = setup([
      planned({ id: 'w_other_day', date: '2026-11-08' }),
      planned({ id: 'w_claimed', source: 'coros', source_activity_id: 'c1' }),
      planned({ id: 'w_done', status: '' }),
    ]);
    const { res } = saveRide(api, makeRide());
    expect(res.data.status).toBe('created');
    expect(res.data.ambiguous_plans).toBeUndefined();
    expect(api.rows).toHaveLength(4);
  });

  it('claims by the Denver date of the ride', () => {
    const { api } = setup([planned({ date: '2026-11-07' })]);
    // 03:30Z on the 8th is the 7th in Denver.
    const ride = makeRide({ started_at_utc: '2026-11-08T03:30:00Z' });
    ride.streams = JSON.stringify(streamsFile('ride-1', { started_at_utc: '2026-11-08T03:30:00Z' }));
    ride.payload.streams_sha256 = sha256(ride.streams);
    expect(saveRide(api, ride).res.data.status).toBe('claimed');
  });
});

describe('Drive permission', () => {
  it('reports a missing scope as the fixed Drive message, and writes no row', () => {
    const { api } = setup();
    api.sandbox.DriveApp.getRootFolder = () => { throw new Error('Authorization is required to perform that action.'); };
    const { res } = saveRide(api, makeRide());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/re-authorize/);
    expect(api.rows).toEqual([]);
  });

  it('SPIN_KEY is what the tests use', () => {
    expect(SPIN_KEY).toBe('spin-phone-key');
  });
});
