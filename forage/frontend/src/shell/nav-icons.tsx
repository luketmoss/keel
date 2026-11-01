// Drawn stroke icons for the shell: 24 x 24, 2px stroke, currentColor. No emoji.
// The prototype's four, redrawn.
import type { ComponentChildren } from 'preact';

export function Icon({ children }: { children: ComponentChildren }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
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

/** A calendar page with two rings. */
export function PlanIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

/** A shopping cart. */
export function ShopIcon() {
  return (
    <Icon>
      <path d="M2 3h3l2.5 12h11l2-8H6.2" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
    </Icon>
  );
}

/** Three ticked lines. */
export function EatenIcon() {
  return (
    <Icon>
      <path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17M11 6h10M11 12h10M11 18h10" />
    </Icon>
  );
}

/** An open book. */
export function LibraryIcon() {
  return (
    <Icon>
      <path d="M12 6c-2-1.5-5-2-9-2v15c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2z" />
      <path d="M12 6v15" />
    </Icon>
  );
}
