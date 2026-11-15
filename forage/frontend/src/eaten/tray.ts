// The Add sheet's tray (#933): what the owner has picked for a meal and not saved yet. Nothing here touches the
// network. An item carries the amount it will go in at; its figures are worked out here (#929's `preview.ts`), and one
// `logMeal` (#930) saves the whole tray. The API stores every figure; the sums here are for the sheet's labels only.
import type {
  Combo,
  Food,
  FoodLogEntry,
  LogMealInput,
  LogMealItem,
  RecipeSummary,
  Slot,
  Usual,
  UsualOption,
} from '../api/types';
import { chosen } from '../library/combos-store';
import { displayName } from '../library/food-math';
import { labelOf, startOption } from '../library/usuals-store';
import { fractionQty, minQty, stepQty, switchUnit, type UnitOption } from './amount-edit';
import type { LogTarget } from './amount-sheet';
import { defaultQty, newLogId, tenth, wholeKcal } from './format';
import { previewFood, previewRecipe, type EntryNutrition } from './preview';

/** A meal holds at most 30 items (`logMeal`'s own limit). */
export const TRAY_MAX = 30;
export const TRAY_FULL = 'A meal can hold 30 items at a time.';

/** The heading a set of items sits under: a usual's name, or a combo's. `usualId` is set for a usual. */
export interface TrayGroup {
  key: string;
  name: string;
  usualId?: string;
}

/** One thing in the tray, at the amount it will be logged in. Its `id` is fixed when it enters, so a retry leaves one entry. */
export interface TrayItem {
  id: string;
  target: LogTarget;
  qty: number;
  unit: string;
  group?: TrayGroup;
  /** The usual's line an item fills, for `usual_line_id`. */
  lineId?: string;
  /** A pick-one's options (a usual's or a combo's); the item is one of them. */
  options?: UsualOption[];
  /** #942: a usual's optional line: `in` starts on, `out` starts off. Its chip turns the item on and off. */
  optional?: 'in' | 'out';
  /** An optional line that is off holds its place here, so its chip shows; it is not counted, shown or saved. */
  off?: boolean;
  /** Where an optional line comes in when its chip turns it on: its Always food, or its last pick (else first option). */
  home?: { food: Food; qty: number; unit: string };
}

/** The tray as the screen holds it while the Add sheet is open or a sheet over it is. */
export interface Pass {
  slot: Slot;
  /** The day the sheet was opened for: everything is logged to it, even past midnight. */
  date: string;
  items: TrayItem[];
  /** The search text, kept while another sheet is over the Add sheet. */
  q: string;
}

export const targetId = (t: LogTarget) => (t.kind === 'food' ? t.food.id : t.recipe.id);
export const targetName = (t: LogTarget) => (t.kind === 'food' ? displayName(t.food) : t.recipe.name);

/** The loose item for a food or recipe, or undefined: what makes a row show its check. */
export function looseItem(items: TrayItem[], target: LogTarget): TrayItem | undefined {
  const id = targetId(target);
  return items.find((i) => !i.group && targetId(i.target) === id && i.target.kind === target.kind);
}

// ---- figures

/** The figures of an item's amount, or null for a unit the food has no weight for. */
export function itemFigures(item: TrayItem): EntryNutrition | null {
  return item.target.kind === 'food'
    ? previewFood(item.target.food, item.qty, item.unit)
    : previewRecipe(item.target.recipe, item.qty);
}

export interface TrayTotals {
  count: number;
  /** The known kcal added up; null when no item has any. */
  kcal: number | null;
  /** Some item is unknown or partial, so the true total is higher. */
  plus: boolean;
}

/** The items that are in the meal: an optional line that is off is not one. */
export const liveItems = (items: TrayItem[]) => items.filter((i) => !i.off);

export function trayTotals(allItems: TrayItem[]): TrayTotals {
  const items = liveItems(allItems);
  let kcal: number | null = null;
  let plus = false;
  for (const item of items) {
    const f = itemFigures(item);
    if (!f || f.kcal === null) {
      plus = true;
      continue;
    }
    if (f.partial) plus = true;
    kcal = (kcal ?? 0) + f.kcal;
  }
  return { count: items.length, kcal, plus };
}

