import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import {
  clearSelectedItem,
  selectItem,
  selectedItem,
  childrenOfSelected,
  owners,
  items as allItems,
  activeView,
  showToast,
  openDetailWithTitleEdit,
  accessibleBoards,
  activeBoardId,
  showMoveToBoardModal,
  boardStatuses,
  isTerminalStatus,
  defaultStatusName,
  terminalStatusName,
} from '../../state/board-store';
import {
  updateItem,
  deleteItem,
  deleteSubtask,
  createItem,
  moveItem,
  reorderSubtasks,
  copyItem,
} from '../../state/actions';
import { LabelPickerManager } from '../labels/label-picker-manager';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import {
  localYmdOf,
  toLocalYmd,
  withLocalDate,
  isFutureLocalDate,
  isOutsideDoneWindow,
  completedRelativeLabel,
  addLocalDays,
  mondayOfLocal,
} from '../../utils/completed-date';
import { dayLong, monthDay } from '../today/today-format';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  ExpandIcon,
  MoreIcon,
  PlusSmallIcon,
  TrashIcon,
} from '../today/today-icons';
import type { ItemStatus, ItemWithRow } from '../../api/types';

/** The item screen (#627): a short top bar, the status switch, a card of field rows, a card of subtasks, a quiet footer. */
export function CardDetail() {
  const { token, user } = useAuth();
  const item = selectedItem.value;
  if (!item) return null;

  const actor = user?.name || 'web';
  // #627: one list in order; done subtasks stay where they are, struck through.
  const children = childrenOfSelected.value;
  const doneCount = children.filter((c) => isTerminalStatus(c.status)).length;

  // #206: Expand/collapse panel state — #233: default expanded on desktop
  const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
  const [expanded, setExpanded] = useState(isDesktop);
  // Reset expanded state when item changes (AC4)
  useEffect(() => {
    setExpanded(isDesktop());
  }, [item.id]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskDueDate, setSubtaskDueDate] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const subtaskRowRef = useRef<HTMLDivElement>(null);
  // Prevents the focusout handler from re-submitting after Enter already triggered submitSubtask
  const subtaskSubmittedRef = useRef(false);
  // Mirrors subtaskTitle state so submitSubtask always reads the current value,
  // avoiding stale-closure problems when focusOut fires before re-render.
  const subtaskTitleRef = useRef('');

  const close = useCallback(() => {
    clearSelectedItem();
  }, []);

  // #242: A card is not natively focusable, so clicking one leaves focus on
  // `body` and the trap has nothing to restore to. Name the card explicitly,
  // falling back to the board itself for a detail opened with no trigger at
  // all (the cold deep-link case, #240).
  const restoreFocusTo = useCallback((): HTMLElement | null => {
    const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(item.id) : item.id;
    return (
      document.querySelector<HTMLElement>(`[data-item-id="${id}"]`) ??
      document.querySelector<HTMLElement>('.board-main')
    );
  }, [item.id]);

  // Focus trap (AC3) + Escape to close (AC4)
  const panelRef = useFocusTrap(close, { restoreFocusTo });

  // #284: Closing returns the board to the column it was showing when the
  // detail opened, even if the item has since moved to another column. Runs
  // once per open — switching to a sub-item keeps the panel mounted.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('.board-main');
    if (!main) return;
    const left = main.scrollLeft;
    return () => {
      if (main.isConnected) main.scrollLeft = left;
    };
  }, []);

  const save = async (field: string, value: string): Promise<boolean> => {
    if (!token) return false;
    return updateItem(item.id, { [field]: value }, actor, token);
  };

  const handleMoveStatus = async (newStatus: ItemStatus): Promise<boolean> => {
    if (!token) return false;
    return moveItem(item.id, newStatus, actor, token);
  };

  const confirmDelete = () => {
    if (token) {
      deleteItem(item.id, actor, token);
      clearSelectedItem();
    }
    setConfirmingDelete(false);
  };

  /** #627: Copy lives in the item's options menu; the copy opens in place of this item. */
  const handleCopy = async () => {
    if (!token) return;
    const newId = await copyItem(item.id, actor, token);
    if (newId) {
      selectItem(newId);
      showToast('Task copied');
    }
  };

  /** Create the subtask from current input state. Returns true if created. */
  const doCreateSubtask = (): boolean => {
    const trimmed = subtaskTitleRef.current.trim();
    if (trimmed && token) {
      const newSubtask: Record<string, string> = {
        title: trimmed,
        parent_id: item.id,
        owner: '',
        created_by: user?.email || '',
      };
      if (subtaskDueDate) newSubtask.due_date = subtaskDueDate;
      createItem(newSubtask, actor, token);
      return true;
    }
    return false;
  };

  const resetSubtaskDraft = () => {
    setSubtaskTitle('');
    subtaskTitleRef.current = '';
    setSubtaskDueDate('');
  };

  /** #208: Enter path — create the subtask and keep the field focused for the next one. */
  const submitAndContinue = () => {
    if (subtaskSubmittedRef.current) return;
    subtaskSubmittedRef.current = true;
    const created = doCreateSubtask();
    resetSubtaskDraft();
    subtaskSubmittedRef.current = false;
    if (created) {
      requestAnimationFrame(() => subtaskInputRef.current?.focus());
    }
  };

  /** Focusout / confirm button path — create the subtask when there is a title. */
  const submitSubtask = () => {
    if (subtaskSubmittedRef.current) return;
    subtaskSubmittedRef.current = true;
    doCreateSubtask();
    resetSubtaskDraft();
    subtaskSubmittedRef.current = false;
  };

  /** Escape clears a draft; with nothing typed it is left to close the screen. */
  const clearSubtaskDraft = (e: KeyboardEvent) => {
    if (!subtaskTitleRef.current && !subtaskDueDate) return;
    e.stopPropagation();
    resetSubtaskDraft();
  };

  /** Focus-container: only submit when focus leaves the entire add row */
  const handleAddRowFocusOut = (e: FocusEvent) => {
    const container = subtaskRowRef.current;
    const related = e.relatedTarget as Node | null;
    // If focus moved to another element inside the add row, don't submit
    if (container && related && container.contains(related)) return;
    submitSubtask();
  };

  // #448: deleting a sub-task asks in the app. Only one confirm is open at a
  // time; it is the id of the sub-task being confirmed.
  const [confirmingSubtaskId, setConfirmingSubtaskId] = useState<string | null>(null);

  // A confirm belongs to the item it was opened on.
  useEffect(() => {
    setConfirmingSubtaskId(null);
  }, [item.id]);

  const requestDeleteSubtask = (childId: string) => {
    if (!token) return;
    setConfirmingSubtaskId(childId);
  };

  const cancelDeleteSubtask = () => setConfirmingSubtaskId(null);

  const confirmDeleteSubtask = (childId: string) => {
    if (!token) return;
    setConfirmingSubtaskId(null);
    deleteSubtask(childId, actor, token);
    // The row is gone, so focus goes where it always exists
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  };

  const handleReorder = (childId: string, direction: 'up' | 'down') => {
    if (!token) return;
    const idx = children.findIndex((c) => c.id === childId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= children.length) return;
    reorderSubtasks(children[idx].id, children[swapIdx].id, actor, token);
  };

  // #116: Per-subtask title editing
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskDraft, setEditingSubtaskDraft] = useState('');

  const startEditSubtaskTitle = (childId: string, currentTitle: string) => {
    setEditingSubtaskId(childId);
    setEditingSubtaskDraft(currentTitle);
  };

  const commitSubtaskTitleEdit = async (childId: string) => {
    const trimmed = editingSubtaskDraft.trim();
    setEditingSubtaskId(null);
    if (!trimmed) {
      // AC5: Empty title — restore original, no save
      return;
    }
    const child = children.find((c) => c.id === childId);
    if (!child || trimmed === child.title) return;
    if (!token) return;
    const ok = await updateItem(childId, { title: trimmed }, actor, token);
    if (ok) {
      showToast('Sub-task updated', 'success');
    } else {
      showToast('Failed to update sub-task', 'error');
    }
  };

  const cancelSubtaskTitleEdit = () => {
    setEditingSubtaskId(null);
    setEditingSubtaskDraft('');
  };

  // #88 AC5: Touch-friendly sub-task reorder
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');
  const touchDragRef = useRef<{
    childId: string;
    startIdx: number;
    targetIdx: number;
    startY: number;
    listEl: HTMLElement;
    rowHeight: number;
    childIds: string[];
  } | null>(null);

  const handleTouchReorderStart = (childId: string, idx: number, e: TouchEvent) => {
    const handle = e.currentTarget as HTMLElement;
    const li = handle.closest('.subtask-item') as HTMLElement;
    const list = li.closest('.subtask-list') as HTMLElement;
    const rowHeight = li.getBoundingClientRect().height;

    li.classList.add('subtask-dragging');

    touchDragRef.current = {
      childId,
      startIdx: idx,
      targetIdx: idx,
      startY: e.touches[0].clientY,
      listEl: list,
      rowHeight,
      childIds: children.map((c) => c.id),
    };
  };

  const handleTouchReorderMove = (e: TouchEvent) => {
    const drag = touchDragRef.current;
    if (!drag) return;
    e.preventDefault();

    const deltaY = e.touches[0].clientY - drag.startY;
    const items = Array.from(drag.listEl.querySelectorAll('.subtask-item')) as HTMLElement[];

    // Visual transform on dragged item
    if (items[drag.startIdx]) {
      items[drag.startIdx].style.transform = `translateY(${deltaY}px)`;
      items[drag.startIdx].style.position = 'relative';
      items[drag.startIdx].style.zIndex = '10';
    }

    // Calculate target position
    const offset = Math.round(deltaY / drag.rowHeight);
    drag.targetIdx = Math.max(0, Math.min(drag.childIds.length - 1, drag.startIdx + offset));

    // Show drop indicator
    items.forEach((el, i) => {
      if (i === drag.startIdx) return;
      el.classList.toggle('subtask-drop-target', i === drag.targetIdx);
    });
  };

  const handleTouchReorderEnd = () => {
    const drag = touchDragRef.current;
    if (!drag) return;

    // Clean up DOM styles
    const items = Array.from(drag.listEl.querySelectorAll('.subtask-item')) as HTMLElement[];
    items.forEach((el) => {
      el.style.transform = '';
      el.style.position = '';
      el.style.zIndex = '';
      el.classList.remove('subtask-dragging');
      el.classList.remove('subtask-drop-target');
    });

    const { startIdx, targetIdx, childIds } = drag;
    touchDragRef.current = null;

    if (startIdx === targetIdx || !token) return;

    // Perform sequential adjacent swaps
    const ids = [...childIds];
    const step = targetIdx > startIdx ? 1 : -1;
    for (let i = startIdx; i !== targetIdx; i += step) {
      reorderSubtasks(ids[i], ids[i + step], actor, token);
      [ids[i], ids[i + step]] = [ids[i + step], ids[i]];
    }

    setReorderAnnouncement(`Sub-task moved to position ${targetIdx + 1}`);
    setTimeout(() => setReorderAnnouncement(''), 3000);
  };

  // --- Move to Board ---
  // AC6: Hidden for subtasks. AC7: Hidden when only one accessible board.
  const isSubtask = !!item.parent_id;
  const otherBoards = accessibleBoards.value.filter((b) => b.id !== activeBoardId.value);
  const showMoveToBoard = !isSubtask && otherBoards.length > 0;
  const parent = isSubtask ? (selectedParent(item) ?? null) : null;

  const toggleChildStatus = (childId: string, currentStatus: ItemStatus) => {
    if (!token) return;
    const newStatus: ItemStatus = isTerminalStatus(currentStatus) ? defaultStatusName() : terminalStatusName();
    moveItem(childId, newStatus, actor, token);
  };

  const handleSubtaskDateSave = async (childId: string, field: 'due_date', value: string) => {
    if (!token) return;
    await updateItem(childId, { [field]: value }, actor, token);
  };

  const board =
    accessibleBoards.value.find((b) => b.id === item.board_id) ??
    accessibleBoards.value.find((b) => b.id === activeBoardId.value);
  const boardName = board?.name ?? '';
  const backTo = activeView.value === 'today' ? 'Today' : boardName || 'the board';

  const openDelete = () => {
    setConfirmingDelete(true);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.detail-footer')?.scrollIntoView?.({ block: 'nearest' });
    });
  };

  return (
    <div
      class="detail-overlay"
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Item Details"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('detail-overlay')) close();
      }}
    >
      <div class={`detail-panel${expanded ? ' detail-panel-expanded' : ''}`}>
        <div class="detail-topbar">
          {/* Phone gets Back, desktop gets Close; the stylesheet shows one. */}
          <button class="today-round-btn detail-back-btn" aria-label={`Back to ${backTo}`} onClick={close}>
            <ArrowLeftIcon />
          </button>
          <button class="today-round-btn detail-close-btn" aria-label="Close" onClick={close}>
            <CloseIcon />
          </button>
          <div class="detail-board-line">
            {board && <span class="detail-board-tile" aria-hidden="true" />}
            <span class="detail-board-name">
              {boardName} board
              {parent && (
                <>
                  {' · in '}
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm detail-parent-link"
                    onClick={() => selectItem(parent.id)}
                  >
                    {parent.title}
                  </button>
                </>
              )}
            </span>
          </div>
          <button
            class="today-round-btn detail-expand-btn"
            aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
            onClick={() => setExpanded(!expanded)}
          >
            <ExpandIcon collapsed={!expanded} />
          </button>
          <ItemMenu
            showMoveToBoard={showMoveToBoard}
            canCopy={!isSubtask}
            onMove={() => {
              showMoveToBoardModal.value = true;
            }}
            onCopy={handleCopy}
            onDelete={openDelete}
          />
        </div>

        <div class="detail-body">
          <EditableField
            label="Title"
            hideLabel
            value={item.title}
            onSave={(v) => save('title', v)}
            initialEditing={openDetailWithTitleEdit.value}
            onEditStart={() => {
              openDetailWithTitleEdit.value = false;
            }}
          />

          <EditableField
            label="Description"
            hideLabel
            value={item.description}
            onSave={(v) => save('description', v)}
            multiline
          />

          <StatusSwitch item={item} onMove={handleMoveStatus} />

          <DetailsCard item={item} save={save} token={token} boardName={boardName} showMoveToBoard={showMoveToBoard} />

          <section class="detail-card detail-subtasks" aria-labelledby="detail-subtasks-heading">
            <div class="detail-subtasks-header">
              <h3 id="detail-subtasks-heading">Subtasks</h3>
              <span class="detail-subtasks-count">
                {children.length === 0 ? 'None yet' : `${doneCount} of ${children.length} done`}
              </span>
            </div>
            {children.length > 0 && (
              <div
                class="subtask-progress"
                role="progressbar"
                aria-label="Subtasks done"
                aria-valuemin={0}
                aria-valuemax={children.length}
                aria-valuenow={doneCount}
              >
                <div class="subtask-progress-fill" style={{ width: `${(doneCount / children.length) * 100}%` }} />
              </div>
            )}
            <ul class="subtask-list">
              {children.map((child, idx) => (
                <SubtaskRow
                  key={child.id}
                  child={child}
                  idx={idx}
                  allItems={children}
                  isDone={isTerminalStatus(child.status)}
                  editingSubtaskId={editingSubtaskId}
                  editingSubtaskDraft={editingSubtaskDraft}
                  setEditingSubtaskDraft={setEditingSubtaskDraft}
                  commitSubtaskTitleEdit={commitSubtaskTitleEdit}
                  cancelSubtaskTitleEdit={cancelSubtaskTitleEdit}
                  startEditSubtaskTitle={startEditSubtaskTitle}
                  toggleChildStatus={toggleChildStatus}
                  handleSubtaskDateSave={handleSubtaskDateSave}
                  confirmingDelete={confirmingSubtaskId === child.id}
                  requestDeleteSubtask={requestDeleteSubtask}
                  cancelDeleteSubtask={cancelDeleteSubtask}
                  confirmDeleteSubtask={confirmDeleteSubtask}
                  handleReorder={handleReorder}
                  handleTouchReorderStart={handleTouchReorderStart}
                  handleTouchReorderMove={handleTouchReorderMove}
                  handleTouchReorderEnd={handleTouchReorderEnd}
                  token={token}
                  actor={actor}
                  item={item}
                />
              ))}
              <li class="subtask-add-li">
                <div class="subtask-add-wrapper" ref={subtaskRowRef} onFocusOut={handleAddRowFocusOut}>
                  <div class="subtask-add-inline">
                    <span class="subtask-add-plus" aria-hidden="true">
                      <PlusSmallIcon />
                    </span>
                    <input
                      ref={subtaskInputRef}
                      type="text"
                      class="subtask-add-input"
                      placeholder="Add a subtask"
                      aria-label="Add a subtask"
                      value={subtaskTitle}
                      onInput={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        subtaskTitleRef.current = v;
                        setSubtaskTitle(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submitAndContinue();
                        }
                        if (e.key === 'Escape') clearSubtaskDraft(e);
                      }}
                    />
                    <input
                      type="date"
                      class="subtask-add-date"
                      value={subtaskDueDate}
                      aria-label="Due date for new subtask"
                      onChange={(e) => setSubtaskDueDate((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') clearSubtaskDraft(e);
                      }}
                    />
                    <button
                      class="btn-icon subtask-action-btn subtask-add-confirm"
                      aria-label="Add subtask"
                      aria-disabled={!subtaskTitle.trim() ? 'true' : undefined}
                      onClick={() => {
                        if (subtaskTitle.trim()) {
                          submitAndContinue();
                        }
                      }}
                    >
                      <span>&#10003;</span>
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            {/* #88 AC5: Announce reorder to screen readers */}
            <div class="reorder-live-region" aria-live="polite" role="status">
              {reorderAnnouncement}
            </div>
          </section>

          <DetailFooter
            item={item}
            owners={owners.value}
            boardName={boardName}
            subtaskCount={children.length}
            confirming={confirmingDelete}
            onAsk={openDelete}
            onKeep={() => setConfirmingDelete(false)}
            onDelete={confirmDelete}
          />
        </div>
      </div>
    </div>
  );
}

