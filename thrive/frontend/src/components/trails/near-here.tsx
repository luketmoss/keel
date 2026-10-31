// Near here (#692): up to 3 of #528's activity cards for activities that share
// ground with this one without being a Route like it.

import { similarFor } from '../../state/similar-routes';
import { ActivityCard } from '../activities/activity-card';
import { toLocalDateStr } from '../activities/activities-helpers';

export function NearHere({ workoutId }: { workoutId: string }) {
  const near = similarFor(workoutId).near;
  if (near.length === 0) return null;
  const todayStr = toLocalDateStr(new Date());
  return (
    <section class="trail-routes" aria-labelledby="near-here-title">
      <h2 id="near-here-title" class="trail-section-title">
        Near here
      </h2>
      <p class="trail-section-sub">Share ground with this one</p>
      <div class="trail-routes-list">
        {near.map((w) => (
          <ActivityCard key={w.id} workout={w} todayStr={todayStr} />
        ))}
      </div>
    </section>
  );
}
