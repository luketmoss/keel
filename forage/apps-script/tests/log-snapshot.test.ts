// #703 AC9: logFood stores a nutrition snapshot. Changing the food afterwards
// leaves the stored entry and the day's totals unchanged.

import { describe, expect, it } from 'vitest';
import { loadApi } from './apps-script-sandbox';

describe('AC9: the food log keeps its snapshot', () => {
  it('a food entry keeps its kcal/protein/carbs/fat when the food changes', () => {
    const api = loadApi();
    api.ok('upsertFood', {
      payload: { id: 'yog', name: 'Greek yogurt', kcal_100g: 52.9, protein_100g: 9.4, carbs_100g: 4.1, fat_100g: 0, servings_json: [{ name: 'cup (170 g)', g: 170 }] },
    });
    const entry = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id: 'yog', qty: 1, unit: 'cup (170 g)' } });
    expect(entry).toMatchObject({ grams: 170, kcal: 89.9, protein_g: 16, carbs_g: 7, fat_g: 0, partial: false });
    const totals = api.ok('getFoodLogTotals', { from: '2026-11-01', to: '2026-11-01' });

    api.ok('upsertFood', { payload: { id: 'yog', kcal_100g: 100, protein_100g: 1, carbs_100g: 1, fat_100g: 1 } });

    expect(api.ok('getFoodLog', { from: '2026-11-01', to: '2026-11-01' })[0]).toEqual(entry);
    expect(api.ok('getFoodLogTotals', { from: '2026-11-01', to: '2026-11-01' })).toEqual(totals);
  });

  it('a recipe entry keeps its snapshot when the recipe or its foods change', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'beef', name: 'Beef', kcal_100g: 190, protein_100g: 19, carbs_100g: 0, fat_100g: 12 } });
    api.ok('upsertRecipe', { payload: { id: 'r', name: 'Stew', servings: 2, lines: [{ text: '200 g beef', qty: 200, unit: 'g', food_id: 'beef' }] } });
    const entry = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Dinner', recipe_id: 'r', qty: 1.5 } });
    expect(entry.kcal).toBe(285);

    api.ok('upsertRecipe', { payload: { id: 'r', servings: 4 } });
    api.ok('upsertFood', { payload: { id: 'beef', kcal_100g: 250, protein_100g: 19, carbs_100g: 0, fat_100g: 20 } });
    expect(api.ok('getFoodLog', {})[0]).toEqual(entry);
  });

  it('only editing the entry recomputes it', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'f', name: 'Oats', kcal_100g: 380, protein_100g: 13, carbs_100g: 68, fat_100g: 7 } });
    const entry = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id: 'f', qty: 40, unit: 'g' } });
    api.ok('upsertFood', { payload: { id: 'f', kcal_100g: 400, protein_100g: 13, carbs_100g: 68, fat_100g: 7 } });
    const edited = api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 40 } } });
    expect(edited.kcal).toBe(160);
  });

  it('a food with no nutrition logs as unknown, never 0, and the day is partial', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'x', name: 'Mystery' } });
    const entry = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Snacks', food_id: 'x', qty: 30, unit: 'g' } });
    expect(entry).toMatchObject({ kcal: null, protein_g: null, partial: true });
    expect(api.rows('FoodLog')[0][8]).toBe('');
    expect(api.ok('getFoodLogTotals', {}).days[0]).toMatchObject({ entries: 1, kcal: null, partial: true });
  });

  it('records the caller: mcp for the key', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'f', name: 'Oats', kcal_100g: 380, protein_100g: 13, carbs_100g: 68, fat_100g: 7 } });
    expect(api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id: 'f', qty: 40, unit: 'g' } }).source).toBe('mcp');
  });
});
