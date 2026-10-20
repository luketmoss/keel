// The Activities list's cards (#528): one anatomy for every completed activity
// (icon and one big figure, a stats line, day · name, a visual on the right) and
// the Up next row's dashed plan cards.

import { useRef } from 'preact/hooks';
import { navigate } from '../../router/router';
import type { WorkoutWithRow } from '../../api/types';
import { formatEstimate, secondsToMinutes } from '../../api/duration';
import { exercises, loading, sets } from '../../state/store';
import { TYPE_ICONS } from './activities-filters';
import { BodyFigure } from './body-figure';
import { StretchFigure } from './stretch-figure';
import { RouteThumbnail, useRouteThumbnail } from './route-thumbnail';
import { workedGroups, type MuscleGroup } from './muscle-regions';
import {
  activityCardAriaLabel,
  cardDay,
  cardFigure,
  cardStats,
  isOverdue,
  pluralExercise,
  spokenDay,
  upNextDate,
} from './activities-helpers';

/**
 * The visual slot's default: the type's icon on a tint of its colour. A weight
 * card with a worked muscle group draws the muscle figure and a stretch card the
 * side bend (#529), and a card whose route is in draws the route (#530); a
 * tracked card keeps this tile until its route arrives, and if it fails.
 * Hidden from assistive technology: the card's name already says the type.
 */
function TypeTile({ type }: { type: WorkoutWithRow['type'] }) {
  const Icon = TYPE_ICONS[type];
  return (
    <span class={`activity-visual activity-tile badge-${type}`} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function ActivityCard({ workout: w, todayStr }: { workout: WorkoutWithRow; todayStr: string }) {
  const Icon = TYPE_ICONS[w.type];
  const cardRef = useRef<HTMLButtonElement>(null);
  const route = useRouteThumbnail(w, cardRef);
  const figure = cardFigure(w);
  const stats = cardStats(w);
  // While loading, the sets and exercises may be missing: keep the tile, never an empty figure.
  const worked: MuscleGroup[] =
    w.type === 'weight' && !loading.value
      ? workedGroups(
          sets.value.filter((s) => s.workout_id === w.id),
          exercises.value,
        )
      : [];

  return (
    <button
      type="button"
      ref={cardRef}
      data-focus-key={`workout:${w.id}`}
      class={`workout-card activity-card workout-card-${w.type}`}
      onClick={() => navigate(`/history/${w.id}`)}
      aria-label={activityCardAriaLabel(w, worked)}
    >
      <span class="activity-card-body">
        <span class="activity-card-figure-line">
          <span class="activity-card-icon" style={{ color: `var(--type-${w.type})` }} aria-hidden="true">
            <Icon />
          </span>
          {figure ? (
            <>
              <span class="activity-card-figure">{figure.value}</span>
              <span class="activity-card-unit">{figure.unit}</span>
            </>
          ) : (
            <span class="activity-card-figure activity-card-figure-none">—</span>
          )}
        </span>
        {stats.length > 0 && (
          <span class="activity-card-stats">
            {stats.map((p, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {p.effort ? (
                  <span class={`activity-effort activity-effort-${p.effort.toLowerCase()}`}>{p.text}</span>
                ) : (
                  p.text
                )}
              </span>
            ))}
          </span>
        )}
        <span class="activity-card-name">
          {cardDay(w.date, todayStr)} · {w.name || w.type}
        </span>
      </span>
      {route ? (
        <RouteThumbnail points={route} />
      ) : worked.length > 0 ? (
        <span class="activity-visual" aria-hidden="true">
          <BodyFigure worked={new Set(worked)} />
        </span>
      ) : w.type === 'stretch' ? (
        <span class="activity-visual" aria-hidden="true">
          <StretchFigure />
        </span>
      ) : (
        <TypeTile type={w.type} />
      )}
    </button>
  );
}

/**
 * The Up next card's last line: "12 exercises · 26 sets · ~25 min", whichever of
 * those are present (#145 keeps the estimate on a plan that has exercises), else
 * the type word.
 */
function upNextMeta(w: WorkoutWithRow, exerciseCount: number, setCount: number): { text: string; spoken: string } {
  const parts: { text: string; spoken: string }[] = [];
  if (exerciseCount > 0) {
    const count = pluralExercise(exerciseCount);
    parts.push({ text: count, spoken: count });
    if (setCount > 0) {
      const sets = `${setCount} set${setCount === 1 ? '' : 's'}`;
      parts.push({ text: sets, spoken: sets });
    }
  }
  const mins = secondsToMinutes(w.estimated_seconds);
  if (mins !== null && mins >= 1)
    parts.push({ text: `~${mins} min`, spoken: formatEstimate(w.estimated_seconds, true) });
  if (parts.length === 0) return { text: w.type, spoken: w.type };
  return { text: parts.map((p) => p.text).join(' · '), spoken: parts.map((p) => p.spoken).join(', ') };
}

interface UpNextProps {
  workout: WorkoutWithRow;
  todayStr: string;
  exerciseCount: number;
  setCount: number;
}

export function UpNextCard({ workout: w, todayStr, exerciseCount, setCount }: UpNextProps) {
  const overdue = isOverdue(w.date, todayStr);
  const meta = upNextMeta(w, exerciseCount, setCount);
  const name = w.name || w.type;
  const label = [
    name,
    overdue ? `overdue, was planned for ${spokenDay(w.date)}` : `planned for ${spokenDay(w.date)}`,
    meta.spoken,
  ].join(', ');

  return (
    <button
      type="button"
      data-focus-key={`workout:${w.id}`}
      class="workout-card up-next-card"
      onClick={() => navigate(`/history/${w.id}`)}
      aria-label={label}
    >
      <span class="up-next-date">
        {overdue ? (
          <>
            <span class="type-badge badge-overdue">Overdue</span>{' '}
            <span class="up-next-date-late">{upNextDate(w.date, todayStr)}</span>
          </>
        ) : (
          upNextDate(w.date, todayStr)
        )}
      </span>
      <span class="up-next-name">{name}</span>
      <span class="up-next-meta">{meta.text}</span>
    </button>
  );
}
