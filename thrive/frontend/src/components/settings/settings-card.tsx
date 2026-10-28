// #643 - the pieces Settings is built from: a card with an icon and a
// sentence-case title (Day's, #485) and the hairline row that goes in it.
// The icons are drawn here, in the house style (#405), because the shared set
// is counted by its own tests.
import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';

function Svg({ size = 24, children }: { size?: number; children: ComponentChildren }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Appearance: a circle with its right half filled. */
export function ContrastIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </Svg>
  );
}

/** Rest times: a timer. */
export function TimerIcon() {
  return (
    <Svg>
      <circle cx="12" cy="13" r="8" />
      <path d="M10 2h4M12 13V9" />
    </Svg>
  );
}

/** Hydration: a droplet. */
export function DropletIcon() {
  return (
    <Svg>
      <path d="M12 3c3.5 4.2 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7.2 12 3z" />
    </Svg>
  );
}

/** Sync: two arrows chasing round. */
export function SyncArrowsIcon() {
  return (
    <Svg>
      <path d="M20 11A8 8 0 0 0 5.6 6.4M4 13a8 8 0 0 0 14.4 4.6M4 4v4h4M20 20v-4h-4" />
    </Svg>
  );
}

/** Your data: a stack of disks. */
export function DatabaseIcon() {
  return (
    <Svg>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </Svg>
  );
}

export function SignOutIcon() {
  return (
    <Svg>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Svg>
  );
}

export function ChevronIcon() {
  return (
    <Svg size={16}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function MinusIcon() {
  return (
    <Svg size={16}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function PlusIcon() {
  return (
    <Svg size={16}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

interface CardProps {
  /** Sentence case. Omit for a card with no title (Account). */
  title?: string;
  icon?: ComponentChildren;
  /** A CSS colour for the icon, such as `var(--sec-primary)`. */
  iconColor?: string;
  /** A control at the right of the title row. */
  action?: ComponentChildren;
  class?: string;
  children?: ComponentChildren;
}

/** One Settings card: a `section` labelled by its `h2`, or unlabelled without a title. */
export function SettingsCard({ title, icon, iconColor, action, class: extra, children }: CardProps) {
  const id = useId();
  const cls = extra ? `settings-card ${extra}` : 'settings-card';
  return (
    <section class={cls} aria-labelledby={title ? id : undefined}>
      {title && (
        <div class="settings-card-head">
          <h2 class="settings-card-title" id={id}>
            {icon != null && (
              <span class="settings-card-icon" aria-hidden="true" style={iconColor ? { color: iconColor } : undefined}>
                {icon}
              </span>
            )}
            {title}
          </h2>
          {action != null && <div class="settings-card-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

interface RowProps {
  label: ComponentChildren;
  /** The line under the label, `--text-xs`. */
  secondary?: ComponentChildren;
  /** Id for the label word, so a region or control can be named by it. */
  labelId?: string;
  /** The `for` of a `label`, when the row's control is a field. */
  htmlFor?: string;
  class?: string;
  role?: 'group';
  ariaLabel?: string;
  children?: ComponentChildren;
}

/** A hairline row: label (and an optional secondary line) on the left, the value or control on the right. */
export function SettingsRow({ label, secondary, labelId, htmlFor, class: extra, role, ariaLabel, children }: RowProps) {
  const word = htmlFor ? (
    <label class="settings-row-label" id={labelId} for={htmlFor}>
      {label}
    </label>
  ) : (
    <span class="settings-row-label" id={labelId}>
      {label}
    </span>
  );
  return (
    <div class={extra ? `settings-row ${extra}` : 'settings-row'} role={role} aria-label={ariaLabel}>
      <div class="settings-row-text">
        {word}
        {secondary != null && <span class="settings-row-secondary">{secondary}</span>}
      </div>
      {children != null && <div class="settings-row-value">{children}</div>}
    </div>
  );
}
