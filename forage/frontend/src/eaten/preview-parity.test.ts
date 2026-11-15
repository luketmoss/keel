/// <reference types="node" />
// #929: the app's amount preview (`preview.ts`) must give exactly what the API stores. The real
// apps-script/src/nutrition.js runs here in node:vm, as apps-script/tests/apps-script-sandbox.ts loads it, and every case is
// asked of both. Changing the rounding, the unit rule or the partial rule on one side and not the other fails this.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Food, FoodLogEntry, PerServing } from '../api/types';
import { foodEntryNutrition, keptGramsPerUnit, previewFood, previewRecipe, recipeEntryNutrition } from './preview';

const SRC = path.resolve(__dirname, '../../../apps-script/src');

// The functions as the Apps Script declares them. `any`: the sandbox's shape is only known at runtime.
const server: Record<string, any> = createContext({ Logger: { log() {} }, console });
for (const file of ['utils.js', 'nutrition.js']) {
  const filename = path.join(SRC, file);
  runInContext(readFileSync(filename, 'utf8'), server, { filename });
}

/** A value from the other realm as a plain one: null stays null, so "unknown" is compared too. */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

function food(over: Partial<Food>): Food {
  return {
    id: 'fd_x',
    name: 'Food',
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: null,
    protein_100g: null,
    carbs_100g: null,
    fat_100g: null,
    servings_json: null,
    source: 'manual',
    created: '',
    updated: '',
    ...over,
  };
}

const YOGURT = food({
  kcal_100g: 61.2,
  protein_100g: 2.45,
  carbs_100g: 3.67,
  fat_100g: 0.16,
  servings_json: [
    { name: 'cup', g: 245 },
    { name: 'tbsp', g: 15.3 },
  ],
});
/** All seven. */
const FULL = food({
  kcal_100g: 533,
  protein_100g: 6.7,
  carbs_100g: 61.3,
  fat_100g: 28.9,
  satfat_100g: 11.1,
  transfat_100g: 0,
  cholesterol_mg_100g: 3.3,
  sodium_mg_100g: 214.7,
  fiber_100g: 2.9,
  sugars_100g: 45.1,
  added_sugars_100g: 38.6,
  servings_json: [{ name: 'bar (40 g)', g: 40 }],
});
/** Some of the seven: the rest stay unknown, never 0. */
const SOME = food({
  kcal_100g: 120,
  protein_100g: 4.1,
  carbs_100g: 20.6,
  fat_100g: 2.2,
  fiber_100g: 3.3,
  sodium_mg_100g: 417,
  servings_json: [{ name: 'slice', g: 28 }],
});
/** No nutrition at all. */
const BARE = food({ servings_json: [{ name: 'each', g: 50 }] });
/** Four values with one blank is no nutrition either. */
const THREE = food({ kcal_100g: 100, protein_100g: 1, carbs_100g: 2, fat_100g: null, servings_json: [] });

const entryOf = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
  id: 'lg_1',
  date: '2026-11-02',
  slot: 'Breakfast',
  food_id: 'fd_x',
  recipe_id: '',
  qty: 2,
  unit: 'serving',
  grams: 64,
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  partial: false,
  source: 'app',
  logged_at: '',
  created: '',
  updated: '',
  ...over,
});

