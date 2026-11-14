// #865: the client sends `by_meal` only when asked, and the demo API answers `meals` only when asked.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveApi } from './client';
import { createDemoApi } from '../demo/demo-api';

describe('getFoodLogTotals by_meal (#865)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sent = async (...args: [boolean?]) => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ success: true, data: { from: 'a', to: 'b', days: [] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await createLiveApi('tok', 'https://example.test/exec').getFoodLogTotals('2026-11-03', '2026-11-03', ...args);
    const calls = fetchMock.mock.calls as unknown as [string, { body: URLSearchParams }][];
    return calls[0][1].body;
  };

  it('sends by_meal only when asked', async () => {
    expect((await sent()).has('by_meal')).toBe(false);
    expect((await sent(false)).has('by_meal')).toBe(false);
    expect((await sent(true)).get('by_meal')).toBe('true');
  });

  it('the demo answers meals only when asked, in meal order', async () => {
    const api = createDemoApi();
    const today = '2026-01-02';
    const [food] = (await api.getFoods()).filter((f) => f.kcal_100g !== null);
    await api.logEntry({ date: today, slot: 'Snacks', food_id: food.id, qty: 10, unit: 'g' });
    await api.logEntry({ date: today, slot: 'Lunch', food_id: food.id, qty: 20, unit: 'g' });
    const plain = await api.getFoodLogTotals(today, today);
    expect(plain.days.every((d) => d.meals === undefined)).toBe(true);
    const withMeals = await api.getFoodLogTotals(today, today, true);
    expect(withMeals.days.length).toBeGreaterThan(0);
    for (const day of withMeals.days) {
      expect(day.meals!.map((m) => m.slot)).toEqual(['Lunch', 'Snacks']);
      expect(day.meals?.length).toBeGreaterThan(0);
      expect(day.meals!.reduce((n, m) => n + m.entries, 0)).toBe(day.entries);
    }
  });
});
