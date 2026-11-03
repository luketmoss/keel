// #771 — the streams fetch: one call per workout per session, none in demo mode or without the API URL,
// and every response that fails the boundary check is an error.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const demo = { on: false };
vi.mock('../api/demo-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/demo-data')>()),
  isDemo: () => demo.on,
}));

const callAction = vi.fn();
vi.mock('../api/thrive-api', () => ({
  callAction: (...a: unknown[]) => callAction(...a),
  getWorkoutTrack: vi.fn(),
}));

import { clearStreamsCache, fetchRide, getCachedRide, rideStreamsAvailable, rowFtp } from './streams-cache';
import { DEMO_SWEET_SPOT_ID, DEMO_SWEET_SPOT_STREAMS } from '../api/demo-spin';

const body = (over: Record<string, unknown> = {}) => ({
  format: 'thrive-spin-streams',
  v: 1,
  ride_id: 'r1',
  ftp_w: 250,
  power_w: [100, 200, null],
  target_w: [null, null, null],
  hr_bpm: [null, null, null],
  cadence_rpm: [80, 0, 90],
  steps: [{ start_s: 0, end_s: 3, label: 'Ride', mode: 'free' }],
  pauses: [],
  ...over,
});

const reply = (streams: unknown) => ({
  ok: true,
  data: { workout_id: 'w1', ride_id: 'r1', streams_ref: 'f', streams },
});

beforeEach(() => {
  demo.on = false;
  vi.stubEnv('VITE_THRIVE_API_URL', 'https://script.google.com/macros/s/x/exec');
  callAction.mockReset().mockResolvedValue(reply(body()));
  clearStreamsCache();
});
afterEach(() => vi.unstubAllEnvs());

describe('fetchRide', () => {
  it('calls getWorkoutStreams with the workout id and the token', async () => {
    const ride = await fetchRide('w1', 'tok', 250);
    expect(callAction).toHaveBeenCalledTimes(1);
    expect(callAction).toHaveBeenCalledWith('getWorkoutStreams', 'tok', { fields: { id: 'w1' } });
    expect(ride.seconds).toBe(3);
    expect(ride.avgCadence).toBe(85);
  });

  it('makes no second request for a workout it has read, or one already in flight', async () => {
    const [a, b] = await Promise.all([fetchRide('w1', 'tok', 250), fetchRide('w1', 'tok', 250)]);
    expect(a).toBe(b);
    await fetchRide('w1', 'tok', 250);
    expect(callAction).toHaveBeenCalledTimes(1);
    expect(getCachedRide('w1')).toBe(a);
  });

  it('keeps the derived result, not the raw arrays', async () => {
    const ride = await fetchRide('w1', 'tok', null);
    expect(Object.keys(ride)).not.toContain('power');
    expect(ride.ftp).toBe(250);
  });

  it('does not cache a failure, so the next visit tries again', async () => {
    callAction.mockResolvedValueOnce({ ok: false, kind: 'timeout' });
    await expect(fetchRide('w1', 'tok', null)).rejects.toThrow('timeout');
    await expect(fetchRide('w1', 'tok', null)).resolves.toBeTruthy();
    expect(callAction).toHaveBeenCalledTimes(2);
  });

  it('refuses a response that fails the boundary check', async () => {
    callAction.mockResolvedValueOnce(reply(body({ format: 'other' })));
    await expect(fetchRide('w1', 'tok', null)).rejects.toThrow('bad_response');
    callAction.mockResolvedValueOnce(reply(undefined));
    await expect(fetchRide('w1', 'tok', null)).rejects.toThrow('bad_response');
    callAction.mockResolvedValueOnce(reply(body({ hr_bpm: [1] })));
    await expect(fetchRide('w1', 'tok', null)).rejects.toThrow('bad_response');
  });

  it('puts no part of the token or the file in an error', async () => {
    callAction.mockResolvedValueOnce(reply(body({ power_w: [1.5, 2, 3] })));
    const err = await fetchRide('w1', 'secret-token', null).catch((e: Error) => e);
    expect((err as Error).message).toBe('bad_response');
  });

  it('makes no call in demo mode, and reads the bundled streams', async () => {
    demo.on = true;
    const ride = await fetchRide(DEMO_SWEET_SPOT_ID, null, 250);
    expect(callAction).not.toHaveBeenCalled();
    expect(ride.seconds).toBe(DEMO_SWEET_SPOT_STREAMS.power_w.length);
  });

  it('refuses a demo workout with no bundled streams', async () => {
    demo.on = true;
    await expect(fetchRide('w_nope', null, null)).rejects.toThrow('no_streams');
  });

  it('refuses without a token', async () => {
    await expect(fetchRide('w1', null, null)).rejects.toThrow('no_token');
    expect(callAction).not.toHaveBeenCalled();
  });
});

describe('rideStreamsAvailable', () => {
  const row = { id: 'w1', source: 'spin', streams_ref: 'f', status: '' };
  it('needs a Spin row, a streams_ref, completion, and the API URL', () => {
    expect(rideStreamsAvailable(row)).toBe(true);
    expect(rideStreamsAvailable({ ...row, source: 'coros' })).toBe(false);
    expect(rideStreamsAvailable({ ...row, streams_ref: '' })).toBe(false);
    expect(rideStreamsAvailable({ ...row, status: 'planned' })).toBe(false);
    expect(rideStreamsAvailable({ ...row, status: 'active' })).toBe(false);
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(rideStreamsAvailable(row)).toBe(false);
  });

  it('in demo mode needs bundled streams, not the API URL', () => {
    demo.on = true;
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(rideStreamsAvailable({ ...row, id: DEMO_SWEET_SPOT_ID })).toBe(true);
    expect(rideStreamsAvailable({ ...row, id: 'w_other' })).toBe(false);
  });
});

describe('rowFtp', () => {
  it('is a positive whole number or null', () => {
    expect(rowFtp({ ftp_w: '250' })).toBe(250);
    expect(rowFtp({ ftp_w: '' })).toBeNull();
    expect(rowFtp({ ftp_w: '0' })).toBeNull();
    expect(rowFtp({ ftp_w: 'x' })).toBeNull();
  });
});
