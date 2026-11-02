// The Plan tab's days (#709): today and the next 7, by the device's own date,
// and the ways a day is named. Dates are plain YYYY-MM-DD throughout.
import { localDate } from '../cook/format';

/** How many days the Plan tab shows, today first. */
export const PLAN_DAYS = 8;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: string): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** `YYYY-MM-DD` plus whole days, by calendar arithmetic. */
export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The 8 days the tab shows, from the device's today. `now` is for tests. */
export function planDays(now = new Date()): string[] {
  const today = localDate(now);
  return Array.from({ length: PLAN_DAYS }, (_, i) => addDays(today, i));
}

/** A day header: `Today`, `Tomorrow`, then `Wednesday`. */
export function dayName(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return WEEKDAYS[parts(date).weekday];
}

/** The header's short date: `Nov 4`. */
export function shortDay(date: string): string {
  const { m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}`;
}

/** A day chip: `Today`, `Tomorrow`, then `Wed 5`. */
export function dayChip(date: string, today: string): string {
  if (date === today || date === addDays(today, 1)) return dayName(date, today);
  return `${WEEKDAYS[parts(date).weekday].slice(0, 3)} ${parts(date).d}`;
}

/** The meal sheet's line two: `Tuesday, Nov 4`, always the weekday. */
export function longDay(date: string): string {
  return `${WEEKDAYS[parts(date).weekday]}, ${shortDay(date)}`;
}

/** The remove question's day: `Today's`, `Tomorrow's`, `Tuesday's`. */
export function dayPossessive(date: string, today: string): string {
  return `${dayName(date, today)}'s`;
}

/** A plan id made on the device when a sheet opens, so a double tap or a retry leaves one row: `pl_` + 8 hex. */
export function newPlanId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `pl_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
