import { signal, computed } from '@preact/signals';
import type { ItemWithRow, Owner, Label, Board, BoardPermission, PermissionRole, BoardStatus } from '../api/types';
import { isValidDateForm } from '../utils/validate-date';
import { isBoardArchived } from './rules';

// --- Core data ---
export const items = signal<ItemWithRow[]>([]);
/** Item ids deleted optimistically (undo window) but not yet removed from the sheet.
 *  refreshItems hides them (and their sub-items) so a poll can't resurrect them. */
export const pendingDeleteIds = new Set<string>();
export const owners = signal<Owner[]>([]);
export const labels = signal<Label[]>([]);
export const boards = signal<Board[]>([]);
export const permissions = signal<BoardPermission[]>([]);
export const statuses = signal<BoardStatus[]>([]);
export const activeBoardId = signal<string>('');
export const loading = signal(true);
export const currentUserEmail = signal<string>('');

/** The currently active board object. */
export const activeBoard = computed(() => boards.value.find((b) => b.id === activeBoardId.value) ?? null);

/** Every board the current user has access to (via direct permission or wildcard), archived or not. */
const permittedBoards = computed(() => {
  const email = currentUserEmail.value.toLowerCase();
  if (!email) return boards.value; // No user context = show all (fallback)
  return boards.value.filter((b) => {
    return permissions.value.some(
      (p) => p.board_id === b.id && (p.user_email === '*' || p.user_email.toLowerCase() === email),
    );
  });
});

/**
 * Boards the current user has access to, minus archived ones (#288). This is
 * the list every view reads — the switcher, shortcuts, Today, Move to
 * board, deep links — so an archived board drops out of all of them at once.
 */
export const accessibleBoards = computed(() => permittedBoards.value.filter((b) => !isBoardArchived(b)));

/** #288: Archived boards the current user can access, most recently archived first. */
export const archivedBoards = computed(() =>
  permittedBoards.value
    .filter((b) => isBoardArchived(b))
    .sort((a, b) => (b.archived_at || '').localeCompare(a.archived_at || '')),
);

/** #288: The current user's role on any board, not just the active one. */
export function userRoleForBoard(boardId: string): PermissionRole | null {
  const email = currentUserEmail.value.toLowerCase();
  if (!email || !boardId) return null;
  const direct = permissions.value.find((p) => p.board_id === boardId && p.user_email.toLowerCase() === email);
  if (direct) return direct.role;
  const wildcard = permissions.value.find((p) => p.board_id === boardId && p.user_email === '*');
  return wildcard ? 'member' : null;
}

/** The current user's role on the active board. A direct permission (may be 'owner') wins; a wildcard always grants member. */
export const userBoardRole = computed((): PermissionRole | null => userRoleForBoard(activeBoardId.value));

/** Labels scoped to the active board. */
export const boardLabels = computed(() => {
  const bid = activeBoardId.value;
  if (!bid) return labels.value;
  return labels.value.filter((l) => l.board_id === bid);
});

/** Statuses (columns) for the active board, sorted by sort_order. */
export const boardStatuses = computed(() => {
  const bid = activeBoardId.value;
  return statuses.value.filter((s) => s.board_id === bid).sort((a, b) => a.sort_order - b.sort_order);
});

/** Check if a status name is a terminal (done) status for the active board.
 * Falls back to checking if name is 'Done' when no statuses are loaded (backward compat). */
export function isTerminalStatus(statusName: string): boolean {
  if (boardStatuses.value.length === 0) return statusName === 'Done';
  return boardStatuses.value.some((s) => s.name === statusName && s.is_terminal);
}

/** Check if a status name is terminal for a specific board (cross-board lookups).
 * Falls back to checking if name is 'Done' when no statuses are loaded. */
export function isTerminalStatusForBoard(statusName: string, boardId: string): boolean {
  const boardStats = statuses.value.filter((s) => s.board_id === boardId);
  if (boardStats.length === 0) return statusName === 'Done';
  return boardStats.some((s) => s.name === statusName && s.is_terminal);
}

/** Get the first (default) status name for the active board. Falls back to 'To Do'. */
export function defaultStatusName(): string {
  const first = boardStatuses.value[0];
  return first ? first.name : 'To Do';
}

/** Get the terminal status name for the active board. Falls back to 'Done'. */
export function terminalStatusName(): string {
  const terminal = boardStatuses.value.find((s) => s.is_terminal);
  return terminal ? terminal.name : 'Done';
}

