// Routes like this (#682): up to 3 of #528's activity cards for the activities
// the trail source pairs with this one. Not on a card.

import { routesLikeThis } from '../../state/trails';
import { ActivityCard } from '../activities/activity-card';
import { toLocalDateStr } from '../activities/activities-helpers';

export function RoutesLikeThis({ workoutId }: { workoutId: string }) {
  const similar = routesLikeThis(workoutId);
  if (similar.length === 0) return null;
  const todayStr = toLocalDateStr(new Date());
  return (
    <section class="trail-routes" aria-labelledby="routes-like-this-title">
      <h2 id="routes-like-this-title" class="trail-section-title">
        Routes like this
      </h2>
      <div class="trail-routes-list">
        {similar.map((w) => (
          <ActivityCard key={w.id} workout={w} todayStr={todayStr} />
        ))}
      </div>
    </section>
  );
}
