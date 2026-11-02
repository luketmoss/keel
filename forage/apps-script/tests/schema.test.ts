// #703 AC1, AC2: the tabs and their columns, and ensureSchema; #713 adds the 12th, MCPChangeLog; #755 appends
// seven nutrient columns to Foods and FoodLog, and ensureSchema appends them to an existing Sheet.

import { describe, expect, it } from 'vitest';
import { loadApi, makeSheet, NEW_SHEET_COLUMNS, type CellValue } from './apps-script-sandbox';

// Transcribed from #703's table on purpose: this is the spec the source must match.
const EXPECTED: Record<string, string[]> = {
  Foods: [
    'id', 'name', 'kind', 'brand', 'category', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g',
    'servings_json', 'buy_unit', 'buy_unit_plural', 'buy_unit_g', 'usual_store', 'usually_have', 'regular',
    'packs_json', 'last_buy', 'last_bought_on', 'never_shop', 'source', 'source_ref', 'verified', 'barcode',
    'created', 'updated',
    'satfat_100g', 'transfat_100g', 'cholesterol_mg_100g', 'sodium_mg_100g', 'fiber_100g', 'sugars_100g',
    'added_sugars_100g',
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
    'satfat_g', 'transfat_g', 'cholesterol_mg', 'sodium_mg', 'fiber_g', 'sugars_g', 'added_sugars_g',
  ],
  Cooks: ['id', 'recipe_id', 'date', 'rating', 'note', 'plan_id', 'created'],
  Config: ['key', 'value', 'updated'],
  MCPChangeLog: ['logged_at', 'call_id', 'action', 'tab', 'row_key', 'before', 'after'],
};

const KEYS: Record<string, string[]> = {
  Foods: ['id'], Recipes: ['id'], RecipeLines: ['recipe_id', 'line_id'], Steps: ['recipe_id', 'position'],
  Walkthroughs: ['recipe_id'], Plan: ['id'], Trips: ['id'], TripItems: ['trip_id', 'food_id'], FoodLog: ['id'],
  Cooks: ['id'], Config: ['key'], MCPChangeLog: ['call_id', 'tab', 'row_key'],
};