/** Items scoped to the active board (plus their children). */
export const boardItems = computed(() => {
  const bid = activeBoardId.value;
  if (!bid) return items.value;
  // Include items on this board, plus children whose parent is on this board
  const boardRoots = new Set(items.value.filter((i) => i.board_id === bid && !i.parent_id).map((i) => i.id));
  return items.value.filter((i) => i.board_id === bid || (i.parent_id && boardRoots.has(i.parent_id)));
});

// --- Filters ---
export const filterOwner = signal<string | null>(null);
export const filterLabel = signal<string | null>(null);
export const filterSearch = signal('');
export type DueFilter = 'today' | 'this-week' | null;
export const filterDue = signal<DueFilter>(null);
export type GroupBy = 'none' | 'status' | 'label';

function loadGroupBy(): GroupBy {
  try {
    const stored = localStorage.getItem('hive-group-by');
    if (stored === 'none' || stored === 'status' || stored === 'label') return stored;
    // Migration: if user had list view selected, map to status grouping
    const oldViewMode = localStorage.getItem('hive-view-mode');
    if (oldViewMode === 'list') {
      localStorage.setItem('hive-group-by', 'status');
      localStorage.removeItem('hive-view-mode');
      return 'status';
    }
  } catch {
    /* localStorage unavailable */
  }
  return 'none';
}

export const groupBy = signal<GroupBy>(loadGroupBy());

export function setGroupBy(mode: GroupBy) {
  groupBy.value = mode;
  try {
    localStorage.setItem('hive-group-by', mode);
  } catch {
    /* localStorage unavailable */
  }
}

// --- Active destination (#623): Today · Boards · Settings ---
export type ActiveView = 'today' | 'boards' | 'settings';
export const activeView = signal<ActiveView>('today');

/** #625: under Boards, whether a board is showing (true) or the list of boards (false). */
export const boardOpen = signal(false);
/** #625: what Boards last showed this session: a board's id, or null for the list. */
let boardsMemory: string | null = null;

/** Record what Boards is showing: a board by id, or the list. */
function showBoardsScreen(boardId: string | null) {
  boardOpen.value = boardId !== null;
  boardsMemory = boardId;
}

/** The title for the current destination: a board by name once one is in the URL, else the destination's. */
export function destinationTitle(): string {
  if (activeView.value === 'today') return 'Hive \u2014 Today';
  if (activeView.value === 'settings') return 'Hive \u2014 Settings';
  const board = boardOpen.value ? boards.value.find((b) => b.id === activeBoardId.value) : null;
  return board ? `Hive \u2014 ${board.name}` : 'Hive \u2014 Boards';
}

/**
 * Go to a destination. `pushState`, so the back button steps back through
 * destinations (`replace` swaps the current entry instead). `boardId` opens that
 * board under Boards; Boards without one is the list (#625). Leaving a
 * destination drops `item`: an item belongs to the page it was opened over.
 */
export function navigate(view: ActiveView, boardId?: string, replace = false) {
  const url = destinationUrl(view, boardId);
  selectedItemId.value = null;
  if (view === 'boards') {
    if (boardId && boardId !== activeBoardId.value) enterBoard(boardId);
    showBoardsScreen(boardId ?? null);
  }
  activeView.value = view;
  if (url.toString() !== window.location.href) {
    if (replace) window.history.replaceState(null, '', url.toString());
    else window.history.pushState(null, '', url.toString());
  }
  document.title = destinationTitle();
}

/**
 * The Boards tab (#625). Tapped while Boards is showing, it returns to the list.
 * Coming from Today or Settings it restores what Boards last had open this
 * session, a board or the list.
 */
export function openBoardsTab() {
  const remembered = boardsMemory;
  const restore =
    activeView.value !== 'boards' && remembered !== null && accessibleBoards.value.some((b) => b.id === remembered);
  navigate('boards', restore ? (remembered as string) : undefined);
}

/** The address of a destination, keeping unrelated parameters such as `demo`. */
export function destinationUrl(view: ActiveView, boardId?: string): URL {
  const url = new URL(window.location.href);
  url.searchParams.delete('item');
  url.searchParams.delete('board');
  url.searchParams.delete('view');
  if (view === 'boards' && boardId) url.searchParams.set('board', boardId);
  else url.searchParams.set('view', view);
  return url;
}

/** Read the destination from the URL: on load, and when the back button changes it. */
export function initActiveViewFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'settings' || view === 'today') {
    activeView.value = view;
  } else if (view === 'boards') {
    activeView.value = 'boards';
    showBoardsScreen(null);
  } else if (view === 'upcoming') {
    // An old link: open Today and say so in the address bar, keeping the other parameters.
    activeView.value = 'today';
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'today');
    window.history.replaceState(null, '', url.toString());
  } else if (params.get('board') || params.get('item')) {
    // A board or an item on its own is a link into a board. A board that
    // cannot be opened is the list (#625); an item's own board is settled when
    // the item resolves.
    activeView.value = 'boards';
    const boardParam = params.get('board');
    const reachable = !!boardParam && accessibleBoards.value.some((b) => b.id === boardParam);
    showBoardsScreen(reachable || params.get('item') ? activeBoardId.value : null);
  } else {
    activeView.value = 'today';
  }
  document.title = destinationTitle();
}

