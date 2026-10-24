import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Card } from './card';
import { selectedItemId } from '../../state/board-store';
import type { ItemWithRow } from '../../api/types';

// Mock board-store to avoid signal dependency issues
const mockSelectedItemId = vi.hoisted(() => ({ value: null as string | null }));
const mockChildCount = vi.hoisted(() => ({}) as Record<string, { done: number; total: number }>);

vi.mock('../../state/board-store', () => ({
  selectedItemId: mockSelectedItemId,
  selectItem: (id: string) => {
    mockSelectedItemId.value = id;
  },
  clearSelectedItem: () => {
    mockSelectedItemId.value = null;
  },
  openDetailWithTitleEdit: { value: false },
  labels: {
    value: [
      { label: 'Home', color: '#1976d2', board_id: 'board-1', sheetRow: 2 },
      { label: 'Errand', color: '#2e7d32', board_id: 'board-1', sheetRow: 3 },
    ],
  },
  owners: {
    value: [
      { name: 'Luke', google_account: 'luke@example.com' },
      { name: 'Mom', google_account: 'mom@example.com' },
    ],
  },
  // Saturday 24 October 2026
  todayStr: () => '2026-10-24',
  addDays: (d: string, n: number) => {
    const [y, m, day] = d.split('-').map(Number);
    const out = new Date(y, m - 1, day + n);
    return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
  },
  getChildCount: (id: string) => mockChildCount[id] ?? { done: 0, total: 0 },
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

function makeItem(overrides: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id: 'test-1',
    title: 'Test Item',
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
    created_by: '',
    board_id: '',
    sheetRow: 2,
    ...overrides,
  };
}

describe('Card', () => {
  // #626: the due date is a drawn calendar icon and a word, never an emoji or a "Due:" prefix
  describe('Due date', () => {
    it('shows a calendar icon and the date as "Sat, Oct 31", with no emoji or "Due:" prefix', () => {
      const item = makeItem({ due_date: '2026-10-31', status: 'To Do' });
      const { container } = render(<Card item={item} />);
      const dueEl = container.querySelector('.card-due') as HTMLElement;
      expect(dueEl.textContent).toBe('Sat, Oct 31');
      expect(dueEl.querySelector('svg')).not.toBeNull();
      expect(dueEl.textContent).not.toContain('Due:');
      expect(dueEl.textContent).not.toContain('\u23F0');
    });

    it('says "Today" and "Tomorrow" for those days', () => {
      const today = render(<Card item={makeItem({ due_date: '2026-10-24' })} />);
      expect(today.container.querySelector('.card-due')!.textContent).toBe('Today');
      today.unmount();
      const tomorrow = render(<Card item={makeItem({ due_date: '2026-10-25' })} />);
      expect(tomorrow.container.querySelector('.card-due')!.textContent).toBe('Tomorrow');
    });

    it('has an accessible name that says it is a due date', () => {
      const { container } = render(<Card item={makeItem({ due_date: '2026-10-31' })} />);
      expect(container.querySelector('.card-due')!.getAttribute('aria-label')).toBe('Due date: Sat, Oct 31');
    });

    it('renders nothing for a card with no due date', () => {
      const { container } = render(<Card item={makeItem({ due_date: '' })} />);
      expect(container.querySelector('.card-due')).toBeNull();
      expect(container.querySelector('.card-overdue')).toBeNull();
    });
  });

  describe('Overdue', () => {
    it('shows a dashed "OVERDUE · Oct 22" pill with no icon in place of the date', () => {
      const item = makeItem({ due_date: '2026-10-22', status: 'To Do' });
      const { container } = render(<Card item={item} />);
      const pill = container.querySelector('.card-overdue') as HTMLElement;
      expect(pill.textContent).toBe('OVERDUE · Oct 22');
      expect(pill.classList.contains('today-overdue-pill')).toBe(true);
      expect(pill.querySelector('svg')).toBeNull();
      expect(pill.getAttribute('aria-label')).toBe('Overdue, due Oct 22');
      expect(container.querySelector('.card-due')).toBeNull();
    });

    it('is not overdue today, in the future, or when the item is done', () => {
      for (const [due, status] of [
        ['2026-10-24', 'To Do'],
        ['2099-12-31', 'To Do'],
        ['2020-01-01', 'Done'],
      ]) {
        const { container, unmount } = render(<Card item={makeItem({ due_date: due, status })} />);
        expect(container.querySelector('.card-overdue'), `${due} ${status}`).toBeNull();
        unmount();
      }
    });
  });

  describe('Done', () => {
    it('shows when it was done, and strikes the title through', () => {
      const item = makeItem({ status: 'Done', due_date: '2026-10-20', completed_at: '2026-10-23T15:00:00' });
      const { container } = render(<Card item={item} />);
      expect(container.querySelector('.card-due')!.textContent).toBe('Done Oct 23');
      expect(container.querySelector('.card')!.classList.contains('card-done')).toBe(true);
    });
  });

  describe('Sub-tasks', () => {
    it('shows a checklist icon and "2/3", and no progress bar', () => {
      mockChildCount['with-subs'] = { done: 2, total: 3 };
      const { container } = render(<Card item={makeItem({ id: 'with-subs' })} />);
      const subs = container.querySelector('.card-subtasks') as HTMLElement;
      expect(subs.textContent).toBe('2/3');
      expect(subs.querySelector('svg')).not.toBeNull();
      expect(subs.getAttribute('aria-label')).toBe('2 of 3 sub-tasks done');
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      expect(container.querySelector('.subtask-bar')).toBeNull();
    });

    it('shows nothing for a card without sub-tasks', () => {
      const { container } = render(<Card item={makeItem({ id: 'no-subs' })} />);
      expect(container.querySelector('.card-subtasks')).toBeNull();
    });
  });

  describe('Labels', () => {
    it('are a dot in the label colour and the name, never a filled pill', () => {
      const { container } = render(<Card item={makeItem({ labels: 'Home, Errand' })} />);
      const labels = [...container.querySelectorAll('.card-label')] as HTMLElement[];
      expect(labels.map((l) => l.textContent)).toEqual(['Home', 'Errand']);
      const dot = labels[0].querySelector('.card-label-dot') as HTMLElement;
      expect(dot.style.background).toBe('rgb(25, 118, 210)');
      expect(container.querySelector('.label-badge')).toBeNull();
    });
  });

  describe('Owner', () => {
    it('shows "Unassigned" in italics and no avatar when there is no owner', () => {
      const { container } = render(<Card item={makeItem({ owner: '' })} />);
      expect(container.querySelector('.card-unassigned')!.textContent).toBe('Unassigned');
      expect(container.querySelector('[data-testid="card-avatar"]')).toBeNull();
    });

    it('shows the owner as initials in a circle, titled with the full name, and not "Unassigned"', () => {
      const { container } = render(<Card item={makeItem({ owner: 'Mom' })} />);
      const avatar = container.querySelector('[data-testid="card-avatar"]') as HTMLElement;
      expect(avatar.textContent).toContain('MO');
      expect(avatar.getAttribute('title')).toBe('Mom');
      expect(avatar.style.background).toBe('rgb(25, 118, 210)');
      expect(container.querySelector('.card-unassigned')).toBeNull();
      expect(container.querySelector('.card-owner')).toBeNull();
    });
  });

  describe('Nothing busy on the card', () => {
    it('has no description excerpt, progress bar or emoji', () => {
      mockChildCount['busy'] = { done: 1, total: 2 };
      const item = makeItem({
        id: 'busy',
        description: 'Pick up milk and eggs from the store',
        due_date: '2026-10-25',
        owner: 'Luke',
        labels: 'Home',
      });
      const { container } = render(<Card item={item} />);
      expect(container.querySelector('.card-description')).toBeNull();
      expect(container.textContent).not.toContain('Pick up milk');
      expect(container.querySelector('.subtask-bar')).toBeNull();
      expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  // Issue #6 — Keyboard accessibility
  describe('Keyboard accessibility (Issue #6)', () => {
    // AC1: Title button is keyboard-focusable and activatable (#126 updated)
    describe('AC1: Title button is keyboard-focusable and activatable', () => {
      it('title button has tabIndex=0 so it participates in tab order', () => {
        const item = makeItem();
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;
        expect(title.getAttribute('tabindex')).toBe('0');
      });

      it('card container has no role="button" (#126 AC7)', () => {
        const item = makeItem();
        const { container } = render(<Card item={item} />);
        const card = container.querySelector('.card') as HTMLElement;
        expect(card.getAttribute('role')).toBeNull();
      });

      it('title button has an aria-label with the item title and status', () => {
        const item = makeItem({ title: 'Buy groceries', status: 'In Progress' });
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;
        const label = title.getAttribute('aria-label');
        expect(label).toContain('Buy groceries');
        expect(label).toContain('In Progress');
      });

      it('opens detail panel when Enter is pressed on title button', () => {
        selectedItemId.value = null;

        const item = makeItem({ id: 'enter-test' });
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'Enter' });
        expect(selectedItemId.value).toBe('enter-test');
      });

      it('opens detail panel when Space is pressed on title button', () => {
        selectedItemId.value = null;

        const item = makeItem({ id: 'space-test' });
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: ' ' });
        expect(selectedItemId.value).toBe('space-test');
      });

      it('has data-item-id attribute for focus restoration', () => {
        const item = makeItem({ id: 'data-attr-test' });
        const { container } = render(<Card item={item} />);
        const card = container.querySelector('.card') as HTMLElement;
        expect(card.getAttribute('data-item-id')).toBe('data-attr-test');
      });
    });

    // AC2: Keyboard alternative to drag-and-drop (via title button)
    describe('AC2: Keyboard alternative to drag-and-drop', () => {
      it('calls onMoveStatus with next status when ArrowRight is pressed on title', () => {
        const onMoveStatus = vi.fn();
        const item = makeItem({ id: 'move-right', status: 'To Do' });
        const { container } = render(<Card item={item} onMoveStatus={onMoveStatus} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowRight' });
        expect(onMoveStatus).toHaveBeenCalledWith('move-right', 'In Progress');
      });

      it('calls onMoveStatus with previous status when ArrowLeft is pressed on title', () => {
        const onMoveStatus = vi.fn();
        const item = makeItem({ id: 'move-left', status: 'In Progress' });
        const { container } = render(<Card item={item} onMoveStatus={onMoveStatus} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowLeft' });
        expect(onMoveStatus).toHaveBeenCalledWith('move-left', 'To Do');
      });

      it('does not move past the last status (Done)', () => {
        const onMoveStatus = vi.fn();
        const item = makeItem({ id: 'no-right', status: 'Done' });
        const { container } = render(<Card item={item} onMoveStatus={onMoveStatus} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowRight' });
        expect(onMoveStatus).not.toHaveBeenCalled();
      });

      it('does not move before the first status (To Do)', () => {
        const onMoveStatus = vi.fn();
        const item = makeItem({ id: 'no-left', status: 'To Do' });
        const { container } = render(<Card item={item} onMoveStatus={onMoveStatus} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowLeft' });
        expect(onMoveStatus).not.toHaveBeenCalled();
      });

      it('does not call onMoveStatus when arrow keys pressed without the prop', () => {
        const item = makeItem({ id: 'no-handler', status: 'In Progress' });
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        // Should not throw
        fireEvent.keyDown(title, { key: 'ArrowRight' });
        fireEvent.keyDown(title, { key: 'ArrowLeft' });
      });
    });
  });

  // Issue #115 — Reorder within column
  describe('Issue #115: Reorder within column', () => {
    // AC4: Alt+ArrowUp/Down for keyboard reorder (via title button)
    describe('AC4: Keyboard reorder within column (Alt+Arrow)', () => {
      it('calls onReorder with "up" when Alt+ArrowUp is pressed on title', () => {
        const onReorder = vi.fn();
        const item = makeItem({ id: 'reorder-up', status: 'To Do' });
        const { container } = render(<Card item={item} onReorder={onReorder} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowUp', altKey: true });
        expect(onReorder).toHaveBeenCalledWith('reorder-up', 'up');
      });

      it('calls onReorder with "down" when Alt+ArrowDown is pressed on title', () => {
        const onReorder = vi.fn();
        const item = makeItem({ id: 'reorder-down', status: 'To Do' });
        const { container } = render(<Card item={item} onReorder={onReorder} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowDown', altKey: true });
        expect(onReorder).toHaveBeenCalledWith('reorder-down', 'down');
      });

      it('does NOT intercept ArrowUp/Down without Alt (preserves browser scroll)', () => {
        const onReorder = vi.fn();
        const item = makeItem({ id: 'no-alt', status: 'To Do' });
        const { container } = render(<Card item={item} onReorder={onReorder} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowUp' });
        fireEvent.keyDown(title, { key: 'ArrowDown' });
        expect(onReorder).not.toHaveBeenCalled();
      });

      it('does not call onReorder when Alt+Arrow pressed without the prop', () => {
        const item = makeItem({ id: 'no-handler', status: 'In Progress' });
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        // Should not throw
        fireEvent.keyDown(title, { key: 'ArrowUp', altKey: true });
        fireEvent.keyDown(title, { key: 'ArrowDown', altKey: true });
      });

      it('ArrowLeft/ArrowRight still work for column movement (not affected by Alt)', () => {
        const onMoveStatus = vi.fn();
        const onReorder = vi.fn();
        const item = makeItem({ id: 'both', status: 'To Do' });
        const { container } = render(<Card item={item} onMoveStatus={onMoveStatus} onReorder={onReorder} />);
        const title = container.querySelector('.card-title') as HTMLElement;

        fireEvent.keyDown(title, { key: 'ArrowRight' });
        expect(onMoveStatus).toHaveBeenCalledWith('both', 'In Progress');
        expect(onReorder).not.toHaveBeenCalled();
      });
    });

    // AC6: Updated title button ARIA label
    describe('AC6: Updated title button ARIA label', () => {
      it('title button includes reorder and column move instructions in aria-label', () => {
        const item = makeItem({ title: 'Test Task', status: 'To Do' });
        const { container } = render(<Card item={item} />);
        const title = container.querySelector('.card-title') as HTMLElement;
        const label = title.getAttribute('aria-label');
        expect(label).toContain('Alt+Up/Down to reorder');
        expect(label).toContain('Arrow keys to move between columns');
      });
    });
  });
});
