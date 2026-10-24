// #624: Today draws what the store computes, and its buttons call the shared actions.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({ token: 'tok', user: { email: 'mom@x.com', name: 'Mom', picture: '' } }),
}));
const mockComplete = vi.fn();
const mockReopen = vi.fn();
const mockToToday = vi.fn();
vi.mock('../../state/actions-today', () => ({
  completeItem: (...a: unknown[]) => mockComplete(...a),
  reopenItem: (...a: unknown[]) => mockReopen(...a),
  moveItemToToday: (...a: unknown[]) => mockToToday(...a),
}));

import { TodayScreen } from './today-screen';
import {
  items,
  boards,
  permissions,
  statuses,
  owners,
  currentUserEmail,
  todaySelectedDay,
  todayWeekStart,
  setTodayWho,
  todayStr,
  addDays,
  mondayOf,
  selectedItemId,
  showCreateModal,
  createModalInitialDueDate,
} from '../../state/board-store';
import type { ItemWithRow } from '../../api/types';

const today = todayStr();
const d = (n: number) => addDays(today, n);

function item(id: string, over: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id,
    title: `Title ${id}`,
    description: '',
    status: 'To Do',
    owner: 'Mom',
    due_date: today,
    labels: '',
    parent_id: '',
    created_at: '',
    updated_at: '',
    completed_at: '',
    sort_order: 1,
    created_by: '',
    board_id: 'home',
    sheetRow: 2,
    ...over,
  };
}

const col = (name: string, sort: number, terminal = false) => ({
  id: name,
  board_id: 'home',
  name,
  sort_order: sort,
  color: '',
  is_terminal: terminal,
  created_at: '',
});

beforeEach(() => {
  vi.clearAllMocks();
  currentUserEmail.value = 'mom@x.com';
  owners.value = [
    { name: 'Mom', google_account: 'mom@x.com' },
    { name: 'Dad', google_account: 'dad@x.com' },
  ];
  boards.value = [{ id: 'home', name: 'Family', created_at: '', created_by: '' }];
  permissions.value = [{ board_id: 'home', user_email: '*', role: 'member' }];
  statuses.value = [col('To Do', 1), col('Doing', 2), col('Done', 3, true)];
  items.value = [];
  setTodayWho('everyone');
  todaySelectedDay.value = today;
  todayWeekStart.value = mondayOf(today);
  selectedItemId.value = null;
  showCreateModal.value = false;
  createModalInitialDueDate.value = null;
});

afterEach(cleanup);

const text = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

