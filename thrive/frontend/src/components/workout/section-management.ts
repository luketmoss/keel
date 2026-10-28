// Pure logic functions for section assignment, reorder, and remove in the workout tracker.

import type { TrackerExercise } from './exercise-row';
import type { TrackerSet } from './set-row';

export const ALL_SECTIONS = ['warmup', 'primary', 'SS1', 'SS2', 'SS3', 'burnout', 'cooldown'] as const;
export type SectionName = (typeof ALL_SECTIONS)[number];

export interface SectionChangeResult {
  exercises: TrackerExercise[];
  /** Sets removed by this change (e.g. when converting to warmup). Caller must delete from API. */
  removedSets: TrackerSet[];
}

/**
 * Change the section of a specific exercise.
 * - to warmup: clears all sets (returns them in removedSets for API deletion)
 * - from warmup to non-warmup: adds a single empty set (on the warm-up's stored row, if it has one)
 * - non-warmup to non-warmup: just updates section, preserves sets
 */
export function applyChangeSection(
  exercises: TrackerExercise[],
  exerciseId: string,
  exerciseOrder: number,
  newSection: string,
): SectionChangeResult {
  let removedSets: TrackerSet[] = [];

  const updated = exercises.map((ex) => {
    if (ex.exercise_id !== exerciseId || ex.exercise_order !== exerciseOrder) return ex;

    const wasWarmup = ex.section === 'warmup';
    const toWarmup = newSection === 'warmup';

    if (toWarmup) {
      removedSets = [...ex.sets];
      return { ...ex, section: newSection, sets: [] };
    } else if (wasWarmup) {
      // #667: a change also moves the exercise to the end of its new card, so its order changes, and a
      // stored warm-up row could no longer be found again by order. The new first set keeps that row
      // instead; the section and order writes that follow a change bring it to the new section.
      const stored = ex.sets.find((s) => s.sheetRow > 0);
      const emptySet: TrackerSet = {
        set_number: 1,
        planned_reps: '',
        weight: '',
        reps: '',
        effort: '',
        saved: false,
        sheetRow: stored ? stored.sheetRow : -1,
      };
      return { ...ex, section: newSection, sets: [emptySet] };
    } else {
      return { ...ex, section: newSection };
    }
  });

  return { exercises: updated, removedSets };
}

/** The exercises of the target's section, by order. */
function inSectionOf(exercises: TrackerExercise[], exerciseId: string, exerciseOrder: number): TrackerExercise[] {
  const target = exercises.find((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
  return exercises
    .filter((e) => target && e.section === target.section)
    .sort((a, b) => a.exercise_order - b.exercise_order);
}

/**
 * Swap exercise_order of the target exercise with the one above it in its section (#667: a move
 * stays within its card). Returns the same array if already first in the section.
 */
export function applyMoveUp(
  exercises: TrackerExercise[],
  exerciseId: string,
  exerciseOrder: number,
): TrackerExercise[] {
  const sorted = inSectionOf(exercises, exerciseId, exerciseOrder);
  const idx = sorted.findIndex((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
  if (idx <= 0) return exercises;

  const prevEx = sorted[idx - 1];
  const currEx = sorted[idx];
  const prevOrder = prevEx.exercise_order;
  const currOrder = currEx.exercise_order;

  return exercises.map((ex) => {
    if (ex.exercise_id === currEx.exercise_id && ex.exercise_order === currOrder) {
      return { ...ex, exercise_order: prevOrder };
    }
    if (ex.exercise_id === prevEx.exercise_id && ex.exercise_order === prevOrder) {
      return { ...ex, exercise_order: currOrder };
    }
    return ex;
  });
}

/**
 * Swap exercise_order of the target exercise with the one below it in its section (#667).
 * Returns the same array if already last in the section.
 */
export function applyMoveDown(
  exercises: TrackerExercise[],
  exerciseId: string,
  exerciseOrder: number,
): TrackerExercise[] {
  const sorted = inSectionOf(exercises, exerciseId, exerciseOrder);
  const idx = sorted.findIndex((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
  if (idx < 0 || idx >= sorted.length - 1) return exercises;

  const nextEx = sorted[idx + 1];
  const currEx = sorted[idx];
  const currOrder = currEx.exercise_order;
  const nextOrder = nextEx.exercise_order;

  return exercises.map((ex) => {
    if (ex.exercise_id === currEx.exercise_id && ex.exercise_order === currOrder) {
      return { ...ex, exercise_order: nextOrder };
    }
    if (ex.exercise_id === nextEx.exercise_id && ex.exercise_order === nextOrder) {
      return { ...ex, exercise_order: currOrder };
    }
    return ex;
  });
}
