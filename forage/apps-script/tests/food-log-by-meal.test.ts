// #865: `getFoodLogTotals` with `by_meal` adds each day's meals, accumulated by the same function as the day, and
// without it answers exactly what #712 and #714 rely on. The day shape itself is pinned in food-log.test.ts.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const DAY = '2026-11-03';
const SEVEN = ['satfat_g', 'transfat_g', 'cholesterol_mg', 'sodium_mg', 'fiber_g', 'sugars_g', 'added_sugars_g'];
const CORE = { kcal_100g: 100, protein_100g: 10, carbs_100g: 20, fat_100g: 5 };

function seed(api: Api) {
  // Sodium and fiber known.
  api.ok('upsertFood', {
    payload: { id: 'salty', name: 'Salty', ...CORE, sodium_mg_100g: 400, fiber_100g: 3, servings_json: [{ name: 'cup', g: 100 }] },
  });
  // Calories but no sodium or fiber.
  api.ok('upsertFood', { payload: { id: 'plain', name: 'Plain', ...CORE, servings_json: [{ name: 'cup', g: 100 }] } });
  // No nutrition at all.
  api.ok('upsertFood', { payload: { id: 'herbs', name: 'Herbs' } });
  api.ok('upsertFood', { payload: { id: 'beef', name: 'Beef', kcal_100g: 190, protein_100g: 19, carbs_100g: 0, fat_100g: 12 } });
  api.ok('upsertRecipe', {
    payload: {
      id: 'stew',
      name: 'Stew',
      servings: 2,
      lines: [
        { text: '200 g beef', qty: 200, unit: 'g', food_id: 'beef' },
        { text: '3 carrots', qty: 3 },
      ],
    },
  });
}

const log = (api: Api, entry: Record<string, unknown>) =>
  api.ok('logFood', { payload: { date: DAY, slot: 'Dinner', ...entry } });
const totals = (api: Api, extra: Record<string, unknown> = {}) =>
  api.ok('getFoodLogTotals', { from: DAY, to: DAY, ...extra });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Meal = Record<string, any>;

describe('getFoodLogTotals without by_meal', () => {
  it('has no meals key and the keys of a day as before', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'salty', qty: 1, unit: 'cup' });
    const day = totals(api).days[0];
    expect(day).not.toHaveProperty('meals');
    expect(Object.keys(day)).toEqual([
      'date', 'entries', 'unknown_entries', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'partial', ...SEVEN, 'unknown',
    ]);
    expect(totals(api, { by_meal: false }).days[0]).not.toHaveProperty('meals');
    expect(totals(api, { by_meal: 'false' }).days[0]).not.toHaveProperty('meals');
  });
});

