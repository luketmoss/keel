// #916: the counting behind the Foods tab (forage/docs/design/916-trends-foods.md). Pure, like meals.ts: the log's
// entries are ranked, counted and grouped in the app, so the figures are exact. A blank is never 0 here either.
import type { Cook, Food, FoodLogEntry, RecipeSummary } from '../api/types';
import { wholeKcal } from '../eaten/format';
import { displayName } from '../library/food-math';
import type { FoodMetric } from './trends-types';

export const TOP = 7;

interface MetricInfo {
  field: 'kcal' | 'protein_g' | 'sodium_mg' | 'added_sugars_g';
  /** The metric in a sentence: `of sodium`, `the calories logged`. */
  noun: string;
  /** After `no`: `no calories`, `no sodium value`. */
  missing: string;
  /** After `entries in this range`: `have nutrition`, `report sodium`. */
  none: string;
  /** The amount's unit for a screen reader, singular and plural. */
  unit: [string, string];
}

export const METRIC_INFO: Record<FoodMetric, MetricInfo> = {
  kcal: {
    field: 'kcal',
    noun: 'calories',
    missing: 'no calories',
    none: 'have nutrition',
    unit: ['calorie', 'calories'],
  },
  protein: {
    field: 'protein_g',
    noun: 'protein',
    missing: 'no protein value',
    none: 'report protein',
    unit: ['gram', 'grams'],
  },
  sodium: {
    field: 'sodium_mg',
    noun: 'sodium',
    missing: 'no sodium value',
    none: 'report sodium',
    unit: ['milligram', 'milligrams'],
  },
  added_sugars: {
    field: 'added_sugars_g',
    noun: 'added sugars',
    missing: 'no added sugars value',
    none: 'report added sugars',
    unit: ['gram', 'grams'],
  },
};

/** An amount as the row shows it: whole numbers with a thousands separator; added sugars to a tenth under 10. */
export function amountText(metric: FoodMetric, n: number): string {
  if (metric === 'kcal') return `${wholeKcal(n)} kcal`;
  if (metric === 'sodium') return `${wholeKcal(n)} mg`;
  if (metric === 'added_sugars' && n < 10) return `${Math.round(n * 10) / 10} g`;
  return `${wholeKcal(n)} g`;
}

/** The same amount as words for a screen reader. */
export function amountWords(metric: FoodMetric, n: number): string {
  const shown = metric === 'added_sugars' && n < 10 ? String(Math.round(n * 10) / 10) : wholeKcal(n);
  const [one, many] = METRIC_INFO[metric].unit;
  return `${shown} ${shown === '1' ? one : many}`;
}

export const timesWord = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

export interface RankedItem {
  /** `food:<id>` or `recipe:<id>`: a recipe and a food of the same name are two items. */
  key: string;
  kind: 'food' | 'recipe';
  /** The food, while it exists; null for a recipe and for a food since removed. */
  food: Pick<Food, 'brand' | 'name'> | null;
  /** The name as a sentence: the food (brand then name), the recipe, or `Removed food` / `Removed recipe`. */
  name: string;
  amount: number;
  /** Entries in the range, whether or not they had a value. */
  times: number;
  /** Whole percentage of the total; `<1%` for a real value that rounds to 0. */
  shareText: string;
  /** Percent of the top item's amount, for the meter. */
  meter: number;
}

export interface Ranking {
  /** The top `TOP` items with an amount above 0. */
  items: RankedItem[];
  /** Entries read (an unreadable one is skipped). */
  entries: number;
  /** Entries with the metric blank. */
  blank: number;
  /** Some entry reports the metric (so the total is above 0 or a measured 0). */
  reported: boolean;
}

/** The ranking behind What drives it. A logged recipe ranks as itself; blanks add nothing; shares are of all items. */
export function rankFoods(
  entries: FoodLogEntry[],
  metric: FoodMetric,
  foods: Map<string, Food>,
  recipes: Map<string, RecipeSummary>,
): Ranking {
  const field = METRIC_INFO[metric].field;
  const byKey = new Map<string, { kind: 'food' | 'recipe'; id: string; amount: number; times: number }>();
  let blank = 0;
  let read = 0;
  let reported = false;
  let total = 0;
  for (const e of entries) {
    const kind = e.food_id ? 'food' : e.recipe_id ? 'recipe' : null;
    if (!kind) continue;
    read++;
    const id = kind === 'food' ? e.food_id : e.recipe_id;
    const key = `${kind}:${id}`;
    const item = byKey.get(key) ?? { kind, id, amount: 0, times: 0 };
    item.times++;
    const v = e[field];
    if (typeof v === 'number') {
      item.amount += v;
      total += v;
      reported = true;
    } else {
      blank++;
    }
    byKey.set(key, item);
  }
  const named = [...byKey].map(([key, i]) => {
    const food = i.kind === 'food' ? (foods.get(i.id) ?? null) : null;
    const name =
      i.kind === 'food'
        ? food
          ? displayName(food)
          : 'Removed food'
        : (recipes.get(i.id)?.name?.trim() ?? '') || 'Removed recipe';
    return { key, kind: i.kind, food, name, amount: i.amount, times: i.times };
  });
  const listed = named
    .filter((i) => i.amount > 0)
    .sort((a, b) => b.amount - a.amount || b.times - a.times || a.name.localeCompare(b.name))
    .slice(0, TOP);
  const top = listed[0]?.amount ?? 0;
  const items = listed.map((i): RankedItem => {
    const pct = total > 0 ? Math.round((i.amount / total) * 100) : 0;
    return {
      ...i,
      shareText: pct === 0 ? '<1%' : `${pct}%`,
      meter: top > 0 ? (i.amount / top) * 100 : 0,
    };
  });
  return { items, entries: read, blank, reported };
}

