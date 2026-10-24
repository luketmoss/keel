// #625: Boards draws what the store computes, and its cards and buttons navigate and open the existing flows.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { BoardsScreen } from './boards-screen';
import { NavRail } from '../shell/nav-rail';
import { TabBar } from '../shell/tab-bar';
import {
  items,
  boards,
  permissions,
  statuses,
  owners,
  currentUserEmail,
  activeBoardId,
  activeView,
  boardOpen,
  navigate,
  openBoardsTab,
  initActiveViewFromUrl,
  showCreateBoardModal,
  showArchivedBoardsDialog,
  todayStr,
  addDays,
} from '../../state/board-store';
import type { ItemWithRow } from '../../api/types';

const ME = 'me@test.com';
const today = todayStr();
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();

function item(id: string, boardId: string, status: string, over: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id,
    title: `Title ${id}`,
    description: '',
    status,
    owner: '',
    due_date: '',
    labels: '',
    parent_id: '',
    created_at: '',
    updated_at: '',
    completed_at: '',
    sort_order: 1,
    created_by: '',
    board_id: boardId,
    sheetRow: 2,
    ...over,
  };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?demo=true');
  currentUserEmail.value = ME;
  owners.value = [
    { name: 'Luke', google_account: ME },
    { name: 'Mom', google_account: 'mom@test.com' },
    { name: 'Dad', google_account: 'dad@test.com' },
  ];
  boards.value = [
    { id: 'b1', name: 'Family', created_at: '', created_by: ME, icon: '🏠' },
    { id: 'b2', name: 'Work', created_at: '', created_by: ME },
    { id: 'b3', name: 'Empty', created_at: '', created_by: ME },
    { id: 'b4', name: 'Old', created_at: '', created_by: ME, archived_at: '2026-01-01T00:00:00Z' },
  ];
  permissions.value = [
    { board_id: 'b1', user_email: ME, role: 'owner' },
    { board_id: 'b1', user_email: 'mom@test.com', role: 'member' },
    { board_id: 'b1', user_email: 'dad@test.com', role: 'member' },
    { board_id: 'b2', user_email: ME, role: 'owner' },
    { board_id: 'b3', user_email: ME, role: 'owner' },
    { board_id: 'b3', user_email: '*', role: 'member' },
    { board_id: 'b4', user_email: ME, role: 'owner' },
  ];
  statuses.value = ['b1', 'b2', 'b3'].flatMap((b) => [
    { id: `${b}-t`, board_id: b, name: 'To Do', sort_order: 1, color: '', is_terminal: false, created_at: '' },
    { id: `${b}-p`, board_id: b, name: 'Doing', sort_order: 2, color: '', is_terminal: false, created_at: '' },
    { id: `${b}-d`, board_id: b, name: 'Done', sort_order: 3, color: '', is_terminal: true, created_at: '' },
  ]);
  items.value = [
    // Family: 3 not started, 2 started, 1 recently done, 1 done long ago (not counted)
    item('f1', 'b1', 'To Do', { due_date: addDays(today, -2), title: 'Pay bill' }),
    item('f2', 'b1', 'To Do', { due_date: addDays(today, 1), title: 'Book dentist appointments' }),
    item('f3', 'b1', 'To Do'),
    item('f4', 'b1', 'Doing', { due_date: today, title: 'Fix sink' }),
    item('f5', 'b1', 'Doing'),
    item('f6', 'b1', 'Done', { completed_at: iso(1), due_date: addDays(today, -5) }),
    item('f7', 'b1', 'Done', { completed_at: iso(40) }),
    item('f8', 'b1', 'To Do', { parent_id: 'f3', board_id: '' }),
    item('w1', 'b2', 'To Do'),
  ];
  activeBoardId.value = 'b1';
  activeView.value = 'boards';
  boardOpen.value = false;
  showCreateBoardModal.value = false;
  showArchivedBoardsDialog.value = false;
});

afterEach(cleanup);

const card = (c: ParentNode, id: string) => c.querySelector(`[data-testid="boards-card-${id}"]`) as HTMLElement;

