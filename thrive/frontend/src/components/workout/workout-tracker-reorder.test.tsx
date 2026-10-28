// #371 — Move up/down in the workout tracker (log and edit mode): focus follows
// the moved exercise, ends are aria-disabled, each move is announced once in
// the shared wording, and a row keeps its own state. #667: the moves are items in
// each exercise's options menu and stay within the exercise's section. The
// list holds "Row BB" twice, so rows must be told apart by more than
// exercise_id. The row key is client-only: no payload may carry it.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { activeWorkoutSets, activeWarmupExercises, isEditMode, workouts } from '../../state/store';
import type { SetWithRow } from '../../api/types';
import { exerciseRows as rows, cardOf, menuItem, chooseMenu, editorOf, typeWeight } from './tracker-test-utils';

const saveSet = vi.fn(async (..._args: unknown[]) => ({ sheetRow: 99 }));
const saveWorkoutEdits = vi.fn(async (..._args: unknown[]) => undefined);
const finishWorkout = vi.fn(async (..._args: unknown[]) => undefined);
const saveExerciseOrders = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../state/actions', () => ({
  saveExerciseOrders: (...args: unknown[]) => saveExerciseOrders(...args),
  saveSet: (...args: unknown[]) => saveSet(...args),
  removeSet: vi.fn(),
  finishWorkout: (...args: unknown[]) => finishWorkout(...args),
  deleteWorkout: vi.fn(),
  saveWorkoutEdits: (...args: unknown[]) => saveWorkoutEdits(...args),
  exitEditMode: vi.fn(),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({ navigate: vi.fn(), goBack: vi.fn() }));

const { WorkoutTracker } = await import('./workout-tracker');

const LIST: [string, string, string][] = [
  ['e1', 'Row BB', 'primary'],
  ['e2', 'Pull-up', 'primary'],
  ['e1', 'Row BB', 'SS1'],
  ['e3', 'Curl', 'burnout'],
];

function setRows(): SetWithRow[] {
  return LIST.map(([exercise_id, exercise_name, section], i) => ({
    workout_id: 'w1',
    exercise_id,
    exercise_name,
    section,
    exercise_order: i + 1,
    set_number: 1,
    planned_reps: '8',
    weight: '',
    reps: '',
    effort: '',
    sheetRow: i + 2,
  }));
}

beforeEach(() => {
  activeWorkoutSets.value = setRows();
  activeWarmupExercises.value = [];
  workouts.value = [];
  saveSet.mockClear();
  saveExerciseOrders.mockClear();
  saveWorkoutEdits.mockClear();
  finishWorkout.mockClear();
});
afterEach(() => {
  cleanup();
  isEditMode.value = false;
});

const sections = () => rows().map(cardOf);
const names = () => rows().map((r) => r.querySelector('.lb-exercise-name')!.textContent);
const trigger = (row: number) => rows()[row].querySelector<HTMLButtonElement>('[data-options-btn]')!;
const status = () => document.querySelector('.workout-tracker > [role="status"]')!;

const modes: [string, boolean][] = [
  ['log mode', false],
  ['edit mode', true],
];

