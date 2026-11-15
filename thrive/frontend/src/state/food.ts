// #714 - the Day screen's Food card: what Forage's daily totals said for the seven days ending on
// each date read. One call per window (`getFoodLogTotals`, `from` six days before `to`), held by the
// viewed date. Nothing here adds up nutrition: the figures are Forage's, as it sent them. A window
// already read this session is shown at once and re-read behind it; a failed re-read keeps what was
// shown, and a failed first read is the card's error state. The card owns this state: nothing here
// touches the health store, so a failed food read never marks another panel failed. Demo mode makes
// no call and answers from built-in data. Nothing here throws.

import { signal } from '@preact/signals';
import { isDemo } from '../api/demo-data';
import { forageApiUrl, getFoodLogTotals, type FoodDay, type FoodLabel } from '../api/forage-food';
import { addDays, todayInDenver } from '../day/dates';
import type { HealthTabState } from './store';

export const FOOD_WEEK_DAYS = 7;

export interface FoodWindow {
  status: 'loading' | 'loaded' | 'error';
  /** Forage's reply for the window, oldest first. A date it did not report is absent. */
  days: FoodDay[];
}

/** The window ending on each date read so far. */
export const foodWindows = signal<Record<string, FoodWindow>>({});

/** Whether the Food card is mounted: a build with Forage's API URL, or demo mode. */
export function foodEnabled(): boolean {
  return isDemo() || forageApiUrl() !== '';
}

/** The seven dates of the window ending on `date`, oldest first. */
export function foodWindowDates(date: string): string[] {
  const dates: string[] = [];
  for (let i = FOOD_WEEK_DAYS - 1; i >= 0; i--) dates.push(addDays(date, -i));
  return dates;
}

const NO_UNKNOWN = {
  satfat_g: 0,
  transfat_g: 0,
  cholesterol_mg: 0,
  sodium_mg: 0,
  fiber_g: 0,
  sugars_g: 0,
  added_sugars_g: 0,
};

/** #757: a day none of whose items has any of the seven. */
const DEMO_NONE_KNOWN: FoodLabel = {
  values: {
    satfat_g: null,
    transfat_g: null,
    cholesterol_mg: null,
    sodium_mg: null,
    fiber_g: null,
    sugars_g: null,
    added_sugars_g: null,
  },
  unknown: {
    satfat_g: 4,
    transfat_g: 4,
    cholesterol_mg: 4,
    sodium_mg: 4,
    fiber_g: 4,
    sugars_g: 4,
    added_sugars_g: 4,
  },
};

/**
 * #757: the viewed day (i = 6) on today knows all seven but one added-sugars item, so "at least" and its
 * line show; on a past date it is the day that knows none, so that line can be seen. The low day reads
 * "at least" too.
 */
function demoLabel(i: number, viewedIsToday: boolean): FoodLabel {
  if (i === 6 && !viewedIsToday) return DEMO_NONE_KNOWN;
  if (i === 6) {
    return {
      values: {
        satfat_g: 15.2,
        transfat_g: 0,
        cholesterol_mg: 210,
        sodium_mg: 1840,
        fiber_g: 22.4,
        sugars_g: 48.3,
        added_sugars_g: 20,
      },
      unknown: { ...NO_UNKNOWN, added_sugars_g: 1 },
    };
  }
  if (i === 1) {
    return {
      values: {
        satfat_g: 18,
        transfat_g: 0.5,
        cholesterol_mg: 260,
        sodium_mg: 2100,
        fiber_g: 19,
        sugars_g: 52,
        added_sugars_g: 24,
      },
      unknown: { ...NO_UNKNOWN, sodium_mg: 1, fiber_g: 1 },
    };
  }
  return {
    values: {
      satfat_g: 12,
      transfat_g: 0,
      cholesterol_mg: 180,
      sodium_mg: 1650,
      fiber_g: 24,
      sugars_g: 41,
      added_sugars_g: 14,
    },
    unknown: { ...NO_UNKNOWN },
  };
}

/** Built-in data for demo mode: today's figures, one gap (three days back) and one low day (five back). */
export function demoFoodDays(date: string): FoodDay[] {
  const kcal = [1810, 2040, 1650, null, 1920, 1380, 1240];
  const dates = foodWindowDates(date);
  const days: FoodDay[] = [];
  kcal.forEach((k, i) => {
    if (k === null) return;
    const low = i === 1;
    days.push({
      date: dates[i],
      entries: i === 6 ? 4 : 5,
      unknown_entries: low ? 1 : 0,
      kcal: k,
      protein_g: Math.round(k * 0.05 * 10) / 10,
      carbs_g: Math.round(k * 0.11 * 10) / 10,
      fat_g: Math.round(k * 0.04 * 10) / 10,
      partial: low,
      label: demoLabel(i, date === todayInDenver()),
    });
  });
  return days;
}

