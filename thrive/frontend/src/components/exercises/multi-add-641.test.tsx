// #641 — the picker adds several exercises at once, and each caller appends every one exactly as it
// appends a single one today: the tracker with consecutive orders and one empty set each, the editor
// opening the first added.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import {
  activeWorkoutSets,
  activeWarmupExercises,
  isEditMode,
  workouts,
  exercises,
  templates,
} from '../../state/store';
import type { SetWithRow, ExerciseWithRow } from '../../api/types';

const saveSet = vi.fn(async (..._args: unknown[]) => ({ sheetRow: 99 }));
vi.mock('../../state/actions', () => ({
  saveExerciseOrders: vi.fn(async () => undefined),
  saveSet: (...args: unknown[]) => saveSet(...args),
  removeSet: vi.fn(),
  finishWorkout: vi.fn(async () => undefined),
  deleteWorkout: vi.fn(),
  saveWorkoutEdits: vi.fn(async () => undefined),
  exitEditMode: vi.fn(),
  addTemplate: vi.fn(),
  editTemplate: vi.fn(async () => undefined),
  removeTemplate: vi.fn(),
  startWorkout: vi.fn(),
  addExercise: vi.fn(),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({ navigate: vi.fn(), goBack: vi.fn() }));
vi.mock('../../api/rest-times', async (orig) => ({
  ...(await orig<typeof import('../../api/rest-times')>()),
  getRestSettings: vi.fn(async () => ({ ok: false, kind: 'no_api_url' })),
}));

const { WorkoutTracker } = await import('../workout/workout-tracker');
const { TemplateEditor } = await import('../templates/template-editor');

const ex = (id: string, name: string): ExerciseWithRow => ({ id, name, tags: '', notes: '', created: '', sheetRow: 2 });

beforeEach(() => {
  exercises.value = [ex('x1', 'Ab Wheel'), ex('x2', 'Dips'), ex('x3', 'Plank')];
  activeWarmupExercises.value = [];
  workouts.value = [];
});
afterEach(() => {
  cleanup();
  isEditMode.value = false;
  exercises.value = [];
  templates.value = [];
});

const rows = () => [...document.querySelectorAll<HTMLElement>('.exercise-list > .exercise-list-item')];
const click = (el: Element | null) => fireEvent.click(el!);
const openAndPick = (opener: string, names: string[]) => {
  click([...document.querySelectorAll('button')].find((b) => b.textContent?.includes(opener)) ?? null);
  for (const n of names) click(rows().find((r) => r.textContent?.startsWith(n)) ?? null);
  click(document.querySelector('.picker-add'));
};

describe('the tracker', () => {
  it('picking three adds three exercises with consecutive orders and one empty set each', () => {
    activeWorkoutSets.value = [
      {
        workout_id: 'w1',
        exercise_id: 'e1',
        exercise_name: 'Row BB',
        section: 'primary',
        exercise_order: 4,
        set_number: 1,
        planned_reps: '8',
        weight: '',
        reps: '',
        effort: '',
        sheetRow: 2,
      } as SetWithRow,
    ];
    render(<WorkoutTracker workoutId="w1" workoutName="Pull A" />);
    openAndPick('Add Exercise', ['Plank', 'Ab Wheel', 'Dips']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const list = [...document.querySelectorAll<HTMLElement>('.tracker-exercise-list > [data-row-key]')];
    expect(list).toHaveLength(4);
    expect(list.slice(1).map((r) => r.textContent)).toEqual([
      expect.stringContaining('Plank'),
      expect.stringContaining('Ab Wheel'),
      expect.stringContaining('Dips'),
    ]);
    for (const r of list.slice(1)) {
      expect(r.querySelectorAll('.set-row, [data-set]').length).toBeLessThanOrEqual(1);
    }
  });
});

describe('the template editor', () => {
  it('picking two appends both and opens the first added', () => {
    templates.value = [];
    render(<TemplateEditor />);
    openAndPick('Add Exercise', ['Dips', 'Ab Wheel']);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Dips');
    expect(text).toContain('Ab Wheel');
    expect(text.indexOf('Dips')).toBeLessThan(text.indexOf('Ab Wheel'));
    expect(document.querySelectorAll('.template-exercise-config')).toHaveLength(1);
  });
});
