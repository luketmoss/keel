// #667 — an exercise's "Last time" line in the Logbook, shown while the Exercises heading's chip is
// pressed: "Last time (Oct 21): 135 lb × 8 · Medium", with a Copy button that is today's Copy Down.
// An exercise with no previous performance has no line.

import { bestSetText } from '../activities/exercise-detail';
import { getLastTimeData, formatShortDay } from './last-time-data';
import type { SetWithRow } from '../../api/types';

/** The line's words, or '' when `getLastTimeData` finds nothing worth showing. */
export function lastTimeText(
  exerciseId: string,
  currentWorkoutId: string,
): { text: string; sets: SetWithRow[] } | null {
  const data = getLastTimeData(exerciseId, currentWorkoutId);
  if (!data) return null;
  const best = bestSetText(data.sets);
  if (!best) return null;
  return { text: `Last time (${formatShortDay(data.workoutDate)}): ${best}`, sets: data.sets };
}

interface Props {
  exerciseId: string;
  exerciseName: string;
  currentWorkoutId: string;
  onCopyDown: (lastTimeSets: SetWithRow[]) => void;
}

export function LastTimeLine({ exerciseId, exerciseName, currentWorkoutId, onCopyDown }: Props) {
  const last = lastTimeText(exerciseId, currentWorkoutId);
  if (!last) return null;
  return (
    <div class="lb-last-time">
      <p class="lb-last-time-text">{last.text}</p>
      <button
        type="button"
        class="lb-text-btn lb-copy-btn"
        aria-label={`Copy last time into ${exerciseName}`}
        onClick={() => onCopyDown(last.sets)}
      >
        Copy
      </button>
    </div>
  );
}