function put(date: string, w: FoodWindow): void {
  foodWindows.value = { ...foodWindows.value, [date]: w };
}

const inFlight = new Set<string>();
const lastStart = new Map<string, number>();

/** The least time between two reads of one window that nobody asked for (a page becoming visible). */
export const FOOD_REFRESH_MS = 60_000;

/**
 * Read the window ending on `date`. With the window already read it is shown as it is while the read
 * runs. `user` is Try again: it ignores the throttle and shows the loading state again after an error.
 */
export async function loadFood(date: string, token: string, user = false): Promise<void> {
  if (isDemo()) {
    put(date, { status: 'loaded', days: demoFoodDays(date) });
    return;
  }
  if (inFlight.has(date)) return;
  inFlight.add(date);
  lastStart.set(date, Date.now());
  const before = foodWindows.value[date];
  if (!before || before.status === 'error') put(date, { status: 'loading', days: [] });
  try {
    const res = await getFoodLogTotals(token, addDays(date, -(FOOD_WEEK_DAYS - 1)), date);
    if (res.ok) put(date, { status: 'loaded', days: res.days });
    else if (!before || before.status !== 'loaded' || user) put(date, { status: 'error', days: [] });
  } finally {
    inFlight.delete(date);
  }
}

/** The page became visible: read again, unless this window was read in the last minute. */
export function refreshFood(date: string, token: string): Promise<void> {
  const last = lastStart.get(date);
  if (last !== undefined && Date.now() - last < FOOD_REFRESH_MS) return Promise.resolve();
  return loadFood(date, token);
}

/** Test-only: forget everything read. */
export function resetFood(): void {
  foodWindows.value = {};
  inFlight.clear();
  lastStart.clear();
}

// ── Trends (#890) ────────────────────────────────────────────────────

/**
 * Forage's whole log as Trends reads it: one `getFoodLogTotals` with no window, held as Forage sent it.
 * Trends reads it on entering a group that shows food; every control then redraws from these rows.
 */
export const foodHistory = signal<HealthTabState<FoodDay>>({ state: 'idle' });

export const FOOD_DEMO_DAYS = 400;

/**
 * Built-in history for demo mode: the last 400 days, today excluded, with a gap about one day in
 * seven, a low day about every three weeks, and day-to-day variation in the macros too.
 */
export function demoFoodHistory(today: string = todayInDenver()): FoodDay[] {
  const days: FoodDay[] = [];
  for (let back = FOOD_DEMO_DAYS; back >= 1; back--) {
    if (back % 7 === 3) continue;
    const low = back % 21 === 5;
    const wave = ((back * 37) % 23) - 11;
    const kcal = low ? 1180 + wave * 8 : 2050 + wave * 38;
    days.push({
      date: addDays(today, -back),
      entries: low ? 3 : 5,
      unknown_entries: low ? 1 : 0,
      kcal,
      protein_g: Math.round(kcal * 0.075 + wave),
      carbs_g: Math.round(kcal * 0.11 + wave * 2),
      fat_g: Math.round(kcal * 0.035 + wave / 2),
      partial: low,
    });
  }
  return days;
}

let historyInFlight: Promise<void> | null = null;

/**
 * Read the whole log. One read at a time: a call while one runs joins it. Rows already held stay up
 * while it reads and through a failed re-read; with none held, a failure is the error state. Demo mode
 * makes no call.
 */
export function loadFoodHistory(token: string): Promise<void> {
  if (isDemo()) {
    foodHistory.value = { state: 'loaded', rows: demoFoodHistory() };
    return Promise.resolve();
  }
  if (historyInFlight) return historyInFlight;
  if (foodHistory.value.state !== 'loaded') foodHistory.value = { state: 'loading' };
  historyInFlight = getFoodLogTotals(token)
    .then((res) => {
      if (res.ok) foodHistory.value = { state: 'loaded', rows: res.days };
      else if (foodHistory.value.state !== 'loaded') foodHistory.value = { state: 'error' };
    })
    .finally(() => {
      historyInFlight = null;
    });
  return historyInFlight;
}

/** Test-only: forget the whole-log read. */
export function resetFoodHistory(): void {
  foodHistory.value = { state: 'idle' };
  historyInFlight = null;
}
