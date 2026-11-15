// #929: the calories and macros of an amount, worked out in the app so the amount sheet and the inline editor show
// them on the tap, with no request. This mirrors exactly two functions of apps-script/src/nutrition.js,
// `foodEntryNutrition` and `recipeEntryNutrition`, which stay the only place the stored snapshot is computed. The
// mirror can drift, so frontend/src/eaten/preview-parity.test.ts runs the real file in node:vm and fails when the two
// disagree. A change to either side changes both, in the same pull request. A save still writes through the API and
// the day shows what the write answered.
import { EXTRA_COLUMN, EXTRA_KEYS, type ExtraKey, type Extras, type Food, type FoodLogEntry } from '../api/types';
import type { PerServing } from '../api/types';

/** What an entry's snapshot holds: the four, the seven, grams (null for a recipe) and `partial`. */
export interface EntryNutrition extends Extras {
  grams: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  partial: boolean;
}

/** nutrition.js `round1`. */
const round1 = (n: number | null | undefined): number | null =>
  n === null || n === undefined ? null : Math.round(n * 10) / 10;

/** nutrition.js `canonicalUnit`, as far as grams go: the spellings of `g`. */
const isGrams = (unit: string) =>
  ['g', 'gram', 'grams'].includes(
    String(unit ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' '),
  );

/** nutrition.js `foodServings`: the servings with a name and a weight above 0. */
const servingsOf = (food: Food) =>
  Array.isArray(food.servings_json)
    ? food.servings_json.filter((s) => s && typeof s.name === 'string' && typeof s.g === 'number' && s.g > 0)
    : [];

/** nutrition.js `hasNutrition`: all four per-100 g values are numbers. */
const hasFour = (food: Food) =>
  [food.kcal_100g, food.protein_100g, food.carbs_100g, food.fat_100g].every((v) => typeof v === 'number');

/** nutrition.js `foodEntryNutrition`: `qty` of a serving or of grams. Throws, as it does, for a unit that is neither. */
export function foodEntryNutrition(
  food: Food,
  qty: number,
  unit: string,
  keptGramsPerUnit?: number | null,
): EntryNutrition {
  let grams: number;
  if (isGrams(unit)) {
    grams = qty;
  } else {
    const serving = servingsOf(food).find((s) => s.name === unit);
    if (serving) grams = qty * serving.g;
    else if (keptGramsPerUnit) grams = qty * keptGramsPerUnit;
    else throw new Error(`unit "${unit}" is not one of this food's servings, or g`);
  }
  if (!hasFour(food)) {
    const none: EntryNutrition = {
      grams: round1(grams),
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      partial: true,
    };
    for (const key of EXTRA_KEYS) none[key] = null;
    return none;
  }
  const per = (v: number | null | undefined) => ((v as number) * grams) / 100;
  const out: EntryNutrition = {
    grams: round1(grams),
    kcal: round1(per(food.kcal_100g)),
    protein_g: round1(per(food.protein_100g)),
    carbs_g: round1(per(food.carbs_100g)),
    fat_g: round1(per(food.fat_100g)),
    partial: false,
  };
  for (const key of EXTRA_KEYS) {
    const v = food[EXTRA_COLUMN[key as ExtraKey]];
    out[key] = round1(typeof v === 'number' ? per(v) : null);
  }
  return out;
}

/** nutrition.js `recipeEntryNutrition`: `qty` servings of the recipe's per-serving values. */
export function recipeEntryNutrition(
  nutrition: { per_serving: PerServing; partial: boolean },
  qty: number,
): EntryNutrition {
  const per = nutrition.per_serving;
  const times = (v: number | null | undefined) => (v === null || v === undefined ? null : round1(v * qty));
  const out: EntryNutrition = {
    grams: null,
    kcal: times(per.kcal),
    protein_g: times(per.protein_g),
    carbs_g: times(per.carbs_g),
    fat_g: times(per.fat_g),
    partial: nutrition.partial || per.kcal === null,
  };
  for (const key of EXTRA_KEYS) out[key] = times(per[key]);
  return out;
}

/**
 * log.js `keptGramsPerUnit` (#880): an edit that keeps the stored entry's unit, on a food that has since renamed or
 * dropped that serving, is worth the entry's own grams per unit. Null for any other unit or an entry with no grams.
 */
export function keptGramsPerUnit(stored: FoodLogEntry | null | undefined, unit: string): number | null {
  if (!stored || stored.unit !== unit) return null;
  if (!stored.grams || !stored.qty) return null;
  return stored.grams / stored.qty;
}

/** The figures of `qty` of `unit` of a food, or null where the API would refuse the unit. `stored` is the entry being edited. */
export function previewFood(
  food: Food,
  qty: number,
  unit: string,
  stored?: FoodLogEntry | null,
): EntryNutrition | null {
  try {
    return foodEntryNutrition(food, qty, unit, keptGramsPerUnit(stored, unit));
  } catch {
    return null;
  }
}

/** The figures of `qty` servings of a recipe. */
export function previewRecipe(
  recipe: { nutrition: { per_serving: PerServing; partial: boolean } },
  qty: number,
): EntryNutrition {
  return recipeEntryNutrition(recipe.nutrition, qty);
}
