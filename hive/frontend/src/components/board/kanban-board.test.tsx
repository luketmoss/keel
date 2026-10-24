import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { KanbanBoard } from './kanban-board';
import { AuthContext } from '../../auth/auth-context';
import type { AuthState } from '../../auth/auth-context';

// Mutable mock state — defined as plain objects so vi.mock hoisting works
const mockState = {
  items: [] as any[],
  showShareModal: false,
  userBoardRole: null as string | null,
  showCreateModal: false,
  showCreateBoardModal: false,
  showDeleteBoardModal: false,
  showArchiveDialog: false,
  selectedItem: null as any,
  accessibleBoards: [] as any[],
  groupByValue: 'none' as string,
  activeView: 'boards' as string,
  boardOpen: true,
};

const mockSwitchBoard = vi.fn();
const mockOpenCreateForToday = vi.fn();

afterEach(() => {
  cleanup();
  mockState.items = [];
  mockState.showShareModal = false;
  mockState.userBoardRole = null;
  mockState.showCreateModal = false;
  mockState.showCreateBoardModal = false;
  mockState.showDeleteBoardModal = false;
  mockState.showArchiveDialog = false;
  mockState.selectedItem = null;
  mockState.accessibleBoards = [];
  mockState.groupByValue = 'none';
  mockState.activeView = 'boards';
  mockState.boardOpen = true;
  mockSwitchBoard.mockClear();
  mockMoveItem.mockClear();
});

vi.mock('../../state/board-store', async () => {
  const { signal } = await import('@preact/signals');
  return {
    items: {
      get value() {
        return mockState.items;
      },
    },
    columns: {
      get value() {
        return {
          'To Do': mockState.items.filter((i: any) => i.status === 'To Do' && !i.parent_id),
          'In Progress': mockState.items.filter((i: any) => i.status === 'In Progress' && !i.parent_id),
          Done: mockState.items.filter((i: any) => i.status === 'Done' && !i.parent_id),
        };
      },
    },
    rootItems: {
      get value() {
        return mockState.items.filter((i: any) => !i.parent_id);
      },
    },
    showCreateModal: {
      get value() {
        return mockState.showCreateModal;
      },
      set value(v: boolean) {
        mockState.showCreateModal = v;
      },
    },
    selectedItem: {
      get value() {
        return mockState.selectedItem;
      },
      set value(v: any) {
        mockState.selectedItem = v;
      },
    },
    selectedItemId: { value: null },
    openDetailWithTitleEdit: { value: false },
    groupBy: {
      get value() {
        return mockState.groupByValue;
      },
      set value(v: string) {
        mockState.groupByValue = v;
      },
    },
    owners: { value: [] },
    boardLabels: { value: [] },
    filterOwner: { value: null },
    filterLabel: { value: null },
    filterSearch: { value: '' },
    filterDue: { value: null },
    selectedColumnIndex: signal(0),
    createModalInitialStatus: { value: null as string | null },
    loading: { value: false },
    getChildCount: () => ({ done: 0, total: 0 }),
    setGroupBy: (v: string) => {
      mockState.groupByValue = v;
    },
    allDoneItems: { value: [] },
    hasArchivedItems: { value: false },
    showArchiveDialog: {
      get value() {
        return mockState.showArchiveDialog;
      },
      set value(v: boolean) {
        mockState.showArchiveDialog = v;
      },
    },
    boards: { value: [] },
    boardItems: {
      get value() {
        return mockState.items;
      },
    },
    showCreateBoardModal: {
      get value() {
        return mockState.showCreateBoardModal;
      },
      set value(v: boolean) {
        mockState.showCreateBoardModal = v;
      },
    },
    showShareModal: {
      get value() {
        return mockState.showShareModal;
      },
      set value(v: boolean) {
        mockState.showShareModal = v;
      },
    },
    showDeleteBoardModal: {
      get value() {
        return mockState.showDeleteBoardModal;
      },
      set value(v: boolean) {
        mockState.showDeleteBoardModal = v;
      },
    },
    showMoveToBoardModal: { value: false },
    showArchiveBoardModal: { value: false },
    showArchivedBoardsDialog: { value: false },
    accessibleBoards: {
      get value() {
        return mockState.accessibleBoards;
      },
    },
    activeBoard: { value: null },
    userBoardRole: {
      get value() {
        return mockState.userBoardRole;
      },
    },
    permissions: { value: [] },
    currentUserEmail: { value: '' },
    switchBoard: (...args: any[]) => mockSwitchBoard(...args),
    theme: { value: 'system' },
    applyTheme: () => {},
    cycleTheme: () => {},
    setTheme: () => {},
    columnSortModes: {
      get value() {
        return { 'To Do': 'custom', 'In Progress': 'custom', Done: 'custom' };
      },
    },
    setColumnSortMode: () => {},
    columnAnnouncement: { value: null },
    activeView: {
      get value() {
        return mockState.activeView;
      },
    },
    boardOpen: {
      get value() {
        return mockState.boardOpen;
      },
    },
    boardStatuses: {
      value: [
        {
          id: 's1',
          board_id: 'board-1',
          name: 'To Do',
          sort_order: 1,
          color: '#e3f2fd',
          is_terminal: false,
          created_at: '',
        },
        {
          id: 's2',
          board_id: 'board-1',
          name: 'In Progress',
          sort_order: 2,
          color: '#fff3e0',
          is_terminal: false,
          created_at: '',
        },
        {
          id: 's3',
          board_id: 'board-1',
          name: 'Done',
          sort_order: 3,
          color: '#e8f5e9',
          is_terminal: true,
          created_at: '',
        },
      ],
    },
    isTerminalStatus: (name: string) => name === 'Done',
    defaultStatusName: () => 'To Do',
    terminalStatusName: () => 'Done',
  };
});

