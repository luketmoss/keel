// #707 The food library: food validation and merging, used_by, deleting a food
// in use, "Set a weight", by_line, the Open Food Facts lookup, the starter list
// and its suggestions in the import, and a batch of foods undone as one call.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api, type FetchReply } from './apps-script-sandbox';

const RICOTTA = { id: 'ric', name: 'Ricotta', kcal_100g: 174, protein_100g: 11.3, carbs_100g: 3, fat_100g: 13 };

function refusal(api: Api, payload: Record<string, unknown>): string | undefined {
  return api.call('upsertFood', { payload }).error;
}

describe('upsertFood validates and merges', () => {
  it('a column the payload does not name keeps its stored value', () => {
    const api = loadApi();
    api.ok('upsertFood', {
      payload: { ...RICOTTA, usual_store: 'ks', servings_json: [{ name: 'cup', g: 246 }], packs_json: ['15 oz'], regular: true },
    });
    const merged = api.ok('upsertFood', { payload: { id: 'ric', brand: 'Galbani' } });
    expect(merged).toMatchObject({
      name: 'Ricotta', brand: 'Galbani', kcal_100g: 174, usual_store: 'ks', servings_json: [{ name: 'cup', g: 246 }],
      packs_json: ['15 oz'], regular: true,
    });
  });

  it('refuses each invalid case with its fixed text, and writes nothing', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'kind', brand: 'KIND', name: 'Dark Chocolate Nuts & Sea Salt bar' } });
    expect(refusal(api, { name: '' })).toBe('name is required');
    expect(refusal(api, { brand: 'kind', name: 'dark chocolate nuts & sea salt BAR' })).toBe(
      'a food named KIND Dark Chocolate Nuts & Sea Salt bar already exists',
    );
    expect(refusal(api, { name: 'X', kcal_100g: 100 })).toBe(
      'kcal_100g, protein_100g, carbs_100g and fat_100g are all set or all blank',
    );
    expect(refusal(api, { name: 'X', kcal_100g: -1, protein_100g: 0, carbs_100g: 0, fat_100g: 0 })).toBe(
      'kcal_100g must be at least 0',
    );
    expect(refusal(api, { name: 'X', kcal_100g: 903, protein_100g: 0, carbs_100g: 0, fat_100g: 100 })).toBe(
      'kcal_100g must be at most 902',
    );
    expect(refusal(api, { name: 'X', kcal_100g: 400, protein_100g: 40, carbs_100g: 40, fat_100g: 21 })).toBe(
      'protein, carbs and fat add up to more than 100 g per 100 g',
    );
    expect(refusal(api, { name: 'X', servings_json: [{ name: '', g: 3 }] })).toBe('each serving needs a name');
    expect(refusal(api, { name: 'X', servings_json: [{ name: 'cup', g: 0 }] })).toBe(
      'serving "cup" g must be greater than 0',
    );
    expect(refusal(api, { name: 'X', servings_json: [{ name: 'cup', g: 120 }, { name: 'Cup', g: 125 }] })).toBe(
      'two servings are named "Cup"',
    );
    expect(refusal(api, { name: 'X', usual_store: 'walmart' })).toBe('usual_store must be one of ks, costco, other, or blank');
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('the duplicate refusal names the existing food, and renaming a food to its own name is fine', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'on', name: 'Onion' } });
    const res = api.call('upsertFood', { payload: { name: 'onion' } });
    expect(res).toMatchObject({ code: 'duplicate', duplicate_of: { id: 'on', name: 'Onion' } });
    expect(api.ok('upsertFood', { payload: { id: 'on', name: 'ONION' } }).name).toBe('ONION');
  });

  it('OFF foods saved through the API may be unverified', () => {
    const api = loadApi();
    const food = api.ok('upsertFood', { payload: { name: 'Bar', kind: 'packaged', source: 'off', source_ref: '0123456789012' } });
    expect(food.verified).toBe(false);
  });
});

