// #667 — what the Logbook draws, derived from the tracker's list: the section cards, the progress
// card's counts, a set tile's words, and the order an exercise takes when it joins a section. Pure:
// the tracker's handlers decide when anything is written.

import { isSetLogged } from '../../api/set-logged';
import { sectionTitle } from '../activities/exercise-detail';
import { stepWeight } from './lift/lift-plan';
import type { TrackerExercise } from './exercise-row';
import type { TrackerSet } from './set-row';

export interface TrackerCard {
  section: string;
  /** "Warm-up", "Primary", "Superset 1" ... (#533's words). */
  title: string;
  exercises: TrackerExercise[];
}

const byOrder = (a: TrackerExercise, b: TrackerExercise) => a.exercise_order - b.exercise_order;

/** The list as it is drawn: the sections in order of first appearance, each section's exercises in order. */
export function trackerCards(list: readonly TrackerExercise[]): TrackerCard[] {
  const cards: TrackerCard[] = [];
  for (const ex of [...list].sort(byOrder)) {
    let card = cards.find((c) => c.section === ex.section);
    if (!card) {
      card = { section: ex.section, title: sectionTitle(ex.section), exercises: [] };
      cards.push(card);
    }
    card.exercises.push(ex);
  }
  return cards;
}

/**
 * `sequence` given the `exercise_order`s the list already holds, in order. Nothing is renumbered
 * beyond that: an exercise keeps its order when its place in the sequence is unchanged, and an
 * exercise new to the list takes the orders above the highest.
 */
export function reassignOrders(
  list: readonly TrackerExercise[],
  sequence: readonly TrackerExercise[],
): TrackerExercise[] {
  const known = [...list].map((e) => e.exercise_order).sort((a, b) => a - b);
  let next = known.length > 0 ? known[known.length - 1] : 0;
  const orders = sequence.map((_, i) => (i < known.length ? known[i] : ++next));
  return sequence.map((e, i) => ({ ...e, exercise_order: orders[i] }));
}

/** `sequence` with `added` placed after the last exercise of `section`, or at the end when it is new. */
function intoSection(
  sequence: TrackerExercise[],
  added: readonly TrackerExercise[],
  section: string,
): TrackerExercise[] {
  const out = [...sequence];
  let at = -1;
  out.forEach((e, i) => {
    if (e.section === section) at = i;
  });
  out.splice(at === -1 ? out.length : at + 1, 0, ...added);
  return out;
}

/** The list drawn top to bottom, as a flat sequence. */
function drawn(list: readonly TrackerExercise[]): TrackerExercise[] {
  return trackerCards(list).flatMap((c) => c.exercises);
}

/** `list` with the exercise `rowKey` at the end of the card for its (already changed) section. */
export function moveToSectionEnd(list: readonly TrackerExercise[], rowKey: string): TrackerExercise[] {
  const moved = list.find((e) => e.rowKey === rowKey);
  if (!moved) return [...list];
  // The others are drawn without it, so the section it leaves or joins does not move their cards.
  const rest = drawn(list.filter((e) => e.rowKey !== rowKey));
  return reassignOrders(list, intoSection(rest, [moved], moved.section));
}

/** `list` with `added` after the last exercise of `section`, orders reassigned from the drawn order. */
export function addToSection(
  list: readonly TrackerExercise[],
  added: readonly TrackerExercise[],
  section: string,
): TrackerExercise[] {
  return reassignOrders(list, intoSection(drawn(list), added, section));
}

/** Logged sets are those with a weight or reps entered (`isSetLogged`). */
export const isLogged = (s: Pick<TrackerSet, 'weight' | 'reps' | 'effort'>): boolean => isSetLogged(s, false);

export interface Progress {
  logged: number;
  total: number;
  exercisesDone: number;
  exercisesTotal: number;
  needEffort: number;
}

/** The progress card's counts: working sets only, warm-ups count for nothing. */
export function progressOf(list: readonly TrackerExercise[]): Progress {
  const p: Progress = { logged: 0, total: 0, exercisesDone: 0, exercisesTotal: 0, needEffort: 0 };
  for (const ex of list) {
    if (ex.section === 'warmup') continue;
    let all = ex.sets.length > 0;
    for (const s of ex.sets) {
      p.total++;
      if (isLogged(s)) {
        p.logged++;
        if (!s.effort) p.needEffort++;
      } else all = false;
    }
    if (ex.sets.length > 0) {
      p.exercisesTotal++;
      if (all) p.exercisesDone++;
    }
  }
  return p;
}

const EFFORT_SHORT = { Easy: 'EASY', Medium: 'MED', Hard: 'HARD' } as const;

export function effortShort(effort: TrackerSet['effort']): string {
  return effort ? EFFORT_SHORT[effort] : '';
}

/** A logged tile's top line: "135×8", "BW×7" (reps only) or "135 lb" (weight only). */
export function tileValue(s: Pick<TrackerSet, 'weight' | 'reps'>): string {
  if (s.weight) return s.reps ? `${s.weight}×${s.reps}` : `${s.weight} lb`;
  return `BW×${s.reps}`;
}

/** A tile as it is spoken: "Set 2: 135 pounds by 8, hard", "Set 3: not logged, target 8". */
export function tileLabel(s: TrackerSet): string {
  const head = `Set ${s.set_number}`;
  if (!isLogged(s)) return `${head}: not logged${s.planned_reps ? `, target ${s.planned_reps}` : ''}`;
  const weight = s.weight ? `${s.weight} ${s.weight === '1' ? 'pound' : 'pounds'}` : '';
  const reps = s.reps ? (s.weight ? `by ${s.reps}` : `bodyweight by ${s.reps}`) : '';
  const what = [weight, reps].filter(Boolean).join(' ');
  return `${head}: ${what}, ${s.effort ? s.effort.toLowerCase() : 'no effort'}`;
}

/** One step of a weight or reps field: 0 leaves it blank, and nothing goes below 0. */
export function stepField(kind: 'weight' | 'reps', value: string, dir: -1 | 1): string {
  const n = Number(value) || 0;
  const next = kind === 'weight' ? stepWeight(n, dir) : Math.max(0, n + dir);
  const rounded = Math.round(next * 100) / 100;
  return rounded === 0 ? '' : String(rounded);
}
