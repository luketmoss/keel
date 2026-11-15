// #914: the numbers behind the Macros and Nutrients tabs, from `getFoodLogTotals` days. Pure, like energy.ts: the
// arithmetic is means and sums over counted days (never today, never a day without calories). A gap is never 0.
import type { ExtraKey, FoodLogDay } from '../api/types';
import { MACRO_KEYS, macroShares, type MacroKey } from '../ui/macro-math';
import { addDays } from '../plan/dates';
import { daysBetween, mondayOf } from './energy';

/** What a metric reads from a day: its value, whether the day is low, and whether the value is "at least". */
export interface Pick {
  value: number | null;
  partial: boolean;
  atLeast: boolean;
}

export type Picker = (d: FoodLogDay) => Pick;

const MACRO_FIELD: Record<MacroKey, 'protein_g' | 'carbs_g' | 'fat_g'> = {
  protein: 'protein_g',
  carbs: 'carbs_g',
  fat: 'fat_g',
};

/** A macro's grams: low when the day is, because a low day's grams are what was counted. */
export function pickMacro(key: MacroKey): Picker {
  const field = MACRO_FIELD[key];
  return (d) => {
    const value = d.kcal === null ? null : (d[field] ?? null);
    return { value, partial: value !== null && d.partial, atLeast: false };
  };
}

/**
 * One of the seven. It is "at least" when some entries that day had calories but did not report it; none of the seven
 * ever makes a day low.
 */
export function pickNutrient(key: ExtraKey): Picker {
  return (d) => {
    const value = d[key] ?? null;
    return { value, partial: false, atLeast: value !== null && (d.unknown?.[key] ?? 0) > 0 };
  };
}

export interface SeriesPoint {
  date: string;
  /** Something was logged (the date is in `days`). */
  logged: boolean;
  /** The day has calories, so it counts as a logged day. */
  nutrition: boolean;
  value: number | null;
  partial: boolean;
  atLeast: boolean;
  /** Entries had calories but did not report this one, whether or not other entries did. */
  someUnknown: boolean;
  today: boolean;
  /** The rolling average ending this day, or null where the window holds no counted day (the line breaks). */
  avg: number | null;
}

const counted = (d: { value: number | null; today: boolean }) => !d.today && d.value !== null;

/** One point per day from `from` to `to`; `window` is the average's length in days (0 for Off), read before `from` too. */
export function buildSeries(
  byDate: Map<string, FoodLogDay>,
  from: string,
  to: string,
  today: string,
  window: number,
  pick: Picker,
  unknownKey?: ExtraKey,
): SeriesPoint[] {
  const point = (date: string): Omit<SeriesPoint, 'avg'> => {
    const d = byDate.get(date);
    const p = d ? pick(d) : { value: null, partial: false, atLeast: false };
    return {
      date,
      logged: !!d,
      nutrition: !!d && d.kcal !== null,
      value: p.value,
      partial: p.partial,
      atLeast: p.atLeast,
      someUnknown: !!d && !!unknownKey && (d.unknown?.[unknownKey] ?? 0) > 0,
      today: date === today,
    };
  };
  const out: SeriesPoint[] = [];
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
          sum += q.value!;
          count++;
        }
      }
      avg = count ? sum / count : null;
    }
    out.push({ ...p, avg });
  }
  return out;
}

export interface SeriesSummary {
  /** Mean over counted days that have a value, or null. */
  average: number | null;
  /** Counted days that have a value. */
  withValue: number;
  /** Counted days with calories: the days logged. */
  logged: number;
  /** Counted days in the range: through yesterday. */
  total: number;
  low: number;
  /** Some counted day's entries did not report it, so the average is "at least". */
  atLeast: boolean;
  todayIn: boolean;
  any: boolean;
}

export function summarizeSeries(points: SeriesPoint[]): SeriesSummary {
  const c = points.filter((p) => !p.today);
  const have = c.filter((p) => p.value !== null);
  return {
    average: have.length ? have.reduce((t, p) => t + p.value!, 0) / have.length : null,
    withValue: have.length,
    logged: c.filter((p) => p.nutrition).length,
    total: c.length,
    low: have.filter((p) => p.partial).length,
    atLeast: c.some((p) => p.someUnknown),
    todayIn: points.some((p) => p.today),
    any: points.some((p) => p.logged),
  };
}

