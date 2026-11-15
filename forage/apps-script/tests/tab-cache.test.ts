// #932: a tab is read from the Sheet at most once per request, and the Foods
// tab is kept in the script cache between requests, in chunks, for five minutes.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api, type CellValue } from './apps-script-sandbox';

/** Count each tab's getDisplayValues() calls from now on. */
function countReads(api: Api): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [name, sheet] of api.ss.sheets) {
    const getRange = sheet.getRange.bind(sheet);
    sheet.getRange = ((...args: Parameters<typeof getRange>) => {
      const range = getRange(...args);
      const getDisplayValues = range.getDisplayValues;
      range.getDisplayValues = () => {
        counts[name] = (counts[name] ?? 0) + 1;
        return getDisplayValues();
      };
      return range;
    }) as typeof sheet.getRange;
  }
  return counts;
}

const food = (id: string, name: string) => ({
  id,
  name,
  kcal_100g: 100,
  protein_100g: 10,
  carbs_100g: 10,
  fat_100g: 1,
  servings_json: [{ name: 'cup', g: 100 }],
});

/** Put `n` foods straight into the sheet, as a hand edit would, with long notes-like names. */
function fillFoods(api: Api, n: number) {
  const fields: string[] = api.sandbox.TABS.Foods.fields;
  const sheet = api.ss.getSheetByName('Foods')!;
  for (let i = 0; i < n; i++) {
    const row: CellValue[] = fields.map(() => '');
    row[fields.indexOf('id')] = `fd_${String(i).padStart(4, '0')}`;
    row[fields.indexOf('name')] = `Food ${String(i).padStart(4, '0')} ${'x'.repeat(120)}`;
    row[fields.indexOf('kind')] = 'ingredient';
    sheet.rows.push(row);
  }
}

const cacheKeys = (api: Api) => [...api.cache.keys()].filter((k) => k.startsWith('forage_foods:'));

/** The chunk keys the current meta names. */
function liveChunks(api: Api): string[] {
  const meta = JSON.parse(api.cache.get('forage_foods:meta')!.value);
  return Array.from({ length: meta.chunks }, (_, i) => `forage_foods:${meta.gen}:${i}`);
}

describe('one read of a tab per request', () => {
  it('reads a tab once until the request writes to it, and a read after the write sees it (AC 1)', () => {
    const api = loadApi();
    api.ok('upsertRecipe', { payload: { id: 'rc_0', name: 'Soup', servings: 2, lines: [] } });
    const counts = countReads(api);
    const { sandbox } = api;
    sandbox.resetTabMemo();
    sandbox.listRecords('Recipes');
    sandbox.listRecords('Recipes');
    sandbox.getRecord('Recipes', { id: 'rc_1' });
    expect(counts.Recipes).toBe(1);

    sandbox.upsertRecord('Recipes', { id: 'rc_1', name: 'Stew', servings: 2 });
    // The write finds its row in the tab the request already read; only the read after it is new.
    expect(counts.Recipes).toBe(2);
    expect(sandbox.getRecord('Recipes', { id: 'rc_1' }).name).toBe('Stew');
    expect(sandbox.listRecords('Recipes')).toHaveLength(2);
    expect(counts.Recipes).toBe(2);

    sandbox.appendRecords('Recipes', [{ id: 'rc_2', name: 'Soup' }]);
    expect(sandbox.listRecords('Recipes')).toHaveLength(3);
    sandbox.updateRecordsWhere('Recipes', (r: { id: string }) => r.id === 'rc_2', (r: { name: string }) => {
      r.name = 'Broth';
    });
    expect(sandbox.getRecord('Recipes', { id: 'rc_2' }).name).toBe('Broth');
    sandbox.deleteRecord('Recipes', { id: 'rc_1' });
    expect(sandbox.listRecords('Recipes').map((r: { id: string }) => r.id)).toEqual(['rc_0', 'rc_2']);
  });

  it('a new request starts with nothing held, so a change in the Sheet is seen', () => {
    const api = loadApi();
    api.ok('upsertRecipe', { payload: { id: 'rc_1', name: 'Stew', servings: 2, lines: [] } });
    const counts = countReads(api);
    expect(api.ok('getRecipe', { id: 'rc_1' }).name).toBe('Stew');
    const reads = counts.Recipes;
    expect(reads).toBe(1);
    const sheet = api.ss.getSheetByName('Recipes')!;
    sheet.rows[1][api.sandbox.TABS.Recipes.fields.indexOf('name')] = 'Chili';
    expect(api.ok('getRecipe', { id: 'rc_1' }).name).toBe('Chili');
  });

  it('a batch of log writes reads Foods and Recipes once, not once per entry', () => {
    const api = loadApi();
    for (const id of ['a', 'b', 'c', 'd', 'e']) api.ok('upsertFood', { payload: food(`fd_${id}`, id.toUpperCase()) });
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ food_id: `fd_${id}`, qty: 1, unit: 'cup' }));
    const counts = countReads(api);
    api.ok('logMeal', { payload: { date: '2026-11-01', slot: 'Lunch', items } });
    expect(counts.Foods ?? 0).toBeLessThanOrEqual(1);
    expect(api.rows('FoodLog')).toHaveLength(5);
  });
});

