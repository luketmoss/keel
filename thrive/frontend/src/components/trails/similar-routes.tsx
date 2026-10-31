// The similar-routes block on activity detail (#692): Routes like this, Near here
// and a one-line status while the index builds. Opening a tracked activity starts
// (or resumes) the index; nothing else does.

import { useEffect, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import type { Workout } from '../../api/types';
import { ensureIndex, indexProgress, type IndexProgress } from '../../state/similar-routes';
import { trackAvailable } from '../activities/route-section';
import { RoutesLikeThis } from './routes-like-this';
import { NearHere } from './near-here';

/** The status line is a live region; it is rewritten at most this often. */
export const STATUS_MS = 2000;

export const STOPPED_LINE = "Couldn't check every activity. Open this screen again to finish.";

export function statusText(p: IndexProgress): string | null {
  if (p.state === 'building') return `Looking for similar routes… ${p.checked} of ${p.total} checked`;
  if (p.state === 'stopped') return STOPPED_LINE;
  return null;
}

/** The latest text, but rewritten at most once per `ms`. Appearing and clearing are immediate. */
function useThrottled(text: string | null, ms: number): string | null {
  const [shown, setShown] = useState(text);
  const [last, setLast] = useState(() => Date.now());
  useEffect(() => {
    if (text === shown) return;
    if (text === null || shown === null) {
      setShown(text);
      setLast(Date.now());
      return;
    }
    const timer = setTimeout(
      () => {
        setShown(text);
        setLast(Date.now());
      },
      Math.max(0, last + ms - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [text, shown, last, ms]);
  return shown === null || text === null ? text : shown;
}

function StatusLine() {
  const text = useThrottled(statusText(indexProgress.value), STATUS_MS);
  if (!text) return null;
  return (
    <p class="trail-index-status" role="status">
      {text}
    </p>
  );
}

type Fields = Pick<Workout, 'id' | 'track_ref' | 'status'>;

export function SimilarRoutes({ workout }: { workout: Fields }) {
  const { token } = useAuth();
  const available = trackAvailable(workout);
  useEffect(() => {
    if (available) ensureIndex(workout.id, token);
  }, [available, workout.id, token]);
  if (!available) return null;
  return (
    <>
      <RoutesLikeThis workoutId={workout.id} />
      <NearHere workoutId={workout.id} />
      <StatusLine />
    </>
  );
}
