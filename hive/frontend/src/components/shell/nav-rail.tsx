import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dropIndex } from '../../state/board-order';
import {
  accessibleBoards,
  moveBoard,
  activeBoardId,
  activeView,
  boardOpen,
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
  const boardList = accessibleBoards.value;

  // #656: reorder the board list by drag, or Alt+Up / Alt+Down on a focused board.
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    if (refocus.current) {
      document.querySelector<HTMLElement>(`[data-testid="rail-board-${refocus.current}"]`)?.focus();
      refocus.current = null;
    }
  });

  const ids = () => accessibleBoards.value.map((b) => b.id);
  const clearDrop = (e?: DragEvent) => {
    // dragleave fires moving between children; only clear when leaving the list
    const list = e?.currentTarget as HTMLElement | undefined;
    if (e && list && e.relatedTarget instanceof Node && list.contains(e.relatedTarget)) return;
    setDrop(null);
  };
  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const onDragStart = (e: DragEvent, id: string) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
    setDragId(id);
  };
  const targetFor = (e: DragEvent, id: string) => {
    if (!dragId) return null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const where = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const list = ids();
    const to = dropIndex(list, dragId, id, where);
    if (to === null || to === list.indexOf(dragId)) return null;
    return { where, to } as const;
  };
  const onDragOver = (e: DragEvent, id: string) => {
    if (!dragId) return;
    e.preventDefault();
    const t = targetFor(e, id);
    if (e.dataTransfer) e.dataTransfer.dropEffect = t ? 'move' : 'none';
    setDrop((prev) => (t ? (prev && prev.id === id && prev.where === t.where ? prev : { id, where: t.where }) : null));
  };
  const onDrop = (e: DragEvent, id: string) => {
    e.preventDefault();
    const t = targetFor(e, id);
    if (dragId && t) moveBoard(dragId, t.to);
    endDrag();
  };
  const onKeyDown = (e: KeyboardEvent, b: Board) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const list = ids();
    const from = list.indexOf(b.id);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= list.length) return;
    moveBoard(b.id, to);
    refocus.current = b.id;
    setAnnouncement(`${b.name} moved to position ${to + 1} of ${list.length}`);
  };

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
          <h2 class="rail-section-heading">
            <a
              href={destinationUrl('boards').toString()}
              class={`rail-item rail-heading-link${view === 'boards' && !boardOpen.value ? ' rail-item-active' : ''}`}
              aria-current={view === 'boards' && !boardOpen.value ? 'page' : undefined}
              onClick={(e) => onNavClick(e, 'boards')}
              data-testid="rail-boards-heading"
            >
              BOARDS
            </a>
          </h2>
          <span id="rail-board-order-hint" class="sr-only">
            Drag, or press Alt+Up or Alt+Down, to reorder.
          </span>
          <div class="sr-only" role="status" aria-live="polite" data-testid="rail-board-announce">
            {announcement}
          </div>
          <ul class="rail-board-list" aria-describedby="rail-board-order-hint" onDragLeave={clearDrop}>
            {boardList.map((b) => {
              const active = view === 'boards' && boardOpen.value && b.id === activeBoardId.value;
              const dropClass = drop && drop.id === b.id ? ` rail-drop-${drop.where}` : '';
              return (
                <li
                  key={b.id}
                  class={`rail-board-row${dragId === b.id ? ' rail-board-dragging' : ''}${dropClass}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, b.id)}
                  onDragOver={(e) => onDragOver(e, b.id)}
                  onDrop={(e) => onDrop(e, b.id)}
                  onDragEnd={endDrag}
                  data-testid={`rail-row-${b.id}`}
                >
                  <a
                    href={destinationUrl('boards', b.id).toString()}
                    class={`rail-item rail-board${active ? ' rail-item-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={b.name}
                    draggable={false}
                    onClick={(e) => onNavClick(e, 'boards', b.id)}
                    onKeyDown={(e) => onKeyDown(e, b)}
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