const mockMoveItem = vi.fn();
vi.mock('../../state/actions', () => ({
  moveItem: (...args: any[]) => mockMoveItem(...args),
  reorderItem: vi.fn(),
}));

// The shell has its own tests; here it only has to be there.
vi.mock('../shell/nav-rail', () => ({
  NavRail: (props: any) => <nav data-testid="nav-rail">{props.displayName}</nav>,
}));
vi.mock('../shell/tab-bar', () => ({
  TabBar: () => <nav data-testid="tab-bar" />,
}));
vi.mock('../shell/settings-screen', () => ({
  SettingsScreen: (props: any) => (
    <div data-testid="settings-screen">
      <button data-testid="settings-edit-profile" onClick={props.onEditProfile}>
        Edit profile
      </button>
      <button data-testid="settings-shortcuts" onClick={props.onOpenShortcuts}>
        Keyboard shortcuts
      </button>
      <button data-testid="settings-signout" onClick={props.onSignOut}>
        Sign out
      </button>
    </div>
  ),
}));

vi.mock('../header/control-bar', () => ({
  ControlBar: () => <div data-testid="control-bar" />,
}));

// Mock other sub-components
vi.mock('./list-view', () => ({
  ListView: () => <div class="list-view" data-testid="list-view" />,
}));
vi.mock('../boards/boards-screen', () => ({
  BoardsScreen: () => <div class="boards-screen" data-testid="boards-screen" />,
}));
vi.mock('../today/today-screen', () => ({
  TodayScreen: () => <div class="today-screen" data-testid="today-screen" />,
  openCreateForToday: () => mockOpenCreateForToday(),
}));
vi.mock('./card-detail', () => ({
  CardDetail: () => <div data-testid="card-detail" />,
}));
vi.mock('../forms/create-item-modal', () => ({
  CreateItemModal: () => <div data-testid="create-modal" />,
}));
vi.mock('./create-board-modal', () => ({
  CreateBoardModal: () => null,
}));
vi.mock('./share-modal', () => ({
  ShareModal: () => null,
}));
vi.mock('./delete-board-modal', () => ({
  DeleteBoardModal: () => null,
}));
vi.mock('./shortcuts-help', () => ({
  ShortcutsHelp: ({ onClose }: any) => (
    <div data-testid="shortcuts-help">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));
vi.mock('../profile/profile-dialog', () => ({
  ProfileDialog: () => <div data-testid="profile-dialog" />,
}));
vi.mock('../archive/archive-dialog', () => ({
  ArchiveDialog: () => <div data-testid="archive-dialog" />,
}));

const mockAuth: AuthState = {
  token: 'test-token',
  user: { name: 'Luke', email: 'luke@example.com', picture: '' },
  isAuthenticated: true,
  rememberedUser: null,
  ready: true,
  renewing: false,
  renewError: null,
  continueAs: () => {},
  login: () => {},
  logout: () => {},
  updateUserName: () => {},
};

function renderBoard() {
  return render(
    <AuthContext.Provider value={mockAuth}>
      <KanbanBoard />
    </AuthContext.Provider>,
  );
}

describe('KanbanBoard empty/welcome state (Issue #11)', () => {
  describe('AC1: Empty board shows welcome message', () => {
    it('shows welcome message when board has zero items', () => {
      mockState.items = [];
      const { container } = renderBoard();
      const welcome = container.querySelector('[data-testid="board-welcome"]');
      expect(welcome).not.toBeNull();
      expect(welcome!.textContent).toContain('No tasks yet');
      expect(welcome!.textContent).toContain('+');
    });

    it('does not show welcome when board has items', () => {
      mockState.items = [
        {
          id: '1',
          title: 'Task',
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
          board_id: '',
          sheetRow: 2,
        },
      ];
      const { container } = renderBoard();
      const welcome = container.querySelector('[data-testid="board-welcome"]');
      expect(welcome).toBeNull();
    });

    it('does not show columns when board is empty', () => {
      mockState.items = [];
      const { container } = renderBoard();
      const columns = container.querySelector('.board-columns');
      expect(columns).toBeNull();
    });
  });

  describe('AC2: Empty columns still show standard text', () => {
    it('renders columns with "Nothing here yet" when board has items but some columns are empty', () => {
      mockState.items = [
        {
          id: '1',
          title: 'Task',
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
          board_id: '',
          sheetRow: 2,
        },
      ];
      const { container } = renderBoard();
      const welcome = container.querySelector('[data-testid="board-welcome"]');
      expect(welcome).toBeNull();

      const emptyColumns = container.querySelectorAll('.column-empty');
      expect(emptyColumns.length).toBe(2);
      emptyColumns.forEach((el) => {
        expect(el.textContent).toBe('Nothing here yet');
      });
    });
  });
});

describe('KanbanBoard shell (Issue #623)', () => {
  it('renders the rail and the tab bar, and no header or user dropdown', () => {
    mockState.items = [];
    const { container } = renderBoard();
    expect(container.querySelector('[data-testid="nav-rail"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="tab-bar"]')).not.toBeNull();
    expect(container.querySelector('.board-header')).toBeNull();
    expect(container.querySelector('[data-testid="user-dropdown"]')).toBeNull();
    expect(container.querySelector('[data-testid="control-bar-view-tabs"]')).toBeNull();
  });

  it('passes the display name to the rail', () => {
    mockState.items = [];
    const { container } = renderBoard();
    expect(container.querySelector('[data-testid="nav-rail"]')!.textContent).toBe('Luke');
  });

  it('hides the tab bar while an item is open', () => {
    mockState.items = [];
    mockState.selectedItem = { id: '1', title: 'x' };
    const { container } = renderBoard();
    expect(container.querySelector('[data-testid="tab-bar"]')).toBeNull();
    expect(container.querySelector('[data-testid="card-detail"]')).not.toBeNull();
  });

  describe('Boards', () => {
    it('renders the control bar, the board and the new-item button', () => {
      mockState.items = [];
      const { container } = renderBoard();
      expect(container.querySelector('[data-testid="control-bar"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="board-welcome"]')).not.toBeNull();
      expect(container.querySelector('.fab')).not.toBeNull();
    });
  });

  describe('Boards list (#625)', () => {
    beforeEach(() => {
      mockState.boardOpen = false;
    });

    it('shows the list alone: no control bar, board or new-item button', () => {
      const { container } = renderBoard();
      expect(container.querySelector('[data-testid="boards-screen"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="control-bar"]')).toBeNull();
      expect(container.querySelector('[data-testid="board-welcome"]')).toBeNull();
      expect(container.querySelector('.fab')).toBeNull();
    });

    it('N and A and the board shortcuts do nothing on the list', () => {
      mockState.accessibleBoards = [{ id: 'b1', name: 'Work' }];
      renderBoard();

      fireEvent.keyDown(document, { key: 'n' });
      fireEvent.keyDown(document, { key: 'a' });
      fireEvent.keyDown(document, { key: '1', ctrlKey: true });

      expect(mockState.showCreateModal).toBe(false);
      expect(mockState.showArchiveDialog).toBe(false);
      expect(mockSwitchBoard).not.toHaveBeenCalled();
    });
  });

  describe('Today', () => {
    beforeEach(() => {
      mockState.activeView = 'today';
    });

    it('shows the Today screen, with no control bar and no board new-item button', () => {
      const { container } = renderBoard();
      expect(container.querySelector('[data-testid="today-screen"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="control-bar"]')).toBeNull();
      expect(container.querySelector('.fab')).toBeNull();
      expect(container.querySelector('[data-testid="board-welcome"]')).toBeNull();
    });
  });

  describe('Settings', () => {
    beforeEach(() => {
      mockState.activeView = 'settings';
    });

    it('shows the Settings screen alone: no control bar, board or new-item button', () => {
      const { container } = renderBoard();
      expect(container.querySelector('[data-testid="settings-screen"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="control-bar"]')).toBeNull();
      expect(container.querySelector('.fab')).toBeNull();
    });

    it('Edit profile opens the profile dialog', () => {
      const { container } = renderBoard();
      fireEvent.click(container.querySelector('[data-testid="settings-edit-profile"]') as HTMLElement);
      expect(container.querySelector('[data-testid="profile-dialog"]')).not.toBeNull();
    });

    it('Keyboard shortcuts opens the help', () => {
      const { container } = renderBoard();
      fireEvent.click(container.querySelector('[data-testid="settings-shortcuts"]') as HTMLElement);
      expect(container.querySelector('[data-testid="shortcuts-help"]')).not.toBeNull();
    });
  });
});

describe('KanbanBoard ARIA labels (Issue #7)', () => {
  describe('AC2: FAB has accessible label', () => {
    it('FAB button has aria-label="Create new item"', () => {
      mockState.items = [];
      const { container } = renderBoard();
      const fab = container.querySelector('.fab') as HTMLElement;
      expect(fab).not.toBeNull();
      expect(fab.getAttribute('aria-label')).toBe('Create new item');
    });

    it('FAB button has title="Create new item"', () => {
      mockState.items = [];
      const { container } = renderBoard();
      const fab = container.querySelector('.fab') as HTMLElement;
      expect(fab.getAttribute('title')).toBe('Create new item');
    });
  });
});

describe('KanbanBoard keyboard shortcut (Issue #90)', () => {
  describe('AC2: Ctrl+Shift+S opens share modal for owners', () => {
    it('opens share modal on Ctrl+Shift+S when user is owner', () => {
      mockState.items = [];
      mockState.userBoardRole = 'owner';
      renderBoard();

      fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true });

      expect(mockState.showShareModal).toBe(true);
    });

    it('opens share modal on Cmd+Shift+S (Mac) when user is owner', () => {
      mockState.items = [];
      mockState.userBoardRole = 'owner';
      renderBoard();

      fireEvent.keyDown(document, { key: 'S', metaKey: true, shiftKey: true });

      expect(mockState.showShareModal).toBe(true);
    });
  });

  describe('AC3: Shortcut inactive for non-owners', () => {
    it('does not open share modal when user is member', () => {
      mockState.items = [];
      mockState.userBoardRole = 'member';
      renderBoard();

      fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true });

      expect(mockState.showShareModal).toBe(false);
    });

    it('does not open share modal when user has no role', () => {
      mockState.items = [];
      mockState.userBoardRole = null;
      renderBoard();

      fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true });

      expect(mockState.showShareModal).toBe(false);
    });
  });

  describe('Shortcut guards', () => {
    it('does not open share modal when another modal is open', () => {
      mockState.items = [];
      mockState.userBoardRole = 'owner';
      mockState.showCreateModal = true;
      renderBoard();

      fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true });

      expect(mockState.showShareModal).toBe(false);
    });

    it('does not open share modal when share modal is already open', () => {
      mockState.items = [];
      mockState.userBoardRole = 'owner';
      mockState.showShareModal = true;
      renderBoard();

      fireEvent.keyDown(document, { key: 'S', ctrlKey: true, shiftKey: true });

      expect(mockState.showShareModal).toBe(true);
    });
  });
});

