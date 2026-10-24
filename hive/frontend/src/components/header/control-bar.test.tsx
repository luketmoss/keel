// #626: the board's header and its filter chips. This runs on the real store: the header reads who
// the board is shared with and how many are open from it, and the chips write the filter signals the
// columns read.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';
import { ControlBar } from './control-bar';
import {
  items,
  boards,
  permissions,
  statuses,
  owners,
  labels,
  currentUserEmail,
  activeBoardId,
  activeView,
  boardOpen,
  filterOwner,
  filterLabel,
  filterSearch,
  filterDue,
  groupBy,
  showShareModal,
  showCreateBoardModal,
  rootItems,
  todayStr,
} from '../../state/board-store';
import type { ItemWithRow } from '../../api/types';

const ME = 'me@test.com';
const today = todayStr();

function item(id: string, over: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id,
    title: `Title ${id}`,
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
    board_id: 'b1',
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
  ];
  boards.value = [
    { id: 'b1', name: 'Family', created_at: '', created_by: ME },
    { id: 'b2', name: 'Work', created_at: '', created_by: ME },
  ];
  permissions.value = [
    { board_id: 'b1', user_email: ME, role: 'owner' },
    { board_id: 'b1', user_email: 'mom@test.com', role: 'member' },
    { board_id: 'b2', user_email: ME, role: 'owner' },
  ];
  statuses.value = ['b1', 'b2'].flatMap((b) => [
    { id: `${b}-t`, board_id: b, name: 'To Do', sort_order: 1, color: '', is_terminal: false, created_at: '' },
    { id: `${b}-d`, board_id: b, name: 'Done', sort_order: 2, color: '', is_terminal: true, created_at: '' },
  ]);
  labels.value = [
    { label: 'Urgent', color: '#ff0000', board_id: 'b1' },
    { label: 'Home', color: '#00cc00', board_id: 'b1' },
    { label: 'Unused', color: '#0000ff', board_id: 'b1' },
    { label: 'Other', color: '#999999', board_id: 'b2' },
  ];
  items.value = [
    item('1', { labels: 'Home', owner: 'Luke', due_date: today }),
    item('2', { labels: 'Urgent, Home', owner: 'Mom', due_date: today }),
    item('3', { labels: '' }),
    item('4', { status: 'Done' }),
    item('5', { parent_id: '3', labels: 'Unused', board_id: '' }),
    item('w', { board_id: 'b2', labels: 'Other' }),
  ];
  activeBoardId.value = 'b1';
  activeView.value = 'boards';
  boardOpen.value = true;
  filterOwner.value = null;
  filterLabel.value = null;
  filterSearch.value = '';
  filterDue.value = null;
  groupBy.value = 'none';
  showShareModal.value = false;
  showCreateBoardModal.value = false;
});

afterEach(() => {
  cleanup();
});

