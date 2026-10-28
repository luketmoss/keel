// #667 — #531's More actions menu, generalised: a round three-dot (or other) button and its menu,
// used for the top bar's More actions and for each exercise's options. The keys are #531's: opening
// takes focus to the first item, arrows/Home/End move, Escape and Tab close and return focus to the
// button, and a press outside closes it.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DotsIcon } from '../activities/detail-icons';

export interface MenuItem {
  key: string;
  label: string;
  icon?: ComponentChildren;
  onSelect: () => void;
  /** The destructive item: its word in the danger colour, set off by a hairline when it follows others. */
  danger?: boolean;
  /** At an end of its list: focusable, announced as disabled, and does nothing. */
  ariaDisabled?: boolean;
  /** Extra attributes on the item (`data-move`). */
  attrs?: Record<string, string>;
}

export function ActionMenu({
  label,
  items,
  disabled = false,
  triggerAttrs,
}: {
  /** The trigger's name, and the menu's: "More actions", "Barbell Row options". */
  label: string;
  items: MenuItem[];
  disabled?: boolean;
  /** Extra attributes on the trigger (`data-options-btn`). */
  triggerAttrs?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const entries = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (open) entries()[0]?.focus();
  }, [open]);

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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const list = entries();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (e.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close(true);
      return;
    } else return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div class="detail-menu-wrap" ref={wrap}>
      <button
        type="button"
        ref={trigger}
        class="detail-icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-disabled={disabled ? 'true' : undefined}
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open && !disabled) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        {...triggerAttrs}
      >
        <DotsIcon />
      </button>
      {open && (
        <div class="detail-menu" role="menu" aria-label={label} ref={menu} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              class={`detail-menu-item${item.danger ? ' detail-menu-delete' : ''}`}
              tabIndex={-1}
              aria-disabled={item.ariaDisabled ? 'true' : undefined}
              onClick={() => {
                if (item.ariaDisabled) return;
                // Focus goes back to the button before the action runs, so a confirm that
                // follows hands focus back to a control that is still on the screen.
                close(true);
                item.onSelect();
              }}
              {...item.attrs}
            >
              <span class="lb-menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
