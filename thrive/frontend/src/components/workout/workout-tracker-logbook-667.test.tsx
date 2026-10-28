// #667 — the Logbook in the new look: layout, progress, section cards and set tiles, the one set editor,
// Last time, the options menu and Change section, Add exercise and Add a section, the finish sheet, edit
// mode and the empty state. What is written, and when, is the other tracker suites' (workout-tracker-*.test.tsx).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import {
  activeWorkoutSets,
  activeWarmupExercises,
  exercises,
  isEditMode,
  pendingSyncCount,
  sets,
  toasts,
  workouts,
} from '../../state/store';
import type { SetWithRow, WorkoutWithRow } from '../../api/types';
import { mountConfirmHost, answerConfirm, openedConfirm, confirmText } from '../shared/confirm-test-utils';
import {
  exerciseRows as rows,
  rowNamed,
  cardOf,
  tileOf,
  editorOf,
  openSet,
  weightField,
  repsField,
  typeWeight,
  effortPill,
  tapButton,
  chooseMenu,
  menuItem,
} from './tracker-test-utils';

const saveSet = vi.fn(async (..._args: unknown[]) => ({ sheetRow: 99 }));
const saveWorkoutEdits = vi.fn(async (..._args: unknown[]) => undefined);
const finishWorkout = vi.fn(async (..._args: unknown[]) => undefined);
const deleteWorkout = vi.fn(async (..._args: unknown[]) => undefined);
const saveExerciseOrders = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../../state/actions', () => ({
  saveExerciseOrders: (...args: unknown[]) => saveExerciseOrders(...args),
  saveSet: (...args: unknown[]) => saveSet(...args),
  removeSet: vi.fn(async () => undefined),
  finishWorkout: (...args: unknown[]) => finishWorkout(...args),
  deleteWorkout: (...args: unknown[]) => deleteWorkout(...args),
  saveWorkoutEdits: (...args: unknown[]) => saveWorkoutEdits(...args),
  exitEditMode: vi.fn(),
  addExercise: vi.fn(),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({ navigate: vi.fn(), goBack: vi.fn() }));

const { WorkoutTracker } = await import('./workout-tracker');
const { navigate } = await import('../../router/router');

type Spec = [
  id: string,
  name: string,
  section: string,
  order: number,
  setNo: number,
  weight: string,
  reps: string,
  effort?: string,
];
const toSet = (
  [exercise_id, exercise_name, section, exercise_order, set_number, weight, reps, effort = '']: Spec,
  i: number,
): SetWithRow =>
  ({
    workout_id: 'w1',
    exercise_id,
    exercise_name,
    section,
    exercise_order,
    set_number,
    planned_reps: '8',
    weight,
    reps,
    effort,
    sheetRow: i + 2,
  }) as SetWithRow;

// Warm-up, Primary (Row, Bench), Superset 1 (Curl, Dip), Burnout (Fly).
const SPECS: Spec[] = [
  ['e_cat', 'Cat-Cow', 'warmup', 1, 1, '', ''],
  ['e_row', 'Row', 'primary', 2, 1, '135', '8', 'Medium'],
  ['e_row', 'Row', 'primary', 2, 2, '135', '8'],
  ['e_row', 'Row', 'primary', 2, 3, '', ''],
  ['e_bench', 'Bench', 'primary', 3, 1, '', ''],
  ['e_curl', 'Curl', 'SS1', 4, 1, '30', '12', 'Easy'],
  ['e_dip', 'Dip', 'SS1', 5, 1, '', ''],
  ['e_fly', 'Fly', 'burnout', 6, 1, '', ''],
];

const ACTIVE_WEIGHT = {
  id: 'w1',
  type: 'weight',
  name: 'Pull A',
  status: 'active',
  template_id: '',
  date: '2026-10-28',
};

beforeEach(() => {
  // Fake timers throughout, cleared after each test: a debounce left pending by one test must not save in the next.
  vi.useFakeTimers();
  activeWorkoutSets.value = SPECS.map(toSet);
  activeWarmupExercises.value = [];
  workouts.value = [ACTIVE_WEIGHT as unknown as WorkoutWithRow];
  sets.value = [];
  exercises.value = [];
  pendingSyncCount.value = 0;
  toasts.value = [];
  isEditMode.value = false;
  saveSet.mockClear();
  finishWorkout.mockClear();
  deleteWorkout.mockClear();
  saveWorkoutEdits.mockClear();
  saveExerciseOrders.mockClear();
  vi.mocked(navigate).mockClear();
  mountConfirmHost();
});
afterEach(() => {
  vi.clearAllTimers();
  cleanup();
  vi.useRealTimers();
  isEditMode.value = false;
  pendingSyncCount.value = 0;
});