/** The back and forward buttons: bring the destination, board and item back in step with the URL. */
export function syncFromLocation() {
  const boardParam = new URLSearchParams(window.location.search).get('board');
  if (boardParam && boardParam !== activeBoardId.value && accessibleBoards.value.some((b) => b.id === boardParam)) {
    activeBoardId.value = boardParam;
  }
  initActiveViewFromUrl();
  selectedItemId.value = null;
  initSelectedItemFromUrl();
}

// --- UI state ---
export const selectedItemId = signal<string | null>(null);

/**
 * #240: the message shown when a deep-linked item cannot be opened. Deliberately
 * one string for every cause — not found, deleted, or on a board the user has no
 * permission for — so an inaccessible item is indistinguishable from a deleted
 * one and nothing about it is revealed.
 */
export const ITEM_UNAVAILABLE_MESSAGE = 'That item is no longer available';

/**
 * #240: write (or remove) the `item` query param. `replaceState` matches how
 * `board` and `view` are handled — selection is not a history entry, so the back
 * button still steps out of the app rather than back through selections (AC3).
 */
function syncSelectedItemParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set('item', id);
  } else {
    url.searchParams.delete('item');
  }
  window.history.replaceState(null, '', url.toString());
}

/** The title to show when no item detail is open. */
function contextTitle(): string {
  return destinationTitle();
}

/**
 * #240: open an item's detail. The single entry point for selection — every
 * call site routes through here so the URL and document title cannot drift out
 * of sync with `selectedItemId`.
 */
export function selectItem(id: string) {
  selectedItemId.value = id;
  syncSelectedItemParam(id);
  const item = items.value.find((i) => i.id === id);
  document.title = item ? `Hive — ${item.title}` : contextTitle();
}

/** #240: close the item detail, dropping the `item` param and restoring the title. */
export function clearSelectedItem() {
  selectedItemId.value = null;
  syncSelectedItemParam(null);
  document.title = contextTitle();
}

/**
 * #240: read `item` from the URL on cold load.
 *
 * Must run *after* `initActiveBoardFromUrl()` and `initActiveViewFromUrl()`:
 * board resolution clears the selection, so applying the selection first would
 * silently close the detail it just opened.
 *
 * An item is reachable only if it exists and sits on a board in the accessible
 * set. Anything else clears the param and shows the neutral toast (AC4).
 */
export function initSelectedItemFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const itemParam = params.get('item');
  if (!itemParam) return;

  const item = items.value.find((i) => i.id === itemParam);
  const reachable = !!item && accessibleBoards.value.some((b) => b.id === item.board_id);

  if (!item || !reachable) {
    syncSelectedItemParam(null);
    showToast(ITEM_UNAVAILABLE_MESSAGE, 'error');
    return;
  }

  // AC2: the item's own board wins over whatever `board` named, or its absence.
  // AC5: outside Boards this is state only — the `board` param stays
  // deleted and the view is not forced back to the board.
  if (item.board_id && item.board_id !== activeBoardId.value) {
    activeBoardId.value = item.board_id;
    if (activeView.value === 'boards') {
      showBoardsScreen(item.board_id);
      const url = new URL(window.location.href);
      url.searchParams.set('board', item.board_id);
      window.history.replaceState(null, '', url.toString());
    }
  }

  selectedItemId.value = item.id;
  document.title = `Hive — ${item.title}`;
}

/** When true, CardDetail opens with the title EditableField in edit mode. */
export const openDetailWithTitleEdit = signal(false);
export const showCreateModal = signal(false);
/** When set, the Create Item modal will pre-fill this status instead of the board's first column. */
export const createModalInitialStatus = signal<string | null>(null);
/**
 * #263: when the Create Item modal is opened from `?new=1&due=…`, the due date
 * to pre-fill. `null` means "not opened from the URL"; `''` means opened from
 * the URL with no usable date (missing or malformed `due`, AC4).
 */
export const createModalInitialDueDate = signal<string | null>(null);

/** #263: the message shown when `?board=` names a board that is missing or
 * inaccessible while opening the deep-linked create-item modal. One string for
 * both causes, following #240's rule for `ITEM_UNAVAILABLE_MESSAGE`. */
