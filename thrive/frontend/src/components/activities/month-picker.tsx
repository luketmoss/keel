// The Activities month button and its picker (#527). The button names the
// chosen month; it opens a listbox of the current month and every earlier month
// with a completed activity, newest first, each with its count.
//
// Up and Down move, Enter or a tap chooses. Escape, a tap outside or choosing
// closes the list, and focus always goes back to the button.

import { useEffect, useRef, useState } from 'preact/hooks';
import { monthYearLabel, type MonthOption } from './activities-helpers';

interface Props {
  value: string;
  options: MonthOption[];
  onChoose: (ym: string) => void;
}

export function MonthPicker({ value, options, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const items = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];

  // The chosen month may be one the options no longer list (its last activity was deleted): keep it shown.
  const shown = options.some((o) => o.ym === value) ? options : [...options, { ym: value, count: 0 }];

  useEffect(() => {
    if (!open) return;
    const at = shown.findIndex((o) => o.ym === value);
    items()[Math.max(0, at)]?.focus();
    // Only on opening: a choice closes the list, so nothing changes under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A press anywhere outside the button and the list closes it, and focus returns to the button.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-month-picker]')) return;
      setOpen(false);
      // After the press has moved focus where it is going.
      setTimeout(() => button.current?.focus(), 0);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (e.key === 'ArrowDown') next = (at + 1) % all.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      // Focus moves on by itself; the list has only to go.
      close(false);
      return;
    } else return;
    e.preventDefault();
    all[next]?.focus();
  };

  const label = monthYearLabel(value);

  return (
    <div class="month-picker" data-month-picker>
      <button
        type="button"
        ref={button}
        class="trends-chip month-button"
        aria-label={`Choose month, ${label}`}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{label}</span>
        <svg class="month-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          class="trends-menu trends-menu-start month-list"
          role="listbox"
          aria-label="Month"
          ref={list}
          onKeyDown={onKeyDown}
        >
          {shown.map((o) => {
            const selected = o.ym === value;
            return (
              <button
                key={o.ym}
                type="button"
                role="option"
                class={`trends-menu-item month-option${selected ? ' current' : ''}`}
                aria-selected={selected ? 'true' : 'false'}
                aria-checked={selected ? 'true' : 'false'}
                tabIndex={-1}
                onClick={() => {
                  onChoose(o.ym);
                  close(true);
                }}
              >
                <span class="month-option-label">
                  <span class="trends-menu-tick" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                  {monthYearLabel(o.ym)}
                </span>
                <span class="month-option-count">{o.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