describe('Boards list', () => {
  it('has a card for each accessible board and none for an archived one', () => {
    const { container } = render(<BoardsScreen />);
    expect([...container.querySelectorAll('.boards-card')].map((c) => c.getAttribute('data-testid'))).toEqual([
      'boards-card-b1',
      'boards-card-b2',
      'boards-card-b3',
    ]);
  });

  it('subline counts boards and open root items', () => {
    const { container } = render(<BoardsScreen />);
    // Family 5 + Work 1
    expect(container.querySelector('[data-testid="boards-subline"]')!.textContent).toBe('3 boards · 6 open');
    expect(container.querySelector('h1')!.textContent).toBe('Boards');
  });

  it('the tile shows the icon, or the first letter', () => {
    const { container } = render(<BoardsScreen />);
    expect(card(container, 'b1').querySelector('.boards-tile')!.textContent).toBe('🏠');
    expect(card(container, 'b2').querySelector('.boards-tile')!.textContent).toBe('W');
  });

  it('names who the board is shared with', () => {
    const { container } = render(<BoardsScreen />);
    const shared = (id: string) => card(container, id).querySelector('.boards-card-shared')!.textContent;
    expect(shared('b1')).toBe('You, Mom and Dad');
    expect(shared('b2')).toBe('Just you');
    expect(shared('b3')).toBe('Everyone');
  });

  it('lists up to three names, then "and N others"; an email with no Owners row shows before the @', () => {
    owners.value = [{ name: 'Luke', google_account: ME }];
    permissions.value = [
      { board_id: 'b2', user_email: ME, role: 'owner' },
      ...['a', 'b', 'c', 'd'].map((n) => ({ board_id: 'b2', user_email: `${n}@x.com`, role: 'member' as const })),
    ];
    const { container } = render(<BoardsScreen />);
    expect(card(container, 'b2').querySelector('.boards-card-shared')!.textContent).toBe('You, a, b and 2 others');
  });

  it('shows not started, started and done as numbers with words, and a proportional bar', () => {
    const { container } = render(<BoardsScreen />);
    const legend = [...container.querySelectorAll('[data-testid="boards-legend-b1"] .boards-legend-item')].map((e) =>
      e.textContent!.trim(),
    );
    expect(legend).toEqual(['3 not started', '2 started', '1 done']);
    const segs = [...container.querySelectorAll('[data-testid="boards-bar-b1"] .boards-bar-seg')];
    expect(segs.map((s) => s.getAttribute('data-count'))).toEqual(['3', '2', '1']);
    expect(segs.map((s) => (s as HTMLElement).style.flexGrow)).toEqual(['3', '2', '1']);
  });

  it('omits a zero segment from the bar but keeps it in the legend', () => {
    const { container } = render(<BoardsScreen />);
    const segs = container.querySelectorAll('[data-testid="boards-bar-b2"] .boards-bar-seg');
    expect(segs.length).toBe(1);
    expect(container.querySelector('[data-testid="boards-legend-b2"]')!.textContent).toContain('0 started');
  });

  it('a board with no items says so, with no bar', () => {
    const { container } = render(<BoardsScreen />);
    expect(card(container, 'b3').textContent).toContain('No items yet');
    expect(card(container, 'b3').querySelector('.boards-bar')).toBeNull();
    expect(card(container, 'b3').querySelector('.boards-legend')).toBeNull();
  });

  it('shows an OVERDUE badge with a word, only where there are open overdue items', () => {
    const { container } = render(<BoardsScreen />);
    // f1 is overdue; f6 is done and does not count
    expect(container.querySelector('[data-testid="boards-overdue-b1"]')!.textContent).toBe('1 OVERDUE');
    expect(container.querySelector('[data-testid="boards-overdue-b2"]')).toBeNull();
  });

  it('shows the next open item due today or later with its date, else "Nothing dated"', () => {
    const { container } = render(<BoardsScreen />);
    const next = (id: string) => container.querySelector(`[data-testid="boards-next-${id}"]`)!.textContent;
    expect(next('b1')).toBe('Next: Fix sink · today');
    expect(next('b2')).toBe('Nothing dated');
    items.value = items.value.filter((i) => i.id !== 'f4');
    return Promise.resolve().then(() => {
      const again = render(<BoardsScreen />);
      expect(again.container.querySelector('[data-testid="boards-next-b1"]')!.textContent).toBe(
        'Next: Book dentist appointments · tomorrow',
      );
    });
  });

  it('each card has an accessible name with the board, open count and overdue count', () => {
    const { container } = render(<BoardsScreen />);
    expect(card(container, 'b1').getAttribute('aria-label')).toBe('Family, 5 open, 1 overdue');
    expect(card(container, 'b2').getAttribute('aria-label')).toBe('Work, 1 open, 0 overdue');
  });

  it('opens a board from its card, and the Boards tab stays active', () => {
    const { container } = render(
      <>
        <BoardsScreen />
        <TabBar />
      </>,
    );
    fireEvent.click(card(container, 'b2'));
    expect(activeView.value).toBe('boards');
    expect(boardOpen.value).toBe(true);
    expect(activeBoardId.value).toBe('b2');
    expect(new URLSearchParams(window.location.search).get('board')).toBe('b2');
    expect(container.querySelector('[data-testid="tab-boards"]')!.getAttribute('aria-current')).toBe('page');
  });

  it('New board, in the card and in the header, opens the existing create flow', () => {
    const { container } = render(<BoardsScreen />);
    fireEvent.click(container.querySelector('[data-testid="boards-new-card"]') as HTMLElement);
    expect(showCreateBoardModal.value).toBe(true);
    showCreateBoardModal.value = false;
    fireEvent.click(container.querySelector('[data-testid="boards-new-header"]') as HTMLElement);
    expect(showCreateBoardModal.value).toBe(true);
  });

  it('Archived boards shows the count and opens the existing dialog', () => {
    const { container } = render(<BoardsScreen />);
    const row = container.querySelector('[data-testid="boards-archived"]') as HTMLElement;
    expect(row.textContent).toContain('Archived boards');
    expect(row.querySelector('.boards-archived-count')!.textContent).toBe('1');
    fireEvent.click(row);
    expect(showArchivedBoardsDialog.value).toBe(true);
  });

  it('hides the Archived boards row when there are none', () => {
    boards.value = boards.value.filter((b) => b.id !== 'b4');
    const { container } = render(<BoardsScreen />);
    expect(container.querySelector('[data-testid="boards-archived"]')).toBeNull();
  });

  it('no boards: says so and still offers New board', () => {
    boards.value = [];
    const { container } = render(<BoardsScreen />);
    expect(container.querySelector('[data-testid="boards-none"]')!.textContent).toBe('No boards yet.');
    expect(container.querySelector('[data-testid="boards-new-card"]')).not.toBeNull();
  });
});