const q = (c: Element, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement;
const chipRow = (c: Element) =>
  [...q(c, 'control-bar-filter-content').querySelectorAll('.filter-chip')] as HTMLElement[];
const chipNames = (c: Element) =>
  chipRow(c)
    .filter((b) => !b.classList.contains('filter-chip-group-btn'))
    .map((b) => b.textContent);

describe('Header', () => {
  it('has a Boards link back to the list, and goes there in place', () => {
    const { container } = render(<ControlBar />);
    const back = q(container, 'boards-back') as HTMLAnchorElement;
    expect(back.textContent).toBe('Boards');
    expect(back.getAttribute('href')).toContain('view=boards');
    fireEvent.click(back);
    expect(boardOpen.value).toBe(false);
  });

  it('shows who the board is shared with and how many are open, above the title', () => {
    const { container } = render(<ControlBar />);
    // Items 1, 2 and 3 are open; 4 is done and the sub-item is not counted.
    expect(q(container, 'board-subline').textContent).toBe('You and Mom · 3 open');
  });

  it('shows the board name as the title, with a colour tile before it', () => {
    const { container } = render(<ControlBar />);
    const title = q(container, 'control-bar-board-name');
    expect(title.tagName).toBe('H1');
    expect(title.textContent).toBe('Family');
    expect(container.querySelector('.board-title-tile')).not.toBeNull();
  });

  it('has no board select, no Filters button, no popup and no emoji', () => {
    const { container } = render(<ControlBar />);
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('.filter-toggle')).toBeNull();
    expect(container.querySelector('.filter-popup')).toBeNull();
    expect(container.textContent).not.toContain('Filters');
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('shows only a New Board button when there are no boards', () => {
    boards.value = [];
    const { container } = render(<ControlBar />);
    const btn = container.querySelector('.btn-primary') as HTMLElement;
    expect(btn.textContent).toBe('+ New Board');
    fireEvent.click(btn);
    expect(showCreateBoardModal.value).toBe(true);
    expect(container.querySelector('.filter-chip')).toBeNull();
  });
});

describe('Search', () => {
  it('is a field with a "Search this board" placeholder and name', () => {
    const { container } = render(<ControlBar />);
    const input = q(container, 'filter-search-input') as HTMLInputElement;
    expect(input.placeholder).toBe('Search this board');
    expect(input.getAttribute('aria-label')).toBe('Search this board');
  });

  it('sets filterSearch after a short debounce, and shows an x while there is text', async () => {
    const { container } = render(<ControlBar />);
    const input = q(container, 'filter-search-input') as HTMLInputElement;
    expect(q(container, 'filter-search-clear')).toBeNull();
    await act(async () => {
      fireEvent.input(input, { target: { value: 'milk' } });
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(filterSearch.value).toBe('milk');
    expect(q(container, 'filter-search-clear')).not.toBeNull();
    fireEvent.click(q(container, 'filter-search-clear'));
    expect(filterSearch.value).toBe('');
    expect(input.value).toBe('');
  });

  it('Escape clears it', async () => {
    const { container } = render(<ControlBar />);
    const input = q(container, 'filter-search-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.input(input, { target: { value: 'milk' } });
      await new Promise((r) => setTimeout(r, 200));
    });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(filterSearch.value).toBe('');
    expect(input.value).toBe('');
  });

  describe('on a phone', () => {
    it('a Search button reveals the field in place of the title, with Cancel', () => {
      const { container } = render(<ControlBar />);
      const row = container.querySelector('.board-title-row') as HTMLElement;
      expect(row.classList.contains('board-title-row-searching')).toBe(false);
      expect(q(container, 'search-cancel')).toBeNull();

      fireEvent.click(q(container, 'board-search-btn'));
      expect(row.classList.contains('board-title-row-searching')).toBe(true);
      expect(container.querySelector('.board-search')!.classList.contains('board-search-open')).toBe(true);
      expect(document.activeElement).toBe(q(container, 'filter-search-input'));
      expect(q(container, 'search-cancel').textContent).toBe('Cancel');
    });

    it('Cancel clears the search and restores the title', async () => {
      const { container } = render(<ControlBar />);
      fireEvent.click(q(container, 'board-search-btn'));
      const input = q(container, 'filter-search-input') as HTMLInputElement;
      await act(async () => {
        fireEvent.input(input, { target: { value: 'milk' } });
        await new Promise((r) => setTimeout(r, 200));
      });
      fireEvent.click(q(container, 'search-cancel'));
      expect(filterSearch.value).toBe('');
      expect(container.querySelector('.board-title-row')!.classList.contains('board-title-row-searching')).toBe(false);
      expect(q(container, 'search-cancel')).toBeNull();
    });

    it('Escape does the same', () => {
      const { container } = render(<ControlBar />);
      fireEvent.click(q(container, 'board-search-btn'));
      fireEvent.keyDown(q(container, 'filter-search-input'), { key: 'Escape' });
      expect(container.querySelector('.board-title-row')!.classList.contains('board-title-row-searching')).toBe(false);
    });
  });
});

describe('Share and board options', () => {
  it('Share is there for an owner and opens the share dialog', () => {
    const { container } = render(<ControlBar />);
    const share = q(container, 'board-share-btn');
    expect(share.textContent).toBe('Share');
    expect(share.querySelector('svg')).not.toBeNull();
    fireEvent.click(share);
    expect(showShareModal.value).toBe(true);
  });

  it('there is no Share button for a member, and no Settings in the menu', () => {
    permissions.value = permissions.value.map((p) =>
      p.user_email === ME && p.board_id === 'b1' ? { ...p, role: 'member' } : p,
    );
    const { container } = render(<ControlBar />);
    expect(q(container, 'board-share-btn')).toBeNull();
    fireEvent.click(q(container, 'overflow-menu-btn'));
    expect(q(container, 'overflow-menu-board-settings')).toBeNull();
    expect(q(container, 'overflow-menu-share')).toBeNull();
  });

  it('the options menu is named "Board options" and holds Grouping, with None checked', () => {
    const { container } = render(<ControlBar />);
    const btn = q(container, 'overflow-menu-btn');
    expect(btn.getAttribute('aria-label')).toBe('Board options');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const menu = q(container, 'overflow-menu-dropdown');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.textContent).toContain('Grouping');
    const radios = [...menu.querySelectorAll('[role="menuitemradio"]')];
    expect(radios.map((r) => r.textContent)).toEqual(['None', 'By status', 'By label']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('choosing By status or By label groups and closes the menu', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'overflow-menu-btn'));
    fireEvent.click(q(container, 'overflow-menu-group-status'));
    expect(groupBy.value).toBe('status');
    expect(q(container, 'overflow-menu-dropdown')).toBeNull();
    fireEvent.click(q(container, 'overflow-menu-btn'));
    fireEvent.click(q(container, 'overflow-menu-group-label'));
    expect(groupBy.value).toBe('label');
  });

  it('Board Settings and Share in the menu open the share dialog and close the menu', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'overflow-menu-btn'));
    fireEvent.click(q(container, 'overflow-menu-board-settings'));
    expect(showShareModal.value).toBe(true);
    expect(q(container, 'overflow-menu-dropdown')).toBeNull();

    showShareModal.value = false;
    fireEvent.click(q(container, 'overflow-menu-btn'));
    fireEvent.click(q(container, 'overflow-menu-share'));
    expect(showShareModal.value).toBe(true);
  });

  it('Escape and a click outside close the menu', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'overflow-menu-btn'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(q(container, 'overflow-menu-dropdown')).toBeNull();
    fireEvent.click(q(container, 'overflow-menu-btn'));
    fireEvent.mouseDown(document.body);
    expect(q(container, 'overflow-menu-dropdown')).toBeNull();
  });

  it('arrow keys move through the menu items', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'overflow-menu-btn'));
    const none = q(container, 'overflow-menu-group-none');
    none.focus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(q(container, 'overflow-menu-group-status'));
  });
});