/** `455 kcal`, `455+ kcal`, or null when nothing is known. */
export function kcalText(t: Pick<TrayTotals, 'kcal' | 'plus'>): string | null {
  return t.kcal === null ? null : `${wholeKcal(t.kcal)}${t.plus ? '+' : ''} kcal`;
}

/** The footer button: `Add 5 to breakfast · 455 kcal`. */
export function footerText(t: TrayTotals, slot: Slot): string {
  const k = kcalText(t);
  return `Add ${t.count} to ${slot.toLowerCase()}${k ? ` · ${k}` : ''}`;
}

/** The label row's figures: `5 · 455 kcal`. */
export function labelFigures(t: TrayTotals): string {
  const k = kcalText(t);
  return k ? `${t.count} · ${k}` : String(t.count);
}

/** An amount as a pill or a row says it: `1 mug`, `1½ servings`, `150 g`. */
export function amountText(qty: number, unit: string, recipe: boolean): string {
  if (recipe) return `${fractionQty(qty)} ${qty === 1 ? 'serving' : 'servings'}`;
  return `${fractionQty(qty)} ${unit}`;
}

// ---- what a tap adds

/** The newest entry of each food and recipe in the log, by id. */
export function lastEntries(log: FoodLogEntry[]): Map<string, FoodLogEntry> {
  const out = new Map<string, FoodLogEntry>();
  for (const e of log) {
    const key = e.food_id || e.recipe_id;
    if (!key) continue;
    const had = out.get(key);
    if (!had || e.logged_at > had.logged_at) out.set(key, e);
  }
  return out;
}

/** #712's default: one of the first serving, or 100 g for a food with none. */
export function defaultFoodAmount(food: Food): { qty: number; unit: string } {
  const unit = food.servings_json?.[0]?.name ?? 'g';
  return { qty: defaultQty(unit), unit };
}

/**
 * The amount a food or recipe goes in at: its newest entry's, when that unit is still one of the food's servings or
 * `g`; otherwise #712's default, and a recipe's is one serving.
 */
export function startAmount(target: LogTarget, last: Map<string, FoodLogEntry>): { qty: number; unit: string } {
  if (target.kind === 'recipe') {
    const e = last.get(target.recipe.id);
    return { qty: e && e.qty > 0 ? e.qty : 1, unit: 'serving' };
  }
  const e = last.get(target.food.id);
  if (e && e.qty > 0 && (e.unit === 'g' || (target.food.servings_json ?? []).some((s) => s.name === e.unit))) {
    return { qty: e.qty, unit: e.unit };
  }
  return defaultFoodAmount(target.food);
}

/** A row of the lists: what a tap puts in the tray, and what it will cost. */
export function rowAmount(target: LogTarget, last: Map<string, FoodLogEntry>) {
  const { qty, unit } = startAmount(target, last);
  const f = target.kind === 'food' ? previewFood(target.food, qty, unit) : previewRecipe(target.recipe, qty);
  return { qty, unit, kcal: f?.kcal ?? null, text: amountText(qty, unit, target.kind === 'recipe') };
}

export function newItem(target: LogTarget, last: Map<string, FoodLogEntry>): TrayItem {
  const { qty, unit } = startAmount(target, last);
  return { id: newLogId(), target, qty, unit };
}

let groups = 0;
const newGroupKey = () => `g${++groups}`;

/** A usual's lines as a group: each Always line at its amount, a pick-one at its last pick, else its first option. */
export function usualItems(usual: Usual, foods: Map<string, Food>): TrayItem[] {
  const group: TrayGroup = { key: newGroupKey(), name: usual.name.slice(0, 120), usualId: usual.id };
  const out: TrayItem[] = [];
  for (const line of usual.lines) {
    const start = line.options ? startOption(line.options, line.last_pick) : null;
    const foodId = start ? start.food_id : line.food_id;
    const food = foods.get(foodId);
    if (!food) continue;
    const qty = start ? start.qty : (line.qty ?? 1);
    const unit = start ? start.unit : line.unit;
    const optional = line.optional === 'in' || line.optional === 'out' ? line.optional : undefined;
    out.push({
      id: newLogId(),
      target: { kind: 'food', food },
      qty,
      unit,
      group,
      lineId: line.line_id,
      options: line.options ? line.options.map((o) => ({ ...o })) : undefined,
      ...(optional ? { optional, home: { food, qty, unit }, ...(optional === 'out' ? { off: true } : {}) } : {}),
    });
  }
  return out;
}