export interface SeriesWeek {
  /** The Monday. */
  date: string;
  value: number | null;
  partial: boolean;
  atLeast: boolean;
  logged: number;
  total: number;
}

/** Monday to Sunday weeks over the days in range: the mean of the week's counted days that have a value. */
export function buildSeriesWeeks(points: SeriesPoint[]): SeriesWeek[] {
  const weeks = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    const key = mondayOf(p.date);
    weeks.set(key, [...(weeks.get(key) ?? []), p]);
  }
  return [...weeks].map(([date, mine]) => {
    const c = mine.filter((p) => !p.today);
    const have = c.filter((p) => p.value !== null);
    return {
      date,
      value: have.length ? have.reduce((t, p) => t + p.value!, 0) / have.length : null,
      partial: have.some((p) => p.partial),
      atLeast: have.some((p) => p.atLeast) || c.some((p) => p.someUnknown),
      logged: c.filter((p) => p.nutrition).length,
      total: c.length,
    };
  });
}

// ---- Macros: where calories come from

export interface MacroOverview {
  /** Mean grams a day over counted days with calories, null where none counted. */
  grams: Record<MacroKey, number | null>;
  logged: number;
  total: number;
  low: number;
}

/** The three macros' daily means over the range's counted days (through yesterday, with calories). */
export function macroOverview(byDate: Map<string, FoodLogDay>, from: string, today: string): MacroOverview {
  const sums: Record<MacroKey, { t: number; n: number }> = {
    protein: { t: 0, n: 0 },
    carbs: { t: 0, n: 0 },
    fat: { t: 0, n: 0 },
  };
  let logged = 0;
  let total = 0;
  let low = 0;
  for (let date = from; date < today; date = addDays(date, 1)) {
    total++;
    const d = byDate.get(date);
    if (!d || d.kcal === null) continue;
    logged++;
    if (d.partial) low++;
    for (const k of MACRO_KEYS) {
      const v = d[MACRO_FIELD[k]];
      if (typeof v === 'number') {
        sums[k].t += v;
        sums[k].n++;
      }
    }
  }
  const mean = (k: MacroKey) => (sums[k].n ? sums[k].t / sums[k].n : null);
  return { grams: { protein: mean('protein'), carbs: mean('carbs'), fat: mean('fat') }, logged, total, low };
}

/** A week must have this many counted days for its split to be drawn. */
export const MIN_SPLIT_DAYS = 3;

export interface WeekSplit {
  /** The Monday. */
  date: string;
  /** Counted days with calories inside the range. */
  days: number;
  /** Whole percentages adding to 100, null for a gap. */
  pct: Record<MacroKey, number> | null;
}

/** The split by week: each week's summed counted days, as shares of the macros' calories at 4/4/9. */
export function weekSplits(byDate: Map<string, FoodLogDay>, from: string, today: string): WeekSplit[] {
  const weeks = new Map<string, { days: number; g: Record<MacroKey, number> }>();
  for (let date = from; date <= today; date = addDays(date, 1)) {
    const key = mondayOf(date);
    const w = weeks.get(key) ?? { days: 0, g: { protein: 0, carbs: 0, fat: 0 } };
    weeks.set(key, w);
    const d = byDate.get(date);
    if (date === today || !d || d.kcal === null) continue;
    if (MACRO_KEYS.some((k) => typeof d[MACRO_FIELD[k]] !== 'number')) continue;
    w.days++;
    for (const k of MACRO_KEYS) w.g[k] += d[MACRO_FIELD[k]] as number;
  }
  return [...weeks].map(([date, w]) => {
    const s = w.days >= MIN_SPLIT_DAYS ? macroShares(w.g) : null;
    return { date, days: w.days, pct: s && s.state === 'shares' ? s.pct : null };
  });
}

/** What the Macros and Nutrients tabs share with the screen: the days read and the choices over them. */
export interface TabView {
  byDate: Map<string, FoodLogDay>;
  from: string;
  today: string;
  /** The range in words (`last 30 days`). */
  rangeText: string;
  /** Weekly bars: the span is past 182 days. */
  weekly: boolean;
  /** The average window in days; 0 for Off and for weekly bars. */
  avgDays: number;
}