describe('header, strip and glance', () => {
  it('titles the screen Today and names the other days', () => {
    todaySelectedDay.value = d(1);
    const { container } = render(<TodayScreen />);
    expect(text(container, 'today-title')).not.toBe('Today');
    todaySelectedDay.value = today;
    cleanup();
    expect(text(render(<TodayScreen />).container, 'today-title')).toBe('Today');
  });

  it('shows seven days whose names say the date and how many are due', () => {
    items.value = [item('a'), item('b'), item('c', { status: 'Done' }), item('d', { due_date: d(1) })];
    const { container } = render(<TodayScreen />);
    const buttons = container.querySelectorAll('[data-testid^="today-day-"]');
    expect(buttons.length).toBe(7);
    const label = container.querySelector(`[data-testid="today-day-${today}"]`)!.getAttribute('aria-label')!;
    expect(label).toMatch(/, 3 due$/);
    expect(label).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, /);
    const dots = container.querySelectorAll(`[data-testid="today-day-${today}"] .today-dot`);
    expect([...dots].map((x) => x.className)).toEqual([
      'today-dot today-dot-open',
      'today-dot today-dot-open',
      'today-dot today-dot-done',
    ]);
    expect(container.querySelector(`[data-testid="today-day-${today}"]`)!.getAttribute('aria-pressed')).toBe('true');
  });

  it('caps the dots at three and says "nothing due" for an empty day', () => {
    items.value = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id));
    const { container } = render(<TodayScreen />);
    expect(container.querySelectorAll(`[data-testid="today-day-${today}"] .today-dot`).length).toBe(3);
    expect(container.querySelector(`[data-testid="today-day-${today}"]`)!.getAttribute('aria-label')).toMatch(
      /, 5 due$/,
    );
    const other = addDays(mondayOf(today), today === mondayOf(today) ? 1 : 0);
    expect(container.querySelector(`[data-testid="today-day-${other}"]`)!.getAttribute('aria-label')).toMatch(
      /nothing due$/,
    );
  });

  it('selecting a day changes the title, the Due card and the glance', () => {
    items.value = [item('a'), item('tom', { due_date: d(1) })];
    const { container } = render(<TodayScreen />);
    expect(container.querySelector('[data-testid="today-due-a"]')).not.toBeNull();
    fireEvent.click(container.querySelector(`[data-testid="today-day-${d(1)}"]`)!);
    expect(container.querySelector('[data-testid="today-due-a"]')).toBeNull();
    expect(container.querySelector('[data-testid="today-due-tom"]')).not.toBeNull();
    expect(text(container, 'today-title')).not.toBe('Today');
  });

  it('the glance centre shows the open count and "<done> of <due> done", and no percentage anywhere', () => {
    items.value = [item('a'), item('b'), item('c', { status: 'Done' }), item('d', { status: 'Done' })];
    const { container } = render(<TodayScreen />);
    expect(text(container, 'today-left-count')).toBe('2');
    expect(text(container, 'today-ring-label')).toBe('left today');
    expect(container.querySelector('[data-testid="today-ring"]')!.textContent).toContain('2 of 4 done');
    expect(container.textContent).not.toContain('%');
    expect(container.querySelector('[data-testid="today-ring-arc"]')!.getAttribute('stroke-dasharray')).toBe('50 100');
  });

  it('shows a check and "All done" once everything due is done', () => {
    items.value = [item('a', { status: 'Done' }), item('b', { status: 'Done' })];
    const { container } = render(<TodayScreen />);
    expect(text(container, 'today-ring-label')).toBe('All done');
    expect(container.querySelector('[data-testid="today-ring-check"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="today-ring"]')!.textContent).toContain('2 of 2 done');
  });

  it('shows "Nothing due" and an empty ring when nothing is due', () => {
    items.value = [item('x', { due_date: d(1) })];
    const { container } = render(<TodayScreen />);
    expect(text(container, 'today-ring-label')).toBe('Nothing due');
    expect(container.querySelector('[data-testid="today-ring-arc"]')).toBeNull();
  });

  it('shows the overdue and more-this-week counts', () => {
    items.value = [item('late', { due_date: d(-3) }), item('late2', { due_date: d(-1), status: 'Done' })];
    const { container } = render(<TodayScreen />);
    expect(text(container, 'today-overdue-count')).toBe('1');
  });
});

describe('Overdue card', () => {
  it('is absent with nothing overdue, and lists oldest first when there is', () => {
    items.value = [item('a')];
    expect(render(<TodayScreen />).container.querySelector('[data-testid="today-overdue"]')).toBeNull();
    cleanup();
    items.value = [item('new', { due_date: d(-1) }), item('old', { due_date: d(-8) })];
    const { container } = render(<TodayScreen />);
    const ids = [...container.querySelectorAll('[data-testid^="today-overdue-"]')]
      .map((e) => e.getAttribute('data-testid'))
      .filter((t) => t !== 'today-overdue-count');
    expect(ids).toEqual(['today-overdue-old', 'today-overdue-new']);
  });

  it('Move to today and Mark done call the shared actions', () => {
    items.value = [item('late', { due_date: d(-2) })];
    const { getByText } = render(<TodayScreen />);
    fireEvent.click(getByText('Move to today'));
    expect(mockToToday).toHaveBeenCalledWith('late', 'Mom', 'tok');
    fireEvent.click(getByText('Mark done'));
    expect(mockComplete).toHaveBeenCalledWith('late', 'Mom', 'tok');
  });

  it('offers no Mark done on a board with no terminal column', () => {
    statuses.value = [col('To Do', 1), col('Doing', 2)];
    items.value = [item('late', { due_date: d(-2) })];
    const { queryByText } = render(<TodayScreen />);
    expect(queryByText('Move to today')).not.toBeNull();
    expect(queryByText('Mark done')).toBeNull();
  });
});

