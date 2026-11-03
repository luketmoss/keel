// Shared fixtures for the Thrive Spin tests (#765): a loaded API with the Spin key set,
// the example steps, and a valid ride (FIT bytes, streams text, payload).

import { createHash } from 'node:crypto';
import { loadApi, callEntry, type CellValue, type DriveNode, type LoadedApi } from './apps-script-sandbox';

export const NOW = new Date('2026-11-07T15:30:00.000Z');
export const SPIN_KEY = 'spin-phone-key';
export const MCP_KEY = 'mcp-worker-key';
export const WIDGET_KEY = 'widget-phone-key';

/** The issue's example: 600 + 3 x (720 + 240) + 300 + 300 + 360 = 4440 s. */
export const EXAMPLE_STEPS = {
  v: 1,
  steps: [
    { label: 'Warm-up', dur_s: 600, mode: 'erg', pct: 50, pct_end: 70 },
    {
      repeat: 3,
      steps: [
        { label: 'Sweet spot', dur_s: 720, mode: 'erg', pct: 90, cadence: 90 },
        { label: 'Recover', dur_s: 240, mode: 'erg', pct: 55 },
      ],
    },
    { label: 'Climb', dur_s: 300, mode: 'slope', grade: 4.5 },
    { label: 'Spin', dur_s: 300, mode: 'resistance', level: 30 },
    { label: 'Cool-down', dur_s: 360, mode: 'free' },
  ],
};

export interface SpinFixtures {
  workouts?: CellValue[][];
  rideWorkouts?: CellValue[][];
  ftpHistory?: CellValue[][];
  changeLog?: CellValue[][];
}

export function loadSpin(
  fixtures: SpinFixtures = {},
  options: { properties?: Record<string, string | undefined>; drive?: Record<string, DriveNode>; uuids?: string[] } = {},
): LoadedApi {
  // A property passed as undefined is unset, not blank.
  const properties: Record<string, string> = {};
  for (const [k, v] of Object.entries({
    SPIN_API_KEY: SPIN_KEY, MCP_API_KEY: MCP_KEY, WIDGET_API_KEY: WIDGET_KEY, ...options.properties,
  })) if (v !== undefined) properties[k] = v;
  return loadApi(
    {
      workouts: fixtures.workouts ?? [],
      rideWorkouts: fixtures.rideWorkouts ?? [],
      ftpHistory: fixtures.ftpHistory ?? [],
      ...(fixtures.changeLog ? { changeLog: fixtures.changeLog } : {}),
    },
    {
      now: NOW,
      uuids: options.uuids,
      drive: options.drive,
      properties,
    },
  );
}

/** Call an action as a form-encoded POST with `key` and the JSON `payload`. */
export function call<T = any>(
  api: LoadedApi,
  action: string,
  payload: unknown,
  key = SPIN_KEY,
  extra: Record<string, string> = {},
) {
  return callEntry<T>(api.sandbox, 'doPost', {
    action, key, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }), ...extra,
  });
}

/** A RideWorkouts row (A:H), with only the named fields set. */
export function rideWorkoutRow(overrides: Record<string, CellValue> = {}): CellValue[] {
  const f: Record<string, CellValue> = {
    id: 'rw_1a2b3c4d', name: 'Sweet Spot 3x12', category: 'Sweet spot', description: '',
    steps: JSON.stringify(EXAMPLE_STEPS), duration_s: '4440',
    created: '2026-10-01T00:00:00.000Z', updated: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
  return ['id', 'name', 'category', 'description', 'steps', 'duration_s', 'created', 'updated'].map((k) => f[k] ?? '');
}

/** An FtpHistory row (A:F), with only the named fields set. */
export function ftpRow(overrides: Record<string, CellValue> = {}): CellValue[] {
  const f: Record<string, CellValue> = {
    id: 'ftp_1', date: '2026-09-01', ftp_w: '240', source: 'manual', ride_id: '',
    created: '2026-09-01T12:00:00.000Z', ...overrides,
  };
  return ['id', 'date', 'ftp_w', 'source', 'ride_id', 'created'].map((k) => f[k] ?? '');
}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** A FIT-shaped file: a 14 byte header with `.FIT` at 8..11, then some body. */
export function fitBytes(size = 200): Buffer {
  const buf = Buffer.alloc(size, 7);
  buf.writeUInt8(14, 0);
  buf.write('.FIT', 8, 'ascii');
  return buf;
}

/** A valid streams file for a ride: `seconds` long, one erg step. */
export function streamsFile(rideId = 'ride-1', overrides: Record<string, unknown> = {}) {
  const seconds = 5;
  return {
    format: 'thrive-spin-streams', v: 1, ride_id: rideId,
    started_at_utc: '2026-11-07T15:02:11Z', interval_s: 1, ftp_w: 250, intensity_pct: 100,
    power_w: [0, 112, 130, 128, 131], target_w: [125, 125, 125, 125, 125],
    hr_bpm: [98, null, 101, 103, 104], cadence_rpm: [0, 84, 88, 90, 89],
    steps: [{ start_s: 0, end_s: seconds, label: 'Warm-up', mode: 'erg' }],
    pauses: [{ at_s: 3, duration_s: 45 }],
    ...overrides,
  };
}

export interface Ride {
  payload: Record<string, unknown>;
  fit: string;
  streams: string;
  fitBuffer: Buffer;
}

/**
 * A valid `saveRide` request. `started_at_utc` is 15:02 UTC on 2026-11-07, which is
 * 08:02 on the Denver clock the same day. Overrides apply to the payload.
 */
export function makeRide(overrides: Record<string, unknown> = {}, rideId = 'ride-1'): Ride {
  const fitBuffer = fitBytes();
  const streams = JSON.stringify(streamsFile(rideId));
  return {
    fitBuffer,
    fit: fitBuffer.toString('base64'),
    streams,
    payload: {
      ride_id: rideId, started_at_utc: '2026-11-07T15:02:11Z', name: 'Sweet Spot 3x12',
      ride_workout_id: 'rw_1a2b3c4d', elapsed_seconds: 3645, moving_seconds: 3600,
      avg_hr: 141, calories: 683, distance_m: null,
      avg_power_w: 190, np_w: 215, intensity_factor: 0.86, tss: 74, work_kj: 683,
      ftp_w: 250, intensity_pct: 100, effort: 'Hard', notes: '',
      fit_sha256: sha256(fitBuffer), streams_sha256: sha256(streams),
      ...overrides,
    },
  };
}

/** POST a ride; `fit` and `streams` default to the ride's own and can be replaced. */
export function saveRide(api: LoadedApi, ride: Ride, extra: { fit?: string; streams?: string; key?: string } = {}) {
  return call<any>(api, 'saveRide', ride.payload, extra.key ?? SPIN_KEY, {
    fit: extra.fit ?? ride.fit,
    streams: extra.streams ?? ride.streams,
  });
}

/** The live fake Drive's non-trashed files with this name, as `[id, node]`. */
export function driveFilesNamed(drive: Record<string, DriveNode>, name: string): [string, DriveNode][] {
  return Object.entries(drive).filter(
    ([, n]) => n.name === name && (n.content !== undefined || n.bytes !== undefined) && !n.trashed);
}
