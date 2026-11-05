// #577, #578 — the run order, the labels, the step arithmetic and the summary's totals.
import { describe, it, expect, afterEach } from 'vitest';
import type { SetWithRow, WorkoutWithRow } from '../../../api/types';
import { sets, workouts } from '../../../state/store';
import {
  buildSteps,
  cleanWeight,
  doneLabel,
  endsGroup,
  figuresText,
  groupMeta,
  isEditable,
  lastSession,
  lastTimeFor,
  lastTimeLine,
  nextIndex,
  opensGroup,
  planLine,
  plannedWeight,
  progressOf,
  roundUpTo,
  setupExercises,
  shortDate,
  signedMSS,
  stepState,
  summaryTotals,
  stepWeight,
  targetWeight,
  weightText,
} from './lift-plan';

let row = 2;
function mk(section: string, order: number, name: string, n: number, extra: Partial<SetWithRow> = {}): SetWithRow {
  return {
    workout_id: 'w1',
    exercise_id: `ex_${name}`,
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
    sheetRow: row++,
    ...extra,
  };
}
const times = (section: string, order: number, name: string, count: number) =>
  Array.from({ length: count }, (_, i) => mk(section, order, name, i + 1));

// Upper Push B: warm-up, primary of one, two supersets of two and three.
const UPPER_PUSH_B = [
  mk('warmup', 1, 'Arm Circles', 1),
  ...times('primary', 2, 'OH Press', 4),
  ...times('SS1', 3, 'Arnold', 3),
  ...times('SS1', 4, 'Lateral', 3),
  ...times('SS2', 5, 'Close Grip', 3),
  ...times('SS2', 6, 'Pushdown', 3),
  ...times('burnout', 7, 'Ab Wheel', 2),
  ...times('burnout', 8, 'Wrist Ext', 2),
  ...times('burnout', 9, 'Wrist Flex', 2),
  mk('cooldown', 10, 'Doorway Stretch', 1),
];
const order = (steps = buildSteps(UPPER_PUSH_B)) => steps.map((s) => `${s.row.exercise_name} ${s.row.set_number}`);

describe('buildSteps', () => {
  it('runs sections in exercise order and rounds inside a superset', () => {
    expect(order()).toEqual([
      'OH Press 1',
      'OH Press 2',
      'OH Press 3',
      'OH Press 4',
      'Arnold 1',
      'Lateral 1',
      'Arnold 2',
      'Lateral 2',
      'Arnold 3',
      'Lateral 3',
      'Close Grip 1',
      'Pushdown 1',
      'Close Grip 2',
      'Pushdown 2',
      'Close Grip 3',
      'Pushdown 3',
      'Ab Wheel 1',
      'Wrist Ext 1',
      'Wrist Flex 1',
      'Ab Wheel 2',
      'Wrist Ext 2',
      'Wrist Flex 2',
    ]);
  });

  it('leaves out the warm-up and the cool-down', () => {
    const names = order();
    expect(names).not.toContain('Arm Circles 1');
    expect(names).not.toContain('Doorway Stretch 1');
  });

  it('drops an exercise with fewer sets out of later rounds', () => {
    const steps = buildSteps([...times('SS1', 1, 'A', 3), ...times('SS1', 2, 'B', 2)]);
    expect(order(steps)).toEqual(['A 1', 'B 1', 'A 2', 'B 2', 'A 3']);
    // Round 3 is A alone: its rest is the round rest, not a switch.
    expect(steps[4].lastInRound).toBe(true);
    expect(steps[0].lastInRound).toBe(false);
    expect(steps[1].lastInRound).toBe(true);
  });

  it('letters the exercises of a round and counts their sets', () => {
    const steps = buildSteps(UPPER_PUSH_B);
    expect(steps[4].letter).toBe('A');
    expect(steps[5].letter).toBe('B');
    expect(steps[0].letter).toBe('');
    expect(steps[0].setCount).toBe(4);
    expect(steps[4].nextInRound?.row.exercise_name).toBe('Lateral');
  });

  it('orders sections by their first exercise, whatever order the rows are in', () => {
    const steps = buildSteps([...times('SS1', 3, 'Arnold', 1), ...times('primary', 1, 'OH Press', 1)]);
    expect(order(steps)).toEqual(['OH Press 1', 'Arnold 1']);
  });
});