describe("foodEntryNutrition: the app's copy equals nutrition.js", () => {
  const cases: [string, Food, number, string, number | null | undefined][] = [
    ['a named serving', YOGURT, 1, 'cup', undefined],
    ['another named serving, fractional', YOGURT, 0.25, 'tbsp', undefined],
    ['grams', YOGURT, 150, 'g', undefined],
    ['grams spelled out', YOGURT, 150, 'grams', undefined],
    ['a fractional amount', YOGURT, 1.37, 'cup', undefined],
    ['a rounding edge', YOGURT, 0.15, 'cup', undefined],
    ['a food with all seven nutrients', FULL, 1.5, 'bar (40 g)', undefined],
    ['all seven in grams', FULL, 33.3, 'g', undefined],
    ['a food missing some of the seven', SOME, 2, 'slice', undefined],
    ['a food missing some of the seven, in grams', SOME, 47.5, 'g', undefined],
    ['a food with no nutrition', BARE, 2, 'each', undefined],
    ['a food with no nutrition, in grams', BARE, 30, 'g', undefined],
    ['a food with three of the four', THREE, 100, 'g', undefined],
    ['a kept grams per unit for a serving the food dropped', YOGURT, 3, 'serving', 32],
    ['a kept grams per unit with a fractional weight', FULL, 0.75, 'old bar', 41.3333],
    ['a serving that wins over the kept grams', YOGURT, 1, 'cup', 99],
  ];

  for (const [name, f, qty, unit, kept] of cases) {
    it(name, () => {
      const real = server.foodEntryNutrition(f, qty, unit, kept);
      expect(plain(foodEntryNutrition(f, qty, unit, kept))).toEqual(plain(real));
    });
  }

  it('rounds to 0.1 where the unrounded figure differs', () => {
    // 61.2 kcal per 100 g in 245 g is 149.94.
    expect(foodEntryNutrition(YOGURT, 1, 'cup').kcal).toBe(149.9);
    expect(server.foodEntryNutrition(YOGURT, 1, 'cup').kcal).toBe(149.9);
  });

  it('refuses a unit that is neither a serving nor g, as the API does, and previewFood answers null', () => {
    expect(() => server.foodEntryNutrition(YOGURT, 1, 'scoop', undefined)).toThrow('is not one of this food');
    expect(() => foodEntryNutrition(YOGURT, 1, 'scoop')).toThrow('is not one of this food');
    expect(() => foodEntryNutrition(YOGURT, 1, 'scoop', 0)).toThrow('is not one of this food');
    expect(previewFood(YOGURT, 1, 'scoop')).toBeNull();
  });

  it('previewFood takes the kept grams from the stored entry only for the unit the entry has', () => {
    const stored = entryOf({});
    expect(keptGramsPerUnit(stored, 'serving')).toBe(32);
    expect(keptGramsPerUnit(stored, 'scoop')).toBeNull();
    expect(keptGramsPerUnit(entryOf({ grams: null }), 'serving')).toBeNull();
    expect(keptGramsPerUnit(null, 'serving')).toBeNull();
    expect(plain(previewFood(YOGURT, 3, 'serving', stored))).toEqual(
      plain(server.foodEntryNutrition(YOGURT, 3, 'serving', 32)),
    );
    expect(previewFood(YOGURT, 3, 'serving')).toBeNull();
    expect(previewFood(YOGURT, 3, 'scoop', stored)).toBeNull();
  });
});

describe("recipeEntryNutrition: the app's copy equals nutrition.js", () => {
  const per = (over: Partial<PerServing>): PerServing => ({
    kcal: 412.3,
    protein_g: 30.14,
    carbs_g: 20.05,
    fat_g: 18.96,
    ...over,
  });
  const cases: [string, { per_serving: PerServing; partial: boolean }, number][] = [
    ['a full recipe', { per_serving: per({}), partial: false }, 1],
    ['a full recipe, fractional servings', { per_serving: per({}), partial: false }, 1.5],
    ['a rounding edge', { per_serving: per({}), partial: false }, 2.25],
    ['a partial recipe', { per_serving: per({}), partial: true }, 2],
    [
      'a recipe with some of the seven',
      { per_serving: per({ fiber_g: 4.4, sodium_mg: 612.5, satfat_g: null }), partial: false },
      0.75,
    ],
    [
      'a recipe with all seven',
      {
        per_serving: per({
          satfat_g: 5.5,
          transfat_g: 0.1,
          cholesterol_mg: 70.2,
          sodium_mg: 800.4,
          fiber_g: 6.1,
          sugars_g: 9.9,
          added_sugars_g: 1.7,
        }),
        partial: false,
      },
      3,
    ],
    [
      'a recipe nothing counted for',
      { per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null }, partial: false },
      1,
    ],
  ];

  for (const [name, n, qty] of cases) {
    it(name, () => {
      expect(plain(recipeEntryNutrition(n, qty))).toEqual(plain(server.recipeEntryNutrition(n, qty)));
    });
  }

  it('is partial when nothing counted, and previewRecipe is the same function', () => {
    const none = { per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null }, partial: false };
    expect(recipeEntryNutrition(none, 1).partial).toBe(true);
    expect(plain(previewRecipe({ nutrition: none }, 2))).toEqual(plain(server.recipeEntryNutrition(none, 2)));
  });
});
