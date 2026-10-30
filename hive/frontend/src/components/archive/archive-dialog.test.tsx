import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';
import { ArchiveDialog } from './archive-dialog';
import { items, labels, showArchiveDialog, selectedItemId } from '../../state/board-store';
import type { ItemWithRow } from '../../api/types';

vi.mock('../../hooks/use-focus-trap', () => ({
  useFocusTrap: (onEscape?: () => void) => {
    (globalThis as any).__lastOnEscape = onEscape;
    return { current: null };
  },
}));

vi.mock('../shared/label-badge', () => ({
  LabelBadge: ({ label }: { label: string }) => <span data-testid="label">{label}</span>,
}));

afterEach(() => {
  cleanup();
  items.value = [];
  labels.value = [];
  showArchiveDialog.value = false;
  selectedItemId.value = null;
});

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function makeItem(overrides: Partial<ItemWithRow>): ItemWithRow {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    title: 'Test Item',
    description: '',
    status: 'Done',
    owner: 'Dad',
    due_date: '',
    labels: '',
    parent_id: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: daysAgoISO(5),
    sort_order: 1,
    created_by: 'test@test.com',
    board_id: '',
    sheetRow: 2,
    ...overrides,
  };
}

const onClose = vi.fn();

beforeEach(() => {
  onClose.mockReset();
});

const titles = (c: Element) => Array.from(c.querySelectorAll('.archive-item-title')).map((el) => el.textContent);
const chip = (c: Element, name: string) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('.filter-chip')).find((b) => b.textContent?.trim() === name)!;
const count = (c: Element) => c.querySelector('.archive-results-count')?.textContent ?? '';
const search = (c: Element) => c.querySelector('.archive-search-input') as HTMLInputElement;

