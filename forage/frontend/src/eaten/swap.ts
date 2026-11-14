// Swapping a food in a usual's group, and saving a usual from a meal (#886): which amount carries over, how the lists
// are ordered, and the words. Display and wiring only: the API stores every figure (a swap is `updateLogEntry`, a save
// is `upsertUsual` then `setLogGroup`); the one sum here is the New usual sheet's numbers card, of stored snapshots.
import type { Food, FoodLogEntry, Usual, UsualInput, UsualLine, UsualLineInput, UsualOption } from '../api/types';
import { labelOf } from '../library/usuals-store';
import { fractionQty } from './amount-edit';

/** An amount for a food. */
export type Amount = { qty: number; unit: string };

const round025 = (n: number) => Math.round(n * 4) / 4;

/** The weight of an amount in grams; null when the food has no such serving. */
export function amountGrams(food: Food, a: Amount): number | null {
  if (a.unit === 'g') return a.qty;
  const per = food.servings_json?.find((s) => s.name === a.unit)?.g;
  return typeof per === 'number' ? per * a.qty : null;
}

/**
 * The amount an entry carries over to another food: the same quantity when the food has a serving of the entry's
 * unit (1 tbsp stays 1 tbsp), else the same weight in its first serving, to the nearest 0.25; grams stay grams.
 */
export function swapAmount(entry: FoodLogEntry, food: Food): Amount {
  if (entry.unit === 'g') return { qty: entry.qty, unit: 'g' };
  if (food.servings_json?.some((s) => s.name === entry.unit)) return { qty: entry.qty, unit: entry.unit };
  const first = food.servings_json?.[0];
  const grams = entry.grams;
  if (typeof grams !== 'number' || !(grams > 0)) {
    return first ? { qty: 1, unit: first.name } : { qty: 100, unit: 'g' };
  }
  if (!first) return { qty: Math.max(1, Math.round(grams)), unit: 'g' };
  return { qty: Math.max(0.25, round025(grams / first.g)), unit: first.name };
}

/** `1 tbsp`, `150 g`. */
export const amountText = (a: Amount) =>
  a.unit === 'g' ? `${fractionQty(a.qty)} g` : `${fractionQty(a.qty)} ${a.unit}`;

/** An amount's kcal worked out from the food for a list row; null when the food lacks nutrition or the serving. */
export function amountKcal(food: Food, a: Amount): number | null {
  if (typeof food.kcal_100g !== 'number') return null;
  const grams = amountGrams(food, a);
  return grams === null ? null : (food.kcal_100g * grams) / 100;
}

/** Foods matching a search by name, short name or brand; all of them when the search is empty. */
export function matchFoods(foods: Food[], q: string): Food[] {
  const want = q.trim().toLowerCase();
  if (!want) return foods;
  return foods.filter((f) => `${f.name} ${f.short_name ?? ''} ${f.brand ?? ''}`.toLowerCase().includes(want));
}

const byName = (a: Food, b: Food) => a.name.localeCompare(b.name);

export interface SwapSections {
  /** The line's own food, when the entry has been swapped away from it and nothing is searched. */
  usual: Food | null;
  before: { food: Food; count: number }[];
  /** The library, minus the entry's food and what the other sections show. */
  any: Food[];
  /** Foods are matched by a search (the last section reads `Foods`). */
  searching: boolean;
}

/**
 * The Swap sheet's lists: Your usual (when the entry is not on the line's food), Swapped in before (the line's `swaps`,
 * most first), then any food: five before searching, every match after. The entry's own food is never offered.
 */
export function swapSections(
  entry: FoodLogEntry,
  line: UsualLine,
  swaps: UsualLine['swaps'],
  foods: Food[],
  q: string,
): SwapSections {
  const searching = !!q.trim();
  const byId = new Map(foods.map((f) => [f.id, f]));
  const own = entry.food_id;
  const back = own !== line.food_id ? (byId.get(line.food_id) ?? null) : null;
  const usual = back && !searching ? back : null;
  const before = [...swaps]
    .sort((a, b) => b.count - a.count)
    .flatMap((s) => {
      const food = byId.get(s.food_id);
      return food && food.id !== own && food.id !== line.food_id && matchFoods([food], q).length
        ? [{ food, count: s.count }]
        : [];
    });
  const shown = new Set<string>([own, ...(usual ? [usual.id] : []), ...before.map((s) => s.food.id)]);
  const rest = foods.filter((f) => !shown.has(f.id));
  const any = searching ? matchFoods(rest, q).sort(byName).slice(0, 60) : [...rest].sort(byName).slice(0, 5);
  return { usual, before, any, searching };
}

