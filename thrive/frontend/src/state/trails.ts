// Trail search's state (#682, #690). The one trail source is the `trails` cell of
// every completed activity (Workouts!AD, #688), read in demo mode and signed in
// alike: the demo's workouts carry cells like real rows do. Trails ride in the
// Workouts read, so they load and refresh with it; replacing `workouts` rebuilds
// everything here.

import { computed, signal } from '@preact/signals';
import { completedWorkouts } from './store';
import { buildTrailIndex } from '../trails/groups';
import { readTrailSource, type TrailSourceData } from '../trails/source';
import type { TrailIndex } from '../trails/types';

/** Every completed activity's trails cell, read. */
export function trailSource(): TrailSourceData {
  return readTrailSource(completedWorkouts.value);
}

/** Each activity's state, and the untagged and unreadable ones the notes count. */
export const trailStates = computed(trailSource);

/** Every tagged activity's trails, grouped. Empty while nothing is tagged. */
export const trailIndex = computed<TrailIndex>(() => buildTrailIndex(trailStates.value.activities));

/** Activities' trail search text. A module signal, so it survives opening a trail and coming Back. */
export const trailQuery = signal('');
