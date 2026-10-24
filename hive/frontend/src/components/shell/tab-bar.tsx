import type { ComponentChildren } from 'preact';
import { activeView, destinationUrl, navigate, openBoardsTab } from '../../state/board-store';
import type { ActiveView } from '../../state/board-store';
import { BoardsIcon, SettingsIcon, TodayIcon } from './nav-icons';

const TABS: { view: ActiveView; label: string; icon: ComponentChildren }[] = [
  { view: 'today', label: 'Today', icon: <TodayIcon /> },
  { view: 'boards', label: 'Boards', icon: <BoardsIcon /> },
  { view: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

/** Left-click navigates in place; modified clicks keep the link's own behaviour. */
export function onNavClick(e: MouseEvent, view: ActiveView, boardId?: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(view, boardId);
}

/** #625: the Boards tab returns to the list from a board, and restores what Boards last showed from elsewhere. */
export function onBoardsTabClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openBoardsTab();
}

/** #623: the phone's primary navigation. Below 768px; the rail replaces it from there up. */
export function TabBar() {
  return (
    <nav class="bottom-nav" aria-label="Primary" data-testid="tab-bar">
      {TABS.map((tab) => {
        const active = activeView.value === tab.view;
        return (
          <a
            key={tab.view}
            href={destinationUrl(tab.view).toString()}
            class={`bottom-nav-tab${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={(e) => (tab.view === 'boards' ? onBoardsTabClick(e) : onNavClick(e, tab.view))}
            data-testid={`tab-${tab.view}`}
          >
            <span class="bottom-nav-icon">{tab.icon}</span>
            <span class="bottom-nav-label">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