/** `Swapped in Peanut butter for this day`, or `Back to Almond butter` when the swap returns to the line's food. */
export function swapToast(foodName: string, back: boolean): string {
  return back ? `Back to ${foodName}` : `Swapped in ${foodName} for this day`;
}

/** `Oatmeal now asks: Almond butter or Peanut butter`. */
export function pickOneToast(usual: string, a: string, b: string): string {
  return `${usual} now asks: ${a} or ${b}`;
}

/** A Make it a pick-one item the group menu offers: an entry on an Always line, swapped to another food. */
export interface PickOneOffer {
  entryId: string;
  /** The line's food and the entry's, as the menu labels them. */
  from: string;
  to: string;
  /** How many times this line has been swapped to this food, this swap included. */
  count: number;
}

/** After this many swaps of one line to one food, the menu marks Make it a pick-one as Suggested. */
export const SUGGEST_AFTER = 3;

/** The group's entries that are a swapped Always line, one offer each. */
export function pickOneOffers(entries: FoodLogEntry[], usual: Usual, foods: Map<string, Food>): PickOneOffer[] {
  const out: PickOneOffer[] = [];
  for (const e of entries) {
    const line = usual.lines.find((l) => l.line_id === e.usual_line_id);
    if (!line || line.options || !e.food_id || e.food_id === line.food_id) continue;
    out.push({
      entryId: e.id,
      from: labelOf(foods.get(line.food_id)),
      to: labelOf(foods.get(e.food_id)),
      count: line.swaps.find((s) => s.food_id === e.food_id)?.count ?? 1,
    });
  }
  return out;
}

/** The usual with one Always line turned into a pick-one of its food and the entry's, at their own amounts. */
export function pickOneInput(usual: Usual, entry: FoodLogEntry): UsualInput {
  const lines: UsualLineInput[] = usual.lines.map((l) => {
    if (l.line_id === entry.usual_line_id) {
      const was: UsualOption = { food_id: l.food_id, qty: l.qty ?? 1, unit: l.unit };
      const now: UsualOption = { food_id: entry.food_id, qty: entry.qty, unit: entry.unit };
      return { line_id: l.line_id, options: [was, now], last_pick: entry.food_id };
    }
    if (l.options) return { line_id: l.line_id, options: l.options.map((o) => ({ ...o })), last_pick: l.last_pick };
    return { line_id: l.line_id, food_id: l.food_id, qty: l.qty ?? 1, unit: l.unit };
  });
  return { id: usual.id, name: usual.name, slot: usual.slot, lines };
}

/** The foods of the same category logged in the last 60 days, most logged first, for a line's Pick each time options. */
export function optionCandidates(food: Food, foods: Food[], counts: Map<string, number>, limit = 4): Food[] {
  const category = (food.category ?? '').trim();
  if (!category) return [];
  return foods
    .filter((f) => f.id !== food.id && (f.category ?? '').trim() === category && (counts.get(f.id) ?? 0) > 0)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || byName(a, b))
    .slice(0, limit);
}

/** A New usual line's state: its food at the amount logged, whether it picks each time, and its options (food first). */
export interface NewLine {
  entry: FoodLogEntry;
  food: Food;
  pick: boolean;
  options: Food[];
}

/** A line needs a second option before it can be saved as a pick-one. */
export const needsOption = (l: NewLine) => l.pick && l.options.length < 2;

/** What `upsertUsual` takes: an Always line, or a pick-one of each option at its carried-over amount. */
export function newUsualInput(id: string, name: string, slot: UsualInput['slot'], lines: NewLine[]): UsualInput {
  return {
    id,
    name: name.trim(),
    slot,
    lines: lines.map((l): UsualLineInput => {
      const own: UsualOption = { food_id: l.entry.food_id, qty: l.entry.qty, unit: l.entry.unit };
      if (!l.pick) return own;
      return {
        options: l.options.map((f) => (f.id === own.food_id ? own : { food_id: f.id, ...swapAmount(l.entry, f) })),
        last_pick: own.food_id,
      };
    }),
  };
}
