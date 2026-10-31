// The detail screen's drawn icons (#531), in the house style of shared/icons.tsx
// (#405): a 24 grid, a 2px `currentColor` stroke, round caps and joins, outline
// only, hidden from assistive tech because the control's own name carries the
// meaning. The caller sizes them through CSS.
import type { ComponentChildren } from 'preact';

function Icon({ children }: { children: ComponentChildren }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
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

/** Back: a chevron pointing left. */
export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="M15 5l-7 7 7 7" />
    </Icon>
  );
}

/** Edit: a pencil, tip down-left. */
export function PencilIcon() {
  return (
    <Icon>
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
      <path d="M14.5 6.5l3 3" />
    </Icon>
  );
}

/** A pencil over a baseline: the Note card's heading mark. */
export function PencilLineIcon() {
  return (
    <Icon>
      <path d="M4 16l1-3.5L14.5 3a2 2 0 0 1 2.8 2.8L8 15.3z" />
      <path d="M3 21h18" />
    </Icon>
  );
}

/** More actions: three dots in a row. */
export function DotsIcon() {
  return (
    <Icon>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Icon>
  );
}

/** Copy workout: two overlapping sheets. */
export function CopyIcon() {
  return (
    <Icon>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Icon>
  );
}

/** Save as template: a bookmark. */
export function BookmarkIcon() {
  return (
    <Icon>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </Icon>
  );
}

/** Delete workout: a bin with a lid. */
export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </Icon>
  );
}

/** Elevation: a mountain range. */
export function MountainIcon() {
  return (
    <Icon>
      <path d="M3 19l6-11 4 7 2-3 6 7z" />
    </Icon>
  );
}

/** Last time: a clock with a counter-clockwise arrow. */
export function HistoryIcon() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

/** Close (#640): an X. */
export function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

/** A row that opens in place (#640): a chevron pointing down, flipped by CSS when open. */
export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** Add (#640): a plus. */
export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** The offline banner's mark (#667): a signal with a slash through it. */
export function NoSignalIcon() {
  return (
    <Icon>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.4a5 5 0 0 1 7 0" />
      <path d="M5 12.9a10 10 0 0 1 5.2-2.8M13.8 10.1A10 10 0 0 1 19 12.9" />
      <path d="M2 8.8a15 15 0 0 1 6-3.2M16 5.6a15 15 0 0 1 6 3.2" />
      <path d="M12 20h.01" />
    </Icon>
  );
}

/** A row that opens another screen (#682): a chevron pointing right. */
export function ChevronRightIcon() {
  return (
    <Icon>
      <path d="M9 5l7 7-7 7" />
    </Icon>
  );
}

/** An arrow out of a box: "opens elsewhere" (#260). Decorative; sized to the text. */
export function ExternalGlyph() {
  return (
    <svg class="detail-coros-link-glyph" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M7 1.5h3.5V5M10.5 1.5 5.5 6.5M9 7.5v2.25c0 .41-.34.75-.75.75h-6a.75.75 0 0 1-.75-.75v-6c0-.41.34-.75.75-.75H4.5"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
