// #577 — Lift Mode's run order and the lines it shows, as pure functions over a
// workout's Sets rows. No signals, no clock: the screens pass in what they hold.

import type { SetWithRow } from '../../../api/types';
import { SWITCH_SECTIONS, formatMSS } from '../../../api/rest-times';
import { getLastTimeDataFrom, type LastTimeResult } from '../last-time-data';
import { sets, workouts } from '../../../state/store';
import { sectionTitle } from '../../activities/exercise-detail';

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

/**
 * "Done · rest 1:30", "Done · switch", "Done · finish", "Done · set up next"
 * when the next set opens another group (#674), or "Done" when the target is blank.
 */
export function doneLabel(step: LiftStep, isLast: boolean, endsGroup = false): string {
  if (isLast) return 'Done · finish';
  if (endsGroup) return 'Done · set up next';
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

/**
 * The exercise's most recent earlier session: `getLastTimeData` over workouts
 * that were done, so a planned one (today's, or one scheduled ahead) with
 * nothing lifted yet is never "last time" (#674).
 */
export function lastSession(exerciseId: string, workoutId: string): LastTimeResult | null {
  const done = workouts.value.filter((w) => w.status !== 'planned');
  return getLastTimeDataFrom(exerciseId, workoutId, sets.value, done);
}

export function lastTimeFor(row: Pick<SetWithRow, 'exercise_id' | 'set_number'>, workoutId: string): LastTime {
  const data = lastSession(row.exercise_id, workoutId);
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

/** A set's state in the sets list. */
export type StepState = 'logged' | 'no-effort' | 'skipped' | 'now' | 'todo';

/**
 * `current` is the set on screen (null when none is), and `ended` that the
 * workout is over for this list: the summary, where whatever was not done is
 * skipped and nothing is "now" or still to come.
 */
export function stepState(step: LiftStep, current: number | null, ended = false): StepState {
  if (!ended && current === step.index) return 'now';
  if (isStepLogged(step.row)) return step.row.effort ? 'logged' : 'no-effort';
  if (ended || (current !== null && step.index < current)) return 'skipped';
  return 'todo';
}

/** Whether a row of the sets list opens: all of them on the summary, only the done and skipped during the workout. */
export function isEditable(state: StepState, ended: boolean): boolean {
  return ended || state === 'logged' || state === 'no-effort' || state === 'skipped';
}

/** "90 × 8" with "BW" for no weight, and "?" for reps not logged. */
export function figuresText(row: Pick<SetWithRow, 'weight' | 'reps'>): string {
  const w = Number(row.weight);
  const weight = row.weight === '' || !Number.isFinite(w) || w === 0 ? 'BW' : String(Number(w.toFixed(2)));
  return `${weight} × ${row.reps || '?'}`;
}

/** Whole seconds in a Sets cell, or null when it is blank or not a number. */
const seconds = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface SummaryTotals {
  /** Working sets with reps logged. */
  setsDone: number;
  /** Working sets in the workout. */
  setsTotal: number;
  /** The sum of `set_s`, or null with none. */
  liftingS: number | null;
  /** The sum of `rest_s`, or null with none. */
  restingS: number | null;
  /** The mean of `rest_s - rest_target_s` over sets with both, rounded, or null with none. */
  restVsPlanS: number | null;
  /** Working sets that were done with no effort. */
  needEffort: number;
}

export function summaryTotals(steps: readonly LiftStep[]): SummaryTotals {
  let lifting: number | null = null;
  let resting: number | null = null;
  let diffSum = 0;
  let diffN = 0;
  for (const { row } of steps) {
    const set = seconds(row.set_s);
    if (set !== null) lifting = (lifting ?? 0) + set;
    const rest = seconds(row.rest_s);
    if (rest !== null) resting = (resting ?? 0) + rest;
    const target = seconds(row.rest_target_s);
    if (rest !== null && target !== null) {
      diffSum += rest - target;
      diffN += 1;
    }
  }
  return {
    setsDone: steps.filter((s) => s.row.reps !== '').length,
    setsTotal: steps.length,
    liftingS: lifting,
    restingS: resting,
    restVsPlanS: diffN > 0 ? Math.round(diffSum / diffN) : null,
    needEffort: steps.filter((s) => isStepLogged(s.row) && !s.row.effort).length,
  };
}

/** "+0:12" or "−0:05" (a true minus sign). */
export function signedMSS(s: number): string {
  return `${s < 0 ? '−' : '+'}${formatMSS(Math.abs(s))}`;
}

// ── Set up next (#674) ──────────────────────────────────────────────

/** Whether `next` is in another working section than the step at `from`: the set at `from` ends its group. */
export function endsGroup(steps: readonly LiftStep[], from: number, next: number): boolean {
  return next >= 0 && !!steps[from] && steps[next].section !== steps[from].section;
}

/**
 * Whether a run opening at `index` (a start, the warm-up's end, a reload with
 * nothing stored, a switch from Logbook) opens on Set up next: no set of its
 * section is logged yet. Part-way through a section, Ready is shown instead.
 */
export function opensGroup(steps: readonly LiftStep[], index: number): boolean {
  const at = steps[index];
  return !!at && !steps.some((s) => s.section === at.section && isStepLogged(s.row));
}

/** "Primary", "Superset 1", "Burnout": the group's name, for its heading and its Start button. */
export const groupName = (section: string): string => sectionTitle(section);

/** A weight as the setup field holds it: a number at or above 0 as text, or '' for none. */
export function cleanWeight(weight: string): string {
  const n = Number(weight);
  if (weight.trim() === '' || !Number.isFinite(n) || n <= 0) return '';
  return String(Number(n.toFixed(2)));
}

export interface SetupExercise {
  /** `exercise_id|exercise_order`: one card. */
  key: string;
  exercise_id: string;
  exercise_order: number;
  name: string;
  letter: string;
  /** The exercise's rows in this workout, by set number. */
  rows: SetWithRow[];
  /** "3 × 10", "3 sets · 10, 8, 6" or "3 sets". */
  plan: string;
  /** "95 lb" or "95–105 lb" when any row carries a weight, else ''. */
  planned: string;
  last: LastTimeResult | null;
  /** Planned set 1 weight, else last time's set 1, else ''. */
  startWeight: string;
  /** Every set of it is logged: nothing to set up. */
  allLogged: boolean;
}

/** The group's exercises in run order, with what each card shows. */
export function setupExercises(steps: readonly LiftStep[], section: string, workoutId: string): SetupExercise[] {
  const out: SetupExercise[] = [];
  for (const step of steps) {
    if (step.section !== section) continue;
    const key = `${step.row.exercise_id}|${step.row.exercise_order}`;
    let ex = out.find((e) => e.key === key);
    if (!ex) {
      ex = {
        key,
        exercise_id: step.row.exercise_id,
        exercise_order: step.row.exercise_order,
        name: step.row.exercise_name,
        letter: step.letter,
        rows: [],
        plan: '',
        planned: '',
        last: null,
        startWeight: '',
        allLogged: true,
      };
      out.push(ex);
    }
    ex.rows.push(step.row);
    if (!isStepLogged(step.row)) ex.allLogged = false;
  }
  out.sort((a, b) => a.exercise_order - b.exercise_order);
  for (const ex of out) {
    ex.rows.sort((a, b) => a.set_number - b.set_number);
    ex.plan = planLine(ex.rows);
    ex.planned = plannedWeight(ex.rows);
    ex.last = lastSession(ex.exercise_id, workoutId);
    const lastFirst = ex.last?.sets.find((s) => s.set_number === 1) ?? ex.last?.sets[0];
    ex.startWeight = cleanWeight(ex.rows[0]?.weight ?? '') || cleanWeight(lastFirst?.weight ?? '');
  }
  return out;
}

/** "3 × 10" when every set plans the same reps, "3 sets · 10, 8, 6" when they differ, "3 sets" with none. */
export function planLine(rows: readonly Pick<SetWithRow, 'planned_reps'>[]): string {
  const n = rows.length;
  const reps = rows.map((r) => r.planned_reps.trim());
  const sets = `${n} ${n === 1 ? 'set' : 'sets'}`;
  if (reps.every((r) => r === '')) return sets;
  if (reps.every((r) => r === reps[0])) return `${n} × ${reps[0]}`;
  return `${sets} · ${reps.map((r) => r || '—').join(', ')}`;
}

/** "95 lb", "95–105 lb", or '' when no row carries a weight (never "0 lb"). */
export function plannedWeight(rows: readonly Pick<SetWithRow, 'weight'>[]): string {
  const ws = rows.map((r) => Number(cleanWeight(r.weight))).filter((n) => n > 0);
  if (ws.length === 0) return '';
  const lo = Math.min(...ws);
  const hi = Math.max(...ws);
  return lo === hi ? `${lo} lb` : `${lo}–${hi} lb`;
}

/** "Oct 21", with the year when it is not this year's. */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "2 exercises · 3 rounds" for a superset or burnout, "4 sets" elsewhere. */
export function groupMeta(steps: readonly LiftStep[], section: string): string {
  const mine = steps.filter((s) => s.section === section);
  if (!SWITCH_SECTIONS.includes(section)) return `${mine.length} ${mine.length === 1 ? 'set' : 'sets'}`;
  const exercises = new Set(mine.map((s) => s.row.exercise_order)).size;
  const rounds = new Set(mine.map((s) => s.row.set_number)).size;
  return `${exercises} ${exercises === 1 ? 'exercise' : 'exercises'} · ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
}
