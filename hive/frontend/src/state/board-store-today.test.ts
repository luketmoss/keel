// #624: the rules behind Today — what is in scope, done, started, overdue, and the glance numbers.
import { describe, it, expect, beforeEach } from 'vitest';
import type { ItemWithRow } from '../api/types';
import {
  items,
  boards,
  permissions,
  statuses,
  owners,
  currentUserEmail,
  todayView,
  todayRows,
  todaySelectedDay,
  todayWeekStart,
  todayWho,
  setTodayWho,
  effectiveTodayWho,
  shiftTodayWeek,
  todayStr,
  addDays,
  mondayOf,
  sundayOf,
} from './board-store';

const today = todayStr();
const d = (n: number) => addDays(today, n);

function item(id: string, over: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id,
    title: id,
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

const status = (board: string, name: string, sort: number, terminal = false) => ({
  id: `${board}-${name}`,
  board_id: board,
  name,
  sort_order: sort,
  color: '',
  is_terminal: terminal,
  created_at: '',
});

beforeEach(() => {
  currentUserEmail.value = 'mom@x.com';
  owners.value = [
    { name: 'Mom', google_account: 'mom@x.com' },
    { name: 'Dad', google_account: 'dad@x.com' },
  ];
  boards.value = [
    { id: 'home', name: 'Home', created_at: '', created_by: '' },
    { id: 'work', name: 'Work', created_at: '', created_by: '' },
    { id: 'old', name: 'Old', created_at: '', created_by: '', archived_at: '2026-01-01T00:00:00.000Z' },
  ];
  permissions.value = ['home', 'work', 'old'].map((b) => ({ board_id: b, user_email: '*', role: 'member' as const }));
  statuses.value = [
    status('home', 'To Do', 1),
    status('home', 'Doing', 2),
    status('home', 'Done', 3, true),
    status('work', 'Backlog', 1),
    status('work', 'Shipped', 2, true),
    status('old', 'To Do', 1),
  ];
  items.value = [];
  setTodayWho('everyone');
  todaySelectedDay.value = today;
  todayWeekStart.value = mondayOf(today);
});

describe('week arithmetic', () => {
  it('runs Monday to Sunday', () => {
    expect(mondayOf('2026-10-24')).toBe('2026-10-19'); // a Saturday
    expect(sundayOf('2026-10-24')).toBe('2026-10-25');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // a Sunday belongs to the week before
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('previous and next week move the strip by seven days and keep the selected day', () => {
    const start = todayWeekStart.value;
    shiftTodayWeek(1);
    expect(todayWeekStart.value).toBe(addDays(start, 7));
    shiftTodayWeek(-2);
    expect(todayWeekStart.value).toBe(addDays(start, -7));
    expect(todaySelectedDay.value).toBe(today);
    expect(todayView.value.days.map((x) => x.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(start, i - 7)));
  });
});

describe('scope', () => {
  it('takes dated roots and subtasks from accessible boards, never archived ones', () => {
    items.value = [
      item('root'),
      item('sub', { parent_id: 'parent', board_id: 'home' }),
      item('parent', { due_date: '' }),
      item('undated', { due_date: '' }),
      item('archived', { board_id: 'old' }),
    ];
    const ids = todayRows.value.map((r) => r.item.id);
    expect(ids).toContain('root');
    expect(ids).toContain('sub');
    expect(ids).not.toContain('parent'); // a parent with no date is not pulled in by its subtask
    expect(ids).not.toContain('undated');
    expect(ids).not.toContain('archived');
    expect(todayRows.value.find((r) => r.item.id === 'sub')!.parentTitle).toBe('parent');
  });

  it('reads a subtask with no board_id of its own from its parent', () => {
    items.value = [item('p', { due_date: '' }), item('s', { parent_id: 'p', board_id: '' })];
    expect(todayRows.value.map((r) => r.item.id)).toEqual(['s']);
  });

  it('done is a terminal column of its own board; started is open and past its first column', () => {
    items.value = [
      item('a', { status: 'Done' }),
      item('b', { status: 'Doing' }),
      item('c', { status: 'To Do' }),
      item('w', { status: 'Shipped', board_id: 'work' }),
      item('x', { status: 'Backlog', board_id: 'work' }),
    ];
    const by = Object.fromEntries(todayRows.value.map((r) => [r.item.id, r]));
    expect([by.a.done, by.b.done, by.c.done, by.w.done, by.x.done]).toEqual([true, false, false, true, false]);
    expect([by.a.started, by.b.started, by.c.started, by.w.started, by.x.started]).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('Mine and Everyone', () => {
  beforeEach(() => {
    items.value = [item('mine', { owner: 'Mom' }), item('his', { owner: 'Dad' }), item('nobody', { owner: '' })];
  });

  it("Mine keeps only the signed-in person's Owners name", () => {
    setTodayWho('mine');
    expect(todayRows.value.map((r) => r.item.id)).toEqual(['mine']);
    setTodayWho('everyone');
    expect(todayRows.value).toHaveLength(3);
  });

  it('persists the choice', () => {
    setTodayWho('everyone');
    expect(localStorage.getItem('hive-today-who')).toBe('everyone');
  });

  it('with no Owners row, Everyone applies whatever was chosen', () => {
    currentUserEmail.value = 'stranger@x.com';
    todayWho.value = 'mine';
    expect(effectiveTodayWho.value).toBe('everyone');
    expect(todayRows.value).toHaveLength(3);
  });
});

describe('the numbers', () => {
  beforeEach(() => {
    items.value = [
      item('late2', { due_date: d(-5), sort_order: 2 }),
      item('late1', { due_date: d(-9) }),
      item('lateDone', { due_date: d(-3), status: 'Done' }),
      item('t-open1', { sort_order: 1 }),
      item('t-open2', { sort_order: 2 }),
      item('t-done', { status: 'Done', completed_at: '2026-10-24T10:00:00Z' }),
      item('tomorrow', { due_date: d(1), status: 'Doing' }),
      item('later', { due_date: d(3) }),
      item('far', { due_date: d(20) }),
      item('far-started', { due_date: d(30), status: 'Doing' }),
    ];
  });

  it('overdue is open items due before today, oldest first; done ones are not overdue', () => {
    const v = todayView.value;
    expect(v.overdue.map((r) => r.item.id)).toEqual(['late1', 'late2']);
  });

  it('the Due card lists the selected day, open first and done after', () => {
    const v = todayView.value;
    expect(v.due.map((r) => r.item.id)).toEqual(['t-open1', 't-open2', 't-done']);
    expect([v.dueOpenCount, v.dueDoneCount]).toEqual([2, 1]);
  });

  it('days count open and done per date', () => {
    const day = todayView.value.days.find((x) => x.date === today);
    expect([day!.open, day!.done]).toEqual([2, 1]);
  });

  it('more this week is open items after the horizon through this Sunday', () => {
    const sunday = sundayOf(today);
    const expected = items.value.filter(
      (i) => i.status !== 'Done' && i.due_date > today && i.due_date <= sunday,
    ).length;
    expect(todayView.value.moreThisWeek).toBe(expected);
  });

  it('In progress is started items due after the horizon; Up next is the next five open ones', () => {
    const v = todayView.value;
    expect(v.inProgress.map((r) => r.item.id)).toEqual(['tomorrow', 'far-started']);
    expect(v.upNext.map((r) => r.item.id)).toEqual(['tomorrow', 'later', 'far', 'far-started']);
  });

  it('the horizon is the later of the selected day and today', () => {
    todaySelectedDay.value = d(2);
    let v = todayView.value;
    expect(v.horizon).toBe(d(2));
    expect(v.due.map((r) => r.item.id)).toEqual([]);
    expect(v.upNext.map((r) => r.item.id)).toEqual(['later', 'far', 'far-started']);
    // overdue is about now, not about the selected day
    expect(v.overdue).toHaveLength(2);

    todaySelectedDay.value = d(-9);
    v = todayView.value;
    expect(v.horizon).toBe(today);
    expect(v.due.map((r) => r.item.id)).toEqual(['late1']);
    expect(v.overdue).toHaveLength(2);
  });

  it('caps Up next at five', () => {
    items.value = Array.from({ length: 8 }, (_, i) => item(`n${i}`, { due_date: d(i + 1) }));
    expect(todayView.value.upNext).toHaveLength(5);
  });

  it('says whether anything is dated at all', () => {
    items.value = [item('undated', { due_date: '' })];
    expect(todayView.value.anyDated).toBe(false);
  });
});