function selectedParent(item: ItemWithRow): ItemWithRow | undefined {
  return allItems.value.find((i) => i.id === item.parent_id);
}

// --- Top bar menu: Move to board, Copy, Delete item ---

function ItemMenu({
  showMoveToBoard,
  canCopy,
  onMove,
  onCopy,
  onDelete,
}: {
  showMoveToBoard: boolean;
  canCopy: boolean;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t) && btnRef.current && !btnRef.current.contains(t)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The menu takes the Escape; the screen stays open.
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items || items.length === 0) return;
        const idx = Array.from(items).indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown') items[(idx + 1) % items.length].focus();
        else items[(idx - 1 + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div class="detail-menu">
      <button
        ref={btnRef}
        class="today-round-btn"
        aria-label="Item options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label="Item options" class="overflow-menu-dropdown">
          {showMoveToBoard && (
            <button role="menuitem" class="overflow-menu-item" onClick={choose(onMove)}>
              Move to board…
            </button>
          )}
          {canCopy && (
            <button role="menuitem" class="overflow-menu-item" onClick={choose(onCopy)}>
              Copy
            </button>
          )}
          <button role="menuitem" class="overflow-menu-item" onClick={choose(onDelete)}>
            Delete item…
          </button>
        </div>
      )}
    </div>
  );
}

