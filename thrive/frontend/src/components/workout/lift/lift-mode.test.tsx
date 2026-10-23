// #577 — Lift Mode, driven through the real screens with the writes mocked: the
// start screen, warm-up, set and rest stopwatches, the alerts, logging during a
// rest, resuming from the stored run, and the finish.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import type { SetWithRow, WorkoutWithRow } from '../../../api/types';
import { loadRun, runKey } from './lift-run';

const startPlannedWorkout = vi.fn();
const saveSet = vi.fn(async (_set: unknown, _token: string, _row?: number) => ({}));
const saveSetTimings = vi.fn(async (_c: unknown, _token: string) => true);
const finishWorkout = vi.fn(async (..._a: unknown[]) => undefined);
const navigate = vi.fn();
const replaceRoute = vi.fn();

vi.mock('../../../state/actions', () => ({
  startPlannedWorkout: (...a: unknown[]) => startPlannedWorkout(...a),
  saveSet: (...a: [unknown, string, number?]) => saveSet(...a),
  saveSetTimings: (...a: [unknown, string]) => saveSetTimings(...a),
  finishWorkout: (...a: unknown[]) => finishWorkout(...a),
}));
vi.mock('../../../state/rest-settings', async (orig) => ({
  ...(await orig<typeof import('../../../state/rest-settings')>()),
  loadRestSettings: vi.fn(async () => true),
}));
vi.mock('../../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));
vi.mock('../../../router/router', () => ({
  navigate: (p: string) => navigate(p),
  replaceRoute: (p: string) => replaceRoute(p),
}));

const { LiftMode } = await import('./lift-mode');
const { workouts, sets, activeWorkoutId, activeWorkoutSets, templates } = await import('../../../state/store');

const W = 'w1';
let rowNo = 2;
function mk(section: string, order: number, name: string, n: number, extra: Partial<SetWithRow> = {}): SetWithRow {
  return {
    workout_id: W,
    exercise_id: `ex_${name.replace(/\s/g, '')}`,
    exercise_name: name,
    section,
    exercise_order: order,
    set_number: n,
    planned_reps: '8',
    weight: '',
    reps: '',
    effort: '',
    rest_target_s: '',
    set_s: '',
    rest_s: '',
    sheetRow: rowNo++,
    ...extra,
  };
}

function plan(): SetWithRow[] {
  rowNo = 2;
  return [
    mk('warmup', 1, 'Arm Circles', 1, { planned_reps: '' }),
    mk('primary', 2, 'OH Press', 1, { rest_target_s: '90', weight: '90' }),
    mk('primary', 2, 'OH Press', 2, { rest_target_s: '90', weight: '90' }),
    mk('SS1', 3, 'Arnold', 1, { rest_target_s: '15' }),
    mk('SS1', 4, 'Lateral', 1, { rest_target_s: '45' }),
  ];
}

function workout(status: string): WorkoutWithRow {
  return {
    id: W,
    date: '2026-10-22',
    time: '10:00',
    type: 'weight',
    name: 'Upper Push B',
    template_id: 'tpl_b',
    notes: '',
    elapsed_seconds: '',
    created: '',
    copied_from: '',
    status,
    sheetRow: 2,
  } as WorkoutWithRow;
}

/** A plan with no warm-up rows and a template with no warm-up to restore, as a workout without one is. */
const withoutWarmup = (set: () => void) => {
  templates.value = [];
  set();
};
const text = (c: Element) => c.textContent ?? '';
const byText = (c: Element, label: string, sel = 'button') =>
  [...c.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.trim() === label);
const click = async (c: Element, label: string) => {
  const el = byText(c, label);
  if (!el) throw new Error(`No button "${label}" in: ${text(c)}`);
  fireEvent.click(el);
  await act(async () => {
    await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
const clock = (c: Element, role = 'timer') => c.querySelector(`[role="${role}"]`)?.textContent;

const vibrate = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-22T10:00:00'));
  vi.clearAllMocks();
  // As the real saveSetTimings does: the store follows the write.
  saveSetTimings.mockImplementation(async (changes) => {
    for (const { sheetRow, patch } of changes as { sheetRow: number; patch: Partial<SetWithRow> }[])
      sets.value = sets.value.map((s) => (s.sheetRow === sheetRow ? { ...s, ...patch } : s));
    return true;
  });
  window.localStorage.clear();
  templates.value = [
    {
      id: 'tpl_b',
      name: 'Upper Push B',
      exercises: [
        {
          template_id: 'tpl_b',
          template_name: 'Upper Push B',
          order: 1,
          exercise_id: 'ex_ArmCircles',
          exercise_name: 'Arm Circles',
          section: 'warmup',
          sets: '',
          reps: '8',
          sheetRow: 2,
        },
      ],
    } as never,
  ];
  workouts.value = [workout('planned')];
  sets.value = plan();
  activeWorkoutId.value = null;
  activeWorkoutSets.value = [];
  startPlannedWorkout.mockImplementation(async () => {
    workouts.value = [workout('active')];
    activeWorkoutId.value = W;
    return W;
  });
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the start screen', () => {
  it('shows the plan by section, with the rest of each timed section and the watch tip', () => {
    const { container } = render(<LiftMode workoutId={W} />);
    expect(text(container)).toContain('Warm-up');
    expect(text(container)).toContain('Untimed');
    expect(text(container)).toContain('2 × 8 · 90 lb');
    expect(text(container)).toContain('Rest between sets');
    expect(text(container)).toContain('Rest after each round');
    expect(text(container)).toContain('Switch between exercises');
    expect(text(container)).toContain('start a Strength activity');
    // No session clock yet.
    expect(container.querySelector('.lift-session-clock')).toBeNull();
    expect(container.querySelector('.lift-progress')?.getAttribute('aria-label')).toBe('0 of 4 sets done');
  });

  it('writes only this workout rest, 800 ms after the last press', async () => {
    const { container } = render(<LiftMode workoutId={W} />);
    const more = container.querySelector<HTMLElement>(
      '[aria-label="Primary rest for this workout"] [aria-label="More rest"]',
    )!;
    fireEvent.click(more);
    fireEvent.click(more);
    await advance(799);
    expect(saveSetTimings).not.toHaveBeenCalled();
    await advance(2);
    expect(saveSetTimings).toHaveBeenCalledTimes(1);
    const changes = saveSetTimings.mock.calls[0][0] as { sheetRow: number; patch: { rest_target_s: string } }[];
    expect(changes.map((c) => c.patch.rest_target_s)).toEqual(['120', '120']);
    expect(changes.map((c) => c.sheetRow)).toEqual([3, 4]);
  });

  it('Start workout starts the plan and shows the warm-up with the session clock at 0:00', async () => {
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    expect(startPlannedWorkout).toHaveBeenCalledWith(W, 'tok');
    expect(text(container)).toContain('Tap each one when it&apos;s done'.replace('&apos;', "'"));
    expect(container.querySelector('.lift-session-clock')?.textContent).toBe('0:00');
    expect(container.querySelector('[role="timer"]')).toBeNull();
    expect(loadRun(W)?.phase).toBe('warmup');
  });
});

describe('the warm-up', () => {
  it('ticking writes the planned reps and unticking clears them', async () => {
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    const item = container.querySelector<HTMLElement>('.lift-check')!;
    expect(item.getAttribute('aria-pressed')).toBe('false');
    expect(text(item)).toContain('8 reps');
    fireEvent.click(item);
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSet).toHaveBeenLastCalledWith(
      expect.objectContaining({ exercise_name: 'Arm Circles', reps: '8' }),
      'tok',
      2,
    );
    // The store follows the write, as saveSet does.
    sets.value = sets.value.map((s) => (s.sheetRow === 2 ? { ...s, reps: '8' } : s));
    await advance(300);
    expect(container.querySelector('.lift-check')!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(container.querySelector('.lift-check')!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSet).toHaveBeenLastCalledWith(expect.objectContaining({ reps: '' }), 'tok', 2);
  });

  it('Start working sets shows the first working set as Up next', async () => {
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start working sets');
    expect(text(container)).toContain('UP NEXT');
    expect(text(container)).toContain('OH Press');
    expect(text(container)).toContain('Set 1 of 2');
    expect(text(container)).toContain('Working sets. Tap Start set');
  });

  it('a workout with no warm-up goes straight to its first working set', async () => {
    withoutWarmup(() => (sets.value = plan().slice(1)));
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    expect(text(container)).toContain('UP NEXT');
    expect(text(container)).toContain('OH Press');
  });
});

describe('a set and its rest', () => {
  async function startFirstSet() {
    withoutWarmup(() => (sets.value = plan().slice(1)));
    const view = render(<LiftMode workoutId={W} />);
    await click(view.container, 'Start workout');
    await click(view.container, 'Start set');
    return view;
  }

  it('the set screen shows the badge, the target, a clock from 0:00 and the Done label', async () => {
    const { container } = await startFirstSet();
    expect(text(container)).toContain('Primary');
    expect(container.querySelector('.lift-exercise')?.textContent).toBe('OH Press');
    expect(text(container)).toContain('Set 1 of 2 · 8 reps · 90 lb');
    expect(text(container)).toContain('First time doing this exercise');
    expect(text(container)).toContain('Then rest 1:30, next OH Press');
    expect(clock(container)).toBe('0:00');
    expect(byText(container, 'Done · rest 1:30')).toBeDefined();
    await advance(41_000);
    expect(clock(container)).toBe('0:41');
  });

  it('Done writes set_s and starts a rest clock at 0:00 labelled Rest', async () => {
    const { container } = await startFirstSet();
    await advance(41_000);
    await click(container, 'Done · rest 1:30');
    expect(saveSetTimings).toHaveBeenCalledWith([{ sheetRow: 3, patch: { set_s: '41' } }], 'tok');
    expect(clock(container)).toBe('0:00');
    expect(container.querySelector('.lift-hero-label')?.textContent).toBe('Rest');
    expect(text(container)).toContain('Target 1:30');
    expect(text(container)).toContain('Counting until you start the next set');
    expect(text(container)).toContain('Log the set you just did');
    expect(text(container)).toContain('UP NEXT');
  });

  it("Rest's up: vibrates, turns warning, counts overtime and repeats every 30 s without advancing", async () => {
    const { container } = await startFirstSet();
    await click(container, 'Done · rest 1:30');
    await advance(89_000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(container.querySelector('.lift-hero-up')).toBeNull();
    await advance(2_500);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenLastCalledWith([200, 100, 200]);
    expect(container.querySelector('.lift-hero-label')?.textContent).toBe("Rest's up");
    expect(container.querySelector('.lift-hero-up')).not.toBeNull();
    expect(container.querySelector('.lift-overtime')?.textContent).toBe('+0:01');
    expect(container.querySelector('.lift-btn-warn')?.textContent).toBe('Start set');
    expect(container.querySelector('.lift-toast')?.textContent).toBe("Rest's up. Start when you're ready.");
    await advance(30_000);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenLastCalledWith([120]);
    expect(container.querySelector('.lift-hero-up')).not.toBeNull();
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('2:01');
  });

  it('a target of blank never alerts', async () => {
    withoutWarmup(
      () =>
        (sets.value = plan()
          .slice(1)
          .map((s) => ({ ...s, rest_target_s: '' }))),
    );
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start set');
    expect(byText(container, 'Done')).toBeDefined();
    await click(container, 'Done');
    await advance(600_000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(container.querySelector('.lift-hero-up')).toBeNull();
  });

  it('Start set writes rest_s, including overtime, to the set before the rest', async () => {
    const { container } = await startFirstSet();
    await click(container, 'Done · rest 1:30');
    await advance(121_000);
    saveSetTimings.mockClear();
    await click(container, 'Start set');
    expect(saveSetTimings).toHaveBeenCalledWith([{ sheetRow: 3, patch: { rest_s: '121' } }], 'tok');
    expect(container.querySelector('.lift-exercise')?.textContent).toBe('OH Press');
    expect(text(container)).toContain('Set 2 of 2');
    expect(clock(container)).toBe('0:00');
  });

  it('Skip set leaves the next set unlogged and the rest clock running', async () => {
    const { container } = await startFirstSet();
    await click(container, 'Done · rest 1:30');
    await advance(10_000);
    await click(container, 'Skip set');
    // Set 2 is passed over: the rest goes on, and Up next is the following set (the superset's A).
    expect(container.querySelector('.lift-next-exercise')?.textContent).toBe('Arnold');
    expect(clock(container)).toBe('0:10');
    expect(container.querySelector('.lift-hero-label')?.textContent).toBe('Rest');
    const skipped = sets.value.find((s) => s.sheetRow === 4)!;
    expect(skipped.reps).toBe('');
    expect(skipped.set_s).toBe('');
  });

  it('Done inside a round reads switch, and the rest after it is a Switch', async () => {
    withoutWarmup(() => (sets.value = plan().slice(3)));
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start set');
    expect(text(container)).toContain('Superset 1 · A');
    expect(text(container)).toContain('Then switch to Lateral (0:15)');
    await click(container, 'Done · switch');
    expect(container.querySelector('.lift-hero-label')?.textContent).toBe('Switch');
    expect(text(container)).toContain('SWITCH TO');
    expect(container.querySelector('.lift-next-round')).not.toBeNull();
    expect(container.querySelector('.lift-next-exercise')?.textContent).toBe('Lateral');
  });
});

describe('logging during a rest', () => {
  async function toRest() {
    withoutWarmup(() => (sets.value = plan().slice(1)));
    const view = render(<LiftMode workoutId={W} />);
    await click(view.container, 'Start workout');
    await click(view.container, 'Start set');
    await advance(30_000);
    await click(view.container, 'Done · rest 1:30');
    return view;
  }

  it('an effort tap saves weight, reps and effort through saveSet on the set own row', async () => {
    const { container } = await toRest();
    await click(container, 'Hard');
    expect(saveSet).toHaveBeenCalledTimes(1);
    expect(saveSet).toHaveBeenCalledWith(
      expect.objectContaining({ exercise_name: 'OH Press', set_number: 1, weight: '90', reps: '8', effort: 'Hard' }),
      'tok',
      3,
    );
  });

  it('steppers move by 5 at 20 lb and above and hold until an effort or leaving', async () => {
    const { container } = await toRest();
    fireEvent.click(container.querySelector('[aria-label="OH Press weight"] [aria-label="More OH Press weight"]')!);
    fireEvent.click(container.querySelector('[aria-label="OH Press reps"] [aria-label="Less OH Press reps"]')!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSet).not.toHaveBeenCalled();
    expect(container.querySelector('.lift-log-item')?.textContent).toContain('95');
    expect(container.querySelector('.lift-log-item')?.textContent).toContain('7');
    // Leaving the card writes what was held, unlogged effort and all.
    await click(container, 'Start set');
    expect(saveSet).toHaveBeenCalledTimes(1);
    expect(saveSet).toHaveBeenCalledWith(expect.objectContaining({ weight: '95', reps: '7', effort: '' }), 'tok', 3);
  });

  it('leaving a set unlogged never blocks Start set', async () => {
    const { container } = await toRest();
    await click(container, 'Start set');
    expect(saveSet).not.toHaveBeenCalled();
    expect(container.querySelector('.lift-exercise')?.textContent).toBe('OH Press');
  });

  it('the last working set opens the summary rather than a rest', async () => {
    withoutWarmup(() => (sets.value = plan().slice(3)));
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start set');
    await click(container, 'Done · switch');
    await click(container, 'Start set');
    await click(container, 'Done · finish');
    // The last set opens the summary rather than a rest or the finish modal.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(text(container)).toContain('Session effort');
  });
});

describe('the log card for a round', () => {
  it('lists the round newest first and counts earlier sets without effort', async () => {
    withoutWarmup(() => {
      rowNo = 2;
      sets.value = [
        mk('SS1', 1, 'Arnold', 1, { rest_target_s: '15' }),
        mk('SS1', 1, 'Arnold', 2, { rest_target_s: '15' }),
        mk('SS1', 2, 'Lateral', 1, { rest_target_s: '45' }),
        mk('SS1', 2, 'Lateral', 2, { rest_target_s: '45' }),
      ];
    });
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start set');
    await click(container, 'Done · switch');
    // One set so far: its own heading, and the switch is the rest being taken.
    expect(text(container)).toContain('Log the set you just did');
    await click(container, 'Start set');
    await click(container, 'Done · rest 0:45');
    expect(text(container)).toContain('Log this round');
    const names = [...container.querySelectorAll('.lift-log-head strong')].map((n) => n.textContent);
    expect(names).toEqual(['Lateral', 'Arnold']);
    // Tapping an effort on Lateral leaves Arnold set 1 as the one earlier set without one.
    expect(text(container)).not.toContain('earlier set');
    await click(container, 'Start set');
    await click(container, 'Done · switch');
    expect(text(container)).toContain('2 earlier sets without effort. They');
  });
});

describe('resuming', () => {
  it('a reload mid-rest returns to the same step, with the clock from the stored time and Rest is up at once', async () => {
    withoutWarmup(
      () =>
        (sets.value = plan()
          .slice(1)
          .map((s, i) => (i === 0 ? { ...s, set_s: '30' } : s))),
    );
    workouts.value = [workout('active')];
    const restStartedAt = Date.now() - 210_000;
    window.localStorage.setItem(
      runKey(W),
      JSON.stringify({
        phase: 'rest',
        stepIndex: 1,
        setStartedAt: null,
        restStartedAt,
        restTarget: 90,
        alertedAt: null,
        restFor: 0,
        sessionStartedAt: restStartedAt - 60_000,
      }),
    );
    const { container } = render(<LiftMode workoutId={W} />);
    await advance(300);
    expect(container.querySelector('[role="timer"]')?.textContent).toBe('3:30');
    expect(container.querySelector('.lift-hero-label')?.textContent).toBe("Rest's up");
    expect(container.querySelector('.lift-overtime')?.textContent).toBe('+2:00');
    // Resuming past the target does not announce it again.
    expect(vibrate).not.toHaveBeenCalled();
    expect(container.querySelector('.lift-session-clock')?.textContent).toBe('4:30');
    expect(activeWorkoutId.value).toBe(W);
  });

  it('with the stored state gone it resumes at the first unlogged working set with no clock running', async () => {
    withoutWarmup(
      () =>
        (sets.value = plan()
          .slice(1)
          .map((s, i) => (i === 0 ? { ...s, reps: '8', weight: '90', effort: 'Easy' } : s))),
    );
    workouts.value = [workout('active')];
    const { container } = render(<LiftMode workoutId={W} />);
    expect(text(container)).toContain('UP NEXT');
    expect(text(container)).toContain('Set 2 of 2');
    expect(container.querySelector('[role="timer"]')).toBeNull();
  });

  it('a stored step that is already logged falls back to the first unlogged set', async () => {
    withoutWarmup(
      () =>
        (sets.value = plan()
          .slice(1)
          .map((s, i) => (i === 0 ? { ...s, reps: '8' } : s))),
    );
    workouts.value = [workout('active')];
    window.localStorage.setItem(
      runKey(W),
      JSON.stringify({
        phase: 'set',
        stepIndex: 0,
        setStartedAt: Date.now() - 5000,
        restStartedAt: null,
        restTarget: 0,
        alertedAt: null,
        restFor: null,
        sessionStartedAt: Date.now() - 9000,
      }),
    );
    const { container } = render(<LiftMode workoutId={W} />);
    expect(text(container)).toContain('UP NEXT');
    expect(container.querySelector('[role="timer"]')).toBeNull();
  });
});

describe('the wake lock', () => {
  it('is requested on an active workout, again when the page becomes visible, and released on leaving', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ released: true, release }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    workouts.value = [workout('active')];
    const { unmount } = render(<LiftMode workoutId={W} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith('screen');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(release).toHaveBeenCalled();
  });

  it('is not requested for a plan that has not started, and a refusal changes nothing', async () => {
    const request = vi.fn(async () => {
      throw new Error('refused');
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { container, unmount } = render(<LiftMode workoutId={W} />);
    expect(request).not.toHaveBeenCalled();
    unmount();
    cleanup();
    workouts.value = [workout('active')];
    const again = render(<LiftMode workoutId={W} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalled();
    expect(text(again.container)).toContain('UP NEXT');
    expect(container).toBeDefined();
  });
});

describe('the summary', () => {
  /** An active workout: OH Press 1 and 2 done, Arnold skipped past, Lateral still to come. */
  function mid() {
    withoutWarmup(() => {
      sets.value = plan()
        .slice(1)
        .map((r, i) =>
          i === 0
            ? { ...r, reps: '8', weight: '90', effort: 'Easy' as const, set_s: '40', rest_s: '100' }
            : i === 1
              ? { ...r, reps: '8', weight: '90', set_s: '35', rest_s: '70' }
              : r,
        );
    });
    workouts.value = [workout('active')];
    // As the real saveSet does: the store follows the write.
    saveSet.mockImplementation(async (set: unknown) => {
      const w = set as SetWithRow;
      sets.value = sets.value.map((r) => (r.sheetRow === w.sheetRow ? { ...r, ...w } : r));
      return w;
    });
  }
  async function openSummary(c: Element) {
    await click(c, 'All sets');
    await click(c.querySelector('[role="dialog"]')!, 'Finish workout now');
  }
  const row = (c: Element, no: number, name: string) =>
    [...c.querySelectorAll<HTMLElement>('.lift-set-row')].find(
      (r) => text(r).includes(`Set ${no}`) && text(r).includes(name),
    )!;
  const rowButton = (c: Element, no: number, name: string) => row(c, no, name).querySelector('button')!;

  it('opens from Finish workout now with the totals, the sets and no clock, bar or All sets', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await advance(47 * 60_000 + 12_000);
    await openSummary(container);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('.lift-session-clock')).toBeNull();
    expect(container.querySelector('.lift-progress')).toBeNull();
    expect(byText(container, 'All sets')).toBeUndefined();
    const tiles = [...container.querySelectorAll('.lift-tile')].map((t) => text(t));
    expect(tiles).toEqual(['47:12Session', '2/4Sets', '1:15Under the bar', '2:50Resting · avg −0:05 vs plan']);
    expect(text(container)).toContain('1 need effort');
    expect(text(row(container, 1, 'OH Press'))).toContain('90 × 8 · Easy');
    expect(text(row(container, 2, 'OH Press'))).toContain('90 × 8 · needs effort');
    expect(text(row(container, 1, 'Arnold'))).toContain('skipped');
    expect(text(row(container, 1, 'Lateral'))).toContain('skipped');
    expect(byText(container, 'Back')).toBeDefined();
    expect(byText(container, 'Save workout')).toBeDefined();
    // The session time is frozen at the moment it opened.
    await advance(60_000);
    expect(container.querySelector('.lift-tile-value')?.textContent).toBe('47:12');
  });

  it('reads a dash for a total with no data, never 0:00, and Resting alone', async () => {
    withoutWarmup(() => (sets.value = plan().slice(1)));
    workouts.value = [workout('active')];
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    const tiles = [...container.querySelectorAll('.lift-tile')].map((t) => text(t));
    expect(tiles.slice(1)).toEqual(['0/4Sets', '—Under the bar', '—Resting']);
    expect(text(container)).not.toContain('need effort');
  });

  it('tapping a row opens its editor and closes the other; tapping it again closes it', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    const first = rowButton(container, 1, 'OH Press');
    expect(first.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.lift-set-editor')).toHaveLength(1);
    fireEvent.click(rowButton(container, 2, 'OH Press'));
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(row(container, 2, 'OH Press').querySelector('.lift-set-editor')).not.toBeNull();
    expect(container.querySelectorAll('.lift-set-editor')).toHaveLength(1);
    fireEvent.click(rowButton(container, 2, 'OH Press'));
    expect(container.querySelector('.lift-set-editor')).toBeNull();
  });

  it('an effort tap writes the set through saveSet and the row text follows', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    fireEvent.click(rowButton(container, 2, 'OH Press'));
    await click(row(container, 2, 'OH Press') as Element, 'Hard');
    expect(saveSet).toHaveBeenLastCalledWith(
      expect.objectContaining({ exercise_name: 'OH Press', set_number: 2, weight: '90', reps: '8', effort: 'Hard' }),
      'tok',
      4,
    );
    expect(text(row(container, 2, 'OH Press'))).toContain('90 × 8 · Hard');
    expect(text(container)).not.toContain('need effort');
  });

  it('a stepper change is held until an effort tap or the row closes, then written', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    fireEvent.click(rowButton(container, 1, 'OH Press'));
    fireEvent.click(container.querySelector('[aria-label="More OH Press reps"]')!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSet).not.toHaveBeenCalled();
    // Opening another row closes this one, which writes what it held.
    fireEvent.click(rowButton(container, 2, 'OH Press'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSet).toHaveBeenCalledTimes(1);
    expect(saveSet).toHaveBeenCalledWith(
      expect.objectContaining({ set_number: 1, reps: '9', effort: 'Easy' }),
      'tok',
      3,
    );
    expect(text(row(container, 1, 'OH Press'))).toContain('90 × 9 · Easy');
  });

  it('a skipped set opens prefilled with the hint, and an effort logs it', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    fireEvent.click(rowButton(container, 1, 'Arnold'));
    expect(text(row(container, 1, 'Arnold'))).toContain('Tap an effort to log this set.');
    expect(text(row(container, 1, 'Arnold').querySelector('.lift-set-editor')!)).toContain('8 reps');
    await click(row(container, 1, 'Arnold') as Element, 'Medium');
    expect(saveSet).toHaveBeenCalledWith(
      expect.objectContaining({ exercise_name: 'Arnold', reps: '8', effort: 'Medium' }),
      'tok',
      5,
    );
    expect(text(row(container, 1, 'Arnold'))).toContain('BW × 8 · Medium');
    expect(text(row(container, 1, 'Arnold'))).not.toContain('Tap an effort');
  });

  it('a failed write puts the row back and keeps the summary open', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    fireEvent.click(rowButton(container, 1, 'OH Press'));
    saveSet.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    await click(row(container, 1, 'OH Press') as Element, 'Hard');
    expect(text(row(container, 1, 'OH Press'))).toContain('90 × 8 · Easy');
    const pressed = row(container, 1, 'OH Press').querySelector('[aria-pressed="true"]');
    expect(pressed?.textContent).toBe('Easy');
    expect(text(container)).toContain('Session effort');
  });

  it('Save finishes with the notes and effort typed before and after a row edit, and clears the run', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    const notes = container.querySelector<HTMLTextAreaElement>('textarea')!;
    fireEvent.input(notes, { target: { value: 'Shoulder felt good' } });
    await click(container.querySelector('[aria-label="Session"]')!, 'Hard');
    fireEvent.click(rowButton(container, 2, 'OH Press'));
    await click(row(container, 2, 'OH Press') as Element, 'Medium');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Shoulder felt good');
    await click(container, 'Save workout');
    expect(finishWorkout).toHaveBeenCalledWith(W, 'Shoulder felt good', 'Hard', 'tok');
    expect(navigate).toHaveBeenCalledWith('/activities');
    expect(window.localStorage.getItem(runKey(W))).toBeNull();
  });

  it('a failed save keeps the summary and everything typed', async () => {
    mid();
    const { container } = render(<LiftMode workoutId={W} />);
    await openSummary(container);
    fireEvent.input(container.querySelector('textarea')!, { target: { value: 'Keep me' } });
    finishWorkout.mockImplementationOnce(async () => {
      throw new Error('nope');
    });
    await click(container, 'Save workout');
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Keep me');
    expect(byText(container, 'Save workout')).toBeDefined();
  });

  it('notes and session effort survive a reload', async () => {
    mid();
    const first = render(<LiftMode workoutId={W} />);
    await openSummary(first.container);
    fireEvent.input(first.container.querySelector('textarea')!, { target: { value: 'Typed' } });
    await click(first.container.querySelector('[aria-label="Session"]')!, 'Easy');
    first.unmount();
    cleanup();
    const again = render(<LiftMode workoutId={W} />);
    await openSummary(again.container);
    expect(again.container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Typed');
    expect(again.container.querySelector('[aria-label="Session"] [aria-pressed="true"]')?.textContent).toBe('Easy');
  });

  it('Back returns to the step it came from, with the rest still counting from its Done', async () => {
    withoutWarmup(() => (sets.value = plan().slice(1)));
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start set');
    await click(container, 'Done · rest 1:30');
    await advance(20_000);
    await openSummary(container);
    await advance(15_000);
    await click(container, 'Back');
    expect(container.querySelector('.lift-hero-label')?.textContent).toBe('Rest');
    expect(clock(container)).toBe('0:35');
    expect(container.querySelector('.lift-next-exercise')?.textContent).toBe('OH Press');
  });

  it('Back from Done on the last set shows that set rest with no Up next and Finish workout', async () => {
    withoutWarmup(() => (sets.value = plan().slice(4)));
    workouts.value = [workout('active')];
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start set');
    await advance(30_000);
    await click(container, 'Done · finish');
    expect(text(container)).toContain('Session effort');
    expect(saveSetTimings).toHaveBeenCalledWith([{ sheetRow: 6, patch: { set_s: '30' } }], 'tok');
    await advance(10_000);
    await click(container, 'Back');
    expect(clock(container)).toBe('0:10');
    expect(container.querySelector('.lift-hero')).not.toBeNull();
    expect(container.querySelector('.lift-log-item')).not.toBeNull();
    expect(container.querySelector('.lift-next')).toBeNull();
    expect(byText(container, 'Start set')).toBeUndefined();
    await click(container, 'Finish workout');
    await advance(10);
    expect(text(container)).toContain('Session effort');
  });

  it('a cool-down checklist comes before the summary, and Back returns to it', async () => {
    withoutWarmup(() => {
      sets.value = [...plan().slice(4), mk('cooldown', 5, 'Quad Stretch', 1)];
    });
    workouts.value = [workout('active')];
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start set');
    await click(container, 'Done · finish');
    expect(text(container)).toContain('Cool-down');
    expect(text(container)).not.toContain('Session effort');
    await click(container, 'Finish workout');
    expect(text(container)).toContain('Session effort');
    await click(container, 'Back');
    expect(text(container)).toContain('Quad Stretch');
  });
});

describe('All sets', () => {
  it('opens sets done or skipped for editing, and keeps the one being lifted and later ones read-only', async () => {
    withoutWarmup(() => {
      sets.value = plan()
        .slice(1)
        .map((r, i) => (i === 0 ? { ...r, reps: '8', weight: '90', effort: 'Easy' as const } : r));
    });
    workouts.value = [workout('active')];
    // Ready at OH Press 2: OH Press 1 is done, 2 is lifting now, the superset is to come.
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'All sets');
    const sheet = container.querySelector('[role="dialog"]')!;
    const rows = [...sheet.querySelectorAll<HTMLElement>('.lift-set-row')];
    expect(rows.map((r) => !!r.querySelector('button'))).toEqual([true, false, false, false]);
    expect(text(rows[0])).toContain('90 × 8 · Easy');
    expect(text(rows[1])).toContain('lifting now');
    expect(text(rows[2])).toContain('8 reps');
    fireEvent.click(rows[0].querySelector('button')!);
    expect(rows[0].querySelector('.lift-set-editor')).not.toBeNull();
  });

  it('shows a set passed over as skipped, and logging it makes it done', async () => {
    withoutWarmup(() => (sets.value = plan().slice(1)));
    saveSet.mockImplementation(async (set: unknown) => {
      const w = set as SetWithRow;
      sets.value = sets.value.map((r) => (r.sheetRow === w.sheetRow ? { ...r, ...w } : r));
      return w;
    });
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start workout');
    await click(container, 'Start set');
    await click(container, 'Done · rest 1:30');
    await click(container, 'Skip set');
    await click(container, 'All sets');
    const sheet = container.querySelector('[role="dialog"]')!;
    const second = [...sheet.querySelectorAll<HTMLElement>('.lift-set-row')].find((r) => text(r).includes('Set 2'))!;
    expect(text(second)).toContain('skipped');
    fireEvent.click(second.querySelector('button')!);
    await click(second, 'Easy');
    expect(text(second)).toContain('90 × 8 · Easy');
  });
});

describe('finishing', () => {
  it('Done on the last working set opens the summary and Save finishes the workout', async () => {
    withoutWarmup(() => (sets.value = plan().slice(4)));
    workouts.value = [workout('active')];
    const { container } = render(<LiftMode workoutId={W} />);
    await click(container, 'Start set');
    expect(text(container)).toContain("That's the last set. Done opens the finish.");
    await click(container, 'Done · finish');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(container, 'Save workout');
    expect(finishWorkout).toHaveBeenCalledWith(W, '', '', 'tok');
    expect(navigate).toHaveBeenCalledWith('/activities');
    expect(window.localStorage.getItem(runKey(W))).toBeNull();
  });

  it('leaves for the list when the workout is gone', () => {
    workouts.value = [];
    render(<LiftMode workoutId={W} />);
    expect(navigate).toHaveBeenCalledWith('/activities');
  });
});
