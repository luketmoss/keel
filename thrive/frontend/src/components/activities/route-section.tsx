// The Route section of an activity's detail screen (#407): the stored track on a
// Google map. Absent, with no placeholder, when there is nothing to draw.
//
// The Maps script is not requested until this component renders, and the track
// comes from the API with the user's Google token (never from Drive, which the
// app cannot read). A track fetched once is kept for the session. Every failure
// shows the same line and a Try again button; the reason goes to the console
// once, as a kind only, never a token, a body or a coordinate.

import { useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import { DEMO_TRACKS } from '../../api/demo-track';
import { isDemo } from '../../api/demo-data';
import type { Workout, WorkoutTrack } from '../../api/types';
import { drawRoute } from '../../maps/draw-route';
import { loadMaps, mapsApiKey } from '../../maps/google-maps';
import { fetchTrack } from '../../maps/track-cache';

/** For tests: the session track cache is shared with the Activities list (#530). */
export { clearTrackCache as clearRouteCache } from '../../maps/track-cache';

/**
 * Whether this activity gets a Route section. A workout with no `track_ref` has
 * nothing to draw, and a build with no Maps key or no API URL cannot draw one
 * (demo mode needs the key and its bundled track, not the API).
 */
export function routeAvailable(workout: Pick<Workout, 'id' | 'track_ref' | 'status'>): boolean {
  if (!workout.track_ref || workout.status === 'planned' || workout.status === 'active') return false;
  if (!mapsApiKey()) return false;
  if (isDemo()) return workout.id in DEMO_TRACKS;
  return Boolean((import.meta.env.VITE_THRIVE_API_URL ?? '').trim());
}

type State = 'loading' | 'ready' | 'error';

export function RouteSection({ workout }: { workout: Pick<Workout, 'id'> }) {
  const { token } = useAuth();
  const [state, setState] = useState<State>('loading');
  const [attempt, setAttempt] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<WorkoutTrack | null>(null);

  // Load the track and the Maps script together; the map is drawn once both are in.
  useEffect(() => {
    let alive = true;
    setState('loading');
    Promise.all([fetchTrack(workout.id, token), loadMaps()]).then(
      ([track]) => {
        // A response for a screen no longer showing is dropped, never drawn into another map.
        if (!alive) return;
        trackRef.current = track;
        setState('ready');
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn('route map:', err instanceof Error ? err.message : 'failed');
        setState('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [workout.id, token, attempt]);

  // The map needs its own element in the page, so it is drawn after "ready" renders.
  useEffect(() => {
    if (state !== 'ready' || !mapRef.current || !trackRef.current) return;
    try {
      if (!drawRoute(mapRef.current, trackRef.current)) throw new Error('too_few_points');
    } catch (err) {
      console.warn('route map:', err instanceof Error ? err.message : 'failed');
      setState('error');
    }
  }, [state]);

  return (
    <section class="detail-route">
      <div class="detail-section-header">
        <h3>Route</h3>
      </div>
      {state === 'ready' && <div class="detail-route-map" role="region" aria-label="Route map" ref={mapRef} />}
      {state === 'loading' && (
        <div class="detail-route-map detail-route-status" role="status" aria-busy="true">
          <p>Loading route…</p>
        </div>
      )}
      {state === 'error' && (
        <div class="detail-route-map detail-route-status" role="status">
          <p>Couldn't load the route.</p>
          <button class="btn btn-secondary" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
