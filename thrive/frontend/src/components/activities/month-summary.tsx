// The Activities month summary card (#527): the month's count, time and
// distance, a split bar by type and its legend. Figures are real text, so the
// bar's accessible name and the legend say what the colours say.

import type { ComponentChildren } from 'preact';
import type { WorkoutType, WorkoutWithRow } from '../../api/types';
import { TYPE_WORDS, monthName, monthTitle, splitDuration, summarizeMonth, typeCounts } from './activities-helpers';

interface Props {
  /** The chosen month, 'YYYY-MM'. */
  month: string;
  currentMonth: string;
  /** The month's completed activities, after the type and tag filters. */
  workouts: WorkoutWithRow[];
  type: WorkoutType | null;
  tagsActive: boolean;
  /** Workouts have not loaded yet. */
  loading: boolean;
}

/** "No bike activities in November yet", "Nothing logged in November yet". */
function emptyLine(month: string, currentMonth: string, type: WorkoutType | null, tagsActive: boolean): string {
  const name = monthName(month);
  const yet = month === currentMonth ? ' yet' : '';
  if (type) return `No ${TYPE_WORDS[type].toLowerCase()} activities in ${name}${yet}`;
  if (tagsActive) return `No activities with these tags in ${name}${yet}`;
  return `Nothing logged in ${name}${yet}`;
}

function Figure({ value, label }: { value: ComponentChildren; label: string }) {
  return (
    <div class="month-figure">
      <span class="month-figure-value">{value}</span>
      <span class="month-figure-label">{label}</span>
    </div>
  );
}

export function MonthSummary({ month, currentMonth, workouts, type, tagsActive, loading }: Props) {
  const title = (
    <h2 class="month-card-title" id="month-card-title">
      {monthTitle(month, currentMonth)}
    </h2>
  );

  if (loading) {
    return (
      <section class="month-card" aria-labelledby="month-card-title">
        {title}
        <div class="month-figures">
          <Figure value="—" label="activities" />
          <Figure value="—" label="total time" />
        </div>
      </section>
    );
  }

  if (workouts.length === 0) {
    return (
      <section class="month-card" aria-labelledby="month-card-title">
        {title}
        <p class="month-card-empty">{emptyLine(month, currentMonth, type, tagsActive)}</p>
      </section>
    );
  }

  const sum = summarizeMonth(workouts);
  const counts = typeCounts(workouts);
  const { hours, minutes } = splitDuration(sum.seconds);

  const time =
    sum.timed === 0 ? (
      '—'
    ) : hours > 0 ? (
      <>
        {hours}
        <span class="month-figure-unit"> h </span>
        {minutes}
      </>
    ) : (
      <>
        {minutes}
        <span class="month-figure-unit"> min</span>
      </>
    );
  const timeLabel =
    sum.timed === 0
      ? 'no times recorded'
      : sum.timed === sum.count
        ? 'total time'
        : `total time, ${sum.timed} of ${sum.count}`;

  const barName = `By type: ${counts.map((c) => `${c.count} ${TYPE_WORDS[c.type].toLowerCase()}`).join(', ')}`;

  return (
    <section class="month-card" aria-labelledby="month-card-title">
      {title}
      <div class="month-figures">
        <Figure value={String(sum.count)} label={sum.count === 1 ? 'activity' : 'activities'} />
        <Figure value={time} label={timeLabel} />
        {sum.miles !== null && (
          <Figure
            value={
              <>
                {sum.miles}
                <span class="month-figure-unit"> mi</span>
              </>
            }
            label="distance"
          />
        )}
      </div>
      {counts.length >= 2 && (
        <>
          <div class="month-split" role="img" aria-label={barName}>
            {counts.map((c) => (
              <span
                key={c.type}
                class="month-split-seg"
                style={{ flexGrow: c.count, background: `var(--type-${c.type})` }}
              />
            ))}
          </div>
          <ul class="month-legend" aria-hidden="true">
            {counts.map((c) => (
              <li key={c.type}>
                <span class="month-legend-swatch" style={{ background: `var(--type-${c.type})` }} />
                <span class="month-legend-count">{c.count}</span> {TYPE_WORDS[c.type].toLowerCase()}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
