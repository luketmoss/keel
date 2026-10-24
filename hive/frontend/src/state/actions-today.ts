// Today's three one-tap changes (#624): check off, reopen, move to today. Each is
// the board's own move (moveItem applies applyStatusSideEffects, so completed_at
// is stamped and cleared as on the board) or updateItem, followed by a toast with
// an Undo that puts the previous column or date back through the same calls.
import { items, showToast, todayStr, firstStatusNameForBoard, firstTerminalStatusNameForBoard } from './board-store';
import { moveItem, updateItem } from './actions';

export const ITEM_GONE_MESSAGE = 'That item is no longer available';

function boardOf(itemId: string): { title: string; status: string; due: string; boardId: string } | null {
  const item = items.value.find((i) => i.id === itemId);
  if (!item) return null;
  const parent = item.parent_id ? items.value.find((i) => i.id === item.parent_id) : undefined;
  return {
    title: item.title,
    status: item.status,
    due: item.due_date,
    boardId: item.board_id || parent?.board_id || '',
  };
}

/** Move an item to `status`; the toast says what happened and Undo moves it back to where it was. */
async function moveWithUndo(
  itemId: string,
  status: string,
  verb: string,
  actor: string,
  token: string,
): Promise<boolean> {
  const before = boardOf(itemId);
  if (!before) {
    showToast(ITEM_GONE_MESSAGE, 'error');
    return false;
  }
  const pending = moveItem(itemId, status, actor, token);
  // moveItem announces its own move synchronously; Today's toast, with Undo, replaces it.
  showToast(`“${before.title}” ${verb}`, 'success', {
    label: 'Undo',
    fn: () => {
      if (!items.value.some((i) => i.id === itemId)) {
        showToast(ITEM_GONE_MESSAGE, 'error');
        return;
      }
      moveItem(itemId, before.status, actor, token);
    },
  });
  return pending;
}

/** Check an open item off: to its board's first terminal column. */
export function completeItem(itemId: string, actor: string, token: string): Promise<boolean> {
  const info = boardOf(itemId);
  const target = info ? firstTerminalStatusNameForBoard(info.boardId) : null;
  if (!info || !target) {
    if (!info) showToast(ITEM_GONE_MESSAGE, 'error');
    return Promise.resolve(false);
  }
  return moveWithUndo(itemId, target, 'marked done', actor, token);
}

/** Uncheck a done item: to its board's first column. */
export function reopenItem(itemId: string, actor: string, token: string): Promise<boolean> {
  const info = boardOf(itemId);
  if (!info) {
    showToast(ITEM_GONE_MESSAGE, 'error');
    return Promise.resolve(false);
  }
  return moveWithUndo(itemId, firstStatusNameForBoard(info.boardId), 'reopened', actor, token);
}

/** Set an item's due date to today. */
export async function moveItemToToday(itemId: string, actor: string, token: string): Promise<boolean> {
  const before = boardOf(itemId);
  if (!before) {
    showToast(ITEM_GONE_MESSAGE, 'error');
    return false;
  }
  const pending = updateItem(itemId, { due_date: todayStr() }, actor, token);
  showToast(`“${before.title}” moved to today`, 'success', {
    label: 'Undo',
    fn: () => {
      if (!items.value.some((i) => i.id === itemId)) {
        showToast(ITEM_GONE_MESSAGE, 'error');
        return;
      }
      updateItem(itemId, { due_date: before.due }, actor, token);
    },
  });
  return pending;
}
