import { describe, it, expect, afterEach } from 'vitest';
import type { ItemWithRow } from '../api/types';

/**
 * #818: opening an item makes its board the active one, so the item screen's
 * labels, columns and done state are the item's board's. Board A is the one last
 * opened; the item is on board B.
 */

function makeItem(overrides: Partial<ItemWithRow>): ItemWithRow {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    title: 'Test Item',
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
    created_by: 'test@test.com',
    board_id: 'board-a',
    sheetRow: 2,
    ...overrides,
  };
}

async function setup() {
  const store = await import('./board-store');
  store.boards.value = [
    { id: 'board-a', name: 'Family', created_at: '', created_by: '' },
    { id: 'board-b', name: 'Bike Stuff', created_at: '', created_by: '' },
    { id: 'board-secret', name: 'Secret', created_at: '', created_by: '' },
  ];
  store.currentUserEmail.value = 'user@test.com';
  store.permissions.value = [
    { board_id: 'board-a', user_email: 'user@test.com', role: 'owner', sheetRow: 2 },
    { board_id: 'board-b', user_email: 'user@test.com', role: 'owner', sheetRow: 3 },
    { board_id: 'board-secret', user_email: 'other@test.com', role: 'owner', sheetRow: 4 },
  ] as any;
  store.labels.value = [
    { label: 'Finance', color: '#111111', board_id: 'board-a' },
    { label: 'Errand', color: '#222222', board_id: 'board-a' },
    { label: 'Canyon Grizl', color: '#333333', board_id: 'board-b' },
  ];
  const st = (id: string, board_id: string, name: string, sort_order: number, is_terminal: boolean) => ({
    id,
    board_id,
    name,
    sort_order,
    color: '',
    is_terminal,
    created_at: '',
    sheetRow: sort_order + 1,
  });
  store.statuses.value = [
    st('a1', 'board-a', 'To Do', 1, false),
    st('a2', 'board-a', 'Doing', 2, false),
    st('a3', 'board-a', 'Finished', 3, true),
    st('b1', 'board-b', 'To Do', 1, false),
    st('b2', 'board-b', 'Done', 2, true),
  ] as any;
  store.items.value = [
    makeItem({ id: 'item-a', title: 'Buy milk', board_id: 'board-a' }),
    makeItem({ id: 'item-b', title: 'Fix gravel bike tires', board_id: 'board-b', labels: 'Canyon Grizl' }),
    makeItem({ id: 'item-secret', title: 'Hidden', board_id: 'board-secret' }),
  ];
  store.activeBoardId.value = 'board-a';
  store.activeView.value = 'today';
  store.boardOpen.value = false;
  store.selectedItemId.value = null;
  window.history.replaceState(null, '', '?view=today');
  return store;
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname);
});

describe('#818: an item opened from Today shows its own board', () => {
  it("shows only the item's board labels and columns", async () => {
    const s = await setup();
    s.selectItem('item-b');

    expect(s.activeBoardId.value).toBe('board-b');
    expect(s.boardLabels.value.map((l) => l.label)).toEqual(['Canyon Grizl']);
    expect(s.boardStatuses.value.map((c) => c.name)).toEqual(['To Do', 'Done']);
  });

  it("resolves done state and defaults from the item's board", async () => {
    const s = await setup();
    s.selectItem('item-b');

    expect(s.isTerminalStatus('Done')).toBe(true);
    expect(s.isTerminalStatus('Finished')).toBe(false);
    expect(s.terminalStatusName()).toBe('Done');
    expect(s.defaultStatusName()).toBe('To Do');
  });

  it('keeps Today as the destination, with no board parameter', async () => {
    const s = await setup();
    s.selectItem('item-b');

    const p = new URLSearchParams(window.location.search);
    expect(s.activeView.value).toBe('today');
    expect(s.boardOpen.value).toBe(false);
    expect(p.get('view')).toBe('today');
    expect(p.get('item')).toBe('item-b');
    expect(p.has('board')).toBe(false);
  });

  it('still shows Today after the item closes, on the item board', async () => {
    const s = await setup();
    s.selectItem('item-b');
    s.clearSelectedItem();

    const p = new URLSearchParams(window.location.search);
    expect(s.activeView.value).toBe('today');
    expect(p.has('board')).toBe(false);
    expect(s.activeBoardId.value).toBe('board-b');
  });

  it('lets the Boards tab restore the board Boards last showed', async () => {
    const s = await setup();
    s.navigate('boards', 'board-a');
    s.navigate('today');
    s.selectItem('item-b');
    s.clearSelectedItem();

    s.openBoardsTab();

    expect(s.activeView.value).toBe('boards');
    expect(s.boardOpen.value).toBe(true);
    expect(s.activeBoardId.value).toBe('board-a');
    expect(new URLSearchParams(window.location.search).get('board')).toBe('board-a');
  });

  it('lets the Boards tab restore the list when that was last shown', async () => {
    const s = await setup();
    s.navigate('boards');
    s.navigate('today');
    s.selectItem('item-b');
    s.clearSelectedItem();

    s.openBoardsTab();

    expect(s.activeView.value).toBe('boards');
    expect(s.boardOpen.value).toBe(false);
  });

  it('follows each item across two opens in a row', async () => {
    const s = await setup();
    s.selectItem('item-b');
    s.selectItem('item-a');

    expect(s.activeBoardId.value).toBe('board-a');
    expect(s.boardLabels.value.map((l) => l.label)).toEqual(['Finance', 'Errand']);
  });
});

describe('#818: cases that leave the active board alone', () => {
  it('does nothing when the item is already on the active board', async () => {
    const s = await setup();
    s.filterSearch.value = 'milk';
    s.selectedColumnIndex.value = 2;

    s.selectItem('item-a');

    expect(s.activeBoardId.value).toBe('board-a');
    expect(s.filterSearch.value).toBe('milk');
    expect(s.selectedColumnIndex.value).toBe(2);
    s.filterSearch.value = '';
    s.selectedColumnIndex.value = 0;
  });

  it('leaves the active board when the item is not loaded', async () => {
    const s = await setup();
    s.selectItem('gone');

    expect(s.activeBoardId.value).toBe('board-a');
    expect(s.selectedItemId.value).toBe('gone');
  });

  it('leaves the active board when the item is on a board the user cannot reach', async () => {
    const s = await setup();
    s.selectItem('item-secret');

    expect(s.activeBoardId.value).toBe('board-a');
  });

  it('moves the board showing and the board param when Boards shows a board', async () => {
    const s = await setup();
    s.navigate('boards', 'board-a');

    s.selectItem('item-b');

    const p = new URLSearchParams(window.location.search);
    expect(s.activeBoardId.value).toBe('board-b');
    expect(s.boardOpen.value).toBe(true);
    expect(p.get('board')).toBe('board-b');
    expect(p.get('item')).toBe('item-b');
  });
});