describe('getFoodLogTotals with by_meal', () => {
  it('answers one meal per slot with an entry, in meal order, with the day fields minus date', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'salty', qty: 1, unit: 'cup', slot: 'Snacks' });
    log(api, { food_id: 'salty', qty: 2, unit: 'cup', slot: 'Breakfast' });
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'After dinner' });
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Dinner' });
    for (const flag of [true, 'true']) {
      const day = totals(api, { by_meal: flag }).days[0];
      expect(day.meals.map((m: Meal) => m.slot)).toEqual(['Breakfast', 'Dinner', 'After dinner', 'Snacks']);
      expect(Object.keys(day.meals[0])).toEqual([
        'slot', 'entries', 'unknown_entries', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'partial', ...SEVEN, 'unknown',
      ]);
      expect(day.meals[0]).toMatchObject({ slot: 'Breakfast', entries: 1, kcal: 200, sodium_mg: 800, fiber_g: 6, partial: false });
    }
  });

  it('sums over the entries that have a value, and is null when none does', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Lunch' });
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Lunch' });
    log(api, { food_id: 'salty', qty: 1, unit: 'cup', slot: 'Dinner' });
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Dinner' });
    const [lunch, dinner] = totals(api, { by_meal: true }).days[0].meals;
    expect(lunch).toMatchObject({ slot: 'Lunch', entries: 2, kcal: 200, sodium_mg: null, fiber_g: null });
    expect(lunch.unknown.sodium_mg).toBe(2);
    expect(dinner).toMatchObject({ slot: 'Dinner', entries: 2, kcal: 200, sodium_mg: 400, fiber_g: 3 });
    expect(dinner.unknown).toMatchObject({ sodium_mg: 1, fiber_g: 1 });
  });

  it('is partial for a partial recipe or an entry with no nutrition, only for that meal', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Breakfast' });
    log(api, { recipe_id: 'stew', qty: 1, slot: 'Lunch' });
    log(api, { food_id: 'herbs', qty: 2, unit: 'g', slot: 'Snacks' });
    const day = totals(api, { by_meal: true }).days[0];
    const by = Object.fromEntries(day.meals.map((m: Meal) => [m.slot, m]));
    expect(by.Breakfast.partial).toBe(false);
    expect(by.Lunch.partial).toBe(true);
    expect(by.Snacks).toMatchObject({ partial: true, unknown_entries: 1, kcal: null });
    expect(day.partial).toBe(true);
    expect(day.unknown_entries).toBe(1);
  });

  it('leaves out an empty slot and a date with no entries', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Lunch' });
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Lunch', date: '2026-11-05' });
    const out = api.ok('getFoodLogTotals', { from: '2026-11-03', to: '2026-11-06', by_meal: true });
    expect(out.days.map((d: Meal) => d.date)).toEqual(['2026-11-03', '2026-11-05']);
    expect(out.days[0].meals.map((m: Meal) => m.slot)).toEqual(['Lunch']);
    expect(api.ok('getFoodLogTotals', { from: '2026-11-07', to: '2026-11-07', by_meal: true }).days).toEqual([]);
  });

  it('moving an entry moves its numbers between the meals and leaves the day alone', () => {
    const api = loadApi();
    seed(api);
    const a = log(api, { food_id: 'salty', qty: 1, unit: 'cup', slot: 'Lunch' });
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Dinner' });
    const before = totals(api, { by_meal: true }).days[0];
    api.ok('updateLogEntry', { payload: { id: a.id, changes: { slot: 'Dinner' } } });
    const after = totals(api, { by_meal: true }).days[0];
    expect(before.meals.map((m: Meal) => m.slot)).toEqual(['Lunch', 'Dinner']);
    expect(after.meals.map((m: Meal) => m.slot)).toEqual(['Dinner']);
    expect(after.meals[0]).toMatchObject({ entries: 2, kcal: 200, sodium_mg: 400 });
    const { meals: _b, ...dayBefore } = before;
    const { meals: _a, ...dayAfter } = after;
    expect(dayAfter).toEqual(dayBefore);
  });

  it('the day fields equal those without it', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'salty', qty: 1.33, unit: 'cup', slot: 'Lunch' });
    log(api, { food_id: 'plain', qty: 0.77, unit: 'cup', slot: 'Dinner' });
    log(api, { recipe_id: 'stew', qty: 1, slot: 'Snacks' });
    const plain = totals(api);
    const withMeals = totals(api, { by_meal: true });
    expect(withMeals.days.map(({ meals: _m, ...d }: Meal) => d)).toEqual(plain.days);
  });

  it('keeps a slot from before a rename, after the known ones, in first-seen order', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'plain', qty: 1, unit: 'cup', slot: 'Snacks' });
    const real = api.sandbox.getFoodLog;
    const entry = (slot: string) => ({
      date: DAY, slot, kcal: 10, protein_g: 1, carbs_g: 1, fat_g: 1, partial: false,
      ...Object.fromEntries(SEVEN.map((k) => [k, null])),
    });
    api.sandbox.getFoodLog = (p: unknown) => [entry('Supper'), ...real(p), entry('Elevenses'), entry('Supper')];
    const day = totals(api, { by_meal: true }).days[0];
    expect(day.meals.map((m: Meal) => m.slot)).toEqual(['Snacks', 'Supper', 'Elevenses']);
    expect(day.meals[1].entries).toBe(2);
    expect(day.entries).toBe(4);
  });
});
