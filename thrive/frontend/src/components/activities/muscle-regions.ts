// Which muscle groups a workout worked (#529): the figure's shading and the
// card's "worked ..." speech both read from here.

import type { ExerciseWithRow, SetWithRow } from '../../api/types';

/** The six tags that shade the figure, in figure order (and so in speech order). */
export const MUSCLE_GROUPS = ['shoulders', 'chest', 'back', 'arms', 'core', 'legs'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * The groups worked by a workout's non-warm-up exercises, in figure order. Tags
 * are comma-separated and match case-insensitively; every other tag is ignored.
 */
export function workedGroups(workoutSets: SetWithRow[], exerciseList: ExerciseWithRow[]): MuscleGroup[] {
  const ids = new Set(workoutSets.filter((s) => s.section.trim().toLowerCase() !== 'warmup').map((s) => s.exercise_id));
  const found = new Set<string>();
  for (const e of exerciseList) {
    if (!ids.has(e.id)) continue;
    for (const tag of e.tags.split(',')) found.add(tag.trim().toLowerCase());
  }
  return MUSCLE_GROUPS.filter((g) => found.has(g));
}

/** "back", "back and arms", "shoulders, chest and arms". */
export function spokenGroups(groups: readonly string[]): string {
  if (groups.length <= 1) return groups.join('');
  return `${groups.slice(0, -1).join(', ')} and ${groups[groups.length - 1]}`;
}