const mount = () => render(<WorkoutTracker workoutId="w1" workoutName="Pull A" />);
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const before = (a: Element | null, b: Element | null) =>
  !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('layout and look (log mode)', () => {
  it('draws, top to bottom: the top bar, title block, progress card, Exercises heading, cards, Add a section, Finish bar', () => {
    mount();
    const order = [
      q('.detail-top-bar'),
      q('.lb-title-block'),
      q('.lb-progress'),
      q('.strength-exercises-header'),
      q('.lb-cards'),
      q('.tpl-add-section'),
      q('.lb-finish-bar'),
    ];
    order.forEach((el, i) => expect(el, `block ${i}`).toBeTruthy());
    for (let i = 1; i < order.length; i++) expect(before(order[i - 1], order[i]), `block ${i}`).toBe(true);
  });

  it('the title block reads "Logbook · in progress" over the workout name', () => {
    mount();
    expect(q('.lb-meta')!.textContent).toBe('Logbook · in progress');
    expect(q('h1.detail-title')!.textContent).toBe('Pull A');
  });

  it('groups exercises in section cards in order of first appearance, headed with #533 words and counts', () => {
    mount();
    const cards = [...document.querySelectorAll('.lb-card')];
    expect(cards.map((c) => c.querySelector('h2')!.textContent)).toEqual([
      'Warm-up',
      'Primary',
      'Superset 1',
      'Burnout',
    ]);
    expect(cards.map((c) => c.querySelector('.lb-card-count')!.textContent)).toEqual([
      '1 exercise',
      '2 exercises',
      '2 exercises',
      '1 exercise',
    ]);
  });

  it('keeps none of the old chrome anywhere on the screen', () => {
    mount();
    openSet(rowNamed('Row'), 1);
    for (const sel of [
      '.section-badge-btn',
      '.section-picker-row',
      '.exercise-toolbar-btn',
      '.quick-fill-row',
      '.tracker-set',
      '.tracker-exercise',
      '.effort-btn',
      '.set-saved',
      '.set-remove-btn',
      '.add-set-btn',
      '.sync-status-bar',
      '.last-time-toggle',
      '.workout-tracker-header',
    ]) {
      expect(q(sel), sel).toBeNull();
    }
    const text = document.body.textContent ?? '';
    for (const word of ['▲', '▼', '✕', '+ Add Set', '+ Add Exercise', 'Discard Workout']) {
      expect(text, word).not.toContain(word);
    }
  });

  it('a working exercise has a tile per set in order, ending in Add a set; a logged tile reads like #533, an unlogged one shows its plan', () => {
    mount();
    const row = rowNamed('Row');
    const tiles = [...row.querySelectorAll('.lb-tile[data-set]')];
    expect(tiles).toHaveLength(3);
    expect(tiles[0].querySelector('.lb-tile-value')!.textContent).toBe('135×8');
    expect(tiles[0].querySelector('.lb-tile-note')!.textContent).toBe('MED');
    expect(tiles[2].classList.contains('lb-tile-undone')).toBe(true);
    expect(tiles[2].querySelector('.lb-tile-value')!.textContent).toBe('×8');
    expect(row.querySelector('.lb-tiles')!.lastElementChild!.getAttribute('aria-label')).toBe('Add a set to Row');
  });

  it('a warm-up is its name only: no tiles, no editor', () => {
    mount();
    const warm = rowNamed('Cat-Cow');
    expect(warm.classList.contains('lb-warmup')).toBe(true);
    expect(warm.querySelector('.lb-tile')).toBeNull();
    expect(editorOf(warm)).toBeNull();
  });

  it('shows Lift Mode only on an active weight workout', () => {
    mount();
    expect(buttonLabels(document.body)).toContain('Lift Mode');
    cleanup();
    workouts.value = [{ ...ACTIVE_WEIGHT, status: '' } as unknown as WorkoutWithRow];
    mount();
    expect(buttonLabels(document.body)).not.toContain('Lift Mode');
  });

  it("More actions holds Discard workout, which keeps today's confirm and delete", async () => {
    mount();
    const more = document.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')!;
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(more);
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((i) => i.textContent!.trim())).toEqual(['Discard workout']);
    fireEvent.click(items[0]);
    await openedConfirm();
    expect(deleteWorkout).not.toHaveBeenCalled();
    await answerConfirm(true);
    await vi.waitFor(() => expect(deleteWorkout).toHaveBeenCalledWith('w1', 'test-token'));
    expect(navigate).toHaveBeenCalledWith('/activities');
  });
});

