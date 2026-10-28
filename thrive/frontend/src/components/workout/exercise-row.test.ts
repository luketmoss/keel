// #667 — one exercise in a Logbook section card: its name and options menu, tiles, the open set's editor,
// and the Change section sheet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { h } from 'preact';
import { ExerciseRow } from './exercise-row';
import type { TrackerExercise } from './exercise-row';
import type { TrackerSet } from './set-row';

afterEach(cleanup);

function makeSet(overrides: Partial<TrackerSet> = {}): TrackerSet {
  return {
    set_number: 1,
    planned_reps: '',
    weight: '',
    reps: '',
    effort: '',
    saved: false,
    sheetRow: -1,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<TrackerExercise> = {}): TrackerExercise {
  return {
    exercise_id: 'ex1',
    exercise_name: 'Bench Press',
    section: 'primary',
    exercise_order: 1,
    sets: [makeSet({ set_number: 1, weight: '135', reps: '8' }), makeSet({ set_number: 2, planned_reps: '8' })],
    quickFillWeight: '',
    quickFillReps: '',
    quickFillEffort: '',
    rowKey: 'row-1',
    ...overrides,
  };
}

function renderRow(overrides: Partial<TrackerExercise> = {}, props: Record<string, unknown> = {}) {
  const handlers = {
    onOpenSet: vi.fn(),
    onUpdateSet: vi.fn(),
    onAddSet: vi.fn(),
    onRemoveSet: vi.fn(),
    onSameForAll: vi.fn(),
    onCopyDown: vi.fn(),
    onChangeSection: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onRemoveExercise: vi.fn(),
  };
  const view = render(
    h(ExerciseRow as any, {
      exercise: makeExercise(overrides),
      currentWorkoutId: 'w1',
      showLastTime: false,
      openSet: null,
      statusFor: () => '',
      removing: new Set<number>(),
      isFirst: false,
      isLast: false,
      ...handlers,
      ...props,
    }),
  );
  return { ...view, handlers };
}

const trigger = (c: Element) => c.querySelector<HTMLButtonElement>('[data-options-btn]')!;
const menuItems = (c: Element) => [...c.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
const openMenu = (c: Element) => fireEvent.click(trigger(c));
const buttonText = (c: ParentNode, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

describe('a working exercise', () => {
  it('shows its name, one tile per set and an Add set tile', () => {
    const { container } = renderRow();
    expect(container.querySelector('.lb-exercise-name')!.textContent).toBe('Bench Press');
    expect(container.querySelectorAll('.lb-tile[data-set]')).toHaveLength(2);
    expect(container.querySelector('.lb-tile-add')!.getAttribute('aria-label')).toBe('Add a set to Bench Press');
  });

  it('carries its row key on the root element', () => {
    const { container } = renderRow();
    expect((container.firstElementChild as HTMLElement).dataset.rowKey).toBe('row-1');
  });

  it('has none of the old chrome: no badge, toolbar, quick-fill row, S1 row or E/M/H buttons', () => {
    const { container } = renderRow({}, { openSet: 1 });
    for (const sel of [
      '.section-badge-btn',
      '.exercise-toolbar-btn',
      '.quick-fill-row',
      '.tracker-set',
      '.effort-btn',
      '.set-saved',
      '.set-remove-btn',
      '.add-set-btn',
    ]) {
      expect(container.querySelector(sel), sel).toBeNull();
    }
  });

  it('opens a set on its tile and passes null when the open tile is tapped again', () => {
    const { container, handlers } = renderRow();
    fireEvent.click(container.querySelector('.lb-tile[data-set="2"]')!);
    expect(handlers.onOpenSet).toHaveBeenLastCalledWith(2);
    cleanup();
    const open = renderRow({}, { openSet: 2 });
    expect(open.container.querySelector('.lb-tile[data-set="2"]')!.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(open.container.querySelector('.lb-tile[data-set="2"]')!);
    expect(open.handlers.onOpenSet).toHaveBeenLastCalledWith(null);
  });

  it('draws the editor of the open set only, and Next set opens the next one (Done closes)', () => {
    const { container, handlers } = renderRow({}, { openSet: 1 });
    expect(container.querySelectorAll('.lb-editor')).toHaveLength(1);
    expect(container.querySelector('.lb-editor')!.getAttribute('aria-label')).toBe('Bench Press, set 1');
    fireEvent.click(buttonText(container, 'Next set'));
    expect(handlers.onOpenSet).toHaveBeenLastCalledWith(2);
    cleanup();
    const last = renderRow({}, { openSet: 2 });
    fireEvent.click(buttonText(last.container, 'Done'));
    expect(last.handlers.onOpenSet).toHaveBeenLastCalledWith(null);
  });

  it('Add a set runs onAddSet', () => {
    const { container, handlers } = renderRow();
    fireEvent.click(container.querySelector('.lb-tile-add')!);
    expect(handlers.onAddSet).toHaveBeenCalledTimes(1);
  });

  it('shows the Last time line only while the chip is pressed', () => {
    expect(renderRow().container.querySelector('.lb-last-time')).toBeNull();
  });
});

describe('the options menu', () => {
  it('is a button named for the exercise, with a menu of four items', () => {
    const { container } = renderRow();
    expect(trigger(container).getAttribute('aria-label')).toBe('Bench Press options');
    expect(trigger(container).getAttribute('aria-haspopup')).toBe('menu');
    openMenu(container);
    expect(container.querySelector('[role="menu"]')).toBeTruthy();
    expect(menuItems(container).map((b) => b.textContent!.trim())).toEqual([
      'Move up',
      'Move down',
      'Change section…',
      'Remove exercise',
    ]);
  });

  it('marks Move up aria-disabled (not disabled) on the first of its section, and Move down on the last', () => {
    const first = renderRow({}, { isFirst: true });
    openMenu(first.container);
    const up = menuItems(first.container)[0];
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(up.hasAttribute('disabled')).toBe(false);
    expect(up.dataset.move).toBe('up');
    fireEvent.click(up);
    expect(first.handlers.onMoveUp).not.toHaveBeenCalled();
    cleanup();
    const last = renderRow({}, { isLast: true });
    openMenu(last.container);
    expect(menuItems(last.container)[1].getAttribute('aria-disabled')).toBe('true');
    expect(menuItems(last.container)[1].dataset.move).toBe('down');
  });

  it('runs Move up, Move down and Remove exercise and closes the menu', () => {
    const { container, handlers } = renderRow();
    openMenu(container);
    fireEvent.click(menuItems(container)[0]);
    expect(handlers.onMoveUp).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    openMenu(container);
    fireEvent.click(menuItems(container)[1]);
    expect(handlers.onMoveDown).toHaveBeenCalledTimes(1);
    openMenu(container);
    fireEvent.click(menuItems(container)[3]);
    expect(handlers.onRemoveExercise).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to its button', () => {
    const { container } = renderRow();
    openMenu(container);
    fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'Escape' });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger(container));
  });

  it('moves between items with the arrow keys', () => {
    const { container } = renderRow();
    openMenu(container);
    const items = menuItems(container);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'End' });
    expect(document.activeElement).toBe(items[3]);
  });
});

