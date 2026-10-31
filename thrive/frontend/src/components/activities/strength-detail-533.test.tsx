// #533 — the completed weight workout's detail: sets ring, Set effort card and exercises as
// section cards with a tile per set.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));
vi.mock('../../router/router', async (orig) => ({
  ...(await orig<typeof import('../../router/router')>()),
  navigate: vi.fn(),
  goBack: vi.fn(),
}));

import { WorkoutDetail } from './workout-detail';
import { effortBarLabel, effortMix, strengthCells } from './strength-summary';
import { bestSetText, groupBySection, groupSetsIntoExercises, spokenSet, warmupText } from './exercise-detail';
import { workouts, sets } from '../../state/store';
import type { WorkoutWithRow, SetWithRow } from '../../api/types';

function wk(over: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    id: 'w2',
    date: '2026-10-18',
    time: '09:00',
    type: 'weight',
    name: 'Push Day',
    template_id: 't1',
    notes: '',
    elapsed_seconds: '',
    created: '',
    copied_from: '',
    status: '',
    moving_seconds: '',
    effort: '',
    distance_m: '',
    ascent_m: '',
    descent_m: '',
    avg_hr: '',
    sub_type: '',
    source: '',
    source_activity_id: '',
    raw_ref: '',
    fit_ref: '',
    fit_fetched_at: '',
    synced_at: '',
    started_at_utc: '',
    calories: '',
    estimated_seconds: '',
    sport_type: '',
    track_ref: '',
    trails: '',
    sheetRow: 2,
    ...over,
  };
}

let row = 2;
function st(over: Partial<SetWithRow> = {}): SetWithRow {
  return {
    workout_id: 'w2',
    exercise_id: 'ex1',
    exercise_name: 'Pullovers DB',
    section: 'primary',
    exercise_order: 2,
    set_number: 1,
    planned_reps: '8',
    weight: '50',
    reps: '10',
    effort: 'Medium',
    sheetRow: row++,
    ...over,
  };
}

const show = (w: WorkoutWithRow, ws: SetWithRow[] = [], all: WorkoutWithRow[] = []) => {
  workouts.value = [w, ...all];
  sets.value = ws;
  return render(h(WorkoutDetail, { workoutId: w.id }));
};

afterEach(() => {
  cleanup();
  workouts.value = [];
  sets.value = [];
});

const FULL: SetWithRow[] = [
  st({
    exercise_id: 'w1',
    exercise_name: 'Arm Circles',
    section: 'warmup',
    exercise_order: 1,
    weight: '',
    reps: '30',
    effort: '',
  }),
  st({ set_number: 1, effort: 'Medium' }),
  st({ set_number: 2, effort: 'Hard', weight: '55' }),
  st({ set_number: 3, weight: '', reps: '', effort: '' }),
  st({
    exercise_id: 'ex2',
    exercise_name: 'Cable Fly',
    section: 'SS1',
    exercise_order: 3,
    weight: '',
    reps: '12',
    effort: 'Easy',
  }),
];

describe('AC1-3: the hero card', () => {
  it('draws the ring named for logged against total sets, and the stats that have a value', () => {
    show(wk({ elapsed_seconds: '3725', moving_seconds: '3000', avg_hr: '121', calories: '' }), FULL);
    const ring = screen.getByRole('img', { name: '4 of 5 sets logged' });
    expect(ring.textContent).toContain('4');
    expect(ring.textContent).toContain('of 5 sets');
    const hero = ring.closest('.strength-hero')!;
    const labels = [...hero.querySelectorAll('.detail-stat-label')].map((l) => l.textContent);
    expect(labels).toEqual(['Time', 'Moving', 'Avg heart rate']);
    expect(screen.getByRole('img', { name: '1 hour 2 minutes' }).textContent).toBe('1:02:05');
  });

  it('leaves Moving out when it equals Time to the minute', () => {
    const cells = strengthCells(wk({ elapsed_seconds: '3600', moving_seconds: '3570' }));
    expect(cells.map((c) => c.label)).toEqual(['Time']);
  });

  it('shows the stats without a ring when there are no sets', () => {
    show(wk({ elapsed_seconds: '1800' }));
    expect(screen.queryByRole('img', { name: /sets logged/ })).toBeNull();
    expect(screen.getByText('Time')).toBeTruthy();
  });

  it('says "No details recorded" with no sets and no stats', () => {
    show(wk());
    expect(screen.getByText('No details recorded')).toBeTruthy();
  });
});