/** A combo's foods as a group named for it, each pick-one at its default. */
export function comboItems(combo: Combo, foods: Map<string, Food>): TrayItem[] {
  const group: TrayGroup = { key: newGroupKey(), name: combo.name.slice(0, 120) };
  const out: TrayItem[] = [];
  for (const line of combo.lines) {
    const c = chosen(line);
    const food = foods.get(c.food_id);
    if (!food) continue;
    out.push({
      id: newLogId(),
      target: { kind: 'food', food },
      qty: c.qty,
      unit: c.unit,
      group,
      options: line.options ? line.options.map((o) => ({ ...o })) : undefined,
    });
  }
  return out;
}

// ---- editing the tray

/** Removing an optional line's item turns it off and keeps its chip (#942); any other item is gone. */
export const removeItem = (items: TrayItem[], id: string) =>
  items.flatMap((i): TrayItem[] => (i.id !== id ? [i] : i.optional ? [turned(i, false)] : []));

/** An optional line's item on or off, at its home amount: what a chip tap does (#942). */
export function turned(item: TrayItem, on: boolean): TrayItem {
  const { off: _off, ...rest } = item;
  const home = item.home;
  const base = home
    ? { ...rest, target: { kind: 'food' as const, food: home.food }, qty: home.qty, unit: home.unit }
    : rest;
  return on ? base : { ...base, off: true };
}

export const toggleChip = (items: TrayItem[], id: string) =>
  items.map((i) => (i.id === id && i.optional ? turned(i, !!i.off) : i));
export const removeGroup = (items: TrayItem[], key: string) => items.filter((i) => i.group?.key !== key);

export function setAmount(items: TrayItem[], id: string, qty: number, unit: string): TrayItem[] {
  return items.map((i) => (i.id === id ? { ...i, qty, unit } : i));
}

/** A pick-one's choice: the item becomes that option's food at the option's own amount. */
export function pickOption(items: TrayItem[], id: string, option: UsualOption, foods: Map<string, Food>): TrayItem[] {
  const food = foods.get(option.food_id);
  if (!food) return items;
  return items.map((i) =>
    i.id === id ? { ...i, target: { kind: 'food', food }, qty: option.qty, unit: option.unit } : i,
  );
}

/** The units an item offers: the food's servings in order, then grams; a recipe has none. */
export function unitChoices(food: Food): UnitOption[] {
  const out: UnitOption[] = (food.servings_json ?? []).map((s) => ({
    unit: s.name,
    grams: s.g,
    label: `${s.name} (${tenth(s.g)} g)`,
  }));
  out.push({ unit: 'g', grams: 1, label: 'grams' });
  return out;
}

/** The amount after a step up or down, and after a change of unit (same weight, as #883's switch does). */
export const stepItem = (item: TrayItem, dir: 1 | -1) => stepQty(item.qty, item.unit, dir);
export const atMinimum = (item: TrayItem) => item.qty <= minQty(item.unit);
export function switchedAmount(item: TrayItem, to: UnitOption): number {
  if (item.target.kind !== 'food') return item.qty;
  const from = unitChoices(item.target.food).find((o) => o.unit === item.unit);
  return switchUnit(item.qty, from, to);
}

// ---- saving

/** The one `logMeal`: every item in tray order, loose ones with no group, each group under its own key. */
export function mealInput(date: string, slot: Slot, items: TrayItem[]): LogMealInput {
  return {
    date,
    slot,
    items: liveItems(items).map((i): LogMealItem => {
      const group = i.group
        ? {
            group: {
              key: i.group.key,
              name: i.group.name,
              ...(i.group.usualId ? { usual_id: i.group.usualId } : {}),
              ...(i.group.usualId && i.lineId ? { usual_line_id: i.lineId } : {}),
            },
          }
        : {};
      return i.target.kind === 'food'
        ? { id: i.id, food_id: i.target.food.id, qty: i.qty, unit: i.unit, ...group }
        : { id: i.id, recipe_id: i.target.recipe.id, qty: i.qty, unit: 'serving' };
    }),
  };
}