export const BOARD_UNAVAILABLE_MESSAGE = 'That board is not available';

/**
 * #263: remove `new` and `due` from the URL with `replaceState`, leaving
 * `board`, `view` and `demo` untouched (AC3). Called on every close route of a
 * modal that could have been opened from the URL, and when the `item` deep
 * link wins over a `new`+`due` pair (AC5).
 */
export function clearCreateItemUrlParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete('new');
  url.searchParams.delete('due');
  window.history.replaceState(null, '', url.toString());
}

/**
 * #263: read `new` and `due` from the URL on cold load and open the Create
 * Item modal pre-filled with the due date.
 *
 * Must run *after* `initSelectedItemFromUrl()`: AC5 gives the `item` deep link
 * priority over `new`+`due` when both are present, so this checks whether an
 * item selection already won before doing anything.
 */
export function initCreateItemFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('new') !== '1') return;

  if (selectedItemId.value) {
    // AC5: the item deep link already won. Its own resolution (including the
    // ITEM_UNAVAILABLE_MESSAGE toast) already ran; just drop new/due.
    clearCreateItemUrlParams();
    return;
  }

  // AC4: a missing or malformed `due` still opens the modal, with an empty field.
  const dueParam = params.get('due');
  createModalInitialDueDate.value = isValidDateForm(dueParam) ? dueParam : '';
  showCreateModal.value = true;

  // AC2: a `board` param that doesn't resolve still falls back silently (that's
  // initActiveBoardFromUrl's job, already run) but gets a toast here — only
  // because `new=1` asked for it. A plain `?board=<bad>` load stays silent.
  const boardParam = params.get('board');
  if (boardParam && !accessibleBoards.value.some((b) => b.id === boardParam)) {
    showToast(BOARD_UNAVAILABLE_MESSAGE, 'error');
  }
}
export const toastMessage = signal<{
  text: string;
  type: 'success' | 'error';
  action?: { label: string; fn: () => void };
  duration?: number;
} | null>(null);

// --- Theme ---
export type Theme = 'light' | 'dark' | 'system';

/** Read the saved theme preference from localStorage, falling back to 'system'. */
export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem('hive-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* localStorage unavailable */
  }
  return 'system';
}

export const theme = signal<Theme>(loadTheme());

/** Apply `data-theme` attribute to `<html>` based on the given theme. */
export function applyTheme(t: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = t === 'system' ? (prefersDark ? 'dark' : 'light') : t;
  document.documentElement.setAttribute('data-theme', resolved);
}

/** Set the active theme, persist to localStorage, and apply to the DOM. */
export function setTheme(t: Theme) {
  theme.value = t;
  try {
    localStorage.setItem('hive-theme', t);
  } catch {
    /* localStorage unavailable */
  }
  applyTheme(t);
}

/** Cycle theme Light → Dark → System → Light (used by T keyboard shortcut). */
export function cycleTheme() {
  const order: Theme[] = ['light', 'dark', 'system'];
  const current = theme.value;
  const next = order[(order.indexOf(current) + 1) % order.length];
  setTheme(next);
}

// --- Derived ---

/** Get today's date as YYYY-MM-DD. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get end-of-week (Sunday) date as YYYY-MM-DD from today. */
function endOfWeekStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Check if an item's fields match the search term (case-insensitive). */
function itemMatchesSearch(item: ItemWithRow, term: string): boolean {
  const t = term.toLowerCase();
  return (
    item.title.toLowerCase().includes(t) ||
    item.description.toLowerCase().includes(t) ||
    item.labels.toLowerCase().includes(t)
  );
}

/** Check if an item's due_date falls within the due filter range. */
function itemMatchesDue(item: ItemWithRow, due: 'today' | 'this-week'): boolean {
  if (!item.due_date) return false;
  const today = todayStr();
  if (due === 'today') return item.due_date === today;
  // this-week: today through Sunday inclusive
  return item.due_date >= today && item.due_date <= endOfWeekStr();
}

export const filteredItems = computed(() => {
  let result = boardItems.value;

  if (filterLabel.value) {
    const label = filterLabel.value;
    result = result.filter((i) =>
      i.labels
        .split(',')
        .map((l) => l.trim())
        .includes(label),
    );
  }

  const search = filterSearch.value.trim();
  const due = filterDue.value;

  if (search || due) {
    // Build set of root IDs whose children match (for sub-item search)
    const allItems = boardItems.value;
    const matchingParentIds = new Set<string>();

    if (search) {
      for (const item of allItems) {
        if (item.parent_id && itemMatchesSearch(item, search)) {
          matchingParentIds.add(item.parent_id);
        }
      }
    }
    if (due) {
      for (const item of allItems) {
        if (item.parent_id && itemMatchesDue(item, due)) {
          matchingParentIds.add(item.parent_id);
        }
      }
    }

    result = result.filter((i) => {
      // Children pass through — they're filtered out by rootItems
      if (i.parent_id) return true;

      const searchOk = !search || itemMatchesSearch(i, search) || matchingParentIds.has(i.id);
      const dueOk = !due || itemMatchesDue(i, due) || matchingParentIds.has(i.id);
      return searchOk && dueOk;
    });
  }

  return result;
});

