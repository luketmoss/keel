import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { exercises, labels, sets, workouts } from '../../state/store';
import {
  ExercisesScreen,
  EXERCISE_SORT_KEY,
  groupByLastUsed,
  groupAlphabetically,
  formatWhen,
  readExerciseSort,
  writeExerciseSort,
} from './exercises-screen';
import type { ExerciseWithRow } from '../../api/types';

const ex = (id: string, name: string, tags = ''): ExerciseWithRow => ({
  id,
  name,
  tags,
  notes: '',
  created: '',
  sheetRow: 2,
});

describe('Issue #642 — grouping by last used', () => {
  // Wednesday 2026-10-28: this week starts Monday 10-26, last week Monday 10-19.
  const today = '2026-10-28';
  const list = [
    ex('a', 'Alpha'),
    ex('b', 'Bravo'),
    ex('c', 'Charlie'),
    ex('d', 'Delta'),
    ex('e', 'Echo'),
    ex('f', 'Foxtrot'),
  ];
  const last = new Map([
    ['a', '2026-10-26'], // Monday: first day of this week
    ['b', '2026-10-25'], // Sunday: last day of last week
    ['c', '2026-10-19'], // Monday: first day of last week
    ['d', '2026-10-18'], // Sunday: earlier
    ['e', '2026-10-28'], // today
  ]);

  it('buckets by Monday-to-Sunday week, with never-done last', () => {
    const groups = groupByLastUsed(list, last, today);
    expect(groups.map((g) => g.heading)).toEqual(['This week', 'Last week', 'Earlier', 'Not done yet']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['e', 'a']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['b', 'c']);
    expect(groups[2].items.map((i) => i.id)).toEqual(['d']);
    expect(groups[3].items.map((i) => i.id)).toEqual(['f']);
  });

  it('counts each group, singular for one', () => {
    const groups = groupByLastUsed(list, last, today);
    expect(groups.map((g) => g.count)).toEqual(['2 exercises', '2 exercises', '1 exercise', '1 exercise']);
  });

  it('orders by recency then name inside a group', () => {
    const l = [ex('x', 'Zed'), ex('y', 'Abe'), ex('z', 'Mid')];
    const m = new Map([
      ['x', '2026-10-27'],
      ['y', '2026-10-27'],
      ['z', '2026-10-26'],
    ]);
    expect(groupByLastUsed(l, m, today)[0].items.map((i) => i.id)).toEqual(['y', 'x', 'z']);
  });

  it('leaves out empty groups and puts everything in Not done yet with no history', () => {
    const groups = groupByLastUsed(list, new Map(), today);
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe('Not done yet');
    expect(groups[0].items).toHaveLength(6);
  });

  it('holds a Sunday today in the week that started the Monday before', () => {
    const groups = groupByLastUsed([ex('a', 'A')], new Map([['a', '2026-10-26']]), '2026-11-01');
    expect(groups[0].heading).toBe('This week');
  });
});

