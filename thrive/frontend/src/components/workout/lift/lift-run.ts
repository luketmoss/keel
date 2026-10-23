// #577 — Lift Mode's run state, kept on the device per workout so a reload
// resumes the same step, and the clock arithmetic every screen shares. Times
// are epoch ms, and every clock is read from them, never counted. Since #578 it
// also holds the summary's notes and session effort, so a reload keeps them.

import type { Effort } from '../../../api/types';

export type LiftPhase = 'start' | 'warmup' | 'ready' | 'set' | 'rest' | 'cooldown';

export interface LiftRun {
  phase: LiftPhase;
  /** The step on screen: the set being done, or Up next during a rest and Ready. */
  stepIndex: number;
  setStartedAt: number | null;
  restStartedAt: number | null;
  /** The target in seconds, 0 for none. */
  restTarget: number;
  /** When the last rest alert fired. */
  alertedAt: number | null;
  /** The step whose rest this is, which Start set writes `rest_s` to. */
  restFor: number | null;
  /** When Start workout was pressed: the session clock's zero. */
  sessionStartedAt: number | null;
  /** The summary's notes, kept as they are typed. */
  notes: string;
  /** The summary's session effort. */
  sessionEffort: Effort | '';
}

export const FRESH_RUN: LiftRun = {
  phase: 'start',
  stepIndex: 0,
  setStartedAt: null,
  restStartedAt: null,
  restTarget: 0,
  alertedAt: null,
  restFor: null,
  sessionStartedAt: null,
  notes: '',
  sessionEffort: '',
};

const PHASES: readonly string[] = ['start', 'warmup', 'ready', 'set', 'rest', 'cooldown'];
export const runKey = (workoutId: string): string => `thrive.lift.${workoutId}`;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The stored run, or null when there is none or it is not one. Never throws. */
export function loadRun(workoutId: string): LiftRun | null {
  try {
    const raw = window.localStorage.getItem(runKey(workoutId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || typeof v.phase !== 'string' || !PHASES.includes(v.phase)) return null;
    const stepIndex = num(v.stepIndex);
    if (stepIndex === null || stepIndex < 0) return null;
    return {
      phase: v.phase as LiftPhase,
      stepIndex,
      setStartedAt: num(v.setStartedAt),
      restStartedAt: num(v.restStartedAt),
      restTarget: num(v.restTarget) ?? 0,
      alertedAt: num(v.alertedAt),
      restFor: num(v.restFor),
      sessionStartedAt: num(v.sessionStartedAt),
      notes: typeof v.notes === 'string' ? v.notes : '',
      sessionEffort:
        v.sessionEffort === 'Easy' || v.sessionEffort === 'Medium' || v.sessionEffort === 'Hard' ? v.sessionEffort : '',
    };
  } catch {
    return null;
  }
}

export function saveRun(workoutId: string, run: LiftRun): void {
  try {
    window.localStorage.setItem(runKey(workoutId), JSON.stringify(run));
  } catch {
    // Storage can be full, blocked or absent: Lift Mode works without it.
  }
}

export function clearRun(workoutId: string): void {
  try {
    window.localStorage.removeItem(runKey(workoutId));
  } catch {
    // As above.
  }
}

/** Whole seconds from `since` to `now`, never negative. */
export function secondsSince(since: number | null, now: number): number {
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** Seconds as the value written to a row: the same arithmetic, rounded rather than floored. */
export function wholeSeconds(since: number, now: number): number {
  return Math.max(0, Math.round((now - since) / 1000));
}

export interface RestView {
  /** The target has been reached (never when there is none). */
  up: boolean;
  /** Seconds past the target. */
  over: number;
  /** 0..1 of the way to the target, 0 with none. */
  fraction: number;
}

export function restView(elapsed: number, target: number): RestView {
  if (target <= 0) return { up: false, over: 0, fraction: 0 };
  return { up: elapsed >= target, over: Math.max(0, elapsed - target), fraction: Math.min(1, elapsed / target) };
}

/** Repeat interval of the alert after the first. */
export const REPEAT_ALERT_S = 30;

/**
 * Which alert the rest is due: -1 before the target, 0 at it, then k for the
 * k-th 30 s after. A clock jumping past several (the screen slept) is just a
 * higher slot, so it fires once on return.
 */
export function alertSlot(elapsed: number, target: number): number {
  if (target <= 0 || elapsed < target) return -1;
  return Math.floor((elapsed - target) / REPEAT_ALERT_S);
}
