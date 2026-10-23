// #577 — Lift Mode: a guided screen for an active weight workout, set by set,
// with a stopwatch for each set and each rest. It is a route of its own
// (`#/workout/:id/lift`), beside the tracker, which it leaves alone.
//
// The run (which step, which clocks) is kept on the device per workout and
// every clock is read from stored timestamps, so a reload or a sleeping screen
// changes nothing. What is written to the sheet: `set_s` on Done, `rest_s` on
// Start set, weight, reps and effort through `saveSet` as the tracker does, and
// `rest_target_s` when today's rest is changed on the start screen. The end of
// the workout is the summary (#578), not the tracker's finish modal.

import { batch } from '@preact/signals';
import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  activeWarmupExercises,
  activeWorkoutId,
  activeWorkoutSets,
  sets,
  templates,
  workouts,
  showToast,
} from '../../../state/store';
import { finishWorkout, saveSet, saveSetTimings, startPlannedWorkout } from '../../../state/actions';
import { loadRestSettings, restSettings } from '../../../state/rest-settings';
import { useAuth } from '../../../auth/auth-context';
import { navigate, replaceRoute } from '../../../router/router';
import { formatMSS } from '../../../api/rest-times';
import type { SetWithRow } from '../../../api/types';
import { templateWarmupsToRestore } from '../template-warmups';
import {
  AllSetsSheet,
  ChecklistScreen,
  LiftHeader,
  LogCard,
  RestHero,
  SetScreen,
  StartScreen,
  UpNextCard,
  type ChecklistItem,
} from './lift-screens';
import { flushLogDrafts } from './lift-set-controls';
import { SummaryScreen } from './lift-summary';
import {
  buildSteps,
  doneLabel,
  isStepLogged,
  lastTimeFor,
  nextIndex,
  progressOf,
  restTargetOf,
  roundUpTo,
  type LiftStep,
} from './lift-plan';
import { retargetSection, type SectionValues } from './lift-rest';
import {
  FRESH_RUN,
  alertSlot,
  clearRun,
  loadRun,
  restView,
  saveRun,
  secondsSince,
  wholeSeconds,
  type LiftRun,
} from './lift-run';

const TOAST_MS = 2600;
const REST_WRITE_DELAY_MS = 800;
const FIRST_ALERT = [200, 100, 200];
const REPEAT_ALERT = [120];

/** The time, re-read four times a second while `active` and whenever the page comes back into view. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);
  return now;
}

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

/** A screen wake lock while `enabled`, asked again whenever the page becomes visible. A refusal is ignored. */
function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopped = false;
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } })
          .wakeLock;
        if (!wl || (sentinel && !sentinel.released)) return;
        const got = await wl.request('screen');
        if (stopped) void got.release().catch(() => undefined);
        else sentinel = got;
      } catch {
        // Refused (battery saver, no permission): everything else works without it.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        void sentinel?.release().catch(() => undefined);
      } catch {
        // Already released.
      }
    };
  }, [enabled]);
}

function vibrate(pattern: number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported or blocked.
  }
}

/** Where a run opens: the stored step when it still holds, else Ready at the first unlogged working set. */
export function initialRun(status: string | undefined, steps: readonly LiftStep[], stored: LiftRun | null): LiftRun {
  if (status !== 'active') return FRESH_RUN;
  if (stored && stored.phase !== 'start') {
    if (stored.phase === 'warmup' || stored.phase === 'cooldown') return stored;
    // The rest after the last working set, which has no Up next: its set is the one logged.
    if (stored.phase === 'rest' && stored.restFor !== null && stored.restFor === stored.stepIndex) {
      const done = steps[stored.stepIndex];
      if (done && isStepLogged(done.row) && nextIndex(steps, stored.stepIndex) < 0 && stored.restStartedAt !== null)
        return stored;
    }
    const step = steps[stored.stepIndex];
    if (step && !isStepLogged(step.row) && (stored.phase !== 'set' || stored.setStartedAt !== null)) {
      if (stored.phase !== 'rest' || stored.restStartedAt !== null) return stored;
    }
  }
  const idx = nextIndex(steps, -1);
  const base = {
    ...FRESH_RUN,
    sessionStartedAt: stored?.sessionStartedAt ?? null,
    notes: stored?.notes ?? '',
    sessionEffort: stored?.sessionEffort ?? '',
  };
  return idx >= 0 ? { ...base, phase: 'ready', stepIndex: idx } : { ...base, phase: 'cooldown' };
}

