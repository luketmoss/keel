import type { ComponentChildren } from 'preact';
import {
  accessibleBoards,
  activeBoardId,
  activeView,
  destinationUrl,
  items,
  isTerminalStatusForBoard,
  showCreateBoardModal,
} from '../../state/board-store';
import type { ActiveView } from '../../state/board-store';
import type { Board, UserInfo } from '../../api/types';
import { HiveLogo } from '../shared/hive-logo';
import { onNavClick } from './tab-bar';
import { BoardsIcon, PlusIcon, SettingsIcon, TodayIcon } from './nav-icons';

/** Open items on a board: root items not in a terminal column. */
function openCount(boardId: string): number {
  return items.value.filter(
    (i) => i.board_id === boardId && !i.parent_id && !isTerminalStatusForBoard(i.status, boardId),
  ).length;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

function BoardTile({ board }: { board: Board }) {
  return (
    <span class="rail-board-tile" aria-hidden="true">
      {board.icon || board.name.charAt(0).toUpperCase()}
    </span>
  );
}

interface NavRailProps {
  user: UserInfo | null;
  displayName: string;
}

/**
 * #623: the desktop navigation, 768px and up. From 1024px it is the full rail
 * with the board list; between 768 and 1023px CSS shrinks it to icons over labels.
 */
export function NavRail({ user, displayName }: NavRailProps) {
  const view = activeView.value;

  const destination = (target: ActiveView, label: string, icon: ComponentChildren) => {
    const active = view === target;
    return (
      <a
        href={destinationUrl(target).toString()}
        class={`rail-item${active ? ' rail-item-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => onNavClick(e, target)}
        data-testid={`rail-${target}`}
      >
        <span class="rail-item-icon">{icon}</span>
        <span class="rail-item-label">{label}</span>
      </a>
    );
  };

  return (
    <nav class="nav-rail" aria-label="Primary" data-testid="nav-rail">
      <div class="rail-brand">
        <HiveLogo size={28} />
        <span class="rail-brand-name">Hive</span>
      </div>

      <div class="rail-scroll">
        {destination('today', 'Today', <TodayIcon />)}

        {/* Compact rail: Boards is a destination. Full rail: it is a heading over the list. */}
        <div class="rail-compact-only">{destination('boards', 'Boards', <BoardsIcon />)}</div>
        <div class="rail-full-only">
          <h2 class="rail-section-heading">BOARDS</h2>
          <ul class="rail-board-list">
            {accessibleBoards.value.map((b) => {
              const active = view === 'boards' && b.id === activeBoardId.value;
              return (
                <li key={b.id}>
                  <a
                    href={destinationUrl('boards', b.id).toString()}
                    class={`rail-item rail-board${active ? ' rail-item-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={b.name}
                    onClick={(e) => onNavClick(e, 'boards', b.id)}
                    data-testid={`rail-board-${b.id}`}
                  >
                    <BoardTile board={b} />
                    <span class="rail-item-label">{b.name}</span>
                    <span class="rail-board-count">{openCount(b.id)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            class="rail-item rail-new-board"
            onClick={() => {
              showCreateBoardModal.value = true;
            }}
            data-testid="rail-new-board"
          >
            <span class="rail-item-icon">
              <PlusIcon />
            </span>
            <span class="rail-item-label">New board</span>
          </button>
        </div>
      </div>

      <div class="rail-bottom">
        {destination('settings', 'Settings', <SettingsIcon />)}
        {user && (
          <div class="rail-full-only">
            <a
              href={destinationUrl('settings').toString()}
              class="rail-item rail-person"
              onClick={(e) => onNavClick(e, 'settings')}
              data-testid="rail-person"
            >
              {user.picture ? (
                <img src={user.picture} alt="" class="rail-avatar" />
              ) : (
                <span class="rail-avatar rail-avatar-initials" aria-hidden="true">
                  {initialsOf(displayName)}
                </span>
              )}
              <span class="rail-item-label">{displayName}</span>
            </a>
          </div>
        )}
      </div>
    </nav>
  );
}
