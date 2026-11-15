// #913: the Energy tab's numbers, from `getFoodLogTotals` days. Pure: dates are plain YYYY-MM-DD, and the only
// arithmetic is means over counted days (never today, never a day without calories). A gap is never 0.
import type { FoodLogDay } from '../api/types';
import { addDays } from '../plan/dates';
import type { AverageId, RangeId } from './trends-types';

export const RANGE_DAYS: Record<Exclude<RangeId, 'All'>, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};
/** A span longer than this many days draws weekly bars. */
export const DAILY_MAX_DAYS = 182;
/** The widest average window; days this far before a range are fetched so its first day's line is whole. */
export const MAX_WINDOW = 30;

const MS_DAY = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY);
}

/** The first day of a fixed range, ending today inclusive. */
export function rangeFrom(range: Exclude<RangeId, 'All'>, today: string): string {
  return addDays(today, -(RANGE_DAYS[range] - 1));
}

export function windowOf(avg: AverageId): number {
  return avg === 'Off' ? 0 : Number.parseInt(avg, 10);
}

/** 0 Sunday to 6 Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The Monday on or before a date. */
export function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export interface DayPoint {
  date: string;
  /** Something was logged (the date is in `days`). */
  logged: boolean;
  /** The day's calories; null for a gap and for entries with no nutrition. */
  kcal: number | null;
  partial: boolean;
  today: boolean;
  /** The rolling average ending this day, or null where the window holds no counted day (the line breaks). */
  avg: number | null;
}

/** A counted day is not today and has calories. */
const counted = (d: { kcal: number | null; today: boolean }) => !d.today && d.kcal !== null;

/**
 * One point per day from `from` to `to`. `window` is the average's length in days (0 for Off); it reads days before
 * `from` too, from `byDate`.
 */
export function buildDays(
  byDate: Map<string, FoodLogDay>,
  from: string,
  to: string,
  today: string,
  window: number,
): DayPoint[] {
  const point = (date: string): Omit<DayPoint, 'avg'> => {
    const d = byDate.get(date);
    return {
      date,
      logged: !!d,
      kcal: d?.kcal ?? null,
      partial: !!d && d.kcal !== null && d.partial,
      today: date === today,
    };
  };
  const out: DayPoint[] = [];
  const n = daysBetween(from, to) + 1;
  for (let i = 0; i < n; i++) {
    const p = point(addDays(from, i));
    let avg: number | null = null;
    if (window > 0 && !p.today) {
      let sum = 0;
      let count = 0;
      for (let k = 0; k < window; k++) {
        const q = point(addDays(p.date, -k));
        if (counted(q)) {
          sum += q.kcal!;
          count++;
        }
      }
      avg = count ? sum / count : null;
    }
    out.push({ ...p, avg });
  }
  return out;
}

export interface Summary {
  /** Mean kcal a day over counted days with calories, or null. */
  average: number | null;
  /** Counted days with calories. */
  logged: number;
  /** Counted days in the range: through yesterday. */
  total: number;
  low: number;
  /** Today is in the range and was left out. */
  todayIn: boolean;
  /** Anything at all is logged in the range, today included. */
  any: boolean;
}

export function summarize(days: DayPoint[]): Summary {
  const c = days.filter((d) => !d.today);
  const logged = c.filter((d) => d.kcal !== null);
  return {
    average: logged.length ? logged.reduce((t, d) => t + d.kcal!, 0) / logged.length : null,
    logged: logged.length,
    total: c.length,
    low: logged.filter((d) => d.partial).length,
    todayIn: days.some((d) => d.today),
    any: days.some((d) => d.logged),
  };
}

export interface WeekPoint {
  /** The Monday. */
  date: string;
  /** Mean kcal over the week's counted days with calories, or null (a gap). */
  kcal: number | null;
  partial: boolean;
  logged: number;
  /** Counted days of the week inside the range. */
  total: number;
}

/** Monday to Sunday weeks, over the days in range. */
export function buildWeeks(days: DayPoint[]): WeekPoint[] {
  const weeks = new Map<string, DayPoint[]>();
  for (const d of days) {
    const key = mondayOf(d.date);
    weeks.set(key, [...(weeks.get(key) ?? []), d]);
  }
  return [...weeks].map(([date, mine]) => {
    const c = mine.filter((d) => !d.today);
    const logged = c.filter((d) => d.kcal !== null);
    return {
      date,
      kcal: logged.length ? logged.reduce((t, d) => t + d.kcal!, 0) / logged.length : null,
      partial: logged.some((d) => d.partial),
      logged: logged.length,
      total: c.length,
    };
  });
}

export interface WeekdayMean {
  /** 0 is Monday. */
  index: number;
  mean: number | null;
  n: number;
}

/** The mean kcal for each weekday, Monday first, over counted days with calories. */
export function weekdayMeans(days: DayPoint[]): WeekdayMean[] {
  return Array.from({ length: 7 }, (_, index) => {
    const mine = days.filter((d) => !d.today && d.kcal !== null && (weekdayOf(d.date) + 6) % 7 === index);
    return { index, mean: mine.length ? mine.reduce((t, d) => t + d.kcal!, 0) / mine.length : null, n: mine.length };
  });
}
