// The completed weight workout's exercises on the activity detail screen (#533): one card per
// section, every set shown as a tile. Nothing expands. thrive/docs/design/533-strength-detail.md.

import type { Effort, SetWithRow } from '../../api/types';
import { isSetLogged } from '../../api/set-logged';

export interface ExerciseGroup {
  exercise_id: string;
  exercise_name: string;
  section: string;
  exercise_order: number;
  sets: SetWithRow[];
}

export interface SectionGroup {
  section: string;
  /** "Warm-up", "Primary", "Superset 1" ... */
  title: string;
  exercises: ExerciseGroup[];
}

const SECTION_TITLES: Record<string, string> = {
  warmup: 'Warm-up',
  primary: 'Primary',
  SS1: 'Superset 1',
  SS2: 'Superset 2',
  SS3: 'Superset 3',
  burnout: 'Burnout',
  cooldown: 'Cool-down',
};

export function sectionTitle(section: string): string {
  if (SECTION_TITLES[section]) return SECTION_TITLES[section];
  return section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Other';
}

/** The exercises in one card per section, the cards in the order a section first appears. */
export function groupBySection(groups: readonly ExerciseGroup[]): SectionGroup[] {
  const out: SectionGroup[] = [];
  for (const g of groups) {
    let card = out.find((c) => c.section === g.section);
    if (!card) {
      card = { section: g.section, title: sectionTitle(g.section), exercises: [] };
      out.push(card);
    }
    card.exercises.push(g);
  }
  return out;
}

/** Group flat sets into exercise groups, sorted by exercise_order. */
export function groupSetsIntoExercises(workoutSets: SetWithRow[]): ExerciseGroup[] {
  const map = new Map<string, ExerciseGroup>();
  for (const s of workoutSets) {
    const key = `${s.exercise_id}__${s.exercise_order}`;
    let group = map.get(key);
    if (!group) {
      group = {
        exercise_id: s.exercise_id,
        exercise_name: s.exercise_name,
        section: s.section,
        exercise_order: s.exercise_order,
        sets: [],
      };
      map.set(key, group);
    }
    group.sets.push(s);
  }
  const groups = Array.from(map.values()).sort((a, b) => a.exercise_order - b.exercise_order);
  for (const g of groups) {
    g.sets.sort((a, b) => a.set_number - b.set_number);
  }
  return groups;
}

const logged = (s: SetWithRow) => isSetLogged(s, false);

/** The heaviest logged set; the first of equals, and the first logged set when none has a weight. */
export function topSet(sets: readonly SetWithRow[]): SetWithRow | null {
  return sets.filter(logged).reduce<SetWithRow | null>((best, s) => {
    if (!best) return s;
    return (Number(s.weight) || 0) > (Number(best.weight) || 0) ? s : best;
  }, null);
}

/** "50 lb × 10", "BW × 5" (reps, no weight) or "50 lb" (weight, no reps). */
export function setText(s: SetWithRow): string {
  if (s.weight) return s.reps ? `${s.weight} lb × ${s.reps}` : `${s.weight} lb`;
  return `BW × ${s.reps}`;
}

/** The best set of an exercise for a "Last time" line: any set, however little was entered. */
export function bestSetText(sets: readonly SetWithRow[]): string {
  const best = sets.reduce<SetWithRow | null>((b, s) => {
    if (!b) return s;
    return (Number(s.weight) || 0) > (Number(b.weight) || 0) ? s : b;
  }, null);
  if (!best || (!best.weight && !best.reps)) return '';
  return best.effort ? `${setText(best)} · ${best.effort}` : setText(best);
}

/** What a warm-up exercise got: "30", "20 lb × 10", "30, 30", or nothing when unlogged. */
export function warmupText(sets: readonly SetWithRow[]): string {
  return sets
    .filter(logged)
    .map((s) => (s.weight ? setText(s) : s.reps))
    .join(', ');
}

const EFFORT_SHORT: Record<Effort, string> = { Easy: 'EASY', Medium: 'MED', Hard: 'HARD' };

/** A tile's value: "50×10", "BW×5" or "50 lb". */
export function tileValue(s: SetWithRow): string {
  if (s.weight) return s.reps ? `${s.weight}×${s.reps}` : `${s.weight} lb`;
  return `BW×${s.reps}`;
}

/** One set as it is spoken: "50 pounds by 10, medium", or "not done". */
export function spokenSet(s: SetWithRow): string {
  if (!logged(s)) return 'not done';
  const weight = s.weight ? `${s.weight} ${s.weight === '1' ? 'pound' : 'pounds'}` : '';
  const reps = s.reps ? (s.weight ? `by ${s.reps}` : `bodyweight by ${s.reps}`) : '';
  const what = [weight, reps].filter(Boolean).join(' ');
  return s.effort ? `${what}, ${s.effort.toLowerCase()}` : what;
}

function SetTile({ set }: { set: SetWithRow }) {
  if (!logged(set)) {
    return (
      <span class="set-tile set-tile-undone" aria-hidden="true">
        <span class="set-tile-value">{set.planned_reps ? `×${set.planned_reps}` : '—'}</span>
        <span class="set-tile-note">Not done</span>
      </span>
    );
  }
  return (
    <span class="set-tile" aria-hidden="true">
      <span class="set-tile-value">{tileValue(set)}</span>
      {set.effort && (
        <span class={`set-tile-effort set-tile-effort-${set.effort.toLowerCase()}`}>{EFFORT_SHORT[set.effort]}</span>
      )}
    </span>
  );
}

interface Props {
  group: ExerciseGroup;
  /** The "Last time" line for this exercise, or '' when it is off or there is none. */
  lastTime?: string;
}

/** One exercise: a warm-up is a row; every other exercise is its name, its top set and a tile per set. */
export function ExerciseDetail({ group, lastTime = '' }: Props) {
  const lastLine = lastTime && <p class="last-time-line">{lastTime}</p>;
  if (group.section === 'warmup') {
    return (
      <div class="strength-exercise">
        <div class="strength-warmup-row">
          <span class="strength-exercise-name">{group.exercise_name}</span>
          <span class="strength-exercise-top">{warmupText(group.sets)}</span>
        </div>
        {lastLine}
      </div>
    );
  }
  const top = topSet(group.sets);
  return (
    <div class="strength-exercise">
      <div class="strength-exercise-line">
        <span class="strength-exercise-name">{group.exercise_name}</span>
        {top && <span class="strength-exercise-top">{setText(top)}</span>}
      </div>
      <div class="set-tiles" role="img" aria-label={`Sets: ${group.sets.map(spokenSet).join('; ')}`}>
        {group.sets.map((s) => (
          <SetTile key={s.set_number} set={s} />
        ))}
      </div>
      {lastLine}
    </div>
  );
}

/** One card per section, headed by its name, the exercises inside separated by hairlines. */
export function SectionCard({ card, lastTimeFor }: { card: SectionGroup; lastTimeFor?: (g: ExerciseGroup) => string }) {
  return (
    <section class="strength-section-card">
      <h3 class="strength-section-heading">{card.title}</h3>
      {card.exercises.map((g) => (
        <ExerciseDetail key={`${g.exercise_id}-${g.exercise_order}`} group={g} lastTime={lastTimeFor?.(g)} />
      ))}
    </section>
  );
}
