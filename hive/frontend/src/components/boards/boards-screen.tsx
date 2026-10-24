// Boards (#625): every board at a glance. The numbers come from `boardSummaries`
// in board-store; this file only draws them.
import {
  accessibleBoards,
  archivedBoards,
  boardSummaries,
  destinationUrl,
  showArchivedBoardsDialog,
  showCreateBoardModal,
  todayStr,
} from '../../state/board-store';
import type { BoardSummary } from '../../state/board-store';
import { onNavClick } from '../shell/tab-bar';
import { ChevronIcon, Icon, PlusIcon } from '../shell/nav-icons';
import { CalendarIcon } from '../today/today-icons';
import { dueWord } from '../today/today-format';

function ArchiveIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </Icon>
  );
}

function openNewBoard() {
  showCreateBoardModal.value = true;
}

function BoardCard({ summary, today }: { summary: BoardSummary; today: string }) {
  const { board, total, notStarted, started, done, open, overdue, next } = summary;
  const segments = [
    { key: 'not-started', count: notStarted, word: 'not started' },
    { key: 'started', count: started, word: 'started' },
    { key: 'done', count: done, word: 'done' },
  ];
  const counted = notStarted + started + done;

  return (
    <a
      href={destinationUrl('boards', board.id).toString()}
      class="boards-card"
      aria-label={`${board.name}, ${open} open, ${overdue} overdue`}
      onClick={(e) => onNavClick(e, 'boards', board.id)}
      data-testid={`boards-card-${board.id}`}
    >
      <span class="boards-card-top">
        <span class="boards-tile" aria-hidden="true">
          {board.icon || board.name.charAt(0).toUpperCase()}
        </span>
        <span class="boards-card-heading">
          <span class="boards-card-name">{board.name}</span>
          <span class="boards-card-shared">{summary.sharedWith}</span>
        </span>
        {overdue > 0 && (
          <span class="today-overdue-pill" data-testid={`boards-overdue-${board.id}`}>
            {overdue} OVERDUE
          </span>
        )}
        <span class="boards-card-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </span>

      {total === 0 ? (
        <span class="boards-card-empty">No items yet</span>
      ) : (
        <>
          {counted > 0 && (
            <span class="boards-bar" aria-hidden="true" data-testid={`boards-bar-${board.id}`}>
              {segments.map(
                (seg) =>
                  seg.count > 0 && (
                    <span
                      key={seg.key}
                      class={`boards-bar-seg boards-bar-${seg.key}`}
                      style={`flex-grow: ${seg.count}`}
                      data-count={seg.count}
                    />
                  ),
              )}
            </span>
          )}
          <span class="boards-legend" data-testid={`boards-legend-${board.id}`}>
            {segments.map((seg) => (
              <span key={seg.key} class="boards-legend-item">
                <span class={`boards-legend-swatch boards-bar-${seg.key}`} aria-hidden="true" />
                <span class="boards-legend-count">{seg.count}</span> {seg.word}
              </span>
            ))}
          </span>
        </>
      )}

      <span class="boards-card-next">
        <span class="boards-card-next-icon" aria-hidden="true">
          <CalendarIcon />
        </span>
        <span class="boards-card-next-text" data-testid={`boards-next-${board.id}`}>
          {next ? `Next: ${next.title} · ${dueWord(next.date, today)}` : 'Nothing dated'}
        </span>
      </span>
    </a>
  );
}

/** Boards, the list: a card per board, then New board and Archived boards. */
export function BoardsScreen() {
  const summaries = boardSummaries.value;
  const today = todayStr();
  const openTotal = summaries.reduce((sum, s) => sum + s.open, 0);
  const archivedCount = archivedBoards.value.length;
  const boardCount = accessibleBoards.value.length;

  return (
    <div class="boards-screen" data-testid="boards-screen">
      <header class="boards-header">
        <p class="boards-subline" data-testid="boards-subline">
          {boardCount} board{boardCount === 1 ? '' : 's'} {'·'} {openTotal} open
        </p>
        <div class="boards-title-row">
          <h1 class="page-title">Boards</h1>
          <button
            type="button"
            class="today-round-btn"
            aria-label="New board"
            onClick={openNewBoard}
            data-testid="boards-new-header"
          >
            <PlusIcon />
          </button>
        </div>
      </header>

      {boardCount === 0 && (
        <p class="boards-none" data-testid="boards-none">
          No boards yet.
        </p>
      )}

      <div class="boards-grid">
        {summaries.map((s) => (
          <BoardCard key={s.board.id} summary={s} today={today} />
        ))}
      </div>

      <button type="button" class="boards-new-card" onClick={openNewBoard} data-testid="boards-new-card">
        <PlusIcon />
        New board
      </button>

      {archivedCount > 0 && (
        <button
          type="button"
          class="boards-archived-row"
          onClick={() => {
            showArchivedBoardsDialog.value = true;
          }}
          data-testid="boards-archived"
        >
          <span class="boards-archived-icon">
            <ArchiveIcon />
          </span>
          <span class="boards-archived-label">Archived boards</span>
          <span class="boards-archived-count">{archivedCount}</span>
          <span class="boards-card-chevron" aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
      )}
    </div>
  );
}
