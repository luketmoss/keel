// #577 — Lift Mode's run order and the lines it shows, as pure functions over a
// workout's Sets rows. No signals, no clock: the screens pass in what they hold.

import type { SetWithRow } from '../../../api/types';
import { SWITCH_SECTIONS, formatMSS } from '../../../api/rest-times';
import { getLastTimeData } from '../last-time-data';

/** Sections that are not working sets: a checklist before, and one after. */
export const isWorkingSection = (section: string): boolean => section !== 'warmup' && section !== 'cooldown';

export interface LiftStep {
  /** `section|exercise_order|set_number`: stable while the plan is. */
  key: string;
  index: number;
  section: string;
  row: SetWithRow;
  /** "A", "B" ... inside a superset or burnout round, '' elsewhere. */
  letter: string;
  /** The step is the last of its round: the rest after it is the round's, not a switch. */
  lastInRound: boolean;
  /** The next step of the same round (a switch is going to it), or null. */
  nextInRound: LiftStep | null;
  /** N of "Set n of N": the exercise's sets in this workout. */
  setCount: number;
}

export const stepKey = (r: Pick<SetWithRow, 'section' | 'exercise_order' | 'set_number'>): string =>
  `${r.section}|${r.exercise_order}|${r.set_number}`;

/** Whether a set has been performed or logged, in this run or before it (Logbook, an earlier load). */
export function isStepLogged(row: Pick<SetWithRow, 'reps' | 'effort' | 'set_s'>): boolean {
  // A weight alone is no evidence: a plan can prescribe one, and nothing was lifted yet.
  return Boolean(row.set_s || row.reps || row.effort);
}

/**
 * The working sets in the order Lift Mode runs them. Sections in exercise
 * order; inside a superset or burnout, rounds (set r of each exercise that has
 * one, in exercise order); any other section exercise by exercise, which for
 * `primary`, one exercise, is just its sets.
 */
export function buildSteps(rows: readonly SetWithRow[]): LiftStep[] {
  const working = rows.filter((r) => isWorkingSection(r.section));

  const sections: string[] = [];
  const firstOrder = new Map<string, number>();
  for (const r of working) {
    const o = firstOrder.get(r.section);
    if (o === undefined) sections.push(r.section);
    if (o === undefined || r.exercise_order < o) firstOrder.set(r.section, r.exercise_order);
  }
  sections.sort((a, b) => firstOrder.get(a)! - firstOrder.get(b)!);

  const steps: LiftStep[] = [];
  for (const section of sections) {
    const inSection = working.filter((r) => r.section === section);
    const orders = [...new Set(inSection.map((r) => r.exercise_order))].sort((a, b) => a - b);
    const setNumbers = [...new Set(inSection.map((r) => r.set_number))].sort((a, b) => a - b);
    const find = (order: number, n: number) => inSection.find((r) => r.exercise_order === order && r.set_number === n);
    const ordered: SetWithRow[] = [];
    const rounds = SWITCH_SECTIONS.includes(section);
    if (rounds) {
      for (const n of setNumbers) for (const o of orders) if (find(o, n)) ordered.push(find(o, n)!);
    } else {
      for (const o of orders) for (const n of setNumbers) if (find(o, n)) ordered.push(find(o, n)!);
    }

    const start = steps.length;
    ordered.forEach((row) => {
      steps.push({
        key: stepKey(row),
        index: steps.length,
        section,
        row,
        letter: rounds ? String.fromCharCode(65 + orders.indexOf(row.exercise_order)) : '',
        lastInRound: true,
        nextInRound: null,
        setCount: inSection.filter((r) => r.exercise_order === row.exercise_order).length,
      });
    });
    if (rounds) {
      for (let i = start; i < steps.length - 1; i++) {
        if (steps[i + 1].row.set_number === steps[i].row.set_number) {
          steps[i].lastInRound = false;
          steps[i].nextInRound = steps[i + 1];
        }
      }
    }
  }
  return steps;
}

/** The first step after `from` (`-1` for the start) that is not logged yet, or -1. */
export function nextIndex(steps: readonly LiftStep[], from: number): number {
  for (let i = from + 1; i < steps.length; i++) if (!isStepLogged(steps[i].row)) return i;
  return -1;
}

