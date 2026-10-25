import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore
import { resolve } from 'path';
import { readGlobalCss } from '../../test-css';
import { here } from '../../test-controls';
import { toLocalYmd, addLocalDays, mondayOfLocal } from '../../utils/completed-date';
import { CardDetail } from './card-detail';
import { AuthContext } from '../../auth/auth-context';
import type { AuthState } from '../../auth/auth-context';

afterEach(() => {
  cleanup();
});

let mockSelectedItemId: string | null = 'item-screen-1';
let mockChildren: any[] = [];
let mockItems: any[] = [];
let mockAccessibleBoards: any[] = [];
let mockActiveBoardId = 'board-family';
let mockShowMoveToBoardModal = false;
let mockBoardLabels: any[] = [];
let mockColumns: any[] = [];
let mockActiveView = 'boards';
const mockMoveItem = vi.fn().mockResolvedValue(true);
const mockUpdateItem = vi.fn().mockResolvedValue(true);

// Track what item the mock returns based on selectedItemId
let mockSelectedItemOverrides: Record<string, any> = {};

vi.mock('../../state/board-store', () => ({
  activeView: {
    get value() {
      return mockActiveView;
    },
  },
  selectItem: (id: string) => {
    mockSelectedItemId = id;
  },
  clearSelectedItem: () => {
    mockSelectedItemId = null;
  },
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
  owners: {
    value: [
      { name: 'Luke', google_account: 'luke@example.com' },
      { name: 'Mom', google_account: 'mom@example.com' },
    ],
  },
  labels: { value: [] },
  boardLabels: {
    get value() {
      return mockBoardLabels;
    },
  },
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
    get value() {
      return mockColumns;
    },
  },
  isTerminalStatus: (name: string) => name === 'Done',
  defaultStatusName: () => 'To Do',
  terminalStatusName: () => 'Done',
}));