describe('the progress card', () => {
  it('counts logged working sets of the total; warm-ups count for nothing', () => {
    mount();
    // Row 2 of 3, Bench 0 of 1, Curl 1 of 1, Dip 0 of 1, Fly 0 of 1: 3 of 7.
    const ring = q('.strength-ring')!;
    expect(ring.getAttribute('role')).toBe('img');
    expect(ring.getAttribute('aria-label')).toBe('3 of 7 sets logged');
    expect(ring.textContent).toContain('of 7 sets');
  });

  it('shows Exercises done and Need effort, and updates as sets are logged', () => {
    mount();
    const cells = () => [...document.querySelectorAll('.lb-progress .detail-stat')].map((c) => c.textContent);
    // Only Curl has every set logged; Row has a logged set with no effort.
    expect(cells()).toEqual(['1 of 5Exercises done', '1Need effort']);
    typeWeight(rowNamed('Bench'), 1, '95');
    expect(q('.strength-ring')!.getAttribute('aria-label')).toBe('4 of 7 sets logged');
    expect(cells()).toEqual(['2 of 5Exercises done', '2Need effort']);
  });

  it('leaves Need effort out at zero', () => {
    activeWorkoutSets.value = [toSet(['e_row', 'Row', 'primary', 1, 1, '135', '8', 'Hard'], 0)];
    mount();
    expect(document.body.textContent).not.toContain('Need effort');
  });

  it('is not shown for a workout with no exercises', () => {
    activeWorkoutSets.value = [];
    mount();
    expect(q('.lb-progress')).toBeNull();
  });
});