/**
 * Whether Lift Mode opens on the summary: an active workout with no run in
 * progress (none stored, or one reset by the tracker's Lift Mode button, #579)
 * and no working set left to do.
 */
export function opensOnSummary(
  status: string | undefined,
  steps: readonly LiftStep[],
  stored: LiftRun | null,
): boolean {
  return status === 'active' && (!stored || stored.phase === 'start') && nextIndex(steps, -1) < 0;
}

/** The warm-up or cool-down exercises as a checklist: stored rows, and (warm-up) a template's not yet stored. */
function checklistFor(
  section: 'warmup' | 'cooldown',
  rows: readonly SetWithRow[],
  workout: { template_id: string } | undefined,
): { items: (ChecklistItem & { row: SetWithRow | null; exercise_id: string; order: number; reps: string })[] } {
  const tpl = workout ? templates.value.find((t) => t.id === workout.template_id) : undefined;
  const planned = (exercise_id: string, order: number, own: string): string =>
    own ||
    tpl?.exercises.find((e) => e.section === section && e.exercise_id === exercise_id && e.order === order)?.reps ||
    '';
  const mine = rows.filter((r) => r.section === section).sort((a, b) => a.exercise_order - b.exercise_order);
  const items = mine.map((r) => {
    const reps = planned(r.exercise_id, r.exercise_order, r.planned_reps).trim();
    return {
      key: `${r.exercise_id}|${r.exercise_order}|${r.set_number}`,
      name: r.exercise_name,
      repsText: reps ? `${reps} reps` : '',
      done: r.reps !== '',
      row: r as SetWithRow | null,
      exercise_id: r.exercise_id,
      order: r.exercise_order,
      reps,
    };
  });
  if (section === 'warmup' && mine.length === 0) {
    for (const w of templateWarmupsToRestore(workout?.template_id, rows, templates.value)) {
      const reps = planned(w.exercise_id, w.exercise_order, '').trim();
      items.push({
        key: `${w.exercise_id}|${w.exercise_order}|1`,
        name: w.exercise_name,
        repsText: reps ? `${reps} reps` : '',
        done: false,
        row: null,
        exercise_id: w.exercise_id,
        order: w.exercise_order,
        reps,
      });
    }
  }
  return { items };
}

