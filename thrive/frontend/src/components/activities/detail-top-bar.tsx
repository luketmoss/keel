// The activity detail screen's top bar (#531): Back on the left, Edit and a
// More actions menu on the right. The menu holds what used to be the Copy and
// Save Template buttons and the bottom Delete button.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ChevronLeftIcon, PencilIcon, DotsIcon, CopyIcon, BookmarkIcon, TrashIcon } from './detail-icons';

interface Props {
  /** Copy workout: a completed weight workout (today's Copy rule). */
  canCopy: boolean;
  /** Save as template: as Copy, and it has exercises (today's Save Template rule). */
  canSaveTemplate: boolean;
  /** A delete is in flight: More actions is disabled, as the Delete button was. */
  deleting: boolean;
  onBack: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onSaveTemplate: () => void;
  onDelete: () => void;
}

export function DetailTopBar({
  canCopy,
  canSaveTemplate,
  deleting,
  onBack,
  onEdit,
  onCopy,
  onSaveTemplate,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  // Opening takes focus to the first item.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  // A press anywhere outside the button and its menu closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (e.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      // Tab closes the menu and leaves focus on More actions, as Escape does.
      e.preventDefault();
      close(true);
      return;
    } else return;
    e.preventDefault();
    list[next]?.focus();
  };

  // Focus returns to More actions before the action runs, so a confirm that
  // follows (Delete) hands focus back to a button that is still on the screen.
  const run = (action: () => void) => () => {
    close(true);
    action();
  };

  return (
    <div class="detail-top-bar">
      <button type="button" class="detail-icon-btn" aria-label="Back" onClick={onBack}>
        <ChevronLeftIcon />
      </button>
      <div class="detail-top-actions">
        <button
          type="button"
          class="detail-icon-btn"
          aria-label="Edit workout"
          data-focus-key="workout-edit"
          onClick={onEdit}
        >
          <PencilIcon />
        </button>
        <div class="detail-menu-wrap" ref={wrap}>
          <button
            type="button"
            ref={trigger}
            class="detail-icon-btn"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={open ? 'true' : 'false'}
            aria-disabled={deleting ? 'true' : undefined}
            onClick={() => {
              if (!deleting) setOpen(!open);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && !open && !deleting) {
                e.preventDefault();
                setOpen(true);
              }
            }}
          >
            <DotsIcon />
          </button>
          {open && (
            <div class="detail-menu" role="menu" aria-label="More actions" ref={menu} onKeyDown={onMenuKeyDown}>
              {canCopy && (
                <button type="button" role="menuitem" class="detail-menu-item" tabIndex={-1} onClick={run(onCopy)}>
                  <CopyIcon />
                  <span>Copy workout</span>
                </button>
              )}
              {canSaveTemplate && (
                <button
                  type="button"
                  role="menuitem"
                  class="detail-menu-item"
                  tabIndex={-1}
                  onClick={run(onSaveTemplate)}
                >
                  <BookmarkIcon />
                  <span>Save as template</span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                class="detail-menu-item detail-menu-delete"
                tabIndex={-1}
                onClick={run(onDelete)}
              >
                <TrashIcon />
                <span>Delete workout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