/** Two recipes using ricotta by the carton, which has no weight yet. */
function twoRecipes(): Api {
  const api = loadApi();
  api.ok('upsertFood', { payload: RICOTTA });
  api.ok('upsertFood', { payload: { id: 'egg', name: 'Egg', kcal_100g: 143, protein_100g: 12.6, carbs_100g: 0.7, fat_100g: 9.5, servings_json: [{ name: 'large', g: 50 }] } });
  for (const [id, name, servings] of [['rc_las', 'Lasagna', 6], ['rc_cal', 'Calzone', 4]] as const) {
    api.ok('upsertRecipe', {
      payload: {
        id, name, servings,
        lines: [
          { text: '1 15 oz carton ricotta', qty: 1, unit: 'carton', food_id: 'ric' },
          { text: '2 eggs', qty: 2, unit: '', food_id: 'egg' },
        ],
      },
    });
  }
  return api;
}

describe('getFood used_by, and deleting a food in use', () => {
  it('lists the recipes that use a food, by name', () => {
    const api = twoRecipes();
    expect(api.ok('getFood', { id: 'ric' }).used_by).toEqual([
      { id: 'rc_cal', name: 'Calzone' },
      { id: 'rc_las', name: 'Lasagna' },
    ]);
  });

  it('refuses deleting a used food with code in_use and the recipes named; an unused one is gone', () => {
    const api = twoRecipes();
    const res = api.call('deleteFood', { payload: { id: 'ric' } });
    expect(res).toMatchObject({
      success: false,
      code: 'in_use',
      error: 'Food "ric" is in use, so it was not deleted: recipes Calzone (rc_cal), Lasagna (rc_las)',
      uses: { recipes: [{ id: 'rc_cal', name: 'Calzone' }, { id: 'rc_las', name: 'Lasagna' }], trips: [] },
    });
    api.ok('upsertFood', { payload: { id: 'lone', name: 'Saffron' } });
    expect(api.ok('deleteFood', { payload: { id: 'lone' } })).toEqual({ id: 'lone', deleted: true });
    expect(api.call('getFood', { id: 'lone' }).error).toBe('Food "lone" not found');
  });
});

describe('Set a weight', () => {
  it('a 15 oz carton stores 425.2 g as carton and changes every recipe using the food, with no recipe edit', () => {
    const api = twoRecipes();
    const before = ['rc_las', 'rc_cal'].map((id) => api.ok('getRecipe', { id }));
    expect(before.map((r) => r.nutrition.missing)).toEqual([[{ line_id: 'L1', reason: 'no_weight' }], [{ line_id: 'L1', reason: 'no_weight' }]]);
    const linesBefore = JSON.stringify(api.rows('RecipeLines'));

    const food = api.ok('setFoodWeight', { payload: { food_id: 'ric', unit: 'carton', grams: 15 * 28.3495 } });
    expect(food.servings_json).toEqual([{ name: 'carton', g: 425.2 }]);
    expect(food).toMatchObject({ name: 'Ricotta', kcal_100g: 174 });

    const after = ['rc_las', 'rc_cal'].map((id) => api.ok('getRecipe', { id }));
    expect(after.map((r) => r.partial)).toEqual([false, false]);
    // 425.2 g of ricotta at 174 kcal / 100 g, plus 2 eggs at 71.5 kcal, over 6 and over 4 servings.
    expect(after[0].nutrition.per_serving.kcal).toBe(Math.round(((425.2 * 1.74 + 143) / 6) * 10) / 10);
    expect(after[1].nutrition.per_serving.kcal).toBe(Math.round(((425.2 * 1.74 + 143) / 4) * 10) / 10);
    expect(after[0].nutrition.per_serving.kcal).toBeGreaterThan(before[0].nutrition.per_serving.kcal);
    expect(JSON.stringify(api.rows('RecipeLines'))).toBe(linesBefore);
  });

  it('replaces a weight of the same name and leaves the others', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'on', name: 'Onion', servings_json: [{ name: 'medium', g: 110 }, { name: 'cup', g: 160 }] } });
    api.ok('setFoodWeight', { payload: { food_id: 'on', unit: 'Medium', grams: 120 } });
    expect(api.ok('getFood', { id: 'on' }).servings_json).toEqual([{ name: 'medium', g: 120 }, { name: 'cup', g: 160 }]);
    expect(api.call('setFoodWeight', { payload: { food_id: 'on', unit: 'cup', grams: 0 } }).error).toBe('grams must be greater than 0');
    expect(api.call('setFoodWeight', { payload: { food_id: 'nope', unit: 'cup', grams: 5 } }).error).toBe('Food "nope" not found');
  });
});

