import { describe, it, expect } from 'vitest';
import {
  groupWorkoutsByWeek,
  weekRange,
  weekTotals,
  cardFigure,
  cardStats,
  cardDay,
  spokenDay,
  activityCardAriaLabel,
  upNextOrder,
  upNextDate,
  getWorkoutTags,
  EQUIPMENT_TAGS,
  toLocalDateStr,
  formatPlannedDate,
  isOverdue,
  sortPlannedWorkouts,
  effortForSpeech,
  pluralExercise,
  TYPE_ORDER,
  monthOf,
  monthName,
  monthYearLabel,
  monthTitle,
  monthOptions,
  typesPresent,
  typeCounts,
  summarizeMonth,
  splitDuration,
  formatMonthTime,
} from './activities-helpers';
import type { WorkoutWithRow, SetWithRow, ExerciseWithRow } from '../../api/types';

function makeWorkout(overrides: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    id: 'w1',
    date: '2026-03-15',
    time: '07:00',
    type: 'weight',
    name: 'Upper Push A',
    template_id: '',
    notes: '',
    elapsed_seconds: '3600',
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
    ...overrides,
  };
}

// ── toLocalDateStr ───────────────────────────────────────────────────

describe('toLocalDateStr', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 2, 15); // March 15, 2026 local
    expect(toLocalDateStr(d)).toBe('2026-03-15');
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5); // January 5
    expect(toLocalDateStr(d)).toBe('2026-01-05');
  });

  it('uses local date, not UTC (avoids timezone shift)', () => {
    const d = new Date('2026-03-15T00:00:00'); // local midnight
    expect(toLocalDateStr(d)).toBe('2026-03-15');
  });
});

// ── Week grouping (#528) ─────────────────────────────────────────────
// today = '2026-03-18' (Wednesday)
// This week: 2026-03-16 (Mon) – 2026-03-22 (Sun)
// Last week: 2026-03-09 (Mon) – 2026-03-15 (Sun)

describe('groupWorkoutsByWeek', () => {
  const today = '2026-03-18'; // Wednesday

  it('returns empty array for no workouts', () => {
    expect(groupWorkoutsByWeek([], today)).toEqual([]);
  });

  it('heads the current Mon–Sun week "This week" and the one before "Last week"', () => {
    const groups = groupWorkoutsByWeek(
      [
        makeWorkout({ id: 'a', date: '2026-03-22' }), // Sun
        makeWorkout({ id: 'b', date: '2026-03-16' }), // Mon
        makeWorkout({ id: 'c', date: '2026-03-15' }), // Sun last week
        makeWorkout({ id: 'd', date: '2026-03-09' }), // Mon last week
      ],
      today,
    );
    expect(groups.map((g) => [g.label, g.workouts.map((w) => w.id)])).toEqual([
      ['This week', ['a', 'b']],
      ['Last week', ['c', 'd']],
    ]);
  });

  it('heads older weeks with their range, newest first', () => {
    const groups = groupWorkoutsByWeek(
      [makeWorkout({ id: 'a', date: '2026-03-04' }), makeWorkout({ id: 'b', date: '2026-02-27' })],
      today,
    );
    expect(groups.map((g) => g.label)).toEqual(['Mar 2 – 8', 'Feb 23 – Mar 1']);
  });

  it('puts Sunday and the following Monday in different groups', () => {
    const groups = groupWorkoutsByWeek(
      [makeWorkout({ id: 'a', date: '2026-03-16' }), makeWorkout({ id: 'b', date: '2026-03-15' })],
      today,
    );
    expect(groups.map((g) => g.workouts.map((w) => w.id))).toEqual([['a'], ['b']]);
  });

  it('works when today is Monday or Sunday', () => {
    expect(groupWorkoutsByWeek([makeWorkout({ date: '2026-03-16' })], '2026-03-16')[0].label).toBe('This week');
    expect(groupWorkoutsByWeek([makeWorkout({ date: '2026-03-16' })], '2026-03-22')[0].label).toBe('This week');
    expect(groupWorkoutsByWeek([makeWorkout({ date: '2026-03-15' })], '2026-03-22')[0].label).toBe('Last week');
  });

  it('keeps the incoming order inside a group', () => {
    const groups = groupWorkoutsByWeek(
      [makeWorkout({ id: 'a', date: '2026-03-18' }), makeWorkout({ id: 'b', date: '2026-03-16' })],
      today,
    );
    expect(groups[0].workouts.map((w) => w.id)).toEqual(['a', 'b']);
  });
});