export interface UsualStat {
  id: string;
  /** The heading it was last logged under. */
  name: string;
  /** Times added: distinct groups. */
  count: number;
  /** The meal it was most often added to. */
  slot: string;
  meter: number;
}

const stamp = (e: Pick<FoodLogEntry, 'date' | 'logged_at'>) => `${e.date} ${e.logged_at ?? ''}`;

/** The usuals added most often: one time per `group_id`, named by the latest group, with the meal it is usually for. */
export function rankUsuals(entries: FoodLogEntry[]): UsualStat[] {
  interface Group {
    at: string;
    name: string;
    slot: string;
  }
  const usuals = new Map<string, Map<string, Group>>();
  for (const e of entries) {
    if (!e.usual_id) continue;
    const gid = e.group_id || `entry:${e.id}`;
    const groups = usuals.get(e.usual_id) ?? new Map<string, Group>();
    const g = groups.get(gid);
    const at = stamp(e);
    // A group's heading and meal come from its latest entry.
    if (!g || at > g.at) groups.set(gid, { at, name: e.group_name ?? '', slot: e.slot });
    usuals.set(e.usual_id, groups);
  }
  const stats = [...usuals].map(([id, groups]) => {
    const list = [...groups.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const counts = new Map<string, number>();
    for (const g of list) counts.set(g.slot, (counts.get(g.slot) ?? 0) + 1);
    const most = Math.max(...counts.values());
    // list is newest first, so the first group whose slot is among the most common is the tie-break.
    const slot = list.find((g) => counts.get(g.slot) === most)!.slot;
    return { id, name: list[0].name.trim() || 'Usual', count: list.length, slot, at: list[0].at };
  });
  const ranked = stats
    .sort((a, b) => b.count - a.count || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || a.name.localeCompare(b.name))
    .slice(0, TOP);
  const top = ranked[0]?.count ?? 0;
  return ranked.map((s) => ({
    id: s.id,
    name: s.name,
    count: s.count,
    slot: s.slot,
    meter: top ? (s.count / top) * 100 : 0,
  }));
}

export interface CookedStat {
  recipeId: string;
  name: string;
  /** Cooks in the range. */
  count: number;
  /** The latest non-blank rating across all the recipe's cooks, in or out of the range. */
  rating: number | null;
}

const cookStamp = (c: Pick<Cook, 'date' | 'created'>) => `${c.date} ${c.created ?? ''}`;
const rated = (c: Cook) => typeof c.rating === 'number' && c.rating >= 1;

/** The recipes cooked most in `from` to `to` (dates, inclusive), each with its latest rating from all its cooks. */
export function rankCooked(cooks: Cook[], from: string, to: string): CookedStat[] {
  const latestRating = new Map<string, Cook>();
  for (const c of cooks) {
    if (!rated(c)) continue;
    const was = latestRating.get(c.recipe_id);
    if (!was || cookStamp(c) > cookStamp(was)) latestRating.set(c.recipe_id, c);
  }
  const mine = new Map<string, { name: string; count: number; at: string }>();
  for (const c of cooks) {
    if (!c.recipe_id || c.date < from || c.date > to) continue;
    const s = mine.get(c.recipe_id) ?? { name: c.recipe_name, count: 0, at: '' };
    s.count++;
    if (cookStamp(c) > s.at) {
      s.at = cookStamp(c);
      s.name = c.recipe_name || s.name;
    }
    mine.set(c.recipe_id, s);
  }
  return [...mine]
    .map(([recipeId, s]) => ({
      recipeId,
      name: s.name.trim() || 'Removed recipe',
      count: s.count,
      at: s.at,
      rating: latestRating.get(recipeId)?.rating ?? null,
    }))
    .sort((a, b) => b.count - a.count || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || a.name.localeCompare(b.name))
    .slice(0, TOP)
    .map(({ recipeId, name, count, rating }) => ({ recipeId, name, count, rating }));
}
