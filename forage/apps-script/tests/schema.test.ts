// #703 AC1, AC2: the 11 tabs and their columns, and ensureSchema.

import { describe, expect, it } from 'vitest';
import { loadApi, makeSheet } from './apps-script-sandbox';

// Transcribed from #703's table on purpose: this is the spec the source must match.
const EXPECTED: Record<string, string[]> = {
  Foods: [
    'id', 'name', 'kind', 'brand', 'category', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g',
    'servings_json', 'buy_unit', 'buy_unit_plural', 'buy_unit_g', 'usual_store', 'usually_have', 'regular',
    'packs_json', 'last_buy', 'last_bought_on', 'never_shop', 'source', 'source_ref', 'verified', 'barcode',
    'created', 'updated',
  ],
  Recipes: ['id', 'name', 'source_url', 'source_site', 'servings', 'total_min', 'notes', 'created', 'updated'],
  RecipeLines: ['recipe_id', 'line_id', 'position', 'section', 'text', 'qty', 'unit', 'food_id', 'grams', 'optional'],
  Steps: ['recipe_id', 'position', 'section', 'name', 'text'],
  Walkthroughs: ['recipe_id', 'format', 'walkthrough_json', 'updated'],
  Plan: ['id', 'date', 'slot', 'recipe_id', 'note', 'trip_id', 'created', 'updated'],
  Trips: ['id', 'status', 'through', 'created', 'closed_at'],
  TripItems: ['trip_id', 'food_id', 'lines_json', 'mine', 'choice', 'suggested', 'buy', 'bought'],
  FoodLog: [
    'id', 'date', 'slot', 'food_id', 'recipe_id', 'qty', 'unit', 'grams', 'kcal', 'protein_g', 'carbs_g',
    'fat_g', 'partial', 'source', 'logged_at', 'created', 'updated',
  ],
  Cooks: ['id', 'recipe_id', 'date', 'rating', 'note', 'plan_id', 'created'],
  Config: ['key', 'value', 'updated'],
};

const KEYS: Record<string, string[]> = {
  Foods: ['id'], Recipes: ['id'], RecipeLines: ['recipe_id', 'line_id'], Steps: ['recipe_id', 'position'],
  Walkthroughs: ['recipe_id'], Plan: ['id'], Trips: ['id'], TripItems: ['trip_id', 'food_id'], FoodLog: ['id'],
  Cooks: ['id'], Config: ['key'],
};

describe('AC1: types.js defines the 11 tabs with exactly these columns', () => {
  const { sandbox } = loadApi();

  it('has exactly the 11 tabs, in order', () => {
    expect(sandbox.TAB_ORDER).toEqual(Object.keys(EXPECTED));
    expect(Object.keys(sandbox.TABS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [tab, fields] of Object.entries(EXPECTED)) {
    it(`${tab}: columns in order, keyed by ${KEYS[tab].join(' + ')}`, () => {
      expect([...sandbox.TABS[tab].fields]).toEqual(fields);
      expect([...sandbox.TABS[tab].key]).toEqual(KEYS[tab]);
      for (const field of Object.keys(sandbox.TABS[tab].kinds)) expect(fields).toContain(field);
    });
  }
});

describe('AC2: ensureSchema', () => {
  it('creates all 11 tabs with frozen header rows and schema_version 1 on an empty sheet', () => {
    const api = loadApi({ empty: true });
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual(Object.keys(EXPECTED));
    expect(data.existing).toEqual([]);
    expect(data.schema_version).toBe('1');
    for (const [tab, fields] of Object.entries(EXPECTED)) {
      const sheet = api.ss.getSheetByName(tab)!;
      expect(sheet.rows[0]).toEqual(fields);
      expect(sheet.frozenRows).toBe(1);
    }
    expect(api.rows('Config').map((r) => r.slice(0, 2))).toEqual([['schema_version', '1']]);
    expect(api.ok('getConfig')).toEqual({ schema_version: '1' });
  });

  it('changes nothing on a second run', () => {
    const api = loadApi({ empty: true });
    api.ok('ensureSchema');
    const before = JSON.stringify([...api.ss.sheets.entries()].map(([n, s]) => [n, s.rows]));
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual([]);
    expect(data.existing).toEqual(Object.keys(EXPECTED));
    expect(JSON.stringify([...api.ss.sheets.entries()].map(([n, s]) => [n, s.rows]))).toBe(before);
  });

  it('leaves a tab that already exists untouched, header and rows', () => {
    const api = loadApi({ empty: true });
    const odd = [['something', 'else'], ['kept', 'as is']];
    api.ss.sheets.set('Foods', makeSheet('Foods', odd));
    const data = api.ok('ensureSchema');
    expect(data.existing).toEqual(['Foods']);
    expect(data.created).toHaveLength(10);
    expect(api.ss.getSheetByName('Foods')!.rows).toEqual([['something', 'else'], ['kept', 'as is']]);
  });

  it('is key-only and holds the script lock', () => {
    const api = loadApi({ empty: true });
    api.ok('ensureSchema');
    expect(api.lock.acquired).toBeGreaterThan(0);
    expect(api.lock.held).toBe(false);
  });
});
