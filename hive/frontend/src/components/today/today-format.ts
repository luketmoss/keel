// Date wording for Today (#624). Dates are local calendar days as YYYY-MM-DD.
import { addDays } from '../../state/board-store';

export function parseDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const fmt = (dateStr: string, opts: Intl.DateTimeFormatOptions) => parseDay(dateStr).toLocaleDateString('en-US', opts);

/** "Sat, Oct 24" */
export const dayLong = (d: string) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
/** "Tue 20" */
export const dayShort = (d: string) => `${fmt(d, { weekday: 'short' })} ${parseDay(d).getDate()}`;
/** "Tue" */
export const weekdayShort = (d: string) => fmt(d, { weekday: 'short' });
/** "T" */
export const weekdayLetter = (d: string) => fmt(d, { weekday: 'narrow' });

/** The when label of an Up next item: TOMORROW, TUE 27, or SUN, NOV 2 beyond a week out. */
export function whenLabel(dateStr: string, today: string): string {
  if (dateStr === addDays(today, 1)) return 'TOMORROW';
  if (dateStr <= addDays(today, 6)) return dayShort(dateStr).toUpperCase();
  return dayLong(dateStr).toUpperCase();
}

export function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const OWNER_COLORS = ['#e65100', '#1976d2', '#2e7d32', '#7b1fa2', '#c62828', '#00838f', '#4e342e', '#455a64'];

export function ownerColor(index: number): string {
  return OWNER_COLORS[(index < 0 ? 0 : index) % OWNER_COLORS.length];
}

/** When an open item is due, for a Boards card: "today", "tomorrow", "Tue 27", or "Sun, Nov 2" beyond a week out. */
export function dueWord(dateStr: string, today: string): string {
  if (dateStr === today) return 'today';
  if (dateStr === addDays(today, 1)) return 'tomorrow';
  if (dateStr <= addDays(today, 6)) return dayShort(dateStr);
  return dayLong(dateStr);
}
