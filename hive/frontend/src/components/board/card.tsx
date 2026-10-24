import {
  selectItem,
  getChildCount,
  openDetailWithTitleEdit,
  boardStatuses,
  isTerminalStatus,
  owners,
  labels as labelsStore,
  todayStr,
  addDays,
} from '../../state/board-store';
import type { ItemWithRow, ItemStatus } from '../../api/types';
import { CalendarIcon, ChecklistIcon } from '../today/today-icons';
import { dayLong, initials, monthDay, ownerColor } from '../today/today-format';
import { KebabMenu } from './kebab-menu';
import type { KebabAction } from './kebab-menu';

/** Tracks the status of the card currently being dragged (same module, readable during dragover). */
export let currentDragStatus: string | null = null;

interface Props {
  item: ItemWithRow;
  onMoveStatus?: (itemId: string, newStatus: ItemStatus) => void;
  onReorder?: (itemId: string, direction: 'up' | 'down') => void;
  columnItems?: ItemWithRow[];
  /** Kebab menu: move to top of column */
  onMoveToTop?: (itemId: string) => void;
  /** Kebab menu: move to bottom of column */
  onMoveToBottom?: (itemId: string) => void;
  /** Kebab menu: copy item */
  onCopy?: (itemId: string) => void;
  /** Kebab menu: delete item */
  onDelete?: (itemId: string) => void;
}

