// #703 AC4: a write of "=1+1", "2026-03-04" or "0042" into any text column
// reads back as that exact text. One test per tab, through the row layer every
// action writes with, and through the actions for the columns callers set.

import { describe, expect, it } from 'vitest';
import { SheetFormula, loadApi } from './apps-script-sandbox';

const TRICKY = ['=1+1', '2026-03-04', '0042'];

describe('AC4: every text column stores exactly what was written', () => {
  const probe = loadApi();
  const tabs: string[] = probe.sandbox.TAB_ORDER;

  for (const tab of tabs) {
    it(`${tab}: each text column round-trips each tricky value`, () => {
      for (const value of TRICKY) {
        const api = loadApi();
        const spec = api.sandbox.TABS[tab];
        const textFields: string[] = spec.fields.filter((f: string) => !spec.kinds[f]);
        const record: Record<string, string> = {};
        for (const f of textFields) record[f] = value;
        api.sandbox.upsertRecord(tab, record);

        const stored = api.rows(tab)[0];
        for (const f of textFields) {
          const cellValue = stored[spec.fields.indexOf(f)];
          expect(cellValue, `${tab}.${f} stored`).not.toBeInstanceOf(SheetFormula);
          expect(cellValue, `${tab}.${f} stored`).toBe(value);
        }
        const key: Record<string, string | undefined> = {};
        for (const k of spec.key) key[k] = record[k];
        const read = api.sandbox.getRecord(tab, key);
        for (const f of textFields) expect(read[f], `${tab}.${f} read`).toBe(value);
      }
    });
  }

  it('an update in place escapes too, not only an append', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'f1', name: 'first' } });
    api.ok('upsertFood', { payload: { id: 'f1', name: '=1+1', brand: '0042' } });
    expect(api.rows('Foods')[0].slice(0, 4)).toEqual(['f1', '=1+1', 'ingredient', '0042']);
  });

  it('a bulk append escapes too: recipe lines and steps', () => {
    const api = loadApi();
    api.ok('upsertRecipe', {
      payload: {
        id: 'r1',
        name: '0042',
        servings: 1,
        lines: [{ text: '=1+1', section: '2026-03-04' }],
        steps: [{ name: '0042', text: '=SUM(A1)' }],
      },
    });
    const recipe = api.ok('getRecipe', { id: 'r1' });
    expect(recipe.name).toBe('0042');
    expect(recipe.lines[0]).toMatchObject({ text: '=1+1', section: '2026-03-04' });
    expect(recipe.steps[0]).toMatchObject({ name: '0042', text: '=SUM(A1)' });
  });

  it('notes and dates through the actions read back exactly', () => {
    const api = loadApi();
    api.ok('upsertRecipe', { payload: { id: 'r1', name: 'Soup', servings: 1 } });
    const meal = api.ok('upsertPlanEntry', { payload: { date: '2026-03-04', slot: 'Lunch', note: '=1+1' } });
    expect(api.ok('getPlan', {})[0]).toMatchObject({ id: meal.id, date: '2026-03-04', note: '=1+1' });
    const cook = api.ok('upsertCook', { payload: { recipe_id: 'r1', date: '2026-03-04', note: '0042' } });
    expect(api.ok('getCooks', {})[0]).toMatchObject({ id: cook.id, date: '2026-03-04', note: '0042' });
  });
});
