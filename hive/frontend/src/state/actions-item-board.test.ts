// #818: a subtask added from an item opened on Today belongs to the item's board.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateItemRow = vi.fn().mockResolvedValue(undefined);

vi.mock('../api/sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/sheets')>()),
  createItemRow: (...args: unknown[]) => mockCreateItemRow(...args),
  appendAuditEntry: vi.fn().mockResolvedValue(undefined),
  fetchAllItems: vi.fn().mockImplementation(async () => items.value),
}));
vi.mock('../demo/is-demo-mode', () => ({ isDemoMode: () => false }));

import { createItem } from './actions';
import {
  items,
  statuses,
  boards,
  permissions,
  currentUserEmail,
  activeBoardId,
  activeView,
  selectItem,
} from './board-store';
import type { ItemWithRow } from '../api/types';

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
  boards.value = [
    { id: 'board-a', name: 'Family', created_at: '', created_by: '' },
    { id: 'board-b', name: 'Bike Stuff', created_at: '', created_by: '' },
  ];
  currentUserEmail.value = 'user@test.com';
  permissions.value = [
    { board_id: 'board-a', user_email: 'user@test.com', role: 'owner', sheetRow: 2 },
    { board_id: 'board-b', user_email: 'user@test.com', role: 'owner', sheetRow: 3 },
  ] as any;
  statuses.value = [
    col('board-a', 'Backlog', 1),
    col('board-a', 'Finished', 2, true),
    col('board-b', 'To Do', 1),
    col('board-b', 'Done', 2, true),
  ];
  items.value = [
    {
      id: 'item-b',
      title: 'Fix gravel bike tires',
      description: '',
      status: 'To Do',
      owner: '',
      due_date: '',
      labels: '',
      parent_id: '',
      created_at: '',
      updated_at: '',
      completed_at: '',
      sort_order: 1,
      created_by: '',
      board_id: 'board-b',
      sheetRow: 2,
    } as ItemWithRow,
  ];
  activeBoardId.value = 'board-a';
  activeView.value = 'today';
});

describe('#818: Add a subtask on an item opened from Today', () => {
  it("saves the subtask with the item's board and that board's first column", async () => {
    selectItem('item-b');

    await createItem({ title: 'Pump', parent_id: 'item-b' }, 'user', 'tok');

    expect(mockCreateItemRow).toHaveBeenCalledTimes(1);
    const saved = mockCreateItemRow.mock.calls[0][0];
    expect(saved.board_id).toBe('board-b');
    expect(saved.status).toBe('To Do');
  });
});
