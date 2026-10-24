import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import {
  boards,
  permissions,
  items,
  statuses,
  activeBoardId,
  activeView,
  currentUserEmail,
  selectedItemId,
  theme,
} from '../../state/board-store';
import type { ItemWithRow } from '../../api/types';
import { NavRail } from './nav-rail';
import { TabBar } from './tab-bar';
import { SettingsScreen } from './settings-screen';
import { ThemeToggle } from '../board/theme-toggle';

// #623: the shell, against the real store.

const ME = 'me@test.com';
const user = { email: ME, name: 'Luke Moss', picture: '' };

function item(id: string, boardId: string, status: string, parent = ''): ItemWithRow {
  return {
    id,
    title: id,
    description: '',
    status,
    owner: '',
    due_date: '',
    labels: '',
    parent_id: parent,
    created_at: '',
    updated_at: '',
    completed_at: '',
    sort_order: 1,
    created_by: '',
    board_id: boardId,
    sheetRow: 2,
  };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?demo=true');
  currentUserEmail.value = ME;
  boards.value = [
    { id: 'b1', name: 'Home', created_at: '', created_by: ME, icon: '🏠' },
    { id: 'b2', name: 'Work', created_at: '', created_by: ME },
    { id: 'b3', name: 'Old', created_at: '', created_by: ME, archived_at: '2026-01-01T00:00:00Z' },
  ];
  permissions.value = ['b1', 'b2', 'b3'].map((b) => ({ board_id: b, user_email: ME, role: 'owner' as const }));
  statuses.value = ['b1', 'b2'].flatMap((b) => [
    { id: `${b}-t`, board_id: b, name: 'To Do', sort_order: 1, color: '', is_terminal: false, created_at: '' },
    { id: `${b}-d`, board_id: b, name: 'Done', sort_order: 2, color: '', is_terminal: true, created_at: '' },
  ]);
  items.value = [
    item('i1', 'b1', 'To Do'),
    item('i2', 'b1', 'To Do'),
    item('i3', 'b1', 'Done'),
    item('i4', 'b1', 'To Do', 'i1'),
    item('i5', 'b2', 'To Do'),
  ];
  activeBoardId.value = 'b1';
  activeView.value = 'today';
  selectedItemId.value = null;
});

afterEach(cleanup);

describe('TabBar', () => {
  it('shows Today, Boards and Settings, each with an icon and a label', () => {
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll('.bottom-nav-tab')];
    expect(tabs.map((t) => t.querySelector('.bottom-nav-label')!.textContent)).toEqual(['Today', 'Boards', 'Settings']);
    for (const t of tabs) expect(t.querySelector('.bottom-nav-icon svg')).not.toBeNull();
  });

  it('marks only the active destination, with aria-current and the active class', () => {
    activeView.value = 'boards';
    const { container } = render(<TabBar />);
    const current = [...container.querySelectorAll('[aria-current="page"]')];
    expect(current.length).toBe(1);
    expect(current[0].textContent).toBe('Boards');
    expect(current[0].classList.contains('active')).toBe(true);
  });

  it('navigates on click, keeping the demo parameter', () => {
    const { container } = render(<TabBar />);
    fireEvent.click(container.querySelector('[data-testid="tab-settings"]') as HTMLElement);
    expect(activeView.value).toBe('settings');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('settings');
    expect(params.get('demo')).toBe('true');
    expect(document.title).toBe('Hive — Settings');
  });

  it('links carry the destination address, for open-in-new-tab', () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector('[data-testid="tab-today"]')!.getAttribute('href')).toContain('view=today');
  });
});