describe('Due card', () => {
  it('names the check circles and strikes done rows through', () => {
    items.value = [item('a'), item('b', { status: 'Done' })];
    const { getByLabelText, container } = render(<TodayScreen />);
    const open = getByLabelText('Mark done: Title a');
    const done = getByLabelText('Mark not done: Title b');
    expect(open.getAttribute('aria-pressed')).toBe('false');
    expect(done.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-testid="today-due-b"] .today-row-title-done')).not.toBeNull();
    fireEvent.click(open);
    expect(mockComplete).toHaveBeenCalledWith('a', 'Mom', 'tok');
    fireEvent.click(done);
    expect(mockReopen).toHaveBeenCalledWith('b', 'Mom', 'tok');
  });

  it('a subtask is its own row, with its parent in the meta', () => {
    items.value = [item('p', { title: 'Grocery shopping', due_date: '' }), item('s', { parent_id: 'p' })];
    const { container } = render(<TodayScreen />);
    expect(container.querySelector('[data-testid="today-due-p"]')).toBeNull();
    expect(container.querySelector('[data-testid="today-due-s"] .today-row-meta')!.textContent).toBe(
      'Mom · Family · in Grocery shopping',
    );
  });

  it('opens the item when its title is tapped', () => {
    items.value = [item('a')];
    const { getByText } = render(<TodayScreen />);
    fireEvent.click(getByText('Title a'));
    expect(selectedItemId.value).toBe('a');
  });

  it('says so when the day is empty', () => {
    items.value = [item('x', { due_date: d(1) })];
    const { getByTestId } = render(<TodayScreen />);
    expect(getByTestId('today-due-empty').textContent).toBe('Nothing due today.');
  });
});

describe('In progress and Up next', () => {
  it('lists started items due after the day, and hides the card when there are none', () => {
    items.value = [item('plain', { due_date: d(2) })];
    expect(render(<TodayScreen />).container.querySelector('[data-testid="today-in-progress"]')).toBeNull();
    cleanup();
    items.value = [item('going', { due_date: d(2), status: 'Doing' })];
    const { container } = render(<TodayScreen />);
    expect(container.querySelector('[data-testid="today-progress-going"] .today-row-meta')!.textContent).toMatch(
      /^Mom · Family · due /,
    );
  });

  it('labels Up next items with when, title, owner and board', () => {
    items.value = [item('tom', { due_date: d(1) }), item('later', { due_date: d(3), owner: '' })];
    const { container } = render(<TodayScreen />);
    const first = container.querySelector('[data-testid="today-next-tom"]')!;
    expect(first.querySelector('.today-upnext-when')!.textContent).toBe('TOMORROW');
    expect(first.textContent).toContain('Mom · Family');
    const second = container.querySelector('[data-testid="today-next-later"]')!;
    expect(second.querySelector('.today-upnext-when')!.textContent).toMatch(/^[A-Z]{3} \d{1,2}$/);
    expect(second.textContent).toContain('Unassigned · Family');
  });
});

describe('Mine and Everyone', () => {
  it('filters to the signed-in person, and the chips are absent without an Owners row', () => {
    items.value = [item('mine'), item('his', { owner: 'Dad' })];
    setTodayWho('mine');
    const { container, rerender } = render(<TodayScreen />);
    expect(container.querySelector('[data-testid="today-due-mine"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="today-due-his"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-testid="today-who-everyone"]')!);
    expect(container.querySelector('[data-testid="today-due-his"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="today-who-everyone"]')!.getAttribute('aria-pressed')).toBe('true');
    cleanup();
    currentUserEmail.value = 'stranger@x.com';
    const again = render(<TodayScreen />);
    expect(again.container.querySelector('[data-testid="today-who-mine"]')).toBeNull();
    expect(again.container.querySelector('[data-testid="today-due-his"]')).not.toBeNull();
    void rerender;
  });
});

describe('adding', () => {
  it('+ opens the create form with the selected day as its due date', () => {
    todaySelectedDay.value = d(2);
    const { getByLabelText } = render(<TodayScreen />);
    fireEvent.click(getByLabelText('New item'));
    expect(showCreateModal.value).toBe(true);
    expect(createModalInitialDueDate.value).toBe(d(2));
  });

  it('with no boards, offers a new board instead of cards', () => {
    boards.value = [];
    const { container, getByText } = render(<TodayScreen />);
    expect(container.querySelector('[data-testid="today-no-boards"]')).not.toBeNull();
    expect(getByText('No boards yet.')).not.toBeNull();
  });
});