export function Card({
  item,
  onMoveStatus,
  onReorder,
  columnItems,
  onMoveToTop,
  onMoveToBottom,
  onCopy,
  onDelete,
}: Props) {
  const childCount = getChildCount(item.id);
  const itemLabels = item.labels
    ? item.labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const done = isTerminalStatus(item.status);
  const isOverdue =
    !!item.due_date &&
    !done &&
    (isIsoDay(item.due_date)
      ? item.due_date < todayStr()
      : parseLocalDate(item.due_date) < new Date(new Date().toDateString()));
  const ownerIndex = item.owner ? owners.value.findIndex((o) => o.name === item.owner) : -1;
  // #626: a finished item shows when it was finished; an open one, when it is due.
  const doneOn = done && item.completed_at ? localDay(item.completed_at) : '';

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer?.setData('text/plain', item.id);
    e.dataTransfer?.setData('application/x-hive-status', item.status);
    currentDragStatus = item.status;

    const card = e.currentTarget as HTMLElement;
    card.classList.add('card-dragging');
  };

  const handleDragEnd = (e: DragEvent) => {
    currentDragStatus = null;
    const card = e.currentTarget as HTMLElement;
    card.classList.remove('card-dragging');
  };

  /** Click on the card body (non-title) opens detail without edit mode */
  const handleCardClick = (e: MouseEvent) => {
    // If the click originated from the title button, let its own handler deal with it
    if ((e.target as HTMLElement).closest('.card-title')) return;
    openDetailWithTitleEdit.value = false;
    selectItem(item.id);
  };

  /** Click on the title button opens detail (edit title from inside the panel) */
  const handleTitleClick = (e: MouseEvent) => {
    e.stopPropagation();
    openDetailWithTitleEdit.value = false;
    selectItem(item.id);
  };

  /** Keyboard handler on the title button — the sole tab stop per card */
  const handleTitleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetailWithTitleEdit.value = false;
      selectItem(item.id);
      return;
    }

    // Alt+ArrowUp/Down for within-column reorder
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (onReorder) {
        onReorder(item.id, e.key === 'ArrowUp' ? 'up' : 'down');
      }
      return;
    }

    // Arrow keys for moving between columns (only without Alt)
    if (!e.altKey && onMoveStatus && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const statusOrder = boardStatuses.value.map((s) => s.name);
      const currentIndex = statusOrder.indexOf(item.status);
      if (currentIndex === -1) return;
      const newIndex = e.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex >= 0 && newIndex < statusOrder.length) {
        onMoveStatus(item.id, statusOrder[newIndex]);
      }
    }
  };

  // Build kebab menu actions
  const isFirstInColumn = columnItems ? columnItems[0]?.id === item.id : false;
  const isLastInColumn = columnItems ? columnItems[columnItems.length - 1]?.id === item.id : false;

  const kebabActions: KebabAction[] = [];
  if (onMoveToTop) {
    kebabActions.push({
      label: 'Move to top',
      disabled: isFirstInColumn,
      onAction: () => onMoveToTop(item.id),
    });
  }
  if (onMoveToBottom) {
    kebabActions.push({
      label: 'Move to bottom',
      disabled: isLastInColumn,
      onAction: () => onMoveToBottom(item.id),
    });
  }
  if (onCopy) {
    kebabActions.push({
      label: 'Copy',
      onAction: () => onCopy(item.id),
    });
  }
  if (onDelete) {
    kebabActions.push({
      label: 'Delete',
      danger: true,
      onAction: () => onDelete(item.id),
    });
  }

  return (
    <div
      class={`card${done ? ' card-done' : ''}`}
      draggable
      onClick={handleCardClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-item-id={item.id}
    >
      <div class="card-content">
        <button
          class="card-title"
          type="button"
          tabIndex={0}
          aria-label={`${item.title}, ${item.status}. Press Enter to view details. Arrow keys to move between columns, Alt+Up/Down to reorder.`}
          onClick={handleTitleClick}
          onKeyDown={handleTitleKeyDown}
        >
          {item.title}
        </button>

        <div class="card-meta">
          {done && doneOn ? (
            <span class="card-due" aria-label={`Done ${doneOn}`}>
              <CalendarIcon />
              Done {doneOn}
            </span>
          ) : isOverdue ? (
            <span class="today-overdue-pill card-overdue" aria-label={`Overdue, due ${monthDayOf(item.due_date)}`}>
              OVERDUE · {monthDayOf(item.due_date)}
            </span>
          ) : item.due_date ? (
            <span class="card-due" aria-label={`Due date: ${dueWord(item.due_date)}`}>
              <CalendarIcon />
              {dueWord(item.due_date)}
            </span>
          ) : null}
          {childCount.total > 0 && (
            <span class="card-subtasks" aria-label={`${childCount.done} of ${childCount.total} sub-tasks done`}>
              <ChecklistIcon />
              {childCount.done}/{childCount.total}
            </span>
          )}
          {!item.owner && <span class="card-unassigned">Unassigned</span>}
        </div>

        {itemLabels.length > 0 && (
          <div class="card-labels">
            {itemLabels.map((label) => (
              <span key={label} class="card-label">
                <span
                  class="card-label-dot"
                  style={{ background: labelsStore.value.find((l) => l.label === label)?.color || '#999' }}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div class="card-side">
        {item.owner && (
          <span
            class="card-avatar"
            style={{ background: ownerColor(ownerIndex) }}
            title={item.owner}
            data-testid="card-avatar"
          >
            <span aria-hidden="true">{initials(item.owner)}</span>
            <span class="sr-only">{item.owner}</span>
          </span>
        )}
        {kebabActions.length > 0 && <KebabMenu actions={kebabActions} itemTitle={item.title} />}
      </div>
    </div>
  );
}

function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

function isIsoDay(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/** "Oct 22"; a date that is not a plain day is shown as it is stored. */
function monthDayOf(dateStr: string): string {
  return isIsoDay(dateStr) ? monthDay(dateStr) : dateStr;
}

/** "Today", "Tomorrow", or "Sat, Oct 31". */
function dueWord(dateStr: string): string {
  if (!isIsoDay(dateStr)) return dateStr;
  const today = todayStr();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, 1)) return 'Tomorrow';
  return dayLong(dateStr);
}

/** The local calendar day of a timestamp, as "Oct 23". */
function localDay(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