/** The entries the day shows while the write is out: the figures worked out here, the group heading, `Saving…`. */
export function provisionalEntries(callId: string, date: string, slot: Slot, items: TrayItem[]): FoodLogEntry[] {
  const at = new Date().toISOString();
  return liveItems(items).map((i) => {
    const f = itemFigures(i);
    const recipe = i.target.kind === 'recipe';
    return {
      ...(f ?? { grams: null, kcal: null, protein_g: null, carbs_g: null, fat_g: null, partial: true }),
      id: i.id,
      date,
      slot,
      food_id: i.target.kind === 'food' ? i.target.food.id : '',
      recipe_id: i.target.kind === 'recipe' ? i.target.recipe.id : '',
      qty: i.qty,
      unit: recipe ? 'serving' : i.unit,
      source: 'app',
      logged_at: at,
      created: at,
      updated: at,
      group_id: i.group ? `${callId}:${i.group.key}` : '',
      group_name: i.group?.name ?? '',
      usual_id: i.group?.usualId ?? '',
      usual_line_id: i.group?.usualId ? (i.lineId ?? '') : '',
    } as FoodLogEntry;
  });
}

/** `Added 5 to breakfast`, or `Added Coffee with milk to breakfast` for one. */
export function addedMealToast(items: { name: string }[], slot: Slot): string {
  const meal = slot.toLowerCase();
  return items.length === 1 ? `Added ${items[0].name} to ${meal}` : `Added ${items.length} to ${meal}`;
}

export function removedMealToast(items: { name: string }[], slot: Slot): string {
  const meal = slot.toLowerCase();
  return items.length === 1 ? `Removed ${items[0].name} from ${meal}` : `Removed ${items.length} from ${meal}`;
}

/** `Couldn't save 5 items.` */
export const couldntSave = (n: number) => `Couldn't save ${n} ${n === 1 ? 'item' : 'items'}.`;

/** The close prompt's title: `Add 5 items to breakfast?` */
export const closePromptTitle = (n: number, slot: Slot) =>
  `Add ${n} ${n === 1 ? 'item' : 'items'} to ${slot.toLowerCase()}?`;

// ---- words for the lists

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `today`, `yesterday`, the weekday within the last week, else `Mon 2 Nov`. */
export function whenWord(date: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (days < 7) return WEEKDAYS[weekday];
  return `${WEEKDAYS[weekday].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
}

/** An Often eaten together row's line two: `6 times · last Thursday`. */
export const comboWhen = (c: Combo, today: string) => `${c.meals} times · last ${whenWord(c.last_date, today)}`;

/** The usuals whose name, or any of whose foods, contains the text; this meal's first, then by last used. */
export function usualsMatching(usuals: Usual[], slot: Slot, text: string, foods: Map<string, Food>): Usual[] {
  const needle = text.trim().toLowerCase();
  const names = (u: Usual) =>
    u.lines.flatMap((l) => (l.options ? l.options.map((o) => o.food_id) : [l.food_id])).map((id) => foods.get(id));
  return usuals
    .filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        names(u).some((f) => f && `${f.name} ${f.short_name ?? ''}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      const mine = Number(b.slot === slot) - Number(a.slot === slot);
      if (mine) return mine;
      if (a.last_used !== b.last_used) {
        if (!a.last_used) return 1;
        if (!b.last_used) return -1;
        return a.last_used < b.last_used ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
}

/** What a pick-one button says. */
export const optionLabel = (foods: Map<string, Food>, o: UsualOption) => labelOf(foods.get(o.food_id));

/** The foods and recipes whose name, brand or short name contains the text: foods first, then recipes, at most `max`. */
export function searchTargets(q: string, foods: Food[], recipes: RecipeSummary[], max = 20): LogTarget[] {
  const needle = q.trim().toLowerCase();
  const fs: LogTarget[] = foods
    .filter((f) => `${f.name} ${f.brand ?? ''} ${f.short_name ?? ''}`.toLowerCase().includes(needle))
    .map((food) => ({ kind: 'food', food }));
  const rs: LogTarget[] = recipes
    .filter((r) => r.name.toLowerCase().includes(needle))
    .map((recipe) => ({ kind: 'recipe', recipe }));
  return [...fs, ...rs].slice(0, max);
}
