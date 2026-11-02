// #755: the seven values beyond the core four — saturated and trans fat,
// cholesterol, sodium, fiber, sugars and added sugars — on foods, in recipe
// nutrition, in the food log's snapshot and daily totals, from Open Food Facts
// and from the starter list. The columns and ensureSchema are in schema.test.ts.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api, type CellValue, type FetchReply } from './apps-script-sandbox';
import { STEW_FOODS, STEW_RECIPE } from './fixtures/beef-stew';

const PER_100 = [
  'satfat_100g', 'transfat_100g', 'cholesterol_mg_100g', 'sodium_mg_100g', 'fiber_100g', 'sugars_100g',
  'added_sugars_100g',
];
const SEVEN = ['satfat_g', 'transfat_g', 'cholesterol_mg', 'sodium_mg', 'fiber_g', 'sugars_g', 'added_sugars_g'];
const sevenAre = (v: number | null) => Object.fromEntries(SEVEN.map((k) => [k, v]));

const CORE = { kcal_100g: 350, protein_100g: 12, carbs_100g: 60, fat_100g: 8 };
const DAY = '2026-11-03';

const food = (api: Api, payload: Record<string, unknown>) => api.ok('upsertFood', { payload });

describe('upsertFood: the seven', () => {
  it('stores any subset, each blank or at least 0, and reads them back as numbers or null', () => {
    const api = loadApi();
    food(api, { id: 'oats', name: 'Oats', ...CORE, satfat_100g: 1.5, sodium_mg_100g: 6, fiber_100g: 10.1, sugars_100g: 0 });
    const oats = api.ok('getFood', { id: 'oats' });
    expect(oats).toMatchObject({
      satfat_100g: 1.5, transfat_100g: null, cholesterol_mg_100g: null, sodium_mg_100g: 6, fiber_100g: 10.1,
      sugars_100g: 0, added_sugars_100g: null,
    });
    // Text is a number too, and blank clears one.
    food(api, { id: 'oats', transfat_100g: '0.1', fiber_100g: '' });
    expect(api.ok('getFood', { id: 'oats' })).toMatchObject({ transfat_100g: 0.1, fiber_100g: null, satfat_100g: 1.5 });
  });

  it('a food saved without them reads back with all seven null and still has nutrition', () => {
    const api = loadApi();
    food(api, { id: 'rice', name: 'Rice', ...CORE });
    const rice = api.ok('getFood', { id: 'rice' });
    for (const f of PER_100) expect(rice[f], f).toBeNull();
    expect(api.sandbox.hasNutrition(rice)).toBe(true);
    // Blank is stored blank, never 0.
    const row = api.rows('Foods')[0];
    expect(row.slice(26)).toEqual(['', '', '', '', '', '', '']);
  });

  const refusals: [string, Record<string, unknown>, RegExp][] = [
    ['any of the seven on a food whose core four are blank', { sodium_mg_100g: 5, fiber_100g: 1 }, /sodium_mg_100g, fiber_100g can be set only on a food with kcal_100g/],
    ['a negative value', { ...CORE, sugars_100g: -1 }, /sugars_100g must be at least 0/],
    ['saturated + trans greater than fat', { ...CORE, satfat_100g: 6, transfat_100g: 2.5 }, /saturated and trans fat add up to more than fat/],
    ['saturated alone greater than fat', { ...CORE, satfat_100g: 9 }, /saturated and trans fat add up to more than fat/],
    ['fiber greater than carbs', { ...CORE, fiber_100g: 61 }, /fiber is more than carbs \(fiber_100g > carbs_100g\)/],
    ['sugars greater than carbs', { ...CORE, sugars_100g: 60.5 }, /sugars are more than carbs \(sugars_100g > carbs_100g\)/],
    ['added sugars greater than sugars', { ...CORE, sugars_100g: 5, added_sugars_100g: 6 }, /added sugars are more than sugars/],
    ['cholesterol over 100,000 mg per 100 g', { ...CORE, cholesterol_mg_100g: 100001 }, /cholesterol_mg_100g must be at most 100000/],
    ['sodium over 100,000 mg per 100 g', { ...CORE, sodium_mg_100g: 100001 }, /sodium_mg_100g must be at most 100000/],
    ['a value that is not a number', { ...CORE, fiber_100g: 'lots' }, /fiber_100g must be a number/],
  ];
  for (const [what, values, message] of refusals) {
    it(`refuses ${what}, saving nothing and naming the fields`, () => {
      const api = loadApi();
      const res = api.call('upsertFood', { payload: { id: 'x', name: 'X', ...values } });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(message);
      expect(api.rows('Foods')).toEqual([]);
    });
  }

  it('accepts each limit exactly, and sums of fat that round in floating point', () => {
    const api = loadApi();
    food(api, {
      id: 'x', name: 'X', kcal_100g: 100, protein_100g: 0, carbs_100g: 10, fat_100g: 1.3,
      satfat_100g: 1.1, transfat_100g: 0.2, fiber_100g: 10, sugars_100g: 10, added_sugars_100g: 10,
      cholesterol_mg_100g: 100000, sodium_mg_100g: 100000,
    });
    expect(api.ok('getFood', { id: 'x' }).sodium_mg_100g).toBe(100000);
  });

  it('checks containment only when both sides are set: trans fat alone, or added sugars without sugars', () => {
    const api = loadApi();
    food(api, { id: 'x', name: 'X', ...CORE, transfat_100g: 0.5, added_sugars_100g: 4 });
    expect(api.ok('getFood', { id: 'x' })).toMatchObject({ transfat_100g: 0.5, added_sugars_100g: 4, sugars_100g: null });
  });

  it('refuses clearing the core four while any of the seven is set', () => {
    const api = loadApi();
    food(api, { id: 'x', name: 'X', ...CORE, fiber_100g: 3 });
    const res = api.call('upsertFood', {
      payload: { id: 'x', kcal_100g: '', protein_100g: '', carbs_100g: '', fat_100g: '' },
    });
    expect(res.error).toMatch(/fiber_100g can be set only on a food with/);
    expect(api.ok('getFood', { id: 'x' }).kcal_100g).toBe(350);
  });

  it('editing a food\'s seven does not change any existing log entry', () => {
    const api = loadApi();
    food(api, { id: 'oats', name: 'Oats', ...CORE, fiber_100g: 10, servings_json: [{ name: 'cup', g: 80 }] });
    const entry = api.ok('logFood', { payload: { date: DAY, slot: 'Breakfast', food_id: 'oats', qty: 1, unit: 'cup' } });
    expect(entry.fiber_g).toBe(8);
    const totals = api.ok('getFoodLogTotals', { from: DAY, to: DAY });
    food(api, { id: 'oats', fiber_100g: 2, sodium_mg_100g: 400, sugars_100g: 1 });
    expect(api.ok('getFoodLog', { from: DAY, to: DAY })[0]).toEqual(entry);
    expect(api.ok('getFoodLogTotals', { from: DAY, to: DAY })).toEqual(totals);
  });
});

