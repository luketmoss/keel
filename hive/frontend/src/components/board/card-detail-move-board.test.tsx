import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { CardDetail } from './card-detail';
import { AuthContext } from '../../auth/auth-context';
import type { AuthState } from '../../auth/auth-context';

afterEach(() => {
  cleanup();
});

let mockSelectedItemId: string | null = 'move-test-1';
let mockChildren: any[] = [];
let mockItems: any[] = [];
let mockAccessibleBoards: any[] = [];
let mockActiveBoardId = 'board-family';
let mockShowMoveToBoardModal = false;

// Track what item the mock returns based on selectedItemId
let mockSelectedItemOverrides: Record<string, any> = {};

vi.mock('../../state/board-store', () => ({
  activeView: { value: 'boards' },
  selectedItemId: {
    get value() {
      return mockSelectedItemId;
    },
    set value(v: string | null) {
      mockSelectedItemId = v;
    },
  },
  openDetailWithTitleEdit: { value: false },
  selectedItem: {
    get value() {
      if (!mockSelectedItemId) return null;
      return {
        id: mockSelectedItemId,
        title: 'Test Item',
        description: 'A test description',
        status: 'To Do',
        owner: 'Luke',
        due_date: '',
        labels: '',
        parent_id: '',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        completed_at: '',
        sort_order: 1,
        created_by: 'luke@example.com',
        board_id: 'board-family',
        sheetRow: 2,
        ...mockSelectedItemOverrides,
      };
    },
  },
  childrenOfSelected: {
    get value() {
      return mockChildren;
    },
  },
  items: {
    get value() {
      return mockItems;
    },
  },
  owners: { value: [{ name: 'Luke', google_account: 'luke@example.com' }] },
  labels: { value: [] },
  boardLabels: { value: [] },
  showToast: vi.fn(),
  accessibleBoards: {
    get value() {
      return mockAccessibleBoards;
    },
  },
  activeBoardId: {
    get value() {
      return mockActiveBoardId;
    },
  },
  showMoveToBoardModal: {
    get value() {
      return mockShowMoveToBoardModal;
    },
    set value(v: boolean) {
      mockShowMoveToBoardModal = v;
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
}));

vi.mock('../../state/actions', () => ({
  updateItem: vi.fn().mockResolvedValue(true),
  deleteItem: vi.fn(),
  deleteSubtask: vi.fn(),
  createItem: vi.fn(),
  moveItem: vi.fn().mockResolvedValue(true),
  reorderSubtasks: vi.fn(),
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

function renderCardDetail() {
  return render(
    <AuthContext.Provider value={mockAuth}>
      <CardDetail />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  mockSelectedItemId = 'move-test-1';
  mockChildren = [];
  mockItems = [];
  mockSelectedItemOverrides = {};
  mockAccessibleBoards = [
    { id: 'board-family', name: 'Family Board', created_at: '', created_by: '', color: '', icon: '' },
    { id: 'board-work', name: 'Work Projects', created_at: '', created_by: '', color: '#1976d2', icon: '' },
  ];
  mockActiveBoardId = 'board-family';
  mockShowMoveToBoardModal = false;
});

describe('Move to Board — CardDetail options menu and Board row (#627)', () => {
  const openMenu = (container: Element) => {
    fireEvent.click(container.querySelector('[aria-label="Item options"]') as HTMLElement);
    return Array.from(container.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
  };

  // AC1: the ⋮ menu opens the modal
  it('shows "Move to board…" in the Item options menu', () => {
    const { container } = renderCardDetail();
    const items = openMenu(container);
    expect(items.map((i) => i.textContent)).toEqual(['Move to board…', 'Copy', 'Delete item…']);
  });

  it('sets showMoveToBoardModal to true when chosen from the menu', () => {
    const { container } = renderCardDetail();
    fireEvent.click(openMenu(container)[0]);
    expect(mockShowMoveToBoardModal).toBe(true);
  });

  it('the Board row names the board and opens the same modal', () => {
    const { container } = renderCardDetail();
    const btn = container.querySelector('.detail-row-btn') as HTMLButtonElement;
    expect(btn.textContent).toBe('Family Board');
    fireEvent.click(btn);
    expect(mockShowMoveToBoardModal).toBe(true);
  });

  // AC6: Hidden for subtasks
  it('hides Move to Board button for subtask items', () => {
    mockSelectedItemOverrides = { parent_id: 'some-parent' };

    const { container } = renderCardDetail();
    expect(container.querySelector('.detail-row-btn')).toBeNull();
    expect(openMenu(container).map((i) => i.textContent)).not.toContain('Move to board…');
  });

  // AC7: Hidden when user has only one accessible board
  it('hides Move to Board button when only one accessible board', () => {
    mockAccessibleBoards = [
      { id: 'board-family', name: 'Family Board', created_at: '', created_by: '', color: '', icon: '' },
    ];

    const { container } = renderCardDetail();
    expect(container.querySelector('.detail-row-btn')).toBeNull();
    expect(openMenu(container).map((i) => i.textContent)).not.toContain('Move to board…');
  });
});