describe('Filter chips', () => {
  it("are All, Mine, Due today, This week, then one per label used on the board in the board's order", () => {
    const { container } = render(<ControlBar />);
    // "Unused" is used only by a sub-item, and "Other" belongs to another board.
    expect(chipNames(container)).toEqual(['All', 'Mine', 'Due today', 'This week', 'Urgent', 'Home']);
  });

  it('are one group named "Filters", not a popup', () => {
    const { container } = render(<ControlBar />);
    const row = q(container, 'control-bar-filter-content');
    expect(row.getAttribute('role')).toBe('group');
    expect(row.getAttribute('aria-label')).toBe('Filters');
  });

  it('a label chip is a dot in the label colour and the name; the colour never outlines or fills the chip', () => {
    const { container } = render(<ControlBar />);
    const urgent = q(container, 'filter-label-Urgent');
    const dot = urgent.querySelector('.filter-chip-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(255, 0, 0)');
    expect(urgent.textContent).toBe('Urgent');
    expect(urgent.getAttribute('style')).toBeNull();
    // Only a label chip has a dot
    expect(q(container, 'filter-all').querySelector('.filter-chip-dot')).toBeNull();
  });

  it('All is on exactly when no other chip is, and pressing it clears the rest', () => {
    const { container } = render(<ControlBar />);
    const all = () => q(container, 'filter-all');
    expect(all().getAttribute('aria-pressed')).toBe('true');
    expect(all().classList.contains('filter-chip-active')).toBe(true);

    fireEvent.click(q(container, 'filter-due-today'));
    fireEvent.click(q(container, 'filter-mine'));
    fireEvent.click(q(container, 'filter-label-Home'));
    expect(all().getAttribute('aria-pressed')).toBe('false');
    expect(filterDue.value).toBe('today');
    expect(filterOwner.value).toBe('Luke');
    expect(filterLabel.value).toBe('Home');

    fireEvent.click(all());
    expect(filterDue.value).toBeNull();
    expect(filterOwner.value).toBeNull();
    expect(filterLabel.value).toBeNull();
    expect(all().getAttribute('aria-pressed')).toBe('true');
  });

  it('a chip that is on is filled and has aria-pressed="true"; pressing it again turns it off', () => {
    const { container } = render(<ControlBar />);
    const chip = q(container, 'filter-due-today');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.classList.contains('filter-chip-active')).toBe(true);
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(filterDue.value).toBeNull();
  });

  it('Due today and This week exclude each other', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'filter-due-today'));
    fireEvent.click(q(container, 'filter-due-this-week'));
    expect(filterDue.value).toBe('this-week');
    expect(q(container, 'filter-due-today').getAttribute('aria-pressed')).toBe('false');
    expect(q(container, 'filter-due-this-week').getAttribute('aria-pressed')).toBe('true');
  });

  it('Mine, one due chip and one label chip combine, and narrow the cards', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'filter-mine'));
    expect(rootItems.value.map((i) => i.id)).toEqual(['1']);
    fireEvent.click(q(container, 'filter-due-this-week'));
    fireEvent.click(q(container, 'filter-label-Home'));
    expect(filterOwner.value).toBe('Luke');
    expect(filterDue.value).toBe('this-week');
    expect(filterLabel.value).toBe('Home');
    expect(rootItems.value.map((i) => i.id)).toEqual(['1']);
    fireEvent.click(q(container, 'filter-mine'));
    expect(rootItems.value.map((i) => i.id).sort()).toEqual(['1', '2']);
  });

  it('a label chip moves when another is pressed', () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'filter-label-Urgent'));
    fireEvent.click(q(container, 'filter-label-Home'));
    expect(filterLabel.value).toBe('Home');
    expect(q(container, 'filter-label-Urgent').getAttribute('aria-pressed')).toBe('false');
  });

  it('Mine is not offered to someone with no Owners row', () => {
    owners.value = [{ name: 'Mom', google_account: 'mom@test.com' }];
    const { container } = render(<ControlBar />);
    expect(chipNames(container)).not.toContain('Mine');
  });

  it('the filter clears when the label it names is deleted', async () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'filter-label-Home'));
    expect(filterLabel.value).toBe('Home');
    await act(() => {
      labels.value = labels.value.filter((l) => l.label !== 'Home');
    });
    expect(filterLabel.value).toBeNull();
    expect(q(container, 'filter-all').getAttribute('aria-pressed')).toBe('true');
  });

  it('a chip stays on screen while its filter is on, even if the last card using it moves on', async () => {
    const { container } = render(<ControlBar />);
    fireEvent.click(q(container, 'filter-label-Urgent'));
    await act(() => {
      items.value = items.value.map((i) => (i.id === '2' ? { ...i, labels: 'Home' } : i));
    });
    expect(q(container, 'filter-label-Urgent')).not.toBeNull();
  });

  describe('live region', () => {
    it('is empty with no filter and announces "<n> cards shown" with one', async () => {
      const { container } = render(<ControlBar />);
      expect(q(container, 'filter-live-region').textContent).toBe('');
      expect(q(container, 'filter-live-region').getAttribute('aria-live')).toBe('polite');
      fireEvent.click(q(container, 'filter-label-Urgent'));
      expect(q(container, 'filter-live-region').textContent).toBe('1 cards shown');
    });

    it('announces for Mine and for a search too', async () => {
      const { container } = render(<ControlBar />);
      fireEvent.click(q(container, 'filter-mine'));
      expect(q(container, 'filter-live-region').textContent).toBe('1 cards shown');
      fireEvent.click(q(container, 'filter-mine'));
      await act(() => {
        filterSearch.value = 'Title 3';
      });
      expect(q(container, 'filter-live-region').textContent).toBe('1 cards shown');
    });
  });

  describe('Group chip (768px and up)', () => {
    it('names the mode and opens the same three choices', () => {
      const { container } = render(<ControlBar />);
      const btn = q(container, 'filter-group-btn');
      expect(btn.textContent).toContain('Group: None');
      expect(btn.getAttribute('aria-haspopup')).toBe('true');
      fireEvent.click(btn);
      const radios = [...container.querySelectorAll('.filter-group-menu [role="menuitemradio"]')];
      expect(radios.map((r) => r.textContent)).toEqual(['None', 'By status', 'By label']);
      fireEvent.click(q(container, 'filter-group-label'));
      expect(groupBy.value).toBe('label');
      expect(container.querySelector('.filter-group-menu')).toBeNull();
    });
  });
});