describe('the Change section sheet', () => {
  const openSheet = (c: Element) => {
    openMenu(c);
    fireEvent.click(menuItems(c)[2]);
  };
  const radios = () => [...document.querySelectorAll<HTMLElement>('[role="radio"]')];

  it('lists every section as a radio row, with the current one checked', () => {
    const { container } = renderRow();
    openSheet(container);
    expect(document.querySelector('[role="dialog"] h2')!.textContent).toBe('Move Bench Press to');
    expect(radios().map((r) => r.textContent)).toEqual([
      'Warm-up',
      'Primary',
      'Superset 1',
      'Superset 2',
      'Superset 3',
      'Burnout',
      'Cool-down',
    ]);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('choosing the current section closes it, and another runs onChangeSection and closes it', () => {
    const { container, handlers } = renderRow();
    openSheet(container);
    fireEvent.click(radios()[1]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(handlers.onChangeSection).not.toHaveBeenCalled();
    openSheet(container);
    fireEvent.click(radios()[3]);
    expect(handlers.onChangeSection).toHaveBeenCalledWith('SS2');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('warns before a move to warm-up with logged sets, and Cancel changes nothing', () => {
    const { container, handlers } = renderRow();
    openSheet(container);
    fireEvent.click(radios()[0]);
    expect(handlers.onChangeSection).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain(
      'Warm-ups are list only, so its 1 logged set is deleted.',
    );
    expect(document.activeElement).toBe(buttonText(document, 'Cancel')); // focus follows into the warning
    fireEvent.click(buttonText(document, 'Cancel'));
    expect(handlers.onChangeSection).not.toHaveBeenCalled();
    expect(radios()).toHaveLength(7);
    expect(document.activeElement).toBe(radios()[1]); // and back to the checked row
    fireEvent.click(radios()[0]);
    fireEvent.click(buttonText(document, 'Move to warm-up'));
    expect(handlers.onChangeSection).toHaveBeenCalledWith('warmup');
  });

  it('moves to warm-up without a warning when nothing is logged', () => {
    const { container, handlers } = renderRow({ sets: [makeSet()] });
    openSheet(container);
    fireEvent.click(radios()[0]);
    expect(handlers.onChangeSection).toHaveBeenCalledWith('warmup');
  });

  it('closes on Escape', () => {
    const { container } = renderRow();
    openSheet(container);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('a warm-up', () => {
  it('is a list row: its name and options, no tiles, no editor, no Last time line', () => {
    const { container } = renderRow({ section: 'warmup', sets: [] }, { showLastTime: true });
    expect(container.querySelector('.lb-warmup-name')!.textContent).toBe('Bench Press');
    expect(container.querySelector('.lb-tile')).toBeNull();
    expect(container.querySelector('.lb-editor')).toBeNull();
    expect(container.querySelector('.lb-last-time')).toBeNull();
    expect(trigger(container)).toBeTruthy();
  });

  it('keeps the options menu, with Move and Change section', () => {
    const { container } = renderRow({ section: 'warmup', sets: [] });
    openMenu(container);
    expect(menuItems(container)).toHaveLength(4);
  });
});
