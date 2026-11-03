// Thrive Spin's workout library, read for the detail screen (#771, the loader #772 specifies and reuses):
// the `RideWorkouts` tab through the Sheets API's values endpoint with the signed-in user's token. The
// API's `getRideWorkouts` is the Spin key's and the token caller cannot run it (#765).
//
// Read when a screen that needs it opens, never at launch, and held for the session like the other
// tabs. A missing tab reads as an empty library. A failed read is not held, so the next screen tries
// again. Demo mode makes no call and answers from the bundled library.

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { useAuth } from '../auth/auth-context';
import { isDemo } from '../api/demo-data';
import { DEMO_RIDE_WORKOUTS } from '../api/demo-spin';
import { columnLetter } from '../api/health-api';
import { isMissingTabError, sheetsGet, withReauth } from '../api/sheets';
import { RIDE_WORKOUT_FIELDS, rowToRideWorkout, type RideWorkoutRow } from '../api/spin-rows';

export const RIDE_WORKOUTS_SHEET = 'RideWorkouts';

export interface RideLibraryState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  workouts: RideWorkoutRow[];
}

/** The session's library. */
export const rideLibrary = signal<RideLibraryState>({ status: 'idle', workouts: [] });

/** For tests. */
export function resetRideLibrary(): void {
  rideLibrary.value = { status: 'idle', workouts: [] };
  pending = null;
}

let pending: Promise<void> | null = null;

/** Every library row with an id, in sheet order. A missing tab is an empty library. */
export async function fetchRideWorkouts(token: string): Promise<RideWorkoutRow[]> {
  if (isDemo()) return DEMO_RIDE_WORKOUTS;
  return withReauth(token, async (t) => {
    let rows: unknown[][];
    try {
      rows = await sheetsGet(`${RIDE_WORKOUTS_SHEET}!A2:${columnLetter(RIDE_WORKOUT_FIELDS.length)}`, t);
    } catch (err) {
      if (isMissingTabError(err)) return [];
      throw err;
    }
    return rows.map((row) => rowToRideWorkout(row.map((c) => String(c ?? '')))).filter((w) => !!w.id);
  });
}

/**
 * Read the library once per session. Loaded: nothing happens. Loading: the one read is shared. After an
 * error, a call reads again, which is what Try again is.
 */
export function ensureRideLibrary(token: string | null): Promise<void> {
  if (rideLibrary.value.status === 'loaded') return Promise.resolve();
  if (pending) return pending;
  if (!token && !isDemo()) {
    rideLibrary.value = { status: 'error', workouts: [] };
    return Promise.resolve();
  }
  rideLibrary.value = { status: 'loading', workouts: [] };
  const run = fetchRideWorkouts(token ?? '').then(
    (workouts) => {
      rideLibrary.value = { status: 'loaded', workouts };
    },
    (err: unknown) => {
      console.warn('ride library:', err instanceof Error ? err.name : 'failed');
      rideLibrary.value = { status: 'error', workouts: [] };
    },
  );
  pending = run;
  void run.then(() => {
    if (pending === run) pending = null;
  });
  return run;
}

/** Reads the library when the screen needs it (`wanted`), and returns the session's state. */
export function useRideLibrary(wanted: boolean): RideLibraryState {
  const { token } = useAuth();
  useEffect(() => {
    if (wanted) void ensureRideLibrary(token);
  }, [wanted, token]);
  return rideLibrary.value;
}
