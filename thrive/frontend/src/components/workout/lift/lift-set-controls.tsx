// #577, #578 — the controls that log one set in Lift Mode: weight and reps steppers
// and the effort pills. The Log card on the rest screen and the editor under a
// row of the sets list are both this component.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { saveSet } from '../../../state/actions';
import type { Effort } from '../../../api/types';
import { EffortToggle } from '../../shared/effort-toggle';
import { lastTimeFor, stepWeight, type LiftStep } from './lift-plan';

// Every mounted set's "save what is held", so Finish and Save can wait for them.
const flushers = new Set<() => Promise<void>>();

/** Writes every held stepper change; resolves when they have all settled. */
export async function flushLogDrafts(): Promise<void> {
  await Promise.all([...flushers].map((f) => f()));
}

interface Draft {
  weight: string;
  reps: string;
  effort: Effort | '';
}

export function Stepper({
  label,
  value,
  onLess,
  onMore,
  what,
}: {
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
  what: string;
}) {
  return (
    <div class="lift-stepper" role="group" aria-label={what}>
      <button type="button" class="btn-icon duration-stepper-btn" aria-label={`Less ${what}`} onClick={onLess}>
        <span aria-hidden="true">−</span>
      </button>
      <span class="lift-stepper-value">
        <span class="lift-stepper-number">{value}</span> <span class="lift-stepper-unit">{label}</span>
      </span>
      <button type="button" class="btn-icon duration-stepper-btn" aria-label={`More ${what}`} onClick={onMore}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

/**
 * One set's steppers and effort. A stepper change is held until an effort is
 * tapped or the controls leave the screen; an effort tap writes weight, reps and
 * effort through `saveSet` at once. After a failed write the controls keep what
 * the person set, for another try, or with `revertOnFail` go back to what the
 * set held before the edit. Something changing the stored row from outside (the
 * sets list, while this is the Log card) is followed when nothing is held.
 */
export function SetControls({
  step,
  workoutId,
  token,
  revertOnFail = false,
  children,
  footer,
}: {
  step: LiftStep;
  workoutId: string;
  token: string;
  revertOnFail?: boolean;
  /** Shown above the steppers, inside the same block (the Log card's head). */
  children?: ComponentChildren;
  /** Shown under the effort pills. */
  footer?: ComponentChildren;
}) {
  const row = step.row;
  const rowRef = useRef(row);
  rowRef.current = row;
  const last = lastTimeFor(row, workoutId);
  const fromRow = (): Draft => ({
    weight: row.weight || last.set?.weight || '',
    reps: row.reps || row.planned_reps || '',
    effort: row.effort as Effort | '',
  });
  const [draft, setDraft] = useState<Draft>(fromRow);
  const draftRef = useRef(draft);
  const saved = useRef(draft);
  const dirty = useRef(false);
  const busy = useRef(false);

  const write = async (d: Draft) => {
    busy.current = true;
    try {
      await saveSet(
        { ...rowRef.current, weight: d.weight, reps: d.reps, effort: d.effort },
        token,
        rowRef.current.sheetRow,
      );
      dirty.current = false;
      saved.current = d;
    } catch {
      // saveSet showed its toast (or queued the write).
      if (revertOnFail) {
        dirty.current = false;
        draftRef.current = saved.current;
        setDraft(saved.current);
      }
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    const flush = async () => {
      if (dirty.current && !busy.current) await write(draftRef.current);
    };
    flushers.add(flush);
    return () => {
      flushers.delete(flush);
      void flush();
    };
  }, []);

  // The stored row changed under these controls: follow it unless the person has a change held.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (dirty.current || busy.current) return;
    const next = fromRow();
    draftRef.current = next;
    saved.current = next;
    setDraft(next);
  }, [row.weight, row.reps, row.effort]);

  const edit = (next: Draft, save: boolean) => {
    if (busy.current) return;
    draftRef.current = next;
    setDraft(next);
    if (save) void write(next);
    else dirty.current = true;
  };

  const weight = Number(draft.weight);
  const reps = Number(draft.reps) || 0;
  const hasWeight = draft.weight !== '';
  const name = row.exercise_name;
  return (
    <>
      {children}
      <div class="lift-steppers">
        {hasWeight ? (
          <Stepper
            label="lb"
            value={String(Number(weight.toFixed(2)))}
            onLess={() => edit({ ...draft, weight: String(stepWeight(weight, -1)) }, false)}
            onMore={() => edit({ ...draft, weight: String(stepWeight(weight, 1)) }, false)}
            what={`${name} weight`}
          />
        ) : (
          <span class="lift-bodyweight">Bodyweight</span>
        )}
        <Stepper
          label="reps"
          value={String(reps)}
          onLess={() => edit({ ...draft, reps: String(Math.max(0, reps - 1)) }, false)}
          onMore={() => edit({ ...draft, reps: String(reps + 1) }, false)}
          what={`${name} reps`}
        />
      </div>
      <div class="lift-effort">
        <EffortToggle
          value={draft.effort}
          onChange={(e) => edit({ ...draft, effort: e }, true)}
          size="session"
          label={`${name} set ${row.set_number} effort`}
        />
      </div>
      {footer}
    </>
  );
}