describe('Issue #642 — A–Z groups', () => {
  it('groups by upper-cased first letter with # first', () => {
    const groups = groupAlphabetically([
      ex('1', 'squat'),
      ex('2', 'Bench'),
      ex('3', '21s Curl'),
      ex('4', 'Back Squat'),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(['#', 'B', 'S']);
    expect(groups[1].items.map((i) => i.name)).toEqual(['Back Squat', 'Bench']);
    expect(groups.every((g) => g.count === '')).toBe(true);
  });
});

describe('Issue #642 — when it was last done', () => {
  const today = '2026-10-28';
  it('reads relatively, then weekday, then date', () => {
    expect(formatWhen('2026-10-28', today)).toBe('Today');
    expect(formatWhen('2026-10-27', today)).toBe('Yesterday');
    expect(formatWhen('2026-10-22', today)).toBe('Thu');
    expect(formatWhen('2026-10-21', today)).toBe('Oct 21');
    expect(formatWhen('2025-10-08', today)).toBe('Oct 8, 2025');
    expect(formatWhen(undefined, today)).toBe('');
  });
});

describe('Issue #642 — remembered sort', () => {
  beforeEach(() => {
    localStorage.removeItem(EXERCISE_SORT_KEY);
  });

  it('defaults to Last used', () => {
    expect(readExerciseSort()).toBe('recent');
  });

  it('stores and reads the choice under thrive.exerciseSort', () => {
    writeExerciseSort('az');
    expect(localStorage.getItem('thrive.exerciseSort')).toBe('az');
    expect(readExerciseSort()).toBe('az');
    writeExerciseSort('recent');
    expect(readExerciseSort()).toBe('recent');
  });

  it('falls back to Last used when storage throws, and a write does not throw', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readExerciseSort()).toBe('recent');
    expect(() => writeExerciseSort('az')).not.toThrow();
    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});

describe('Issue #642 — Exercises tab render', () => {
  beforeEach(() => {
    cleanup();
    localStorage.removeItem(EXERCISE_SORT_KEY);
    window.location.hash = '#/exercises';
    labels.value = [
      { id: 'l1', name: 'Push', color_key: 'blue', created: '', sheetRow: 2 },
      { id: 'l2', name: 'Chest', color_key: 'red', created: '', sheetRow: 3 },
    ];
    exercises.value = [ex('1', 'Bench', 'Push, Chest'), ex('2', 'Press', 'Push'), ex('3', 'Curl', '')];
    sets.value = [];
    workouts.value = [];
  });

  const chipOf = (container: Element, name: string) =>
    Array.from(container.querySelectorAll<HTMLElement>('.filter-chip')).find((c) => c.textContent === name)!;

  it('shows the count placeholder, All pressed, and one card per group', () => {
    const { container, getByPlaceholderText } = render(<ExercisesScreen />);
    expect(getByPlaceholderText('Search 3 exercises')).toBeTruthy();
    expect(chipOf(container, 'All').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.ex-count')!.textContent).toBe('3 exercises');
    expect(container.querySelectorAll('.ex-card')).toHaveLength(1);
    expect(container.querySelector('.week-heading h2')!.textContent).toBe('Not done yet');
  });

  it('narrows by every selected label, counts them, and All clears', () => {
    const { container } = render(<ExercisesScreen />);
    fireEvent.click(chipOf(container, 'Push'));
    expect(container.querySelector('.ex-count')!.textContent).toBe('2 of 3 shown');
    fireEvent.click(chipOf(container, 'Chest'));
    expect(container.querySelector('.ex-count')!.textContent).toBe('1 of 3 shown');
    expect(chipOf(container, 'All').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chipOf(container, 'All'));
    expect(container.querySelector('.ex-count')!.textContent).toBe('3 exercises');
    expect(chipOf(container, 'All').getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles the sort, renames the button and stores the choice', () => {
    const { container } = render(<ExercisesScreen />);
    const sort = container.querySelector<HTMLButtonElement>('.ex-sort')!;
    expect(sort.getAttribute('aria-label')).toBe('Sort: last used');
    expect(sort.textContent).toBe('Last used');
    fireEvent.click(sort);
    expect(sort.getAttribute('aria-label')).toBe('Sort: A to Z');
    expect(sort.textContent).toBe('A–Z');
    expect(localStorage.getItem('thrive.exerciseSort')).toBe('az');
    expect(Array.from(container.querySelectorAll('.week-heading h2')).map((h) => h.textContent)).toEqual([
      'B',
      'C',
      'P',
    ]);
  });

  it('rows are buttons that open in place and close on Escape', () => {
    const { container } = render(<ExercisesScreen />);
    const row = container.querySelector<HTMLElement>('[data-focus-key="exercise:1"]')!;
    expect(row.tagName).toBe('BUTTON');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('No previous data');
    expect(container.textContent).toContain('Edit');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the empty states', () => {
    exercises.value = [];
    const { container } = render(<ExercisesScreen />);
    expect(container.textContent).toContain('Tap + to add your first exercise.');
    cleanup();
    exercises.value = [ex('1', 'Bench', '')];
    const again = render(<ExercisesScreen />);
    fireEvent.input(again.container.querySelector('input')!, { target: { value: 'zzz' } });
    expect(again.container.textContent).toContain('No matching exercises');
    expect(again.container.querySelector('.ex-count')!.textContent).toBe('0 of 1 shown');
  });
});
