// The Plan tab's data (#709), loaded through the API. Components read the
// signals; this file owns the fetching. Every figure (kcal a serving, partial,
// the trip chips, the banner's count) is the API's: the app computes none.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { LateMeal, PlanEntry } from '../api/types';
import { localDate } from '../cook/format';
import { PLAN_DAYS, addDays } from './dates';

export type PlanState = 'idle' | 'loading' | 'ready' | 'error';

export const planEntries = signal<PlanEntry[]>([]);
export const notOnTrip = signal(0);
export const planState = signal<PlanState>('idle');
/** A load failed: shown above meals already on screen, or alone when there are none. */
export const planFailed = signal(false);
/** The device's today at the last load: the 8 days start here. */
export const planToday = signal(localDate());
/** The header's "Plan a meal" was tapped: the Plan screen opens its sheet. */
export const planMealRequested = signal(false);
/** #718: whether a trip is open, read with the plan; null until known (and after a failed read), so no button. */
export const tripOpen = signal<boolean | null>(null);
/** #719: the open trip's late meals, from getPlan. */
export const lateMeals = signal<LateMeal[]>([]);
/** A line for the Plan screen from a sheet that closed: "That meal was already removed." */
export const planNotice = signal<string | null>(null);

let latest = 0;

/**
 * Load the 8 days from the device's today. Meals already shown stay under a
 * failed refresh, and a slower, older answer never replaces a newer one.
 */
export async function loadPlan(api: ForageApi, now = new Date()): Promise<void> {
  const seq = ++latest;
  const today = localDate(now);
  if (planState.value === 'idle') planState.value = 'loading';
  try {
    const [out, trip] = await Promise.all([
      api.getPlan(today, addDays(today, PLAN_DAYS - 1), today),
      api.getTrip().then(
        (t) => !!t,
        () => null,
      ),
    ]);
    if (seq !== latest) return;
    tripOpen.value = trip;
    planToday.value = today;
    planEntries.value = out.entries;
    notOnTrip.value = out.not_on_trip;
    lateMeals.value = out.late_meals ?? [];
    planFailed.value = false;
    planState.value = 'ready';
  } catch {
    if (seq !== latest) return;
    planFailed.value = true;
    if (planState.value === 'loading') planState.value = 'error';
  }
}

/** The banner's text, or null at 0. The number is bold in the banner itself. */
export function bannerCount(n: number): { strong: string; rest: string } | null {
  if (n <= 0) return null;
  return n === 1
    ? { strong: '1 planned meal', rest: " isn't on a shopping trip yet." }
    : { strong: `${n} planned meals`, rest: " aren't on a shopping trip yet." };
}

/** A meal's name: the recipe's, or the note's text. */
export function mealName(e: PlanEntry): string {
  return e.recipe_id ? e.recipe_name || 'Recipe' : e.note;
}

/** `412 kcal a serving`, `no calories yet`, or '' for a note. Rounded here, for display only. */
export function kcalLine(e: PlanEntry): string {
  if (!e.recipe_id) return '';
  return e.kcal_serving === null ? 'no calories yet' : `${Math.round(e.kcal_serving)} kcal a serving`;
}

/** `On list`, `Shopped`, or ''. */
export function tripChip(e: PlanEntry): string {
  if (!e.on_trip) return '';
  return e.shopped ? 'Shopped' : 'On list';
}

/** A meal row's accessible name: `Beef Stew, Dinner, 412 kcal a serving, partial, on list`. */
export function mealLabel(e: PlanEntry): string {
  const parts = [mealName(e), e.slot];
  if (e.recipe_id) parts.push(kcalLine(e));
  if (e.partial) parts.push('partial');
  const chip = tripChip(e);
  if (chip) parts.push(chip.toLowerCase());
  return parts.join(', ');
}

/** Forget what was loaded (tests and sign-out). */
export function _resetPlan(): void {
  planEntries.value = [];
  notOnTrip.value = 0;
  lateMeals.value = [];
  planState.value = 'idle';
  planFailed.value = false;
  planToday.value = localDate();
  planMealRequested.value = false;
  planNotice.value = null;
  tripOpen.value = null;
}
