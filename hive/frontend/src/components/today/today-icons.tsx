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

export function ChecklistIcon() {
  return (
    <Icon>
      <path d="M4 6.5l1.5 1.5L8 5M4 12.5l1.5 1.5L8 11M4 18.5l1.5 1.5L8 17M12 7h8M12 13h8M12 19h8" />
    </Icon>
  );
}

export function SortIcon() {
  return (
    <Icon>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </Icon>
  );
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </Icon>
  );
}

export function PeopleIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.3c2.2.7 3.5 2.6 3.5 5.7" />
    </Icon>
  );
}

export function MoreIcon() {
  return (
    <Icon>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </Icon>
  );
}

export function PlusSmallIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icon>
  );
}
