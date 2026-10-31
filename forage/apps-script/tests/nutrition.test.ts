// #703 AC6, AC7, AC8: conversion, the partial rule and the beef stew figure.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';
import { PROTOTYPE_KCAL_PER_SERVING, STEW_FOODS, STEW_RECIPE } from './fixtures/beef-stew';

const { sandbox } = loadApi();
const grams = (qty: number | null, unit: string, food: Record<string, unknown> | null) =>
  sandbox.gramsFor(qty, unit, food);

const flour = { servings_json: [{ name: 'cup', g: 125 }] };
const garlic = { servings_json: [{ name: 'clove', g: 3 }], buy_unit: 'head', buy_unit_g: 45 };
const onion = {
  servings_json: [
    { name: 'medium', g: 110 },
    { name: 'cup, chopped', g: 160 },
  ],
};
const egg = { servings_json: [{ name: 'large', g: 50 }] };
const bay = { servings_json: null };
const tpaste = { servings_json: null, buy_unit: 'can (6 oz)', buy_unit_g: 170 };

describe('AC7: unit-to-gram conversion, rules 1 to 5', () => {
  it('rule 1: mass converts exactly: 1.5 lb is 680.4 g', () => {
    expect(sandbox.round1(grams(1.5, 'lb', null))).toBe(680.4);
    expect(grams(2, 'oz', null)).toBeCloseTo(56.699, 3);
    expect(grams(1, 'kg', null)).toBe(1000);
    expect(grams(1, 'pounds', null)).toBe(453.592);
  });

  it('rule 2: 6 tbsp flour with a cup 125 g serving is 46.9 g', () => {
    expect(sandbox.round1(grams(6, 'tbsp', flour))).toBe(46.9);
    expect(sandbox.round1(grams(6, 'tablespoons', flour))).toBe(46.9);
    expect(grams(1, 'tsp', flour)).toBeCloseTo(125 / 48, 6);
  });

  it('rule 2: 3 cups onion picks "cup, chopped", the first serving that leads with a volume unit', () => {
    expect(grams(3, 'cups', onion)).toBe(480);
  });

  it('rule 2: no density guess, water included: a food with no volume serving gives no weight', () => {
    expect(grams(1, 'cup', { servings_json: [{ name: 'medium', g: 110 }] })).toBeNull();
    expect(grams(1, 'cup', { servings_json: null })).toBeNull();
  });

  it('rule 3: 2 cloves is 6 g via the clove serving', () => {
    expect(grams(2, 'cloves', garlic)).toBe(6);
    expect(grams(2, 'clove', garlic)).toBe(6);
  });

  it("rule 3: then the food's buy unit", () => {
    expect(grams(2, 'can', tpaste)).toBe(340);
    expect(grams(1, 'head', garlic)).toBe(45);
  });

  it('rule 4: a bare count uses a serving named each, else the first serving: 2 eggs use large', () => {
    expect(grams(2, '', egg)).toBe(100);
    expect(grams(2, '', { servings_json: [{ name: 'slice', g: 20 }, { name: 'each', g: 7 }] })).toBe(14);
  });

  it('rule 5: 2 bay leaves with no serving has no weight, and no qty has no weight', () => {
    expect(grams(2, '', bay)).toBeNull();
    expect(grams(null, 'cup', flour)).toBeNull();
    expect(grams(2, 'pinch', garlic)).toBeNull();
  });

  it('reports a bare-count line with no serving as no_weight through the API', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'bay', name: 'Bay leaves', kcal_100g: 313, protein_100g: 7.6, carbs_100g: 75, fat_100g: 8.4 } });
    const n = api.ok('computeNutrition', {
      payload: { servings: 1, lines: [{ text: '2 bay leaves', qty: 2, unit: '', food_id: 'bay' }] },
    });
    expect(n.missing).toEqual([{ line_id: 'L1', reason: 'no_weight' }]);
  });
});

function seedFoods(api: Api) {
  for (const food of STEW_FOODS) api.ok('upsertFood', { payload: food });
}

