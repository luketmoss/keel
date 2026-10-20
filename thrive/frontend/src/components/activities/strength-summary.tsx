// The completed weight workout's summary on the activity detail screen (#533): a hero card
// (a ring of logged against total sets, and what else is known) and the Set effort card.
// Board C of the prototype; thrive/docs/design/533-strength-detail.md.

import type { Effort, SetWithRow, WorkoutWithRow } from '../../api/types';
import { isSetLogged } from '../../api/set-logged';
import { formatClock, spokenElapsed } from './activities-helpers';
import { grouped, positive, StatCellView, type StatCell } from './detail-stats';

/** Whether this is a finished weight workout, which gets this summary rather than the stats card. */
export function isCompletedWeight(w: WorkoutWithRow): boolean {
  return w.type === 'weight' && w.status !== 'planned' && w.status !== 'active';
}

const isWarmup = (s: SetWithRow) => s.section === 'warmup';

/** Time, Moving, Avg heart rate and Calories: each only when it has a value. */
export function strengthCells(w: WorkoutWithRow): StatCell[] {
  const cells: StatCell[] = [];
  const elapsed = positive(w.elapsed_seconds);
  if (elapsed !== null) {
    const total = Math.round(elapsed);
    cells.push({ label: 'Time', value: formatClock(total), unit: '', spoken: spokenElapsed(total) });
  }
  const moving = positive(w.moving_seconds);
  // Moving time that matches the elapsed time to the minute says nothing more.
  if (moving !== null && (elapsed === null || Math.round(moving / 60) !== Math.round(elapsed / 60))) {
    const total = Math.round(moving);
    cells.push({ label: 'Moving', value: formatClock(total), unit: '', spoken: spokenElapsed(total) });
  }
  const hr = positive(w.avg_hr);
  if (hr !== null) {
    const bpm = Math.round(hr);
    cells.push({ label: 'Avg heart rate', value: String(bpm), unit: 'bpm', spoken: `${bpm} beats per minute` });
  }
  const calories = positive(w.calories);
  if (calories !== null) {
    const kcal = grouped(Math.round(calories));
    cells.push({ label: 'Calories', value: kcal, unit: 'kcal', spoken: `${kcal} kilocalories` });
  }
  return cells;
}

/** Logged against total set rows, by `isSetLogged` (#489). */
export function setCounts(workoutSets: readonly SetWithRow[]): { logged: number; total: number } {
  return { logged: workoutSets.filter((s) => isSetLogged(s, false)).length, total: workoutSets.length };
}

export const EFFORTS: readonly Effort[] = ['Easy', 'Medium', 'Hard'];

export interface EffortMix {
  /** Logged sets outside the warm-up. */
  working: number;
  counts: Record<Effort, number>;
  /** Working sets logged with no effort. */
  without: number;
}

/** The logged non-warm-up sets, counted by effort. */
export function effortMix(workoutSets: readonly SetWithRow[]): EffortMix {
  const counts: Record<Effort, number> = { Easy: 0, Medium: 0, Hard: 0 };
  let working = 0;
  let without = 0;
  for (const s of workoutSets) {
    if (isWarmup(s) || !isSetLogged(s, false)) continue;
    working++;
    if (s.effort) counts[s.effort]++;
    else without++;
  }
  return { working, counts, without };
}

const RING = 108;
const RING_STROKE = 10;
const RING_R = (RING - RING_STROKE) / 2;

/** Logged / total sets as a ring from 12 o'clock, the count inside and "of N sets" under it. */
function SetsRing({ logged, total }: { logged: number; total: number }) {
  const share = total > 0 ? Math.min(100, (logged / total) * 100) : 0;
  const c = RING / 2;
  return (
    <div class="strength-ring" role="img" aria-label={`${logged} of ${total} sets logged`}>
      <svg viewBox={`0 0 ${RING} ${RING}`} width={RING} height={RING} aria-hidden="true" focusable="false">
        <circle class="strength-ring-track" cx={c} cy={c} r={RING_R} fill="none" stroke-width={RING_STROKE} />
        {share > 0 && (
          <circle
            class="strength-ring-value"
            cx={c}
            cy={c}
            r={RING_R}
            fill="none"
            stroke-width={RING_STROKE}
            stroke-linecap="round"
            pathLength="100"
            stroke-dasharray={`${share} 100`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
      </svg>
      <span class="strength-ring-text" aria-hidden="true">
        <span class="strength-ring-count">{logged}</span>
        <span class="strength-ring-of">of {total} sets</span>
      </span>
    </div>
  );
}

/**
 * The hero card. `hideEmpty`: the route is shown (#407), so a workout with nothing to say is not
 * told "No details recorded" under its map.
 */
export function StrengthHero({
  workout,
  workoutSets,
  hideEmpty = false,
}: {
  workout: WorkoutWithRow;
  workoutSets: readonly SetWithRow[];
  hideEmpty?: boolean;
}) {
  const { logged, total } = setCounts(workoutSets);
  const cells = strengthCells(workout);
  if (total === 0 && cells.length === 0) {
    if (hideEmpty) return null;
    return <p class="detail-no-details">No details recorded</p>;
  }
  return (
    <section class="detail-stats-card strength-hero" aria-label="Stats">
      {total > 0 && <SetsRing logged={logged} total={total} />}
      {cells.length > 0 && (
        <div class="strength-hero-grid">
          {cells.map((c) => (
            <StatCellView key={c.label} cell={c} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The accessible name of the effort bar: the counts of the efforts present. */
export function effortBarLabel(mix: EffortMix): string {
  const parts = EFFORTS.filter((e) => mix.counts[e] > 0).map((e) => `${mix.counts[e]} ${e.toLowerCase()}`);
  if (mix.without > 0) parts.push(`${mix.without} without effort`);
  return `Set effort: ${parts.join(', ')}`;
}

/** The Set effort card: a bar of the working sets by effort, and a legend. Nothing without an effort. */
export function SetEffortCard({ workoutSets }: { workoutSets: readonly SetWithRow[] }) {
  const mix = effortMix(workoutSets);
  if (EFFORTS.every((e) => mix.counts[e] === 0)) return null;
  return (
    <section class="strength-effort-card" aria-labelledby="strength-effort-heading">
      <div class="strength-effort-header">
        <h2 id="strength-effort-heading" class="strength-effort-heading">
          Set effort
        </h2>
        <span class="strength-effort-working">
          {mix.working} working set{mix.working === 1 ? '' : 's'}
        </span>
      </div>
      <div class="strength-effort-bar" role="img" aria-label={effortBarLabel(mix)}>
        {EFFORTS.filter((e) => mix.counts[e] > 0).map((e) => (
          <span
            key={e}
            class={`strength-effort-segment strength-effort-${e.toLowerCase()}`}
            style={{ flexGrow: mix.counts[e] }}
          />
        ))}
      </div>
      <div class="strength-effort-legend" aria-hidden="true">
        {EFFORTS.map((e) => (
          <div key={e} class="strength-effort-legend-item">
            <span class="strength-effort-legend-word">
              <span class={`strength-effort-swatch strength-effort-${e.toLowerCase()}`} />
              {e}
            </span>
            <span class="strength-effort-legend-count">{mix.counts[e]}</span>
          </div>
        ))}
      </div>
      {mix.without > 0 && <p class="strength-effort-without">{mix.without} without effort</p>}
    </section>
  );
}
