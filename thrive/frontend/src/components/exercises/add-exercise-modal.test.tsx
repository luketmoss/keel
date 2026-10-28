// #319 — the exercise picker is a keyboard- and screen-reader-operable dialog.
// #641 — it is a bottom sheet that adds several exercises at once.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { useState } from 'preact/hooks';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));
const addExercise = vi.fn();
vi.mock('../../state/actions', () => ({ addExercise: (...a: unknown[]) => addExercise(...a) }));

import { AddExerciseModal } from './add-exercise-modal';
import { exercises, labels, sets, workouts } from '../../state/store';
import type { ExerciseWithRow, SetWithRow, WorkoutWithRow } from '../../api/types';

const ex = (id: string, name: string, tags = ''): ExerciseWithRow => ({
  id,
  name,
  tags,
  notes: '',
  created: '',
  sheetRow: 2,
});

beforeEach(() => {
  exercises.value = [ex('e2', 'Squat', 'Legs, Compound'), ex('e1', 'Ab Wheel', 'Core'), ex('e3', 'Plank')];
  labels.value = [
    { id: 'l1', name: 'Core', color_key: 'red', created: '', sheetRow: 2 },
    { id: 'l2', name: 'Legs', color_key: 'blue', created: '', sheetRow: 3 },
  ];
});

afterEach(() => {
  cleanup();
  exercises.value = [];
  labels.value = [];
  workouts.value = [];
  sets.value = [];
  addExercise.mockReset();
});

