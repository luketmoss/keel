// Activity detail's Trails card (#682): each trail once, its passes under it,
// each pass compared with the time before. Shown only when the activity has a pass.

import { navigate } from '../../router/router';
import { trailIndex } from '../../state/trails';
import { trailPath } from '../../trails/groups';
import { formatMiles, plural, showsUnmatched } from '../../trails/format';
import { toLocalDateStr } from '../activities/activities-helpers';
import { ChevronRightIcon } from '../activities/detail-icons';
import { TrailIcon } from '../shared/icons';
import { PassRow } from './pass-row';
import { TrailCredit } from './trail-credit';

export function TrailsCard({ workoutId }: { workoutId: string }) {
  const index = trailIndex.value;
  const trails = index?.byActivity.get(workoutId);
  if (!index || !trails || trails.length === 0) return null;
  const today = toLocalDateStr(new Date());
  const unmatched = index.unmatchedM.get(workoutId) ?? null;

  return (
    <section class="trail-card" aria-labelledby="trails-card-title">
      <div class="trail-card-header">
        <h2 id="trails-card-title" class="trail-card-title">
          <TrailIcon />
          Trails
        </h2>
        <span class="trail-card-aside">{plural(trails.length, 'trail', 'trails')}</span>
      </div>
      {trails.map(({ group, visit }) => {
        const others = group.visits.length - 1;
        const meta = others > 0 ? plural(others, 'other time', 'other times') : 'First time on this trail';
        return (
          <div key={group.key} class="trail-block">
            <button
              type="button"
              class="trail-link"
              data-focus-key={`trail:${group.key}`}
              aria-label={`${group.name}, ${meta}. Open trail`}
              onClick={() => navigate(trailPath(group.key))}
            >
              <span class="trail-link-text">
                <span class="trail-link-name">{group.name}</span>
                <span class="trail-link-meta">{meta}</span>
              </span>
              <ChevronRightIcon />
            </button>
            {visit.passes.map((gp, i) => (
              <PassRow key={i} group={group} gp={gp} withOffset={visit.passes.length > 1} today={today} />
            ))}
          </div>
        );
      })}
      <div class="trail-card-footer">
        {showsUnmatched(unmatched) && <p class="trail-unmatched">{formatMiles(unmatched)} not on a named trail</p>}
        <TrailCredit />
      </div>
    </section>
  );
}