describe('NavRail', () => {
  it('lists every accessible non-archived board with its open count', () => {
    const { container } = render(<NavRail user={user} displayName="Luke" />);
    const rows = [...container.querySelectorAll('.rail-board')];
    expect(rows.map((r) => r.getAttribute('title'))).toEqual(['Home', 'Work']);
    // Home: two root items not in Done; the sub-item and the Done one do not count
    expect(rows[0].querySelector('.rail-board-count')!.textContent).toBe('2');
    expect(rows[1].querySelector('.rail-board-count')!.textContent).toBe('1');
  });

  it('shows the board icon, or the first letter, in the tile', () => {
    const { container } = render(<NavRail user={user} displayName="Luke" />);
    const tiles = [...container.querySelectorAll('.rail-board-tile')].map((t) => t.textContent);
    expect(tiles).toEqual(['🏠', 'W']);
  });

  it('has the BOARDS heading, New board, Settings and the signed-in person', () => {
    const { container } = render(<NavRail user={user} displayName="Luke" />);
    expect(container.querySelector('.rail-section-heading')!.textContent).toBe('BOARDS');
    expect(container.querySelector('[data-testid="rail-new-board"]')!.textContent).toContain('New board');
    expect(container.querySelector('[data-testid="rail-settings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rail-person"]')!.textContent).toContain('Luke');
  });

  it('opens a board on click and marks it active', () => {
    const { container, rerender } = render(<NavRail user={user} displayName="Luke" />);
    fireEvent.click(container.querySelector('[data-testid="rail-board-b2"]') as HTMLElement);
    expect(activeView.value).toBe('boards');
    expect(activeBoardId.value).toBe('b2');
    expect(new URLSearchParams(window.location.search).get('board')).toBe('b2');
    expect(document.title).toBe('Hive — Work');
    rerender(<NavRail user={user} displayName="Luke" />);
    expect(container.querySelector('[data-testid="rail-board-b2"]')!.getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('[data-testid="rail-board-b1"]')!.getAttribute('aria-current')).toBeNull();
  });

  it('does not mark a board active while Today is showing', () => {
    const { container } = render(<NavRail user={user} displayName="Luke" />);
    expect(container.querySelector('[data-testid="rail-board-b1"]')!.getAttribute('aria-current')).toBeNull();
    expect(container.querySelector('[data-testid="rail-today"]')!.getAttribute('aria-current')).toBe('page');
  });

  it('New board opens the create-board flow', async () => {
    const { showCreateBoardModal } = await import('../../state/board-store');
    showCreateBoardModal.value = false;
    const { container } = render(<NavRail user={user} displayName="Luke" />);
    fireEvent.click(container.querySelector('[data-testid="rail-new-board"]') as HTMLElement);
    expect(showCreateBoardModal.value).toBe(true);
    showCreateBoardModal.value = false;
  });
});

describe('SettingsScreen', () => {
  const noop = () => {};

  function renderSettings(handlers: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
    return render(
      <SettingsScreen
        user={user}
        onEditProfile={noop}
        onOpenArchivedBoards={noop}
        onOpenShortcuts={noop}
        onSignOut={noop}
        {...handlers}
      />,
    );
  }

  it('shows the email, the title and every card', () => {
    const { container } = renderSettings();
    expect(container.querySelector('.settings-subline')!.textContent).toBe(ME);
    expect(container.querySelector('h1')!.textContent).toBe('Settings');
    const titles = [...container.querySelectorAll('.settings-card-title')].map((t) => t.textContent);
    expect(titles).toEqual(['Appearance', 'You', 'Boards', 'Help']);
  });

  it('each row does what its dropdown item did', () => {
    const onEditProfile = vi.fn();
    const onOpenArchivedBoards = vi.fn();
    const onOpenShortcuts = vi.fn();
    const onSignOut = vi.fn();
    const { container } = renderSettings({ onEditProfile, onOpenArchivedBoards, onOpenShortcuts, onSignOut });
    fireEvent.click(container.querySelector('[data-testid="settings-edit-profile"]') as HTMLElement);
    fireEvent.click(container.querySelector('[data-testid="settings-archived-boards"]') as HTMLElement);
    fireEvent.click(container.querySelector('[data-testid="settings-shortcuts"]') as HTMLElement);
    fireEvent.click(container.querySelector('[data-testid="settings-signout"]') as HTMLElement);
    expect(onEditProfile).toHaveBeenCalledTimes(1);
    expect(onOpenArchivedBoards).toHaveBeenCalledTimes(1);
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows how many boards are archived', () => {
    const { container } = renderSettings();
    expect(container.querySelector('[data-testid="settings-archived-boards"] .settings-row-value')!.textContent).toBe(
      '1',
    );
  });

  it('hides Edit profile in demo mode, as the dropdown did', async () => {
    vi.resetModules();
    vi.doMock('../../demo/is-demo-mode', () => ({ isDemoMode: () => true }));
    const { SettingsScreen: Demo } = await import('./settings-screen');
    const { container } = render(
      <Demo user={user} onEditProfile={noop} onOpenArchivedBoards={noop} onOpenShortcuts={noop} onSignOut={noop} />,
    );
    expect(container.querySelector('[data-testid="settings-edit-profile"]')).toBeNull();
    expect(container.querySelector('[data-testid="settings-archived-boards"]')).not.toBeNull();
    vi.doUnmock('../../demo/is-demo-mode');
  });

  it('puts the keyboard shortcuts row in a card that CSS hides below 768px', () => {
    const { container } = renderSettings();
    const row = container.querySelector('[data-testid="settings-shortcuts"]')!;
    expect(row.closest('.settings-card-desktop-only')).not.toBeNull();
  });
});

describe('ThemeToggle as a radiogroup', () => {
  it('has Light, Dark and System, with the current one checked', () => {
    theme.value = 'dark';
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
    const radios = [...container.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.textContent)).toEqual(['Light', 'Dark', 'System']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('applies at once', () => {
    theme.value = 'light';
    const { container } = render(<ThemeToggle />);
    fireEvent.click(container.querySelectorAll('[role="radio"]')[1] as HTMLElement);
    expect(theme.value).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    theme.value = 'system';
  });
});
