// #930: logMeal, a whole meal (foods, a recipe, groups from usuals) in one write.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const CLIENT_ID = 'forage-1234.apps.googleusercontent.com';
const THRIVE_ID = 'thrive-5678.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';
const D = '2026-11-01';

function seed(api: Api) {
  const food = (id: string, name: string, servings: { name: string; g: number }[]) =>
    api.ok('upsertFood', {
      payload: { id, name, servings_json: servings, kcal_100g: 380, protein_100g: 10, carbs_100g: 50, fat_100g: 5 },
    });
  food('fd_oats', 'Oats', [{ name: 'cup', g: 80 }]);
  food('fd_pb', 'Peanut butter', [{ name: 'tbsp', g: 16 }]);
  food('fd_milk', 'Milk', [{ name: 'cup', g: 240 }]);
  food('fd_corn', 'Corn flakes', [{ name: 'cup', g: 28 }]);
  food('fd_bran', 'Bran flakes', [{ name: 'cup', g: 40 }]);
  api.ok('upsertRecipe', {
    payload: { id: 'stew', name: 'Stew', servings: 2, lines: [{ text: '200 g oats', qty: 200, unit: 'g', food_id: 'fd_oats' }] },
  });
  return api.ok('upsertUsual', {
    payload: {
      name: 'Cereal',
      slot: 'Breakfast',
      lines: [
        { food_id: 'fd_milk', qty: 1, unit: 'cup' },
        {
          options: [
            { food_id: 'fd_corn', qty: 1, unit: 'cup' },
            { food_id: 'fd_bran', qty: 1, unit: 'cup' },
          ],
        },
      ],
    },
  });
}

const loaded = () => {
  const api = loadApi();
  const usual = seed(api);
  return { api, usual };
};
const base = { date: D, slot: 'Breakfast' };
const cupOats = { food_id: 'fd_oats', qty: 1, unit: 'cup' };

