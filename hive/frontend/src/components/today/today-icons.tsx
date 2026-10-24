// Stroke icons for Today (#624), drawn like the shell's: 24 x 24, 2px stroke, currentColor.
import { Icon } from '../shell/nav-icons';

export function WarningIcon() {
  return (
    <Icon>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  );
}

export function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function CalendarIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function ArrowRightIcon() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  );
}

export function ChevronRightIcon() {
  return (
    <Icon>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}