describe('AC1: types.js defines the 12 tabs with exactly these columns', () => {
  const { sandbox } = loadApi();

  it('has exactly the 12 tabs, in order', () => {
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
  it('creates all 12 tabs with frozen header rows and schema_version 3 on an empty sheet', () => {
    const api = loadApi({ empty: true });
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual(Object.keys(EXPECTED));
    expect(data.existing).toEqual([]);
    expect(data.schema_version).toBe('3');
    for (const [tab, fields] of Object.entries(EXPECTED)) {
      const sheet = api.ss.getSheetByName(tab)!;
      expect(sheet.rows[0]).toEqual(fields);
      expect(sheet.frozenRows).toBe(1);
    }
    expect(api.rows('Config').map((r) => r.slice(0, 2))).toEqual([['schema_version', '3']]);
    expect(api.ok('getConfig')).toEqual({ schema_version: '3' });
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
    expect(data.created).toHaveLength(11);
    expect(api.ss.getSheetByName('Foods')!.rows).toEqual([['something', 'else'], ['kept', 'as is']]);
  });

  it('on a sheet at schema_version 1 adds MCPChangeLog, raises the version, and changes no other tab (#713)', () => {
    const api = loadApi({ empty: true });
    api.ok('ensureSchema');
    // Back to how #703 left a sheet: no MCPChangeLog, version 1, and some data.
    api.ok('setConfig', { payload: { key: 'schema_version', value: '1' } });
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion' } });
    api.ss.sheets.delete('MCPChangeLog');
    // A key write is refused, not left unlogged, until the tab is back.
    expect(api.call('upsertFood', { payload: { id: 'fd_2', name: 'Leek' } }).error).toMatch(/MCPChangeLog tab missing/);
    const others = () =>
      JSON.stringify([...api.ss.sheets.entries()].filter(([n]) => n !== 'Config' && n !== 'MCPChangeLog').map(([n, s]) => [n, s.rows]));
    const before = others();
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual(['MCPChangeLog']);
    expect(data.schema_version).toBe('3');
    expect(api.ss.getSheetByName('MCPChangeLog')!.rows).toEqual([EXPECTED.MCPChangeLog]);
    expect(others()).toBe(before);
    expect(api.rows('Config').map((r) => r[0])).toEqual(['schema_version']);
  });

  it('is key-only and holds the script lock', () => {
    const api = loadApi({ empty: true });
    api.ok('ensureSchema');
    expect(api.lock.acquired).toBeGreaterThan(0);
    expect(api.lock.held).toBe(false);
  });
});

// #755: the seven nutrient columns on a Sheet that predates them.
const OLD_FOODS = EXPECTED.Foods.slice(0, 26);
const OLD_FOOD_LOG = EXPECTED.FoodLog.slice(0, 17);
const SEVEN_FOODS = EXPECTED.Foods.slice(26);
const SEVEN_LOG = EXPECTED.FoodLog.slice(17);

/** A Sheet as schema version 2 left it: Foods and FoodLog without the seven, each with a row of data. */
function versionTwo() {
  const api = loadApi({ empty: true });
  api.ok('ensureSchema');
  const food: CellValue[] = OLD_FOODS.map((f) => (f === 'id' ? 'fd_1' : f === 'name' ? 'Onion' : f === 'kind' ? 'ingredient' : ''));
  const entry: CellValue[] = OLD_FOOD_LOG.map((f) =>
    f === 'id' ? 'lg_1' : f === 'date' ? '2026-11-01' : f === 'slot' ? 'Dinner' : f === 'food_id' ? 'fd_1' : f === 'kcal' ? 44 : '',
  );
  api.ss.sheets.set('Foods', makeSheet('Foods', [[...OLD_FOODS], food]));
  api.ss.sheets.set('FoodLog', makeSheet('FoodLog', [[...OLD_FOOD_LOG], entry]));
  api.ok('setConfig', { payload: { key: 'schema_version', value: '2' } });
  return api;
}

const snapshot = (api: ReturnType<typeof loadApi>) =>
  JSON.stringify([...api.ss.sheets.entries()].filter(([n]) => n !== 'Config').map(([n, s]) => [n, s.rows]));

describe('#755: ensureSchema appends the seven nutrient columns', () => {
  it('appends them to Foods and FoodLog after updated, moves nothing, and raises the version to 3', () => {
    const api = versionTwo();
    // Foods had 26 columns, as many as a new Sheet has: the tab must be widened first.
    expect(api.ss.getSheetByName('Foods')!.getMaxColumns()).toBe(NEW_SHEET_COLUMNS);
    const before = {
      foods: JSON.stringify(api.ss.getSheetByName('Foods')!.rows),
      log: JSON.stringify(api.ss.getSheetByName('FoodLog')!.rows),
    };
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual([]);
    expect(data.extended).toEqual([
      { tab: 'Foods', added: SEVEN_FOODS },
      { tab: 'FoodLog', added: SEVEN_LOG },
    ]);
    expect(data.mismatched).toEqual([]);
    expect(data.schema_version).toBe('3');

    const foods = api.ss.getSheetByName('Foods')!.rows;
    expect(foods[0]).toEqual(EXPECTED.Foods);
    expect(foods[0].indexOf('updated')).toBe(25);
    // Every existing cell is where it was, and unchanged; the data row gains nothing.
    (JSON.parse(before.foods) as CellValue[][]).forEach((row, r) => row.forEach((v, c) => expect(foods[r][c]).toEqual(v)));
    expect(foods[1]).toHaveLength(OLD_FOODS.length);
    const log = api.ss.getSheetByName('FoodLog')!.rows;
    expect(log[0]).toEqual(EXPECTED.FoodLog);
    (JSON.parse(before.log) as CellValue[][]).forEach((row, r) => row.forEach((v, c) => expect(log[r][c]).toEqual(v)));
    expect(log[1]).toHaveLength(OLD_FOOD_LOG.length);

    // The rows already there read back with the seven blank.
    const onion = api.ok('getFood', { id: 'fd_1' });
    for (const f of SEVEN_FOODS) expect(onion[f]).toBeNull();
    const [entry] = api.ok('getFoodLog');
    for (const f of SEVEN_LOG) expect(entry[f]).toBeNull();
  });

  it('a second run changes nothing and says so', () => {
    const api = versionTwo();
    api.ok('ensureSchema');
    const before = snapshot(api);
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual([]);
    expect(data.extended).toEqual([]);
    expect(data.mismatched).toEqual([]);
    expect(data.schema_version).toBe('3');
    expect(snapshot(api)).toBe(before);
  });

  it('leaves a tab whose header is not a prefix of its fields alone, names it, and keeps the version', () => {
    const api = versionTwo();
    const renamed = [...OLD_FOODS];
    renamed[renamed.indexOf('kcal_100g')] = 'calories';
    api.ss.sheets.set('Foods', makeSheet('Foods', [renamed, ['fd_1', 'Onion']]));
    const foodsBefore = JSON.stringify(api.ss.getSheetByName('Foods')!.rows);
    const data = api.ok('ensureSchema');
    expect(data.mismatched).toEqual(['Foods']);
    expect(data.extended).toEqual([{ tab: 'FoodLog', added: SEVEN_LOG }]);
    expect(JSON.stringify(api.ss.getSheetByName('Foods')!.rows)).toBe(foodsBefore);
    expect(data.schema_version).toBe('2');
  });

  it('a new Sheet gets Foods and FoodLog with every column, the seven included', () => {
    const api = loadApi({ empty: true });
    api.ok('ensureSchema');
    expect(api.ss.getSheetByName('Foods')!.rows[0]).toEqual(EXPECTED.Foods);
    expect(api.ss.getSheetByName('FoodLog')!.rows[0]).toEqual(EXPECTED.FoodLog);
    expect(api.ss.getSheetByName('Foods')!.getMaxColumns()).toBe(EXPECTED.Foods.length);
  });
});