describe('getRecipe by_line', () => {
  it('each counted line has grams and kcal a serving, summing to the per-serving figure within rounding', () => {
    const api = twoRecipes();
    api.ok('setFoodWeight', { payload: { food_id: 'ric', unit: 'carton', grams: 425.2 } });
    const r = api.ok('getRecipe', { id: 'rc_las' });
    expect(r.nutrition.by_line.map((l: { line_id: string }) => l.line_id)).toEqual(['L1', 'L2']);
    expect(r.nutrition.by_line[1]).toEqual({ line_id: 'L2', grams: 100, kcal: 23.8 });
    const sum = r.nutrition.by_line.reduce((n: number, l: { kcal: number }) => n + l.kcal, 0);
    expect(Math.abs(sum - r.nutrition.per_serving.kcal)).toBeLessThanOrEqual(0.1);
  });

  it('a line left out has kcal null', () => {
    const api = twoRecipes();
    expect(api.ok('getRecipe', { id: 'rc_las' }).nutrition.by_line[0]).toEqual({ line_id: 'L1', grams: null, kcal: null });
  });
});

// ---------------------------------------------------------------- Open Food Facts

const CODE = '0123456789012';
const PRODUCT = {
  code: CODE,
  status: 1,
  product: {
    code: CODE,
    product_name: 'Crunch Bar',
    brands: 'Acme Foods, Acme',
    serving_size: '1 bar (40 g)',
    serving_quantity: 40,
    nutriments: { 'energy-kcal_100g': 450, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 20 },
  },
};

function offApi(reply: (url: string, opts: Record<string, unknown>) => FetchReply) {
  return loadApi({ pages: reply });
}
const json = (status: number, body: unknown): FetchReply => ({ status, body: JSON.stringify(body) });