/** A caller like the template editor: an opener that stays mounted. */
function Caller({
  onAdd = () => {},
  onClose = () => {},
  sectionLabel,
}: {
  onAdd?: (e: ExerciseWithRow[]) => void;
  onClose?: () => void;
  sectionLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return h('div', {}, [
    h('button', { id: 'add', onClick: () => setOpen(true) }, '+ Add Exercise'),
    open &&
      h(AddExerciseModal, {
        sectionLabel,
        onAdd: (e: ExerciseWithRow[]) => {
          onAdd(e);
          setOpen(false);
        },
        onClose: () => {
          onClose();
          setOpen(false);
        },
      }),
  ]);
}

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const addBtn = () => $('.picker-add') as HTMLButtonElement;
const rows = () => [...document.querySelectorAll<HTMLElement>('.exercise-list > .exercise-list-item')];

function openPicker(props: Parameters<typeof Caller>[0] = {}) {
  const r = render(h(Caller, props));
  $('#add').focus();
  fireEvent.click($('#add'));
  return r;
}

const nameOf = (el: HTMLElement) =>
  el
    .getAttribute('aria-labelledby')!
    .split(' ')
    .map((id) => document.getElementById(id)!.textContent)
    .join(' ');
const descOf = (el: HTMLElement) =>
  el
    .getAttribute('aria-describedby')
    ?.split(' ')
    .map((id) => document.getElementById(id)!.textContent)
    .join(' ');
const idsOf = (call: unknown[]) => (call[0] as ExerciseWithRow[]).map((e) => e.id);

describe('AC1: exercise rows are toggle buttons', () => {
  it('renders each row as a button in name order, with a check circle and no listbox', () => {
    openPicker();
    const r = rows();
    expect(r.map((x) => x.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    for (const row of r) {
      expect(row.getAttribute('type')).toBe('button');
      expect(row.getAttribute('aria-pressed')).toBe('false');
      expect(row.querySelector('.exercise-list-item-check')).not.toBeNull();
    }
    expect(r.map(nameOf)).toEqual(['Ab Wheel', 'Plank', 'Squat']);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('shows labels as words, and names a row by the exercise and describes it by its labels', () => {
    openPicker();
    const [wheel, plank, squat] = rows();
    expect(descOf(wheel)).toBe('Core');
    expect(descOf(squat)).toBe('Legs, Compound');
    expect(squat.querySelector('.exercise-list-item-meta')!.textContent).toBe('Legs · Compound');
    expect(plank.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows the last-done date, from the same data as the Exercises tab', () => {
    workouts.value = [{ id: 'w1', date: '2020-10-24' } as WorkoutWithRow];
    sets.value = [{ workout_id: 'w1', exercise_id: 'e1' } as SetWithRow];
    openPicker();
    const wheel = rows()[0];
    expect(wheel.querySelector('.exercise-list-item-meta')!.textContent).toBe('Core · last Oct 24, 2020');
    expect(descOf(wheel)).toBe('Core, last done October 24, 2020');
  });

  it('toggles a row selected and back', () => {
    openPicker();
    fireEvent.click(rows()[0]);
    expect(rows()[0].getAttribute('aria-pressed')).toBe('true');
    expect(rows()[0].querySelector('.exercise-list-item-check.selected')).not.toBeNull();
    fireEvent.click(rows()[0]);
    expect(rows()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps rows in the tab order after the search field and chips', () => {
    openPicker();
    const order = [...document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] input')];
    const search = order.indexOf($('.search-input'));
    const lastChip = order.indexOf([...document.querySelectorAll<HTMLElement>('.picker-chips .filter-chip')].pop()!);
    const firstRow = order.indexOf(rows()[0]);
    expect(search).toBeLessThan(lastChip);
    expect(lastChip).toBeLessThan(firstRow);
    for (const row of rows()) expect(row.tabIndex).toBe(0);
  });
});

describe('selecting and adding', () => {
  it('reads Choose exercises and is disabled with nothing selected', () => {
    openPicker();
    expect(addBtn().textContent).toBe('Choose exercises');
    expect(addBtn().disabled).toBe(true);
  });

  it('counts the selection: Add 1 exercise, Add 3 exercises', () => {
    openPicker();
    fireEvent.click(rows()[0]);
    expect(addBtn().textContent).toBe('Add 1 exercise');
    expect(addBtn().disabled).toBe(false);
    fireEvent.click(rows()[1]);
    fireEvent.click(rows()[2]);
    expect(addBtn().textContent).toBe('Add 3 exercises');
  });

  it('calls onAdd with the exercises in pick order and closes', () => {
    const onAdd = vi.fn();
    openPicker({ onAdd });
    fireEvent.click(rows()[2]); // Squat
    fireEvent.click(rows()[0]); // Ab Wheel
    fireEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(idsOf(onAdd.mock.calls[0])).toEqual(['e2', 'e1']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe($('#add'));
  });

  it('keeps selections through search and filter changes', () => {
    const onAdd = vi.fn();
    openPicker({ onAdd });
    fireEvent.click(rows()[0]); // Ab Wheel
    fireEvent.input($('.search-input'), { target: { value: 'squat' } });
    expect(rows().map(nameOf)).toEqual(['Squat']);
    fireEvent.click(rows()[0]);
    fireEvent.input($('.search-input'), { target: { value: '' } });
    expect(rows()[0].getAttribute('aria-pressed')).toBe('true');
    const legs = [...document.querySelectorAll<HTMLElement>('.picker-chips .filter-chip')].find(
      (c) => c.textContent === 'Legs',
    )!;
    fireEvent.click(legs);
    expect(rows().map(nameOf)).toEqual(['Squat']);
    expect(addBtn().textContent).toBe('Add 2 exercises');
    fireEvent.click(addBtn());
    expect(idsOf(onAdd.mock.calls[0])).toEqual(['e1', 'e2']);
  });
});

describe('AC2: creating an exercise', () => {
  it('has a create row at the end of the list that opens the form with focus on Name', () => {
    openPicker();
    const create = $('.create-new-row');
    expect(create.tagName).toBe('BUTTON');
    expect(create.getAttribute('type')).toBe('button');
    expect(create.textContent!.trim()).toBe('Create new exercise');
    expect(create.previousElementSibling).toBe(rows()[2]);
    fireEvent.click(create);
    expect($('[role="dialog"] h2').textContent).toBe('New exercise');
    expect(document.activeElement).toBe($('[role="dialog"] form input'));
  });

  it('reads Create “x” when the search matches nothing, and prefills Name', () => {
    openPicker();
    fireEvent.input($('.search-input'), { target: { value: ' Landmine press ' } });
    expect($('.create-new-row').textContent!.trim()).toBe('Create “Landmine press”');
    fireEvent.click($('.create-new-row'));
    expect(($('[role="dialog"] form input') as HTMLInputElement).value).toBe('Landmine press');
  });

  it('Cancel returns to the list with focus on search', () => {
    openPicker();
    fireEvent.click($('.create-new-row'));
    fireEvent.click(
      [...document.querySelectorAll<HTMLElement>('form button')].find((b) => b.textContent === 'Cancel')!,
    );
    expect(document.activeElement).toBe($('.search-input'));
  });

  it('Create returns to the list with the new exercise selected and the search cleared, not added', async () => {
    const created = ex('e9', 'Dead Bug');
    addExercise.mockImplementation(async () => {
      exercises.value = [...exercises.value, created];
      return created;
    });
    const onAdd = vi.fn();
    openPicker({ onAdd });
    fireEvent.input($('.search-input'), { target: { value: 'Dead' } });
    fireEvent.click($('.create-new-row'));
    fireEvent.submit($('[role="dialog"] form'));
    await waitFor(() => expect(document.querySelector('.search-input')).not.toBeNull());
    expect(onAdd).not.toHaveBeenCalled();
    expect(($('.search-input') as HTMLInputElement).value).toBe('');
    const row = rows().find((r) => nameOf(r) === 'Dead Bug')!;
    expect(row.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(row));
    expect(addBtn().textContent).toBe('Add 1 exercise');
    fireEvent.click(addBtn());
    expect(onAdd.mock.calls[0][0]).toEqual([created]);
  });
});

describe('AC3: dialog semantics and names', () => {
  it('is a modal dialog labelled by its title in both views', () => {
    openPicker();
    const dlg = $('.picker-sheet');
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dlg.getAttribute('aria-labelledby')!)!;
    expect(title.tagName).toBe('H2');
    expect(title.textContent).toBe('Add exercises');
    fireEvent.click($('.create-new-row'));
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)).toBe(title);
    expect(title.textContent).toBe('New exercise');
  });

  it('shows "to <section>" under the title when given one, and describes the dialog by it', () => {
    openPicker({ sectionLabel: 'Superset 1' });
    const sub = $('.picker-subtitle');
    expect(sub.textContent).toBe('to Superset 1');
    expect($('.picker-sheet').getAttribute('aria-describedby')).toBe(sub.id);
  });

  it('has no subtitle without a section', () => {
    openPicker();
    expect(document.querySelector('.picker-subtitle')).toBeNull();
  });

  it('labels search, groups the chips with a dot and a word, and reports each chip pressed state', () => {
    openPicker();
    expect($('.search-input').getAttribute('aria-label')).toBe('Search exercises');
    const group = $('.picker-chips');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Filter by label');
    const core = [...group.querySelectorAll<HTMLElement>('.filter-chip')].find((c) => c.textContent === 'Core')!;
    expect(core.querySelector('.picker-dot')).not.toBeNull();
    expect(core.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(core);
    expect(core.getAttribute('aria-pressed')).toBe('true');
    expect(rows().map(nameOf)).toEqual(['Ab Wheel']);
  });

  it('announces No matching exercises in a status region', () => {
    openPicker();
    const status = $('.exercise-list [role="status"]');
    expect(status.textContent).toBe('');
    fireEvent.input($('.search-input'), { target: { value: 'zzz' } });
    expect($('.exercise-list [role="status"]')).toBe(status);
    expect(status.textContent).toBe('No matching exercises');
  });

  it('keeps the Close button named', () => {
    openPicker();
    expect($('.modal-close').getAttribute('aria-label')).toBe('Close');
    expect($('.modal-close').getAttribute('type')).toBe('button');
  });
});

describe('AC4: focus in, trap, Escape, restore', () => {
  it('moves focus to search on open', () => {
    openPicker();
    expect(document.activeElement).toBe($('.search-input'));
  });

  it('wraps Tab from the Add button to Close, and Shift+Tab back', () => {
    openPicker();
    fireEvent.click(rows()[0]);
    addBtn().focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe($('.modal-close'));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(addBtn());
  });

  it('in the form, skips a disabled Create when wrapping', () => {
    openPicker();
    fireEvent.click($('.create-new-row'));
    const cancel = [...document.querySelectorAll<HTMLElement>('form button')].find((b) => b.textContent === 'Cancel')!;
    expect(($('form button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    cancel.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe($('.modal-close'));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['Close', () => fireEvent.click($('.modal-close'))],
    ['the scrim', () => fireEvent.click($('.picker-overlay'))],
  ])('closes on %s with nothing added, even with a selection, and returns focus to the opener', (_, act) => {
    const onClose = vi.fn();
    const onAdd = vi.fn();
    openPicker({ onClose, onAdd });
    fireEvent.click(rows()[0]);
    act();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe($('#add'));
  });

  it('closes on Escape from the form view too', () => {
    const onClose = vi.fn();
    openPicker({ onClose });
    fireEvent.click($('.create-new-row'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe($('#add'));
  });
});