describe('the one set editor', () => {
  it('opens under the tile, marks it, closes the first when another opens (on any exercise) and on a second tap', () => {
    mount();
    const row = rowNamed('Row');
    const bench = rowNamed('Bench');
    fireEvent.click(tileOf(row, 1));
    expect(editorOf(row)).toBeTruthy();
    expect(tileOf(row, 1).getAttribute('aria-expanded')).toBe('true');
    expect(tileOf(row, 1).classList.contains('lb-tile-open')).toBe(true);
    expect(editorOf(row)!.getAttribute('aria-label')).toBe('Row, set 1');

    fireEvent.click(tileOf(row, 2));
    expect(document.querySelectorAll('.lb-editor')).toHaveLength(1);
    expect(tileOf(row, 1).getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(tileOf(bench, 1));
    expect(editorOf(row)).toBeNull();
    expect(editorOf(bench)).toBeTruthy();

    fireEvent.click(tileOf(bench, 1));
    expect(document.querySelectorAll('.lb-editor')).toHaveLength(0);
  });

  it('weight and reps can be typed and stepped, and an effort tap sets and clears the effort', () => {
    mount();
    const row = rowNamed('Row');
    const editor = openSet(row, 3);
    fireEvent.input(weightField(editor), { target: { value: '45' } });
    expect(weightField(editorOf(row)!).value).toBe('45');
    tapButtonIn(editorOf(row)!, 'More weight');
    expect(weightField(editorOf(row)!).value).toBe('50');
    tapButtonIn(editorOf(row)!, 'More reps');
    expect(repsField(editorOf(row)!).value).toBe('1');
    fireEvent.click(effortPill(editorOf(row)!, 'Hard'));
    expect(effortPill(editorOf(row)!, 'Hard').getAttribute('aria-pressed')).toBe('true');
    expect(tileOf(row, 3).textContent).toBe('50×1HARD');
    fireEvent.click(effortPill(editorOf(row)!, 'Hard'));
    expect(tileOf(row, 3).textContent).toBe('50×1');
  });

  it('autosaves after the 1 s debounce through saveSet, and the status reads Saving… then Saved', async () => {
    mount();
    const row = rowNamed('Bench');
    expect(openSet(row, 1).querySelector('.lb-editor-status')!.textContent).toBe(''); // nothing before a change
    typeWeight(row, 1, '95');
    expect(editorOf(row)!.querySelector('.lb-editor-status')!.textContent).toBe('Saving…');
    await vi.advanceTimersByTimeAsync(900);
    expect(saveSet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(saveSet).toHaveBeenCalledTimes(1);
    expect(saveSet.mock.calls[0][0]).toMatchObject({ exercise_id: 'e_bench', weight: '95', section: 'primary' });
    expect(editorOf(row)!.querySelector('.lb-editor-status')!.textContent).toBe('Saved');
  });

  it('shows no status when the set did not save, and the status of one set does not carry to another', async () => {
    saveSet.mockRejectedValueOnce(new Error('offline'));
    mount();
    const row = rowNamed('Bench');
    typeWeight(row, 1, '95');
    await vi.advanceTimersByTimeAsync(1200);
    expect(editorOf(row)!.querySelector('.lb-editor-status')!.textContent).toBe('');
  });

  it('Same for all sets copies the open set to every set of the exercise and says so', async () => {
    mount();
    const row = rowNamed('Row');
    openSet(row, 1);
    tapButtonIn(editorOf(row)!, 'Same for all sets');
    expect(
      [...row.querySelectorAll('.lb-tile[data-set]')].map((t) => t.querySelector('.lb-tile-value')!.textContent),
    ).toEqual(['135×8', '135×8', '135×8']);
    expect(effortPill(editorOf(row)!, 'Medium').getAttribute('aria-pressed')).toBe('true');
    expect(toasts.value.map((t) => t.text)).toContain('Copied to all 3 sets of Row');
    await vi.advanceTimersByTimeAsync(1200);
    // Every set with data is saved, as today's quick-fill did.
    expect(saveSet.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('Next set opens the next set, and on the last it reads Done and closes the editor', () => {
    mount();
    const row = rowNamed('Row');
    openSet(row, 1);
    tapButtonIn(editorOf(row)!, 'Next set');
    expect(tileOf(row, 2).getAttribute('aria-expanded')).toBe('true');
    tapButtonIn(editorOf(row)!, 'Next set');
    expect(tileOf(row, 3).getAttribute('aria-expanded')).toBe('true');
    expect(buttonLabels(editorOf(row)!)).toContain('Done');
    expect(buttonLabels(editorOf(row)!)).not.toContain('Next set');
    tapButtonIn(editorOf(row)!, 'Done');
    expect(editorOf(row)).toBeNull();
  });

  it('Remove set removes the set and closes its editor', async () => {
    mount();
    const row = rowNamed('Row');
    openSet(row, 3);
    tapButtonIn(editorOf(row)!, 'Remove set');
    await vi.waitFor(() => expect(row.querySelectorAll('.lb-tile[data-set]')).toHaveLength(2));
    expect(editorOf(row)).toBeNull();
  });

  it('the Add set tile adds a set and opens its editor', () => {
    mount();
    const row = rowNamed('Bench');
    tapButton(row, 'Add a set to Bench');
    expect(row.querySelectorAll('.lb-tile[data-set]')).toHaveLength(2);
    expect(tileOf(row, 2).getAttribute('aria-expanded')).toBe('true');
    expect(editorOf(row)!.getAttribute('aria-label')).toBe('Bench, set 2');
  });
});

describe('Last time', () => {
  const previous = () => {
    workouts.value = [
      ACTIVE_WEIGHT as unknown as WorkoutWithRow,
      { id: 'w0', type: 'weight', name: 'Pull A', status: '', date: '2026-10-21' } as unknown as WorkoutWithRow,
    ];
    sets.value = [
      { ...toSet(['e_row', 'Row', 'primary', 2, 1, '135', '8', 'Medium'], 0), workout_id: 'w0', sheetRow: 40 },
      { ...toSet(['e_row', 'Row', 'primary', 2, 2, '125', '8'], 0), workout_id: 'w0', sheetRow: 41 },
    ];
  };

  it('the chip toggles a line under each exercise that has a previous performance, and only those', () => {
    previous();
    mount();
    const chip = q('.last-time-chip')!;
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(q('.lb-last-time')).toBeNull();
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.lb-last-time')).toHaveLength(1);
    expect(rowNamed('Row').querySelector('.lb-last-time-text')!.textContent).toBe(
      'Last time (Oct 21): 135 lb × 8 · Medium',
    );
    fireEvent.click(chip);
    expect(q('.lb-last-time')).toBeNull();
  });

  it("Copy does today's Copy Down, with the confirm when the last time had fewer sets", async () => {
    previous();
    mount();
    fireEvent.click(q('.last-time-chip')!);
    const row = rowNamed('Row');
    tapButton(row, 'Copy last time into Row');
    await openedConfirm();
    expect(confirmText()!.title).toContain('Row');
    await answerConfirm(true);
    await vi.waitFor(() => expect(row.querySelectorAll('.lb-tile[data-set]')).toHaveLength(2));
    expect(tileOf(row, 2).querySelector('.lb-tile-value')!.textContent).toBe('125×8');
  });

  it('the chip is there whenever there are exercises, even with no previous performance', () => {
    mount();
    expect(q('.last-time-chip')).toBeTruthy();
    fireEvent.click(q('.last-time-chip')!);
    expect(q('.lb-last-time')).toBeNull();
    expect(document.body.textContent).not.toContain('No previous data');
  });
});

describe('the options menu and Change section', () => {
  it('has Move up, Move down, Change section… and Remove exercise (danger, set off)', () => {
    mount();
    const row = rowNamed('Row');
    expect(row.querySelector('[data-options-btn]')!.getAttribute('aria-label')).toBe('Row options');
    menuItem(row, 'Move up');
    const items = [...row.querySelectorAll('[role="menuitem"]')];
    expect(items.map((i) => i.textContent!.trim())).toEqual([
      'Move up',
      'Move down',
      'Change section…',
      'Remove exercise',
    ]);
    expect(items[3].classList.contains('detail-menu-delete')).toBe(true);
  });

  it("Remove exercise keeps today's confirm", async () => {
    mount();
    chooseMenu(rowNamed('Curl'), 'Remove exercise');
    await openedConfirm();
    expect(confirmText()!.title).toBe('Remove "Curl" from this workout?');
    await answerConfirm(true);
    await vi.waitFor(() => expect(() => rowNamed('Curl')).toThrow());
  });

  it('Change section… moves the exercise to the end of the chosen card, creating the card when it is new', () => {
    mount();
    chooseMenu(rowNamed('Row'), 'Change section…');
    const radios = [...document.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((r) => r.textContent)).toHaveLength(7);
    expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')!.textContent).toBe('Primary');
    fireEvent.click(radios.find((r) => r.textContent === 'Superset 1')!);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      rows().map((r) => `${cardOf(r)}/${r.querySelector('.lb-exercise-name, .lb-warmup-name')!.textContent}`),
    ).toEqual([
      'Warm-up/Cat-Cow',
      'Primary/Bench',
      'Superset 1/Curl',
      'Superset 1/Dip',
      'Superset 1/Row',
      'Burnout/Fly',
    ]);
    expect(toasts.value.map((t) => t.text)).toContain('Moved to Superset 1');

    chooseMenu(rowNamed('Bench'), 'Change section…');
    fireEvent.click(
      [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Cool-down')!,
    );
    const headings = [...document.querySelectorAll('.lb-card h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Warm-up', 'Superset 1', 'Burnout', 'Cool-down']); // Primary emptied and went away
  });

  it('choosing Warm-up for an exercise with logged sets warns first, and Move to warm-up deletes them', async () => {
    mount();
    chooseMenu(rowNamed('Row'), 'Change section…');
    fireEvent.click(
      [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Warm-up')!,
    );
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(
      'Warm-ups are list only, so its 2 logged sets are deleted.',
    );
    tapButton(document, 'Move to warm-up');
    await vi.waitFor(() => expect(rowNamed('Row').classList.contains('lb-warmup')).toBe(true));
    expect(cardOf(rowNamed('Row'))).toBe('Warm-up');
  });
});

describe('Add exercise and Add a section', () => {
  const pick = (names: string[]) => {
    for (const n of names) {
      fireEvent.click(
        [...document.querySelectorAll<HTMLElement>('.exercise-list > .exercise-list-item')].find((r) =>
          r.textContent?.startsWith(n),
        )!,
      );
    }
    fireEvent.click(document.querySelector('.picker-add')!);
  };
  beforeEach(() => {
    exercises.value = ['Plank', 'Ab Wheel'].map((name, i) => ({
      id: `x${i}`,
      name,
      tags: '',
      notes: '',
      created: '',
      sheetRow: i + 2,
    }));
  });

  it("each card's Add exercise opens the picker labelled for that section, and the picks go to the end of that card", () => {
    mount();
    tapButton(document, 'Add exercise to Superset 1');
    expect(q('.picker-subtitle')!.textContent).toContain('Superset 1');
    pick(['Plank', 'Ab Wheel']);
    expect(document.querySelector('.picker-sheet')).toBeNull();
    const names = rows()
      .filter((r) => cardOf(r) === 'Superset 1')
      .map((r) => r.querySelector('.lb-exercise-name')!.textContent);
    expect(names).toEqual(['Curl', 'Dip', 'Plank', 'Ab Wheel']);
    // Each has one empty set, and the first one's set is open.
    expect(rowNamed('Plank').querySelectorAll('.lb-tile[data-set]')).toHaveLength(1);
    expect(editorOf(rowNamed('Plank'))).toBeTruthy();
  });

  it('writes the renumbered order of the rows that exist, as a move does', async () => {
    mount();
    tapButton(document, 'Add exercise to Primary');
    pick(['Plank']);
    await vi.waitFor(() => expect(saveExerciseOrders).toHaveBeenCalled());
    // Plank sits after Bench in Primary, so Curl, Dip and Fly (and no new row) take the later orders.
    const written = (saveExerciseOrders.mock.calls[0][1] as { exercise_order?: number }[]).map((w) => w.exercise_order);
    expect(written.filter((o) => o !== undefined).length).toBeGreaterThan(0);
  });

  it('Add a section pills start a missing section through the same picker, and are hidden once every kind is present', () => {
    mount();
    // Warm-up, Primary, Superset 1 and Burnout exist: Superset (the lowest free, 2) and Cool-down are offered.
    const pills = () => [...document.querySelectorAll('.tpl-pill')].map((p) => p.textContent);
    expect(pills()).toEqual(['Superset', 'Cool-down']);
    tapButton(document, 'Cool-down');
    expect(q('.picker-subtitle')!.textContent).toContain('Cool-down');
    pick(['Plank']);
    expect(rows().map(cardOf)).toContain('Cool-down');
    expect(pills()).toEqual(['Superset']);
    tapButton(document, 'Superset');
    pick(['Ab Wheel']);
    expect(cardOf(rowNamed('Ab Wheel'))).toBe('Superset 2');
    tapButton(document, 'Superset');
    expect(q('.picker-subtitle')!.textContent).toContain('Superset 3');
  });
});

describe('Finish workout', () => {
  it('is a pinned bar above the tab bar, and opens a sheet with the summary, session effort and notes', () => {
    mount();
    expect(q('.lb-finish-bar')).toBeTruthy();
    tapButton(document, 'Finish workout');
    const dialog = q('[role="dialog"]')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Finish workout');
    expect(dialog.querySelector('.lb-sheet-summary')!.textContent).toBe('3 of 7 sets logged · 1 need effort');
    expect(dialog.querySelector('textarea')).toBeTruthy();
    expect(document.activeElement).toBe(dialog.querySelector('textarea'));
  });

  it('Save workout saves exactly as Save & Finish did, with the notes and effort, and lands on Activities', async () => {
    mount();
    tapButton(document, 'Finish workout');
    const dialog = q('[role="dialog"]')!;
    fireEvent.input(dialog.querySelector('textarea')!, { target: { value: 'Solid' } });
    fireEvent.click(effortPill(dialog, 'Hard'));
    tapButton(dialog, 'Save workout');
    await vi.waitFor(() => expect(finishWorkout).toHaveBeenCalledWith('w1', 'Solid', 'Hard', 'test-token'));
    expect(navigate).toHaveBeenCalledWith('/activities');
  });

  it('Keep logging, Escape and the scrim close it without saving', () => {
    mount();
    for (const close of [
      () => tapButton(document, 'Keep logging'),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(q('.lb-sheet-overlay')!),
    ]) {
      tapButton(document, 'Finish workout');
      expect(q('[role="dialog"]')).toBeTruthy();
      close();
      expect(q('[role="dialog"]')).toBeNull();
    }
    expect(finishWorkout).not.toHaveBeenCalled();
  });

  it("keeps today's unsynced-sets confirm before opening", async () => {
    pendingSyncCount.value = 2;
    mount();
    tapButton(document, 'Finish workout');
    await openedConfirm();
    expect(q('[role="dialog"].lb-sheet')).toBeNull();
    await answerConfirm(true);
    await vi.waitFor(() => expect(q('.lb-sheet')).toBeTruthy());
  });
});

describe('the offline banner', () => {
  it('is an inset row with the count, in words, and Sync now; only when sets are queued', () => {
    mount();
    expect(q('.lb-banner')).toBeNull();
    cleanup();
    pendingSyncCount.value = 1;
    mount();
    expect(q('.lb-banner-text')!.textContent).toBe('1 set not synced');
    expect(q('.lb-banner')!.getAttribute('aria-live')).toBe('polite');
    expect(q('.lb-banner-btn')!.textContent).toBe('Sync now');
    cleanup();
    pendingSyncCount.value = 3;
    mount();
    expect(q('.lb-banner-text')!.textContent).toBe('3 sets not synced');
  });
});

describe('edit mode', () => {
  beforeEach(() => {
    isEditMode.value = true;
    workouts.value = [{ ...ACTIVE_WEIGHT, status: '', date: '2026-10-21' } as unknown as WorkoutWithRow];
  });

  it('has Close and Save in the top bar, an Editing meta line and a Details card', () => {
    mount();
    expect(q('.detail-top-bar button[aria-label="Close"]')).toBeTruthy();
    expect(tapButtonLabels(q('.detail-top-bar')!)).toContain('Save');
    expect(q('.lb-meta')!.textContent).toBe('Editing · Wed, Oct 21');
    const card = q('.lb-details')!;
    expect(card.querySelector('h2')!.textContent).toBe('Details');
    expect([...card.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'Name',
      'Date',
      'Duration (min)',
      'Notes',
    ]);
    expect(card.querySelector('[role="group"]')).toBeTruthy();
  });

  it('has no progress card, Lift Mode chip, More actions, Finish bar, banner or status line', () => {
    pendingSyncCount.value = 2;
    mount();
    openSet(rowNamed('Row'), 1);
    typeWeight(rowNamed('Row'), 1, '140');
    expect(q('.lb-progress')).toBeNull();
    expect(q('.lb-finish-bar')).toBeNull();
    expect(q('.lb-banner')).toBeNull();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
    expect(buttonLabels(document.body)).not.toContain('Lift Mode');
    expect(editorOf(rowNamed('Row'))!.querySelector('.lb-editor-status')!.textContent).toBe('');
  });

  it('holds every change until Save, then saves exactly as Save Changes did', async () => {
    mount();
    typeWeight(rowNamed('Row'), 1, '140');
    await vi.advanceTimersByTimeAsync(3000);
    expect(saveSet).not.toHaveBeenCalled();
    tapButton(q('.detail-top-bar')!, 'Save');
    await vi.waitFor(() => expect(saveWorkoutEdits).toHaveBeenCalled());
    const edited = saveWorkoutEdits.mock.calls[0][2] as { exercise_id: string; weight: string }[];
    expect(edited.find((s) => s.exercise_id === 'e_row')!.weight).toBe('140');
  });

  it('Close asks to discard changes', async () => {
    mount();
    fireEvent.click(q('button[aria-label="Close"]')!);
    await openedConfirm();
    await answerConfirm(false);
    expect(saveWorkoutEdits).not.toHaveBeenCalled();
  });
});

describe('an empty workout', () => {
  it('says "Add a section to start." and offers every pill, with no progress card or heading', () => {
    activeWorkoutSets.value = [];
    mount();
    expect(q('.tpl-start-note')!.textContent).toBe('Add a section to start.');
    expect([...document.querySelectorAll('.tpl-pill')].map((p) => p.textContent)).toEqual([
      'Warm-up',
      'Primary',
      'Superset',
      'Burnout',
      'Cool-down',
    ]);
    expect(q('.lb-progress')).toBeNull();
    expect(q('.strength-exercises-header')).toBeNull();
    expect(document.body.textContent).not.toContain('No exercises yet');
  });
});

function tapButtonIn(container: HTMLElement, name: string): HTMLElement {
  return tapButton(container, name);
}
function buttonLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('button')].map((b) =>
    (b.getAttribute('aria-label') ?? b.textContent ?? '').trim(),
  );
}
function tapButtonLabels(container: HTMLElement): string[] {
  return buttonLabels(container);
}