describe('weekRange', () => {
  it('names one month once', () => {
    expect(weekRange('2026-10-05')).toBe('Oct 5 – 11');
  });

  it('names both months across a month', () => {
    expect(weekRange('2026-09-28')).toBe('Sep 28 – Oct 4');
    expect(weekRange('2026-03-30')).toBe('Mar 30 – Apr 5');
  });

  it('adds the year across a year', () => {
    expect(weekRange('2025-12-29')).toBe('Dec 29, 2025 – Jan 4');
  });
});

describe('weekTotals', () => {
  it('reads count, time and distance', () => {
    const ws = [
      makeWorkout({ elapsed_seconds: '3600', distance_m: '16093' }),
      makeWorkout({ elapsed_seconds: '1500', distance_m: '' }),
    ];
    expect(weekTotals(ws)).toBe('2 · 1 h 25 · 10 mi');
  });

  it('says minutes under an hour', () => {
    expect(weekTotals([makeWorkout({ elapsed_seconds: '2700', distance_m: '' })])).toBe('1 · 45 min');
  });

  it('leaves out time and distance when nothing has them', () => {
    expect(weekTotals([makeWorkout({ elapsed_seconds: '', distance_m: '' })])).toBe('1');
    expect(weekTotals([makeWorkout({ elapsed_seconds: '600', distance_m: '0' })])).toBe('1 · 10 min');
  });
});

// ── Activity card (#528) ─────────────────────────────────────────────

describe('cardFigure', () => {
  it('is the distance in miles to one decimal for a bike, hike, run or walk with one', () => {
    for (const type of ['bike', 'hike', 'run', 'walk'] as const) {
      expect(cardFigure(makeWorkout({ type, distance_m: '24203', elapsed_seconds: '6000' }))).toEqual({
        value: '15.0',
        unit: 'mi',
        spoken: '15.0 miles',
      });
    }
  });

  it('is the duration for everything else: minutes under an hour, h:mm from an hour', () => {
    expect(cardFigure(makeWorkout({ type: 'weight', elapsed_seconds: '1980' }))).toEqual({
      value: '33',
      unit: 'min',
      spoken: '33 minutes',
    });
    expect(cardFigure(makeWorkout({ type: 'bike', distance_m: '', elapsed_seconds: '6480' }))).toEqual({
      value: '1:48',
      unit: 'h',
      spoken: '1 hour 48 minutes',
    });
    expect(cardFigure(makeWorkout({ type: 'weight', elapsed_seconds: '3600' }))).toMatchObject({ value: '1:00' });
  });

  it('is the duration when a cardio type has a blank or zero distance', () => {
    expect(cardFigure(makeWorkout({ type: 'walk', distance_m: '', elapsed_seconds: '1200' }))?.unit).toBe('min');
    expect(cardFigure(makeWorkout({ type: 'walk', distance_m: '0', elapsed_seconds: '1200' }))?.unit).toBe('min');
  });

  it('is null with neither a distance nor a duration', () => {
    expect(cardFigure(makeWorkout({ type: 'weight', elapsed_seconds: '' }))).toBeNull();
    expect(cardFigure(makeWorkout({ type: 'bike', distance_m: '', elapsed_seconds: '' }))).toBeNull();
  });
});

