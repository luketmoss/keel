import type { Theme } from '../../state/board-store';
import { theme, setTheme } from '../../state/board-store';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * Three-way theme control: Light / Dark / System, as a radiogroup (#623).
 * Selecting applies at once.
 */
export function ThemeToggle() {
  const current = theme.value;

  return (
    <div role="radiogroup" aria-label="Theme" class="theme-toggle" data-testid="theme-toggle">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          class={`theme-toggle-btn${current === opt.value ? ' theme-toggle-active' : ''}`}
          aria-checked={current === opt.value}
          onClick={() => setTheme(opt.value)}
        >
          <span class="theme-toggle-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