describe('recipe nutrition: the seven', () => {
  /** The stew's nutrition, from getRecipe, with its foods as given. */
  function stew(foods: Record<string, unknown>[]) {
    const api = loadApi();
    for (const f of foods) api.ok('upsertFood', { payload: f });
    api.ok('upsertRecipe', { payload: STEW_RECIPE });
    return api.ok('getRecipe', { id: STEW_RECIPE.id }).nutrition;
  }

  it('for foods with none of them: everything else is as it was, the seven null, and each unknown count is the counted lines', () => {
    const plain = stew(STEW_FOODS);
    // The same foods with every one of the seven set: only the seven may differ.
    const rich = stew(
      STEW_FOODS.map((f: Record<string, unknown>) =>
        typeof f.kcal_100g === 'number'
          ? { ...f, satfat_100g: 0, transfat_100g: 0, cholesterol_mg_100g: 1, sodium_mg_100g: 1, fiber_100g: 0, sugars_100g: 0, added_sugars_100g: 0 }
          : f,
      ),
    );
    const core = (n: any) => ({
      kcal: n.per_serving.kcal, protein_g: n.per_serving.protein_g, carbs_g: n.per_serving.carbs_g,
      fat_g: n.per_serving.fat_g, missing: n.missing, partial: n.partial, by_line: n.by_line,
    });
    expect(core(plain)).toEqual(core(rich));
    expect(plain.per_serving).toMatchObject(sevenAre(null));
    const counted = plain.by_line.filter((l: { kcal: number | null }) => l.kcal !== null).length;
    expect(counted).toBeGreaterThan(0);
    expect(plain.per_serving_unknown).toEqual(sevenAre(counted));
    expect(rich.per_serving_unknown).toEqual(sevenAre(0));
  });

  it('a 2-serving recipe, one line with sodium and one without: sodium_mg 200 a serving, 1 unknown, partial unchanged', () => {
    const api = loadApi();
    food(api, { id: 'salty', name: 'Salty', ...CORE, sodium_mg_100g: 400 });
    food(api, { id: 'plain', name: 'Plain', ...CORE });
    const n = api.ok('computeNutrition', {
      payload: {
        servings: 2,
        lines: [
          { text: '100 g salty', qty: 100, unit: 'g', food_id: 'salty' },
          { text: '50 g plain', qty: 50, unit: 'g', food_id: 'plain' },
        ],
      },
    });
    expect(n.per_serving.sodium_mg).toBe(200);
    expect(n.per_serving_unknown.sodium_mg).toBe(1);
    expect(n.per_serving_unknown.fiber_g).toBe(2);
    expect(n.per_serving.fiber_g).toBeNull();
    expect(n.partial).toBe(false);
    expect(n.missing).toEqual([]);
  });

  it('an optional line, and a no_food, no_nutrition or no_weight line, adds to neither the seven nor the unknown counts', () => {
    const api = loadApi();
    food(api, { id: 'salty', name: 'Salty', ...CORE, sodium_mg_100g: 400, servings_json: [{ name: 'cup', g: 100 }] });
    food(api, { id: 'bare', name: 'Bare' });
    const n = api.ok('computeNutrition', {
      payload: {
        servings: 1,
        lines: [
          { text: '100 g salty', qty: 100, unit: 'g', food_id: 'salty' },
          { text: '100 g salty, optional', qty: 100, unit: 'g', food_id: 'salty', optional: true },
          { text: 'a mystery', qty: 1 },
          { text: '10 g bare', qty: 10, unit: 'g', food_id: 'bare' },
          { text: '2 handfuls salty', qty: 2, unit: 'handful', food_id: 'salty' },
        ],
      },
    });
    expect(n.missing.map((m: { reason: string }) => m.reason)).toEqual(['no_food', 'no_nutrition', 'no_weight']);
    expect(n.per_serving.sodium_mg).toBe(400);
    expect(n.per_serving_unknown).toEqual({ ...sevenAre(1), sodium_mg: 0 });
  });

  it('a recipe with no counted line has the seven null and unknown counts of 0', () => {
    const api = loadApi();
    const n = api.ok('computeNutrition', { payload: { servings: 2, lines: [{ text: 'salt to taste' }] } });
    expect(n.per_serving).toMatchObject(sevenAre(null));
    expect(n.per_serving_unknown).toEqual(sevenAre(0));
  });

  it('getRecipe and the import preview carry per_serving_unknown', () => {
    const api = loadApi();
    food(api, { id: 'salty', name: 'Salty', ...CORE, sodium_mg_100g: 400 });
    api.ok('upsertRecipe', { payload: { id: 'r', name: 'R', servings: 2, lines: [{ text: '100 g salty', qty: 100, unit: 'g', food_id: 'salty' }] } });
    expect(api.ok('getRecipe', { id: 'r' }).nutrition).toMatchObject({
      per_serving: { sodium_mg: 200 },
      per_serving_unknown: { ...sevenAre(1), sodium_mg: 0 },
    });
    expect(api.ok('getRecipes')[0].nutrition.per_serving_unknown).toEqual({ ...sevenAre(1), sodium_mg: 0 });
  });
});