// --- Status: a switch with one segment per board column (replaces the arrow strip) ---

function StatusSwitch({ item, onMove }: { item: ItemWithRow; onMove: (status: ItemStatus) => Promise<boolean> }) {
  const columns = boardStatuses.value;
  const groupRef = useRef<HTMLDivElement>(null);
  const activeIdx = columns.findIndex((s) => s.name === item.status);

  // More columns than fit scroll sideways; the selected one comes into view.
  useEffect(() => {
    const on = groupRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    on?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [item.id]);

  const onKeyDown = (e: KeyboardEvent) => {
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !back) return;
    e.preventDefault();
    const from = activeIdx < 0 ? 0 : activeIdx;
    const next = (from + (forward ? 1 : -1) + columns.length) % columns.length;
    onMove(columns[next].name as ItemStatus);
    groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={groupRef}
      class={`status-switch${columns.length > 4 ? ' status-switch-scroll' : ''}`}
      role="radiogroup"
      aria-label="Column"
      onKeyDown={onKeyDown}
    >
      {columns.map((s, i) => {
        const isActive = s.name === item.status;
        return (
          <button
            key={s.id}
            type="button"
            class={`status-segment${isActive ? ' status-segment-on' : ''}`}
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive || (activeIdx < 0 && i === 0) ? 0 : -1}
            onClick={() => onMove(s.name as ItemStatus)}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

// --- Details card: Due, Labels, Completed, Board ---

function DetailsCard({
  item,
  save,
  token,
  boardName,
  showMoveToBoard,
}: {
  item: ItemWithRow;
  save: (field: string, value: string) => Promise<boolean>;
  token: string | null;
  boardName: string;
  showMoveToBoard: boolean;
}) {
  const [feedback, setFeedback] = useState<'saved' | 'error' | 'future' | null>(null);
  const hiddenDateRef = useRef<HTMLInputElement>(null);
  const completedDateRef = useRef<HTMLInputElement>(null);

  const onSaved = (ok: boolean) => {
    setFeedback(ok ? 'saved' : 'error');
    setTimeout(() => setFeedback(null), 2000);
  };

  // #280: completed date, editable while the item sits in a terminal column
  const showCompleted = isTerminalStatus(item.status) && !!item.completed_at && !!localYmdOf(item.completed_at);
  const completedYmd = showCompleted ? localYmdOf(item.completed_at) : '';
  const completedFull = showCompleted
    ? new Date(item.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const onCompletedChange = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const picked = input.value;
    const revert = () => {
      input.value = completedYmd;
    };
    if (!picked) {
      revert();
      return;
    }
    if (isFutureLocalDate(picked)) {
      revert();
      setFeedback('future');
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    if (picked === completedYmd) return;
    const next = withLocalDate(item.completed_at, picked);
    if (!next) {
      revert();
      return;
    }
    const wasInWindow = !isOutsideDoneWindow(item.completed_at);
    const ok = await save('completed_at', next);
    onSaved(ok);
    if (!ok) {
      revert();
      return;
    }
    if (wasInWindow && isOutsideDoneWindow(next)) {
      showToast(`${item.title} moved to the archive`, 'success');
    }
  };

  // --- Due ---
  const dateVal = item.due_date ? item.due_date.split('T')[0] : '';
  const today = toLocalYmd(new Date());
  const quick = [
    { word: 'Today', ymd: today },
    { word: 'Tomorrow', ymd: addLocalDays(today, 1) },
    { word: 'Next week', ymd: addLocalDays(mondayOfLocal(today), 7) },
    { word: 'No date', ymd: '' },
  ];
  const matched = quick.find((q) => q.ymd === dateVal);
  const overdue = isOverdue(dateVal, item.status);
  const dueWords = !dateVal
    ? 'No date'
    : dateVal === today
      ? 'Today'
      : dateVal === addLocalDays(today, 1)
        ? `${dayLong(dateVal)} · tomorrow`
        : overdue
          ? `${monthDay(dateVal)} · overdue`
          : dayLong(dateVal);

  // --- Labels ---
  const appliedLabels = item.labels
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <section class="detail-card detail-details" aria-label="Details">
      {feedback === 'saved' && (
        <span class="save-indicator save-indicator-success owner-date-feedback" data-testid="save-indicator">
          Saved
        </span>
      )}
      {feedback === 'error' && (
        <span class="save-indicator save-indicator-error owner-date-feedback" data-testid="save-indicator-error">
          Error
        </span>
      )}
      {feedback === 'future' && (
        <span
          class="save-indicator save-indicator-error owner-date-feedback"
          data-testid="save-indicator-error"
          role="alert"
        >
          Completed date can't be in the future
        </span>
      )}

      <div class="detail-row" role="group" aria-labelledby="detail-due-label">
        <div class="detail-row-head">
          <span id="detail-due-label" class="detail-row-label">
            Due
          </span>
          <span class={`detail-row-value${overdue && dateVal !== today ? ' detail-row-value-overdue' : ''}`}>
            {dueWords}
          </span>
        </div>
        <div class="detail-chip-row">
          {quick.map((q) => (
            <button
              key={q.word}
              type="button"
              class={`filter-chip${matched?.word === q.word ? ' filter-chip-active' : ''}`}
              aria-pressed={matched?.word === q.word}
              onClick={async () => onSaved(await save('due_date', q.ymd))}
            >
              {q.word}
            </button>
          ))}
          <button
            type="button"
            class={`filter-chip${dateVal && !matched ? ' filter-chip-active' : ''}`}
            aria-pressed={!!dateVal && !matched}
            onClick={() => hiddenDateRef.current?.showPicker?.()}
          >
            <CalendarIcon />
            Pick a date
          </button>
          <input
            ref={hiddenDateRef}
            type="date"
            class="due-date-hidden"
            tabIndex={-1}
            aria-hidden="true"
            aria-label="Due date"
            value={dateVal}
            onChange={async (e) => onSaved(await save('due_date', (e.target as HTMLInputElement).value))}
          />
        </div>
      </div>

      <div class="detail-row" role="group" aria-labelledby="detail-labels-label">
        <div class="detail-row-head">
          <span id="detail-labels-label" class="detail-row-label">
            Labels
          </span>
          <span class="detail-row-value">{appliedLabels.length > 0 ? appliedLabels.join(', ') : 'None'}</span>
        </div>
        <SaveFeedbackField label="Labels" hideLabel>
          {(onFieldSaved) => (
            <LabelPickerManager
              currentLabels={item.labels}
              onToggle={async (labelName) => {
                const isActive = appliedLabels.includes(labelName);
                const updated = isActive ? appliedLabels.filter((x) => x !== labelName) : [...appliedLabels, labelName];
                const ok = await save('labels', updated.join(', '));
                onFieldSaved(ok);
              }}
              token={token!}
            />
          )}
        </SaveFeedbackField>
      </div>

      {showCompleted && (
        <div class="detail-row detail-row-inline">
          <span class="detail-row-label">Completed</span>
          <div class="due-date-group completed-date-group">
            <button
              type="button"
              class="completed-date-btn"
              data-testid="completed-date-btn"
              aria-label={`Completed ${completedFull}. Change completed date`}
              onClick={() => completedDateRef.current?.showPicker?.()}
            >
              <CheckIcon />
              <span class="date-info">
                <span class="date-text">{completedFull}</span>
                <span class="date-relative">{completedRelativeLabel(completedYmd)}</span>
              </span>
            </button>
            <input
              ref={completedDateRef}
              type="date"
              class="due-date-hidden"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="completed-date-input"
              value={completedYmd}
              max={toLocalYmd(new Date())}
              onChange={onCompletedChange}
            />
          </div>
        </div>
      )}

      {showMoveToBoard && (
        <div class="detail-row detail-row-inline">
          <span class="detail-row-label">Board</span>
          <button
            type="button"
            class="detail-row-btn"
            aria-label={`Board: ${boardName}. Move to board`}
            onClick={() => {
              showMoveToBoardModal.value = true;
            }}
          >
            {boardName}
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </section>
  );
}

// --- Footer: who added it, and Delete item with its in-place confirm ---

function DetailFooter({
  item,
  owners: ownersList,
  boardName,
  subtaskCount,
  confirming,
  onAsk,
  onKeep,
  onDelete,
}: {
  item: ItemWithRow;
  owners: Array<{ name: string; google_account: string }>;
  boardName: string;
  subtaskCount: number;
  confirming: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onDelete: () => void;
}) {
  const askRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Focus goes to the safe choice when the confirm opens, and back to Delete item when it closes.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) askRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const today = toLocalYmd(new Date());
  const when = (iso: string): string => {
    const ymd = localYmdOf(iso);
    if (!ymd) return '';
    if (ymd === today) return 'today';
    if (ymd === addLocalDays(today, -1)) return 'yesterday';
    return ymd.slice(0, 4) === today.slice(0, 4) ? monthDay(ymd) : `${monthDay(ymd)}, ${ymd.slice(0, 4)}`;
  };
  const createdBy = item.created_by
    ? (ownersList.find((o) => o.google_account === item.created_by)?.name ?? item.created_by)
    : 'Unknown';
  const added = when(item.created_at);
  const changed = localYmdOf(item.updated_at) !== localYmdOf(item.created_at) ? when(item.updated_at) : '';
  const meta = `Added by ${createdBy}${added ? ` on ${added}` : ''}${changed ? ` · changed ${changed}` : ''}`;

  const title = item.title.trim();
  const goes =
    subtaskCount > 0 ? `, and its ${subtaskCount} ${subtaskCount === 1 ? 'subtask goes' : 'subtasks go'} with it` : '';

  return (
    <footer class="detail-footer">
      <p class="detail-meta">{meta}</p>
      {confirming ? (
        <div
          class="detail-delete-confirm"
          role="group"
          aria-label="Confirm deleting item"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onKeep();
            }
          }}
        >
          <p class="detail-delete-confirm-title">
            <TrashIcon />
            {title ? `Delete “${item.title}”?` : 'Delete this item?'}
          </p>
          <p class="detail-delete-confirm-message">
            It comes off the {boardName} board for everyone who shares it{goes}.
          </p>
          <div class="detail-delete-confirm-actions">
            <button ref={keepRef} type="button" class="btn btn-ghost" onClick={onKeep}>
              Keep it
            </button>
            <button type="button" class="btn btn-danger" onClick={onDelete}>
              Delete item
            </button>
          </div>
        </div>
      ) : (
        <button ref={askRef} type="button" class="detail-delete-btn" onClick={onAsk}>
          <TrashIcon />
          Delete item
        </button>
      )}
    </footer>
  );
}

// --- Save feedback wrapper for non-editable fields (selects, dates, labels) ---

function SaveFeedbackField({
  label,
  children,
  hideLabel,
}: {
  label: string;
  children: (onFieldSaved: (success: boolean) => void) => any;
  hideLabel?: boolean;
}) {
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);

  const onFieldSaved = (success: boolean) => {
    setFeedback(success ? 'saved' : 'error');
    setTimeout(() => setFeedback(null), 2000);
  };

  return (
    <div class="detail-field">
      {!hideLabel && (
        <label>
          {label}
          {feedback === 'saved' && (
            <span class="save-indicator save-indicator-success" data-testid="save-indicator">
              Saved
            </span>
          )}
          {feedback === 'error' && (
            <span class="save-indicator save-indicator-error" data-testid="save-indicator-error">
              Error
            </span>
          )}
        </label>
      )}
      {hideLabel && feedback === 'saved' && (
        <span class="save-indicator save-indicator-success" data-testid="save-indicator">
          Saved
        </span>
      )}
      {hideLabel && feedback === 'error' && (
        <span class="save-indicator save-indicator-error" data-testid="save-indicator-error">
          Error
        </span>
      )}
      {children(onFieldSaved)}
    </div>
  );
}

// --- Inline editable field ---

function EditableField({
  label,
  hideLabel,
  value,
  onSave,
  multiline,
  initialEditing,
  onEditStart,
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  onSave: (value: string) => Promise<boolean>;
  multiline?: boolean;
  /** When true, the field starts in edit mode on mount. */
  initialEditing?: boolean;
  /** Called once when initialEditing triggers edit mode. */
  onEditStart?: () => void;
}) {
  const [editing, setEditing] = useState(!!initialEditing);
  const [draft, setDraft] = useState(initialEditing ? value : value);
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);

  // Clear the signal after consuming it
  if (initialEditing && onEditStart) {
    onEditStart();
  }

  const commit = async () => {
    setEditing(false);
    if (draft !== value) {
      const ok = await onSave(draft);
      if (ok) {
        setFeedback('saved');
      } else {
        setFeedback('error');
        setDraft(value); // revert draft on error
      }
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        class={`detail-field${hideLabel ? ' detail-field-no-label' : ''}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {!hideLabel && (
          <label>
            {label}
            {feedback === 'saved' && (
              <span class="save-indicator save-indicator-success" data-testid="save-indicator">
                Saved
              </span>
            )}
            {feedback === 'error' && (
              <span class="save-indicator save-indicator-error" data-testid="save-indicator-error">
                Error
              </span>
            )}
          </label>
        )}
        {hideLabel && feedback === 'saved' && (
          <span class="save-indicator save-indicator-success" data-testid="save-indicator">
            Saved
          </span>
        )}
        {hideLabel && feedback === 'error' && (
          <span class="save-indicator save-indicator-error" data-testid="save-indicator-error">
            Error
          </span>
        )}
        <div
          class={`editable-value${hideLabel ? (multiline ? ' editable-value-desc' : ' editable-value-title') : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${label.toLowerCase()}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDraft(value);
              setEditing(true);
            }
          }}
        >
          {value || (
            <span class="placeholder">{hideLabel && multiline ? 'Add a description...' : 'Click to edit'}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class={`detail-field${hideLabel ? ' detail-field-no-label' : ''}`}>
      {!hideLabel && <label>{label}</label>}
      {multiline ? (
        <textarea
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            }
          }}
          autoFocus
          rows={4}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            }
          }}
          autoFocus
        />
      )}
    </div>
  );
}

