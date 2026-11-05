// #817 — the Logbook's Last time line and Copy read one slot of the earlier workout, over the real store.
// The Oct 21 case: OH Press BB was a warm-up at order 4 (nothing logged) and the primary at order 5.
import { describe, it, expect, afterEach } from 'vitest';
import type { SetWithRow, WorkoutWithRow } from '../../api/types';
import { sets, workouts } from '../../state/store';
import { lastTimeText } from './last-time-panel';
import { applyCopyDown } from './copy-down';
import type { TrackerExercise } from './exercise-row';

const row = (extra: Partial<SetWithRow>): SetWithRow => ({
  workout_id: 'w_oct21',
  exercise_id: 'ex_oh',
  exercise_name: 'OH Press BB',
  section: 'primary',
  exercise_order: 5,
  set_number: 1,
  planned_reps: '8',
  weight: '90',
  reps: '8',
  effort: 'Easy',
  sheetRow: 2,
  ...extra,
});

const OCT21: SetWithRow[] = [
  row({ section: 'warmup', exercise_order: 4, planned_reps: '', weight: '', reps: '', effort: '' }),
  row({ set_number: 1 }),
  row({ set_number: 2, effort: 'Medium' }),
  row({ set_number: 3, effort: 'Hard' }),
  row({ set_number: 4, reps: '6', effort: 'Hard' }),
];

const workout = (id: string, date: string): WorkoutWithRow =>
  ({ id, date, status: '', type: 'weight' }) as WorkoutWithRow;

afterEach(() => {
  sets.value = [];
  workouts.value = [];
});

describe('the Logbook reads one slot (#817)', () => {
  const load = (extra: SetWithRow[] = [], extraWorkouts: WorkoutWithRow[] = []) => {
    sets.value = [...OCT21, ...extra];
    workouts.value = [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04'), ...extraWorkouts];
  };

  it("the primary's line is the primary's best set, and Copy hands over exactly its four sets", () => {
    load();
    const last = lastTimeText('ex_oh', 'w_now', 'primary')!;
    expect(last.text).toBe('Last time (Oct 21): 90 lb × 8 · Easy');
    expect(last.sets.map((s) => s.set_number)).toEqual([1, 2, 3, 4]);

    const exercise: TrackerExercise = {
      exercise_id: 'ex_oh',
      exercise_name: 'OH Press BB',
      section: 'primary',
      exercise_order: 5,
      sets: [1, 2, 3].map((n) => ({
        set_number: n,
        planned_reps: '8',
        weight: '',
        reps: '',
        effort: '' as const,
        saved: false,
        sheetRow: -1,
      })),
      quickFillWeight: '',
      quickFillReps: '',
      quickFillEffort: '',
    };
    const { exercises } = applyCopyDown([exercise], 'ex_oh', 5, last.sets);
    expect(exercises[0].sets.map((s) => [s.set_number, s.weight, s.reps])).toEqual([
      [1, '90', '8'],
      [2, '90', '8'],
      [3, '90', '8'],
      [4, '90', '6'],
    ]);
  });

  it('a warm-up that logged nothing has no line, so no Copy, rather than the primary figures', () => {
    load();
    expect(lastTimeText('ex_oh', 'w_now', 'warmup')).toBeNull();
  });

  it('a warm-up that logged 8 reps has a line, and Copy hands over that one set', () => {
    sets.value = OCT21.map((s) => (s.section === 'warmup' ? { ...s, reps: '8' } : s));
    workouts.value = [workout('w_oct21', '2026-10-21'), workout('w_now', '2026-11-04')];
    const last = lastTimeText('ex_oh', 'w_now', 'warmup')!;
    expect(last.text).toBe('Last time (Oct 21): BW × 8');
    expect(last.sets).toHaveLength(1);
    expect(last.sets[0].section).toBe('warmup');
  });

  it("a later workout that only warmed up does not hide the primary's four sets", () => {
    load(
      [row({ workout_id: 'w_oct28', section: 'warmup', exercise_order: 4, weight: '', reps: '' })],
      [workout('w_oct28', '2026-10-28')],
    );
    const last = lastTimeText('ex_oh', 'w_now', 'primary')!;
    expect(last.text.startsWith('Last time (Oct 21):')).toBe(true);
    expect(last.sets).toHaveLength(4);
  });
});
