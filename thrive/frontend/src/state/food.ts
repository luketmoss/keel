// #714 - the Day screen's Food card: what Forage's daily totals said for the seven days ending on
// each date read. One call per window (`getFoodLogTotals`, `from` six days before `to`), held by the
// viewed date. Nothing here adds up nutrition: the figures are Forage's, as it sent them. A window
// already read this session is shown at once and re-read behind it; a failed re-read keeps what was
// shown, and a failed first read is the card's error state. The card owns this state: nothing here
// touches the health store, so a failed food read never marks another panel failed. Demo mode makes
// no call and answers from built-in data. Nothing here throws.

import { signal } from '@preact/signals';
import { isDemo } from '../api/demo-data';
import { forageApiUrl, getFoodLogTotals, type FoodDay } from '../api/forage-food';
import { addDays } from '../day/dates';

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
