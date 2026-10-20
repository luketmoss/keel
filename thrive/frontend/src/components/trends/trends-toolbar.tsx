// The Trends toolbar (#503): a range chip, an average chip and a Chart/Table
// switch on the heading's row. Each chip opens a small menu of its values; the
// choice itself (and where it is remembered) stays with the screen.
//
// Only one menu is open at a time. A menu closes on a choice, a press outside
// it, Escape and Tab, and the choice or Escape hands focus back to the chip.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { RANGES, AVERAGES, VIEWS, RANGE_PHRASE, type RangeKey, type AverageKey, type ViewKey } from './series';
import { CalendarIcon, WaveIcon, ChartLineIcon, TableIcon } from '../shared/icons';

type MenuId = 'range' | 'average';

/** "last 3 months" -> "Last 3 months": the menu says what the chart's own label says. */
export const rangeItemLabel = (r: RangeKey) => RANGE_PHRASE[r][0].toUpperCase() + RANGE_PHRASE[r].slice(1);
export const averageItemLabel = (a: AverageKey) => (a === 'Off' ? 'No average' : `${parseInt(a, 10)}-day average`);
/** The average chip's name: "7-day", or "off". */
const averageName = (a: AverageKey) => (a === 'Off' ? 'off' : `${parseInt(a, 10)}-day`);

interface MenuProps<T extends string> {
  id: MenuId;
  /** The chip's accessible name, e.g. `Range: 3M`. */
  name: string;
  icon: ComponentChildren;
  /** The chip's visible text, which its name contains. */
  text: string;
  options: readonly T[];
  value: T;
  label: (o: T) => string;
  open: boolean;
  onToggle: (open: boolean) => void;
  onChoose: (o: T) => void;
  /** The menu hangs from the chip's left or right edge. */
  align: 'start' | 'end';
  /** The average chip tints when a value is chosen; the range chip never does. */
  tinted?: boolean;
}

function ChipMenu<T extends string>({
  id,
  name,
  icon,
  text,
  options,
  value,
  label,
  open,
  onToggle,
  onChoose,
  align,
  tinted,
}: MenuProps<T>) {
  const chip = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Which item takes focus when the menu opens: the current one.
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    const list = items();
    list[Math.max(0, options.indexOf(value))]?.focus();
    // Only on opening: a choice closes the menu, so value never changes under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus: boolean) => {
    onToggle(false);
    if (refocus) chip.current?.focus();
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
      // Focus moves on by itself; the menu has only to go.
      close(false);
      return;
    } else return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div class="trends-menu-wrap" data-menu={id}>
      <button
        type="button"
        ref={chip}
        class={`trends-chip${open ? ' open' : ''}${tinted ? ' on' : ''}`}
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => onToggle(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            onToggle(true);
          }
        }}
      >
        {icon}
        <span class="trends-chip-text">{text}</span>
      </button>
      {open && (
        <div
          class={`trends-menu trends-menu-${align}`}
          role="menu"
          aria-label={id === 'range' ? 'Range' : 'Average'}
          ref={menu}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="menuitemradio"
              class={`trends-menu-item${o === value ? ' current' : ''}`}
              aria-checked={o === value ? 'true' : 'false'}
              tabIndex={-1}
              onClick={() => {
                onChoose(o);
                close(true);
              }}
            >
              <span class="trends-menu-label">{label(o)}</span>
              <span class="trends-menu-tick" aria-hidden="true">
                {o === value ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolbarProps {
  range: RangeKey;
  average: AverageKey;
  view: ViewKey;
  onRange: (r: RangeKey) => void;
  onAverage: (a: AverageKey) => void;
  onView: (v: ViewKey) => void;
}

export function TrendsToolbar({ range, average, view, onRange, onAverage, onView }: ToolbarProps) {
  const [open, setOpen] = useState<MenuId | null>(null);

  // A press anywhere but inside the open menu's own chip and list closes it. The
  // group tabs, the view switch and the other chip are all "elsewhere".
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      const inside = (e.target as Element | null)?.closest?.('[data-menu]');
      if (inside?.getAttribute('data-menu') !== open) setOpen(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const toggle = (id: MenuId) => (on: boolean) => setOpen(on ? id : null);

  return (
    <div class="trends-toolbar">
      <ChipMenu
        id="range"
        name={`Range: ${range}`}
        icon={<CalendarIcon />}
        text={range}
        options={RANGES}
        value={range}
        label={rangeItemLabel}
        open={open === 'range'}
        onToggle={toggle('range')}
        onChoose={onRange}
        align="start"
      />
      <ChipMenu
        id="average"
        name={`Average: ${averageName(average)}`}
        icon={<WaveIcon />}
        text={average}
        options={AVERAGES}
        value={average}
        label={averageItemLabel}
        open={open === 'average'}
        onToggle={toggle('average')}
        onChoose={onAverage}
        align="end"
        tinted={average !== 'Off'}
      />
      <div class="trends-view-switch" role="group" aria-label="View">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            class={`trends-view-btn${v === view ? ' active' : ''}`}
            aria-label={v}
            aria-pressed={v === view ? 'true' : 'false'}
            onClick={() => {
              setOpen(null);
              onView(v);
            }}
          >
            {v === 'Chart' ? <ChartLineIcon /> : <TableIcon />}
          </button>
        ))}
      </div>
    </div>
  );
}