describe('cardStats', () => {
  const ride = makeWorkout({
    type: 'bike',
    distance_m: '24203', // 15.04 mi
    elapsed_seconds: '6473', // 1:47:53
    ascent_m: '494', // 1,620 ft
  });

  it('gives a bike its elapsed time, speed over elapsed time, and ascent', () => {
    expect(cardStats(ride).map((p) => p.text)).toEqual(['1:47:53', '8.4 mph', '↑1,620 ft']);
    expect(cardStats(ride).map((p) => p.spoken)).toEqual([
      '1 hour 47 minutes',
      '8.4 miles per hour',
      '1,620 feet climbed',
    ]);
  });

  it('gives a hike, run or walk its pace per mile in place of speed', () => {
    const run = makeWorkout({ type: 'run', distance_m: '8047', elapsed_seconds: '2400', ascent_m: '' }); // 5 mi, 8:00
    expect(cardStats(run).map((p) => p.text)).toEqual(['40:00', '8:00 /mi']);
    expect(cardStats(run)[1].spoken).toBe('8 minutes per mile');
  });

  it('leaves out each part whose value is blank, and shows no zero', () => {
    expect(cardStats({ ...ride, ascent_m: '' }).map((p) => p.text)).toEqual(['1:47:53', '8.4 mph']);
    expect(cardStats({ ...ride, ascent_m: '0' }).map((p) => p.text)).toEqual(['1:47:53', '8.4 mph']);
    expect(cardStats({ ...ride, elapsed_seconds: '' }).map((p) => p.text)).toEqual(['↑1,620 ft']);
    expect(cardStats({ ...ride, elapsed_seconds: '0' }).map((p) => p.text)).toEqual(['↑1,620 ft']);
  });

  it('shows only ascent when the figure is the duration', () => {
    const noDistance = { ...ride, distance_m: '' };
    expect(cardStats(noDistance).map((p) => p.text)).toEqual(['↑1,620 ft']);
  });

  it('gives a weight card its average heart rate and effort word', () => {
    const lift = makeWorkout({ type: 'weight', avg_hr: '89', effort: 'Hard' });
    expect(cardStats(lift)).toEqual([
      { text: '89 bpm', spoken: 'average 89 beats per minute' },
      { text: 'hard', spoken: 'hard', effort: 'Hard' },
    ]);
    expect(cardStats(makeWorkout({ type: 'weight', avg_hr: '', effort: 'Easy' })).map((p) => p.text)).toEqual(['easy']);
    expect(cardStats(makeWorkout({ type: 'weight', avg_hr: '0', effort: '' }))).toEqual([]);
  });

  it("gives a stretch card its effort word, then the note's first line", () => {
    const s = makeWorkout({ type: 'stretch', effort: 'Easy', notes: 'Hips and hamstrings\nfelt tight' });
    expect(cardStats(s).map((p) => p.text)).toEqual(['easy', 'Hips and hamstrings']);
    expect(cardStats(makeWorkout({ type: 'stretch', effort: '', notes: '' }))).toEqual([]);
    expect(cardStats(makeWorkout({ type: 'stretch', effort: '', notes: 'Just this' })).map((p) => p.text)).toEqual([
      'Just this',
    ]);
  });
});

describe('cardDay and spokenDay', () => {
  it('reads Today, Yesterday, else the short weekday', () => {
    expect(cardDay('2026-10-20', '2026-10-20')).toBe('Today');
    expect(cardDay('2026-10-19', '2026-10-20')).toBe('Yesterday');
    expect(cardDay('2026-10-18', '2026-10-20')).toBe('Sun');
  });

  it('spells the day out', () => {
    expect(spokenDay('2026-10-18')).toBe('Sunday October 18');
  });
});

describe('activityCardAriaLabel (#528)', () => {
  it('holds the name, type, day, figure, each stats part and provenance, in that order', () => {
    const ride = makeWorkout({
      name: 'Mountain Bike',
      type: 'bike',
      date: '2026-10-18',
      distance_m: '24203',
      elapsed_seconds: '6473',
      ascent_m: '494',
      source: 'coros',
    });
    expect(activityCardAriaLabel(ride)).toBe(
      'Mountain Bike, bike, Sunday October 18, 15.0 miles, 1 hour 47 minutes, 8.4 miles per hour, 1,620 feet climbed, synced from COROS',
    );
  });

  it('leaves out parts with no value and falls back to the type for a blank name', () => {
    const bare = makeWorkout({ name: '', type: 'weight', date: '2026-10-18', elapsed_seconds: '', effort: '' });
    expect(activityCardAriaLabel(bare)).toBe('weight, weight, Sunday October 18');
  });
});

