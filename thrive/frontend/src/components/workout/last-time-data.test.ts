import { describe, it, expect } from 'vitest';
import { getLastTimeDataFrom, formatLastTimeDate, sectionKind } from './last-time-data';
import type { SetWithRow, WorkoutWithRow } from '../../api/types';
import { toLocalDateStr } from '../activities/activities-helpers';

function makeSet(overrides: Partial<SetWithRow> = {}): SetWithRow {
  return {
    workout_id: 'w1',
    exercise_id: 'ex1',
    exercise_name: 'Bench Press',
    section: 'primary',
    exercise_order: 1,
    set_number: 1,
    planned_reps: '8-10',
    weight: '135',
    reps: '10',
    effort: 'Medium',
    sheetRow: 2,
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    id: 'w1',
    date: '2026-03-10',
    time: '07:00',
    type: 'weight',
    name: 'Push A',
    template_id: '',
    notes: '',
    elapsed_seconds: '3600',
    created: '2026-03-10T07:00:00.000Z',
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
    avg_power_w: '',
    np_w: '',
    intensity_factor: '',
    tss: '',
    work_kj: '',
    ftp_w: '',
    intensity_pct: '',
    ride_workout_id: '',
    streams_ref: '',
    coros_activity_id: '',
    sheetRow: 2,
    ...overrides,
  };
}