describe('KanbanBoard keyboard shortcuts (Issue #91)', () => {
  describe('AC1: Archive shortcut', () => {
    it('opens archive dialog when A is pressed', () => {
      mockState.items = [];
      renderBoard();

      fireEvent.keyDown(document, { key: 'a' });

      expect(mockState.showArchiveDialog).toBe(true);
    });

    it('closes archive dialog when A is pressed again', () => {
      mockState.items = [];
      mockState.showArchiveDialog = true;
      renderBoard();

      fireEvent.keyDown(document, { key: 'a' });

      expect(mockState.showArchiveDialog).toBe(false);
    });
  });

  describe('AC2: Board switching shortcuts', () => {
    it('switches to board at position with Ctrl+number', () => {
      mockState.items = [];
      mockState.accessibleBoards = [
        { id: 'b1', name: 'Board 1' },
        { id: 'b2', name: 'Board 2' },
      ];
      renderBoard();

      fireEvent.keyDown(document, { key: '2', ctrlKey: true });

      expect(mockSwitchBoard).toHaveBeenCalledWith('b2');
    });

    it('switches to first board with Cmd+1 (Mac)', () => {
      mockState.items = [];
      mockState.accessibleBoards = [
        { id: 'b1', name: 'Board 1' },
        { id: 'b2', name: 'Board 2' },
      ];
      renderBoard();

      fireEvent.keyDown(document, { key: '1', metaKey: true });

      expect(mockSwitchBoard).toHaveBeenCalledWith('b1');
    });

    it('does nothing when number exceeds board count', () => {
      mockState.items = [];
      mockState.accessibleBoards = [{ id: 'b1', name: 'Board 1' }];
      renderBoard();

      fireEvent.keyDown(document, { key: '5', ctrlKey: true });

      expect(mockSwitchBoard).not.toHaveBeenCalled();
    });
  });

  describe('AC3: New item shortcut', () => {
    it('opens create modal when N is pressed', () => {
      mockState.items = [];
      renderBoard();

      fireEvent.keyDown(document, { key: 'n' });

      expect(mockState.showCreateModal).toBe(true);
    });

    it('does not open create modal when another modal is already open', () => {
      mockState.items = [];
      mockState.showArchiveDialog = true;
      renderBoard();

      fireEvent.keyDown(document, { key: 'n' });

      expect(mockState.showCreateModal).toBe(false);
    });
  });

  describe('#623: A acts on a board only; N also on Today (#624)', () => {
    it.each(['today', 'settings'])('A does nothing on %s, and N does not open the board form', (view) => {
      mockState.activeView = view;
      renderBoard();

      fireEvent.keyDown(document, { key: 'n' });
      fireEvent.keyDown(document, { key: 'a' });

      expect(mockState.showCreateModal).toBe(false);
      expect(mockState.showArchiveDialog).toBe(false);
    });

    it('N opens the create form for the selected day on Today', () => {
      mockOpenCreateForToday.mockClear();
      mockState.activeView = 'today';
      mockState.accessibleBoards = [{ id: 'b1', name: 'Work' }];
      renderBoard();

      fireEvent.keyDown(document, { key: 'n' });

      expect(mockOpenCreateForToday).toHaveBeenCalledTimes(1);
    });

    it('N does nothing on Settings', () => {
      mockOpenCreateForToday.mockClear();
      mockState.activeView = 'settings';
      mockState.accessibleBoards = [{ id: 'b1', name: 'Work' }];
      renderBoard();

      fireEvent.keyDown(document, { key: 'n' });

      expect(mockOpenCreateForToday).not.toHaveBeenCalled();
    });

    it('? still opens the help on Today', () => {
      mockState.activeView = 'today';
      const { container } = renderBoard();

      fireEvent.keyDown(document, { key: '?' });

      expect(container.querySelector('[data-testid="shortcuts-help"]')).not.toBeNull();
    });
  });

  describe('AC4: Shortcuts help overlay', () => {
    it('opens shortcuts help when ? is pressed', () => {
      mockState.items = [];
      const { queryByTestId } = renderBoard();

      fireEvent.keyDown(document, { key: '?', shiftKey: true });

      expect(queryByTestId('shortcuts-help')).not.toBeNull();
    });
  });
});