describe.each(modes)('%s', (_name, edit) => {
  const mount = () => {
    isEditMode.value = edit;
    return render(<WorkoutTracker workoutId="w1" workoutName="Pull A" />);
  };

  it('rows carry distinct row keys on the root element', () => {
    mount();
    const keys = rows().map((r) => r.dataset.rowKey);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    rows().forEach((r) => expect(r.classList.contains('lb-exercise')).toBe(true));
  });

  it('draws one card per section, in order of first appearance', () => {
    mount();
    expect(sections()).toEqual(['Primary', 'Primary', 'Superset 1', 'Burnout']);
  });

  it('AC1 + AC3: a move stays inside the section, focus follows the moved row, and pressing again moves it again', () => {
    mount();
    // Pull-up, second of the Primary card.
    const key = rows()[1].dataset.rowKey;
    chooseMenu(rows()[1], 'Move up');
    expect(names()).toEqual(['Pull-up', 'Row BB', 'Row BB', 'Curl']);
    expect(rows()[0].dataset.rowKey).toBe(key);
    expect(document.activeElement).toBe(trigger(0));
    expect(status().textContent).toBe('Pull-up moved to position 1 of 2');

    // At the top of its card now: Move up is aria-disabled and does nothing.
    expect(menuItem(rows()[0], 'Move up').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(menuItem(rows()[0], 'Move up'));
    expect(names()).toEqual(['Pull-up', 'Row BB', 'Row BB', 'Curl']);
  });

  it('AC1: Move down moves within the section and announces the position inside it', () => {
    mount();
    chooseMenu(rows()[0], 'Move down');
    expect(names()).toEqual(['Pull-up', 'Row BB', 'Row BB', 'Curl']);
    expect(sections()).toEqual(['Primary', 'Primary', 'Superset 1', 'Burnout']);
    expect(document.activeElement).toBe(trigger(1));
    expect(status().textContent).toBe('Row BB moved to position 2 of 2');
  });

  it('AC2: end items are aria-disabled, not disabled, and do nothing', () => {
    mount();
    const top = menuItem(rows()[0], 'Move up');
    expect(top.getAttribute('aria-disabled')).toBe('true');
    expect(top.hasAttribute('disabled')).toBe(false);
    expect(top.querySelector('span')).not.toBeNull();
    fireEvent.click(top);
    expect(names()).toEqual(['Row BB', 'Pull-up', 'Row BB', 'Curl']);
    expect(status().textContent).toBe('');
    // The last of Primary cannot move down into Superset 1.
    expect(menuItem(rows()[1], 'Move down').getAttribute('aria-disabled')).toBe('true');
    // A section of one cannot move at all.
    expect(menuItem(rows()[2], 'Move up').getAttribute('aria-disabled')).toBe('true');
    expect(menuItem(rows()[2], 'Move down').getAttribute('aria-disabled')).toBe('true');
    expect(menuItem(rows()[1], 'Move up').hasAttribute('aria-disabled')).toBe(false);
  });

  it('AC4: an open set editor travels with the row; set values are kept', () => {
    mount();
    const row = rows()[1];
    typeWeight(row, 1, '135');
    chooseMenu(row, 'Move up');
    const moved = rows()[0];
    expect(moved).toBe(row);
    expect(editorOf(moved)).not.toBeNull();
    expect(editorOf(moved)!.querySelector<HTMLInputElement>('input.lb-step-input')!.value).toBe('135');
    // The row it swapped with did not pick up the open state.
    expect(editorOf(rows()[1])).toBeNull();
  });

  it('AC5: one announcement per move, in the shared wording', () => {
    mount();
    chooseMenu(rows()[1], 'Move up');
    expect(status().textContent).toBe('Pull-up moved to position 1 of 2');
    expect(document.querySelectorAll('.workout-tracker > [role="status"]')).toHaveLength(1);
  });

  it('a duplicate in another section is told apart by its row key', () => {
    mount();
    // Row BB appears in Primary and Superset 1; moving the Primary one does not touch the other.
    const superset = rows()[2].dataset.rowKey;
    chooseMenu(rows()[0], 'Move down');
    expect(rows()[2].dataset.rowKey).toBe(superset);
    expect(sections()[2]).toBe('Superset 1');
  });
});

describe('AC6: the row key never reaches a payload', () => {
  it('edit-mode save swaps exercise_order and carries no rowKey', async () => {
    isEditMode.value = true;
    const view = render(<WorkoutTracker workoutId="w1" workoutName="Pull A" />);
    chooseMenu(rows()[1], 'Move up');
    fireEvent.click(view.getByText('Save'));
    await vi.waitFor(() => expect(saveWorkoutEdits).toHaveBeenCalled());
    const edited = saveWorkoutEdits.mock.calls[0][2] as Record<string, unknown>[];
    expect(JSON.stringify(saveWorkoutEdits.mock.calls[0])).not.toContain('row-');
    for (const s of edited) expect(Object.keys(s)).not.toContain('rowKey');
    expect(saveExerciseOrders).not.toHaveBeenCalled(); // #392 AC6: edit mode writes at Save Changes
    // Pull-up and the Primary Row BB swapped orders (1 and 2); the others are unmoved.
    expect(edited.find((s) => s.exercise_id === 'e2')!.exercise_order).toBe(1);
    expect(edited.find((s) => s.section === 'primary' && s.exercise_id === 'e1')!.exercise_order).toBe(2);
    expect(edited.find((s) => s.section === 'SS1')!.exercise_order).toBe(3);
  });

  it('finish saves sets with the swapped order and no rowKey', async () => {
    const view = render(<WorkoutTracker workoutId="w1" workoutName="Pull A" />);
    // The Superset 1 copy of Row BB, logged, then Pull-up moved above the Primary Row BB.
    typeWeight(rows()[2], 1, '135');
    chooseMenu(rows()[1], 'Move up');
    fireEvent.click(view.getByText('Finish workout'));
    fireEvent.click(await view.findByText('Save workout'));
    await vi.waitFor(() => expect(finishWorkout).toHaveBeenCalled());
    const payload = saveSet.mock.calls[saveSet.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain('rowKey');
    expect(payload).toMatchObject({ exercise_id: 'e1', section: 'SS1', exercise_order: 3, weight: '135' });
    // #392: the order writes carry rows and orders only.
    expect(saveExerciseOrders).toHaveBeenCalled();
    expect(JSON.stringify(saveExerciseOrders.mock.calls)).not.toMatch(/rowKey|row-/);
  });
});
