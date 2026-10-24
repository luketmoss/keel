import { useState, useCallback, useMemo, useEffect } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import {
  pendingDeleteIds,
  columns,
  showCreateModal,
  createModalInitialStatus,
  selectedItem,
  selectItem,
  groupBy,
  rootItems,
  items,
  owners,
  boardLabels as labelsStore,
  allDoneItems,
  hasArchivedItems,
  showArchiveDialog,
  showCreateBoardModal,
  showShareModal,
  showDeleteBoardModal,
  showArchiveBoardModal,
  showArchivedBoardsDialog,
  showMoveToBoardModal,
  boardItems,
  userBoardRole,
  accessibleBoards,
  switchBoard,
  theme,
  applyTheme,
  cycleTheme,
  columnSortModes,
  setColumnSortMode,
  columnAnnouncement,
  showToast,
  activeView,
  boardOpen,
  boardStatuses,
  isTerminalStatus,
  selectedColumnIndex,
} from '../../state/board-store';
import type { SortMode } from '../../state/board-store';
import { moveItem, reorderItem, deleteItem, copyItem } from '../../state/actions';
import { useKeyboardShortcuts } from '../../hooks/use-keyboard-shortcuts';
import type { Shortcut } from '../../hooks/use-keyboard-shortcuts';
import { Column } from './column';
import { ListView } from './list-view';
import { CardDetail } from './card-detail';
import { CreateItemModal } from '../forms/create-item-modal';
import { CreateBoardModal } from './create-board-modal';
import { ShareModal } from './share-modal';
import { DeleteBoardModal } from './delete-board-modal';
import { ArchiveBoardModal } from './archive-board-modal';
import { ArchivedBoardsDialog } from './archived-boards-dialog';
import { MoveToBoardModal } from './move-to-board-modal';
import { ShortcutsHelp } from './shortcuts-help';
import { ProfileDialog } from '../profile/profile-dialog';
import { ArchiveDialog } from '../archive/archive-dialog';
import { ControlBar } from '../header/control-bar';
import { NavRail } from '../shell/nav-rail';
import { TabBar } from '../shell/tab-bar';
import { SettingsScreen } from '../shell/settings-screen';
import { BoardsScreen } from '../boards/boards-screen';
import { TodayScreen, openCreateForToday } from '../today/today-screen';
import { ColumnTabs } from './column-tabs';
import type { ItemStatus, ItemWithRow } from '../../api/types';

