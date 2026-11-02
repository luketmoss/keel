// #712: the food log's three decisions. The daily totals read shape (the
// contract Thrive's #714 reads), `dry_run` on logFood and updateLogEntry, and
// an edit re-snapshotting only when the amount, unit or food changes. #703's
// snapshot rules are in log-snapshot.test.ts.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const DAY = '2026-11-03';

/** #755's seven, as a day or an entry with none of them answers them. */
const SEVEN = ['satfat_g', 'transfat_g', 'cholesterol_mg', 'sodium_mg', 'fiber_g', 'sugars_g', 'added_sugars_g'];
const sevenAre = (v: number | null) => Object.fromEntries(SEVEN.map((k) => [k, v]));

function seed(api: Api) {
  api.ok('upsertFood', {
    payload: {
      id: 'yog',
      name: 'Greek yogurt',
      kcal_100g: 61.2,
      protein_100g: 2.45,
      carbs_100g: 3.67,
      fat_100g: 0.16,
      servings_json: [{ name: 'cup', g: 245 }],
    },
  });
  api.ok('upsertFood', { payload: { id: 'herbs', name: 'Herbes de Provence' } });
  api.ok('upsertFood', { payload: { id: 'beef', name: 'Beef', kcal_100g: 190, protein_100g: 19, carbs_100g: 0, fat_100g: 12 } });
  // Partial: one line has no food.
  api.ok('upsertRecipe', {
    payload: {
      id: 'stew',
      name: 'Beef Stew',
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

describe('getFoodLogTotals: the read shape #714 relies on', () => {
  it('answers from, to and days with every field, summed and rounded to 0.1', () => {
    const api = loadApi();
    seed(api);
    const a = log(api, { food_id: 'yog', qty: 1, unit: 'cup', slot: 'Breakfast' });
    const b = log(api, { food_id: 'yog', qty: 150, unit: 'g' });
    const totals = api.ok('getFoodLogTotals', { from: DAY, to: DAY });
    expect(totals).toEqual({
      from: DAY,
      to: DAY,
      days: [
        {
          date: DAY,
          entries: 2,
          unknown_entries: 0,
          kcal: Math.round((a.kcal + b.kcal) * 10) / 10,
          protein_g: Math.round((a.protein_g + b.protein_g) * 10) / 10,
          carbs_g: Math.round((a.carbs_g + b.carbs_g) * 10) / 10,
          fat_g: Math.round((a.fat_g + b.fat_g) * 10) / 10,
          partial: false,
          ...sevenAre(null),
          unknown: sevenAre(2),
        },
      ],
    });
    expect(Object.keys(totals.days[0])).toEqual([
      'date', 'entries', 'unknown_entries', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'partial', ...SEVEN, 'unknown',
    ]);
  });

  it('a date with nothing logged is absent, never present with zeros', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'yog', qty: 1, unit: 'cup', date: '2026-11-01' });
    log(api, { food_id: 'yog', qty: 1, unit: 'cup', date: '2026-11-03' });
    const totals = api.ok('getFoodLogTotals', { from: '2026-11-01', to: '2026-11-04' });
    expect(totals.days.map((d: { date: string }) => d.date)).toEqual(['2026-11-01', '2026-11-03']);
    expect(api.ok('getFoodLogTotals', { from: '2026-11-05', to: '2026-11-05' })).toEqual({
      from: '2026-11-05',
      to: '2026-11-05',
      days: [],
    });
  });

  it('an unknown entry is counted, left out of the sums and makes the day partial', () => {
    const api = loadApi();
    seed(api);
    const known = log(api, { food_id: 'yog', qty: 1, unit: 'cup' });
    log(api, { food_id: 'herbs', qty: 2, unit: 'g' });
    const day = api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0];
    expect(day).toMatchObject({ entries: 2, unknown_entries: 1, kcal: known.kcal, partial: true });
  });

  it('a sum is null only when every entry on the date is blank', () => {
    const api = loadApi();
    seed(api);
    log(api, { food_id: 'herbs', qty: 2, unit: 'g' });
    log(api, { food_id: 'herbs', qty: 3, unit: 'g' });
    expect(api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0]).toEqual({
      date: DAY,
      entries: 2,
      unknown_entries: 2,
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      partial: true,
      ...sevenAre(null),
      unknown: sevenAre(0),
    });
  });

  it('a partial recipe counts its known part and makes the day partial, not unknown', () => {
    const api = loadApi();
    seed(api);
    const stew = log(api, { recipe_id: 'stew', qty: 1 });
    expect(stew).toMatchObject({ kcal: 190, partial: true });
    expect(api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0]).toMatchObject({
      entries: 1,
      unknown_entries: 0,
      kcal: 190,
      partial: true,
    });
  });
});

