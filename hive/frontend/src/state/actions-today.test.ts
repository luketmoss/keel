// #624: Today's check, uncheck and Move to today — the board's own move, plus a toast whose Undo reverses it.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateItemRow = vi.fn().mockResolvedValue(undefined);
const mockAppendAuditEntry = vi.fn().mockResolvedValue(undefined);
const mockFetchAllItems = vi.fn();

vi.mock('../api/sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/sheets')>()),
  updateItemRow: (...args: unknown[]) => mockUpdateItemRow(...args),
  appendAuditEntry: (...args: unknown[]) => mockAppendAuditEntry(...args),
  fetchAllItems: (...args: unknown[]) => mockFetchAllItems(...args),
}));
vi.mock('../demo/is-demo-mode', () => ({ isDemoMode: () => false }));

import { completeItem, reopenItem, moveItemToToday, ITEM_GONE_MESSAGE } from './actions-today';
import { items, statuses, activeBoardId, toastMessage, todayStr, addDays } from './board-store';
import type { ItemWithRow } from '../api/types';

const today = todayStr();

function item(id: string, over: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id,
    title: `Item ${id}`,
    description: '',
    status: 'Doing',
    owner: '',
    due_date: addDays(today, -2),
    labels: '',
    parent_id: '',
    created_at: '',
    updated_at: '',
    completed_at: '',
    sort_order: 1,
    created_by: '',
    board_id: 'work',
    sheetRow: 2,
    ...over,
  };
}

const col = (board: string, name: string, sort: number, terminal = false) => ({
  id: `${board}-${name}`,
  board_id: board,
  name,
  sort_order: sort,
  color: '',
  is_terminal: terminal,
  created_at: '',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateItemRow.mockResolvedValue(undefined);
  mockAppendAuditEntry.mockResolvedValue(undefined);
  // The sheet answers with whatever the optimistic store holds.
  mockFetchAllItems.mockImplementation(async () => items.value);
  // The board in view is another one: Today moves items on boards that are not.
  activeBoardId.value = 'home';
  statuses.value = [
    col('home', 'To Do', 1),
    col('home', 'Done', 2, true),
    col('work', 'Backlog', 1),
    col('work', 'Doing', 2),
    col('work', 'Shipped', 3, true),
    col('work', 'Archived', 4, true),
  ];
  items.value = [item('a'), item('b', { status: 'Shipped', completed_at: '2026-10-20T00:00:00Z' })];
  toastMessage.value = null;
});

describe('completeItem', () => {
  it("moves the item to its own board's first terminal column and stamps completed_at", async () => {
    expect(await completeItem('a', 'Me', 'tok')).toBe(true);
    const a = items.value.find((i) => i.id === 'a')!;
    expect(a.status).toBe('Shipped');
    expect(a.completed_at).not.toBe('');
  });

  it('shows a toast with Undo, and Undo puts the previous column back and clears completed_at', async () => {
    await completeItem('a', 'Me', 'tok');
    expect(toastMessage.value?.text).toBe('“Item a” marked done');
    expect(toastMessage.value?.action?.label).toBe('Undo');
    toastMessage.value!.action!.fn();
    await vi.waitFor(() => expect(items.value.find((i) => i.id === 'a')!.status).toBe('Doing'));
    expect(items.value.find((i) => i.id === 'a')!.completed_at).toBe('');
  });

  it('does nothing for a board with no terminal column', async () => {
    statuses.value = statuses.value.filter((s) => !(s.board_id === 'work' && s.is_terminal));
    expect(await completeItem('a', 'Me', 'tok')).toBe(false);
    expect(items.value.find((i) => i.id === 'a')!.status).toBe('Doing');
  });
});

describe('reopenItem', () => {
  it("moves a done item to its board's first column and clears completed_at", async () => {
    await reopenItem('b', 'Me', 'tok');
    const b = items.value.find((i) => i.id === 'b')!;
    expect(b.status).toBe('Backlog');
    expect(b.completed_at).toBe('');
    expect(toastMessage.value?.text).toBe('“Item b” reopened');
  });

  it('Undo returns it to the column it was in', async () => {
    await reopenItem('b', 'Me', 'tok');
    toastMessage.value!.action!.fn();
    await vi.waitFor(() => expect(items.value.find((i) => i.id === 'b')!.status).toBe('Shipped'));
  });
});

describe('moveItemToToday', () => {
  it('sets the due date to today, with an Undo that restores the old date', async () => {
    const was = items.value.find((i) => i.id === 'a')!.due_date;
    await moveItemToToday('a', 'Me', 'tok');
    expect(items.value.find((i) => i.id === 'a')!.due_date).toBe(today);
    expect(toastMessage.value?.text).toBe('“Item a” moved to today');
    toastMessage.value!.action!.fn();
    await vi.waitFor(() => expect(items.value.find((i) => i.id === 'a')!.due_date).toBe(was));
  });
});

describe('an item that is gone', () => {
  it('says so instead of acting', async () => {
    expect(await completeItem('nope', 'Me', 'tok')).toBe(false);
    expect(toastMessage.value).toMatchObject({ text: ITEM_GONE_MESSAGE, type: 'error' });
  });

  it('Undo after the item vanished does nothing but say so', async () => {
    await completeItem('a', 'Me', 'tok');
    const undo = toastMessage.value!.action!.fn;
    items.value = items.value.filter((i) => i.id !== 'a');
    undo();
    expect(toastMessage.value).toMatchObject({ text: ITEM_GONE_MESSAGE, type: 'error' });
  });
});

describe('a failed write', () => {
  it('reverts the row and shows the existing error toast', async () => {
    mockUpdateItemRow.mockRejectedValueOnce(new Error('boom'));
    expect(await completeItem('a', 'Me', 'tok')).toBe(false);
    expect(items.value.find((i) => i.id === 'a')!.status).toBe('Doing');
    expect(toastMessage.value).toMatchObject({ type: 'error' });
  });
});
