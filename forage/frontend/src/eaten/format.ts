// Eaten's words (#712): how a day, an entry's amount and a figure are named. Rounding here is for display only;
// every figure comes from the API, and nothing here adds anything up.
import type { Food, FoodLogEntry, RecipeSummary } from '../api/types';
import { displayName, hasNutrition, kcalLine } from '../library/food-math';
import { addDays } from '../plan/dates';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** The header's day: `Today`, `Yesterday`, or `Mon 2 Nov`. */
export function dayTitle(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const { m, d, weekday } = parts(date);
  return `${WEEKDAYS[weekday].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** The full date under it: `Monday 2 November 2026`. */
export function fullDate(date: string): string {
  const { y, m, d, weekday } = parts(date);
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** The day as a recipe's note gives it: `Mon 2 Nov 2026`. */
export function noteDate(date: string): string {
  const { y, m, d, weekday } = parts(date);
  return `${WEEKDAYS[weekday].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** `today`, or the weekday: "Nothing logged today." / "Nothing logged on Monday." */
export function nothingLogged(date: string, today: string): string {
  return date === today ? 'Nothing logged today.' : `Nothing logged on ${WEEKDAYS[parts(date).weekday]}.`;
}

/** `today's`, `Monday's`. */
export function dayPossessive(date: string, today: string): string {
  return date === today ? "today's" : `${WEEKDAYS[parts(date).weekday]}'s`;
}

/** `1,240`. */
export const wholeKcal = (n: number) => Math.round(n).toLocaleString('en-US');

/** `62 g`, or `—` when unknown. Grams to the whole number, as the day card shows them. */
export const wholeGrams = (n: number | null) => (n === null ? '—' : `${Math.round(n)} g`);

/** `0.4`, `6`: a stored figure to 0.1, as the amount sheet shows it. */
export const tenth = (n: number) => String(Math.round(n * 10) / 10);

/** `Protein 6 g · Carbs 9 g · Fat 0.4 g`. */
export function macrosLine(m: { protein_g: number | null; carbs_g: number | null; fat_g: number | null }): string {
  const f = (v: number | null) => (v === null ? '—' : `${tenth(v)} g`);
  return `Protein ${f(m.protein_g)} · Carbs ${f(m.carbs_g)} · Fat ${f(m.fat_g)}`;
}

/** An amount as typed: `1`, `1.5`. */
export const qtyText = (n: number) => String(Math.round(n * 1000) / 1000);

/** `2 servings`, `1 serving`. */
export const servings = (n: number) => `${qtyText(n)} ${n === 1 ? 'serving' : 'servings'}`;

/**
 * An entry's line two, the amount as it was logged: `1 bar · 40 g`, `150 g`, `2 servings`. An entry with no
 * nutrition says so in place of the grams, and a partial recipe adds `partial`.
 */
export function amountLine(e: FoodLogEntry): string {
  const unknown = e.kcal === null;
  if (e.recipe_id) {
    return [servings(e.qty), unknown ? 'No nutrition' : e.partial ? 'partial' : ''].filter(Boolean).join(' · ');
  }
  const amount = e.unit === 'g' ? `${qtyText(e.qty)} g` : `${qtyText(e.qty)} ${e.unit}`;
  if (unknown) return `${amount} · No nutrition`;
  if (e.unit === 'g' || e.grams === null) return amount;
  return `${amount} · ${Math.round(e.grams)} g`;
}

/** An entry's name: the food (brand then name) or the recipe, from what the library holds. */
export function entryName(e: FoodLogEntry, foods: Food[], recipes: RecipeSummary[]): string {
  if (e.food_id) {
    const f = foods.find((x) => x.id === e.food_id);
    return f ? displayName(f) : 'A removed food';
  }
  return recipes.find((r) => r.id === e.recipe_id)?.name ?? 'A removed recipe';
}

/** A search row's line two for a food: `Packaged · 190 kcal a bar`, `Ingredient · 364 kcal / 100 g`. */
export function foodRowLine(f: Food): string {
  if (!hasNutrition(f)) return 'No nutrition yet';
  return `${f.kind === 'packaged' ? 'Packaged' : 'Ingredient'} · ${kcalLine(f)}`;
}

/** Whether a recipe has a counted line, so it can be logged: its kcal a serving is known. */
export const recipeLoggable = (r: RecipeSummary) => typeof r.nutrition?.per_serving?.kcal === 'number';

/** `Recipe · 412 kcal a serving`, `Recipe · about 412 kcal a serving, partial`, or `No nutrition yet`. */
export function recipeRowLine(r: RecipeSummary): string {
  if (!recipeLoggable(r)) return 'No nutrition yet';
  const kcal = Math.round(r.nutrition.per_serving.kcal!);
  return r.partial ? `Recipe · about ${kcal} kcal a serving, partial` : `Recipe · ${kcal} kcal a serving`;
}

/** A log id made on the device when a sheet opens, so a double tap or a retry leaves one entry: `lg_` + 8 hex. */
export function newLogId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `lg_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** A recipe id made on the device when the New recipe sheet opens, so a retry leaves one recipe: `rc_` + 8 hex. */
export function newRecipeId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `rc_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** An entry's line as a saved recipe stores it: the amount then the food, `2 cup Spring mix`, `150 g Chicken breast`. */
export function entryLineText(e: FoodLogEntry, name: string): string {
  return `${qtyText(e.qty)} ${e.unit} ${name}`;
}

/** The step of the stepper: half a serving, or 10 g. */
export const stepFor = (unit: string) => (unit === 'g' ? 10 : 0.5);

/** A unit's default amount: 1 serving, or 100 g. */
export const defaultQty = (unit: string) => (unit === 'g' ? 100 : 1);

/** The largest amount the sheet takes. */
export const MAX_QTY = 99999;
