// #916: the Foods tab's reads (forage/docs/design/916-trends-foods.md). The log-based cards share one load
// (`getFoodLog` over the range, with `getFoods` and `getRecipes` for names); Most cooked has its own. Each keeps
// the last request only, so a slower, older answer never replaces a newer one.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { Cook, Food, FoodLogEntry, RecipeSummary } from '../api/types';
import { localDate } from '../cook/format';
import { rangeFrom } from './energy';
import { ALL_FROM } from './trends-store';
import type { RangeId } from './trends-types';

export type LoadState = 'loading' | 'ready' | 'error';

export interface FoodsLog {
  state: LoadState;
  /** The range these entries were read for. */
  range: RangeId | null;
  entries: FoodLogEntry[];
  foods: Map<string, Food>;
  recipes: Map<string, RecipeSummary>;
}

const emptyLog = (): FoodsLog => ({
  state: 'loading',
  range: null,
  entries: [],
  foods: new Map(),
  recipes: new Map(),
});

export const foodsLog = signal<FoodsLog>(emptyLog());
export const foodsCooks = signal<{ state: LoadState; cooks: Cook[] }>({ state: 'loading', cooks: [] });
/** The device's today when the range was read: what the range and the cooks are cut against. */
export const foodsToday = signal(localDate());

let latestLog = 0;
let latestCooks = 0;

/** The first date of a range, ending today inclusive; All reads from before anything can be logged. */
export const foodsFrom = (range: RangeId, today: string) => (range === 'All' ? ALL_FROM : rangeFrom(range, today));

/** Read the log for `range`, unless it is already held for it. */
export async function loadFoodsLog(api: ForageApi, range: RangeId, force = false): Promise<void> {
  const held = foodsLog.value;
  const today = localDate();
  if (!force && held.state === 'ready' && held.range === range && foodsToday.value === today) {
    latestLog++;
    return;
  }
  const seq = ++latestLog;
  foodsLog.value = { ...emptyLog(), range };
  try {
    const [entries, foods, recipes] = await Promise.all([
      api.getFoodLog(foodsFrom(range, today), today),
      api.getFoods(),
      api.getRecipes(),
    ]);
    if (seq !== latestLog) return;
    foodsToday.value = today;
    foodsLog.value = {
      state: 'ready',
      range,
      entries,
      foods: new Map(foods.map((f) => [f.id, f])),
      recipes: new Map(recipes.map((r) => [r.id, r])),
    };
  } catch {
    if (seq !== latestLog) return;
    foodsLog.value = { ...emptyLog(), state: 'error', range };
  }
}

/** Read every cook once for the visit; the range is applied in the app. */
export async function loadFoodsCooks(api: ForageApi, force = false): Promise<void> {
  if (!force && foodsCooks.value.state === 'ready') {
    latestCooks++;
    return;
  }
  const seq = ++latestCooks;
  foodsCooks.value = { state: 'loading', cooks: [] };
  try {
    const cooks = await api.getCooks();
    if (seq !== latestCooks) return;
    foodsCooks.value = { state: 'ready', cooks };
  } catch {
    if (seq !== latestCooks) return;
    foodsCooks.value = { state: 'error', cooks: [] };
  }
}

/** Forget what was read: Trends reads fresh each visit. */
export function resetFoods(): void {
  latestLog++;
  latestCooks++;
  foodsLog.value = emptyLog();
  foodsCooks.value = { state: 'loading', cooks: [] };
  foodsToday.value = localDate();
}