export const rootItems = computed(() => filteredItems.value.filter((i) => !i.parent_id));

const bySortOrder = (a: ItemWithRow, b: ItemWithRow) => a.sort_order - b.sort_order;
const byCompletedAtDesc = (a: ItemWithRow, b: ItemWithRow) => {
  const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
  const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
  return bTime - aTime;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** All root items in terminal (done) columns (unfiltered by date). */
export const allDoneItems = computed(() => rootItems.value.filter((i) => isTerminalStatus(i.status)));

/** Root terminal-column items completed within the last 7 days. */
export const recentDoneItems = computed(() => {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  return allDoneItems.value
    .filter((i) => i.completed_at && new Date(i.completed_at).getTime() >= cutoff)
    .sort(bySortOrder);
});

/** True when there are terminal items older than 7 days (archived). */
export const hasArchivedItems = computed(() => allDoneItems.value.length > recentDoneItems.value.length);

/** All terminal items sorted by completed_at descending, for the archive dialog. */
export const allDoneItemsSorted = computed(() => allDoneItems.value.slice().sort(byCompletedAtDesc));

// --- UI state for archive dialog ---
export const showArchiveDialog = signal(false);

// --- UI state for board creation ---
export const showCreateBoardModal = signal(false);

// --- UI state for share modal ---
export const showShareModal = signal(false);

// --- UI state for delete board modal ---
export const showDeleteBoardModal = signal(false);

// --- UI state for archiving boards (#288) ---
// Named "archived boards" so it can't be confused with the completed-items
// archive above (showArchiveDialog).
export const showArchiveBoardModal = signal(false);
export const showArchivedBoardsDialog = signal(false);

// --- UI state for move-to-board modal ---
export const showMoveToBoardModal = signal(false);

/** Make a board the active one: resets filters, grouping and selection. Shows nothing by itself. */
export function selectBoard(boardId: string) {
  activeBoardId.value = boardId;
  filterOwner.value = null;
  filterLabel.value = null;
  filterSearch.value = '';
  filterDue.value = null;
  groupBy.value = 'none';
  selectedItemId.value = null;
}

/** The state half of opening a board: selects it and lands on Boards with that board showing. */
function enterBoard(boardId: string) {
  selectBoard(boardId);
  activeView.value = 'boards';
  showBoardsScreen(boardId);
}

/**
 * #625: the active board was archived or deleted. Something else becomes the
 * active board for the rest of the app (`preferred` when it is still reachable),
 * and if that board was showing, Boards shows the list in its place.
 */
export function dropActiveBoard(preferredId?: string) {
  const wasOpen = activeView.value === 'boards' && boardOpen.value;
  const list = accessibleBoards.value;
  const next = list.find((b) => b.id === preferredId) ?? list[0];
  if (next) selectBoard(next.id);
  if (wasOpen) navigate('boards', undefined, true);
}

/** #625: undo `dropActiveBoard` after a failed write: the board is active again, and showing if it was. */
export function restoreBoard(boardId: string, wasOpen: boolean) {
  if (wasOpen) navigate('boards', boardId, true);
  else selectBoard(boardId);
}

/** Switch to a different board (in place, no history entry). Resets filters, grouping, and selection. */
export function switchBoard(boardId: string) {
  enterBoard(boardId);

  // Update URL with board param. The `item` deep link belongs to the board we
  // are leaving, so it goes with the selection it described (#240, AC3).
  const url = new URL(window.location.href);
  url.searchParams.set('board', boardId);
  url.searchParams.delete('view');
  url.searchParams.delete('item');
  window.history.replaceState(null, '', url.toString());

  // Update document title
  const board = boards.value.find((b) => b.id === boardId);
  if (board) {
    document.title = `Hive \u2014 ${board.name}`;
  }
}

/** Read active board from URL query param, falling back to first accessible board. */
export function initActiveBoardFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const boardParam = params.get('board');
  // Filter to boards the current user can access (AC3), which excludes archived ones (#288)
  const available = accessibleBoards.value;
  if (boardParam && available.some((b) => b.id === boardParam)) {
    activeBoardId.value = boardParam;
  } else if (available.length > 0) {
    activeBoardId.value = available[0].id;
  }
  // Update document title
  const board = boards.value.find((b) => b.id === activeBoardId.value);
  if (board) {
    document.title = `Hive \u2014 ${board.name}`;
  }
}