describe('nextIndex, roundUpTo and progress', () => {
  it('passes over a set that is already logged', () => {
    const rows = [...times('primary', 1, 'OH Press', 3)];
    rows[1] = { ...rows[1], reps: '8' };
    const steps = buildSteps(rows);
    expect(nextIndex(steps, -1)).toBe(0);
    expect(nextIndex(steps, 0)).toBe(2);
    expect(nextIndex(steps, 2)).toBe(-1);
  });

  it('counts a performed set (set_s) as logged', () => {
    const steps = buildSteps([mk('primary', 1, 'OH Press', 1, { set_s: '41' })]);
    expect(progressOf(steps)).toEqual({ done: 1, total: 1 });
  });

  it('a round is the steps of the same set number back from the one given', () => {
    const steps = buildSteps(UPPER_PUSH_B);
    expect(roundUpTo(steps, 5).map((s) => s.row.exercise_name)).toEqual(['Arnold', 'Lateral']);
    expect(roundUpTo(steps, 4).map((s) => s.row.exercise_name)).toEqual(['Arnold']);
    expect(roundUpTo(steps, 1).map((s) => s.row.exercise_name)).toEqual(['OH Press']);
  });
});

describe('doneLabel', () => {
  const steps = buildSteps([
    ...times('SS1', 1, 'A', 1).map((s) => ({ ...s, rest_target_s: '15' })),
    ...times('SS1', 2, 'B', 1).map((s) => ({ ...s, rest_target_s: '45' })),
  ]);
  it('names the rest, the switch, the finish, and nothing when the target is blank', () => {
    expect(doneLabel(steps[0], false)).toBe('Done · switch');
    expect(doneLabel(steps[1], false)).toBe('Done · rest 0:45');
    expect(doneLabel(steps[1], true)).toBe('Done · finish');
    expect(doneLabel({ ...steps[1], row: { ...steps[1].row, rest_target_s: '' } }, false)).toBe('Done');
  });
});

describe('the lines', () => {
  it('shows BW for a blank weight and the figure otherwise', () => {
    expect(weightText('')).toBe('BW');
    expect(weightText('0')).toBe('BW');
    expect(weightText('90')).toBe('90 lb');
    expect(weightText('92.5')).toBe('92.5 lb');
  });

  it('last time: the set, none that number, or no history', () => {
    const last = mk('primary', 1, 'OH Press', 2, { weight: '90', reps: '8', effort: 'Medium' });
    expect(lastTimeLine({ set: last, any: true }, 2)).toBe('Last time: 90 × 8 · Medium');
    expect(lastTimeLine({ set: null, any: true }, 3)).toBe('No set 3 last time');
    expect(lastTimeLine({ set: null, any: false }, 1)).toBe('First time doing this exercise');
    expect(lastTimeLine({ set: { ...last, weight: '', effort: '' }, any: true }, 2)).toBe('Last time: BW × 8');
  });

  it('aims at the weight of the set, else what it weighed last time', () => {
    const last = { set: mk('primary', 1, 'X', 1, { weight: '90' }), any: true };
    expect(targetWeight({ weight: '' }, last)).toBe('90');
    expect(targetWeight({ weight: '100' }, last)).toBe('100');
    expect(targetWeight({ weight: '' }, { set: null, any: false })).toBe('');
  });
});

describe('stepWeight', () => {
  it('moves by 5 from 20 lb up and by 1 below, never under 0', () => {
    expect(stepWeight(20, 1)).toBe(25);
    expect(stepWeight(20, -1)).toBe(15);
    expect(stepWeight(19, 1)).toBe(20);
    expect(stepWeight(1, -1)).toBe(0);
    expect(stepWeight(0, -1)).toBe(0);
  });
});