describe('Status grouping renders ListView (Issue #137)', () => {
  const sampleItem = {
    id: '1',
    title: 'Task A',
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
    board_id: '',
    sheetRow: 2,
  };

  it('renders .list-view inside .board-main when groupBy is status', () => {
    mockState.items = [sampleItem];
    mockState.groupByValue = 'status';
    const { container } = renderBoard();
    const boardMain = container.querySelector('.board-main');
    expect(boardMain).not.toBeNull();
    const listView = boardMain!.querySelector('.list-view');
    expect(listView).not.toBeNull();
  });

  it('does not render .list-view inside .board-main when groupBy is none', () => {
    mockState.items = [sampleItem];
    mockState.groupByValue = 'none';
    const { container } = renderBoard();
    const boardMain = container.querySelector('.board-main');
    expect(boardMain).not.toBeNull();
    const listView = boardMain!.querySelector('.list-view');
    expect(listView).toBeNull();
  });
});

// --- Column tabs on a phone, in place of the dot pager (#626) ---
describe('KanbanBoard column tabs (#626)', () => {
  const sample = (id: string, status: string) => ({
    id,
    title: `Task ${id}`,
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
    board_id: '',
    sheetRow: 2,
  });
  const tabs = (c: Element) => [...c.querySelectorAll('[role="tab"]')] as HTMLElement[];

  beforeEach(async () => {
    const store = await import('../../state/board-store');
    (store.selectedColumnIndex as { value: number }).value = 0;
    (store.createModalInitialStatus as { value: string | null }).value = null;
  });

  it('shows one tab per column with its count, the first selected, and no dot pager', () => {
    mockState.items = [sample('1', 'To Do'), sample('2', 'To Do'), sample('3', 'Done')];
    const { container } = renderBoard();
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs(container).map((t) => t.textContent)).toEqual(['To Do2', 'In Progress0', 'Done1']);
    expect(tabs(container).map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(container.querySelector('.column-indicator')).toBeNull();
    expect(container.querySelector('.column-indicator-dot')).toBeNull();
  });

  it('tapping a tab selects it and scrolls the columns to it', () => {
    mockState.items = [sample('1', 'To Do')];
    const { container } = renderBoard();
    const main = container.querySelector('.board-main') as HTMLElement;
    Object.defineProperty(main, 'clientWidth', { value: 400, configurable: true });
    const scrollTo = vi.fn();
    main.scrollTo = scrollTo as unknown as typeof main.scrollTo;

    fireEvent.click(tabs(container)[2]);
    expect(scrollTo).toHaveBeenCalledWith({ left: 800, behavior: 'smooth' });
    expect(tabs(container).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
  });

  it('swiping to a column selects its tab', () => {
    mockState.items = [sample('1', 'To Do')];
    const { container } = renderBoard();
    const main = container.querySelector('.board-main') as HTMLElement;
    Object.defineProperty(main, 'clientWidth', { value: 400, configurable: true });
    main.scrollLeft = 400;
    fireEvent.scroll(main);
    expect(tabs(container).map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
  });

  it('arrow keys move between tabs', () => {
    mockState.items = [sample('1', 'To Do')];
    const { container } = renderBoard();
    fireEvent.keyDown(tabs(container)[0], { key: 'ArrowRight' });
    expect(tabs(container)[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs(container)[1], { key: 'End' });
    expect(tabs(container)[2].getAttribute('aria-selected')).toBe('true');
  });

  it('has no tabs when the cards are grouped, or the board is empty', () => {
    mockState.items = [sample('1', 'To Do')];
    mockState.groupByValue = 'label';
    expect(tabs(renderBoard().container)).toHaveLength(0);
    cleanup();
    mockState.groupByValue = 'none';
    mockState.items = [];
    expect(tabs(renderBoard().container)).toHaveLength(0);
  });

  it('the new-item button adds to the selected column on a phone, and to the default on a wide screen', async () => {
    const store = await import('../../state/board-store');
    const initial = store.createModalInitialStatus as { value: string | null };
    mockState.items = [sample('1', 'To Do')];
    const { container } = renderBoard();
    fireEvent.click(tabs(container)[1]);

    const matchMedia = window.matchMedia;
    const stub = (matches: boolean) =>
      (window.matchMedia = ((q: string) => ({
        matches,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia);
    try {
      stub(true);
      fireEvent.click(container.querySelector('.fab') as HTMLElement);
      expect(initial.value).toBe('In Progress');

      initial.value = null;
      stub(false);
      fireEvent.click(container.querySelector('.fab') as HTMLElement);
      expect(initial.value).toBeNull();
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
