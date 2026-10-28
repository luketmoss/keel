import { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'preact/hooks';
import {
  activeWorkoutSets,
  activeWarmupExercises,
  isEditMode,
  workouts,
  pendingSyncCount,
  isSyncing,
  showToast,
} from '../../state/store';
import {
  saveSet,
  removeSet,
  finishWorkout,
  deleteWorkout,
  saveWorkoutEdits,
  exitEditMode,
  saveExerciseOrders,
} from '../../state/actions';
import { flushQueue, remapQueuedOrders } from '../../api/sync-queue';
import type { QueuedOrderMap } from '../../api/sync-queue';
import { ReauthFailedError } from '@keel/auth';
import { useAuth } from '../../auth/auth-context';
import { navigate, goBack } from '../../router/router';
import { AddExerciseModal } from '../exercises/add-exercise-modal';
import { FinishWorkoutSheet } from './finish-modal';
import { resetRun } from './lift/lift-run';
import { ExerciseRow } from './exercise-row';
import type { TrackerExercise } from './exercise-row';
import { EffortPills } from './set-row';
import type { TrackerSet, SaveStatus } from './set-row';
import { ActionMenu } from './tracker-menu';
import { trackerCards, progressOf, moveToSectionEnd, addToSection } from './tracker-model';
import { sectionPills } from '../shared/section-pills';
import { sectionTitle } from '../activities/exercise-detail';
import { SetsRing } from '../activities/strength-summary';
import { CloseIcon, HistoryIcon, PlusIcon, TrashIcon, NoSignalIcon } from '../activities/detail-icons';
import { DumbbellIcon } from '../shared/icons';
import type { ExerciseWithRow, Effort, SetWithRow } from '../../api/types';
import { applyQuickFillWeight, applyQuickFillReps, applyQuickFillEffort } from './quick-fill';
import { applyCopyDown } from './copy-down';
import { isWarmupExercise } from './warmup';
import { applyChangeSection, applyMoveUp, applyMoveDown } from './section-management';
import { buildExerciseList, mergeWarmups } from './build-exercise-list';
import { collectEditedSets } from './edited-sets';
import { workoutToEditInputs, editInputsToPatch } from '../shared/edit-patch';
import { newRowKey, useReorderFocus } from '../shared/reorder-focus';
import type { MoveDirection } from '../shared/reorder-focus';
import { shiftTrackerRows } from './row-shift';
import { unclaimedRowFor } from './adopt-row';
import { orderWrites, queuedOrderMap } from './order-writes';
import { ask } from '../../state/confirm';
import {
  discardChangesCopy,
  discardWorkoutCopy,
  finishUnsyncedCopy,
  removeExerciseCopy,
  replaceSetsCopy,
} from '../shared/confirm-copy';

/** Finish's toast when the exercise order or sections could not be written (#392 AC3, #395). */
export const ORDER_SAVE_FAILED = "Couldn't save the exercise order and sections. Try again.";

// #394: the tracker's writes to Sets rows go out one at a time across every
// tracker instance, so one opened again (leave and resume) while a delete is
// still in flight waits for it.
let trackerWrites: Promise<unknown> = Promise.resolve();
// Every mounted tracker but the one deleting hears of a landed row delete, so
// a list built before it landed follows the shift too.
const rowDeleteListeners = new Set<(row: number) => void>();

/**
 * What removing sets from exercise `ex` does to `list`: the list after, and
 * the sets it takes off (whose rows the tracker deletes in log mode).
 */
type Removal = (
  list: TrackerExercise[],
  ex: TrackerExercise,
) => { exercises: TrackerExercise[]; removedSets: TrackerSet[] };

interface Props {
  workoutId: string;
  workoutName: string;
}

/**
 * A card's identity across moves (#371). `rowKey` is always set by the list
 * builders; the order-based fallback, as the render key uses, only covers a
 * card that somehow lacks one. Client-only: never in a payload.
 */
const trackerRowKey = (ex: TrackerExercise): string => ex.rowKey ?? `${ex.exercise_id}-${ex.exercise_order}`;

/** A pending save's timer: one per set of a card, whatever its order (#389). */
const saveTimerKey = (exKey: string, setNumber: number): string => `${exKey}__${setNumber}`;

export function WorkoutTracker({ workoutId, workoutName }: Props) {
  /** The row payload for removing tracker set `s` of exercise `ex`. */
  const toSetWithRow = (ex: TrackerExercise, s: TrackerSet): SetWithRow => ({
    workout_id: workoutId,
    exercise_id: ex.exercise_id,
    exercise_name: ex.exercise_name,
    section: ex.section,
    exercise_order: ex.exercise_order,
    set_number: s.set_number,
    planned_reps: s.planned_reps,
    weight: s.weight,
    reps: s.reps,
    effort: s.effort,
    sheetRow: s.sheetRow,
  });

  const { token } = useAuth();
  const effortLabelId = `tracker-edit-effort-label-${useId()}`;
  const editMode = isEditMode.value;
  const workout = workouts.value.find((w) => w.id === workoutId);

  const [exerciseList, setExerciseListState] = useState<TrackerExercise[]>([]);
  // The section the open exercise picker adds to, or null when it is closed (#667).
  const [pickerSection, setPickerSection] = useState<string | null>(null);
  // At most one set is open in the whole screen (#667); the Last time chip is the Exercises heading's.
  const [openSet, setOpenSet] = useState<{ rowKey: string; setNumber: number } | null>(null);
  const [showLastTime, setShowLastTime] = useState(false);
  // Sets edited in this session, for the editor's status line: nothing shows before a change.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  // Remove set taps whose write has not finished, as state so their tiles can say so.
  const [removingTaps, setRemovingTaps] = useState<ReadonlySet<string>>(new Set());
  const screenRef = useRef<HTMLDivElement>(null);
  // The row whose options button takes focus once the list has re-rendered (a section change rebuilds the row).
  const focusRow = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = focusRow.current;
    if (!key) return;
    focusRow.current = null;
    screenRef.current?.querySelector<HTMLElement>(`[data-row-key="${key}"] [data-options-btn]`)?.focus();
  });
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState(editMode ? workout?.notes || '' : '');
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [switchingToLift, setSwitchingToLift] = useState(false);
  const reorder = useReorderFocus();
  const saveTimers = useRef<Map<string, number>>(new Map());

  // #394: the latest list, ahead of the render. Every change goes through
  // updateList, so a write that starts right after a row shift reads it here,
  // never a list from an earlier render.
  const listRef = useRef<TrackerExercise[]>([]);
  const updateList = useCallback((fn: (prev: TrackerExercise[]) => TrackerExercise[]) => {
    const next = fn(listRef.current);
    listRef.current = next;
    setExerciseListState(next);
  }, []);

  const touchKey = (rowKey: string | undefined, setNumber: number) => `${rowKey ?? ''}|${setNumber}`;
  const touch = (keys: string[]) => setTouched((prev) => new Set([...prev, ...keys]));
  const untouch = (key: string) =>
    setTouched((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  // #394: the tracker's writes to Sets rows (deletes and the debounced save)
  // go out one at a time, in the order asked for (`trackerWrites`). Each step
  // reads its set from listRef when it starts. The returned promise is the
  // step's own; the chain itself never rejects.
  const enqueueWrite = useCallback(<T,>(step: () => Promise<T>): Promise<T> => {
    const run = trackerWrites.then(step);
    trackerWrites = run.catch(() => undefined);
    return run;
  }, []);
  // Another tracker's delete landed: this list was built before it, so the
  // set that held the row was removed there; drop it, and shift the rest.
  const onOtherRowDelete = useCallback((row: number) => {
    updateList((prev) => shiftTrackerRows(prev, row, { drop: true }));
  }, []);
  useEffect(() => {
    rowDeleteListeners.add(onOtherRowDelete);
    return () => {
      rowDeleteListeners.delete(onOtherRowDelete);
    };
  }, []);
  // Remove set taps whose write has not finished: a repeat tap is ignored.
  const pendingRemovals = useRef<Set<string>>(new Set());

  /** Give this workout's queued sets the order and section they now have (#392 AC5, #395 AC3). */
  const remapQueue = (map: QueuedOrderMap) => {
    try {
      remapQueuedOrders(workoutId, map);
    } catch {
      // Storage unavailable: there is no queue to remap.
    }
  };

  /**
   * Bring every saved row of this workout to the order and section on screen,
   * in one all-or-nothing write of `Sets!E` and `Sets!D` (#392, #395). Runs as
   * a tracker write, so it reads the list and the stored rows as they are when
   * it starts, after any save or delete ahead of it. Nothing differs: no
   * request.
   */
  const writeOrders = async (): Promise<void> => {
    if (!token) return;
    remapQueue(queuedOrderMap(listRef.current));
    await saveExerciseOrders(workoutId, orderWrites(listRef.current, activeWorkoutSets.value, workoutId), token);
  };

  /**
   * Save one set through its own row (#389): its row when it has one, a row a
   * flushed offline append already gave it, or else one append. Never looked
   * up by order. Read from the latest list; the card is marked saved with the
   * row written. Rejects as `saveSet` does.
   */
  const saveOwnRow = async (exKey: string, setNumber: number): Promise<void> => {
    if (!token) return;
    const current = listRef.current.find((e) => trackerRowKey(e) === exKey);
    const currentSet = current?.sets.find((s) => s.set_number === setNumber);
    if (!current || !currentSet || (!currentSet.weight && !currentSet.reps)) return;

    // A set with no row may already have one: an offline save the queue
    // has since flushed. Take it rather than append a second (#389).
    const ownRow =
      currentSet.sheetRow > 0
        ? currentSet.sheetRow
        : unclaimedRowFor(listRef.current, workoutId, current, currentSet, activeWorkoutSets.value);

    const result = await saveSet(
      {
        workout_id: workoutId,
        exercise_id: current.exercise_id,
        exercise_name: current.exercise_name,
        section: current.section,
        exercise_order: current.exercise_order,
        set_number: currentSet.set_number,
        planned_reps: currentSet.planned_reps,
        weight: currentSet.weight,
        reps: currentSet.reps,
        effort: currentSet.effort,
      },
      token,
      ownRow,
    );

    // Mark as saved, on this exercise's own card wherever it now sits
    updateList((prev) =>
      prev.map((e) =>
        trackerRowKey(e) === exKey
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.set_number === setNumber ? { ...s, saved: true, sheetRow: result.sheetRow } : s,
              ),
            }
          : e,
      ),
    );
  };

  // Edit mode metadata
  // Pre-filled values, fixed at mount: a save writes only what differs (#172).
  const [editInitial] = useState(() => workoutToEditInputs(workout));
  const [editDate, setEditDate] = useState(editInitial.date);
  const [editName, setEditName] = useState(editInitial.name);
  const [editDuration, setEditDuration] = useState(editInitial.duration);
  const [editEffort, setEditEffort] = useState<Effort | ''>(editInitial.effort);
  const [finishEffort, setFinishEffort] = useState<Effort | ''>('');

  // Auto-sync on reconnect (AC3)
  useEffect(() => {
    if (!token) return;
    const handleOnline = async () => {
      if (pendingSyncCount.value === 0) return;
      const result = await flushQueue(token);
      if (result.synced > 0 && result.remaining === 0) {
        showToast(`${result.synced} set${result.synced === 1 ? '' : 's'} saved`, 'success');
      } else if (result.failed > 0) {
        showToast('Some sets failed to sync — will retry on reconnect', 'error');
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [token]);

  // Initialize from signal, merging warmup exercises (list-only, no sets).
  // Warmups already present in activeWorkoutSets (as persisted set rows) are
  // skipped from activeWarmupExercises to avoid duplication.
  useEffect(() => {
    const tracked = buildExerciseList(activeWorkoutSets.value);
    updateList(() => mergeWarmups(tracked, activeWarmupExercises.value));
  }, []);

  // Debounced save for a specific set (disabled in edit mode). The timer is
  // keyed by the exercise's row key, not its order, and everything the save
  // writes (order, section, name, values, the set's own sheet row) is read
  // from the latest list when its write starts: the exercise may have moved,
  // and its rows shifted, since the edit (#389, #394). The row key itself
  // never leaves the client.
  const debouncedSave = useCallback(
    (ex: TrackerExercise, set: TrackerSet) => {
      if (!token || editMode) return;
      // Only save if there's meaningful data
      if (!set.weight && !set.reps) return;

      const exKey = trackerRowKey(ex);
      const key = saveTimerKey(exKey, set.set_number);
      const existing = saveTimers.current.get(key);
      if (existing) clearTimeout(existing);

      const timer = window.setTimeout(() => {
        saveTimers.current.delete(key);

        // The write waits for any write ahead of it (a delete shifting rows),
        // then reads the set from the latest list (#394).
        void enqueueWrite(async () => {
          try {
            await saveOwnRow(exKey, set.set_number);
          } catch {
            // Error toast shown by saveSet action. A set that did not save shows no status (#667).
            untouch(touchKey(exKey, set.set_number));
          }
        });
      }, 1000);

      saveTimers.current.set(key, timer);
    },
    [token, workoutId, editMode],
  );

  const findExercise = (exerciseId: string, exerciseOrder: number) =>
    listRef.current.find((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);

  const handleUpdateSet = (
    exerciseId: string,
    exerciseOrder: number,
    setNumber: number,
    updates: Partial<TrackerSet>,
  ) => {
    touch([touchKey(findExercise(exerciseId, exerciseOrder)?.rowKey, setNumber)]);
    updateList((prev) => {
      const next = prev.map((ex) => {
        if (ex.exercise_id !== exerciseId || ex.exercise_order !== exerciseOrder) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.set_number === setNumber ? { ...s, ...updates, saved: false } : s)),
        };
      });

      // Schedule save for the updated set (no-op in edit mode)
      const ex = next.find((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
      const set = ex?.sets.find((s) => s.set_number === setNumber);
      if (ex && set) {
        // Defer: schedule outside the state updater
        setTimeout(() => debouncedSave(ex, set), 0);
      }

      return next;
    });
  };

  const handleQuickFillWeight = (exerciseId: string, exerciseOrder: number, weight: string) => {
    updateList((prev) => {
      const next = applyQuickFillWeight(prev, exerciseId, exerciseOrder, weight);
      // Schedule save for filled sets that have reps (no-op in edit mode)
      if (weight) {
        const ex = next.find((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
        if (ex) {
          for (const s of ex.sets) {
            if (s.reps) {
              setTimeout(() => debouncedSave(ex, s), 0);
            }
          }
        }
      }
      return next;
    });
  };

  const handleQuickFillReps = (exerciseId: string, exerciseOrder: number, reps: string) => {
    updateList((prev) => {
      const next = applyQuickFillReps(prev, exerciseId, exerciseOrder, reps);
      if (reps) {
        const ex = next.find((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
        if (ex) {
          for (const s of ex.sets) {
            if (s.weight) {
              setTimeout(() => debouncedSave(ex, s), 0);
            }
          }
        }
      }
      return next;
    });
  };

  const handleQuickFillEffort = (exerciseId: string, exerciseOrder: number, effort: Effort | '') => {
    updateList((prev) => {
      const next = applyQuickFillEffort(prev, exerciseId, exerciseOrder, effort);
      if (effort) {
        const ex = next.find((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
        if (ex) {
          for (const s of ex.sets) {
            if (s.weight || s.reps) {
              setTimeout(() => debouncedSave(ex, s), 0);
            }
          }
        }
      }
      return next;
    });
  };

  /**
   * Same for all sets (#667): the open set's weight, reps and effort go to every set of its exercise through
   * today's quick-fill, which also overwrote every set. A blank field leaves the others as they are.
   */
  const handleSameForAll = (exerciseId: string, exerciseOrder: number, setNumber: number) => {
    const ex = findExercise(exerciseId, exerciseOrder);
    const source = ex?.sets.find((s) => s.set_number === setNumber);
    if (!ex || !source) return;
    handleQuickFillWeight(exerciseId, exerciseOrder, source.weight);
    handleQuickFillReps(exerciseId, exerciseOrder, source.reps);
    handleQuickFillEffort(exerciseId, exerciseOrder, source.effort);
    touch(ex.sets.map((s) => touchKey(ex.rowKey, s.set_number)));
    showToast(`Copied to all ${ex.sets.length} sets of ${ex.exercise_name}`, 'success');
  };

  /**
   * Remove sets from one exercise in log mode (#394): Remove set, Copy-down
   * onto fewer sets, Change section to warmup, Remove exercise. Runs as one
   * tracker write. Each row is deleted bottom to top, reading the exercise
   * (by its row key) and its rows from the latest list before every delete,
   * and the whole list is shifted as soon as a delete lands. The removal is
   * then applied to the list as it is at that point, so anything typed, saved
   * or moved meanwhile is kept. A delete that fails stops it there: what was
   * deleted stays on screen without a row, unsaved, and nothing is applied.
   * Resolves true when the removal was applied.
   */
  const runRemoval = (rowKey: string, removal: Removal): Promise<boolean> =>
    enqueueWrite(async () => {
      if (!token) return false;
      const current = () => listRef.current.find((e) => e.rowKey === rowKey);
      const deleted = new Set<number>(); // set numbers whose row this run deleted

      for (;;) {
        const ex = current();
        if (!ex) return false; // already gone: a repeat tap deletes nothing
        const next = removal(listRef.current, ex)
          .removedSets.filter((s) => s.sheetRow > 0)
          .sort((a, b) => b.sheetRow - a.sheetRow)[0];
        if (!next) break;
        try {
          await removeSet(toSetWithRow(ex, next), token);
        } catch {
          return false; // Error toast shown by action
        }
        deleted.add(next.set_number);
        updateList((prev) => shiftTrackerRows(prev, next.sheetRow));
        for (const listener of rowDeleteListeners) {
          if (listener !== onOtherRowDelete) listener(next.sheetRow);
        }
      }

      const ex = current();
      if (!ex) return false;
      // Sets that never had a row: no request, only their queued append goes.
      for (const s of removal(listRef.current, ex).removedSets) {
        if (deleted.has(s.set_number)) continue;
        try {
          await removeSet(toSetWithRow(ex, s), token);
        } catch {
          // Nothing was requested; nothing to undo.
        }
      }

      const latest = current();
      if (!latest) return false;
      const { exercises, removedSets } = removal(listRef.current, latest);
      for (const s of removedSets) {
        const key = saveTimerKey(trackerRowKey(latest), s.set_number);
        const timer = saveTimers.current.get(key);
        if (timer) {
          clearTimeout(timer);
          saveTimers.current.delete(key);
        }
      }
      updateList(() => exercises);
      return true;
    });

  /** A removal applied without any request: edit mode, or nothing to delete. */
  const applyRemoval = (rowKey: string, removal: Removal) => {
    updateList((prev) => {
      const ex = prev.find((e) => e.rowKey === rowKey);
      return ex ? removal(prev, ex).exercises : prev;
    });
  };

  const handleCopyDown = async (exerciseId: string, exerciseOrder: number, lastTimeSets: SetWithRow[]) => {
    const ex = findExercise(exerciseId, exerciseOrder);
    if (!ex?.rowKey) return;
    const rowKey = ex.rowKey;

    // AC3: Confirmation when removing sets
    if (lastTimeSets.length < ex.sets.length) {
      const ok = await ask(replaceSetsCopy(ex.exercise_name, ex.sets.length, lastTimeSets.length));
      if (!ok) return;
    }

    const removal: Removal = (list, e) => applyCopyDown(list, e.exercise_id, e.exercise_order, lastTimeSets);

    // In edit mode, don't delete from API — just update local state
    if (editMode || !token || removal(listRef.current, ex).removedSets.length === 0) {
      applyRemoval(rowKey, removal);
    } else if (!(await runRemoval(rowKey, removal))) {
      return;
    }

    // Trigger auto-save for all copied sets (no-op in edit mode)
    if (!editMode) {
      const updatedEx = listRef.current.find((e) => e.rowKey === rowKey);
      if (updatedEx) {
        for (const s of updatedEx.sets) {
          if (s.weight || s.reps) {
            setTimeout(() => debouncedSave(updatedEx, s), 0);
          }
        }
      }
    }
  };

  const handleAddSet = (exerciseId: string, exerciseOrder: number) => {
    const target = findExercise(exerciseId, exerciseOrder);
    if (target?.rowKey) {
      // The new set opens (#667).
      const maxNum = target.sets.reduce((max, s) => Math.max(max, s.set_number), 0);
      setOpenSet({ rowKey: target.rowKey, setNumber: maxNum + 1 });
    }
    updateList((prev) =>
      prev.map((ex) => {
        if (ex.exercise_id !== exerciseId || ex.exercise_order !== exerciseOrder) return ex;
        const maxSetNum = ex.sets.reduce((max, s) => Math.max(max, s.set_number), 0);
        const newSet: TrackerSet = {
          set_number: maxSetNum + 1,
          planned_reps: ex.sets[0]?.planned_reps || '',
          weight: ex.quickFillWeight || '',
          reps: '',
          effort: '',
          saved: false,
          sheetRow: -1,
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      }),
    );
  };

  const handleRemoveSet = async (exerciseId: string, exerciseOrder: number, setNumber: number) => {
    if (!token) return;
    const ex = findExercise(exerciseId, exerciseOrder);
    if (!ex?.rowKey) return;

    const removal: Removal = (list, e) => ({
      exercises: list.map((x) =>
        x.rowKey === e.rowKey ? { ...x, sets: x.sets.filter((s) => s.set_number !== setNumber) } : x,
      ),
      removedSets: e.sets.filter((s) => s.set_number === setNumber),
    });

    // The editor closes with the set (#667).
    setOpenSet((open) => (open && open.rowKey === ex.rowKey && open.setNumber === setNumber ? null : open));

    // In edit mode, just remove from local state — deletion happens on save
    if (editMode) {
      applyRemoval(ex.rowKey, removal);
      return;
    }

    // A repeat tap while the first is still going does nothing (#394).
    const tap = `${ex.rowKey}|${setNumber}`;
    if (pendingRemovals.current.has(tap)) return;
    pendingRemovals.current.add(tap);
    setRemovingTaps(new Set(pendingRemovals.current));
    try {
      await runRemoval(ex.rowKey, removal);
    } finally {
      pendingRemovals.current.delete(tap);
      setRemovingTaps(new Set(pendingRemovals.current));
    }
  };

  const handleChangeSection = async (exerciseId: string, exerciseOrder: number, newSection: string) => {
    if (!token) return;
    const ex = findExercise(exerciseId, exerciseOrder);
    if (!ex?.rowKey) return;
    const rowKey = ex.rowKey;

    // The exercise goes to the end of its new section's card, which is created when the section is new
    // (#667, #640); the orders of the rest follow the drawn order.
    const removal: Removal = (list, e) => {
      const changed = applyChangeSection(list, e.exercise_id, e.exercise_order, newSection);
      return { exercises: moveToSectionEnd(changed.exercises, rowKey), removedSets: changed.removedSets };
    };
    focusRow.current = rowKey;
    const moved = () => showToast(`Moved to ${sectionTitle(newSection)}`, 'success');

    // In edit mode, don't delete from API
    if (editMode || removal(listRef.current, ex).removedSets.length === 0) {
      const before = listRef.current;
      applyRemoval(rowKey, removal);
      moved();
      // Log mode (#395): the new section goes to the exercise's saved rows,
      // and to its queued sets, as a move's order does (#392). Written as a
      // tracker write, after anything ahead of it; the change never waits for
      // it. A failure is silent: the next write, or Finish, writes every row
      // still differing. Edit mode writes the section at Save Changes. A
      // change to warmup has deleted its rows (below); one from warmup has
      // none to write.
      if (!editMode) {
        remapQueue(queuedOrderMap(listRef.current, before));
        void enqueueWrite(writeOrders).catch(() => undefined);
      }
    } else if (await runRemoval(rowKey, removal)) {
      // To warm-up: its rows are deleted (above) and nothing else is written now, as before. The orders the
      // other exercises took stay in the list and are written with the next move, section change or Finish.
      moved();
    }
  };

  // #371: position and announcement come from the current list, outside the
  // state updater; a move from an end does nothing at all. #667: the neighbour
  // is the next exercise in the same section, and the count is within it.
  const handleMove = (exerciseId: string, exerciseOrder: number, dir: MoveDirection) => {
    const moved = findExercise(exerciseId, exerciseOrder);
    if (!moved) return;
    const mates = listRef.current
      .filter((e) => e.section === moved.section)
      .sort((a, b) => a.exercise_order - b.exercise_order);
    const from = mates.findIndex((e) => e.exercise_id === exerciseId && e.exercise_order === exerciseOrder);
    const to = dir === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= mates.length) return;
    const apply = dir === 'up' ? applyMoveUp : applyMoveDown;
    const before = listRef.current;
    updateList((prev) => apply(prev, exerciseId, exerciseOrder));
    reorder.moved(moved.rowKey ?? '', dir, moved.exercise_name, to + 1, mates.length);

    // Log mode: the move goes to the sheet (#392); edit mode writes the order
    // at Save Changes. The queued sets take their new order now. The rows are
    // written as a tracker write, after anything ahead of it, and the move
    // never waits for it. A failure is silent: the next move, or Finish,
    // writes every row still out of order.
    if (editMode || !token) return;
    remapQueue(queuedOrderMap(listRef.current, before));
    void enqueueWrite(writeOrders).catch(() => undefined);
  };

  const handleRemoveExercise = async (exerciseId: string, exerciseOrder: number) => {
    if (!token) return;
    const ex = findExercise(exerciseId, exerciseOrder);
    if (!ex?.rowKey) return;

    if (!(await ask(removeExerciseCopy(ex.exercise_name, ex.sets.filter((s) => s.saved).length)))) return;

    const removal: Removal = (list, e) => ({
      exercises: list.filter((x) => x.rowKey !== e.rowKey),
      removedSets: e.sets,
    });

    // In edit mode, just remove locally — deletion happens on save
    if (editMode) {
      applyRemoval(ex.rowKey, removal);
    } else {
      await runRemoval(ex.rowKey, removal);
    }
  };

  // #667: the exercises join the end of the picked section's card, each with one empty set, and the first
  // one's set opens. Their orders follow the drawn order and are written as a move's are, once rows exist.
  const handleAddExercises = (picked: ExerciseWithRow[], section: string) => {
    const added: TrackerExercise[] = picked.map((ex) => ({
      exercise_id: ex.id,
      exercise_name: ex.name,
      section,
      exercise_order: 0,
      rowKey: newRowKey(),
      // A warm-up is list only: no sets.
      sets:
        section === 'warmup'
          ? []
          : [{ set_number: 1, planned_reps: '', weight: '', reps: '', effort: '', saved: false, sheetRow: -1 }],
      quickFillWeight: '',
      quickFillReps: '',
      quickFillEffort: '',
    }));
    const before = listRef.current;
    updateList((prev) => addToSection(prev, added, section));
    setPickerSection(null);
    if (section !== 'warmup') setOpenSet({ rowKey: added[0].rowKey!, setNumber: 1 });
    if (!editMode && token) {
      remapQueue(queuedOrderMap(listRef.current, before));
      void enqueueWrite(writeOrders).catch(() => undefined);
    }
  };

  const flushPendingSaves = (): Promise<void> => {
    return new Promise((resolve) => {
      // Clear all pending timers — they'll fire immediately
      for (const [key, timer] of saveTimers.current) {
        clearTimeout(timer);
        saveTimers.current.delete(key);
      }
      // Give a moment for any in-flight saves
      setTimeout(resolve, 100);
    });
  };

  /**
   * #579 — Logbook → Lift Mode. A set edit still waiting on its debounce is written first, as
   * a save would; if one fails its toast shows and nothing switches. Lift Mode then opens at the
   * first unlogged working set, with no clock (`resetRun`).
   */
  const switchToLift = async () => {
    if (!token || switchingToLift) return;
    setSwitchingToLift(true);
    try {
      const pending = [...saveTimers.current.keys()];
      for (const [, timer] of saveTimers.current) clearTimeout(timer);
      saveTimers.current.clear();
      let failed = false;
      for (const key of pending) {
        const at = key.lastIndexOf('__');
        const exKey = key.slice(0, at);
        const setNumber = Number(key.slice(at + 2));
        await enqueueWrite(() => saveOwnRow(exKey, setNumber)).catch(() => {
          failed = true;
        });
      }
      if (failed) return;
      resetRun(workoutId);
      navigate(`/workout/${workoutId}/lift`);
    } finally {
      setSwitchingToLift(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!token) return;
    setFinishing(true);
    try {
      // Every set, warmups included: a stored set left out is deleted (#177).
      const editedSets = collectEditedSets(listRef.current);

      await saveWorkoutEdits(
        workoutId,
        // Weight workouts have no cardio or venue inputs, so those fields are
        // left out and never written; nor is any input left untouched.
        editInputsToPatch(editInitial, {
          date: editDate,
          name: editName,
          duration: editDuration,
          notes,
          effort: editEffort,
        }),
        editedSets,
        token,
      );
      goBack('/activities');
    } catch {
      // Error toast shown by action
    } finally {
      setFinishing(false);
    }
  };

  const handleFinish = async () => {
    if (!token) return;
    setFinishing(true);
    try {
      await flushPendingSaves();

      // Save any unsaved sets with data (skip warmup exercises — they are
      // list-only), each through its own row, never looked up by order
      // (#392). Then bring every saved row to the order on screen. One more
      // tracker write: it starts only once every write ahead of it (a move's
      // order write among them) has finished, and reads the list as they
      // left it (#394).
      await enqueueWrite(async () => {
        const repairOrders = async () => {
          try {
            await writeOrders();
          } catch (err) {
            // Finish stops with the form as it is: nothing is marked finished.
            if (!(err instanceof ReauthFailedError)) showToast(ORDER_SAVE_FAILED, 'error');
            throw err;
          }
        };
        // First the rows a failed move or section write left behind: a saved
        // set whose row differs in both order and section would otherwise be
        // refused by saveSet's own-row check on every Finish. No request when
        // nothing differs.
        await repairOrders();

        for (const key of listRef.current.map(trackerRowKey)) {
          const ex = listRef.current.find((e) => trackerRowKey(e) === key);
          if (!ex || isWarmupExercise(ex)) continue;
          for (const set of ex.sets) {
            if (!set.saved && (set.weight || set.reps)) {
              await saveOwnRow(key, set.set_number);
            }
          }
        }

        // Then any row the saves left behind (a set's append, or a write a
        // flush overtook).
        await repairOrders();
      });

      await finishWorkout(workoutId, notes, finishEffort, token);
      navigate('/activities');
    } catch {
      // Error toast shown by action
    } finally {
      setFinishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!token) return;

    if (editMode) {
      if (!(await ask(discardChangesCopy('workout')))) return;
      exitEditMode();
      goBack('/activities');
      return;
    }

    const logged = listRef.current.reduce((n, e) => n + e.sets.filter((s) => s.saved).length, 0);
    if (!(await ask(discardWorkoutCopy(logged)))) return;
    setFinishing(true);
    try {
      await deleteWorkout(workoutId, token);
      navigate('/activities');
    } catch {
      // Error toast shown by action
    } finally {
      setFinishing(false);
    }
  };

  const cards = trackerCards(exerciseList);
  const progress = progressOf(exerciseList);
  const pills = sectionPills(new Set(cards.map((c) => c.section)));
  const hasExercises = exerciseList.length > 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const finishSummary = `${progress.logged} of ${progress.total} sets logged${
    progress.needEffort > 0 ? ` · ${progress.needEffort} need effort` : ''
  }`;

  const statusFor = (ex: TrackerExercise, setNumber: number): SaveStatus => {
    if (editMode || !touched.has(touchKey(ex.rowKey, setNumber))) return '';
    const set = ex.sets.find((s) => s.set_number === setNumber);
    if (!set || !(set.weight || set.reps)) return '';
    return set.saved ? 'Saved' : 'Saving…';
  };

  const removingFor = (ex: TrackerExercise): ReadonlySet<number> =>
    new Set(ex.sets.filter((s) => removingTaps.has(`${ex.rowKey}|${s.set_number}`)).map((s) => s.set_number));

  const syncNow = async () => {
    if (isSyncing.value || !token) return;
    const result = await flushQueue(token);
    if (result.remaining === 0 && result.synced > 0) {
      showToast(`${result.synced} set${result.synced === 1 ? '' : 's'} saved`, 'success');
    } else if (result.failed > 0) {
      showToast('Some sets failed to sync — will retry on reconnect', 'error');
    }
  };

  const openFinish = async () => {
    // AC7: Guard against finishing with unsynced sets
    const queuedCount = pendingSyncCount.value;
    if (queuedCount > 0) {
      const ok = await ask(finishUnsyncedCopy(queuedCount));
      if (!ok) return;
    }
    setShowFinishForm(true);
  };

  const editDay = new Date(`${editDate || editInitial.date}T00:00:00`);
  const editMeta = Number.isNaN(editDay.getTime())
    ? 'Editing'
    : `Editing · ${editDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  return (
    <div class="screen workout-detail-screen workout-tracker lb-screen" ref={screenRef}>
      {editMode ? (
        <div class="detail-top-bar">
          <button type="button" class="detail-icon-btn" aria-label="Close" onClick={handleDiscard}>
            <CloseIcon />
          </button>
          <button type="button" class="btn btn-primary tpl-save" onClick={handleSaveEdits} disabled={finishing}>
            {finishing ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <div class="detail-top-bar lb-top-bar">
          <div class="detail-top-actions">
            {workout?.type === 'weight' && workout.status === 'active' && (
              <button
                type="button"
                class="btn btn-secondary lb-lift-chip"
                onClick={() => void switchToLift()}
                disabled={finishing || switchingToLift}
              >
                <DumbbellIcon />
                <span>Lift Mode</span>
              </button>
            )}
            <ActionMenu
              label="More actions"
              disabled={finishing}
              items={[
                {
                  key: 'discard',
                  label: 'Discard workout',
                  icon: <TrashIcon />,
                  onSelect: () => void handleDiscard(),
                  danger: true,
                },
              ]}
            />
          </div>
        </div>
      )}

      <div class="lb-title-block">
        <p class="detail-date-line lb-meta">{editMode ? editMeta : 'Logbook · in progress'}</p>
        <h1 class="detail-title">{workoutName}</h1>
      </div>

      {/* Offline banner (AC2) — only when sets are queued */}
      {!editMode && pendingSyncCount.value > 0 && (
        <div class="lb-banner" aria-live="polite">
          <NoSignalIcon />
          <span class="lb-banner-text">
            {isSyncing.value ? 'Syncing…' : `${plural(pendingSyncCount.value, 'set')} not synced`}
          </span>
          <button
            type="button"
            class="lb-text-btn lb-banner-btn"
            aria-disabled={isSyncing.value ? 'true' : undefined}
            onClick={() => void syncNow()}
          >
            <span>Sync now</span>
          </button>
        </div>
      )}

      {/* Edit mode details */}
      {editMode && (
        <section class="detail-stats-card lb-details" aria-labelledby="tracker-edit-details">
          <h2 id="tracker-edit-details" class="lb-details-title">
            Details
          </h2>
          <div class="lb-field">
            <label class="lb-field-label" htmlFor="tracker-edit-name">
              Name
            </label>
            <input
              id="tracker-edit-name"
              class="form-input lb-input"
              type="text"
              value={editName}
              onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="lb-field-pair">
            <div class="lb-field">
              <label class="lb-field-label" htmlFor="tracker-edit-date">
                Date
              </label>
              <input
                id="tracker-edit-date"
                class="form-input lb-input"
                type="date"
                value={editDate}
                onInput={(e) => setEditDate((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="lb-field">
              <label class="lb-field-label" htmlFor="tracker-edit-duration">
                Duration (min)
              </label>
              <input
                id="tracker-edit-duration"
                class="form-input lb-input"
                type="number"
                inputMode="numeric"
                placeholder="e.g. 30"
                value={editDuration}
                onInput={(e) => setEditDuration((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <div class="lb-field">
            <span class="lb-field-label" id={effortLabelId}>
              Session effort
            </span>
            <EffortPills value={editEffort} onChange={setEditEffort} labelledBy={effortLabelId} />
          </div>
          <div class="lb-field">
            <label class="lb-field-label" htmlFor="tracker-edit-notes">
              Notes
            </label>
            <textarea
              id="tracker-edit-notes"
              class="form-textarea lb-notes"
              placeholder="How did it go?"
              rows={3}
              value={notes}
              onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
            />
          </div>
        </section>
      )}

      {/* Finish sheet (non-edit mode only) */}
      {!editMode && showFinishForm && (
        <FinishWorkoutSheet
          notes={notes}
          onNotesChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          effort={finishEffort}
          onEffortChange={setFinishEffort}
          onFinish={handleFinish}
          onCancel={() => setShowFinishForm(false)}
          finishing={finishing}
          summary={finishSummary}
        />
      )}

      {/* aria-live region for reorder announcements */}
      <div role="status" aria-live="polite" class="sr-only">
        {reorder.announcement}
      </div>

      {!editMode && hasExercises && (
        <section class="detail-stats-card strength-hero lb-progress" aria-live="polite" aria-label="Progress">
          <SetsRing logged={progress.logged} total={progress.total} />
          <div class="lb-progress-cells">
            <div class="detail-stat">
              <span class="detail-stat-value">
                {progress.exercisesDone}
                <span class="detail-stat-unit"> of {progress.exercisesTotal}</span>
              </span>
              <span class="detail-stat-label">Exercises done</span>
            </div>
            {progress.needEffort > 0 && (
              <div class="detail-stat">
                <span class="detail-stat-value lb-need-effort">{progress.needEffort}</span>
                <span class="detail-stat-label">Need effort</span>
              </div>
            )}
          </div>
        </section>
      )}

      {hasExercises ? (
        <div class="strength-exercises-header">
          <h2 class="strength-exercises-heading">Exercises</h2>
          <button
            type="button"
            class={`filter-chip last-time-chip${showLastTime ? ' active' : ''}`}
            aria-pressed={showLastTime}
            onClick={() => setShowLastTime(!showLastTime)}
          >
            <HistoryIcon />
            Last time
          </button>
        </div>
      ) : (
        <p class="tpl-start-note">Add a section to start.</p>
      )}

      <div class="lb-cards" ref={reorder.listRef}>
        {cards.map((card) => (
          <section class="strength-section-card lb-card" key={card.section}>
            <div class="lb-card-head">
              <h2 class="strength-section-heading">{card.title}</h2>
              <span class="lb-card-count">{plural(card.exercises.length, 'exercise')}</span>
            </div>
            {card.exercises.map((ex, at) => (
              <ExerciseRow
                key={trackerRowKey(ex)}
                exercise={ex}
                currentWorkoutId={workoutId}
                showLastTime={showLastTime}
                openSet={openSet && openSet.rowKey === ex.rowKey ? openSet.setNumber : null}
                statusFor={(setNumber) => statusFor(ex, setNumber)}
                removing={removingFor(ex)}
                isFirst={at === 0}
                isLast={at === card.exercises.length - 1}
                onOpenSet={(setNumber) =>
                  setOpenSet(setNumber === null ? null : { rowKey: trackerRowKey(ex), setNumber })
                }
                onUpdateSet={(setNum, updates) => handleUpdateSet(ex.exercise_id, ex.exercise_order, setNum, updates)}
                onAddSet={() => handleAddSet(ex.exercise_id, ex.exercise_order)}
                onRemoveSet={(setNum) => handleRemoveSet(ex.exercise_id, ex.exercise_order, setNum)}
                onSameForAll={(setNum) => handleSameForAll(ex.exercise_id, ex.exercise_order, setNum)}
                onCopyDown={(lastTimeSets) => handleCopyDown(ex.exercise_id, ex.exercise_order, lastTimeSets)}
                onChangeSection={(newSection) => handleChangeSection(ex.exercise_id, ex.exercise_order, newSection)}
                onMoveUp={() => handleMove(ex.exercise_id, ex.exercise_order, 'up')}
                onMoveDown={() => handleMove(ex.exercise_id, ex.exercise_order, 'down')}
                onRemoveExercise={() => handleRemoveExercise(ex.exercise_id, ex.exercise_order)}
              />
            ))}
            <button
              type="button"
              class="btn btn-ghost lb-add-btn"
              aria-label={`Add exercise to ${card.title}`}
              onClick={() => setPickerSection(card.section)}
            >
              <PlusIcon />
              <span>Add exercise</span>
            </button>
          </section>
        ))}
      </div>

      {pills.length > 0 && (
        <section class="tpl-add-section">
          <div class="week-heading">
            <h2>Add a section</h2>
          </div>
          <div class="tpl-pills">
            {pills.map((p) => (
              <button
                type="button"
                key={p.section}
                class="filter-chip tpl-pill"
                onClick={() => setPickerSection(p.section)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {!editMode && (
        <div class="template-detail-footer lb-finish-bar">
          <button type="button" class="btn btn-primary" onClick={() => void openFinish()} disabled={finishing}>
            Finish workout
          </button>
        </div>
      )}

      {pickerSection !== null && (
        <AddExerciseModal
          sectionLabel={sectionTitle(pickerSection)}
          onAdd={(picked) => handleAddExercises(picked, pickerSection)}
          onClose={() => setPickerSection(null)}
        />
      )}
    </div>
  );
}