describe('stepState', () => {
  const steps = buildSteps([
    mk('primary', 1, 'X', 1, { weight: '50', reps: '8', effort: 'Easy' }),
    mk('primary', 1, 'X', 2, { weight: '50', reps: '8' }),
    mk('primary', 1, 'X', 3),
    mk('primary', 1, 'X', 4),
    mk('primary', 1, 'X', 5),
  ]);
  it('tells logged, no effort, skipped, now and to do', () => {
    expect(steps.map((s) => stepState(s, 3))).toEqual(['logged', 'no-effort', 'skipped', 'now', 'todo']);
  });
  it('has no skipped or now before the run starts', () => {
    expect(steps.map((s) => stepState(s, null))).toEqual(['logged', 'no-effort', 'todo', 'todo', 'todo']);
  });
  it('on the summary nothing is now or to do: what was not done is skipped', () => {
    expect(steps.map((s) => stepState(s, null, true))).toEqual([
      'logged',
      'no-effort',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });
});

describe('isEditable', () => {
  it('opens every row on the summary, and only done or skipped ones during the workout', () => {
    expect((['logged', 'no-effort', 'skipped', 'now', 'todo'] as const).map((s) => isEditable(s, false))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect((['logged', 'no-effort', 'skipped', 'now', 'todo'] as const).every((s) => isEditable(s, true))).toBe(true);
  });
});

describe('figuresText', () => {
  it('reads weight times reps, BW for none and ? for reps not logged', () => {
    expect(figuresText({ weight: '90', reps: '8' })).toBe('90 × 8');
    expect(figuresText({ weight: '', reps: '12' })).toBe('BW × 12');
    expect(figuresText({ weight: '0', reps: '' })).toBe('BW × ?');
  });
});

describe('signedMSS', () => {
  it('signs with a plus or a true minus', () => {
    expect(signedMSS(12)).toBe('+0:12');
    expect(signedMSS(-5)).toBe('−0:05');
    expect(signedMSS(0)).toBe('+0:00');
  });
});

describe('summaryTotals', () => {
  it('counts sets with reps, sums set and rest time, and averages rest against plan over sets with both', () => {
    const steps = buildSteps([
      mk('primary', 1, 'X', 1, { reps: '8', effort: 'Easy', set_s: '40', rest_s: '100', rest_target_s: '90' }),
      mk('primary', 1, 'X', 2, { reps: '8', set_s: '35', rest_s: '70', rest_target_s: '90' }),
      mk('primary', 1, 'X', 3, { set_s: '30', rest_s: '60' }),
      mk('primary', 1, 'X', 4),
    ]);
    expect(summaryTotals(steps)).toEqual({
      setsDone: 2,
      setsTotal: 4,
      liftingS: 105,
      restingS: 230,
      restVsPlanS: -5,
      needEffort: 2,
    });
  });

  it('leaves a total with no data null, never 0', () => {
    const t = summaryTotals(buildSteps([mk('primary', 1, 'X', 1), mk('primary', 1, 'X', 2, { rest_s: '50' })]));
    expect(t.liftingS).toBeNull();
    expect(t.restingS).toBe(50);
    expect(t.restVsPlanS).toBeNull();
    expect(t.setsDone).toBe(0);
  });

  it('keeps a measured zero', () => {
    expect(summaryTotals(buildSteps([mk('primary', 1, 'X', 1, { set_s: '0' })])).liftingS).toBe(0);
  });
});

describe('Set up next (#674)', () => {
  const steps = () => {
    row = 2;
    return buildSteps([
      mk('primary', 1, 'Press', 1, { rest_target_s: '90' }),
      mk('primary', 1, 'Press', 2, { rest_target_s: '90' }),
      mk('SS1', 2, 'A', 1),
      mk('SS1', 3, 'B', 1),
      mk('SS1', 2, 'A', 2),
      mk('SS1', 3, 'B', 2),
    ]);
  };

  it('a set ends its group when the next set is in another section', () => {
    const s = steps();
    expect(endsGroup(s, 0, 1)).toBe(false);
    expect(endsGroup(s, 1, 2)).toBe(true);
    expect(endsGroup(s, 1, -1)).toBe(false);
    expect(doneLabel(s[1], false, true)).toBe('Done · set up next');
    expect(doneLabel(s[1], true, true)).toBe('Done · finish');
    expect(doneLabel(s[0], false, false)).toBe('Done · rest 1:30');
  });

  it('a run opens on setup only where no set of the section is logged', () => {
    const s = steps();
    expect(opensGroup(s, 0)).toBe(true);
    s[3].row.reps = '8';
    // B's first set logged in Logbook: A's first set is part-way through the superset.
    expect(opensGroup(s, 2)).toBe(false);
    expect(opensGroup(s, 0)).toBe(true);
  });

  it('plan lines, planned weights and group meta', () => {
    expect(planLine([{ planned_reps: '10' }, { planned_reps: '10' }, { planned_reps: '10' }])).toBe('3 × 10');
    expect(planLine([{ planned_reps: '10' }, { planned_reps: '8' }, { planned_reps: '6' }])).toBe('3 sets · 10, 8, 6');
    expect(planLine([{ planned_reps: '' }, { planned_reps: ' ' }])).toBe('2 sets');
    expect(plannedWeight([{ weight: '' }, { weight: '0' }])).toBe('');
    expect(plannedWeight([{ weight: '95' }, { weight: '95' }])).toBe('95 lb');
    expect(plannedWeight([{ weight: '105' }, { weight: '95' }, { weight: '' }])).toBe('95–105 lb');
    const s = steps();
    expect(groupMeta(s, 'primary')).toBe('2 sets');
    expect(groupMeta(s, 'SS1')).toBe('2 exercises · 2 rounds');
  });

  it('cleans a weight and dates last time, with the year only when it is not this year', () => {
    expect(cleanWeight('62.50')).toBe('62.5');
    expect(cleanWeight('0')).toBe('');
    expect(cleanWeight('abc')).toBe('');
    expect(shortDate('2026-10-21', new Date('2026-10-28T12:00:00'))).toBe('Oct 21');
    expect(shortDate('2025-10-21', new Date('2026-10-28T12:00:00'))).toBe('Oct 21, 2025');
  });
});

// #817 — last time is one slot. The Oct 21 case: OH Press was a warm-up at order 4 (nothing logged)
// and the primary at order 5; today it is the primary of Upper Push B.
describe('last time is one slot (#817)', () => {
  const OH = { exercise_id: 'ex_oh', exercise_name: 'OH Press BB' };
  const earlier = (extra: Partial<SetWithRow>): SetWithRow =>
    mk('primary', 5, 'OH Press BB', 1, { ...OH, workout_id: 'w_oct21', ...extra });
  const OCT21 = [
    earlier({ section: 'warmup', exercise_order: 4, planned_reps: '' }),
    earlier({ set_number: 1, weight: '90', reps: '8', effort: 'Easy' }),
    earlier({ set_number: 2, weight: '90', reps: '8', effort: 'Medium' }),
    earlier({ set_number: 3, weight: '90', reps: '8', effort: 'Hard' }),
    earlier({ set_number: 4, weight: '90', reps: '6', effort: 'Hard' }),
  ];
  const workout = (id: string, date: string, status = ''): WorkoutWithRow =>
    ({ id, date, status, type: 'weight' }) as WorkoutWithRow;
  const today = (section: string, order: number, weight = '') =>
    ['1', '2', '3', '4'].map((n) =>
      mk(section, order, 'OH Press BB', Number(n), { ...OH, workout_id: 'w_now', weight }),
    );

  afterEach(() => {
    sets.value = [];
    workouts.value = [];
  });
  const load = (rows: SetWithRow[], ws: WorkoutWithRow[]) => {
    sets.value = rows;
    workouts.value = ws;
  };

  it('the Set up next card lists the primary slot only: four rows numbered 1-4, no BW × ? row', () => {
    load(
      [...OCT21, ...today('primary', 5)],
      [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04', 'planned')],
    );
    const [ex] = setupExercises(buildSteps(today('primary', 5)), 'primary', 'w_now');
    expect(ex.last!.workoutDate).toBe('2026-10-21');
    expect(ex.last!.sets.map((s) => s.set_number)).toEqual([1, 2, 3, 4]);
    expect(ex.last!.sets.map((s) => figuresText(s))).toEqual(['90 × 8', '90 × 8', '90 × 8', '90 × 6']);
  });

  it('the set hint reads the slot: set 1 is 90 × 8 · Easy, set 4 is 90 × 6 · Hard, set 5 does not exist', () => {
    load(OCT21, [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04', 'active')]);
    const [s1, , , s4] = today('primary', 5);
    expect(lastTimeLine(lastTimeFor(s1, 'w_now'), 1)).toBe('Last time: 90 × 8 · Easy');
    expect(lastTimeLine(lastTimeFor(s4, 'w_now'), 4)).toBe('Last time: 90 × 6 · Hard');
    expect(lastTimeLine(lastTimeFor({ ...s4, set_number: 5 }, 'w_now'), 5)).toBe('No set 5 last time');
  });

  it("with no weight planned, the weight field starts at last time's set 1, not the warm-up's blank", () => {
    load(OCT21, [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04', 'active')]);
    const [ex] = setupExercises(buildSteps(today('primary', 5)), 'primary', 'w_now');
    expect(ex.startWeight).toBe('90');
  });

  it('a planned weight still wins over last time', () => {
    load(OCT21, [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04', 'active')]);
    const [ex] = setupExercises(buildSteps(today('primary', 5, '95')), 'primary', 'w_now');
    expect(ex.startWeight).toBe('95');
  });

  it('looks past a later workout where the exercise was only a warm-up', () => {
    const lateWarmup = earlier({ workout_id: 'w_oct28', section: 'warmup', exercise_order: 4 });
    load(
      [...OCT21, lateWarmup],
      [workout('w_oct21', '2026-10-21'), workout('w_oct28', '2026-10-28'), workout('w_now', '2026-11-04', 'active')],
    );
    const data = lastSession('ex_oh', 'w_now', 'primary');
    expect(data!.workoutDate).toBe('2026-10-21');
    expect(data!.sets).toHaveLength(4);
  });

  it("matches a working section to another: SS1 last time is today's primary's last time", () => {
    const ss1 = [earlier({ section: 'SS1', exercise_order: 3, set_number: 1, weight: '40', reps: '12' })];
    load(ss1, [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04', 'active')]);
    const data = lastSession('ex_oh', 'w_now', 'primary');
    expect(data!.sets.map((s) => s.section)).toEqual(['SS1']);
    expect(lastTimeLine(lastTimeFor(today('primary', 5)[0], 'w_now'), 1)).toBe('Last time: 40 × 12');
  });

  it('never takes last time from a planned workout (#674)', () => {
    const planned = earlier({ workout_id: 'w_oct28', weight: '100', reps: '5' });
    load(
      [...OCT21, planned],
      [
        workout('w_oct21', '2026-10-21'),
        workout('w_oct28', '2026-10-28', 'planned'),
        workout('w_now', '2026-11-04', 'active'),
      ],
    );
    expect(lastSession('ex_oh', 'w_now', 'primary')!.workoutDate).toBe('2026-10-21');
  });

  it('says First time doing this exercise when the exercise was only ever a warm-up', () => {
    load([OCT21[0]], [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04', 'active')]);
    expect(lastSession('ex_oh', 'w_now', 'primary')).toBeNull();
    expect(lastTimeLine(lastTimeFor(today('primary', 5)[0], 'w_now'), 1)).toBe('First time doing this exercise');
  });
});
