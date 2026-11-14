// #880: Foods.short_name, and a log entry that outlives a renamed serving.
// The column and ensureSchema's append are in schema.test.ts.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const NUTTZO = 'NuttZo Organic 7 Nut & Seed Butter POWER FUEL Crunchy';
const put = (api: Api, payload: Record<string, unknown>) => api.call('upsertFood', { payload });

describe('short_name', () => {
  it('is stored, and getFood returns it', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'nz', name: NUTTZO, short_name: 'Crunchy PB' } });
    expect(api.ok('getFood', { id: 'nz' }).short_name).toBe('Crunchy PB');
  });

  it('refuses 21 characters naming the field and the limit, and writes nothing', () => {
    const api = loadApi();
    const out = put(api, { id: 'nz', name: NUTTZO, short_name: 'x'.repeat(21) });
    expect(out.error).toMatch(/short_name must be at most 20 characters/);
    expect(api.rows('Foods')).toEqual([]);
    expect(api.ok('upsertFood', { payload: { id: 'nz', name: NUTTZO, short_name: 'x'.repeat(20) } }).short_name).toHaveLength(20);
  });

  it('is trimmed, and a name of only spaces is stored blank', () => {
    const api = loadApi();
    expect(api.ok('upsertFood', { payload: { id: 'a', name: 'A', short_name: '  Crunchy PB  ' } }).short_name).toBe('Crunchy PB');
    expect(api.ok('upsertFood', { payload: { id: 'b', name: 'B', short_name: '    ' } }).short_name).toBe('');
    expect(api.rows('Foods').find((r) => r[0] === 'b')![33]).toBe('');
  });

  it('is kept when an update does not name it, and cleared by a blank one', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'nz', name: NUTTZO, short_name: 'Crunchy PB' } });
    api.ok('upsertFood', { payload: { id: 'nz', regular: true } });
    expect(api.ok('getFood', { id: 'nz' }).short_name).toBe('Crunchy PB');
    api.ok('upsertFood', { payload: { id: 'nz', short_name: '' } });
    expect(api.ok('getFood', { id: 'nz' }).short_name).toBe('');
  });

  it('getFoods q matches it, even when the name does not contain the text', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'nz', name: NUTTZO, short_name: 'Crunchy PB' } });
    api.ok('upsertFood', { payload: { id: 'ot', name: 'Oats' } });
    expect(api.ok('getFoods', { q: 'crunchy pb' }).map((f: any) => f.id)).toEqual(['nz']);
    expect(api.ok('getFoods', { q: 'oats' }).map((f: any) => f.id)).toEqual(['ot']);
  });
});

describe('short_name through the change log', () => {
  it('a key write that sets it is logged, and undoCall reverts it', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'nz', name: NUTTZO, call_id: 'c-1' } });
    api.ok('upsertFood', { payload: { id: 'nz', short_name: 'Crunchy PB', call_id: 'c-2' } });
    expect(JSON.parse(String(api.rows('MCPChangeLog')[1][6]))).toMatchObject({ short_name: 'Crunchy PB' });
    api.ok('undoCall', { payload: { call_id: 'c-2', confirm: true } });
    expect(api.ok('getFood', { id: 'nz' }).short_name).toBe('');
  });
});

describe('an entry that outlives a renamed serving', () => {
  const NUT = { kcal_100g: 600, protein_100g: 20, carbs_100g: 20, fat_100g: 50 };

  function seed() {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'pb', name: 'Peanut butter', ...NUT, servings_json: [{ name: 'serving', g: 32 }] } });
    const entry = api.ok('logFood', { payload: { date: '2026-11-03', slot: 'Lunch', food_id: 'pb', qty: 1, unit: 'serving' } });
    expect(entry.grams).toBe(32);
    api.ok('upsertFood', { payload: { id: 'pb', servings_json: [{ name: '2 tbsp', g: 32 }] } });
    return { api, id: entry.id as string };
  }

  it('can be edited to a new qty with its unit unchanged: grams per unit come from the entry', () => {
    const { api, id } = seed();
    const out = api.ok('updateLogEntry', { payload: { id, changes: { qty: 2 } } });
    expect(out).toMatchObject({ unit: 'serving', qty: 2, grams: 64, kcal: 384, protein_g: 12.8, carbs_g: 12.8, fat_g: 32 });
    expect(api.ok('getFoodLog')[0]).toMatchObject({ qty: 2, grams: 64, kcal: 384 });
  });

  it('keeps working when the entry is edited again, and when its slot changes', () => {
    const { api, id } = seed();
    api.ok('updateLogEntry', { payload: { id, changes: { qty: 2 } } });
    expect(api.ok('updateLogEntry', { payload: { id, changes: { qty: 0.5, slot: 'Dinner' } } })).toMatchObject({ grams: 16, slot: 'Dinner' });
  });

  it('is still refused for a unit the food does not have', () => {
    const { api, id } = seed();
    expect(api.call('updateLogEntry', { payload: { id, changes: { unit: 'cup' } } }).error).toMatch(/unit "cup" is not one of this food's servings/);
    expect(api.ok('getFoodLog')[0]).toMatchObject({ unit: 'serving', grams: 32 });
  });

  it('is still refused for a new log entry in the old unit', () => {
    const { api } = seed();
    const out = api.call('logFood', { payload: { date: '2026-11-03', slot: 'Lunch', food_id: 'pb', qty: 1, unit: 'serving' } });
    expect(out.error).toMatch(/unit "serving" is not one of this food's servings/);
  });

  it('does not carry an old unit to a different food', () => {
    const { api, id } = seed();
    api.ok('upsertFood', { payload: { id: 'jam', name: 'Jam', ...NUT } });
    expect(api.call('updateLogEntry', { payload: { id, changes: { food_id: 'jam' } } }).error).toMatch(/unit "serving" is not one of/);
  });
});