// AC5: Data sourced from store — pure function filters correctly
describe('getLastTimeDataFrom', () => {
  // AC2: returns most recent workout's sets for the exercise
  it('returns sets from the most recent previous workout for the exercise', () => {
    const allSets: SetWithRow[] = [
      makeSet({ workout_id: 'w_old', set_number: 1, weight: '135', reps: '10', sheetRow: 2 }),
      makeSet({ workout_id: 'w_old', set_number: 2, weight: '135', reps: '8', sheetRow: 3 }),
      makeSet({ workout_id: 'w_recent', set_number: 1, weight: '185', reps: '6', sheetRow: 4 }),
      makeSet({ workout_id: 'w_recent', set_number: 2, weight: '185', reps: '5', sheetRow: 5 }),
      makeSet({ workout_id: 'w_recent', set_number: 3, weight: '185', reps: '5', effort: 'Hard', sheetRow: 6 }),
    ];
    const allWorkouts: WorkoutWithRow[] = [
      makeWorkout({ id: 'w_old', date: '2026-03-01' }),
      makeWorkout({ id: 'w_recent', date: '2026-03-10' }),
      makeWorkout({ id: 'w_current', date: '2026-03-15' }),
    ];

    const result = getLastTimeDataFrom('ex1', 'w_current', allSets, allWorkouts);
    expect(result).not.toBeNull();
    expect(result!.workoutDate).toBe('2026-03-10');
    expect(result!.sets).toHaveLength(3);
    expect(result!.sets[0].weight).toBe('185');
    expect(result!.sets[0].set_number).toBe(1);
  });

  // AC5: excludes the current workout
  it('excludes the current workout from results', () => {
    const allSets: SetWithRow[] = [
      makeSet({ workout_id: 'w_current', set_number: 1, weight: '200', sheetRow: 2 }),
      makeSet({ workout_id: 'w_prev', set_number: 1, weight: '185', sheetRow: 3 }),
    ];
    const allWorkouts: WorkoutWithRow[] = [
      makeWorkout({ id: 'w_current', date: '2026-03-15' }),
      makeWorkout({ id: 'w_prev', date: '2026-03-10' }),
    ];

    const result = getLastTimeDataFrom('ex1', 'w_current', allSets, allWorkouts);
    expect(result).not.toBeNull();
    expect(result!.workoutDate).toBe('2026-03-10');
    expect(result!.sets[0].weight).toBe('185');
  });

  // AC3: no previous data
  it('returns null when no previous sets exist for the exercise', () => {
    const allSets: SetWithRow[] = [makeSet({ workout_id: 'w_current', exercise_id: 'ex1', sheetRow: 2 })];
    const allWorkouts: WorkoutWithRow[] = [makeWorkout({ id: 'w_current', date: '2026-03-15' })];

    const result = getLastTimeDataFrom('ex1', 'w_current', allSets, allWorkouts);
    expect(result).toBeNull();
  });

  it('returns null when exercise has never been logged', () => {
    const result = getLastTimeDataFrom('ex_new', 'w_current', [], []);
    expect(result).toBeNull();
  });

  // AC2: sets sorted by set_number
  it('returns sets sorted by set_number', () => {
    const allSets: SetWithRow[] = [
      makeSet({ workout_id: 'w_prev', set_number: 3, sheetRow: 4 }),
      makeSet({ workout_id: 'w_prev', set_number: 1, sheetRow: 2 }),
      makeSet({ workout_id: 'w_prev', set_number: 2, sheetRow: 3 }),
    ];
    const allWorkouts: WorkoutWithRow[] = [
      makeWorkout({ id: 'w_prev', date: '2026-03-10' }),
      makeWorkout({ id: 'w_current', date: '2026-03-15' }),
    ];

    const result = getLastTimeDataFrom('ex1', 'w_current', allSets, allWorkouts);
    expect(result!.sets.map((s) => s.set_number)).toEqual([1, 2, 3]);
  });

  // Filters by exercise_id — other exercises excluded
  it('only includes sets for the requested exercise', () => {
    const allSets: SetWithRow[] = [
      makeSet({ workout_id: 'w_prev', exercise_id: 'ex1', set_number: 1, sheetRow: 2 }),
      makeSet({ workout_id: 'w_prev', exercise_id: 'ex2', set_number: 1, sheetRow: 3 }),
    ];
    const allWorkouts: WorkoutWithRow[] = [
      makeWorkout({ id: 'w_prev', date: '2026-03-10' }),
      makeWorkout({ id: 'w_current', date: '2026-03-15' }),
    ];

    const result = getLastTimeDataFrom('ex1', 'w_current', allSets, allWorkouts);
    expect(result!.sets).toHaveLength(1);
    expect(result!.sets[0].exercise_id).toBe('ex1');
  });

  // AC2 + AC5: works with demo data shape
  it('works with demo data shape', () => {
    const allSets: SetWithRow[] = [
      {
        workout_id: 'w_demo001',
        exercise_id: 'ex_demo001',
        exercise_name: 'Bench Press BB',
        section: 'primary',
        exercise_order: 3,
        set_number: 1,
        planned_reps: '4-6',
        weight: '185',
        reps: '6',
        effort: 'Medium',
        sheetRow: 4,
      },
      {
        workout_id: 'w_demo001',
        exercise_id: 'ex_demo001',
        exercise_name: 'Bench Press BB',
        section: 'primary',
        exercise_order: 3,
        set_number: 2,
        planned_reps: '4-6',
        weight: '185',
        reps: '5',
        effort: 'Medium',
        sheetRow: 5,
      },
      {
        workout_id: 'w_demo001',
        exercise_id: 'ex_demo001',
        exercise_name: 'Bench Press BB',
        section: 'primary',
        exercise_order: 3,
        set_number: 3,
        planned_reps: '4-6',
        weight: '185',
        reps: '5',
        effort: 'Hard',
        sheetRow: 6,
      },
      {
        workout_id: 'w_demo001',
        exercise_id: 'ex_demo001',
        exercise_name: 'Bench Press BB',
        section: 'primary',
        exercise_order: 3,
        set_number: 4,
        planned_reps: '4-6',
        weight: '185',
        reps: '4',
        effort: 'Hard',
        sheetRow: 7,
      },
    ];
    const allWorkouts: WorkoutWithRow[] = [
      {
        id: 'w_demo001',
        date: '2025-01-14',
        time: '06:30',
        type: 'weight',
        name: 'Upper Push A',
        template_id: 'tpl_demo001',
        notes: '',
        elapsed_seconds: '3720',
        created: '2025-01-14T06:30:00.000Z',
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
        avg_power_w: '',
        np_w: '',
        intensity_factor: '',
        tss: '',
        work_kj: '',
        ftp_w: '',
        intensity_pct: '',
        ride_workout_id: '',
        streams_ref: '',
        coros_activity_id: '',
        sheetRow: 2,
      },
    ];

    const result = getLastTimeDataFrom('ex_demo001', 'w_new', allSets, allWorkouts);
    expect(result).not.toBeNull();
    expect(result!.workoutDate).toBe('2025-01-14');
    expect(result!.sets).toHaveLength(4);
    expect(result!.sets[3].effort).toBe('Hard');
  });
});

