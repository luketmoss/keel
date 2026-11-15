// #913: a radio-style segmented control: one tab stop, arrow keys inside, the selected option `aria-checked`.
import { useRef } from 'preact/hooks';

interface Props<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  describedBy?: string;
  /** What each option reads as, when it is not the id. */
  labels?: Partial<Record<T, string>>;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  describedBy,
  labels,
}: Props<T>) {
  const root = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    const i = options.indexOf(value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]);
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  }

  return (
    <div
      ref={root}
      class="segmented seg-radio"
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled ? true : undefined}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          class="segment"
          aria-checked={o === value}
          tabIndex={o === value ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o)}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
