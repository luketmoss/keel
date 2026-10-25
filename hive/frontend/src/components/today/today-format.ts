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
/** "Oct 22" */
export const monthDay = (d: string) => fmt(d, { month: 'short', day: 'numeric' });
/** "T" */
export const weekdayLetter = (d: string) => fmt(d, { weekday: 'narrow' });

/** The when label of an Up next item: TOMORROW, TUE 27, or SUN, NOV 2 beyond a week out. */
export function whenLabel(dateStr: string, today: string): string {
  if (dateStr === addDays(today, 1)) return 'TOMORROW';
  if (dateStr <= addDays(today, 6)) return dayShort(dateStr).toUpperCase();
  return dayLong(dateStr).toUpperCase();
}

/** When an open item is due, for a Boards card: "today", "tomorrow", "Tue 27", or "Sun, Nov 2" beyond a week out. */
export function dueWord(dateStr: string, today: string): string {
  if (dateStr === today) return 'today';
  if (dateStr === addDays(today, 1)) return 'tomorrow';
  if (dateStr <= addDays(today, 6)) return dayShort(dateStr);
  return dayLong(dateStr);
}