describe('the Foods cache', () => {
  it('getFoods served from the cache returns exactly what a Sheet read returns (AC 2)', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { ...food('fd_1', 'Oats'), brand: 'Quaker', packs_json: ['18 oz'], regular: true } });
    api.ok('upsertFood', { payload: { ...food('fd_2', 'Milk'), short_name: 'Milk' } });
    const fromSheet = api.ok('getFoods');
    expect(cacheKeys(api).length).toBeGreaterThan(1);
    const counts = countReads(api);
    const fromCache = api.ok('getFoods');
    expect(counts.Foods ?? 0).toBe(0);
    expect(JSON.stringify(fromCache)).toBe(JSON.stringify(fromSheet));
    expect(api.ok('getFood', { id: 'fd_1' }).brand).toBe('Quaker');
    expect(counts.Foods ?? 0).toBe(0);
  });

  it('every API write to Foods clears the cache, so the next read sees it (AC 3)', () => {
    const api = loadApi();
    const names = () => api.ok('getFoods').map((f: { name: string }) => f.name);
    const warm = () => {
      names();
      expect(cacheKeys(api).length).toBeGreaterThan(1);
    };

    api.ok('upsertFood', { payload: food('fd_1', 'Oats') });
    warm();
    api.ok('upsertFood', { payload: food('fd_2', 'Milk') });
    expect(names()).toEqual(['Milk', 'Oats']);

    warm();
    api.ok('upsertFood', { payload: { id: 'fd_2', name: 'Whole milk' } });
    expect(names()).toEqual(['Oats', 'Whole milk']);

    warm();
    api.ok('setFoodWeight', { payload: { food_id: 'fd_1', unit: 'cup', grams: 90 } });
    expect(api.ok('getFood', { id: 'fd_1' }).servings_json).toContainEqual({ name: 'cup', g: 90 });

    warm();
    api.ok('addStarterFoods', { payload: { ids: ['garlic'] } });
    expect(names()).toContain('Garlic');

    warm();
    api.ok('deleteFood', { payload: { id: 'fd_2' } });
    expect(names()).not.toContain('Whole milk');

    warm();
    api.ok('upsertFood', { payload: { ...food('fd_3', 'Rice'), call_id: 'rice-1' } });
    expect(names()).toContain('Rice');
    warm();
    api.ok('undoCall', { payload: { call_id: 'rice-1', confirm: true } });
    expect(names()).not.toContain('Rice');
  });

  it('a write finds its row in the Sheet, never in a cache that a hand edit has made stale', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: food('fd_1', 'Oats') });
    api.ok('upsertFood', { payload: food('fd_2', 'Milk') });
    api.ok('getFoods');
    // The owner deletes the first food by hand: Milk moves up a row.
    api.ss.getSheetByName('Foods')!.deleteRow(2);
    api.ok('upsertFood', { payload: { id: 'fd_2', name: 'Skim milk' } });
    api.cache.clear();
    expect(api.ok('getFoods').map((f: { name: string }) => f.name)).toEqual(['Skim milk']);
  });

  it('a Foods tab larger than one cache value is stored in chunks and read back whole (AC 4)', () => {
    const api = loadApi();
    fillFoods(api, 400);
    const fromSheet = api.ok('getFoods');
    expect(fromSheet).toHaveLength(400);
    const chunks = liveChunks(api);
    expect(chunks.length).toBeGreaterThan(2);
    for (const k of chunks) expect(api.cache.get(k)!.value.length).toBeLessThan(100 * 1024);

    const counts = countReads(api);
    expect(JSON.stringify(api.ok('getFoods'))).toBe(JSON.stringify(fromSheet));
    expect(counts.Foods ?? 0).toBe(0);
  });

  it('a missing or corrupt chunk falls back to a Sheet read (AC 4)', () => {
    const api = loadApi();
    fillFoods(api, 400);
    const fromSheet = JSON.stringify(api.ok('getFoods'));
    const chunks = liveChunks(api);

    api.cache.delete(chunks[1]);
    let counts = countReads(api);
    expect(JSON.stringify(api.ok('getFoods'))).toBe(fromSheet);
    expect(counts.Foods).toBe(1);

    // The fallback re-cached it. Now change a character, keeping the length.
    const again = liveChunks(api);
    const entry = api.cache.get(again[0])!;
    api.cache.set(again[0], { ...entry, value: entry.value.replace('Food', 'Fxxd') });
    counts = countReads(api);
    expect(JSON.stringify(api.ok('getFoods'))).toBe(fromSheet);
    expect(counts.Foods).toBe(1);

    // Unparseable meta.
    api.cache.set('forage_foods:meta', { value: '{nope', ttl: 300 });
    counts = countReads(api);
    expect(JSON.stringify(api.ok('getFoods'))).toBe(fromSheet);
    expect(counts.Foods).toBe(1);
  });

  it('expires within five minutes, so a hand edit appears in that time (AC 5)', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: food('fd_1', 'Oats') });
    api.ok('getFoods');
    const entries = cacheKeys(api).map((k) => api.cache.get(k)!);
    expect(entries.length).toBeGreaterThan(1);
    for (const e of entries) expect(e.ttl).toBeLessThanOrEqual(300);

    api.ss.getSheetByName('Foods')!.rows[1][api.sandbox.TABS.Foods.fields.indexOf('name')] = 'Rolled oats';
    expect(api.ok('getFoods')[0].name).toBe('Oats');
    for (const k of cacheKeys(api)) api.cache.delete(k); // what the expiry does
    expect(api.ok('getFoods')[0].name).toBe('Rolled oats');
  });

  it('a cache that cannot be written does not fail the request', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: food('fd_1', 'Oats') });
    api.sandbox.CacheService.getScriptCache = () => {
      throw new Error('Service invoked too many times');
    };
    expect(api.ok('getFoods')).toHaveLength(1);
    api.ok('upsertFood', { payload: food('fd_2', 'Milk') });
    expect(api.ok('getFoods')).toHaveLength(2);
  });
});