// --- Subtask date display + inline editing (#86) ---

function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

function formatCompactDate(dateStr: string): string {
  try {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function isOverdue(dateStr: string, status: string): boolean {
  if (!dateStr || isTerminalStatus(status)) return false;
  return parseLocalDate(dateStr) < new Date(new Date().toDateString());
}

// #220: Subtask inline date — launches native picker directly (single click)
function SubtaskDateInline({
  child,
  onSave,
}: {
  child: ItemWithRow;
  onSave: (childId: string, field: 'due_date', value: string) => void;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  const hasDue = !!child.due_date;
  const dueOverdue = isOverdue(child.due_date, child.status);
  const isDone = isTerminalStatus(child.status);
  const dateVal = child.due_date ? child.due_date.split('T')[0] : '';

  const openPicker = (e: Event) => {
    e.stopPropagation();
    hiddenRef.current?.showPicker();
  };

  return (
    <div class="subtask-date-wrapper">
      <input
        ref={hiddenRef}
        type="date"
        class="due-date-hidden"
        tabIndex={-1}
        aria-hidden="true"
        value={dateVal}
        aria-label={`Due date for ${child.title}`}
        onChange={(e) => onSave(child.id, 'due_date', (e.target as HTMLInputElement).value)}
      />
      {hasDue ? (
        <button
          class={`subtask-date-inline${dueOverdue ? ' overdue' : ''}${isDone ? ' done' : ''}`}
          title={`Due: ${formatCompactDate(child.due_date)}. Tap to change.`}
          onClick={openPicker}
        >
          <span class="subtask-date-pill">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formatCompactDate(child.due_date)}
          </span>
        </button>
      ) : (
        <button class="subtask-date-add-inline" aria-label={`Add due date for ${child.title}`} onClick={openPicker}>
          <span class="subtask-date-pill">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Add date
          </span>
        </button>
      )}
    </div>
  );
}

// #220: SubtaskRow component — handles checkbox, title, date, actions, context menu
function SubtaskRow({
  child,
  idx,
  allItems,
  isDone,
  editingSubtaskId,
  editingSubtaskDraft,
  setEditingSubtaskDraft,
  commitSubtaskTitleEdit,
  cancelSubtaskTitleEdit,
  startEditSubtaskTitle,
  toggleChildStatus,
  handleSubtaskDateSave,
  confirmingDelete,
  requestDeleteSubtask,
  cancelDeleteSubtask,
  confirmDeleteSubtask,
  handleReorder,
  handleTouchReorderStart,
  handleTouchReorderMove,
  handleTouchReorderEnd,
  token,
  actor,
  item,
}: {
  child: ItemWithRow;
  idx: number;
  allItems: ItemWithRow[];
  isDone: boolean;
  editingSubtaskId: string | null;
  editingSubtaskDraft: string;
  setEditingSubtaskDraft: (v: string) => void;
  commitSubtaskTitleEdit: (childId: string) => void;
  cancelSubtaskTitleEdit: () => void;
  startEditSubtaskTitle: (childId: string, title: string) => void;
  toggleChildStatus: (childId: string, status: any) => void;
  handleSubtaskDateSave: (childId: string, field: 'due_date', value: string) => void;
  confirmingDelete: boolean;
  requestDeleteSubtask: (childId: string) => void;
  cancelDeleteSubtask: () => void;
  confirmDeleteSubtask: (childId: string) => void;
  handleReorder: (childId: string, dir: 'up' | 'down') => void;
  handleTouchReorderStart: (childId: string, idx: number, e: TouchEvent) => void;
  handleTouchReorderMove: (e: TouchEvent) => void;
  handleTouchReorderEnd: () => void;
  token: string | null;
  actor: string;
  item: ItemWithRow;
}) {
  const [contextMenu, setContextMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // #448: focus lands on Cancel, the safe choice, when the confirm opens
  useEffect(() => {
    if (confirmingDelete) cancelBtnRef.current?.focus();
  }, [confirmingDelete]);

  const cancelConfirm = () => {
    cancelDeleteSubtask();
    requestAnimationFrame(() => kebabRef.current?.focus());
  };

  // Long-press handler for touch
  const handleTouchStartLongPress = (e: TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu(true);
    }, 500);
  };

  const handleTouchEndLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Cancel long-press on touch move (prevents conflict with drag reorder)
  const handleTouchMoveLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenuEvent = (e: Event) => {
    e.preventDefault();
    setContextMenu(true);
  };

  // Close context menu on outside click/touch (focusOut unreliable on mobile)
  useEffect(() => {
    if (!contextMenu) return;
    const handleOutside = (e: Event) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [contextMenu]);

  const handlePromoteToItem = async () => {
    if (!token) return;
    const newItem: Record<string, string> = {
      title: child.title,
      description: '',
      owner: child.owner || '',
      created_by: item.created_by || '',
    };
    if (child.due_date) newItem.due_date = child.due_date;
    await createItem(newItem, actor, token);
    await deleteSubtask(child.id, actor, token);
    setContextMenu(false);
  };

  // Auto-resize textarea
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = '0';
    el.style.height = el.scrollHeight + 'px';
  };

  // #448: the confirm replaces the whole row, so the only things to tap are its two buttons
  if (confirmingDelete) {
    const title = child.title.trim();
    return (
      <li key={child.id} class="subtask-item subtask-item-confirming">
        <div
          class="subtask-delete-confirm"
          role="group"
          aria-label="Confirm deleting sub-task"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancelConfirm();
            }
          }}
        >
          <p class="subtask-delete-confirm-title">
            {title ? `Delete sub-task "${child.title}"?` : 'Delete this sub-task?'}
          </p>
          <p class="subtask-delete-confirm-message">This cannot be undone.</p>
          <div class="subtask-delete-confirm-actions">
            <button ref={cancelBtnRef} class="btn btn-ghost" onClick={cancelConfirm}>
              Cancel
            </button>
            <button class="btn btn-danger" onClick={() => confirmDeleteSubtask(child.id)}>
              Delete sub-task
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      key={child.id}
      class={`subtask-item${isDone ? ' subtask-done' : ''}`}
      style={{ position: 'relative' }}
      onDragOver={(e) => {
        e.preventDefault();
        (e as DragEvent).dataTransfer!.dropEffect = 'move';
        (e.currentTarget as HTMLElement).classList.add('subtask-drop-target');
      }}
      onDragLeave={(e) => {
        (e.currentTarget as HTMLElement).classList.remove('subtask-drop-target');
      }}
      onDrop={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove('subtask-drop-target');
        const draggedId = (e as DragEvent).dataTransfer!.getData('text/plain');
        if (draggedId && draggedId !== child.id) {
          const fromIdx = allItems.findIndex((i) => i.id === draggedId);
          if (fromIdx !== -1) {
            const dir = fromIdx < idx ? 'down' : 'up';
            const steps = Math.abs(fromIdx - idx);
            for (let s = 0; s < steps; s++) handleReorder(draggedId, dir);
          }
        }
      }}
      onContextMenu={handleContextMenuEvent}
      onTouchStart={(e) => handleTouchStartLongPress(e as unknown as TouchEvent)}
      onTouchMove={(e) => {
        handleTouchMoveLongPress();
        handleTouchReorderMove(e as unknown as TouchEvent);
      }}
      onTouchEnd={() => {
        handleTouchEndLongPress();
        handleTouchReorderEnd();
      }}
      onTouchCancel={() => {
        handleTouchEndLongPress();
        handleTouchReorderEnd();
      }}
    >
      {/* #627: round check, named for what pressing it does */}
      <button
        class="check-icon"
        onClick={() => toggleChildStatus(child.id, child.status)}
        aria-label={`${isDone ? 'Mark not done' : 'Mark done'}: ${child.title}`}
      >
        <span class={`check-box${isTerminalStatus(child.status) ? ' checked' : ''}`}>
          {isTerminalStatus(child.status) && (
            <svg viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      </button>

      {/* Content column: title + date */}
      <div class="subtask-content">
        {editingSubtaskId === child.id ? (
          <textarea
            class="subtask-title-input"
            value={editingSubtaskDraft}
            aria-label="Edit sub-task title"
            autoFocus
            rows={1}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              setEditingSubtaskDraft(el.value);
              autoResize(el);
            }}
            onBlur={() => commitSubtaskTitleEdit(child.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSubtaskTitleEdit(child.id);
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                cancelSubtaskTitleEdit();
              }
            }}
            ref={(el) => {
              if (el) requestAnimationFrame(() => autoResize(el));
            }}
          />
        ) : (
          <span
            class="subtask-title"
            role="button"
            tabIndex={0}
            aria-label={`Edit sub-task: ${child.title}`}
            onClick={() => startEditSubtaskTitle(child.id, child.title)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startEditSubtaskTitle(child.id, child.title);
              }
            }}
          >
            {child.title}
          </span>
        )}
        <SubtaskDateInline child={child} onSave={handleSubtaskDateSave} />
      </div>

      {/* #237: Grab handle — sole drag/reorder initiator, keeps rest of row scrollable/tappable.
          Not a real button: it isn't keyboard-operable (no keyboard reorder yet), so it's
          hidden from assistive tech rather than exposed as a control that does nothing on activation. */}
      <span
        class="subtask-handle"
        aria-hidden="true"
        draggable={allItems.length > 1}
        onDragStart={(e) => {
          (e as DragEvent).dataTransfer!.effectAllowed = 'move';
          (e as DragEvent).dataTransfer!.setData('text/plain', child.id);
          (e.currentTarget as HTMLElement).closest('.subtask-item')?.classList.add('subtask-dragging');
        }}
        onDragEnd={(e) => {
          (e.currentTarget as HTMLElement).closest('.subtask-item')?.classList.remove('subtask-dragging');
          document.querySelectorAll('.subtask-drop-target').forEach((el) => el.classList.remove('subtask-drop-target'));
        }}
        onTouchStart={(e) => {
          if (allItems.length > 1) handleTouchReorderStart(child.id, idx, e as unknown as TouchEvent);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.3" />
          <circle cx="11" cy="3" r="1.3" />
          <circle cx="5" cy="8" r="1.3" />
          <circle cx="11" cy="8" r="1.3" />
          <circle cx="5" cy="13" r="1.3" />
          <circle cx="11" cy="13" r="1.3" />
        </svg>
      </span>

      {/* Kebab menu (always visible) */}
      <button
        ref={kebabRef}
        class="subtask-kebab-btn"
        aria-label="Sub-task options"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setContextMenu(!contextMenu);
        }}
      >
        &#8942;
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div ref={contextRef} class="subtask-context-menu">
          <button class="subtask-menu-item" onClick={handlePromoteToItem}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M7 17l9.2-9.2M17 17V7H7" />
            </svg>
            Turn into item
          </button>
          <button
            class="subtask-menu-item danger"
            onClick={() => {
              requestDeleteSubtask(child.id);
              setContextMenu(false);
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
