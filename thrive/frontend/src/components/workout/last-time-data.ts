// Derives "last time" exercise data from the global store signals.
// No API calls — reads from already-loaded sets + workouts signals.

import { sets, workouts } from '../../state/store';
import type { SetWithRow, WorkoutWithRow } from '../../api/types';

export interface LastTimeResult {
  workoutDate: string; // ISO date string e.g. "2025-01-14"
  sets: SetWithRow[]; // sorted by set_number
}

/** The three kinds of section (#817): a warm-up and a cool-down are never comparable to a working set. */
export type SectionKind = 'warmup' | 'cooldown' | 'working';

export function sectionKind(section: string): SectionKind {
  if (section === 'warmup') return 'warmup';
  if (section === 'cooldown') return 'cooldown';
  return 'working';
}

/**
 * Find an exercise's last time, excluding the current workout: one slot (the exercise's rows at one
 * `exercise_order`) of one earlier workout, never a merge of two (#817). `section` is the exercise's
 * section in the workout on screen; every screen that shows a workout passes it.
 */
export function getLastTimeData(exerciseId: string, currentWorkoutId: string, section?: string): LastTimeResult | null {
  return getLastTimeDataFrom(exerciseId, currentWorkoutId, sets.value, workouts.value, section);
}

/**
 * Pure function for testing — accepts data directly instead of reading signals.
 *
 * With a `section`: the most recent earlier workout with the exercise in a section of that kind, and
 * in it the exercise's slot in that section, else its lowest-order slot of that kind. Without one (the
 * Exercises screen has no section): the most recent working slot, else the most recent warm-up or
 * cool-down slot.
 */
export function getLastTimeDataFrom(
  exerciseId: string,
  currentWorkoutId: string,
  allSets: SetWithRow[],
  allWorkouts: WorkoutWithRow[],
  section?: string,
): LastTimeResult | null {
  // Build a date lookup for workouts
  const workoutDateMap = new Map<string, string>();
  for (const w of allWorkouts) {
    workoutDateMap.set(w.id, w.date);
  }

  // This exercise's rows in the workouts that count, excluding the current one
  const mine = allSets.filter(
    (s) => s.exercise_id === exerciseId && s.workout_id !== currentWorkoutId && workoutDateMap.get(s.workout_id),
  );

  // Only rows that can be compared with the section on screen
  let candidates = mine;
  if (section !== undefined) {
    const kind = sectionKind(section);
    candidates = mine.filter((s) => sectionKind(s.section) === kind);
  } else {
    const worked = mine.filter((s) => sectionKind(s.section) === 'working');
    if (worked.length > 0) candidates = worked;
  }

  // The workout with the most recent date
  let bestWorkoutId = '';
  let bestDate = '';
  for (const s of candidates) {
    const date = workoutDateMap.get(s.workout_id) || '';
    if (date > bestDate) {
      bestDate = date;
      bestWorkoutId = s.workout_id;
    }
  }

  if (!bestWorkoutId) return null;

  // One slot of it: the one in `section` if it has one, else the lowest exercise_order
  const inWorkout = candidates.filter((s) => s.workout_id === bestWorkoutId);
  const inSection = section === undefined ? [] : inWorkout.filter((s) => s.section === section);
  const pool = inSection.length > 0 ? inSection : inWorkout;
  const slotOrder = Math.min(...pool.map((s) => s.exercise_order));
  const resultSets = pool.filter((s) => s.exercise_order === slotOrder);
  resultSets.sort((a, b) => a.set_number - b.set_number);

  return {
    workoutDate: bestDate,
    sets: resultSets,
  };
}

/** "Oct 21": the day a previous workout was done. */
export function formatShortDay(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a date string as "Mar 10, 2026 (5 days ago)". */
export function formatLastTimeDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  // Reset time to midnight for accurate day diff
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let relative: string;
  if (diffDays === 0) relative = 'today';
  else if (diffDays === 1) relative = 'yesterday';
  else relative = `${diffDays} days ago`;

  return `${formatted} (${relative})`;
}