/** The steps of the round `index` belongs to that come at or before it, oldest first. */
export function roundUpTo(steps: readonly LiftStep[], index: number): LiftStep[] {
  const at = steps[index];
  if (!SWITCH_SECTIONS.includes(at.section)) return [at];
  const out = [at];
  for (let i = index - 1; i >= 0; i--) {
    if (steps[i].section !== at.section || steps[i].row.set_number !== at.row.set_number) break;
    out.unshift(steps[i]);
  }
  return out;
}

/** The rest planned after a set in seconds; 0 when blank. */
export function restTargetOf(row: Pick<SetWithRow, 'rest_target_s'>): number {
  const n = Number(row.rest_target_s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** "Done · rest 1:30", "Done · switch", "Done · finish", or "Done" when the target is blank. */
export function doneLabel(step: LiftStep, isLast: boolean): string {
  if (isLast) return 'Done · finish';
  const target = restTargetOf(step.row);
  if (!target) return 'Done';
  return step.lastInRound ? `Done · rest ${formatMSS(target)}` : 'Done · switch';
}

/** "90 lb", or "BW" for a blank weight. */
export function weightText(weight: string): string {
  const n = Number(weight);
  if (weight === '' || !Number.isFinite(n) || n === 0) return 'BW';
  return `${Number(n.toFixed(2))} lb`;
}

export interface LastTime {
  /** The set's weight and reps last time, or null when that set number did not exist. */
  set: SetWithRow | null;
  /** Whether the exercise has any history at all. */
  any: boolean;
}

export function lastTimeFor(row: Pick<SetWithRow, 'exercise_id' | 'set_number'>, workoutId: string): LastTime {
  const data = getLastTimeData(row.exercise_id, workoutId);
  if (!data) return { set: null, any: false };
  return { set: data.sets.find((s) => s.set_number === row.set_number) ?? null, any: true };
}

/** "Last time: 90 × 8 · Medium", "No set 2 last time" or "First time doing this exercise". */
export function lastTimeLine(last: LastTime, setNumber: number): string {
  if (!last.any) return 'First time doing this exercise';
  if (!last.set) return `No set ${setNumber} last time`;
  const w = last.set.weight ? String(Number(last.set.weight)) : 'BW';
  const figures = `${w} × ${last.set.reps || '?'}`;
  return `Last time: ${last.set.effort ? `${figures} · ${last.set.effort}` : figures}`;
}

/**
 * The weight a set is aimed at: its own, else what the same set weighed last
 * time. Templates carry no weight, so this is what "the plan" says to lift.
 */
export function targetWeight(row: Pick<SetWithRow, 'weight'>, last: LastTime): string {
  return row.weight || last.set?.weight || '';
}

/** "Set 2 of 4 · 8 reps · 90 lb": the reps part is dropped when none are planned. */
export function targetParts(step: LiftStep, weight: string): { setOf: string; reps: string; weight: string } {
  const reps = step.row.planned_reps.trim();
  return {
    setOf: `Set ${step.row.set_number} of ${step.setCount}`,
    reps: reps ? `${reps} reps` : '',
    weight: weightText(weight),
  };
}

/** The weight stepper moves by 5 from 20 lb up and by 1 below; reps by 1; neither goes under 0. */
export function stepWeight(weight: number, dir: -1 | 1): number {
  const step = weight >= 20 ? 5 : 1;
  return Math.max(0, weight + dir * step);
}

/** A section's progress for the bar: working sets logged of working sets. */
export function progressOf(steps: readonly LiftStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => isStepLogged(s.row)).length, total: steps.length };
}

/** A set's state in All sets. */
export type StepState = 'logged' | 'no-effort' | 'skipped' | 'now' | 'todo';

export function stepState(step: LiftStep, current: number | null): StepState {
  if (current === step.index) return 'now';
  if (isStepLogged(step.row)) return step.row.effort ? 'logged' : 'no-effort';
  if (current !== null && step.index < current) return 'skipped';
  return 'todo';
}
