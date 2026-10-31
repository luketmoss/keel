// Thrive's drawn icons (#405), one component each, so the nav and the pickers
// import by name. Hand-drawn for Thrive on a 24 grid, in the style of its
// first three (calendar, sync, last time): inline SVG, a 2px `currentColor`
// stroke, round caps and joins, outline only. Each takes its control's colour
// and is hidden from assistive tech, because the control's own text or
// `aria-label` is its name. Size is the caller's, through CSS (--icon-md,
// --icon-lg); the attributes below are only the fallback. No icon package.
import type { ComponentChildren } from 'preact';

function Icon({ children }: { children: ComponentChildren }) {
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

/** Day: a circle with eight short rays, today. Not a calendar (the Day header's button is one). */
export function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  );
}

/** Activities: a clipboard with a clip at the top and two lines. */
export function ClipboardIcon() {
  return (
    <Icon>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h6" />
    </Icon>
  );
}

/** Trends: a rising line of four points over an L-shaped axis. */
export function TrendIcon() {
  return (
    <Icon>
      <path d="M3 3v18h18" />
      <polyline points="7 16 11 11 14 14 19 8" />
    </Icon>
  );
}

/** Library: three book spines on a shelf line, the last one leaning. */
export function BooksIcon() {
  return (
    <Icon>
      <path d="M2 21h20" />
      <rect x="3.5" y="8" width="3" height="13" />
      <rect x="9.5" y="3" width="3" height="18" />
      <path d="M18 21l-2.93-.62 3.12-14.67 2.93.62z" />
    </Icon>
  );
}

/** Settings: an eight-toothed gear with a centre hole. */
export function GearIcon() {
  return (
    <Icon>
      <path d="M10.54 5.15L10.76 2.58H13.24L13.46 5.15L15.81 6.13L17.78 4.46L19.54 6.22L17.87 8.19L18.85 10.54L21.42 10.76V13.24L18.85 13.46L17.87 15.81L19.54 17.78L17.78 19.54L15.81 17.87L13.46 18.85L13.24 21.42H10.76L10.54 18.85L8.19 17.87L6.22 19.54L4.46 17.78L6.13 15.81L5.15 13.46L2.58 13.24V10.76L5.15 10.54L6.13 8.19L4.46 6.22L6.22 4.46L8.19 6.13Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Weight: a horizontal bar with two plates each end. */
export function DumbbellIcon() {
  return (
    <Icon>
      <path d="M2 12h20M5 9v6M8 6v12M16 6v12M19 9v6" />
    </Icon>
  );
}

/** Stretch: a stick figure, arms raised in a V, legs apart. */
export function StretchIcon() {
  return (
    <Icon>
      <circle cx="12" cy="4" r="2" />
      <path d="M12 9v6M12 11L5.5 6M12 11l6.5-5M12 15l-5 6.5M12 15l5 6.5" />
    </Icon>
  );
}

/** Bike: two wheels and a diamond frame with a seat and bars. */
export function BikeIcon() {
  return (
    <Icon>
      <circle cx="6.5" cy="16" r="4" />
      <circle cx="17.5" cy="16" r="4" />
      <path d="M6.5 16h5M6.5 16l3-7h6l2 7M9.5 9l2 7 4-7M9.5 9V7M8 7h3M15.5 9V6M14 6h3" />
    </Icon>
  );
}

/** Hike: two peaks, the taller behind. */
export function MountainIcon() {
  return (
    <Icon>
      <path d="M2 21h20" />
      <path d="M2 21L9 5l5.2 12" />
      <path d="M12 21l5-9 5 9" />
    </Icon>
  );
}

/** Run: a stick figure mid-stride, leaning forward, one arm bent. */
export function RunIcon() {
  return (
    <Icon>
      <circle cx="15" cy="4.5" r="2" />
      <path d="M13.5 8.5L10.5 14M13 9.5l4 2 2-2.5M12.5 9.5L8.5 9.5 6 12M10.5 14L15 16l-1.5 5M10.5 14L8 18.5 4 18" />
    </Icon>
  );
}

/** Walk: two offset footprints. */
export function FootprintsIcon() {
  return (
    <Icon>
      <ellipse cx="7.5" cy="7" rx="3" ry="4" />
      <path d="M7.5 16h.01" />
      <ellipse cx="16.5" cy="12" rx="3" ry="4" />
      <path d="M16.5 21h.01" />
    </Icon>
  );
}

/** Track Now: a round watch face with a crown and one hand. */
export function StopwatchIcon() {
  return (
    <Icon>
      <circle cx="12" cy="13" r="8" />
      <path d="M10 2h4M12 2v3M12 13V9" />
    </Icon>
  );
}

/** Plan for Later: a calendar page with a plus in its body. */
export function CalendarPlusIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M12 13v6M9 16h6" />
    </Icon>
  );
}

/** Trends range: a calendar page with two binding rings and a header rule. */
export function CalendarIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Icon>
  );
}

/** Trends average: one smooth wave, a line that rises and falls. */
export function WaveIcon() {
  return (
    <Icon>
      <path d="M2 12c2.5-6 4.5-6 7 0s4.5 6 7 0 3.5-4 6-2" />
    </Icon>
  );
}

/** Trends chart view: a rising and falling line over an L-shaped axis. */
export function ChartLineIcon() {
  return (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-6" />
    </Icon>
  );
}

/** Trends table view: a ruled grid, a header row over two columns. */
export function TableIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M10 10v10" />
    </Icon>
  );
}

/** Trail (#682): a winding path from the bottom left to the top right, with two bends. */
export function TrailIcon() {
  return (
    <Icon>
      <path d="M3 21c6 0 3-8 9-9s3-9 9-9" />
    </Icon>
  );
}