export function KanbanBoard() {
  const { user, logout, token, updateUserName } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const statuses = boardStatuses.value;

  // AC5: Listen for OS prefers-color-scheme changes while System is selected
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme.value === 'system') {
        applyTheme('system');
      }
    };
    mq.addEventListener('change', handleChange);
    // Apply theme on mount (picks up inline script state or sets initial data-theme)
    applyTheme(theme.value);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Derive display name from Owners sheet (source of truth), falling back to Google account name
  const displayName = user
    ? owners.value.find((o) => o.google_account.toLowerCase() === user.email.toLowerCase())?.name || user.name
    : '';

  /** A and the board shortcuts act on a board; Today and Settings have none to act on (#623). */
  const onBoard = () => activeView.value === 'boards' && boardOpen.value;

  /** N needs somewhere to put the item: Today, or a board. */
  const onBoardOrToday = () => activeView.value === 'today' || onBoard();

  /** True when no modal or overlay is open — shortcuts should be active. */
  const noModalOpen = () =>
    !showShareModal.value &&
    !showDeleteBoardModal.value &&
    !showArchiveBoardModal.value &&
    !showArchivedBoardsDialog.value &&
    !showMoveToBoardModal.value &&
    !showCreateModal.value &&
    !showCreateBoardModal.value &&
    !showArchiveDialog.value &&
    !selectedItem.value &&
    !showShortcutsHelp;

  // Build shortcut definitions
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      // AC1: Archive shortcut — 'A' toggles archive dialog
      {
        key: 'a',
        action: () => {
          if (showArchiveDialog.value) {
            showArchiveDialog.value = false;
          } else if (onBoard() && noModalOpen()) {
            showArchiveDialog.value = true;
          }
        },
      },
      // AC3: New item shortcut — 'N' opens create modal
      {
        key: 'n',
        action: () => {
          if (activeView.value === 'settings' || !onBoardOrToday() || !noModalOpen()) return;
          // #624: on Today the form opens with the selected day as its due date.
          if (activeView.value === 'today') {
            if (accessibleBoards.value.length > 0) openCreateForToday();
          } else {
            showCreateModal.value = true;
          }
        },
      },
      // AC4: Shortcuts help overlay — '?' toggles help
      {
        key: '?',
        action: () => {
          if (showShortcutsHelp) {
            setShowShortcutsHelp(false);
          } else if (noModalOpen()) {
            setShowShortcutsHelp(true);
          }
        },
      },
      // AC7: Theme cycle — 'T' cycles Light → Dark → System → Light
      {
        key: 't',
        action: () => {
          if (noModalOpen()) {
            cycleTheme();
          }
        },
      },
      // #138: Ctrl+Shift+S opens board settings modal — only for board owners
      {
        key: 's',
        ctrl: true,
        shift: true,
        action: () => {
          if (onBoard() && userBoardRole.value === 'owner' && noModalOpen()) {
            showShareModal.value = true;
          }
        },
      },
      // AC2: Board switching — Ctrl+1 through Ctrl+9
      ...Array.from({ length: 9 }, (_, i) => ({
        key: String(i + 1),
        ctrl: true,
        action: () => {
          if (!onBoard() || !noModalOpen()) return;
          const boardList = accessibleBoards.value;
          if (i < boardList.length) {
            switchBoard(boardList[i].id);
          }
        },
      })),
    ],
    [showShortcutsHelp],
  );

  useKeyboardShortcuts(shortcuts);

  const handleOpenArchive = useCallback(() => {
    showArchiveDialog.value = true;
  }, []);

  const handleCloseArchive = useCallback(() => {
    showArchiveDialog.value = false;
  }, []);

  const handleDrop = (itemId: string, newStatus: ItemStatus, targetIndex?: number) => {
    if (token) {
      moveItem(itemId, newStatus, user?.name || 'web', token, targetIndex);
    }
  };

  const handleMoveStatus = (itemId: string, newStatus: ItemStatus) => {
    if (token) {
      // AC6: Announce placement when keyboard-moving into a date-sorted destination
      const destSortMode = columnSortModes.value[newStatus];
      const isDestDateSorted = (destSortMode && destSortMode !== 'custom') || isTerminalStatus(newStatus);
      if (isDestDateSorted) {
        const sortLabel = isTerminalStatus(newStatus)
          ? 'completion date'
          : destSortMode === 'due_date'
            ? 'due date'
            : 'creation date';
        columnAnnouncement.value = {
          status: newStatus,
          text: `Moving to ${newStatus} — will be added in ${sortLabel} order`,
        };
        // Clear after screen reader has time to read
        setTimeout(() => {
          columnAnnouncement.value = null;
        }, 3000);
      }
      moveItem(itemId, newStatus, user?.name || 'web', token);
    }
  };

  const handleReorder = (itemId: string, newIndex: number, columnItems: ItemWithRow[]) => {
    if (token) {
      reorderItem(itemId, newIndex, columnItems, user?.name || 'web', token);
    }
  };

  /** Kebab menu: delete with undo toast (AC7) */
  const handleDeleteItem = useCallback(
    (itemId: string) => {
      if (!token) return;
      const item = items.value.find((i) => i.id === itemId);
      if (!item) return;

      const oldItems = [...items.value];

      // Optimistic removal (item + children)
      items.value = items.value.filter((i) => i.id !== itemId && i.parent_id !== itemId);
      // Keep the 30s poll from re-fetching the still-present sheet row during the undo window
      pendingDeleteIds.add(itemId);

      let undone = false;
      showToast(
        'Item deleted',
        'success',
        {
          label: 'Undo',
          fn: () => {
            undone = true;
            pendingDeleteIds.delete(itemId);
            items.value = oldItems;
          },
        },
        10000,
      );

      // Commit deletion after toast expires (if not undone)
      setTimeout(async () => {
        if (!undone) {
          // Re-insert only the deleted item(s) into current state so deleteItem can find them
          const present = new Set(items.value.map((i) => i.id));
          const deletedItems = oldItems.filter(
            (i) => (i.id === itemId || i.parent_id === itemId) && !present.has(i.id),
          );
          items.value = [...items.value, ...deletedItems];
          try {
            await deleteItem(itemId, user?.name || 'web', token);
          } finally {
            pendingDeleteIds.delete(itemId);
          }
        }
      }, 10100);
    },
    [token, user],
  );

  /** Kebab menu: copy task + subtasks, open detail view */
  const handleCopyItem = useCallback(
    async (itemId: string) => {
      if (!token) return;
      const newId = await copyItem(itemId, user?.name || 'web', token);
      if (newId) {
        selectItem(newId);
        showToast('Task copied');
      }
    },
    [token, user],
  );

  const handleAddItemToColumn = useCallback((status: ItemStatus) => {
    createModalInitialStatus.value = status;
    showCreateModal.value = true;
  }, []);

  // Check if the current board is empty (zero items for this board, ignoring filters)
  const isBoardEmpty = boardItems.value.length === 0;

  // Swimlane grouping
  const renderSwimlanes = () => {
    const group = groupBy.value;
    if (group === 'none') {
      return (
        <div class="board-columns">
          {statuses.map((status) => (
            <Column
              key={status.name}
              status={status.name}
              isTerminal={status.is_terminal}
              items={columns.value[status.name] || []}
              onDrop={handleDrop}
              onReorder={handleReorder}
              onMoveStatus={handleMoveStatus}
              sortMode={columnSortModes.value[status.name]}
              onSortChange={(mode: SortMode) => setColumnSortMode(status.name, mode)}
              onAddItem={() => handleAddItemToColumn(status.name)}
              onCopyItem={handleCopyItem}
              onDeleteItem={handleDeleteItem}
              {...(status.is_terminal
                ? {
                    allDoneCount: allDoneItems.value.length,
                    hasArchived: hasArchivedItems.value,
                    onOpenArchive: handleOpenArchive,
                  }
                : {})}
            />
          ))}
        </div>
      );
    }

    const groupValues = labelsStore.value.map((l) => l.label);

    return (
      <div class="board-swimlanes">
        {groupValues.map((groupValue) => {
          const swimlaneItems = rootItems.value.filter((item) =>
            item.labels
              .split(',')
              .map((l) => l.trim())
              .includes(groupValue),
          );

          if (swimlaneItems.length === 0) return null;

          return (
            <div key={groupValue} class="swimlane">
              <div class="swimlane-header">
                <h2>{groupValue}</h2>
                <span class="column-count">{swimlaneItems.length}</span>
              </div>
              <div class="board-columns">
                {statuses.map((status) => (
                  <Column
                    key={`${groupValue}-${status.name}`}
                    status={status.name}
                    isTerminal={status.is_terminal}
                    items={swimlaneItems.filter((i) => i.status === status.name)}
                    onDrop={handleDrop}
                    onReorder={handleReorder}
                    onMoveStatus={handleMoveStatus}
                    compact
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // #625: a board is showing, not the list of boards
  const onBoards = activeView.value === 'boards' && boardOpen.value;

  return (
    <div class="app-shell">
      <NavRail user={user} displayName={displayName} />

      <div class="board-layout">
        {onBoards && <ControlBar />}
        {onBoards && groupBy.value === 'none' && !isBoardEmpty && <ColumnTabs />}

        <main class="board-main">
          {activeView.value === 'today' ? (
            <TodayScreen />
          ) : activeView.value === 'settings' ? (
            <SettingsScreen
              user={user}
              onEditProfile={() => setShowProfile(true)}
              onOpenArchivedBoards={() => {
                showArchivedBoardsDialog.value = true;
              }}
              onOpenShortcuts={() => setShowShortcutsHelp(true)}
              onSignOut={logout}
            />
          ) : !boardOpen.value ? (
            <BoardsScreen />
          ) : isBoardEmpty ? (
            <div class="board-welcome" data-testid="board-welcome">
              <div class="board-welcome-icon">&#128203;</div>
              <h2>No tasks yet</h2>
              <p>
                Click <strong>+</strong> to create your first one.
              </p>
            </div>
          ) : groupBy.value === 'status' ? (
            <ListView />
          ) : (
            renderSwimlanes()
          )}
        </main>
      </div>

      {onBoards && (
        <button
          class="fab"
          onClick={() => {
            // #626: on a phone the FAB adds to the column whose tab is selected.
            if (groupBy.value === 'none' && window.matchMedia('(max-width: 767px)').matches) {
              const col = statuses[selectedColumnIndex.value];
              if (col) createModalInitialStatus.value = col.name;
            }
            showCreateModal.value = true;
          }}
          title="Create new item"
          aria-label="Create new item"
        >
          +
        </button>
      )}

      {/* The item screen covers the page on a phone, so the tab bar steps aside while it is open. */}
      {!selectedItem.value && <TabBar />}

      {selectedItem.value && <CardDetail />}
      {showCreateModal.value && <CreateItemModal />}
      {showCreateBoardModal.value && <CreateBoardModal />}
      {showShareModal.value && <ShareModal />}
      {showDeleteBoardModal.value && <DeleteBoardModal />}
      {showArchiveBoardModal.value && <ArchiveBoardModal />}
      {showArchivedBoardsDialog.value && <ArchivedBoardsDialog />}
      {showMoveToBoardModal.value && <MoveToBoardModal />}
      {showArchiveDialog.value && <ArchiveDialog onClose={handleCloseArchive} />}
      {showShortcutsHelp && <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}
      {showProfile && user && token && (
        <ProfileDialog
          user={user}
          currentName={displayName}
          token={token}
          onClose={() => {
            setShowProfile(false);
            // AC6: Return focus to the row that opened the dialog
            requestAnimationFrame(() => {
              const trigger = document.querySelector<HTMLElement>('[data-testid="settings-edit-profile"]');
              trigger?.focus();
            });
          }}
          onNameUpdated={updateUserName}
        />
      )}
    </div>
  );
}
