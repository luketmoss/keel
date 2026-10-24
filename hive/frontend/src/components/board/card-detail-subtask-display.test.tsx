import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { CardDetail } from './card-detail';
import { AuthContext } from '../../auth/auth-context';
import type { AuthState } from '../../auth/auth-context';

// @ts-ignore -- Node builtins available in vitest
import { readFileSync } from 'fs';
// @ts-ignore
import { resolve } from 'path';

afterEach(() => {
  cleanup();
});

// --- Mock state ---
let mockSelectedItemId: string | null = 'parent-1';
let mockChildren: any[] = [];
let mockItems: any[] = [];

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
        title: 'Parent Task',
        description: '',
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
        sheetRow: 2,
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
  accessibleBoards: { value: [] },
  activeBoardId: { value: 'board-1' },
  showMoveToBoardModal: { value: false },
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

function renderDetail() {
  return render(
    <AuthContext.Provider value={mockAuth}>
      <CardDetail />
    </AuthContext.Provider>,
  );
}

function makeChild(overrides: Record<string, any> = {}) {
  return {
    id: 'child-1',
    title: 'Sub-task one',
    description: '',
    status: 'To Do' as const,
    owner: 'Luke',
    due_date: '',
    labels: '',
    parent_id: 'parent-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: '',
    sort_order: 1,
    created_by: 'luke@example.com',
    board_id: '',
    sheetRow: 3,
    ...overrides,
  };
}

// --- CSS tests (AC1 desktop + mobile, AC5 mobile) ---

// @ts-ignore
const cssPath = resolve(__dirname, '../../global.css');
const css = readFileSync(cssPath, 'utf-8');