describe('the food log: the seven', () => {
  it('150 g of a food with fiber 4 per 100 g stores fiber_g 6, and a value the food lacks blank, never 0', () => {
    const api = loadApi();
    food(api, { id: 'oats', name: 'Oats', ...CORE, fiber_100g: 4, sodium_mg_100g: 3 });
    const payload = { date: DAY, slot: 'Breakfast', food_id: 'oats', qty: 150, unit: 'g' };
    const dry = api.ok('logFood', { payload: { ...payload, dry_run: true } });
    expect(api.rows('FoodLog')).toEqual([]);
    const entry = api.ok('logFood', { payload });
    expect(entry).toMatchObject({ fiber_g: 6, sodium_mg: 4.5, satfat_g: null, sugars_g: null, added_sugars_g: null });
    for (const k of SEVEN) expect(dry[k], k).toEqual(entry[k]);
    // The sheet holds the blank as blank.
    const row = api.rows('FoodLog')[0];
    expect(row.slice(17)).toEqual(['', '', '', '4.5', '6', '', '']);
  });

  it('a food with no nutrition logs the seven blank', () => {
    const api = loadApi();
    food(api, { id: 'x', name: 'Mystery' });
    expect(api.ok('logFood', { payload: { date: DAY, slot: 'Snacks', food_id: 'x', qty: 30, unit: 'g' } })).toMatchObject(sevenAre(null));
  });

  it('1.5 servings of a recipe store each of the seven as 1.5 times its per serving, blank where that is null', () => {
    const api = loadApi();
    food(api, { id: 'salty', name: 'Salty', ...CORE, sodium_mg_100g: 400, satfat_100g: 2 });
    api.ok('upsertRecipe', { payload: { id: 'r', name: 'R', servings: 2, lines: [{ text: '100 g salty', qty: 100, unit: 'g', food_id: 'salty' }] } });
    const per = api.ok('getRecipe', { id: 'r' }).nutrition.per_serving;
    expect(per).toMatchObject({ sodium_mg: 200, satfat_g: 1 });
    const entry = api.ok('logFood', { payload: { date: DAY, slot: 'Dinner', recipe_id: 'r', qty: 1.5 } });
    expect(entry).toMatchObject({ sodium_mg: 300, satfat_g: 1.5, fiber_g: null, transfat_g: null, added_sugars_g: null });
    expect(api.ok('logFood', { payload: { date: DAY, slot: 'Dinner', recipe_id: 'r', qty: 1.5, dry_run: true } })).toMatchObject({ sodium_mg: 300 });
  });

  it('moving an entry to another meal keeps its seven; changing the amount recomputes them', () => {
    const api = loadApi();
    food(api, { id: 'oats', name: 'Oats', ...CORE, fiber_100g: 4 });
    const entry = api.ok('logFood', { payload: { date: DAY, slot: 'Breakfast', food_id: 'oats', qty: 100, unit: 'g' } });
    food(api, { id: 'oats', fiber_100g: 8 });
    expect(api.ok('updateLogEntry', { payload: { id: entry.id, changes: { slot: 'Lunch' } } }).fiber_g).toBe(4);
    expect(api.ok('updateLogEntry', { payload: { id: entry.id, changes: { qty: 50 } } }).fiber_g).toBe(4);
  });

  it('an entry written before this issue reads back with the seven null', () => {
    const api = loadApi();
    food(api, { id: 'oats', name: 'Oats', ...CORE });
    api.ok('logFood', { payload: { date: DAY, slot: 'Breakfast', food_id: 'oats', qty: 100, unit: 'g' } });
    // As #712 wrote it: 17 cells, nothing after updated.
    const sheet = api.ss.getSheetByName('FoodLog')!;
    sheet.rows[1] = sheet.rows[1].slice(0, 17);
    const [read] = api.ok('getFoodLog', { from: DAY, to: DAY });
    expect(read).toMatchObject({ kcal: 350, ...sevenAre(null) });
  });

  it('getFoodLogTotals sums each over the entries that have it, null when none does, and counts the rest as unknown', () => {
    const api = loadApi();
    food(api, { id: 'oats', name: 'Oats', ...CORE, fiber_100g: 4, sodium_mg_100g: 3.33 });
    food(api, { id: 'beans', name: 'Beans', ...CORE, fiber_100g: 7 });
    food(api, { id: 'x', name: 'Mystery' });
    const log = (food_id: string, qty: number) =>
      api.ok('logFood', { payload: { date: DAY, slot: 'Dinner', food_id, qty, unit: 'g' } });
    log('oats', 150);
    log('beans', 100);
    log('x', 20);
    const before = { ...api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0] };
    const day = api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0];
    expect(day).toMatchObject({
      entries: 3, unknown_entries: 1, partial: true,
      fiber_g: 13, sodium_mg: 5, satfat_g: null, sugars_g: null,
      unknown: { fiber_g: 0, sodium_mg: 1, satfat_g: 2, transfat_g: 2, cholesterol_mg: 2, sugars_g: 2, added_sugars_g: 2 },
    });
    expect(day).toEqual(before);
    expect(api.ok('getFoodLogTotals', { from: '2026-11-04', to: '2026-11-04' }).days).toEqual([]);
  });

  it('the totals\' existing fields are the same whether or not the foods have the seven', () => {
    const totalsFor = (extra: Record<string, unknown>) => {
      const api = loadApi();
      food(api, { id: 'oats', name: 'Oats', ...CORE, ...extra, servings_json: [{ name: 'cup', g: 80 }] });
      food(api, { id: 'x', name: 'Mystery' });
      api.ok('logFood', { payload: { date: DAY, slot: 'Breakfast', food_id: 'oats', qty: 1, unit: 'cup' } });
      api.ok('logFood', { payload: { date: DAY, slot: 'Lunch', food_id: 'oats', qty: 33, unit: 'g' } });
      api.ok('logFood', { payload: { date: DAY, slot: 'Snacks', food_id: 'x', qty: 5, unit: 'g' } });
      const day = api.ok('getFoodLogTotals', { from: DAY, to: DAY }).days[0];
      const { date, entries, unknown_entries, kcal, protein_g, carbs_g, fat_g, partial } = day;
      return { date, entries, unknown_entries, kcal, protein_g, carbs_g, fat_g, partial };
    };
    expect(totalsFor({})).toEqual(totalsFor({ satfat_100g: 2, fiber_100g: 9, sugars_100g: 1, sodium_mg_100g: 5 }));
  });
});

