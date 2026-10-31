// The Trail screen (#682), `#/trail/<key>`: when the trail was last done and
// how it compared, then every time on it. A key with no group, or any key
// outside demo mode, is not found.

import { goBack, navigate } from '../../router/router';
import { completedWorkouts } from '../../state/store';
import { trailIndex } from '../../state/trails';
import { formatTrailDate, plural } from '../../trails/format';
import type { TrailGroup, TrailVisit } from '../../trails/types';
import { TYPE_ICONS } from '../activities/activities-filters';
import { toLocalDateStr } from '../activities/activities-helpers';
import { ChevronLeftIcon } from '../activities/detail-icons';
import { TrailIcon } from '../shared/icons';
import { PassRow } from './pass-row';
import { TrailCredit } from './trail-credit';

interface VisitProps {
  group: TrailGroup;
  visit: TrailVisit;
  today: string;
  /** Every time adds the date to the activity row; Last time has it in its header. */
  withDate: boolean;
}

function Visit({ group, visit, today, withDate }: VisitProps) {
  const w = completedWorkouts.value.find((x) => x.id === visit.activityId);
  const Icon = w ? TYPE_ICONS[w.type] : TrailIcon;
  const name = w ? w.name || w.type : 'Activity';
  const passes = visit.passes.length;
  const meta = [withDate ? formatTrailDate(visit.date, today) : '', passes > 1 ? plural(passes, 'pass', 'passes') : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <button
        type="button"
        class="trail-link trail-activity"
        data-focus-key={`${withDate ? 'workout' : 'last'}:${visit.activityId}`}
        aria-label={`${name}${meta ? `, ${meta}` : ''}. Open activity`}
        onClick={() => navigate(`/history/${visit.activityId}`)}
      >
        <span class="trail-activity-icon" style={w ? { color: `var(--type-${w.type})` } : undefined}>
          <Icon />
        </span>
        <span class="trail-activity-name">{name}</span>
        {meta && <span class="trail-activity-meta">· {meta}</span>}
      </button>
      {visit.passes.map((gp, i) => (
        <PassRow key={i} group={group} gp={gp} withOffset={passes > 1} today={today} />
      ))}
    </>
  );
}

export function TrailScreen({ trailKey }: { trailKey: string }) {
  const group = trailIndex.value?.groups.get(trailKey);

  if (!group || group.visits.length === 0) {
    return (
      <div class="screen">
        <div class="empty-state">
          <p>Trail not found</p>
          <button class="btn btn-primary" onClick={() => navigate('/activities')}>
            Back to Activities
          </button>
        </div>
      </div>
    );
  }

  const today = toLocalDateStr(new Date());
  const newestFirst = [...group.visits].reverse();
  const last = newestFirst[0];

  return (
    <div class="screen workout-detail-screen trail-screen">
      <div class="detail-top-bar">
        <button type="button" class="detail-icon-btn" aria-label="Back" onClick={() => goBack()}>
          <ChevronLeftIcon />
        </button>
      </div>

      <div class="detail-sheet">
        <div class="detail-title-block">
          <span class="detail-tile trail-tile" aria-hidden="true">
            <TrailIcon />
          </span>
          <div class="detail-title-text">
            <h1 class="detail-title">{group.name}</h1>
            {group.otherNames.length > 0 && (
              <p class="detail-date-line">Also mapped as {group.otherNames.join(', ')}</p>
            )}
          </div>
        </div>

        <section class="trail-card" aria-labelledby="trail-last-title">
          <div class="trail-card-header">
            <h2 id="trail-last-title" class="trail-card-title">
              Last time
            </h2>
            <span class="trail-card-aside">{formatTrailDate(last.date, today)}</span>
          </div>
          <Visit group={group} visit={last} today={today} withDate={false} />
        </section>

        <section class="trail-every" aria-labelledby="trail-every-title">
          <div class="trail-section-header">
            <h2 id="trail-every-title" class="trail-section-title">
              Every time
            </h2>
            <span class="trail-card-aside">{plural(group.visits.length, 'time', 'times')}</span>
          </div>
          <div class="trail-visits">
            {newestFirst.map((visit) => (
              <div key={visit.activityId} class="trail-card">
                <Visit group={group} visit={visit} today={today} withDate />
              </div>
            ))}
          </div>
        </section>

        <TrailCredit />
      </div>
    </div>
  );
}
