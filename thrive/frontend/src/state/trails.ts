// Trail search's state (#682). The only trail source is the demo fixture, so a
// signed-in session has none and shows no trail UI; #680's build adds a real one.

import { computed, signal } from '@preact/signals';
import { completedWorkouts } from './store';
import { isDemo } from '../api/demo-data';
import { DEMO_ROUTE_PAIRS, DEMO_TRAIL_ACTIVITIES, type DemoTrailActivity } from '../api/demo-trails';
import { buildTrailIndex } from '../trails/groups';
import { pairedWith } from '../trails/search';
import type { TrailIndex } from '../trails/types';
import type { WorkoutWithRow } from '../api/types';

interface TrailSource {
  activities: DemoTrailActivity[];
  pairs: readonly (readonly [string, string])[];
}

/** The trail data this session has: the demo fixture in demo mode, and nothing otherwise. */
export function trailSource(): TrailSource | null {
  return isDemo() ? { activities: DEMO_TRAIL_ACTIVITIES, pairs: DEMO_ROUTE_PAIRS } : null;
}

/** Every completed activity's trails, grouped; null when there is no trail data. */
export const trailIndex = computed<TrailIndex | null>(() => {
  const source = trailSource();
  if (!source) return null;
  const byId = new Map(completedWorkouts.value.map((w) => [w.id, w]));
  return buildTrailIndex(
    source.activities.flatMap((a) => {
      const w = byId.get(a.id);
      return w ? [{ id: a.id, date: w.date, time: w.time, passes: a.passes, unmatchedM: a.unmatchedM }] : [];
    }),
  );
});

/** Activities' trail search text. A module signal, so it survives opening a trail and coming Back. */
export const trailQuery = signal('');

/** Routes like this: up to 3 completed activities paired with `id`, newest first. */
export function routesLikeThis(id: string): WorkoutWithRow[] {
  const source = trailSource();
  if (!source) return [];
  const ids = new Set(pairedWith(source.pairs, id));
  return completedWorkouts.value
    .filter((w) => ids.has(w.id))
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
    .slice(0, 3);
}