describe('logMeal', () => {
  it('writes a food, a recipe and a three-item group in order, one group id (AC 1, 2)', () => {
    const { api } = loaded();
    const g = { key: 'k', name: 'Toast' };
    const res = api.ok('logMeal', {
      payload: {
        ...base,
        items: [
          cupOats,
          { recipe_id: 'stew', qty: 1, unit: 'serving' },
          { food_id: 'fd_pb', qty: 2, unit: 'tbsp', group: g },
          { food_id: 'fd_milk', qty: 1, unit: 'cup', group: g },
          { food_id: 'fd_corn', qty: 1, unit: 'cup', group: g },
        ],
      },
    });
    expect(res.entries).toHaveLength(5);
    expect(api.rows('FoodLog')).toHaveLength(5);
    expect(res.entries.map((e: any) => e.food_id || e.recipe_id)).toEqual(['fd_oats', 'stew', 'fd_pb', 'fd_milk', 'fd_corn']);
    const gid = res.group_ids.k;
    expect(gid).toMatch(/^gr_[0-9a-f]{8}$/);
    expect(res.entries.map((e: any) => e.group_id)).toEqual(['', '', gid, gid, gid]);
    expect(res.entries.map((e: any) => e.group_name)).toEqual(['', '', 'Toast', 'Toast', 'Toast']);
    // the snapshot is what logFood stores
    const one = api.ok('logFood', { payload: { ...base, ...cupOats, dry_run: true } });
    const rec = api.ok('logFood', { payload: { ...base, recipe_id: 'stew', qty: 1, unit: 'serving', dry_run: true } });
    for (const f of ['grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'partial']) {
      expect(res.entries[0][f]).toEqual(one[f]);
      expect(res.entries[1][f]).toEqual(rec[f]);
    }
    expect(res.entries[1].unit).toBe('serving');
  });

  it('stores usual links and sets last_pick only to an option (AC 3)', () => {
    const { api, usual } = loaded();
    const g = (line: string) => ({ key: 'u', name: 'Cereal', usual_id: usual.id, usual_line_id: line });
    const res = api.ok('logMeal', {
      payload: {
        ...base,
        items: [
          { food_id: 'fd_milk', qty: 2, unit: 'cup', group: g('L1') },
          { food_id: 'fd_bran', qty: 1.5, unit: 'cup', group: g('L2') },
        ],
      },
    });
    expect(res.entries.map((e: any) => [e.usual_id, e.usual_line_id])).toEqual([
      [usual.id, 'L1'],
      [usual.id, 'L2'],
    ]);
    const lines = () => api.ok('getUsual', { id: usual.id }).lines;
    expect(lines()[1].last_pick).toBe('fd_bran');
    expect(lines()[0].last_pick).toBe('');
    // a food that is not an option leaves last_pick alone
    api.ok('logMeal', { payload: { ...base, items: [{ food_id: 'fd_oats', qty: 1, unit: 'cup', group: g('L2') }] } });
    expect(lines()[1].last_pick).toBe('fd_bran');
  });

  it('refuses any bad item, writes nothing and names the position (AC 4)', () => {
    const { api, usual } = loaded();
    const ok = { ...cupOats };
    const grp = { key: 'k', name: 'G' };
    const cases: [any[], RegExp][] = [
      [[ok, ok, { food_id: 'fd_nope', qty: 1, unit: 'cup' }], /^items\[3\]/],
      [[ok, { food_id: 'fd_oats', qty: 1, unit: 'bucket' }], /^items\[2\]/],
      [[ok, { recipe_id: 'stew', qty: 1, unit: 'serving', group: grp }], /^items\[2\].*recipe/],
      [[ok, { ...ok, group: { key: 'u', name: 'G', usual_id: usual.id, usual_line_id: 'L9' } }], /^items\[2\].*L9/],
      [[{ ...ok, group: { key: 'k', name: 'x'.repeat(121) } }], /^items\[1\]/],
      [[], /1 to 30/],
      [Array(31).fill(ok), /1 to 30/],
    ];
    for (const [items, msg] of cases) {
      const res = api.call('logMeal', { payload: { ...base, items } });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(msg);
    }
    expect(api.rows('FoodLog')).toHaveLength(0);
    expect(api.ok('logMeal', { payload: { ...base, items: Array(30).fill(ok) } }).entries).toHaveLength(30);
  });

  it('is idempotent on the ids sent (AC 5)', () => {
    const { api } = loaded();
    const payload = {
      ...base,
      items: [
        { id: 'lg_a', ...cupOats },
        { id: 'lg_b', food_id: 'fd_pb', qty: 1, unit: 'tbsp', group: { key: 'k', name: 'T' } },
        { id: 'lg_c', food_id: 'fd_milk', qty: 1, unit: 'cup', group: { key: 'k', name: 'T' } },
      ],
    };
    const first = api.ok('logMeal', { payload });
    const second = api.ok('logMeal', { payload });
    expect(api.rows('FoodLog')).toHaveLength(3);
    expect(second.entries).toEqual(first.entries);
    expect(second.group_ids).toEqual(first.group_ids);
    const twice = { ...base, items: [{ id: 'lg_z', ...cupOats }, { id: 'lg_z', ...cupOats }] };
    expect(api.call('logMeal', { payload: twice }).success).toBe(false);
  });

  it('dry_run answers the entries and writes nothing (AC 6)', () => {
    const { api, usual } = loaded();
    const group = { key: 'u', name: 'C', usual_id: usual.id, usual_line_id: 'L2' };
    const res = api.ok('logMeal', {
      payload: { ...base, dry_run: true, items: [{ food_id: 'fd_bran', qty: 1, unit: 'cup', group }] },
    });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ food_id: 'fd_bran', group_id: res.group_ids.u });
    expect(api.rows('FoodLog')).toHaveLength(0);
    expect(api.ok('getUsual', { id: usual.id }).lines[1].last_pick).toBe('');
    expect(api.rows('MCPChangeLog').filter((r) => r[2] === 'logMeal')).toHaveLength(0);
  });

  it("the app token may call it and Thrive's may not (AC 7)", () => {
    const info = (aud: string) => () => ({
      status: 200,
      body: JSON.stringify({ aud, azp: aud, email: EMAIL, email_verified: 'true', expires_in: '3599' }),
    });
    const properties = { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: EMAIL, TOKEN_THRIVE_CLIENT_ID: THRIVE_ID };
    const post = (a: Api) => a.post({ action: 'logMeal', access_token: 'ya29.x', payload: { ...base, items: [cupOats] } });
    const app = loadApi({ properties, tokeninfo: info(CLIENT_ID) });
    seed(app);
    expect(post(app).success).toBe(true);
    expect(app.rows('MCPChangeLog').filter((r) => r[2] === 'logMeal')).toHaveLength(0);
    const thrive = loadApi({ properties, tokeninfo: info(THRIVE_ID) });
    seed(thrive);
    expect(post(thrive).success).toBe(false);
    expect(thrive.rows('FoodLog')).toHaveLength(0);
  });

  it('is logged for the key and undoCall removes its entries and restores last_pick (AC 8)', () => {
    const { api, usual } = loaded();
    api.ok('logMeal', { payload: { ...base, items: [{ food_id: 'fd_corn', qty: 1, unit: 'cup' }], call_id: 'plain-1' } });
    expect(api.rows('FoodLog')).toHaveLength(1);
    const group = { key: 'u', name: 'C', usual_id: usual.id, usual_line_id: 'L2' };
    api.ok('logMeal', {
      payload: { ...base, items: [cupOats, { food_id: 'fd_bran', qty: 1, unit: 'cup', group }], call_id: 'meal-1' },
    });
    expect(api.rows('FoodLog')).toHaveLength(3);
    expect(api.ok('getUsual', { id: usual.id }).lines[1].last_pick).toBe('fd_bran');
    api.ok('undoCall', { payload: { call_id: 'meal-1', confirm: true } });
    expect(api.rows('FoodLog')).toHaveLength(1);
    expect(api.ok('getUsual', { id: usual.id }).lines[1].last_pick).toBe('');
  });
});
