import { useState, useRef, useEffect } from 'preact/hooks';
import type { SortMode } from '../../state/board-store';
import { SortIcon } from '../today/today-icons';

export const SORT_LABELS: Record<SortMode, string> = {
  custom: 'Custom',
  due_date: 'Due date',
  created: 'Created',
};

interface Props {
  /** The column's name, for the accessible name and test ids. */
  status: string;
  mode: SortMode;
  onChange: (mode: SortMode) => void;
  /** `icon` is the column header's button; `row` is the phone's, which also names the current mode. */
  variant?: 'icon' | 'row';
}

/** #626: a column's sort options as a menu, in place of the per-column <select>. */
export function SortMenu({ status, mode, onChange, variant = 'icon' }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    checked?.focus();
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (next: SortMode) => {
    setOpen(false);
    btnRef.current?.focus();
    onChange(next);
  };

  const testId = variant === 'row' ? 'column-sort-row-btn' : 'column-sort-btn';

  return (
    <div class={`column-sort-menu column-sort-menu-${variant}`}>
      <button
        ref={btnRef}
        type="button"
        class={`column-sort-btn${mode !== 'custom' ? ' column-sort-active' : ''}`}
        aria-label={`Sort ${status} column`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Sort: ${SORT_LABELS[mode]}`}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        <SortIcon />
        {variant === 'row' && <span class="column-sort-btn-label">{SORT_LABELS[mode]}</span>}
      </button>
      {open && (
        <div ref={menuRef} role="menu" class="column-sort-dropdown" aria-label={`Sort ${status} column`}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === mode}
              class={`overflow-menu-item${m === mode ? ' overflow-menu-item-checked' : ''}`}
              onClick={() => choose(m)}
              data-testid={`column-sort-option-${m}`}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