vi.mock('../../state/actions', () => ({
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
  deleteItem: vi.fn(),
  deleteSubtask: vi.fn(),
  createItem: vi.fn(),
  moveItem: (...args: unknown[]) => mockMoveItem(...args),
  reorderSubtasks: vi.fn(),
  copyItem: vi.fn(),
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

const col = (id: string, name: string, terminal = false, order = 0) => ({
  id,
  board_id: 'board-family',
  name,
  sort_order: order,
  color: '',
  is_terminal: terminal,
  created_at: '',
});

beforeEach(() => {
  mockSelectedItemId = 'item-screen-1';
  mockChildren = [];
  mockItems = [];
  mockSelectedItemOverrides = {};
  mockBoardLabels = [];
  mockActiveView = 'boards';
  mockColumns = [col('s1', 'To Do', false, 1), col('s2', 'In Progress', false, 2), col('s3', 'Done', true, 3)];
  mockAccessibleBoards = [{ id: 'board-family', name: 'Family', created_at: '', created_by: '' }];
  mockActiveBoardId = 'board-family';
  mockMoveItem.mockClear().mockResolvedValue(true);
  mockUpdateItem.mockClear().mockResolvedValue(true);
});

const css = readGlobalCss();
const byLabel = (container: Element, id: string) => container.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement;

describe('#627 top bar', () => {
  it('has Back (named for where it returns to), Close, Expand and Item options', () => {
    const { container } = renderCardDetail();
    const bar = container.querySelector('.detail-topbar')!;
    expect(bar.querySelector('[aria-label="Back to Family"]')).not.toBeNull();
    expect(bar.querySelector('[aria-label="Close"]')).not.toBeNull();
    expect(bar.querySelector('[aria-label$="panel"]')).not.toBeNull();
    expect(bar.querySelector('[aria-label="Item options"]')).not.toBeNull();
    expect(bar.querySelector('.detail-board-name')!.textContent).toBe('Family board');
  });

  it('Back says Today when the item was opened from Today, and removes the item', () => {
    mockActiveView = 'today';
    const { container } = renderCardDetail();
    const back = container.querySelector('[aria-label="Back to Today"]') as HTMLElement;
    expect(back).not.toBeNull();
    fireEvent.click(back);
    expect(mockSelectedItemId).toBeNull();
  });

  it('phone shows Back and desktop shows Close and Expand, by the stylesheet', () => {
    expect(css).toMatch(
      /\.detail-topbar \.detail-close-btn,\s*\.detail-topbar \.detail-expand-btn\s*\{\s*display:\s*none/,
    );
    expect(css).toMatch(/@media \(min-width: 769px\)\s*\{\s*\.detail-topbar \.detail-back-btn\s*\{\s*display:\s*none/);
  });

  it('a subtask opened as the item names its parent in the board line, as a link to it', () => {
    mockSelectedItemOverrides = { parent_id: 'p1' };
    mockItems = [{ id: 'p1', title: 'Parent item', parent_id: '' }];
    const { container } = renderCardDetail();
    const link = container.querySelector('.detail-parent-link') as HTMLElement;
    expect(link.textContent).toBe('Parent item');
    fireEvent.click(link);
    expect(mockSelectedItemId).toBe('p1');
  });

  it('the Item options menu offers Copy, and none for a subtask', () => {
    const open = (c: Element) => fireEvent.click(c.querySelector('[aria-label="Item options"]') as HTMLElement);
    const first = renderCardDetail();
    open(first.container);
    expect(Array.from(first.container.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent)).toContain(
      'Copy',
    );
    first.unmount();

    mockSelectedItemOverrides = { parent_id: 'p1' };
    const second = renderCardDetail();
    open(second.container);
    expect(Array.from(second.container.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent)).toEqual([
      'Delete item…',
    ]);
  });
});

describe('#627 status switch', () => {
  it('is a radiogroup of the board columns, in their own casing, and the arrow strip is gone', () => {
    mockColumns = [col('s1', 'to do', false, 1), col('s2', 'DOING', false, 2), col('s3', 'Done!', true, 3)];
    mockSelectedItemOverrides = { status: 'DOING' };
    const { container } = renderCardDetail();
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Column');
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios.map((r) => r.textContent)).toEqual(['to do', 'DOING', 'Done!']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(container.querySelector('.status-pipeline')).toBeNull();
    expect(container.querySelector('.status-chevron')).toBeNull();
  });

  it('choosing a segment moves the item with moveItem, which owns the completed_at side effects', () => {
    const { container } = renderCardDetail();
    fireEvent.click(container.querySelectorAll('[role="radio"]')[2]);
    expect(mockMoveItem).toHaveBeenCalledWith('item-screen-1', 'Done', 'Luke', 'test-token');
  });

  it('arrow keys move the selection, and the item, and wrap', () => {
    const { container } = renderCardDetail();
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(mockMoveItem).toHaveBeenLastCalledWith('item-screen-1', 'In Progress', 'Luke', 'test-token');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(mockMoveItem).toHaveBeenLastCalledWith('item-screen-1', 'Done', 'Luke', 'test-token');
  });

  it('only the selected segment is in the tab order', () => {
    const { container } = renderCardDetail();
    const tabs = Array.from(container.querySelectorAll('[role="radio"]')).map((r) => r.getAttribute('tabindex'));
    expect(tabs).toEqual(['0', '-1', '-1']);
  });

  it('shares the width up to 4 columns and scrolls sideways beyond', () => {
    const four = renderCardDetail();
    expect(four.container.querySelector('.status-switch-scroll')).toBeNull();
    four.unmount();
    mockColumns = ['A', 'B', 'C', 'D', 'E'].map((n, i) => col(`c${i}`, n, i === 4, i));
    const five = renderCardDetail();
    expect(five.container.querySelector('.status-switch-scroll')).not.toBeNull();
    expect(css).toMatch(/\.status-switch-scroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('draws the selected segment raised on a surface with bold text, in a 44px segment', () => {
    expect(css).toMatch(/\.status-segment\[aria-checked="true"\]\s*\{[^}]*box-shadow:\s*var\(--shadow\)/);
    expect(css).toMatch(/\.status-segment-on,\s*\.status-segment\[aria-checked="true"\]\s*\{[^}]*font-weight:\s*700/);
  });
});

describe('#627 details card', () => {
  it('Due and Labels are labelled rows of one card, separated by hairlines', () => {
    const { container } = renderCardDetail();
    const card = container.querySelectorAll('.detail-details');
    expect(card.length).toBe(1);
    const rows = card[0].querySelectorAll('.detail-row');
    expect(rows.length).toBe(2); // Due, Labels: no Board row with no other board to move to
    for (const id of ['detail-due-label', 'detail-labels-label']) {
      expect(card[0].querySelector(`#${id}`)!.textContent).toMatch(/^(Due|Labels)$/);
    }
    expect(card[0].querySelector('#detail-owner-label')).toBeNull();
    expect(css).toMatch(/\.detail-row\s*\{[^}]*border-top:\s*1px solid var\(--color-border-light\)/);
    expect(css).toMatch(/\.detail-row\s*\{[^}]*min-height:\s*52px/);
  });

  it('adds a Board row when there is another board to move to', () => {
    mockAccessibleBoards = [
      { id: 'board-family', name: 'Family', created_at: '', created_by: '' },
      { id: 'board-work', name: 'Work', created_at: '', created_by: '' },
    ];
    const { container } = renderCardDetail();
    expect(container.querySelectorAll('.detail-details .detail-row').length).toBe(3);
    expect(container.querySelector('.detail-row-btn')!.textContent).toBe('Family');
  });

  it('states the value in words: label names or None', () => {
    const named = renderCardDetail();
    expect(byLabel(named.container, 'detail-labels-label').querySelector('.detail-row-value')!.textContent).toBe(
      'None',
    );
    named.unmount();

    mockSelectedItemOverrides = { labels: 'Errands, Home' };
    const none = renderCardDetail();
    expect(byLabel(none.container, 'detail-labels-label').querySelector('.detail-row-value')!.textContent).toBe(
      'Errands, Home',
    );
  });

  describe('Due', () => {
    const today = toLocalYmd(new Date());
    const chips = (c: Element) => Array.from(byLabel(c, 'detail-due-label').querySelectorAll('.filter-chip'));
    const on = (c: Element) =>
      chips(c)
        .filter((x) => x.getAttribute('aria-pressed') === 'true')
        .map((x) => x.textContent);

    it('shows Today, Tomorrow, Next week, No date and Pick a date chips', () => {
      const { container } = renderCardDetail();
      expect(chips(container).map((x) => x.textContent)).toEqual([
        'Today',
        'Tomorrow',
        'Next week',
        'No date',
        'Pick a date',
      ]);
      expect(on(container)).toEqual(['No date']);
    });

    it.each([
      ['Today', today],
      ['Tomorrow', addLocalDays(today, 1)],
      ['Next week', addLocalDays(mondayOfLocal(today), 7)],
    ])('the %s chip saves its date, and shows as on when it matches', (word, ymd) => {
      const first = renderCardDetail();
      const chip = chips(first.container).find((x) => x.textContent === word) as HTMLElement;
      fireEvent.click(chip);
      expect(mockUpdateItem).toHaveBeenLastCalledWith('item-screen-1', { due_date: ymd }, 'Luke', 'test-token');
      first.unmount();

      mockSelectedItemOverrides = { due_date: ymd };
      const again = renderCardDetail();
      // On a Sunday 'Next week' is the same date as 'Tomorrow', and the first match is the one that is on
      const sameAsTomorrow = word === 'Next week' && ymd === addLocalDays(today, 1);
      expect(on(again.container)).toEqual([sameAsTomorrow ? 'Tomorrow' : word]);
    });

    it('No date clears the date', () => {
      mockSelectedItemOverrides = { due_date: today };
      const { container } = renderCardDetail();
      fireEvent.click(chips(container).find((x) => x.textContent === 'No date') as HTMLElement);
      expect(mockUpdateItem).toHaveBeenLastCalledWith('item-screen-1', { due_date: '' }, 'Luke', 'test-token');
    });

    it('Pick a date opens the date input, and a picked date saves; it is on for a date no chip matches', () => {
      mockSelectedItemOverrides = { due_date: '2031-03-04' };
      const { container } = renderCardDetail();
      expect(on(container)).toEqual(['Pick a date']);
      const input = container.querySelector('.detail-details .due-date-hidden') as HTMLInputElement;
      const showPicker = vi.fn();
      (input as any).showPicker = showPicker;
      fireEvent.click(chips(container).find((x) => x.textContent === 'Pick a date') as HTMLElement);
      expect(showPicker).toHaveBeenCalled();
      fireEvent.change(input, { target: { value: '2031-03-05' } });
      expect(mockUpdateItem).toHaveBeenLastCalledWith(
        'item-screen-1',
        { due_date: '2031-03-05' },
        'Luke',
        'test-token',
      );
    });

    it('says the date in words; overdue in the danger colour, not for a done item', () => {
      const tomorrow = addLocalDays(today, 1);
      mockSelectedItemOverrides = { due_date: tomorrow };
      const a = renderCardDetail();
      expect(byLabel(a.container, 'detail-due-label').querySelector('.detail-row-value')!.textContent).toMatch(
        / · tomorrow$/,
      );
      a.unmount();

      mockSelectedItemOverrides = { due_date: today };
      const b = renderCardDetail();
      expect(byLabel(b.container, 'detail-due-label').querySelector('.detail-row-value')!.textContent).toBe('Today');
      b.unmount();

      mockSelectedItemOverrides = { due_date: addLocalDays(today, -3) };
      const c = renderCardDetail();
      const value = byLabel(c.container, 'detail-due-label').querySelector('.detail-row-value') as HTMLElement;
      expect(value.textContent).toMatch(/ · overdue$/);
      expect(value.classList.contains('detail-row-value-overdue')).toBe(true);
      expect(css).toMatch(/\.detail-row-value-overdue\s*\{[^}]*color:\s*var\(--color-danger-text\)/);
      c.unmount();

      mockSelectedItemOverrides = {
        due_date: addLocalDays(today, -3),
        status: 'Done',
        completed_at: new Date().toISOString(),
      };
      const d = renderCardDetail();
      expect(
        byLabel(d.container, 'detail-due-label')
          .querySelector('.detail-row-value')!
          .classList.contains('detail-row-value-overdue'),
      ).toBe(false);
    });
  });

  describe('Labels', () => {
    beforeEach(() => {
      mockBoardLabels = [
        { label: 'Errands', color: '#1976d2', board_id: 'board-family' },
        { label: 'Home', color: '#2e7d32', board_id: 'board-family' },
      ];
    });

    it('shows one chip per label with a dot and the name; an applied one is on', () => {
      mockSelectedItemOverrides = { labels: 'Home' };
      const { container } = renderCardDetail();
      const chips = Array.from(byLabel(container, 'detail-labels-label').querySelectorAll('.label-toggle'));
      expect(chips.map((c) => c.textContent)).toEqual(['Errands', 'Home']);
      expect(chips.every((c) => c.querySelector('.label-toggle-dot') !== null)).toBe(true);
      expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      expect(chips[1].classList.contains('label-toggle-active')).toBe(true);
    });

    it('pressing a chip toggles the label, and Manage labels is still there', () => {
      mockSelectedItemOverrides = { labels: 'Home' };
      const { container } = renderCardDetail();
      const chips = Array.from(container.querySelectorAll('.label-toggle'));
      fireEvent.click(chips[0]);
      expect(mockUpdateItem).toHaveBeenLastCalledWith(
        'item-screen-1',
        { labels: 'Home, Errands' },
        'Luke',
        'test-token',
      );
      fireEvent.click(chips[1]);
      expect(mockUpdateItem).toHaveBeenLastCalledWith('item-screen-1', { labels: '' }, 'Luke', 'test-token');
      expect(container.querySelector('[aria-label="Manage labels"]')).not.toBeNull();
    });

    it('outlines a chip in --color-border-strong and fills an applied one in --color-text; the dot is the only colour', () => {
      expect(css).toMatch(/\.label-toggle\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--color-border-strong\)/);
      expect(css).toMatch(/\.label-toggle-active\s*\{[^}]*background-color:\s*var\(--color-text\)/);
      expect(css).not.toMatch(/\.label-toggle\s*\{[^}]*border:\s*2px solid var\(--label-color/);
    });
  });

  it('shows Completed for a terminal item only', () => {
    const open = renderCardDetail();
    expect(open.container.querySelector('[data-testid="completed-date-btn"]')).toBeNull();
    open.unmount();
    mockSelectedItemOverrides = { status: 'Done', completed_at: new Date().toISOString() };
    const done = renderCardDetail();
    expect(done.container.querySelector('[data-testid="completed-date-btn"]')).not.toBeNull();
  });
});

describe('#627 subtasks card', () => {
  it('with no subtasks says "None yet", has no bar, and ends in the add row', () => {
    const { container } = renderCardDetail();
    const card = container.querySelector('.detail-subtasks') as HTMLElement;
    expect(card.querySelector('h3')!.textContent).toBe('Subtasks');
    expect(card.querySelector('.detail-subtasks-count')!.textContent).toBe('None yet');
    expect(card.querySelector('.subtask-progress')).toBeNull();
    expect(card.querySelector('.subtask-add-input')).not.toBeNull();
  });

  it('the bar is 6px, round, on a --color-border-light track and filled with --color-primary', () => {
    expect(css).toMatch(/\.subtask-progress\s*\{[^}]*height:\s*6px[^}]*background:\s*var\(--color-border-light\)/);
    expect(css).toMatch(/\.subtask-progress-fill\s*\{[^}]*background:\s*var\(--color-primary\)/);
  });

  it('check circles toggle a subtask between the first and the terminal column', () => {
    mockChildren = [
      { id: 'k1', title: 'One', status: 'To Do', parent_id: 'item-screen-1', sort_order: 1, due_date: '' },
      { id: 'k2', title: 'Two', status: 'Done', parent_id: 'item-screen-1', sort_order: 2, due_date: '' },
    ];
    const { container } = renderCardDetail();
    fireEvent.click(container.querySelector('[aria-label="Mark done: One"]') as HTMLElement);
    expect(mockMoveItem).toHaveBeenLastCalledWith('k1', 'Done', 'Luke', 'test-token');
    fireEvent.click(container.querySelector('[aria-label="Mark not done: Two"]') as HTMLElement);
    expect(mockMoveItem).toHaveBeenLastCalledWith('k2', 'To Do', 'Luke', 'test-token');
  });
});

describe('#627 footer', () => {
  it('Delete item is an outlined danger button; the old footer bar is gone', () => {
    const { container } = renderCardDetail();
    const btn = container.querySelector('.detail-delete-btn') as HTMLElement;
    expect(btn.textContent).toBe('Delete item');
    expect(css).toMatch(/\.detail-delete-btn\s*\{[^}]*border:\s*1px solid var\(--color-danger\)/);
    expect(css).toMatch(/\.detail-delete-btn\s*\{[^}]*color:\s*var\(--color-danger-text\)/);
    expect(container.querySelector('[aria-label="Move to board"]')).toBeNull();
    expect(container.querySelector('.detail-footer-left')).toBeNull();
  });

  it('the confirm is a bordered card; its Delete item is the danger fill, and it never uses confirm()', () => {
    expect(css).toMatch(/\.detail-delete-confirm\s*\{[^}]*border:\s*1px solid var\(--color-danger\)/);
    expect(css).toMatch(
      /\.detail-delete-confirm-actions \.btn-danger\s*\{[^}]*background:\s*var\(--color-danger-fill\)[^}]*color:\s*var\(--color-on-fill\)/,
    );
    const src = readFileSync(resolve(here, 'components/board/card-detail.tsx'), 'utf-8');
    expect(src).not.toMatch(/window\.confirm|[^.\w]confirm\(/);
  });
});