function extractMobileBlock(source: string): string {
  const re = /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{/g;
  const match = re.exec(source);
  if (!match) return '';
  let depth = 1;
  let i = match.index + match[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const mobileBlock = extractMobileBlock(css);

describe('Issue #204: Sub-item display improvements', () => {
  beforeEach(() => {
    mockSelectedItemId = 'parent-1';
    mockChildren = [];
    mockItems = [];
  });

  // --- AC1: Subtask title display ---
  describe('AC1: Subtask title display', () => {
    it('desktop: subtask-title is a clickable span with role=button', () => {
      mockChildren = [makeChild({ id: 'c1', title: 'Buy groceries', status: 'To Do', sort_order: 1 })];
      const { container } = renderDetail();
      const title = container.querySelector('.subtask-title');
      expect(title).not.toBeNull();
      expect(title!.getAttribute('role')).toBe('button');
    });

    it('desktop: subtask-title has cursor pointer CSS', () => {
      expect(css).toMatch(/\.subtask-title\s*\{[^}]*cursor:\s*pointer/);
    });

    it('desktop: subtask-kebab-btn is always visible (no hover-to-reveal)', () => {
      expect(css).toMatch(/\.subtask-kebab-btn\s*\{/);
    });

    it('subtask-title cursor pointer style is in CSS', () => {
      expect(css).toMatch(/\.subtask-title\s*\{[^}]*cursor:\s*pointer/);
    });
  });

  // --- AC2: one list in order; done ones stay in place, struck through (#627) ---
  describe('AC2: One list, done subtasks stay in order', () => {
    it('all items are always visible, in their own order', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Done first', status: 'Done', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Incomplete', status: 'To Do', sort_order: 2 }),
      ];

      const { container } = renderDetail();
      const subtaskItems = container.querySelectorAll('.subtask-item');
      expect(subtaskItems.length).toBe(2);
      expect(subtaskItems[0].textContent).toContain('Done first');
      expect(subtaskItems[0].classList.contains('subtask-done')).toBe(true);
      expect(subtaskItems[1].classList.contains('subtask-done')).toBe(false);
    });

    it('has no "completed" divider', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Incomplete', status: 'To Do', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Done', status: 'Done', sort_order: 2 }),
      ];

      const { container } = renderDetail();
      expect(container.querySelector('.subtask-divider')).toBeNull();
      expect(container.textContent).not.toMatch(/completed/i);
    });

    it('when ALL sub-items are completed, all items are still visible', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Done one', status: 'Done', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Done two', status: 'Done', sort_order: 2 }),
      ];

      const { container } = renderDetail();
      const subtaskItems = container.querySelectorAll('.subtask-item');
      expect(subtaskItems.length).toBe(2);
    });

    it('done subtasks are struck through in muted text, not faded', () => {
      expect(css).toMatch(/\.subtask-done \.subtask-title\s*\{[^}]*line-through/);
      expect(css).toMatch(/\.subtask-done \.subtask-title\s*\{[^}]*color:\s*var\(--color-text-muted\)/);
      expect(css).not.toMatch(/\.subtask-done\s*\{[^}]*opacity/);
    });
  });

  // --- AC3: Drag reorder (arrow buttons removed) ---
  // #246: #238 moved reorder onto a dedicated grab handle, so the row itself is
  // no longer draggable; `.subtask-handle` carries it. #627: the list is one list,
  // so every row's handle is draggable once there is more than one subtask.
  describe('AC3: Drag reorder through the handle', () => {
    it('every row has a draggable handle when there is more than one subtask', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Incomplete A', status: 'To Do', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Incomplete B', status: 'To Do', sort_order: 2 }),
        makeChild({ id: 'c3', title: 'Done C', status: 'Done', sort_order: 3 }),
      ];

      const { container } = renderDetail();
      const subtaskItems = container.querySelectorAll('.subtask-item');
      expect(subtaskItems.length).toBe(3);
      expect(container.querySelectorAll('.subtask-handle').length).toBe(3);
      expect(container.querySelectorAll('.subtask-handle[draggable="true"]').length).toBe(3);

      // The row itself is no longer the drag initiator (#238)
      expect(container.querySelectorAll('.subtask-item[draggable="true"]').length).toBe(0);
    });
  });

  // --- AC4: Progress summary in the Subtasks card (#627) ---
  describe('AC4: Progress summary in the heading row', () => {
    it('says "<done> of <total> done" and fills the bar to that fraction', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Task A', status: 'To Do', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Task B', status: 'Done', sort_order: 2 }),
        makeChild({ id: 'c3', title: 'Task C', status: 'Done', sort_order: 3 }),
      ];

      const { container } = renderDetail();
      expect(container.querySelector('.detail-subtasks-count')!.textContent).toBe('2 of 3 done');
      const bar = container.querySelector('.subtask-progress') as HTMLElement;
      expect(bar.getAttribute('aria-valuenow')).toBe('2');
      expect(bar.getAttribute('aria-valuemax')).toBe('3');
      const fill = bar.querySelector('.subtask-progress-fill') as HTMLElement;
      expect(parseFloat(fill.style.width)).toBeCloseTo(66.67, 1);
    });

    it('says "0 of N done" with an empty bar when none are complete', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Task A', status: 'To Do', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Task B', status: 'To Do', sort_order: 2 }),
      ];

      const { container } = renderDetail();
      expect(container.querySelector('.detail-subtasks-count')!.textContent).toBe('0 of 2 done');
      expect((container.querySelector('.subtask-progress-fill') as HTMLElement).style.width).toBe('0%');
    });

    it('with no subtasks says "None yet", draws no bar, and still has the add row', () => {
      mockChildren = [];
      const { container } = renderDetail();
      expect(container.querySelector('.detail-subtasks-count')!.textContent).toBe('None yet');
      expect(container.querySelector('.subtask-progress')).toBeNull();
      expect(container.querySelector('.subtask-add-input')).not.toBeNull();
    });
  });

  // --- AC5: Keyboard and screen reader support ---
  describe('AC5: Keyboard and screen reader support', () => {
    it('check-icon button is named for what pressing it does', () => {
      mockChildren = [
        makeChild({ id: 'c1', title: 'Incomplete', status: 'To Do', sort_order: 1 }),
        makeChild({ id: 'c2', title: 'Done', status: 'Done', sort_order: 2 }),
      ];

      const { container } = renderDetail();
      const checkBtns = container.querySelectorAll('.check-icon');
      expect(checkBtns.length).toBe(2);
      expect((checkBtns[0] as HTMLElement).getAttribute('aria-label')).toBe('Mark done: Incomplete');
      expect((checkBtns[1] as HTMLElement).getAttribute('aria-label')).toBe('Mark not done: Done');
    });

    it('subtask-item has min-height for touch targets', () => {
      expect(css).toMatch(/\.subtask-item\s*\{[^}]*min-height:/);
    });
  });
});