describe('sectionKind (#817)', () => {
  it('has three kinds: warm-up, cool-down, and every working section', () => {
    expect(sectionKind('warmup')).toBe('warmup');
    expect(sectionKind('cooldown')).toBe('cooldown');
    for (const s of ['primary', 'SS1', 'SS2', 'SS3', 'burnout']) expect(sectionKind(s)).toBe('working');
  });
});

// #817 — last time is one slot (an exercise's rows at one exercise_order), never a merge.
// The Oct 21 case: OH Press BB was a warm-up at order 4 (nothing logged) and the primary at order 5.
describe('getLastTimeDataFrom: one slot (#817)', () => {
  const OH = { exercise_id: 'ex_oh', exercise_name: 'OH Press BB' };
  const warmup = (workout_id: string, extra: Partial<SetWithRow> = {}) =>
    makeSet({
      ...OH,
      workout_id,
      section: 'warmup',
      exercise_order: 4,
      set_number: 1,
      planned_reps: '',
      weight: '',
      reps: '',
      effort: '',
      ...extra,
    });
  const working = (
    workout_id: string,
    section: string,
    order: number,
    n: number,
    weight: string,
    reps: string,
    effort: SetWithRow['effort'],
  ) => makeSet({ ...OH, workout_id, section, exercise_order: order, set_number: n, weight, reps, effort });
  const primary = (workout_id: string) => [
    working(workout_id, 'primary', 5, 1, '90', '8', 'Easy'),
    working(workout_id, 'primary', 5, 2, '90', '8', 'Medium'),
    working(workout_id, 'primary', 5, 3, '90', '8', 'Hard'),
    working(workout_id, 'primary', 5, 4, '90', '6', 'Hard'),
  ];
  const wk = (id: string, date: string) => makeWorkout({ id, date });
  const figures = (r: ReturnType<typeof getLastTimeDataFrom>) =>
    r!.sets.map((s) => `${s.set_number}:${s.weight || 'BW'}x${s.reps || '?'}`);

  const OCT21 = [warmup('w_oct21'), ...primary('w_oct21')];
  const base = [wk('w_oct21', '2026-10-21'), wk('w_now', '2026-11-04')];

  it('gives a primary only the primary slot: four sets, numbered 1-4, no warm-up row', () => {
    const result = getLastTimeDataFrom('ex_oh', 'w_now', OCT21, base, 'primary');
    expect(result!.workoutDate).toBe('2026-10-21');
    expect(figures(result)).toEqual(['1:90x8', '2:90x8', '3:90x8', '4:90x6']);
  });

  it('gives a warm-up only the warm-up slot, whatever the primary did', () => {
    const result = getLastTimeDataFrom('ex_oh', 'w_now', OCT21, base, 'warmup');
    expect(result!.workoutDate).toBe('2026-10-21');
    expect(result!.sets).toHaveLength(1);
    expect(result!.sets[0].section).toBe('warmup');
    expect(figures(result)).toEqual(['1:BWx?']);
  });

  it('gives a warm-up with reps logged that one set', () => {
    const logged = [warmup('w_oct21', { reps: '8' }), ...primary('w_oct21')];
    const result = getLastTimeDataFrom('ex_oh', 'w_now', logged, base, 'warmup');
    expect(figures(result)).toEqual(['1:BWx8']);
  });

  it('looks further back for a primary past a workout where the exercise was only a warm-up', () => {
    const allSets = [...OCT21, warmup('w_oct28')];
    const allWorkouts = [...base, wk('w_oct28', '2026-10-28')];
    const result = getLastTimeDataFrom('ex_oh', 'w_now', allSets, allWorkouts, 'primary');
    expect(result!.workoutDate).toBe('2026-10-21');
    expect(figures(result)).toEqual(['1:90x8', '2:90x8', '3:90x8', '4:90x6']);
  });

  it('looks further back for a warm-up past a workout where the exercise was only worked', () => {
    const allSets = [warmup('w_oct14'), ...primary('w_oct21')];
    const allWorkouts = [wk('w_oct14', '2026-10-14'), ...base];
    const result = getLastTimeDataFrom('ex_oh', 'w_now', allSets, allWorkouts, 'warmup');
    expect(result!.workoutDate).toBe('2026-10-14');
    expect(result!.sets[0].section).toBe('warmup');
  });

  it('has no last time for a primary when the exercise was only ever a warm-up', () => {
    expect(getLastTimeDataFrom('ex_oh', 'w_now', [warmup('w_oct21')], base, 'primary')).toBeNull();
  });

  it('has no last time for a warm-up when the exercise was only ever worked', () => {
    expect(getLastTimeDataFrom('ex_oh', 'w_now', primary('w_oct21'), base, 'warmup')).toBeNull();
  });

  it('matches working sections to each other: SS1 last time, primary now', () => {
    const ss1 = [working('w_oct21', 'SS1', 3, 1, '40', '12', 'Easy'), working('w_oct21', 'SS1', 3, 2, '40', '10', '')];
    const result = getLastTimeDataFrom('ex_oh', 'w_now', ss1, base, 'primary');
    expect(result!.workoutDate).toBe('2026-10-21');
    expect(figures(result)).toEqual(['1:40x12', '2:40x10']);
  });

  describe('the exercise in two working sections of the earlier workout', () => {
    const both = [
      working('w_oct21', 'burnout', 8, 1, '30', '15', 'Hard'),
      working('w_oct21', 'burnout', 8, 2, '30', '12', 'Hard'),
      ...primary('w_oct21'),
    ];

    it("takes the slot in today's section when it is among them", () => {
      expect(figures(getLastTimeDataFrom('ex_oh', 'w_now', both, base, 'primary'))).toEqual([
        '1:90x8',
        '2:90x8',
        '3:90x8',
        '4:90x6',
      ]);
      expect(figures(getLastTimeDataFrom('ex_oh', 'w_now', both, base, 'burnout'))).toEqual(['1:30x15', '2:30x12']);
    });

    it("takes the lowest-order working slot when today's section is not among them", () => {
      const result = getLastTimeDataFrom('ex_oh', 'w_now', both, base, 'SS1');
      expect(result!.sets.every((s) => s.section === 'primary')).toBe(true);
      expect(figures(result)).toEqual(['1:90x8', '2:90x8', '3:90x8', '4:90x6']);
    });

    it('never shows two slots together, so no set number repeats', () => {
      const result = getLastTimeDataFrom('ex_oh', 'w_now', both, base, 'SS2');
      const numbers = result!.sets.map((s) => s.set_number);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(new Set(result!.sets.map((s) => s.exercise_order)).size).toBe(1);
    });
  });

  it('picks the match by section kind, not by whether anything was logged', () => {
    const abandoned = [warmup('w_oct28'), working('w_oct28', 'primary', 5, 1, '', '', '')];
    const allWorkouts = [...base, wk('w_oct28', '2026-10-28')];
    const result = getLastTimeDataFrom('ex_oh', 'w_now', [...OCT21, ...abandoned], allWorkouts, 'primary');
    expect(result!.workoutDate).toBe('2026-10-28');
    expect(figures(result)).toEqual(['1:BWx?']);
  });

  it('treats a cool-down as its own kind', () => {
    const cool = [warmup('w_oct21', { section: 'cooldown', exercise_order: 9 }), ...primary('w_oct21')];
    expect(getLastTimeDataFrom('ex_oh', 'w_now', cool, base, 'cooldown')!.sets[0].section).toBe('cooldown');
    expect(getLastTimeDataFrom('ex_oh', 'w_now', cool, base, 'primary')!.sets[0].section).toBe('primary');
  });

  it('never takes the current workout, with or without a section', () => {
    const allSets = [...primary('w_now'), warmup('w_now')];
    expect(getLastTimeDataFrom('ex_oh', 'w_now', allSets, base, 'primary')).toBeNull();
    expect(getLastTimeDataFrom('ex_oh', 'w_now', allSets, base)).toBeNull();
  });

  describe('with no section (the Exercises screen)', () => {
    it('shows the working slot, not the warm-up row', () => {
      const result = getLastTimeDataFrom('ex_oh', '', OCT21, base);
      expect(result!.workoutDate).toBe('2026-10-21');
      expect(figures(result)).toEqual(['1:90x8', '2:90x8', '3:90x8', '4:90x6']);
    });

    it('prefers an older working slot to a newer warm-up', () => {
      const allSets = [...primary('w_oct21'), warmup('w_oct28')];
      const allWorkouts = [...base, wk('w_oct28', '2026-10-28')];
      const result = getLastTimeDataFrom('ex_oh', '', allSets, allWorkouts);
      expect(result!.workoutDate).toBe('2026-10-21');
      expect(result!.sets.every((s) => s.section === 'primary')).toBe(true);
    });

    it('shows the most recent warm-up slot for an exercise that was only ever a warm-up', () => {
      const allSets = [warmup('w_oct14'), warmup('w_oct21', { reps: '10' })];
      const allWorkouts = [wk('w_oct14', '2026-10-14'), ...base];
      const result = getLastTimeDataFrom('ex_oh', '', allSets, allWorkouts);
      expect(result!.workoutDate).toBe('2026-10-21');
      expect(figures(result)).toEqual(['1:BWx10']);
    });

    it('shows a cool-down slot for an exercise that was only ever a cool-down', () => {
      const cool = [warmup('w_oct21', { section: 'cooldown', exercise_order: 9, reps: '30' })];
      expect(figures(getLastTimeDataFrom('ex_oh', '', cool, base))).toEqual(['1:BWx30']);
    });

    it('still has no data for an exercise never done', () => {
      expect(getLastTimeDataFrom('ex_none', '', OCT21, base)).toBeNull();
    });
  });
});

