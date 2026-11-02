// The Eaten tab's data (#712), loaded through the API. Components read the signals; this file owns the fetching.
// The day card is `getFoodLogTotals` for the day and each row an entry's stored snapshot: the app adds nothing up.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogDay, FoodLogEntry, PlanEntry, RecipeSummary } from '../api/types';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';

export type DayState = 'loading' | 'ready' | 'error';

/** The day Eaten shows. Never after the device's today. */
export const eatenDate = signal(localDate());
/** The device's today when the day was last loaded or moved. */
export const eatenToday = signal(localDate());
export const dayState = signal<DayState>('loading');
export const dayEntries = signal<FoodLogEntry[]>([]);
/** The day's totals, or null when nothing is logged (the date is absent from `days`). */
export const dayTotals = signal<FoodLogDay | null>(null);
/** The day's planned recipe meals, in plan order, before the log hides any. */
export const dayPlan = signal<PlanEntry[]>([]);
/** The library, for the entries' names and the Add sheet. */
export const logFoods = signal<Food[]>([]);
export const logRecipes = signal<RecipeSummary[]>([]);

let latest = 0;

/** Load the viewed day: its entries, its totals, its plan, and the library's names. A slower, older answer never wins. */
export async function loadDay(api: ForageApi, date = eatenDate.value): Promise<void> {
  const seq = ++latest;
  const today = localDate();
  eatenToday.value = today;
  try {
    const [entries, totals, plan, foods, recipes] = await Promise.all([
      api.getFoodLog(date, date),
      api.getFoodLogTotals(date, date),
      api.getPlan(date, date, today),
      api.getFoods(),
      api.getRecipes(),
    ]);
    if (seq !== latest) return;
    dayEntries.value = entries;
    dayTotals.value = totals.days.find((d) => d.date === date) ?? null;
    dayPlan.value = plan.entries.filter((p) => p.date === date && p.recipe_id);
    logFoods.value = foods;
    logRecipes.value = recipes;
    dayState.value = 'ready';
  } catch {
    if (seq !== latest) return;
    dayState.value = 'error';
  }
}

/** Move a day back or forward; forward stops at today. */
export function moveDay(api: ForageApi, by: -1 | 1): void {
  const today = localDate();
  const next = addDays(eatenDate.value, by);
  if (next > today) return;
  eatenDate.value = next;
  dayState.value = 'loading';
  void loadDay(api, next);
}

/**
 * The planned meals still to offer: each log entry with the same recipe and slot hides one plan entry, so a
 * recipe planned twice in a slot still offers the second once the first is logged.
 */
export function unloggedPlan(plan: PlanEntry[], entries: FoodLogEntry[]): PlanEntry[] {
  const logged = new Map<string, number>();
  for (const e of entries) {
    if (!e.recipe_id) continue;
    const k = `${e.slot}|${e.recipe_id}`;
    logged.set(k, (logged.get(k) ?? 0) + 1);
  }
  return plan.filter((p) => {
    const k = `${p.slot}|${p.recipe_id}`;
    const n = logged.get(k) ?? 0;
    if (!n) return true;
    logged.set(k, n - 1);
    return false;
  });
}

/** Forget what was loaded (tests and sign-out). */
export function _resetEaten(): void {
  latest++;
  eatenDate.value = localDate();
  eatenToday.value = localDate();
  dayState.value = 'loading';
  dayEntries.value = [];
  dayTotals.value = null;
  dayPlan.value = [];
  logFoods.value = [];
  logRecipes.value = [];
}