describe('Dialog shell', () => {
  it('is a modal dialog named for the board, with Back and Close', () => {
    items.value = [makeItem({ id: 'a' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toMatch(/^Completed items on /);
    expect(container.querySelector('.archive-title')?.textContent).toBe('Completed');
    expect(container.querySelector('.archive-back-btn')?.getAttribute('aria-label')).toMatch(/^Back to /);
    expect(container.querySelector('.archive-close-btn')?.getAttribute('aria-label')).toBe('Close');
  });

  it('Back, Close and the overlay close it; a click inside does not', () => {
    items.value = [makeItem({ id: 'a' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.click(container.querySelector('.archive-back-btn')!);
    fireEvent.click(container.querySelector('.archive-close-btn')!);
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(container.querySelector('.archive-dialog')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('Results', () => {
  it('groups under month headings, newest month first, newest item first', () => {
    items.value = [
      makeItem({ id: 'old', title: 'Old', completed_at: new Date(2025, 2, 3, 12).toISOString() }),
      makeItem({ id: 'b', title: 'B', completed_at: new Date(2026, 0, 5, 12).toISOString() }),
      makeItem({ id: 'a', title: 'A', completed_at: new Date(2026, 0, 20, 12).toISOString() }),
    ];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings).toEqual(['January 2026 · 2', 'March 2025 · 1']);
    expect(titles(container)).toEqual(['A', 'B', 'Old']);
  });

  it('shows the absolute date and the labels, and a last group for an undated item', () => {
    items.value = [
      makeItem({ id: 'a', title: 'Dated', labels: 'Home, Fun', completed_at: new Date(2020, 5, 14, 12).toISOString() }),
      makeItem({ id: 'u', title: 'Undated', completed_at: '' }),
    ];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    expect(container.querySelector('.archive-item-date')?.textContent).toBe('Jun 14, 2020');
    expect(Array.from(container.querySelectorAll('[data-testid="label"]')).map((e) => e.textContent)).toEqual([
      'Home',
      'Fun',
    ]);
    const headings = Array.from(container.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings[headings.length - 1]).toBe('No completion date · 1');
  });

  it('a row opens the item and leaves the dialog and its filters in place', () => {
    items.value = [makeItem({ id: 'x', title: 'Click me' }), makeItem({ id: 'y', title: 'Other' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.input(search(container), { target: { value: 'click' } });
    fireEvent.click(container.querySelector('.archive-item')!);
    expect(selectedItemId.value).toBe('x');
    expect(onClose).not.toHaveBeenCalled();
    expect(search(container).value).toBe('click');
  });

  it('a row has a descriptive aria-label', () => {
    items.value = [makeItem({ id: 'a', title: 'My Task', completed_at: new Date(2020, 5, 14, 12).toISOString() })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    expect(container.querySelector('.archive-item')?.getAttribute('aria-label')).toBe(
      'My Task, completed Jun 14, 2020. Open item.',
    );
  });
});

describe('Search', () => {
  it('matches title or description, case-insensitively', () => {
    items.value = [
      makeItem({ id: 'a', title: 'File taxes' }),
      makeItem({ id: 'b', title: 'Dentist', description: 'bring the FILE' }),
      makeItem({ id: 'c', title: 'Plants' }),
    ];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.input(search(container), { target: { value: ' file ' } });
    expect(titles(container).sort()).toEqual(['Dentist', 'File taxes']);
  });

  it('has a clear button only when it has text, and clearing returns focus to the field', () => {
    items.value = [makeItem({ id: 'a' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    expect(container.querySelector('.archive-search-clear')).toBeFalsy();
    fireEvent.input(search(container), { target: { value: 'zz' } });
    fireEvent.click(container.querySelector('.archive-search-clear')!);
    expect(search(container).value).toBe('');
    expect(document.activeElement).toBe(search(container));
  });

  it('Escape clears a non-empty field and stops there; in an empty field it is left to the trap', () => {
    items.value = [makeItem({ id: 'a' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.input(search(container), { target: { value: 'zz' } });
    const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      search(container).dispatchEvent(first);
    });
    expect(first.defaultPrevented).toBe(true);
    expect(search(container).value).toBe('');
    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    search(container).dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });
});

describe('Completed chips', () => {
  it('are toggle buttons, exactly one on, Any time by default', () => {
    items.value = [makeItem({ id: 'a' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    const names = ['Any time', 'Last 7 days', 'Last 30 days', 'This year', 'Custom'];
    expect(names.map((n) => chip(container, n).getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    fireEvent.click(chip(container, 'Last 30 days'));
    expect(names.map((n) => chip(container, n).getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
  });

  it('Last 7 days narrows the list', () => {
    items.value = [
      makeItem({ id: 'new', title: 'New', completed_at: daysAgoISO(2) }),
      makeItem({ id: 'old', title: 'Old', completed_at: daysAgoISO(40) }),
    ];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.click(chip(container, 'Last 7 days'));
    expect(titles(container)).toEqual(['New']);
  });
});

describe('Custom range', () => {
  const open = () => {
    items.value = [
      makeItem({ id: 'a', title: 'A', completed_at: new Date(2026, 9, 1, 12).toISOString() }),
      makeItem({ id: 'b', title: 'B', completed_at: new Date(2026, 8, 1, 12).toISOString() }),
    ];
    const r = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.click(chip(r.container, 'Custom'));
    return r.container;
  };
  const field = (c: Element, id: string) => c.querySelector(`#${id}`) as HTMLInputElement;

  it('shows From and To, empty, filtering nothing', () => {
    const c = open();
    expect(field(c, 'archive-from').value).toBe('');
    expect(field(c, 'archive-to').value).toBe('');
    expect(titles(c)).toEqual(['A', 'B']);
  });

  it('filters by the dates, inclusive', () => {
    const c = open();
    fireEvent.input(field(c, 'archive-from'), { target: { value: '2026-10-01' } });
    expect(titles(c)).toEqual(['A']);
  });

  it('To before From shows the message, flags To, and filters nothing out', () => {
    const c = open();
    fireEvent.input(field(c, 'archive-from'), { target: { value: '2026-10-10' } });
    fireEvent.input(field(c, 'archive-to'), { target: { value: '2026-10-01' } });
    expect(c.querySelector('.archive-range-error')?.textContent).toBe('To is before From');
    expect(field(c, 'archive-to').getAttribute('aria-invalid')).toBe('true');
    expect(field(c, 'archive-to').getAttribute('aria-describedby')).toBe('archive-range-error');
    expect(titles(c)).toEqual(['A', 'B']);
  });

  it('leaving Custom hides the fields and forgets their values', () => {
    const c = open();
    fireEvent.input(field(c, 'archive-from'), { target: { value: '2026-10-01' } });
    fireEvent.click(chip(c, 'Any time'));
    expect(c.querySelector('#archive-from')).toBeFalsy();
    fireEvent.click(chip(c, 'Custom'));
    expect(field(c, 'archive-from').value).toBe('');
  });
});

describe('Label chips', () => {
  beforeEach(() => {
    labels.value = [
      { label: 'Errands', color: '#ff0000', board_id: '' },
      { label: 'Unused', color: '#00ff00', board_id: '' },
      { label: 'Home', color: '#0000ff', board_id: '' },
    ];
  });

  const withLabels = () => {
    items.value = [
      makeItem({ id: 'a', title: 'A', labels: 'Home', completed_at: daysAgoISO(1) }),
      makeItem({ id: 'b', title: 'B', labels: 'Errands, Home', completed_at: daysAgoISO(2) }),
      makeItem({ id: 'c', title: 'C', labels: 'Errands', completed_at: daysAgoISO(3) }),
    ];
    return render(<ArchiveDialog onClose={onClose} />).container;
  };

  it('has one chip per label in use, in board order, with a dot', () => {
    const c = withLabels();
    const row = c.querySelectorAll('.archive-filter-group')[1];
    expect(Array.from(row.querySelectorAll('.filter-chip')).map((b) => b.textContent?.trim())).toEqual([
      'Errands',
      'Home',
    ]);
    expect(row.querySelectorAll('.filter-chip-dot').length).toBe(2);
  });

  it('is one at a time, and pressing the on chip clears it', () => {
    const c = withLabels();
    fireEvent.click(chip(c, 'Errands'));
    expect(titles(c)).toEqual(['B', 'C']);
    fireEvent.click(chip(c, 'Home'));
    expect(chip(c, 'Errands').getAttribute('aria-pressed')).toBe('false');
    expect(titles(c)).toEqual(['A', 'B']);
    fireEvent.click(chip(c, 'Home'));
    expect(titles(c)).toEqual(['A', 'B', 'C']);
  });

  it('the row is absent when no completed item has a label', () => {
    items.value = [makeItem({ id: 'a' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    expect(container.querySelectorAll('.archive-filter-group').length).toBe(1);
  });

  it('a chip stays when another filter hides its items', () => {
    const c = withLabels();
    fireEvent.input(search(c), { target: { value: 'nothing matches this' } });
    expect(chip(c, 'Errands')).toBeTruthy();
  });
});

describe('Count line and clearing', () => {
  const three = () => {
    items.value = [
      makeItem({ id: 'a', title: 'Alpha', completed_at: daysAgoISO(1) }),
      makeItem({ id: 'b', title: 'Beta', completed_at: daysAgoISO(2) }),
      makeItem({ id: 'c', title: 'Gamma', completed_at: daysAgoISO(3) }),
    ];
    return render(<ArchiveDialog onClose={onClose} />).container;
  };

  it('reads "<n> completed" with no filter, announced politely, and has no Clear filters', () => {
    const c = three();
    expect(c.querySelector('.archive-results-count')?.getAttribute('aria-live')).toBe('polite');
    expect(count(c)).toBe('3 completed');
    expect(c.querySelector('.archive-clear-filters')).toBeFalsy();
  });

  it('reads "<m> of <n> completed" with a filter on, then Clear filters', () => {
    const c = three();
    fireEvent.input(search(c), { target: { value: 'alp' } });
    expect(c.querySelector('.archive-results-count span')?.textContent).toBe('1 of 3 completed');
    expect(c.querySelector('.archive-clear-filters')?.textContent).toBe('Clear filters');
  });

  it('Clear filters resets search, date and label in one press and focuses the search', () => {
    const c = three();
    fireEvent.input(search(c), { target: { value: 'alp' } });
    fireEvent.click(chip(c, 'Last 30 days'));
    fireEvent.click(c.querySelector('.archive-clear-filters')!);
    expect(search(c).value).toBe('');
    expect(chip(c, 'Any time').getAttribute('aria-pressed')).toBe('true');
    expect(count(c)).toBe('3 completed');
    expect(document.activeElement).toBe(search(c));
  });
});

describe('Empty states', () => {
  it('says "No completed items yet" for a board with none, with no count line', () => {
    items.value = [];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    expect(container.querySelector('.archive-empty')?.textContent).toBe('No completed items yet');
    expect(container.querySelector('.archive-results-count')).toBeFalsy();
  });

  it('says "No completed items match" with a Clear filters button when nothing matches', () => {
    items.value = [makeItem({ id: 'a', title: 'Task A' })];
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.input(search(container), { target: { value: 'zzz' } });
    expect(container.querySelector('.archive-empty p')?.textContent).toBe('No completed items match');
    expect(count(container)).toContain('0 of 1 completed');
    fireEvent.click(container.querySelector('.archive-empty-clear')!);
    expect(titles(container)).toEqual(['Task A']);
  });
});

describe('Lifetime of the filters', () => {
  it('a fresh dialog opens on Any time, no label, empty search', () => {
    items.value = [makeItem({ id: 'a' })];
    const first = render(<ArchiveDialog onClose={onClose} />);
    fireEvent.input(search(first.container), { target: { value: 'zz' } });
    fireEvent.click(chip(first.container, 'This year'));
    first.unmount();
    const { container } = render(<ArchiveDialog onClose={onClose} />);
    expect(search(container).value).toBe('');
    expect(chip(container, 'Any time').getAttribute('aria-pressed')).toBe('true');
  });
});
