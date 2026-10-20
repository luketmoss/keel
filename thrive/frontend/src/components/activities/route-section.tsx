// An activity's route on its detail screen: the stored track on a Google map
// (#407), now the full-width hero at the top of the screen (#532). Absent, with no
// placeholder, when there is nothing to draw.
//
// The Maps script is not requested until the hero renders, and the track comes
// from the API with the user's Google token (never from Drive, which the app
// cannot read). A track fetched once is kept for the session, and the Elevation
// card reads the same one. Every failure shows the same line and a Try again
// button; the reason goes to the console once, as a kind only, never a token, a
// body or a coordinate.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { DEMO_TRACKS } from '../../api/demo-track';
import { isDemo } from '../../api/demo-data';
import type { Workout, WorkoutTrack } from '../../api/types';
import { drawRoute } from '../../maps/draw-route';
import { loadMaps, mapsApiKey } from '../../maps/google-maps';
import { fetchTrack } from '../../maps/track-cache';

/** For tests: the session track cache is shared with the Activities list (#530). */
export { clearTrackCache as clearRouteCache } from '../../maps/track-cache';

type TrackFields = Pick<Workout, 'id' | 'track_ref' | 'status'>;

/**
 * Whether this activity has a track that can be read: a `track_ref`, completed,
 * and an API URL (demo mode needs its bundled track instead). The Elevation card
 * needs only this; it does not need a Maps key (#532).
 */
export function trackAvailable(workout: TrackFields): boolean {
  if (!workout.track_ref || workout.status === 'planned' || workout.status === 'active') return false;
  if (isDemo()) return workout.id in DEMO_TRACKS;
  return Boolean((import.meta.env.VITE_THRIVE_API_URL ?? '').trim());
}

/**
 * Whether this activity gets the map hero: a track that can be read and a Maps
 * key to draw it with. Whatever its type; the rule is the track (#532).
 */
export function routeAvailable(workout: TrackFields): boolean {
  return trackAvailable(workout) && Boolean(mapsApiKey());
}

export interface WorkoutTrackState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  track: WorkoutTrack | null;
  /** Bumped by `retry`; the hero reloads the Maps script on it too. */
  attempt: number;
  retry: () => void;
}

/** The activity's track, from the session cache or the API. `null` id: nothing to fetch. */
export function useWorkoutTrack(workoutId: string | null): WorkoutTrackState {
  const { token } = useAuth();
  const [loaded, setLoaded] = useState<{ status: WorkoutTrackState['status']; track: WorkoutTrack | null }>({
    status: workoutId ? 'loading' : 'idle',
    track: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!workoutId) {
      setLoaded({ status: 'idle', track: null });
      return;
    }
    let alive = true;
    setLoaded({ status: 'loading', track: null });
    fetchTrack(workoutId, token).then(
      (track) => {
        // A response for a screen no longer showing is dropped.
        if (alive) setLoaded({ status: 'ready', track });
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn('route map:', err instanceof Error ? err.message : 'failed');
        setLoaded({ status: 'error', track: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [workoutId, token, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...loaded, attempt, retry };
}

interface HeroProps {
  trackState: WorkoutTrackState;
}

/** The map hero: loading, error and ready all fill the same box, so nothing below it moves. */
export function RouteHero({ trackState }: HeroProps) {
  const { status, track, attempt, retry } = trackState;
  const [maps, setMaps] = useState<'loading' | 'ready' | 'error'>('loading');
  const [drawFailed, setDrawFailed] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // The Maps script loads alongside the track; the map is drawn once both are in.
  useEffect(() => {
    let alive = true;
    setMaps('loading');
    setDrawFailed(false);
    loadMaps().then(
      () => {
        if (alive) setMaps('ready');
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn('route map:', err instanceof Error ? err.message : 'failed');
        setMaps('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const ready = status === 'ready' && maps === 'ready' && !drawFailed;
  const failed = status === 'error' || maps === 'error' || drawFailed;

  // The map needs its own element in the page, so it is drawn after "ready" renders.
  useEffect(() => {
    if (!ready || !mapRef.current || !track) return;
    try {
      if (!drawRoute(mapRef.current, track)) throw new Error('too_few_points');
    } catch (err) {
      console.warn('route map:', err instanceof Error ? err.message : 'failed');
      setDrawFailed(true);
    }
  }, [ready, track]);

  return (
    <div class="detail-hero">
      {ready && <div class="detail-hero-map" role="region" aria-label="Route map" ref={mapRef} />}
      {!ready && !failed && (
        <div class="detail-hero-map detail-hero-status" role="status" aria-busy="true">
          <p>Loading route…</p>
        </div>
      )}
      {failed && (
        <div class="detail-hero-map detail-hero-status" role="status">
          <p>Couldn't load the route.</p>
          <button class="btn btn-secondary" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
