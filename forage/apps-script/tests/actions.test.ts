// #703 AC3, AC5, AC10, AC12: every action, read and write, round-tripped
// through doPost and the fake sheet; ids; the referential rules; the payload limit.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

/** The smallest valid walkthrough for the seeded one-line recipe (#711's format). */
const MINIMAL_WALKTHROUGH = {
  format: 1,
  recipe: 'rc_stew',
  prep: [],
  cook: [{ id: 'cook', title: 'Cook it', do: 'Cook it.', uses: [{ line: 'L1' }], lookFor: 'Done.' }],
};

const BEEF = { id: 'beef', name: 'Beef', kcal_100g: 190, protein_100g: 19, carbs_100g: 0, fat_100g: 12 };

/** A sheet with one food, one recipe using it, and a plan entry. */
function seeded(): Api {
  const api = loadApi();
  api.ok('upsertFood', { payload: BEEF });
  api.ok('upsertRecipe', {
    payload: {
      id: 'rc_stew',
      name: 'Stew',
      servings: 2,
      lines: [{ text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' }],
      steps: [{ text: 'Cook it.' }],
    },
  });
  return api;
}

describe('AC3: every action exists, with a read and a write round-tripping through the sheet', () => {
  it('Foods: upsertFood then getFood and getFoods; deleteFood', () => {
    const api = loadApi();
    const food = api.ok('upsertFood', {
      payload: { name: 'Garlic', brand: 'Farm', servings_json: [{ name: 'clove', g: 3 }], regular: true, barcode: '0042' },
    });
    expect(food.id).toMatch(/^fd_[0-9a-f]{8}$/);
    expect(api.ok('getFood', { id: food.id })).toEqual({ ...food, used_by: [] });
    expect(food.servings_json).toEqual([{ name: 'clove', g: 3 }]);
    expect(food.kcal_100g).toBeNull();
    expect(api.ok('getFoods', { q: 'farm' }).map((f: { id: string }) => f.id)).toEqual([food.id]);
    expect(api.ok('getFoods', { regular: 'true' })).toHaveLength(1);
    expect(api.ok('getFoods', { barcode: '0042' })).toHaveLength(1);
    expect(api.ok('getFoods', { q: 'onion' })).toEqual([]);
    expect(api.ok('deleteFood', { payload: { id: food.id } })).toEqual({ id: food.id, deleted: true });
    expect(api.rows('Foods')).toEqual([]);
  });

  it('Foods: an update merges the fields sent and keeps created', () => {
    const api = loadApi();
    const first = api.ok('upsertFood', { payload: BEEF });
    const second = api.ok('upsertFood', { payload: { id: 'beef', usual_store: 'costco' } });
    expect(second).toMatchObject({ name: 'Beef', kcal_100g: 190, usual_store: 'costco', created: first.created });
  });

  it('Foods: nutrition is all four or none', () => {
    const api = loadApi();
    expect(api.call('upsertFood', { payload: { name: 'X', kcal_100g: 100 } }).error).toMatch(/all set or all blank/);
  });

  it('Recipes: upsertRecipe then getRecipe and getRecipes; deleteRecipe removes lines, steps, walkthrough', () => {
    const api = seeded();
    const recipe = api.ok('getRecipe', { id: 'rc_stew' });
    expect(recipe.lines).toHaveLength(1);
    expect(recipe.lines[0]).toMatchObject({ line_id: 'L1', qty: 1, unit: 'lb', food_id: 'beef', resolved_grams: 453.6 });
    expect(recipe.steps).toEqual([{ recipe_id: 'rc_stew', position: 1, section: '', name: '', text: 'Cook it.' }]);
    expect(recipe.nutrition.per_serving.kcal).toBe(430.9);
    expect(api.ok('getRecipes').map((r: { id: string }) => r.id)).toEqual(['rc_stew']);

    api.ok('setWalkthrough', { payload: { recipe_id: 'rc_stew', walkthrough: MINIMAL_WALKTHROUGH } });
    expect(api.ok('deleteRecipe', { payload: { id: 'rc_stew' } })).toEqual({ id: 'rc_stew', deleted: true });
    for (const tab of ['Recipes', 'RecipeLines', 'Steps', 'Walkthroughs']) expect(api.rows(tab)).toEqual([]);
  });

  it('Recipes: a replace keeps the line ids sent and numbers new lines after the highest used', () => {
    const api = seeded();
    const r = api.ok('upsertRecipe', {
      payload: {
        id: 'rc_stew',
        lines: [
          { text: 'salt', food_id: '' },
          { line_id: 'L1', text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' },
        ],
      },
    });
    expect(r.lines.map((l: { line_id: string; position: number }) => [l.line_id, l.position])).toEqual([
      ['L2', 1],
      ['L1', 2],
    ]);
    expect(r.steps).toHaveLength(1); // steps left out are kept
    expect(api.rows('RecipeLines')).toHaveLength(2);
  });

  it('computeNutrition previews without saving', () => {
    const api = seeded();
    const before = api.rows('Recipes').length;
    const n = api.ok('computeNutrition', {
      payload: { servings: 1, lines: [{ text: '100 g beef', qty: 100, unit: 'g', food_id: 'beef' }] },
    });
    expect(n.per_serving).toEqual({ kcal: 190, protein_g: 19, carbs_g: 0, fat_g: 12 });
    expect(api.rows('Recipes')).toHaveLength(before);
  });

  it('Walkthroughs: setWalkthrough then getWalkthrough; deleteWalkthrough', () => {
    const api = seeded();
    const doc = MINIMAL_WALKTHROUGH;
    expect(api.ok('setWalkthrough', { payload: { recipe_id: 'rc_stew', walkthrough: doc } }).walkthrough).toEqual(doc);
    expect(api.ok('getWalkthrough', { recipe_id: 'rc_stew' })).toMatchObject({ format: 1, walkthrough: doc });
    expect(api.ok('getRecipe', { id: 'rc_stew' }).has_walkthrough).toBe(true);
    expect(api.call('setWalkthrough', { payload: { recipe_id: 'rc_stew', walkthrough: { ...doc, format: 2 } } }).problems)
      .toEqual(['format: expected 1, got 2']);
    expect(api.call('setWalkthrough', { payload: { recipe_id: 'rc_stew', walkthrough: { ...doc, recipe: 'other' } } }).problems)
      .toEqual(['recipe: this walkthrough is for "other", not "rc_stew"']);
    api.ok('deleteWalkthrough', { payload: { recipe_id: 'rc_stew' } });
    expect(api.ok('getWalkthrough', { recipe_id: 'rc_stew' })).toBeNull();
  });

  it('Plan: upsertPlanEntry then getPlan by range; deletePlanEntry', () => {
    const api = seeded();
    const meal = api.ok('upsertPlanEntry', { payload: { date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_stew' } });
    expect(meal.id).toMatch(/^pl_[0-9a-f]{8}$/);
    const out = api.ok('upsertPlanEntry', { payload: { date: '2026-11-01', slot: 'Lunch', note: 'Eating out' } });
    expect(api.ok('getPlan', { from: '2026-11-01', to: '2026-11-01' }).entries.map((p: { id: string }) => p.id)).toEqual([
      out.id,
      meal.id,
    ]);
    expect(api.ok('getPlan', { from: '2026-11-02' }).entries).toEqual([]);
    expect(api.call('upsertPlanEntry', { payload: { date: '2026-11-01', slot: 'Dinner' } }).error).toMatch(/exactly one/);
    api.ok('deletePlanEntry', { payload: { id: out.id } });
    expect(api.rows('Plan')).toHaveLength(1);
  });

  it('Trips: startTrip, getTrip, getTrips, setTripItem, closeTrip, discardTrip (#718)', () => {
    const api = seeded();
    const meal = api.ok('upsertPlanEntry', { payload: { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_stew' } });
    const started = api.ok('startTrip', { payload: { through: '2026-11-07', today: '2026-11-02' } });
    expect(started).toMatchObject({ written: true, dry_run: false, trip: { status: 'open', through: '2026-11-07' } });
    const trip = started.trip;
    expect(trip.id).toMatch(/^tr_[0-9a-f]{8}$/);
    expect(trip.meals.map((m: { plan_id: string }) => m.plan_id)).toEqual([meal.id]);
    expect(trip.items).toHaveLength(1);
    expect(trip.items[0]).toMatchObject({ food_id: 'beef', choice: '', suggested: false, need: '1 lb' });
    expect(api.ok('setTripItem', { payload: { food_id: 'beef', choice: 'costco' } }).item).toMatchObject({ choice: 'costco' });
    expect(api.ok('setTripItem', { payload: { food_id: 'beef', bought: true } }).item).toMatchObject({ bought: true });
    expect(api.ok('getTrip').trip.items[0]).toMatchObject({ choice: 'costco', bought: true });
    expect(api.ok('getTrip', { id: trip.id }).trip.id).toBe(trip.id);
    expect(api.ok('getTrips', { status: 'open' })).toHaveLength(1);
    const closed = api.ok('closeTrip', { payload: {} }).trip;
    expect(closed.status).toBe('closed');
    expect(closed.closed_at).not.toBe('');
    expect(api.ok('getTrips', { status: 'open' })).toEqual([]);
    expect(api.ok('getTrip')).toEqual({ trip: null });
    api.ok('startTrip', { payload: { through: '2026-11-07', today: '2026-11-02', plan_ids: [] } });
    expect(api.ok('discardTrip', { payload: {} })).toMatchObject({ meals_cleared: 0 });
    expect(api.rows('Trips')).toHaveLength(1);
  });

  it('FoodLog: logFood, getFoodLog, getFoodLogTotals, updateLogEntry, deleteLogEntry', () => {
    const api = seeded();
    api.ok('upsertFood', { payload: { id: 'egg', name: 'Eggs', kcal_100g: 143, protein_100g: 12.6, carbs_100g: 0.7, fat_100g: 9.5, servings_json: [{ name: 'large', g: 50 }] } });
    const egg = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id: 'egg', qty: 2, unit: 'large' } });
    expect(egg).toMatchObject({ grams: 100, kcal: 143, protein_g: 12.6, partial: false, source: 'mcp' });
    expect(egg.id).toMatch(/^lg_[0-9a-f]{8}$/);
    const stew = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_stew', qty: 1 } });
    expect(stew).toMatchObject({ unit: 'serving', grams: null, kcal: 430.9, partial: false });
    expect(api.ok('getFoodLog', { from: '2026-11-01', to: '2026-11-01' }).map((e: { id: string }) => e.id)).toEqual([
      egg.id,
      stew.id,
    ]);
    expect(api.ok('getFoodLogTotals', { from: '2026-11-01', to: '2026-11-01' })).toEqual({
      from: '2026-11-01',
      to: '2026-11-01',
      days: [{ date: '2026-11-01', entries: 2, kcal: 573.9, protein_g: 55.7, carbs_g: 0.7, fat_g: 36.7, partial: false }],
    });
    const edited = api.ok('updateLogEntry', { payload: { id: egg.id, changes: { qty: 1 } } });
    expect(edited).toMatchObject({ grams: 50, kcal: 71.5, logged_at: egg.logged_at, created: egg.created });
    api.ok('deleteLogEntry', { payload: { id: egg.id } });
    expect(api.rows('FoodLog')).toHaveLength(1);
  });

  it('Cooks: upsertCook then getCooks; the recipe derives rating and last cooked; deleteCook', () => {
    const api = seeded();
    const first = api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-04', rating: 5 } });
    expect(first.id).toMatch(/^ck_[0-9a-f]{8}$/);
    api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-20' } });
    expect(api.ok('getCooks', { recipe_id: 'rc_stew' }).map((c: { date: string }) => c.date)).toEqual(['2026-10-20', '2026-10-04']);
    expect(api.ok('getRecipe', { id: 'rc_stew' })).toMatchObject({ rating: 5, last_cooked: '2026-10-20' });
    expect(api.call('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-21', rating: 6 } }).error).toMatch(/at most 5/);
    api.ok('deleteCook', { payload: { id: first.id } });
    expect(api.ok('getCooks', {})).toHaveLength(1);
  });

  it('Config: setConfig then getConfig', () => {
    const api = loadApi();
    api.ok('setConfig', { payload: { key: 'ingredient_aliases', value: '{}' } });
    api.ok('setConfig', { payload: { key: 'ingredient_aliases', value: '{"scallion":"fd_1"}' } });
    expect(api.ok('getConfig')).toEqual({ ingredient_aliases: '{"scallion":"fd_1"}' });
  });

  it('an unknown action is refused with fixed text', () => {
    expect(loadApi().call('dropTables').error).toBe('Unknown action "dropTables"');
  });
});

describe('AC5: caller-supplied ids upsert; API-made ids carry the prefix', () => {
  it('creating with the same id twice leaves one row, for every entity that takes one', () => {
    const api = seeded();
    const twice = (action: string, payload: object) => {
      api.ok(action, { payload });
      api.ok(action, { payload });
    };
    twice('upsertFood', { id: 'fd_same', name: 'Onion' });
    twice('upsertRecipe', { id: 'rc_same', name: 'Soup', servings: 2, lines: [], steps: [] });
    twice('upsertPlanEntry', { id: 'pl_same', date: '2026-11-02', slot: 'Lunch', note: 'Leftovers' });
    twice('startTrip', { id: 'tr_same', through: '2026-11-07' });
    twice('logFood', { id: 'lg_same', date: '2026-11-02', slot: 'Lunch', food_id: 'beef', qty: 100, unit: 'g' });
    twice('upsertCook', { id: 'ck_same', recipe_id: 'rc_stew', date: '2026-11-02' });
    const count = (tab: string, id: string) => api.rows(tab).filter((r) => r[0] === id).length;
    expect(count('Foods', 'fd_same')).toBe(1);
    expect(count('Recipes', 'rc_same')).toBe(1);
    expect(count('Plan', 'pl_same')).toBe(1);
    expect(count('Trips', 'tr_same')).toBe(1);
    expect(count('FoodLog', 'lg_same')).toBe(1);
    expect(count('Cooks', 'ck_same')).toBe(1);
  });

  it('a create without an id gets the entity prefix and 8 hex', () => {
    const api = seeded();
    expect(api.ok('upsertFood', { payload: { name: 'Onion' } }).id).toMatch(/^fd_[0-9a-f]{8}$/);
    expect(api.ok('upsertRecipe', { payload: { name: 'Soup', servings: 1 } }).id).toMatch(/^rc_[0-9a-f]{8}$/);
  });

  it('refuses a malformed id', () => {
    expect(loadApi().call('upsertFood', { payload: { id: 'has space', name: 'X' } }).error).toMatch(/^id must be/);
  });
});

describe('AC10: the referential rules', () => {
  it('refuses a write naming a food, recipe, plan entry or trip that does not exist, and names it', () => {
    const api = seeded();
    const refusal = (action: string, payload: object) => api.call(action, { payload }).error;
    expect(refusal('upsertRecipe', { name: 'X', servings: 1, lines: [{ text: 'y', food_id: 'fd_nope' }] })).toBe(
      'food_id "fd_nope" is not a food',
    );
    expect(refusal('upsertPlanEntry', { date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_nope' })).toBe(
      'recipe_id "rc_nope" is not a recipe',
    );
    expect(refusal('upsertPlanEntry', { date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_stew', trip_id: 'tr_nope' })).toBe(
      'trip_id "tr_nope" is not a trip',
    );
    expect(refusal('upsertCook', { recipe_id: 'rc_stew', date: '2026-11-01', plan_id: 'pl_nope' })).toBe(
      'plan_id "pl_nope" is not a plan entry',
    );
    expect(refusal('setTripItem', { trip_id: 'tr_nope', food_id: 'beef', choice: 'ks' })).toBe('No trip tr_nope.');
    expect(refusal('logFood', { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_nope', qty: 1, unit: 'g' })).toBe(
      'food_id "fd_nope" is not a food',
    );
    expect(refusal('setWalkthrough', { recipe_id: 'rc_nope', walkthrough: { format: 1, recipe: 'rc_nope' } })).toBe(
      'There is no recipe rc_nope',
    );
    expect(refusal('computeNutrition', { servings: 1, lines: [{ text: 'y', food_id: 'fd_nope' }] })).toBe(
      'food_id "fd_nope" is not a food',
    );
  });

  it('refuses deleting a food a recipe line or trip item uses, listing the uses', () => {
    const api = seeded();
    api.ok('upsertPlanEntry', { payload: { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_stew' } });
    const trip = api.ok('startTrip', { payload: { through: '2026-11-07', today: '2026-11-02' } }).trip;
    expect(api.call('deleteFood', { payload: { id: 'beef' } }).error).toBe(
      `Food "beef" is in use, so it was not deleted: recipes Stew (rc_stew); trips ${trip.id}`,
    );
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('refuses deleting a planned or logged recipe, listing them, and deletes nothing', () => {
    const api = seeded();
    api.ok('upsertPlanEntry', { payload: { id: 'pl_1', date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_stew' } });
    api.ok('logFood', { payload: { id: 'lg_1', date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_stew', qty: 1 } });
    expect(api.call('deleteRecipe', { payload: { id: 'rc_stew' } }).error).toBe(
      'Recipe "rc_stew" is in use, so it was not deleted: plan entries pl_1; log entries lg_1',
    );
    expect(api.rows('Recipes')).toHaveLength(1);
    expect(api.rows('RecipeLines')).toHaveLength(1);
  });

  it('refuses a second open trip', () => {
    const api = loadApi();
    const first = api.ok('startTrip', { payload: { through: '2026-11-07' } }).trip;
    expect(api.call('startTrip', { payload: { through: '2026-11-07' } }).error).toBe(
      `A trip is already open (${first.id}). Close it or throw it away first.`,
    );
    expect(api.rows('Trips')).toHaveLength(1);
  });

  it('no refusal carries a stack trace', () => {
    const api = seeded();
    const error = api.call('deleteRecipe', { payload: { id: 'rc_nope' } }).error!;
    expect(error).toBe('Recipe "rc_nope" not found');
    expect(error).not.toMatch(/\bat\s.+:\d+/);
  });
});

describe('AC12: the payload limit', () => {
  it('refuses a payload over 45,000 characters and writes nothing', () => {
    const api = seeded();
    const payload = JSON.stringify({ name: 'x'.repeat(45001) });
    const res = api.call('upsertFood', { payload });
    expect(res.success).toBe(false);
    expect(res.error).toBe(`payload is ${payload.length} characters, over the 45000 limit`);
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('stores a 10,000-character walkthrough whole', () => {
    const api = seeded();
    const walkthrough = { ...MINIMAL_WALKTHROUGH, note: 'n'.repeat(10000) };
    const payload = JSON.stringify({ recipe_id: 'rc_stew', walkthrough });
    expect(payload.length).toBeGreaterThan(10000);
    expect(payload.length).toBeLessThan(45000);
    api.ok('setWalkthrough', { payload });
    expect(api.ok('getWalkthrough', { recipe_id: 'rc_stew' }).walkthrough).toEqual(walkthrough);
    expect(String(api.rows('Walkthroughs')[0][2])).toBe(JSON.stringify(walkthrough));
  });
});
