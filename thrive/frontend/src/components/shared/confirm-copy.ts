// #403: the words of every in-app confirm, in one place. Pure, so the copy is
// testable without rendering a screen. The wording is the design note's
// (`thrive/docs/design/403-in-app-confirms.md`): questions in sentence case,
// button labels in Title Case, names in straight double quotes.

import type { Workout, WorkoutType } from '../../api/types';
import { shortDate } from '../../day/format';

export interface ConfirmCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** False for the one confirm that loses nothing. Default true. */
  danger?: boolean;
}

const TYPE_LABELS: Record<WorkoutType, string> = {
  weight: 'Weight',
  stretch: 'Stretch',
  bike: 'Bike',
  hike: 'Hike',
  run: 'Run',
  walk: 'Walk',
};

const CANT_UNDO = "This can't be undone.";

/** "1 logged set", "3 logged sets". */
const loggedSets = (n: number) => `${n} logged ${n === 1 ? 'set' : 'sets'}`;

/**
 * A workout's name: its own when not blank, else its type's label plus
 * "workout". `quoted` is false for the fallback, which is not a name.
 */
function workoutName(w: Pick<Workout, 'name' | 'type'>): { text: string; quoted: boolean } {
  const name = w.name.trim();
  if (name) return { text: name, quoted: true };
  return { text: `${TYPE_LABELS[w.type] ?? 'Weight'} workout`, quoted: false };
}

const named = (n: { text: string; quoted: boolean }) => (n.quoted ? `"${n.text}"` : n.text);

/** Delete a workout from its detail screen or its simple-workout form. */
export function deleteWorkoutCopy(w: Pick<Workout, 'name' | 'type' | 'date'>, setCount: number): ConfirmCopy {
  const when = shortDate(w.date);
  return {
    title: `Delete ${named(workoutName(w))}?`,
    message:
      setCount > 0
        ? `${when} · its ${loggedSets(setCount)} go${setCount === 1 ? 'es' : ''} with it. ${CANT_UNDO}`
        : `${when}. ${CANT_UNDO}`,
    confirmLabel: 'Delete Workout',
  };
}

export function deleteTemplateCopy(name: string, exerciseCount: number): ConfirmCopy {
  const goes =
    exerciseCount > 0
      ? `Its ${exerciseCount} ${exerciseCount === 1 ? 'exercise goes' : 'exercises go'} with it. `
      : '';
  return {
    title: `Delete the template "${name}"?`,
    message: `${goes}Workouts you've logged from it are kept. ${CANT_UNDO}`,
    confirmLabel: 'Delete Template',
  };
}

export function deleteExerciseCopy(name: string): ConfirmCopy {
  return {
    title: `Delete "${name}" from your exercises?`,
    message: CANT_UNDO,
    confirmLabel: 'Delete Exercise',
  };
}

export function removeExerciseCopy(name: string, setCount: number): ConfirmCopy {
  return {
    title: `Remove "${name}" from this workout?`,
    message: setCount > 0 ? `Its ${loggedSets(setCount)} ${setCount === 1 ? 'is' : 'are'} deleted.` : '',
    confirmLabel: 'Remove Exercise',
  };
}

export function discardWorkoutCopy(setCount: number): ConfirmCopy {
  const gone = "it won't appear in your activities.";
  return {
    title: 'Discard this workout?',
    message:
      setCount > 0
        ? `Its ${loggedSets(setCount)} ${setCount === 1 ? 'is' : 'are'} deleted, and ${gone}`
        : `It won't appear in your activities.`,
    confirmLabel: 'Discard Workout',
  };
}

/** Only asked when last time has fewer sets than the exercise now has. */
export function replaceSetsCopy(name: string, current: number, lastTime: number): ConfirmCopy {
  const removed = current - lastTime;
  return {
    title: `Replace your ${current} "${name}" sets with last time's ${lastTime}?`,
    message: `${removed} ${removed === 1 ? 'set is' : 'sets are'} removed, and the rest take last time's weights and reps.`,
    confirmLabel: 'Replace Sets',
  };
}

/** What the screen being left edits: "workout", "template" or "plan". */
export type EditedThing = 'workout' | 'template' | 'plan';

export function discardChangesCopy(thing: EditedThing): ConfirmCopy {
  return {
    title: 'Discard your changes?',
    message: `Your edits to this ${thing} won't be saved.`,
    confirmLabel: 'Discard Changes',
    cancelLabel: 'Keep Editing',
  };
}

export function deleteLabelCopy(name: string, usage: number): ConfirmCopy {
  return {
    title: `Delete the label "${name}"?`,
    message:
      usage > 0
        ? `${usage} ${usage === 1 ? 'exercise uses it and will lose it' : 'exercises use it and will lose it'}. ${CANT_UNDO}`
        : CANT_UNDO,
    confirmLabel: 'Delete Label',
  };
}

/** Not destructive: the sets are saved on the phone and sync later. */
export function finishUnsyncedCopy(unsynced: number): ConfirmCopy {
  return {
    title: `Finish with ${unsynced} unsynced ${unsynced === 1 ? 'set' : 'sets'}?`,
    message: "They're saved on this phone and will sync next time you open Thrive.",
    confirmLabel: 'Finish Anyway',
    cancelLabel: 'Not Yet',
    danger: false,
  };
}
