// #765 - getWorkoutStreams: a Spin ride's streams, by workout, after the file checks. Works for a
// token caller. Follows workout-track.test.ts.

import { describe, it, expect } from 'vitest';
import { workoutRow, callEntry, type DriveNode } from './apps-script-sandbox';
import { loadSpin, streamsFile, SPIN_KEY } from './spin-fixtures';

const TOKEN = 'ya29.a0Live/Token+Value=_with-chars';
const CLIENT_ID = 'thrive-1234.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';

/** A Drive laid out as saveRide makes it: Thrive Spin/streams/2026/11/ride-1.json. */
function drive(content = JSON.stringify(streamsFile('ride-1')), name = 'ride-1.json'): Record<string, DriveNode> {
  return {
    root: { name: 'My Drive', parents: [] },
    spin: { name: 'Thrive Spin', parents: ['root'] },
    streams: { name: 'streams', parents: ['spin'] },
    y: { name: '2026', parents: ['streams'] },
    m: { name: '11', parents: ['y'] },
    file: { name, parents: ['m'], content },
  };
}

const ride = (overrides: Record<string, string> = {}) => workoutRow({
  id: 'w_ride', type: 'bike', source: 'spin', source_activity_id: 'ride-1', streams_ref: 'file', ...overrides,
});

function load(nodes: Record<string, DriveNode>, workouts = [ride()]) {
  const api = loadSpin({ workouts }, {
    drive: nodes,
    properties: { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: EMAIL },
  });
  // The token path asks tokeninfo; answer it with the owner.
  api.sandbox.UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ azp: CLIENT_ID, aud: CLIENT_ID, expires_in: '3599', email: EMAIL, email_verified: 'true' }),
    }),
  };
  return api;
}

const asToken = (api: ReturnType<typeof load>, id = 'w_ride') =>
  callEntry<any>(api.sandbox, 'doPost', { action: 'getWorkoutStreams', access_token: TOKEN, id });
const asKey = (api: ReturnType<typeof load>, id = 'w_ride') =>
  callEntry<any>(api.sandbox, 'doGet', { action: 'getWorkoutStreams', key: 'test-key', id });

describe('getWorkoutStreams returns a Spin ride\'s streams', () => {
  it('returns the parsed file for a token caller, exactly as for a key caller', () => {
    const t = asToken(load(drive()));
    expect(t.res.success, t.text).toBe(true);
    expect(t.res.data).toEqual({
      workout_id: 'w_ride', ride_id: 'ride-1', streams_ref: 'file', streams: streamsFile('ride-1'),
    });
    expect(asKey(load(drive())).text).toBe(t.text);
  });

  it('is on the token read list, and is not a Spin-key action', () => {
    const api = load(drive());
    expect([...api.sandbox.TOKEN_READ_ACTIONS]).toContain('getWorkoutStreams');
    expect([...api.sandbox.SPIN_ACTIONS]).not.toContain('getWorkoutStreams');
    const spin = callEntry<any>(api.sandbox, 'doGet', { action: 'getWorkoutStreams', key: SPIN_KEY, id: 'w_ride' });
    expect(spin.res.code).toBe('spin_forbidden');
  });

  it('requires an id', () => {
    const { res } = callEntry<any>(load(drive()).sandbox, 'doGet', { action: 'getWorkoutStreams', key: 'test-key' });
    expect(res).toEqual({ success: false, error: 'id parameter required' });
  });
});

describe('it refuses, with fixed text that quotes nothing from the file or the request', () => {
  const NOT_A_FILE = 'streams_ref on this workout does not name its ride streams, so nothing was read from it.';

  it('a row with a blank streams_ref, and makes no Drive call', () => {
    const api = load(drive(), [ride({ streams_ref: '' })]);
    const { res } = asToken(api);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no streams/);
    expect(api.driveCalls).toEqual([]);
  });

  it('a non-Spin row, and makes no Drive call', () => {
    const api = load(drive(), [ride({ source: 'coros' }), workoutRow({ id: 'w_hand', streams_ref: 'file' })]);
    expect(asToken(api).res.error).toMatch(/not a Thrive Spin ride/);
    expect(asToken(api, 'w_hand').res.error).toMatch(/not a Thrive Spin ride/);
    expect(api.driveCalls).toEqual([]);
  });

  it('an unknown workout, without quoting its id', () => {
    const { res, text } = asToken(load(drive()), 'SECRET-ID');
    expect(res.success).toBe(false);
    expect(text).not.toContain('SECRET-ID');
  });

  it('a streams_ref naming a file of another name', () => {
    const { res } = asToken(load(drive(undefined, 'ride-2.json')));
    expect(res).toEqual({ success: false, error: NOT_A_FILE });
  });

  it('a streams_ref naming a file in another folder, or one with two parents', () => {
    const elsewhere = drive();
    elsewhere.streams.name = 'tracks';
    expect(asToken(load(elsewhere)).res.error).toBe(NOT_A_FILE);

    const wrongRoot = drive();
    wrongRoot.spin.name = 'Thrive COROS';
    expect(asToken(load(wrongRoot)).res.error).toBe(NOT_A_FILE);

    const badMonth = drive();
    badMonth.m.name = 'November';
    expect(asToken(load(badMonth)).res.error).toBe(NOT_A_FILE);

    const two = drive();
    two.other = { name: '11', parents: ['y'] };
    two.file.parents = ['m', 'other'];
    expect(asToken(load(two)).res.error).toBe(NOT_A_FILE);
  });

  it('a file whose ride_id differs, whose format is wrong, or that is not JSON', () => {
    for (const content of [
      JSON.stringify(streamsFile('someone-elses-ride')),
      JSON.stringify(streamsFile('ride-1', { format: 'thrive-track' })),
      'not json, SECRET FILE TEXT',
      '[]',
    ]) {
      const { res, text } = asToken(load(drive(content)));
      expect(res, content).toEqual({ success: false, error: NOT_A_FILE });
      expect(text).not.toContain('SECRET');
    }
  });

  it('a trashed file, a file over 4 MB, a missing file and a file in no archive', () => {
    const trashed = drive();
    trashed.file.trashed = true;
    expect(asToken(load(trashed)).res.error).toBe(NOT_A_FILE);

    const big = drive(JSON.stringify(streamsFile('ride-1', { pad: 'x'.repeat(4 * 1024 * 1024) })));
    expect(asToken(load(big)).res.error).toBe(NOT_A_FILE);

    const missing = drive();
    delete missing.file;
    expect(asToken(load(missing)).res.error).toBe(NOT_A_FILE);

    const loose = drive();
    loose.file.parents = [];
    expect(asToken(load(loose)).res.error).toBe(NOT_A_FILE);
  });

  it('a missing Drive scope, as the re-authorize message', () => {
    const api = loadSpin({ workouts: [ride()] }, { drive: drive(), properties: {} });
    api.sandbox.DriveApp.getFileById = () => { throw new Error('Authorization is required to perform that action.'); };
    const { res } = callEntry<any>(api.sandbox, 'doGet', { action: 'getWorkoutStreams', key: 'test-key', id: 'w_ride' });
    expect(res.error).toMatch(/re-authorize/);
  });
});