// --- Column announcements (for aria-live cross-column keyboard move) ---
export const columnAnnouncement = signal<{ status: string; text: string } | null>(null);

// --- Column sort ---
export type SortMode = 'custom' | 'due_date' | 'created';

function sortKey(status: string): string {
  return `hive-sort-${status.toLowerCase().replace(/ /g, '-')}`;
}

export function loadColumnSortModes(): Record<string, SortMode> {
  const modes: Record<string, SortMode> = {};
  try {
    // Load sort modes for all known statuses
    for (const s of statuses.value) {
      const stored = localStorage.getItem(sortKey(s.name));
      if (stored === 'custom' || stored === 'due_date' || stored === 'created') {
        modes[s.name] = stored;
      } else {
        modes[s.name] = 'custom';
      }
    }
    // Fallback: also try loading legacy hardcoded keys
    for (const name of ['To Do', 'In Progress', 'Done']) {
      if (!modes[name]) {
        const stored = localStorage.getItem(sortKey(name));
        if (stored === 'custom' || stored === 'due_date' || stored === 'created') {
          modes[name] = stored;
        }
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  return modes;
}

export const columnSortModes = signal<Record<string, SortMode>>(loadColumnSortModes());

export function setColumnSortMode(status: string, mode: SortMode) {
  columnSortModes.value = { ...columnSortModes.value, [status]: mode };
  try {
    localStorage.setItem(sortKey(status), mode);
  } catch {
    /* localStorage unavailable */
  }
}

function sortItems(itemList: ItemWithRow[], mode: SortMode): ItemWithRow[] {
  if (mode === 'due_date') {
    return itemList.slice().sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1; // nulls last
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }
  if (mode === 'created') {
    return itemList.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return itemList.slice().sort(bySortOrder);
}

export const columns = computed((): Record<string, ItemWithRow[]> => {
  const result: Record<string, ItemWithRow[]> = {};
  for (const status of boardStatuses.value) {
    if (status.is_terminal) {
      result[status.name] = recentDoneItems.value;
    } else {
      const mode = columnSortModes.value[status.name] || 'custom';
      result[status.name] = sortItems(
        rootItems.value.filter((i) => i.status === status.name),
        mode,
      );
    }
  }
  return result;
});

// --- Today (#624): what is due, across boards ---

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function parseDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `dateStr`, as YYYY-MM-DD. */
export function mondayOf(dateStr: string): string {
  const day = parseDay(dateStr).getDay(); // 0=Sun
  return addDays(dateStr, day === 0 ? -6 : 1 - day);
}

/** Sunday of the week containing `dateStr`, as YYYY-MM-DD. */
export function sundayOf(dateStr: string): string {
  return addDays(mondayOf(dateStr), 6);
}

/** The name of a board's first column (lowest sort_order). Falls back to 'To Do'. */
export function firstStatusNameForBoard(boardId: string): string {
  const first = statuses.value.filter((s) => s.board_id === boardId).sort((a, b) => a.sort_order - b.sort_order)[0];
  return first ? first.name : 'To Do';
}

/** The name of a board's first terminal column, or null when it has none (and no statuses to fall back on). */
export function firstTerminalStatusNameForBoard(boardId: string): string | null {
  const boardStats = statuses.value.filter((s) => s.board_id === boardId).sort((a, b) => a.sort_order - b.sort_order);
  if (boardStats.length === 0) return 'Done';
  return boardStats.find((s) => s.is_terminal)?.name ?? null;
}

/** The signed-in person's Owners-sheet name, or '' when they have no row. */
export const currentOwnerName = computed(() => {
  const email = currentUserEmail.value.toLowerCase();
  if (!email) return '';
  return owners.value.find((o) => o.google_account.toLowerCase() === email)?.name ?? '';
});

export type TodayWho = 'mine' | 'everyone';
const TODAY_WHO_KEY = 'hive-today-who';

function loadTodayWho(): TodayWho {
  try {
    return localStorage.getItem(TODAY_WHO_KEY) === 'everyone' ? 'everyone' : 'mine';
  } catch {
    return 'mine';
  }
}

export const todayWho = signal<TodayWho>(loadTodayWho());

export function setTodayWho(who: TodayWho) {
  todayWho.value = who;
  try {
    localStorage.setItem(TODAY_WHO_KEY, who);
  } catch {
    /* localStorage unavailable */
  }
}

/** Mine applies only to a person with an Owners row; without one it is Everyone. */
export const effectiveTodayWho = computed((): TodayWho => (currentOwnerName.value ? todayWho.value : 'everyone'));

/** The selected day (YYYY-MM-DD). Today on load; not persisted. */
export const todaySelectedDay = signal<string>(todayStr());
/** Monday of the week the strip shows. */
export const todayWeekStart = signal<string>(mondayOf(todayStr()));

export function selectTodayDay(day: string) {
  todaySelectedDay.value = day;
}

export function shiftTodayWeek(weeks: number) {
  todayWeekStart.value = addDays(todayWeekStart.value, weeks * 7);
}

export interface TodayRow {
  item: ItemWithRow;
  board: Board;
  /** In one of its board's terminal columns. */
  done: boolean;
  /** Open, and not in its board's first column. */
  started: boolean;
  /** Title of the parent, for a subtask. */
  parentTitle: string;
  /** Whether the item's board has a terminal column to check it into. */
  canComplete: boolean;
}

function byDueThenBoard(boardOrder: Map<string, number>) {
  return (a: TodayRow, b: TodayRow) =>
    a.item.due_date.localeCompare(b.item.due_date) ||
    (boardOrder.get(a.board.id) ?? 0) - (boardOrder.get(b.board.id) ?? 0) ||
    a.item.sort_order - b.item.sort_order;
}

/**
 * Every dated item on an accessible, non-archived board, roots and subtasks
 * alike, narrowed to the signed-in person's own when Mine is on.
 */
export const todayRows = computed((): TodayRow[] => {
  const boardList = accessibleBoards.value;
  const byId = new Map(boardList.map((b) => [b.id, b]));
  const all = items.value;
  const itemById = new Map(all.map((i) => [i.id, i]));
  const mine = effectiveTodayWho.value === 'mine' ? currentOwnerName.value : '';
  const rows: TodayRow[] = [];
  for (const item of all) {
    if (!item.due_date) continue;
    const parent = item.parent_id ? itemById.get(item.parent_id) : undefined;
    const boardId = item.board_id || parent?.board_id || '';
    const board = byId.get(boardId);
    if (!board) continue;
    if (mine && item.owner !== mine) continue;
    const done = isTerminalStatusForBoard(item.status, boardId);
    rows.push({
      item,
      board,
      done,
      started: !done && item.status !== firstStatusNameForBoard(boardId),
      parentTitle: parent?.title ?? '',
      canComplete: firstTerminalStatusNameForBoard(boardId) !== null,
    });
  }
  return rows;
});

export interface TodayDay {
  date: string;
  /** Up to the row count: open ones first. */
  open: number;
  done: number;
}

/** The numbers and lists Today draws, for the selected day. */
export const todayView = computed(() => {
  const today = todayStr();
  const selected = todaySelectedDay.value;
  const horizon = selected > today ? selected : today;
  const weekEnd = sundayOf(today);
  const rows = todayRows.value;
  const boardOrder = new Map(accessibleBoards.value.map((b, i) => [b.id, i]));
  const sortDue = byDueThenBoard(boardOrder);

  const days: TodayDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(todayWeekStart.value, i);
    const due = rows.filter((r) => r.item.due_date === date);
    days.push({ date, open: due.filter((r) => !r.done).length, done: due.filter((r) => r.done).length });
  }

  const overdue = rows.filter((r) => !r.done && r.item.due_date < today).sort(sortDue);

  const dueRows = rows.filter((r) => r.item.due_date === selected);
  const dueOpen = dueRows
    .filter((r) => !r.done)
    .sort(
      (a, b) =>
        (boardOrder.get(a.board.id) ?? 0) - (boardOrder.get(b.board.id) ?? 0) || a.item.sort_order - b.item.sort_order,
    );
  const dueDone = dueRows
    .filter((r) => r.done)
    .sort((a, b) => (a.item.completed_at || '').localeCompare(b.item.completed_at || ''));

  const after = rows.filter((r) => !r.done && r.item.due_date > horizon).sort(sortDue);
  const inProgress = after.filter((r) => r.started);

  return {
    today,
    selected,
    horizon,
    days,
    overdue,
    due: [...dueOpen, ...dueDone],
    dueOpenCount: dueOpen.length,
    dueDoneCount: dueDone.length,
    moreThisWeek: after.filter((r) => r.item.due_date <= weekEnd).length,
    inProgress,
    upNext: after.slice(0, 5),
    anyDated: rows.length > 0,
  };
});

// --- Boards (#625): every board at a glance ---

export interface BoardSummary {
  board: Board;
  /** "You, Mom and Dad", "Everyone" or "Just you". */
  sharedWith: string;
  /** Root items, finished ones included. Zero means "No items yet". */
  total: number;
  /** Open root items: not in a terminal column. */
  open: number;
  /** Open, in the board's first column. */
  notStarted: number;
  /** Open, past the first column. */
  started: number;
  /** In a terminal column and finished within the window the board's Done column shows. */
  done: number;
  /** Open items, subtasks too, due before today. */
  overdue: number;
  /** The earliest open item due today or later, or null. */
  next: { title: string; date: string } | null;
}

function nameFromEmail(email: string): string {
  const owner = owners.value.find((o) => o.google_account.toLowerCase() === email.toLowerCase());
  return owner?.name || email.split('@')[0];
}

/** Who a board is shared with, as one line. Up to three names, then "and N others". */
export function sharedWithLine(boardId: string): string {
  const me = currentUserEmail.value.toLowerCase();
  const rows = permissions.value.filter((p) => p.board_id === boardId);
  if (rows.some((p) => p.user_email === '*')) return 'Everyone';
  const others = [...new Set(rows.map((p) => p.user_email.toLowerCase()).filter((e) => e && e !== me))].map(
    nameFromEmail,
  );
  if (others.length === 0) return 'Just you';
  const names = ['You', ...others];
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const rest = names.length - 3;
  return `${names.slice(0, 3).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

/** One summary per accessible, non-archived board, in the order the rail lists them. */
export const boardSummaries = computed((): BoardSummary[] => {
  const today = todayStr();
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const all = items.value;
  const itemById = new Map(all.map((i) => [i.id, i]));
  return accessibleBoards.value.map((board) => {
    const first = firstStatusNameForBoard(board.id);
    let total = 0;
    let notStarted = 0;
    let started = 0;
    let done = 0;
    let overdue = 0;
    let next: ItemWithRow | null = null;
    for (const item of all) {
      const boardId = item.board_id || (item.parent_id ? itemById.get(item.parent_id)?.board_id : '') || '';
      if (boardId !== board.id) continue;
      const terminal = isTerminalStatusForBoard(item.status, board.id);
      if (!item.parent_id) {
        total++;
        if (terminal) {
          if (item.completed_at && new Date(item.completed_at).getTime() >= cutoff) done++;
        } else if (item.status === first) notStarted++;
        else started++;
      }
      if (terminal || !item.due_date) continue;
      if (item.due_date < today) overdue++;
      else if (!next || item.due_date < next.due_date) next = item;
    }
    return {
      board,
      sharedWith: sharedWithLine(board.id),
      total,
      open: notStarted + started,
      notStarted,
      started,
      done,
      overdue,
      next: next ? { title: next.title, date: next.due_date } : null,
    };
  });
});

export const selectedItem = computed(() =>
  selectedItemId.value ? (items.value.find((i) => i.id === selectedItemId.value) ?? null) : null,
);

export const childrenOfSelected = computed(() =>
  selectedItemId.value ? items.value.filter((i) => i.parent_id === selectedItemId.value).sort(bySortOrder) : [],
);

// --- Helpers ---

/** Timer ID for the current toast auto-dismiss. Exported for pause/resume in Toast component. */
export let toastTimerId: ReturnType<typeof setTimeout> | null = null;

export function showToast(
  text: string,
  type: 'success' | 'error' = 'success',
  action?: { label: string; fn: () => void },
  duration?: number,
) {
  // Clear any existing timer
  if (toastTimerId !== null) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }
  const ms = duration ?? 4000;
  toastMessage.value = { text, type, action, duration: ms };
  toastTimerId = setTimeout(() => {
    toastMessage.value = null;
    toastTimerId = null;
  }, ms);
}

/** Pause the toast auto-dismiss timer. Returns remaining ms, or null if no timer. */
export function pauseToastTimer(): void {
  if (toastTimerId !== null) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }
}

/** Resume the toast auto-dismiss timer with the given remaining ms. */
export function resumeToastTimer(remainingMs: number): void {
  if (toastTimerId !== null) {
    clearTimeout(toastTimerId);
  }
  toastTimerId = setTimeout(() => {
    toastMessage.value = null;
    toastTimerId = null;
  }, remainingMs);
}

/** Dismiss the current toast immediately and clear any pending timer. */
export function dismissToast(): void {
  if (toastTimerId !== null) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }
  toastMessage.value = null;
}

export function getChildCount(itemId: string): { done: number; total: number } {
  const children = items.value.filter((i) => i.parent_id === itemId);
  return {
    done: children.filter((i) => isTerminalStatus(i.status)).length,
    total: children.length,
  };
}