export function LiftMode({ workoutId }: { workoutId: string }) {
  const { token } = useAuth();
  const workout = workouts.value.find((w) => w.id === workoutId);
  const allSets = sets.value;
  const rows = useMemo(() => allSets.filter((s) => s.workout_id === workoutId), [allSets, workoutId]);
  const steps = useMemo(() => buildSteps(rows), [rows]);
  const active = workout?.status === 'active';

  const [run, setRun] = useState<LiftRun>(() => initialRun(workout?.status, steps, loadRun(workoutId)));
  const runRef = useRef(run);
  runRef.current = run;
  const go = useCallback(
    (patch: Partial<LiftRun>) => {
      const next = { ...runRef.current, ...patch };
      runRef.current = next;
      setRun(next);
      // Not once Lift Mode is being left: the stored run was just cleared, and stays so.
      if (next.phase !== 'start' && !leaving.current) saveRun(workoutId, next);
    },
    [workoutId],
  );

  const [starting, setStarting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** When the summary opened, which freezes its session time; null while Lift Mode is on screen. */
  const [summaryAt, setSummaryAt] = useState<number | null>(() =>
    opensOnSummary(workout?.status, steps, loadRun(workoutId)) ? Date.now() : null,
  );
  const [finishing, setFinishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState<ReadonlySet<string>>(new Set());
  const leaving = useRef(false);
  const switchingMode = useRef(false);

  const now = useNow(run.phase !== 'start');
  useWakeLock(active);

  // Leave a workout that cannot run here: gone, not a weight workout, or already finished.
  useEffect(() => {
    if (leaving.current) return;
    if (!workout) navigate('/activities');
    else if (workout.type !== 'weight') replaceRoute(`/history/${workoutId}`);
    else if (workout.status === '') replaceRoute(`/history/${workoutId}`);
  }, [workout?.status, workout?.type, !!workout, workoutId]);

  // An active workout is the app's active workout, as the tracker's resume makes it: saveSet checks against it.
  useEffect(() => {
    if (!active || !workout) return;
    batch(() => {
      activeWorkoutId.value = workoutId;
      activeWorkoutSets.value = sets.value.filter((s) => s.workout_id === workoutId);
      activeWarmupExercises.value = templateWarmupsToRestore(
        workout.template_id,
        activeWorkoutSets.value,
        templates.value,
      );
    });
  }, [active, workoutId]);

  useEffect(() => {
    if (token) void loadRestSettings(token);
  }, [token]);

  // ── Today's rest, written 800 ms after the last press ──
  const pendingRest = useRef(new Map<string, SectionValues>());
  const restTimer = useRef<ReturnType<typeof setTimeout>>();
  const restWrites = useRef<Promise<unknown>>(Promise.resolve());
  const flushRest = useCallback((): Promise<unknown> => {
    clearTimeout(restTimer.current);
    const entries = [...pendingRest.current];
    pendingRest.current.clear();
    if (entries.length === 0 || !token) return restWrites.current;
    restWrites.current = restWrites.current.then(async () => {
      for (const [section, values] of entries) {
        const current = sets.value.filter((s) => s.workout_id === workoutId);
        const patches = retargetSection(current, section, values, restSettings.value);
        if (patches.length > 0) await saveSetTimings(patches, token).catch(() => false);
      }
    });
    return restWrites.current;
  }, [token, workoutId]);
  const onRestChange = (section: string, values: SectionValues) => {
    pendingRest.current.set(section, values);
    clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => void flushRest(), REST_WRITE_DELAY_MS);
  };
  useEffect(() => () => void flushRest(), [flushRest]);

  // ── What comes next ──
  /** Opens the summary once held stepper changes (and `after`, a write in flight) are in the sheet. */
  const openSummary = useCallback(async (after?: Promise<unknown>) => {
    setShowAll(false);
    await Promise.all([flushLogDrafts(), after]);
    setSummaryAt(Date.now());
  }, []);

  /**
   * After the last working set: the cool-down checklist, or with none the
   * summary. `lastDone` is the set just finished by Done, whose rest then stays
   * on screen behind the summary for Back, without an Up next.
   */
  const afterWorking = useCallback(
    (lastDone?: { index: number; at: number; written: Promise<unknown> }) => {
      const cooldown = checklistFor(
        'cooldown',
        sets.value.filter((s) => s.workout_id === workoutId),
        workout,
      ).items;
      if (cooldown.length === 0 && lastDone) {
        go({
          phase: 'rest',
          stepIndex: lastDone.index,
          setStartedAt: null,
          restStartedAt: lastDone.at,
          restTarget: 0,
          alertedAt: null,
          restFor: lastDone.index,
        });
      } else {
        go({ phase: 'cooldown', setStartedAt: null, restStartedAt: null, restFor: null, restTarget: 0 });
      }
      // Nothing to tick off after the last set: it goes straight to the summary.
      if (cooldown.length === 0) void openSummary(lastDone?.written);
    },
    [go, workoutId, workout, openSummary],
  );

  // ── Rest alerts: once at the target, then every 30 s; none for a rest resumed past them ──
  const alerts = useRef<{ key: number | null; slot: number }>({ key: null, slot: -1 });
  const showLiftToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), TOAST_MS);
  };
  useEffect(() => {
    if (run.phase !== 'rest' || run.restStartedAt === null || summaryAt !== null) {
      alerts.current = { key: null, slot: -1 };
      return;
    }
    const slot = alertSlot(secondsSince(run.restStartedAt, now), run.restTarget);
    if (alerts.current.key !== run.restStartedAt) {
      // Entered, or reloaded into, this rest: what is already past is not announced.
      alerts.current = { key: run.restStartedAt, slot };
      return;
    }
    if (slot <= alerts.current.slot) return;
    const first = alerts.current.slot < 0;
    alerts.current.slot = slot;
    const next = steps[run.stepIndex];
    const doneStep = run.restFor !== null ? steps[run.restFor] : undefined;
    const switching = doneStep ? !doneStep.lastInRound : false;
    vibrate(first ? FIRST_ALERT : REPEAT_ALERT);
    showLiftToast(
      first
        ? switching
          ? `Switch time's up. Next: ${next?.row.exercise_name ?? ''}`
          : "Rest's up. Start when you're ready."
        : `Still resting. Next up: ${next?.row.exercise_name ?? ''}`,
    );
    go({ alertedAt: Date.now() });
  }, [now, run.phase, run.restStartedAt, summaryAt !== null]);

  // ── Transitions ──
  const timing = (index: number, patch: { set_s?: string; rest_s?: string }): Promise<unknown> => {
    const row = steps[index]?.row;
    if (!row || !token) return Promise.resolve();
    return saveSetTimings([{ sheetRow: row.sheetRow, patch }], token).catch(() => false);
  };

  const warmups = checklistFor('warmup', rows, workout).items;
  const cooldowns = checklistFor('cooldown', rows, workout).items;

  const startWorkoutNow = async () => {
    if (!token || !workout || starting) return;
    if (activeWorkoutId.value && activeWorkoutId.value !== workoutId) {
      showToast('Finish your current workout before starting a new one', 'error');
      return;
    }
    setStarting(true);
    try {
      await flushRest();
      if (workout.status === 'planned') await startPlannedWorkout(workoutId, token);
      const t = Date.now();
      if (warmups.length > 0) {
        go({ ...FRESH_RUN, phase: 'warmup', sessionStartedAt: t });
      } else {
        const first = nextIndex(buildSteps(sets.value.filter((s) => s.workout_id === workoutId)), -1);
        if (first >= 0) go({ ...FRESH_RUN, phase: 'ready', stepIndex: first, sessionStartedAt: t });
        else {
          go({ ...FRESH_RUN, phase: 'cooldown', sessionStartedAt: t });
          if (cooldowns.length === 0) void openSummary();
        }
      }
    } catch {
      // startPlannedWorkout showed its toast; the start screen stays.
    } finally {
      setStarting(false);
    }
  };

  const toggleChecklist = async (section: 'warmup' | 'cooldown', key: string) => {
    if (!token || !workout) return;
    const item = checklistFor(section, rows, workout).items.find((i) => i.key === key);
    if (!item) return;
    const done = item.done || localDone.has(key);
    // No planned reps: nothing to write, so the tick is only on this screen.
    if (!item.reps) {
      const next = new Set(localDone);
      if (done) next.delete(key);
      else next.add(key);
      setLocalDone(next);
      return;
    }
    const base: SetWithRow = item.row ?? {
      workout_id: workoutId,
      exercise_id: item.exercise_id,
      exercise_name: item.name,
      section,
      exercise_order: item.order,
      set_number: 1,
      planned_reps: '',
      weight: '',
      reps: '',
      effort: '',
      sheetRow: -1,
    };
    try {
      await saveSet({ ...base, reps: done ? '' : item.reps }, token, base.sheetRow > 0 ? base.sheetRow : -1);
    } catch {
      // saveSet showed its toast, or queued the write.
    }
  };

  const startWorkingSets = () => {
    const first = nextIndex(steps, -1);
    if (first >= 0) go({ phase: 'ready', stepIndex: first });
    else afterWorking();
  };

  const doneSet = () => {
    const step = steps[run.stepIndex];
    if (!step) return;
    const t = Date.now();
    const written = timing(run.stepIndex, {
      set_s: String(run.setStartedAt === null ? 0 : wholeSeconds(run.setStartedAt, t)),
    });
    const next = nextIndex(steps, run.stepIndex);
    if (next < 0) {
      afterWorking({ index: run.stepIndex, at: t, written });
      return;
    }
    go({
      phase: 'rest',
      stepIndex: next,
      setStartedAt: null,
      restStartedAt: t,
      restTarget: restTargetOf(step.row),
      alertedAt: null,
      restFor: run.stepIndex,
    });
  };

  const startSet = () => {
    const t = Date.now();
    if (run.restFor !== null && run.restStartedAt !== null)
      timing(run.restFor, { rest_s: String(wholeSeconds(run.restStartedAt, t)) });
    void flushLogDrafts();
    go({ phase: 'set', setStartedAt: t, restStartedAt: null, restTarget: 0, alertedAt: null, restFor: null });
  };

  const skipSet = () => {
    const next = nextIndex(steps, run.stepIndex);
    if (next >= 0) {
      go({ stepIndex: next });
      return;
    }
    // Skipping the last one ends the rest, so its time is written now.
    if (run.restFor !== null && run.restStartedAt !== null)
      timing(run.restFor, { rest_s: String(wholeSeconds(run.restStartedAt, Date.now())) });
    void flushLogDrafts();
    afterWorking();
  };

  // #579: back to the tracker on this workout. Held stepper changes land first; the running
  // set or rest clock is dropped with the stored run, so neither writes set_s or rest_s.
  const switchToLogbook = async () => {
    if (switchingMode.current) return;
    switchingMode.current = true;
    setShowAll(false);
    try {
      await flushLogDrafts();
    } finally {
      leaving.current = true;
      clearRun(workoutId);
      showToast('Switched to logbook', 'info');
      navigate(`/workout/${workoutId}`);
    }
  };

  const finish = async () => {
    if (!token || finishing) return;
    setFinishing(true);
    try {
      await flushLogDrafts();
      await finishWorkout(workoutId, runRef.current.notes, runRef.current.sessionEffort, token);
      leaving.current = true;
      clearRun(workoutId);
      navigate('/activities');
    } catch {
      // finishWorkout showed its toast; the summary stays as it is.
    } finally {
      setFinishing(false);
    }
  };

  if (!workout || workout.type !== 'weight' || workout.status === '') return null;

  // ── What is on screen ──
  const step = steps[run.stepIndex];
  const last = step ? lastTimeFor(step.row, workoutId) : { set: null, any: false };
  const sessionStart = run.sessionStartedAt ?? new Date(`${workout.date}T${workout.time || '00:00'}`).getTime();
  const clock = run.phase === 'start' ? null : formatMSS(secondsSince(sessionStart, now));
  const progress = progressOf(steps);
  const isLastSet = step ? nextIndex(steps, step.index) < 0 : false;

  const restFor = run.restFor !== null ? steps[run.restFor] : undefined;
  const switching = restFor ? !restFor.lastInRound : false;
  // The rest after the last working set: no Up next, and Finish workout in place of Start set.
  const finalRest = run.phase === 'rest' && run.restFor !== null && run.restFor === run.stepIndex;
  const restElapsed = secondsSince(run.restStartedAt, now);
  const view = restView(restElapsed, run.restTarget);

  let body: JSX.Element | null = null;
  let primary: { label: string; onClick: () => void; warn?: boolean; disabled?: boolean } | null = null;
  let secondary: { label: string; onClick: () => void; disabled?: boolean } | null = null;

  const withLocal = (items: ReturnType<typeof checklistFor>['items']): ChecklistItem[] =>
    items.map((i) => ({ key: i.key, name: i.name, repsText: i.repsText, done: i.done || localDone.has(i.key) }));

  switch (run.phase) {
    case 'start':
      body = (
        <StartScreen
          rows={rows}
          warmupNames={rows.some((r) => r.section === 'warmup') ? [] : warmups.map((w) => w.name)}
          defaults={restSettings.value}
          onRestChange={onRestChange}
        />
      );
      primary = {
        label: starting ? 'Starting…' : 'Start workout',
        onClick: () => void startWorkoutNow(),
        disabled: starting,
      };
      break;
    case 'warmup':
      body = (
        <ChecklistScreen
          section="warmup"
          hint="Tap each one when it's done"
          tip="No set or rest timer on warm-ups. The session clock is already running."
          items={withLocal(warmups)}
          onToggle={(k) => void toggleChecklist('warmup', k)}
        />
      );
      primary = {
        label: steps.length > 0 ? 'Start working sets' : cooldowns.length > 0 ? 'Start cool-down' : 'Finish workout',
        onClick: steps.length > 0 ? startWorkingSets : afterWorking,
      };
      break;
    case 'ready':
      body = step ? (
        <div class="lift-content">
          <UpNextCard step={step} last={last} inRound={false} />
          <div class="lift-tip">Working sets. Tap Start set when you're under the bar. Done starts your rest.</div>
        </div>
      ) : null;
      primary = { label: 'Start set', onClick: startSet };
      secondary = { label: 'Skip set', onClick: skipSet };
      break;
    case 'set':
      if (step) {
        const target = restTargetOf(step.row);
        const nxt = nextIndex(steps, step.index);
        const nextLine =
          nxt < 0
            ? "That's the last set. Done opens the finish."
            : !step.lastInRound && step.nextInRound
              ? `Then switch to ${step.nextInRound.row.exercise_name} (${formatMSS(target)})`
              : target > 0
                ? `Then rest ${formatMSS(target)}, next ${steps[nxt].row.exercise_name}`
                : `Then next ${steps[nxt].row.exercise_name}`;
        body = (
          <SetScreen
            step={step}
            clock={formatMSS(secondsSince(run.setStartedAt, now))}
            last={last}
            nextLine={nextLine}
          />
        );
        primary = { label: doneLabel(step, isLastSet), onClick: doneSet };
      }
      break;
    case 'rest': {
      const card = restFor
        ? roundUpTo(steps, restFor.index)
            .filter((s) => s.index === restFor.index || isStepLogged(s.row))
            .reverse()
        : [];
      const inCard = new Set(card.map((s) => s.key));
      const earlier = steps.filter((s) => !inCard.has(s.key) && isStepLogged(s.row) && !s.row.effort).length;
      body = (
        <div class="lift-content">
          <RestHero
            clock={formatMSS(restElapsed)}
            target={run.restTarget}
            label={switching ? 'Switch' : 'Rest'}
            view={view}
            final={finalRest}
          />
          {token && <LogCard items={card} workoutId={workoutId} token={token} earlierWithoutEffort={earlier} />}
          {step && !finalRest && <UpNextCard step={step} last={last} inRound={switching} />}
        </div>
      );
      if (finalRest) {
        primary = { label: 'Finish workout', onClick: () => void openSummary() };
      } else {
        primary = { label: 'Start set', onClick: startSet, warn: view.up };
        secondary = { label: 'Skip set', onClick: skipSet };
      }
      break;
    }
    case 'cooldown':
      body =
        cooldowns.length > 0 ? (
          <ChecklistScreen
            section="cooldown"
            hint="Tap each one when it's done"
            tip={null}
            items={withLocal(cooldowns)}
            onToggle={(k) => void toggleChecklist('cooldown', k)}
          />
        ) : (
          <div class="lift-content">
            <div class="lift-tip">No sets left. Finish the workout when you are done.</div>
          </div>
        );
      primary = { label: 'Finish workout', onClick: () => void openSummary() };
      break;
  }

  if (summaryAt !== null && token) {
    body = (
      <SummaryScreen
        steps={steps}
        sessionSeconds={secondsSince(sessionStart, summaryAt)}
        workoutId={workoutId}
        token={token}
        notes={run.notes}
        effort={run.sessionEffort}
        onNotes={(notes) => go({ notes })}
        onEffort={(sessionEffort) => go({ sessionEffort })}
      />
    );
    primary = { label: finishing ? 'Saving…' : 'Save workout', onClick: () => void finish(), disabled: finishing };
    secondary = { label: 'Back', onClick: () => setSummaryAt(null), disabled: finishing };
  }

  const inSets = (run.phase === 'set' || run.phase === 'rest' || run.phase === 'ready') && !finalRest;
  return (
    <div class="lift screen">
      <LiftHeader
        name={workout.name}
        clock={summaryAt !== null ? null : clock}
        done={progress.done}
        total={progress.total}
        onAllSets={run.phase === 'start' || summaryAt !== null ? null : () => setShowAll(true)}
        showProgress={summaryAt === null}
      />
      {body}
      {toast && (
        <div class="lift-toast" role="status">
          {toast}
        </div>
      )}
      {primary && (
        <div class="lift-actions">
          {secondary && (
            <button
              type="button"
              class="btn btn-secondary lift-btn lift-btn-secondary"
              onClick={secondary.onClick}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </button>
          )}
          <button
            type="button"
            class={`btn btn-primary lift-btn lift-btn-primary${primary.warn ? ' lift-btn-warn lift-pulse' : ''}`}
            onClick={primary.onClick}
            disabled={primary.disabled}
          >
            {primary.label}
          </button>
        </div>
      )}
      {showAll && token && (
        <AllSetsSheet
          steps={steps}
          current={inSets && step ? step.index : null}
          workoutId={workoutId}
          token={token}
          onClose={() => setShowAll(false)}
          onFinish={() => void openSummary()}
          onSwitch={() => void switchToLogbook()}
        />
      )}
    </div>
  );
}
