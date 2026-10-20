// The session's GPS tracks (#407, #530): fetched from the API, or read from the
// bundled demo tracks, and kept by workout id so the Activities list and the
// detail screen share one fetch. Nothing persists across a reload.
//
// Every request goes through one FIFO with at most two fetches in flight, so a
// long list scrolling into range never opens a dozen requests at once. A request
// that is still waiting its turn can be cancelled (a card that scrolled out of
// range); one already in flight finishes and fills the cache. Failures are not
// cached, so a later visit tries again.

import { DEMO_TRACKS } from '../api/demo-track';
import { isDemo } from '../api/demo-data';
import { getWorkoutTrack } from '../api/thrive-api';
import type { WorkoutTrack } from '../api/types';

/** Requests allowed in flight at once. */
export const MAX_IN_FLIGHT = 2;

const cache = new Map<string, WorkoutTrack>();
const inFlight = new Map<string, Promise<WorkoutTrack>>();

interface Waiting {
  id: string;
  token: string | null;
  resolve: (track: WorkoutTrack) => void;
  reject: (err: unknown) => void;
}

const queue: Waiting[] = [];
let running = 0;

/** For tests. */
export function clearTrackCache(): void {
  cache.clear();
  inFlight.clear();
  queue.length = 0;
  running = 0;
}

/** The track fetched earlier this session, if any. */
export function getCachedTrack(workoutId: string): WorkoutTrack | undefined {
  return cache.get(workoutId);
}

async function load(workoutId: string, token: string | null): Promise<WorkoutTrack> {
  const cached = cache.get(workoutId);
  if (cached) return cached;
  const pending = inFlight.get(workoutId);
  if (pending) return pending;

  const run = (async () => {
    let track: WorkoutTrack;
    if (isDemo()) {
      track = DEMO_TRACKS[workoutId];
      if (!track) throw new Error('no_track');
    } else {
      if (!token) throw new Error('no_token');
      const out = await getWorkoutTrack(workoutId, token);
      if (!out.ok) throw new Error(out.kind);
      track = out.track;
    }
    cache.set(workoutId, track);
    return track;
  })();
  inFlight.set(workoutId, run);
  try {
    return await run;
  } finally {
    inFlight.delete(workoutId);
  }
}

function pump(): void {
  while (running < MAX_IN_FLIGHT && queue.length > 0) {
    const next = queue.shift()!;
    running += 1;
    load(next.id, next.token)
      .then(next.resolve, next.reject)
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

export interface TrackRequest {
  promise: Promise<WorkoutTrack>;
  /** Drops the request if it has not started. A request already in flight is left to finish. */
  cancel: () => void;
}

/** Ask for a track. A cached one resolves at once and never takes a slot. */
export function requestTrack(workoutId: string, token: string | null): TrackRequest {
  const cached = cache.get(workoutId);
  if (cached) return { promise: Promise.resolve(cached), cancel: () => {} };

  let entry!: Waiting;
  const promise = new Promise<WorkoutTrack>((resolve, reject) => {
    entry = { id: workoutId, token, resolve, reject };
  });
  queue.push(entry);
  pump();
  return {
    promise,
    cancel: () => {
      const at = queue.indexOf(entry);
      if (at >= 0) queue.splice(at, 1);
    },
  };
}

/** The detail screen's fetch: the same cache and the same two-at-a-time limit. */
export function fetchTrack(workoutId: string, token: string | null): Promise<WorkoutTrack> {
  return requestTrack(workoutId, token).promise;
}