describe('dry_run on logFood and updateLogEntry', () => {
  it('logFood with dry_run answers the entry as it would be stored and writes nothing', () => {
    const api = loadApi();
    seed(api);
    const preview = log(api, { id: 'lg_00000001', food_id: 'yog', qty: 1, unit: 'cup', dry_run: true });
    expect(api.rows('FoodLog')).toEqual([]);
    const saved = log(api, { id: 'lg_00000001', food_id: 'yog', qty: 1, unit: 'cup' });
    const strip = (e: Record<string, unknown>) => ({ ...e, logged_at: '', created: '', updated: '' });
    expect(strip(preview)).toEqual(strip(saved));
    expect(saved).toMatchObject({ grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 });
  });

  it('a dry run of a recipe answers its partial snapshot', () => {
    const api = loadApi();
    seed(api);
    expect(log(api, { recipe_id: 'stew', qty: 2, dry_run: true })).toMatchObject({
      kcal: 380,
      partial: true,
      unit: 'serving',
    });
    expect(api.rows('FoodLog')).toEqual([]);
  });

  it('updateLogEntry with dry_run answers the edit and changes nothing', () => {
    const api = loadApi();
    seed(api);
    const entry = log(api, { food_id: 'yog', qty: 1, unit: 'cup' });
    const before = api.rows('FoodLog');
    const preview = api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 2 }, dry_run: true } });
    expect(preview).toMatchObject({ id: entry.id, qty: 2, grams: 490 });
    expect(api.rows('FoodLog')).toEqual(before);
    expect(api.ok('getFoodLog', {})[0]).toEqual(entry);
  });

  it('a key caller\'s dry run writes no change-log row; the real write does', () => {
    const api = loadApi();
    seed(api);
    const logged = () => api.rows('MCPChangeLog').filter((r) => r[3] === 'FoodLog').length;
    log(api, { food_id: 'yog', qty: 1, unit: 'cup', dry_run: true, call_id: 'dry-1' });
    expect(logged()).toBe(0);
    const entry = log(api, { food_id: 'yog', qty: 1, unit: 'cup', call_id: 'real-1' });
    expect(logged()).toBe(1);
    api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 2 }, dry_run: true, call_id: 'dry-2' } });
    expect(logged()).toBe(1);
  });

  it("a key caller's dry run is not a logged write: it answers even while the change-log tab is missing", () => {
    const api = loadApi();
    seed(api);
    api.ss.sheets.delete('MCPChangeLog');
    expect(log(api, { food_id: 'yog', qty: 1, unit: 'cup', dry_run: true })).toMatchObject({ kcal: 149.9 });
    expect(api.call('logFood', { payload: { date: DAY, slot: 'Dinner', food_id: 'yog', qty: 1, unit: 'cup' } }).success).toBe(
      false,
    );
  });

  it('a refused dry run is the same refusal as the write', () => {
    const api = loadApi();
    seed(api);
    const res = api.call('logFood', { payload: { date: DAY, slot: 'Dinner', food_id: 'gone', qty: 1, unit: 'g', dry_run: true } });
    expect(res).toMatchObject({ success: false, error: 'food_id "gone" is not a food' });
  });
});

describe('retries', () => {
  it('the same id sent twice leaves one row', () => {
    const api = loadApi();
    seed(api);
    log(api, { id: 'lg_1a2b3c4d', recipe_id: 'stew', qty: 1 });
    log(api, { id: 'lg_1a2b3c4d', recipe_id: 'stew', qty: 1 });
    expect(api.rows('FoodLog')).toHaveLength(1);
    expect(api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0].entries).toBe(1);
  });
});

describe('an edit re-snapshots only when the amount, unit or food changes', () => {
  it('moving an entry to another meal keeps its stored numbers after the food changed', () => {
    const api = loadApi();
    seed(api);
    const entry = log(api, { food_id: 'yog', qty: 1, unit: 'cup' });
    api.ok('upsertFood', { payload: { id: 'yog', kcal_100g: 100, protein_100g: 10, carbs_100g: 10, fat_100g: 1 } });
    const moved = api.ok('updateLogEntry', { payload: { id: entry.id, changes: { slot: 'Lunch' } } });
    expect(moved).toMatchObject({ slot: 'Lunch', grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 });
    // The same amount sent again is not a change either.
    const same = api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 1, unit: 'cup' } } });
    expect(same.kcal).toBe(149.9);
  });

  it('changing the amount or the unit recalculates from the food as it is now', () => {
    const api = loadApi();
    seed(api);
    const entry = log(api, { food_id: 'yog', qty: 1, unit: 'cup' });
    api.ok('upsertFood', { payload: { id: 'yog', kcal_100g: 100, protein_100g: 10, carbs_100g: 10, fat_100g: 1 } });
    expect(api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 2 } } }).kcal).toBe(490);
    expect(api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 100, unit: 'g' } } }).kcal).toBe(100);
  });

  it('a recipe entry moved to another meal keeps its numbers after the recipe changed', () => {
    const api = loadApi();
    seed(api);
    const entry = log(api, { recipe_id: 'stew', qty: 1 });
    api.ok('upsertRecipe', { payload: { id: 'stew', servings: 4 } });
    expect(api.ok('updateLogEntry', { payload: { id: entry.id, changes: { slot: 'Lunch' } } }).kcal).toBe(190);
    expect(api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 2 } } }).kcal).toBe(190);
  });
});

describe('each MCP write is undoable', () => {
  it('undoCall reverts a log, an edit and a delete, restoring the stored numbers', () => {
    const api = loadApi();
    seed(api);
    const entry = log(api, { food_id: 'yog', qty: 1, unit: 'cup', call_id: 'log-1' });
    api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 2 }, call_id: 'edit-1' } });
    api.ok('deleteLogEntry', { payload: { id: entry.id, call_id: 'del-1' } });
    expect(api.rows('FoodLog')).toHaveLength(0);

    api.ok('undoCall', { payload: { call_id: 'del-1', confirm: true } });
    expect(api.ok('getFoodLog', {})[0]).toMatchObject({ id: entry.id, qty: 2, kcal: 299.9 });
    api.ok('undoCall', { payload: { call_id: 'edit-1', confirm: true } });
    expect(api.ok('getFoodLog', {})[0]).toMatchObject({ id: entry.id, qty: 1, kcal: 149.9 });
    api.ok('undoCall', { payload: { call_id: 'log-1', confirm: true } });
    expect(api.rows('FoodLog')).toHaveLength(0);
  });
});