describe('Up next helpers', () => {
  it('orders by date, then sheet order', () => {
    const ws = [
      makeWorkout({ id: 'c', date: '2026-10-22', sheetRow: 2 }),
      makeWorkout({ id: 'b', date: '2026-10-20', sheetRow: 9 }),
      makeWorkout({ id: 'a', date: '2026-10-18', sheetRow: 5 }),
      makeWorkout({ id: 'd', date: '2026-10-20', sheetRow: 4 }),
    ];
    expect(upNextOrder(ws).map((w) => w.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('writes TODAY, a weekday and day number, or the month and day of an overdue plan', () => {
    expect(upNextDate('2026-10-20', '2026-10-20')).toBe('TODAY');
    expect(upNextDate('2026-10-27', '2026-10-20')).toBe('TUE 27');
    expect(upNextDate('2026-10-18', '2026-10-20')).toBe('OCT 18');
  });
});

// ── Tag aggregation ──────────────────────────────────────────────────

describe('getWorkoutTags', () => {
  const exercises: ExerciseWithRow[] = [
    { id: 'ex1', name: 'Bench Press BB', tags: 'Push, Chest, BB', notes: '', created: '', sheetRow: 2 },
    { id: 'ex2', name: 'Incline Press DB', tags: 'Push, Chest, DB', notes: '', created: '', sheetRow: 3 },
    { id: 'ex3', name: 'Lateral Raise DB', tags: 'Push, Shoulders, DB', notes: '', created: '', sheetRow: 4 },
    { id: 'ex4', name: 'Ab Wheel', tags: 'Core', notes: '', created: '', sheetRow: 5 },
  ];

  const workoutSets: SetWithRow[] = [
    {
      workout_id: 'w1',
      exercise_id: 'ex1',
      exercise_name: 'Bench Press BB',
      section: 'primary',
      exercise_order: 1,
      set_number: 1,
      planned_reps: '',
      weight: '185',
      reps: '6',
      effort: 'Medium',
      sheetRow: 2,
    },
    {
      workout_id: 'w1',
      exercise_id: 'ex2',
      exercise_name: 'Incline Press DB',
      section: 'SS1',
      exercise_order: 2,
      set_number: 1,
      planned_reps: '',
      weight: '55',
      reps: '12',
      effort: 'Medium',
      sheetRow: 3,
    },
    {
      workout_id: 'w1',
      exercise_id: 'ex3',
      exercise_name: 'Lateral Raise DB',
      section: 'SS2',
      exercise_order: 3,
      set_number: 1,
      planned_reps: '',
      weight: '15',
      reps: '15',
      effort: 'Easy',
      sheetRow: 4,
    },
    {
      workout_id: 'w1',
      exercise_id: 'ex4',
      exercise_name: 'Ab Wheel',
      section: 'burnout',
      exercise_order: 4,
      set_number: 1,
      planned_reps: '',
      weight: '',
      reps: '10',
      effort: 'Medium',
      sheetRow: 5,
    },
  ];

  it('returns top 3 most common muscle group tags', () => {
    const tags = getWorkoutTags(workoutSets, exercises);
    expect(tags).toHaveLength(3);
    expect(tags[0]).toBe('Push');
    expect(tags[1]).toBe('Chest');
    expect(['Core', 'Shoulders']).toContain(tags[2]);
  });

  it('excludes equipment tags (BB, DB, FT)', () => {
    const tags = getWorkoutTags(workoutSets, exercises);
    for (const tag of tags) {
      expect(EQUIPMENT_TAGS).not.toContain(tag);
    }
  });

  it('returns empty array for empty sets', () => {
    expect(getWorkoutTags([], exercises)).toEqual([]);
  });

  it('returns empty array when exercises have no tags', () => {
    const noTagExercises: ExerciseWithRow[] = [
      { id: 'ex1', name: 'Custom Exercise', tags: '', notes: '', created: '', sheetRow: 2 },
    ];
    const singleSet: SetWithRow[] = [
      {
        workout_id: 'w1',
        exercise_id: 'ex1',
        exercise_name: 'Custom Exercise',
        section: 'primary',
        exercise_order: 1,
        set_number: 1,
        planned_reps: '',
        weight: '',
        reps: '',
        effort: '',
        sheetRow: 2,
      },
    ];
    expect(getWorkoutTags(singleSet, noTagExercises)).toEqual([]);
  });

  it('returns fewer than 3 if not enough unique tags', () => {
    const singleEx: ExerciseWithRow[] = [
      { id: 'ex4', name: 'Ab Wheel', tags: 'Core', notes: '', created: '', sheetRow: 5 },
    ];
    const singleSet: SetWithRow[] = [
      {
        workout_id: 'w1',
        exercise_id: 'ex4',
        exercise_name: 'Ab Wheel',
        section: 'burnout',
        exercise_order: 1,
        set_number: 1,
        planned_reps: '',
        weight: '',
        reps: '10',
        effort: '',
        sheetRow: 2,
      },
    ];
    expect(getWorkoutTags(singleSet, singleEx)).toEqual(['Core']);
  });

  it('excludes Warmup tag', () => {
    const warmupEx: ExerciseWithRow[] = [
      { id: 'ex1', name: 'Push Ups', tags: 'Warmup, Push, Chest', notes: '', created: '', sheetRow: 2 },
    ];
    const warmupSets: SetWithRow[] = [
      {
        workout_id: 'w1',
        exercise_id: 'ex1',
        exercise_name: 'Push Ups',
        section: 'warmup',
        exercise_order: 1,
        set_number: 1,
        planned_reps: '',
        weight: '',
        reps: '15',
        effort: '',
        sheetRow: 2,
      },
    ];
    const tags = getWorkoutTags(warmupSets, warmupEx);
    expect(tags).not.toContain('Warmup');
    expect(tags).toContain('Push');
    expect(tags).toContain('Chest');
  });
});

// ── formatPlannedDate (AC1) ──────────────────────────────────────────

describe('formatPlannedDate', () => {
  const today = '2026-04-01'; // Wednesday

  it('returns "Today" for the current day', () => {
    expect(formatPlannedDate('2026-04-01', today)).toBe('Today');
  });

  it('returns "Tomorrow" for the next day', () => {
    expect(formatPlannedDate('2026-04-02', today)).toBe('Tomorrow');
  });

  it('returns "Yesterday" for the previous day', () => {
    expect(formatPlannedDate('2026-03-31', today)).toBe('Yesterday');
  });

  it('returns weekday + short date for +2 days', () => {
    expect(formatPlannedDate('2026-04-03', today)).toBe('Fri, Apr 3');
  });

  it('returns weekday + short date for +6 days (upper bound of the weekday range)', () => {
    expect(formatPlannedDate('2026-04-07', today)).toBe('Tue, Apr 7');
  });

  it('returns short date without weekday at the +7 day boundary', () => {
    expect(formatPlannedDate('2026-04-08', today)).toBe('Apr 8');
  });

  it('returns short date for a far future date in the same year', () => {
    expect(formatPlannedDate('2026-11-20', today)).toBe('Nov 20');
  });

  it('includes the year for a future date in a different calendar year', () => {
    expect(formatPlannedDate('2027-04-05', today)).toBe('Apr 5, 2027');
  });

  it('includes the year for a past date in a different calendar year', () => {
    expect(formatPlannedDate('2025-12-20', today)).toBe('Dec 20, 2025');
  });

  it('returns short date for a past date two or more days ago', () => {
    expect(formatPlannedDate('2026-03-28', today)).toBe('Mar 28');
  });

  it('treats a same-year date 7+ days out as short date even across a month boundary', () => {
    expect(formatPlannedDate('2026-05-01', today)).toBe('May 1');
  });
});

// ── isOverdue (AC3) ──────────────────────────────────────────────────

describe('isOverdue', () => {
  const today = '2026-04-01';

  it('is false for today', () => {
    expect(isOverdue('2026-04-01', today)).toBe(false);
  });

  it('is false for a future date', () => {
    expect(isOverdue('2026-04-02', today)).toBe(false);
  });

  it('is true for yesterday', () => {
    expect(isOverdue('2026-03-31', today)).toBe(true);
  });

  it('is true for a date in a previous year', () => {
    expect(isOverdue('2025-12-31', today)).toBe(true);
  });
});

// ── sortPlannedWorkouts (AC2 + AC3) ──────────────────────────────────

describe('sortPlannedWorkouts', () => {
  it('orders planned workouts ascending by date, soonest first', () => {
    const list = [
      makeWorkout({ id: 'c', date: '2026-04-10' }),
      makeWorkout({ id: 'a', date: '2026-04-02' }),
      makeWorkout({ id: 'b', date: '2026-04-05' }),
    ];
    expect(sortPlannedWorkouts(list).map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('places overdue workouts above upcoming ones', () => {
    const list = [
      makeWorkout({ id: 'upcoming', date: '2026-04-05' }),
      makeWorkout({ id: 'overdue', date: '2026-03-20' }),
    ];
    expect(sortPlannedWorkouts(list).map((w) => w.id)).toEqual(['overdue', 'upcoming']);
  });

  it('breaks ties on created, then id, for a deterministic order', () => {
    const list = [
      makeWorkout({ id: 'z', date: '2026-04-02', created: '2026-01-02T00:00:00Z' }),
      makeWorkout({ id: 'a', date: '2026-04-02', created: '2026-01-02T00:00:00Z' }),
      makeWorkout({ id: 'm', date: '2026-04-02', created: '2026-01-01T00:00:00Z' }),
    ];
    expect(sortPlannedWorkouts(list).map((w) => w.id)).toEqual(['m', 'a', 'z']);
  });

  it('does not mutate the input array', () => {
    const list = [makeWorkout({ id: 'b', date: '2026-04-10' }), makeWorkout({ id: 'a', date: '2026-04-02' })];
    const before = list.map((w) => w.id);
    sortPlannedWorkouts(list);
    expect(list.map((w) => w.id)).toEqual(before);
  });
});

describe('effortForSpeech (#113 AC5)', () => {
  it('speaks each level in lower case with the word "effort"', () => {
    expect(effortForSpeech('Easy')).toBe('easy effort');
    expect(effortForSpeech('Medium')).toBe('medium effort');
    expect(effortForSpeech('Hard')).toBe('hard effort');
  });

  // AC5 / #101: '' means nobody said. Announcing "no effort" would be a claim
  // the data does not make.
  it('says nothing at all when the workout is unrated', () => {
    expect(effortForSpeech('')).toBe('');
  });
});

describe('pluralExercise (#113)', () => {
  it('singularises exactly one', () => {
    expect(pluralExercise(1)).toBe('1 exercise');
  });

  it('pluralises everything else', () => {
    expect(pluralExercise(0)).toBe('0 exercises');
    expect(pluralExercise(5)).toBe('5 exercises');
  });
});

// ── Month summary (#527) ─────────────────────────────────────────────

describe('month names (#527)', () => {
  it('monthOf takes the YYYY-MM of a date', () => {
    expect(monthOf('2026-10-20')).toBe('2026-10');
  });

  it('names the month, with its year for the button and picker', () => {
    expect(monthName('2026-09')).toBe('September');
    expect(monthYearLabel('2026-10')).toBe('October 2026');
  });

  it('titles the current month "so far" and a past month by name', () => {
    expect(monthTitle('2026-10', '2026-10')).toBe('October so far');
    expect(monthTitle('2026-09', '2026-10')).toBe('September');
  });

  it('adds the year to a past month outside the current year', () => {
    expect(monthTitle('2025-12', '2026-10')).toBe('December 2025');
  });
});

describe('monthOptions (#527)', () => {
  const at = (date: string, extra: Partial<WorkoutWithRow> = {}) =>
    makeWorkout({ id: date + extra.type, date, ...extra });

  it('always lists the current month, even with nothing in it', () => {
    expect(monthOptions([], '2026-10')).toEqual([{ ym: '2026-10', count: 0 }]);
  });

  it('lists each earlier month with a completed activity, newest first, with its count', () => {
    const ws = [at('2026-08-02'), at('2026-09-03'), at('2026-09-20'), at('2026-10-01'), at('2026-05-09')];
    expect(monthOptions(ws, '2026-10')).toEqual([
      { ym: '2026-10', count: 1 },
      { ym: '2026-09', count: 2 },
      { ym: '2026-08', count: 1 },
      { ym: '2026-05', count: 1 },
    ]);
  });

  it('omits a month with none, so no past option opens on an empty list', () => {
    const ws = [at('2026-10-01'), at('2026-07-01')];
    expect(monthOptions(ws, '2026-10').map((o) => o.ym)).toEqual(['2026-10', '2026-07']);
  });

  it('counts every type', () => {
    const ws = [at('2026-09-03', { type: 'bike' }), at('2026-09-04', { type: 'weight' })];
    expect(monthOptions(ws, '2026-10')[1]).toEqual({ ym: '2026-09', count: 2 });
  });
});

describe('typesPresent and typeCounts (#527)', () => {
  const of = (...types: WorkoutWithRow['type'][]) => types.map((type, i) => makeWorkout({ id: `w${i}`, type }));

  it('orders the types Weight, Bike, Stretch, Hike, Run, Walk', () => {
    expect(TYPE_ORDER).toEqual(['weight', 'bike', 'stretch', 'hike', 'run', 'walk']);
    expect(typesPresent(of('walk', 'hike', 'weight', 'weight'))).toEqual(['weight', 'hike', 'walk']);
  });

  it('counts per type in chip order and leaves out a type with none', () => {
    expect(typeCounts(of('stretch', 'weight', 'weight', 'bike', 'weight'))).toEqual([
      { type: 'weight', count: 3 },
      { type: 'bike', count: 1 },
      { type: 'stretch', count: 1 },
    ]);
  });
});

describe('summarizeMonth (#527)', () => {
  it('counts, sums durations and sums distance in miles', () => {
    const s = summarizeMonth([
      makeWorkout({ id: 'a', elapsed_seconds: '3600', distance_m: '1609.344' }),
      makeWorkout({ id: 'b', elapsed_seconds: '1800', distance_m: '3218.688' }),
    ]);
    expect(s).toEqual({ count: 2, seconds: 5400, timed: 2, miles: 3 });
  });

  it('skips an activity with no duration instead of counting it as zero', () => {
    const s = summarizeMonth([
      makeWorkout({ id: 'a', elapsed_seconds: '3600' }),
      makeWorkout({ id: 'b', elapsed_seconds: '' }),
    ]);
    expect(s.count).toBe(2);
    expect(s.timed).toBe(1);
    expect(s.seconds).toBe(3600);
  });

  it('has no distance when no activity has one, and keeps a measured zero', () => {
    expect(summarizeMonth([makeWorkout({ distance_m: '' })]).miles).toBeNull();
    expect(summarizeMonth([makeWorkout({ distance_m: '0' })]).miles).toBe(0);
  });

  it('sums only the distances that exist', () => {
    const s = summarizeMonth([
      makeWorkout({ id: 'a', distance_m: '1609.344' }),
      makeWorkout({ id: 'b', distance_m: '' }),
    ]);
    expect(s.miles).toBe(1);
  });
});

describe('month time (#527)', () => {
  it('rounds once from the total, then splits into hours and minutes', () => {
    expect(splitDuration(14 * 3600 + 2 * 60 + 20)).toEqual({ hours: 14, minutes: 2 });
    expect(splitDuration(45 * 60)).toEqual({ hours: 0, minutes: 45 });
  });

  it('formats "14 h 2" over an hour and "45 min" under', () => {
    expect(formatMonthTime(14 * 3600 + 2 * 60)).toBe('14 h 2');
    expect(formatMonthTime(45 * 60)).toBe('45 min');
    expect(formatMonthTime(3600)).toBe('1 h 0');
  });
});
