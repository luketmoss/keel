// How trail screens write a pass (#682): position, time, climb, dates, and the
// comparison line. Pure. No word here says "ride": a trail is walked and run too.

import type { PassComparison, TrailPass } from './types';

const FEET_PER_METRE = 3.28084;
const METRES_PER_MILE = 1609.344;

export const NO_EARLIER_PASS = 'No earlier pass over this stretch';

/** "0 → 100%", "100 → 0%", "40 → 100%". */
export function formatPosition(startPct: number, endPct: number): string {
  return `${Math.round(startPct)} → ${Math.round(endPct)}%`;
}

/** "14:32" under an hour, "1:02:10" from an hour. */
export function formatPassTime(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function feet(metres: number): number {
  return Math.round(metres * FEET_PER_METRE);
}

/** "↑ 420 ft", grouped: "↑ 1,240 ft". */
export function formatClimb(metres: number): string {
  return `↑ ${feet(metres).toLocaleString('en-US')} ft`;
}

/** "1.2 mi". */
export function formatMiles(metres: number): string {
  return `${(metres / METRES_PER_MILE).toFixed(1)} mi`;
}

/** The unmatched distance is worth a line from 0.1 mi. */
export function showsUnmatched(metres: number | null): metres is number {
  return metres !== null && metres / METRES_PER_MILE >= 0.1;
}

function asUtcNoon(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fmt(date: string, opts: Intl.DateTimeFormatOptions): string {
  return asUtcNoon(date).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}

/** "Thu, Oct 22", or "Thu, Oct 23, 2025" when not this year. `today` is a `YYYY-MM-DD`. */
export function formatTrailDate(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return fmt(date, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "Oct 3", or "Oct 3, 2025" when not this year. */
export function formatShortDate(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return fmt(date, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "1:12 faster", "0:40 slower", or "Same time" under 5 s either way. */
export function timeDiffText(diffS: number): string {
  if (Math.abs(diffS) < 5) return 'Same time';
  return `${formatPassTime(diffS)} ${diffS < 0 ? 'faster' : 'slower'}`;
}

/** "↑ 20 ft more" or "↑ 20 ft less"; null under 10 ft either way. */
export function climbDiffText(diffM: number): string | null {
  const ft = feet(diffM);
  if (Math.abs(ft) < 10) return null;
  return `↑ ${Math.abs(ft).toLocaleString('en-US')} ft ${ft > 0 ? 'more' : 'less'}`;
}

/** A pass row's first line: "0:42 in · 0 → 100% · 14:32 · ↑ 420 ft"; unknown parts left out. */
export function passLine(pass: TrailPass, withOffset: boolean): string {
  const parts: string[] = [];
  if (withOffset && pass.entryOffsetS !== null) parts.push(`${formatPassTime(pass.entryOffsetS)} in`);
  parts.push(formatPosition(pass.startPct, pass.endPct));
  if (pass.durationS !== null) parts.push(formatPassTime(pass.durationS));
  if (pass.climbM !== null) parts.push(formatClimb(pass.climbM));
  return parts.join(' · ');
}

/** A pass row's second line: "1:12 faster · ↑ 20 ft less than Oct 3", or the no-earlier line. */
export function comparisonLine(c: PassComparison, today: string): string {
  if (!c.previous || (c.timeDiffS === null && c.climbDiffM === null)) return NO_EARLIER_PASS;
  const when = formatShortDate(c.previous.date, today);
  const parts: string[] = [];
  if (c.timeDiffS !== null) parts.push(timeDiffText(c.timeDiffS));
  const climb = c.climbDiffM !== null ? climbDiffText(c.climbDiffM) : null;
  if (climb) parts.push(climb);
  // Nothing differs enough to name: "than" would not read, so say it is the same "as".
  if (parts.length === 0) return `Same climb as ${when}`;
  if (parts.length === 1 && parts[0] === 'Same time') return `Same time as ${when}`;
  return `${parts.join(' · ')} than ${when}`;
}

/** "1 trail", "3 trails"; "1 time", "9 times"; and so on. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
