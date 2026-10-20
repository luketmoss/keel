// The activity detail screen's title block (#531): the type tile, the name as the
// screen's one h1, a date line, and the effort chip on a completed workout.

import type { WorkoutWithRow } from '../../api/types';
import { formatEstimate } from '../../api/duration';
import { clock12, metaDate } from '../../day/format';
import { TYPE_ICONS } from './activities-filters';

/** "Sun, Oct 18 · 12:04 PM", "Planned for Wed, Oct 21 · about 45 min", or "In progress". */
export function detailDateLine(w: WorkoutWithRow): string {
  if (w.status === 'active') return 'In progress';
  if (w.status === 'planned') {
    const estimate = formatEstimate(w.estimated_seconds);
    return `Planned for ${metaDate(w.date)}${estimate ? ` · ${estimate}` : ''}`;
  }
  const time = clock12(w.time);
  return `${metaDate(w.date)}${time ? ` · ${time}` : ''}`;
}

export function DetailTitle({ workout: w }: { workout: WorkoutWithRow }) {
  const Icon = TYPE_ICONS[w.type];
  const completed = w.status !== 'planned' && w.status !== 'active';
  return (
    <div class="detail-title-block">
      <span class={`detail-tile ${completed ? `badge-${w.type}` : 'detail-tile-plan'}`} aria-hidden="true">
        <Icon />
      </span>
      <div class="detail-title-text">
        <h1 class="detail-title">{w.name || w.type}</h1>
        <p class="detail-date-line">{detailDateLine(w)}</p>
      </div>
      {completed && w.effort && (
        <span class={`workout-effort workout-effort-${w.effort.toLowerCase()}`}>{w.effort}</span>
      )}
    </div>
  );
}
