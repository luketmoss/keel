// A Spin ride's streams on the detail screen (#771): fetched through the API's `getWorkoutStreams`
// with the user's token (the file is in the script account's Drive, which the app cannot read),
// checked at the boundary, reduced to what the screen draws, and held for the session by workout id.
//
// What is held is the derived result, never the raw arrays. Failures are not cached, so a later visit
// tries again. At most one request per workout is in flight. Demo mode reads bundled streams and makes
// no call, and a build without `VITE_THRIVE_API_URL` makes none either (the screen shows no ride hero).
// The reason for a failure is a kind only: never the token, never any part of the file.

import { useCallback, useEffect, useState } from 'preact/hooks';
import { useAuth } from '../auth/auth-context';
import { isDemo } from '../api/demo-data';
import { DEMO_SPIN_STREAMS } from '../api/demo-spin';
import { deriveRide, parseStreams, type RideDerived } from '../api/spin-streams';
import { callAction } from '../api/thrive-api';
import type { Workout } from '../api/types';

const cache = new Map<string, RideDerived>();
const inFlight = new Map<string, Promise<RideDerived>>();

/** For tests. */
export function clearStreamsCache(): void {
  cache.clear();
  inFlight.clear();
}

type RideFields = Pick<Workout, 'id' | 'source' | 'streams_ref' | 'status'>;

/**
 * Whether this row gets the ride hero: a completed Thrive Spin ride with a `streams_ref`, in demo mode
 * (which has bundled streams for it) or in a build with the API URL. Streams win over a track.
 */
export function rideStreamsAvailable(w: RideFields): boolean {
  if (w.source !== 'spin' || !w.streams_ref.trim()) return false;
  if (w.status === 'planned' || w.status === 'active') return false;
  if (isDemo()) return w.id in DEMO_SPIN_STREAMS;
  return Boolean((import.meta.env.VITE_THRIVE_API_URL ?? '').trim());
}

/** The row's FTP as a positive whole number, or null. */
export function rowFtp(w: Pick<Workout, 'ftp_w'>): number | null {
  const n = Number(w.ftp_w);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The ride fetched earlier this session, if any. */
export function getCachedRide(workoutId: string): RideDerived | undefined {
  return cache.get(workoutId);
}

async function load(workoutId: string, token: string | null, ftp: number | null): Promise<RideDerived> {
  let raw: unknown;
  if (isDemo()) {
    raw = DEMO_SPIN_STREAMS[workoutId];
    if (!raw) throw new Error('no_streams');
  } else {
    if (!token) throw new Error('no_token');
    const out = await callAction<{ streams?: unknown }>('getWorkoutStreams', token, { fields: { id: workoutId } });
    if (!out.ok) throw new Error(out.kind);
    raw = out.data?.streams;
  }
  const streams = parseStreams(raw);
  if (!streams) throw new Error('bad_response');
  return deriveRide(streams, ftp);
}

/** The derived ride: from the cache at once, else one request shared by every asker. */
export function fetchRide(workoutId: string, token: string | null, ftp: number | null): Promise<RideDerived> {
  const cached = cache.get(workoutId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(workoutId);
  if (pending) return pending;
  const run = load(workoutId, token, ftp).then((ride) => {
    cache.set(workoutId, ride);
    return ride;
  });
  inFlight.set(workoutId, run);
  const clear = () => {
    if (inFlight.get(workoutId) === run) inFlight.delete(workoutId);
  };
  run.then(clear, clear);
  return run;
}

export interface RideStreamsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  ride: RideDerived | null;
  retry: () => void;
}

/** The ride's streams for a screen. `null` id: nothing to fetch. A visit after the first renders ready at once. */
export function useRideStreams(workoutId: string | null, ftp: number | null): RideStreamsState {
  const { token } = useAuth();
  const [loaded, setLoaded] = useState<{ status: RideStreamsState['status']; ride: RideDerived | null }>(() => {
    const cached = workoutId ? cache.get(workoutId) : undefined;
    if (cached) return { status: 'ready', ride: cached };
    return { status: workoutId ? 'loading' : 'idle', ride: null };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!workoutId) {
      setLoaded({ status: 'idle', ride: null });
      return;
    }
    const cached = cache.get(workoutId);
    if (cached) {
      setLoaded({ status: 'ready', ride: cached });
      return;
    }
    let alive = true;
    setLoaded({ status: 'loading', ride: null });
    fetchRide(workoutId, token, ftp).then(
      (ride) => {
        // A response for a screen no longer showing is dropped.
        if (alive) setLoaded({ status: 'ready', ride });
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn('ride streams:', err instanceof Error ? err.message : 'failed');
        setLoaded({ status: 'error', ride: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [workoutId, token, ftp, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...loaded, retry };
}