describe('Boards navigation (#625)', () => {
  it('?view=boards is the list; ?board=<id> is a board', () => {
    window.history.replaceState(null, '', '/?view=boards');
    initActiveViewFromUrl();
    expect([activeView.value, boardOpen.value]).toEqual(['boards', false]);
    expect(document.title).toBe('Hive — Boards');

    window.history.replaceState(null, '', '/?board=b2');
    activeBoardId.value = 'b2';
    initActiveViewFromUrl();
    expect([activeView.value, boardOpen.value]).toEqual(['boards', true]);
    expect(document.title).toBe('Hive — Work');
  });

  it('tapping Boards while a board is open returns to the list', () => {
    navigate('boards', 'b2');
    expect(boardOpen.value).toBe(true);
    openBoardsTab();
    expect(boardOpen.value).toBe(false);
    expect(new URLSearchParams(window.location.search).get('view')).toBe('boards');
    expect(new URLSearchParams(window.location.search).get('board')).toBeNull();
  });

  it('Today then Boards restores the board that was open', () => {
    navigate('boards', 'b2');
    navigate('today');
    openBoardsTab();
    expect([activeView.value, boardOpen.value, activeBoardId.value]).toEqual(['boards', true, 'b2']);
  });

  it('Today then Boards restores the list when the list was last', () => {
    navigate('boards', 'b2');
    openBoardsTab(); // back to the list
    navigate('settings');
    openBoardsTab();
    expect([activeView.value, boardOpen.value]).toEqual(['boards', false]);
  });

  it('does not restore a board that has since gone', () => {
    navigate('boards', 'b2');
    navigate('today');
    boards.value = boards.value.filter((b) => b.id !== 'b2');
    openBoardsTab();
    expect([activeView.value, boardOpen.value]).toEqual(['boards', false]);
  });

  it('the tab bar link restores, and the rail heading always goes to the list', () => {
    navigate('boards', 'b2');
    navigate('today');
    const { container } = render(
      <>
        <TabBar />
        <NavRail user={{ email: ME, name: 'Luke', picture: '' }} displayName="Luke" />
      </>,
    );
    fireEvent.click(container.querySelector('[data-testid="rail-boards-heading"]') as HTMLElement);
    expect([activeView.value, boardOpen.value]).toEqual(['boards', false]);
    navigate('today');
    fireEvent.click(container.querySelector('[data-testid="tab-boards"]') as HTMLElement);
    expect([activeView.value, boardOpen.value]).toEqual(['boards', false]);
  });

  it('the rail heading is a link marked active on the list; a board row is active only when open', () => {
    const user = { email: ME, name: 'Luke', picture: '' };
    activeView.value = 'today';
    const { container, rerender } = render(<NavRail user={user} displayName="Luke" />);
    const heading = () => container.querySelector('[data-testid="rail-boards-heading"]') as HTMLElement;
    expect(heading().tagName).toBe('A');
    expect(heading().getAttribute('href')).toContain('view=boards');
    expect(heading().getAttribute('aria-current')).toBeNull();

    navigate('boards');
    rerender(<NavRail user={user} displayName="Luke" />);
    expect(heading().getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('[data-testid="rail-board-b1"]')!.getAttribute('aria-current')).toBeNull();

    navigate('boards', 'b2');
    rerender(<NavRail user={user} displayName="Luke" />);
    expect(heading().getAttribute('aria-current')).toBeNull();
    expect(container.querySelector('[data-testid="rail-board-b2"]')!.getAttribute('aria-current')).toBe('page');
  });
});