describe('AC8: the partial rule', () => {
  const api = loadApi();
  api.ok('upsertFood', { payload: { id: 'beef', name: 'Beef', kcal_100g: 190, protein_100g: 19, carbs_100g: 0, fat_100g: 12 } });
  api.ok('upsertFood', { payload: { id: 'herbs', name: 'Herbs' } });
  const nutrition = (lines: object[]) => api.ok('computeNutrition', { payload: { servings: 2, lines } });

  it('a no_weight line on a food with nutrition makes it partial', () => {
    const n = nutrition([
      { text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' },
      { text: '2 pieces beef', qty: 2, unit: 'piece', food_id: 'beef' },
    ]);
    expect(n.missing).toEqual([{ line_id: 'L2', reason: 'no_weight' }]);
    expect(n.partial).toBe(true);
  });

  it('a recipe whose only gap is no_nutrition is not partial', () => {
    const n = nutrition([
      { text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' },
      { text: '1 tsp herbs', qty: 1, unit: 'tsp', food_id: 'herbs', grams: 1 },
    ]);
    expect(n.missing).toEqual([{ line_id: 'L2', reason: 'no_nutrition' }]);
    expect(n.partial).toBe(false);
    expect(n.per_serving.kcal).toBe(Math.round((190 * 453.592) / 100 / 2 * 10) / 10);
  });

  it('an unmatched line (food_id blank) is partial', () => {
    const n = nutrition([
      { text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' },
      { text: 'a splash of something', qty: null, unit: '', food_id: '' },
    ]);
    expect(n.missing).toEqual([{ line_id: 'L2', reason: 'no_food' }]);
    expect(n.partial).toBe(true);
  });

  it('optional lines count toward nothing', () => {
    const n = nutrition([
      { text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' },
      { text: 'parsley, optional', food_id: '', optional: true },
    ]);
    expect(n.missing).toEqual([]);
    expect(n.partial).toBe(false);
  });

  it('nothing counted is unknown, not zero', () => {
    const n = nutrition([{ text: 'something', food_id: '' }]);
    expect(n.per_serving.kcal).toBeNull();
  });
});

describe('AC6: getRecipe for the beef stew fixture', () => {
  const api = loadApi();
  seedFoods(api);
  api.ok('upsertRecipe', { payload: STEW_RECIPE });
  const recipe = api.ok('getRecipe', { id: 'stew' });

  it(`reports per-serving kcal within 1 of the prototype's ${PROTOTYPE_KCAL_PER_SERVING}`, () => {
    expect(Math.abs(recipe.nutrition.per_serving.kcal - PROTOTYPE_KCAL_PER_SERVING)).toBeLessThanOrEqual(1);
    expect(recipe.nutrition.per_serving.protein_g).toBeCloseTo(28.2, 1);
  });

  it('has no no_weight lines, L7 as no_nutrition, L19 left out as optional, and is not partial', () => {
    expect(recipe.nutrition.missing).toEqual([{ line_id: 'L7', reason: 'no_nutrition' }]);
    expect(recipe.lines).toHaveLength(19);
    const l19 = recipe.lines.find((l: { line_id: string }) => l.line_id === 'L19');
    expect(l19.optional).toBe(true);
    expect(l19.reason).toBe('');
    expect(recipe.nutrition.partial).toBe(false);
    expect(recipe.partial).toBe(false);
  });

  it('converts the same weights without the explicit grams, within 1 kcal where a serving exists', () => {
    const noGrams = { ...STEW_RECIPE, id: 'stew2', lines: STEW_RECIPE.lines.map((l) => ({ ...l, grams: null })) };
    const r = api.ok('upsertRecipe', { payload: noGrams });
    const byId = Object.fromEntries(r.lines.map((l: { line_id: string }) => [l.line_id, l]));
    expect(byId.L1.resolved_grams).toBe(680.4);
    expect(byId.L3.resolved_grams).toBe(46.9);
    expect(byId.L8.resolved_grams).toBe(6);
    expect(byId.L14.resolved_grams).toBe(480);
    // No volume serving for wine, broth, potatoes...: those are no_weight, so it is partial.
    expect(byId.L9.reason).toBe('no_weight');
    expect(r.nutrition.partial).toBe(true);
  });

  it('lists the stew with its derived fields', () => {
    const list = api.ok('getRecipes');
    const stew = list.find((r: { id: string }) => r.id === 'stew');
    expect(stew.nutrition.per_serving.kcal).toBe(recipe.nutrition.per_serving.kcal);
    expect(stew).toMatchObject({ partial: false, rating: null, last_cooked: null, has_walkthrough: false });
  });
});