// ---------------------------------------------------------------- Open Food Facts

const CODE = '0123456789012';
const product = (nutriments: Record<string, unknown>): FetchReply => ({
  status: 200,
  body: JSON.stringify({
    code: CODE,
    status: 1,
    product: { code: CODE, product_name: 'Crunch Bar', brands: 'Acme', nutriments },
  }),
});
const CORE_OFF = { 'energy-kcal_100g': 450, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 20 };

describe('lookupBarcode: the seven', () => {
  it('maps each Open Food Facts field, cholesterol and sodium from g to mg, rounded as the core four are', () => {
    const api = loadApi({
      pages: () =>
        product({
          ...CORE_OFF,
          'saturated-fat_100g': 7.123,
          'trans-fat_100g': 0.1,
          cholesterol_100g: 0.0153,
          sodium_100g: 0.64,
          fiber_100g: '3.456',
          sugars_100g: 30.001,
          'added-sugars_100g': 25,
        }),
    });
    const { food: f, reason } = api.ok('lookupBarcode', { code: CODE });
    expect(reason).toBe('');
    expect(f).toMatchObject({
      satfat_100g: 7.12, transfat_100g: 0.1, cholesterol_mg_100g: 15.3, sodium_mg_100g: 640, fiber_100g: 3.46,
      sugars_100g: 30, added_sugars_100g: 25,
    });
    // It saves as is.
    api.ok('upsertFood', { payload: f });
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('a product missing one of them leaves only that one blank', () => {
    const api = loadApi({ pages: () => product({ ...CORE_OFF, 'saturated-fat_100g': 7, sodium_100g: 0.5, sugars_100g: 30 }) });
    expect(api.ok('lookupBarcode', { code: CODE }).food).toMatchObject({
      satfat_100g: 7, transfat_100g: null, cholesterol_mg_100g: null, sodium_mg_100g: 500, fiber_100g: null,
      sugars_100g: 30, added_sugars_100g: null,
    });
  });

  it('a product missing any of the core four is no_nutrition with none of the seven', () => {
    const api = loadApi({
      pages: () => product({ 'energy-kcal_100g': 450, proteins_100g: 10, fat_100g: 20, sodium_100g: 0.5, fiber_100g: 3 }),
    });
    const d = api.ok('lookupBarcode', { code: CODE });
    expect(d.reason).toBe('no_nutrition');
    for (const f of PER_100) expect(d.food[f], f).toBeNull();
  });
});

// ---------------------------------------------------------------- the starter list

describe('the starter list: the seven', () => {
  const { sandbox } = loadApi();
  const starters = sandbox.STARTER_FOODS as Record<string, any>[];

  it('every starter food has the six SR Legacy values as a number or null, and no added sugars', () => {
    for (const s of starters) {
      for (const f of PER_100.filter((f) => f !== 'added_sugars_100g')) {
        expect(s[f] === null || (typeof s[f] === 'number' && s[f] >= 0), `${s.id} ${f}`).toBe(true);
      }
      expect(s.added_sugars_100g, s.id).toBeUndefined();
    }
    // SR Legacy has these for flour, and sodium for salt.
    const flour = starters.find((s) => s.id === 'flour-all-purpose')!;
    expect(typeof flour.fiber_100g).toBe('number');
    expect(typeof flour.sugars_100g).toBe('number');
    expect(starters.find((s) => s.id === 'salt')!.sodium_mg_100g).toBeGreaterThan(30000);
  });

  it('every starter food passes upsertFood as it is', () => {
    const api = loadApi();
    for (const s of starters) {
      const row: Record<string, unknown> = { id: s.id, name: s.name, kcal_100g: s.kcal_100g, protein_100g: s.protein_100g, carbs_100g: s.carbs_100g, fat_100g: s.fat_100g };
      for (const f of PER_100) if (s[f] !== undefined) row[f] = s[f];
      const res = api.call('upsertFood', { payload: row });
      expect(res.error, s.id).toBeUndefined();
    }
  });

  it('addStarterFoods stores them, with added sugars blank, when adding and when filling a name-only food', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_flour', name: 'flour' } });
    const res = api.ok('addStarterFoods', { payload: { ids: ['flour-all-purpose', 'salt'] } });
    expect(res.filled.map((f: { id: string }) => f.id)).toEqual(['fd_flour']);
    const flourStarter = starters.find((s) => s.id === 'flour-all-purpose')!;
    const saltStarter = starters.find((s) => s.id === 'salt')!;
    const flour = api.ok('getFood', { id: 'fd_flour' });
    const salt = api.ok('getFood', { id: res.added[0].id });
    for (const f of PER_100.filter((f) => f !== 'added_sugars_100g')) {
      expect(flour[f], `flour ${f}`).toBe(flourStarter[f]);
      expect(salt[f], `salt ${f}`).toBe(saltStarter[f]);
    }
    expect(flour.added_sugars_100g).toBeNull();
    expect(salt.added_sugars_100g).toBeNull();
  });
});

// ---------------------------------------------------------------- undo across the migration

describe('undo of a call logged before the seven columns existed', () => {
  it('a Foods or FoodLog row logged without them still undoes, and the seven stay blank', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'oats', name: 'Oats', ...CORE, call_id: 'old-food' } });
    api.ok('logFood', { payload: { date: DAY, slot: 'Breakfast', food_id: 'oats', qty: 10, unit: 'g', call_id: 'old-log' } });
    api.ok('upsertFood', { payload: { id: 'oats', name: 'Rolled oats', call_id: 'old-rename' } });
    // As #713 logged them: whole rows with no key for any of the seven.
    const sheet = api.ss.getSheetByName('MCPChangeLog')!;
    const drop = (text: CellValue): CellValue => {
      if (typeof text !== 'string' || text === '') return text;
      const obj = JSON.parse(text);
      for (const k of [...PER_100, ...SEVEN]) delete obj[k];
      return JSON.stringify(obj);
    };
    for (const row of sheet.rows.slice(1)) {
      row[5] = drop(row[5]);
      row[6] = drop(row[6]);
    }
    expect(String(sheet.rows[1][6])).not.toContain('satfat');

    const res = api.call('undoCall', { payload: { call_id: 'old-rename', confirm: true } });
    expect(res.error).toBeUndefined();
    expect(api.ok('getFood', { id: 'oats' })).toMatchObject({ name: 'Oats', satfat_100g: null, fiber_100g: null });
    expect(api.call('undoCall', { payload: { call_id: 'old-log', confirm: true } }).error).toBeUndefined();
    expect(api.rows('FoodLog')).toEqual([]);
  });

  it('a row that did change since is still refused', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'oats', name: 'Oats', ...CORE, call_id: 'c1' } });
    api.ok('upsertFood', { payload: { id: 'oats', fiber_100g: 3 } });
    expect(api.call('undoCall', { payload: { call_id: 'c1', confirm: true } }).error).toMatch(/changed since call c1/);
  });
});