// AC2: date formatting with relative age
describe('formatLastTimeDate', () => {
  it('formats a date with relative age', () => {
    // Use a fixed date far in the past so the test is stable
    const result = formatLastTimeDate('2020-01-15');
    expect(result).toMatch(/Jan 15, 2020/);
    expect(result).toMatch(/\(\d+ days ago\)/);
  });

  it('shows "today" for current date', () => {
    const dateStr = toLocalDateStr(new Date());
    const result = formatLastTimeDate(dateStr);
    expect(result).toContain('(today)');
  });

  it('shows "yesterday" for one day ago', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = toLocalDateStr(yesterday);
    const result = formatLastTimeDate(dateStr);
    expect(result).toContain('(yesterday)');
  });
});

// #823 — a planned workout (scheduled, not started) is never last time, whatever its date.
// Fixture, today Thursday 2026-11-05: X was finished on Oct 30 (4 sets at 130 lb), and a plan has X
// at 135 lb x 4 with no reps and no effort.
describe('getLastTimeDataFrom: a planned workout is never last time (#823)', () => {
  const X = { exercise_id: 'ex_x', exercise_name: 'Squat BB' };
  const finished = (workout_id: string) =>
    [1, 2, 3, 4].map((n) =>
      makeSet({ ...X, workout_id, section: 'primary', exercise_order: 1, set_number: n, weight: '130', reps: '5' }),
    );
  const plan = (workout_id: string) =>
    [1, 2, 3, 4].map((n) =>
      makeSet({
        ...X,
        workout_id,
        section: 'primary',
        exercise_order: 1,
        set_number: n,
        weight: '135',
        reps: '',
        effort: '',
        planned_reps: '5',
      }),
    );
  const wk = (id: string, date: string, status = '') => makeWorkout({ id, date, status });
  const oct30 = wk('w_oct30', '2026-10-30');
  const weights = (r: ReturnType<typeof getLastTimeDataFrom>) => r!.sets.map((s) => `${s.weight}x${s.reps || '?'}`);

  it("reads the Oct 30 sets, not today's plan, with no section (the Exercises screen)", () => {
    const allSets = [...finished('w_oct30'), ...plan('w_today')];
    const allWorkouts = [oct30, wk('w_today', '2026-11-05', 'planned')];
    const result = getLastTimeDataFrom('ex_x', '', allSets, allWorkouts);
    expect(result!.workoutDate).toBe('2026-10-30');
    expect(weights(result)).toEqual(['130x5', '130x5', '130x5', '130x5']);
  });

  it('reads the Oct 30 sets past a plan dated a week ahead, so no negative days ago can appear', () => {
    const allSets = [...finished('w_oct30'), ...plan('w_nov12')];
    const allWorkouts = [oct30, wk('w_nov12', '2026-11-12', 'planned')];
    const result = getLastTimeDataFrom('ex_x', '', allSets, allWorkouts);
    expect(result!.workoutDate).toBe('2026-10-30');
  });

  it('reads the Oct 30 sets for Logbook, which logs a different workout, past a later plan', () => {
    const allSets = [...finished('w_oct30'), ...plan('w_nov12')];
    const allWorkouts = [oct30, wk('w_now', '2026-11-05', 'active'), wk('w_nov12', '2026-11-12', 'planned')];
    const result = getLastTimeDataFrom('ex_x', 'w_now', allSets, allWorkouts, 'primary');
    expect(result!.workoutDate).toBe('2026-10-30');
    expect(weights(result)).toEqual(['130x5', '130x5', '130x5', '130x5']);
  });

  it("keeps reading Oct 30 once today's plan has started: it is the current workout", () => {
    const allSets = [...finished('w_oct30'), ...plan('w_today')];
    const allWorkouts = [oct30, wk('w_today', '2026-11-05', 'active')];
    const result = getLastTimeDataFrom('ex_x', 'w_today', allSets, allWorkouts, 'primary');
    expect(result!.workoutDate).toBe('2026-10-30');
  });

  it('ignores an old plan that was never started', () => {
    const allSets = [...finished('w_oct30'), ...plan('w_oct25')];
    const allWorkouts = [oct30, wk('w_oct25', '2026-10-25', 'planned')];
    expect(getLastTimeDataFrom('ex_x', '', allSets, allWorkouts)!.workoutDate).toBe('2026-10-30');
  });

  it('has no last time for an exercise that has only ever been planned', () => {
    const allSets = plan('w_today');
    const allWorkouts = [wk('w_today', '2026-11-05', 'planned')];
    expect(getLastTimeDataFrom('ex_x', '', allSets, allWorkouts)).toBeNull();
    expect(getLastTimeDataFrom('ex_x', 'w_other', allSets, allWorkouts, 'primary')).toBeNull();
  });

  it('still counts an active workout other than the one on screen', () => {
    const allSets = [...finished('w_oct30'), ...finished('w_active')];
    const allWorkouts = [oct30, wk('w_active', '2026-11-03', 'active'), wk('w_now', '2026-11-05')];
    expect(getLastTimeDataFrom('ex_x', 'w_now', allSets, allWorkouts, 'primary')!.workoutDate).toBe('2026-11-03');
  });

  it("applies #817's one-slot rule to what is left after the plan is dropped", () => {
    // Oct 30: X as a warm-up (order 2) and the primary (order 5). A later plan has X in the primary only.
    const warm = makeSet({ ...X, workout_id: 'w_oct30', section: 'warmup', exercise_order: 2, weight: '', reps: '' });
    const worked = finished('w_oct30').map((s) => ({ ...s, exercise_order: 5 }));
    const allSets = [warm, ...worked, ...plan('w_today')];
    const allWorkouts = [oct30, wk('w_today', '2026-11-05', 'planned')];
    const result = getLastTimeDataFrom('ex_x', 'w_now', allSets, allWorkouts, 'primary');
    expect(result!.workoutDate).toBe('2026-10-30');
    expect(result!.sets.every((s) => s.exercise_order === 5)).toBe(true);
  });
});
