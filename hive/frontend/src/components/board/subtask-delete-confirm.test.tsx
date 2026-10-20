// #448 — deleting a sub-task asks in the app, not with the browser's confirm().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { CardDetail } from './card-detail';
import { AuthContext } from '../../auth/auth-context';
import type { AuthState } from '../../auth/auth-context';
import { deleteSubtask, createItem } from '../../state/actions';
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync, readdirSync, statSync } from 'fs';
// @ts-ignore
import { join, resolve } from 'path';

afterEach(() => {
  cleanup();
});

let mockSelectedItemId: string | null = 'parent-1';
let mockChildren: any[] = [];

vi.mock('../../state/board-store', () => ({
  selectedItemId: {
    get value() {
      return mockSelectedItemId;
    },
    set value(v: string | null) {
      mockSelectedItemId = v;
    },
  },
  selectItem: (id: string) => {
    mockSelectedItemId = id;
  },
  clearSelectedItem: () => {
    mockSelectedItemId = null;
  },
  openDetailWithTitleEdit: { value: false },
  selectedItem: {
    get value() {
      if (!mockSelectedItemId) return null;
      return {
        id: mockSelectedItemId,
        title: 'Parent',
        description: '',
        status: 'To Do',
        owner: '',
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
  items: { value: [] },
  owners: { value: [] },
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
  createItem: vi.fn().mockResolvedValue(true),
  moveItem: vi.fn(),
  reorderSubtasks: vi.fn(),
}));

const mockAuth: AuthState = {
  token: 'test-token',
  user: { name: 'Luke', email: 'luke@example.com', picture: '' },
  isAuthenticated: true,
  isAuthLoading: false,
  login: () => {},
  logout: () => {},
  updateUserName: () => {},
};

const child = (id: string, title: string, status = 'To Do') => ({
  id,
  title,
  description: '',
  status,
  owner: '',
  due_date: '',
  labels: '',
  parent_id: 'parent-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  completed_at: '',
  sort_order: 1,
  created_by: 'luke@example.com',
  sheetRow: 3,
});

function renderDetail() {
  return render(
    <AuthContext.Provider value={mockAuth}>
      <CardDetail />
    </AuthContext.Provider>,
  );
}

/** Open sub-task `index`'s options menu and choose a menu entry by its label. */
function chooseFromMenu(container: Element, index: number, label: string) {
  const kebab = container.querySelectorAll('.subtask-kebab-btn')[index] as HTMLElement;
  fireEvent.click(kebab);
  const entry = [...container.querySelectorAll('.subtask-context-menu button')].find((b) =>
    b.textContent!.includes(label),
  ) as HTMLElement;
  fireEvent.click(entry);
}

const rows = (c: Element) => [...c.querySelectorAll('.subtask-item')] as HTMLElement[];

beforeEach(() => {
  mockSelectedItemId = 'parent-1';
  mockChildren = [child('c1', 'Buy milk'), child('c2', 'Walk the dog')];
  vi.clearAllMocks();
});

describe('AC1: no browser confirm() is left in Hive', () => {
  it('no non-test file under src calls confirm( or window.confirm', () => {
    // @ts-ignore -- __dirname available in vitest CJS context
    const src = resolve(__dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(src);
    const offenders = files.filter((f) => /(^|[^\w.])confirm\s*\(|window\.confirm/.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('opening and confirming a delete never calls window.confirm', () => {
    const spy = vi.spyOn(window, 'confirm');
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    fireEvent.click(container.querySelector('.subtask-delete-confirm .btn-danger') as HTMLElement);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('AC2: choosing Delete replaces the row with a confirm', () => {
  it('names the sub-task, says it cannot be undone, and deletes nothing yet', () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    const confirm = container.querySelector('.subtask-delete-confirm') as HTMLElement;
    expect(confirm).not.toBeNull();
    expect(confirm.querySelector('.subtask-delete-confirm-title')!.textContent).toBe('Delete sub-task "Buy milk"?');
    expect(confirm.querySelector('.subtask-delete-confirm-message')!.textContent).toBe('This cannot be undone.');
    expect([...confirm.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Delete sub-task']);
    expect(deleteSubtask).not.toHaveBeenCalled();
    // It replaced that row; the other row is untouched.
    expect(rows(container)[0].querySelector('.subtask-title')).toBeNull();
    expect(rows(container)[1].querySelector('.subtask-title')!.textContent).toBe('Walk the dog');
  });
});

describe('AC3: the confirming button is a danger verb phrase', () => {
  it('is .btn-danger reading exactly "Delete sub-task", with no OK or bare Delete', () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    const buttons = [...container.querySelectorAll('.subtask-delete-confirm button')] as HTMLElement[];
    const danger = buttons.find((b) => b.classList.contains('btn-danger'))!;
    expect(danger.textContent).toBe('Delete sub-task');
    expect(buttons.map((b) => b.textContent)).not.toContain('OK');
    expect(buttons.map((b) => b.textContent)).not.toContain('Delete');
  });
});

describe('AC4: focus, Cancel and Escape', () => {
  it('focus is on Cancel when the confirm opens', () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    expect(document.activeElement).toBe(container.querySelector('.subtask-delete-confirm .btn-ghost'));
  });

  it('Cancel restores the row, leaves the sub-task and returns focus to its options button', async () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    fireEvent.click(container.querySelector('.subtask-delete-confirm .btn-ghost') as HTMLElement);
    expect(container.querySelector('.subtask-delete-confirm')).toBeNull();
    expect(rows(container)[0].querySelector('.subtask-title')!.textContent).toBe('Buy milk');
    expect(deleteSubtask).not.toHaveBeenCalled();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(rows(container)[0].querySelector('.subtask-kebab-btn'));
  });

  it('Escape does the same and does not close the detail panel', async () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    fireEvent.keyDown(container.querySelector('.subtask-delete-confirm .btn-ghost') as HTMLElement, { key: 'Escape' });
    expect(container.querySelector('.subtask-delete-confirm')).toBeNull();
    expect(mockSelectedItemId).toBe('parent-1');
    expect(container.querySelector('.detail-panel')).not.toBeNull();
    expect(deleteSubtask).not.toHaveBeenCalled();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(rows(container)[0].querySelector('.subtask-kebab-btn'));
  });
});

describe('AC5: confirming deletes exactly once', () => {
  it('calls deleteSubtask(id, actor, token) once and closes the confirm', () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 1, 'Delete');
    fireEvent.click(container.querySelector('.subtask-delete-confirm .btn-danger') as HTMLElement);
    expect(deleteSubtask).toHaveBeenCalledTimes(1);
    expect((deleteSubtask as any).mock.calls[0][0]).toBe('c2');
    expect((deleteSubtask as any).mock.calls[0][2]).toBe('test-token');
    expect(container.querySelector('.subtask-delete-confirm')).toBeNull();
  });

  it('leaves no Delete sub-task button behind to tap twice', () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    fireEvent.click(container.querySelector('.subtask-delete-confirm .btn-danger') as HTMLElement);
    expect(container.querySelector('.subtask-delete-confirm .btn-danger')).toBeNull();
  });
});

describe('AC6: one confirm at a time', () => {
  it("opening a second sub-task's confirm closes the first", () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    expect(container.querySelectorAll('.subtask-delete-confirm').length).toBe(1);
    // Row 0 is now the confirm, so the second sub-task's kebab is the first left.
    chooseFromMenu(container, 0, 'Delete');
    const open = container.querySelectorAll('.subtask-delete-confirm');
    expect(open.length).toBe(1);
    expect(open[0].querySelector('.subtask-delete-confirm-title')!.textContent).toBe('Delete sub-task "Walk the dog"?');
    expect(rows(container)[0].querySelector('.subtask-title')!.textContent).toBe('Buy milk');
  });
});

describe('AC7: long and blank titles', () => {
  it('a long title is in the prompt in full, and the style lets it wrap', () => {
    const long = 'x'.repeat(300);
    mockChildren = [child('c1', long)];
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    expect(container.querySelector('.subtask-delete-confirm-title')!.textContent).toBe(`Delete sub-task "${long}"?`);
    // @ts-ignore -- __dirname available in vitest CJS context
    const css = readFileSync(resolve(__dirname, '../../global.css'), 'utf-8');
    const rule = /\.subtask-delete-confirm-title\s*\{[^}]*\}/.exec(css)![0];
    expect(rule).toContain('overflow-wrap: anywhere');
    expect(rule).not.toMatch(/text-overflow|white-space:\s*nowrap/);
  });

  it('a blank title reads "Delete this sub-task?"', () => {
    mockChildren = [child('c1', '   ')];
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    expect(container.querySelector('.subtask-delete-confirm-title')!.textContent).toBe('Delete this sub-task?');
  });
});

describe('AC8: both buttons are full-size .btn, not .btn-sm', () => {
  it('uses .btn (48px, min 44 wide) and neither is .btn-sm', () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Delete');
    const buttons = [...container.querySelectorAll('.subtask-delete-confirm button')] as HTMLElement[];
    for (const b of buttons) {
      expect(b.classList.contains('btn')).toBe(true);
      expect(b.classList.contains('btn-sm')).toBe(false);
    }
    // @ts-ignore -- __dirname available in vitest CJS context
    const css = readFileSync(resolve(__dirname, '../../global.css'), 'utf-8');
    const btn = /\n\.btn\s*\{[^}]*\}/.exec(css)![0];
    expect(btn).toContain('min-height: 48px');
    expect(btn).toContain('min-width: 44px');
  });
});

describe('AC9: Turn into item still has no confirm', () => {
  it('creates the item and removes the sub-task without opening a confirm', async () => {
    const { container } = renderDetail();
    chooseFromMenu(container, 0, 'Turn into item');
    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector('.subtask-delete-confirm')).toBeNull();
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(deleteSubtask).toHaveBeenCalledTimes(1);
  });
});