describe('AC4: the Set effort card', () => {
  it('counts logged working sets by effort and names the bar', () => {
    const mix = effortMix(FULL);
    expect(mix).toEqual({ working: 3, counts: { Easy: 1, Medium: 1, Hard: 1 }, without: 0 });
    expect(effortBarLabel(mix)).toBe('Set effort: 1 easy, 1 medium, 1 hard');
  });

  it('draws one segment per effort present, the legend with every word, and the without line', () => {
    const own = [
      st({ set_number: 1, effort: 'Medium' }),
      st({ set_number: 2, effort: 'Medium' }),
      st({ set_number: 3, effort: '' }),
    ];
    const { container } = show(wk(), own);
    expect(container.querySelectorAll('.strength-effort-segment')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Set effort: 2 medium, 1 without effort' })).toBeTruthy();
    expect(container.querySelector('.strength-effort-legend')!.textContent).toBe('Easy0Medium2Hard0');
    expect(screen.getByText('1 without effort')).toBeTruthy();
    expect(screen.getByText('3 working sets')).toBeTruthy();
  });

  it('is absent when no logged working set has an effort (warm-up efforts do not count)', () => {
    const { container } = show(wk(), [st({ section: 'warmup', effort: 'Easy' }), st({ set_number: 2, effort: '' })]);
    expect(container.querySelector('.strength-effort-card')).toBeNull();
  });
});

describe('AC5-7: section cards and set tiles', () => {
  it('groups exercises into one card per section, in workout order', () => {
    const { container } = show(wk(), FULL);
    const heads = [...container.querySelectorAll('.strength-section-heading')].map((e) => e.textContent);
    expect(heads).toEqual(['Warm-up', 'Primary', 'Superset 1']);
    expect(groupBySection(groupSetsIntoExercises(FULL)).map((c) => c.title)).toEqual([
      'Warm-up',
      'Primary',
      'Superset 1',
    ]);
  });

  it('draws a warm-up as one row with what was done', () => {
    const { container } = show(wk(), FULL);
    const warm = container.querySelector('.strength-warmup-row')!;
    expect(warm.textContent).toBe('Arm Circles30');
    expect(container.querySelectorAll('.strength-section-card')[0].querySelector('.set-tiles')).toBeNull();
    expect(warmupText([st({ weight: '', reps: '30' }), st({ weight: '', reps: '30' })])).toBe('30, 30');
    expect(warmupText([st({ weight: '20', reps: '10' })])).toBe('20 lb × 10');
    expect(warmupText([st({ weight: '', reps: '' })])).toBe('');
  });

  it('shows the top set and a tile per set, hidden from assistive technology, with a named group', () => {
    const { container } = show(wk(), FULL);
    const primary = container.querySelectorAll('.strength-section-card')[1];
    expect(primary.querySelector('.strength-exercise-top')!.textContent).toBe('55 lb × 10');
    const tiles = [...primary.querySelectorAll('.set-tile')];
    expect(tiles.map((t) => t.textContent)).toEqual(['50×10MED', '55×10HARD', '×8Not done']);
    expect(tiles.every((t) => t.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(tiles[2].classList.contains('set-tile-undone')).toBe(true);
    const group = within(primary as HTMLElement).getByRole('img');
    expect(group.getAttribute('aria-label')).toBe('Sets: 50 pounds by 10, medium; 55 pounds by 10, hard; not done');
  });

  it('shows BW for a set with reps and no weight', () => {
    const { container } = show(wk(), FULL);
    const ss = container.querySelectorAll('.strength-section-card')[2];
    expect(ss.querySelector('.strength-exercise-top')!.textContent).toBe('BW × 12');
    expect(ss.querySelector('.set-tile')!.textContent).toBe('BW×12EASY');
    expect(spokenSet(st({ weight: '', reps: '12', effort: 'Easy' }))).toBe('bodyweight by 12, easy');
  });

  it('has no expand or collapse: every set is visible', () => {
    const { container } = show(wk(), FULL);
    expect(container.querySelector('.exercise-detail-chevron')).toBeNull();
    expect(container.querySelectorAll('.set-tile')).toHaveLength(4);
  });
});

describe('AC8: the Last time chip', () => {
  const prev = wk({ id: 'w1', date: '2026-10-12', time: '09:00' });
  const prevSets = [
    st({ workout_id: 'w1', set_number: 1, weight: '45', reps: '12', effort: 'Easy' }),
    st({ workout_id: 'w1', set_number: 2, weight: '50', reps: '10', effort: 'Medium' }),
  ];

  it('is absent without a previous workout', () => {
    show(wk(), FULL);
    expect(screen.queryByRole('button', { name: 'Last time' })).toBeNull();
  });

  it('toggles a line for each exercise found in the previous workout', () => {
    const { container } = show(wk(), [...FULL, ...prevSets], [prev]);
    const chip = screen.getByRole('button', { name: 'Last time' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.last-time-line')).toBeNull();
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    const lines = [...container.querySelectorAll('.last-time-line')].map((l) => l.textContent);
    expect(lines).toEqual(['Last time (Oct 12): 50 lb × 10 · Medium']);
    fireEvent.click(chip);
    expect(container.querySelector('.last-time-line')).toBeNull();
  });

  it('uses the best set: the heaviest, the first of equals', () => {
    expect(bestSetText(prevSets)).toBe('50 lb × 10 · Medium');
    expect(bestSetText([st({ weight: '', reps: '' })])).toBe('');
  });
});