describe('lookupBarcode', () => {
  it('answers a fixture product per 100 g, with the label serving and verified blank, and writes nothing', () => {
    let headers: unknown;
    const api = offApi((url, opts) => {
      headers = opts.headers;
      expect(url).toBe(`https://world.openfoodfacts.org/api/v2/product/${CODE}.json?fields=code,product_name,brands,serving_size,serving_quantity,nutriments`);
      return json(200, PRODUCT);
    });
    const d = api.ok('lookupBarcode', { code: '0123 4567 89012' });
    expect(d).toMatchObject({ found: true, reason: '', warnings: [], already_in_library: null });
    expect(d.food).toEqual({
      id: '', name: 'Crunch Bar', kind: 'packaged', brand: 'Acme Foods', category: '',
      kcal_100g: 450, protein_100g: 10, carbs_100g: 60, fat_100g: 20,
      servings_json: [{ name: 'bar', g: 40 }], source: 'off', source_ref: CODE, verified: false, barcode: CODE,
      // #755: the fixture has none of the seven.
      satfat_100g: null, transfat_100g: null, cholesterol_mg_100g: null, sodium_mg_100g: null, fiber_100g: null,
      sugars_100g: null, added_sugars_100g: null,
    });
    expect((headers as Record<string, string>)['User-Agent']).toMatch(/^Forage\//);
    expect(api.rows('Foods')).toEqual([]);
  });

  it('each failure answers a distinct fixed reason, and none writes a row', () => {
    const cases: [string, FetchReply | null, Record<string, unknown>][] = [
      ['not on Open Food Facts', json(404, { status: 0, status_verbose: 'product not found' }), { found: false, reason: 'not_found' }],
      ['no nutrition', json(200, { ...PRODUCT, product: { ...PRODUCT.product, nutriments: {} } }), { found: true, reason: 'no_nutrition' }],
      ['busy', { status: 429, body: '' }, { success: false, code: 'busy', error: 'Open Food Facts is busy. Try again in a minute.' }],
      ['network', { throws: 'Address unavailable: https://world.openfoodfacts.org/...' }, {
        success: false, code: 'unreachable', error: 'Open Food Facts could not be reached.',
      }],
      ['malformed', null, { success: false, code: 'bad_code', error: 'A barcode is 8, 12, 13 or 14 digits.' }],
    ];
    const reasons = new Set<string>();
    for (const [name, reply, expected] of cases) {
      const api = offApi(() => reply ?? json(200, PRODUCT));
      const res = api.call('lookupBarcode', { code: reply ? CODE : '12345' });
      const got = res.success ? res.data : res;
      expect(got, name).toMatchObject(expected);
      reasons.add(String(got.reason ?? got.code));
      if (name === 'no nutrition') expect(got.food).toMatchObject({ name: 'Crunch Bar', brand: 'Acme Foods', kcal_100g: null, barcode: CODE });
      if (name === 'malformed') expect(api.fetches).toEqual([]);
      expect(api.rows('Foods'), name).toEqual([]);
    }
    expect(reasons.size).toBe(5);
  });

  it('warns when the calories and the macros disagree by more than 20% and 20 kcal', () => {
    const odd = { ...PRODUCT, product: { ...PRODUCT.product, nutriments: { 'energy-kcal_100g': 250, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 20 } } };
    expect(offApi(() => json(200, odd)).ok('lookupBarcode', { code: CODE }).warnings).toEqual(['energy_mismatch']);
    const close = { ...PRODUCT, product: { ...PRODUCT.product, nutriments: { 'energy-kcal_100g': 430, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 20 } } };
    expect(offApi(() => json(200, close)).ok('lookupBarcode', { code: CODE }).warnings).toEqual([]);
  });

  it('a code the library already has answers that food without asking Open Food Facts', () => {
    const api = offApi(() => json(200, PRODUCT));
    api.ok('upsertFood', { payload: { id: 'fd_bar', brand: 'Acme', name: 'Crunch', barcode: CODE } });
    expect(api.ok('lookupBarcode', { code: CODE })).toMatchObject({ already_in_library: { id: 'fd_bar', name: 'Acme Crunch' }, food: null });
    expect(api.fetches).toEqual([]);
  });
});

// ---------------------------------------------------------------- the starter list

describe('the generated starter list', () => {
  it('has 70 to 80 foods, each with all four values, unique ids and no alias on two foods', () => {
    const { sandbox } = loadApi();
    const list = sandbox.STARTER_FOODS as any[];
    expect(list.length).toBeGreaterThanOrEqual(70);
    expect(list.length).toBeLessThanOrEqual(80);
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    const owner: Record<string, string> = {};
    for (const s of list) {
      for (const f of ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g']) expect(typeof s[f], `${s.id} ${f}`).toBe('number');
      expect(s.protein_100g + s.carbs_100g + s.fat_100g, s.id).toBeLessThanOrEqual(100);
      expect(s.fdc, s.id).toBeGreaterThan(0);
      for (const key of sandbox.starterKeys(s) as string[]) {
        expect(owner[key] === undefined || owner[key] === s.id, `"${key}" is on ${owner[key]} and ${s.id}`).toBe(true);
        owner[key] = s.id;
      }
    }
  });
});

describe('addStarterFoods', () => {
  it('adds each chosen food once; twice leaves one row per food', () => {
    const api = loadApi();
    const first = api.ok('addStarterFoods', { payload: { ids: ['flour-all-purpose', 'garlic'] } });
    expect(first.added.map((a: { starter_id: string }) => a.starter_id)).toEqual(['flour-all-purpose', 'garlic']);
    const garlic = api.ok('getFood', { id: first.added[1].id });
    expect(garlic).toMatchObject({
      name: 'Garlic', kind: 'ingredient', source: 'usda', source_ref: '169230', kcal_100g: 149,
      servings_json: [{ name: 'clove', g: 3 }, { name: 'tsp', g: 2.8 }],
    });
    const again = api.ok('addStarterFoods', { payload: { ids: ['garlic', 'flour-all-purpose'] } });
    expect(again).toMatchObject({ added: [], filled: [] });
    expect(again.existing.map((e: { id: string }) => e.id).sort()).toEqual(first.added.map((a: { id: string }) => a.id).sort());
    expect(api.rows('Foods')).toHaveLength(2);
    expect(api.ok('getStarterFoods', { q: 'garlic' }).find((s: { id: string }) => s.id === 'garlic').in_library).toBe(first.added[1].id);
  });

  it('fills a same-named name-only food, keeping its id and every field already set', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_flour', name: 'flour', source: 'manual', usual_store: 'costco' } });
    const status = api.ok('getStarterFoods', { q: 'flour' }).find((s: { id: string }) => s.id === 'flour-all-purpose');
    expect(status).toMatchObject({ in_library: '', can_fill: 'fd_flour' });
    const res = api.ok('addStarterFoods', { payload: { ids: ['flour-all-purpose'] } });
    expect(res.filled).toEqual([{ starter_id: 'flour-all-purpose', id: 'fd_flour', name: 'flour' }]);
    expect(api.ok('getFood', { id: 'fd_flour' })).toMatchObject({
      name: 'flour', source: 'manual', usual_store: 'costco', source_ref: '168894', kcal_100g: 364,
      servings_json: [{ name: 'cup', g: 125 }], category: 'Baking',
    });
    expect(api.ok('addStarterFoods', { payload: { ids: ['flour-all-purpose'] } }).existing).toHaveLength(1);
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('records its aliases, keeping one that already points at another food', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_mine', name: 'My flour blend' } });
    api.ok('setConfig', { payload: { key: 'ingredient_aliases', value: JSON.stringify({ flour: 'fd_mine' }) } });
    const id = api.ok('addStarterFoods', { payload: { ids: ['flour-all-purpose'] } }).added[0].id;
    const aliases = JSON.parse(api.ok('getConfig').ingredient_aliases);
    expect(aliases).toMatchObject({ flour: 'fd_mine', 'all purpose flour': id, 'plain flour': id });
    // A later import matches the alias without asking.
    const line = api.ok('importRecipe', { payload: { recipe: { name: 'X', servings: 1, lines: ['2 cups all-purpose flour'] } } }).lines[0];
    expect(line).toMatchObject({ food_id: id, match: 'alias' });
  });

  it('refuses an id not on the list, adding nothing', () => {
    const api = loadApi();
    expect(api.call('addStarterFoods', { payload: { ids: ['garlic', 'unobtainium'] } }).error).toBe(
      '"unobtainium" is not on the starter list',
    );
    expect(api.rows('Foods')).toEqual([]);
  });
});

describe("the import's chooser gets starter suggestions", () => {
  it('flour and sugar are offered starter foods, never sugar-apples, and no line is matched to one', () => {
    const api = loadApi();
    const lines = api.ok('importRecipe', {
      payload: { recipe: { name: 'X', servings: 1, lines: ['2 cups flour', '1 cup sugar'] } },
    }).lines;
    expect(lines.map((l: { food_id: string }) => l.food_id)).toEqual(['', '']);
    expect(lines[0].suggestions[0]).toEqual({ starter_id: 'flour-all-purpose', name: 'Flour, all-purpose' });
    expect(lines[1].suggestions[0]).toEqual({ starter_id: 'sugar-granulated', name: 'Sugar, granulated' });
    for (const l of lines) {
      expect(l.suggestions.length).toBeLessThanOrEqual(3);
      expect(JSON.stringify(l.suggestions)).not.toMatch(/apple/i);
    }
  });

  it('a starter food already in the library is not offered again from the list', () => {
    const api = loadApi();
    api.ok('addStarterFoods', { payload: { ids: ['sugar-granulated'] } });
    const line = api.ok('importRecipe', { payload: { recipe: { name: 'X', servings: 1, lines: ['1 cup sugar'] } } }).lines[0];
    expect(line.match).toBe('alias');
    expect(line.suggestions).toEqual([]);
  });
});

describe('a batch of foods under one call_id is undone as one call', () => {
  it('three upsertFood requests with one call_id are removed by one undoCall', () => {
    const api = loadApi();
    for (const name of ['Oats', 'Rye', 'Spelt']) api.ok('upsertFood', { payload: { name, call_id: 'batch-1' } });
    expect(api.rows('Foods')).toHaveLength(3);
    expect(api.ok('undoCall', { payload: { call_id: 'batch-1', confirm: true } })).toMatchObject({ count: 3 });
    expect(api.rows('Foods')).toEqual([]);
  });
});
