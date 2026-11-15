// #916: the Foods tab: the ranking, the usual counting, the cook filter, the stored metric and the hash's `by`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { ForageApi } from '../api/client';
import type { Cook, Food, FoodLogEntry, RecipeSummary } from '../api/types';
import { _resetEaten } from '../eaten/eaten-store';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { parseTrendsHash, trendsRoute } from '../shell/routes';
import { fakeApi } from '../test-api';
import { amountText, rankCooked, rankFoods, rankUsuals } from './foods';
import { FoodsTab, itemLabel } from './foods-tab';
import { foodsLog, loadFoodsLog, resetFoods } from './foods-store';
import { _resetTrends, FOOD_METRIC_KEY } from './trends-store';

// Monday 2 November 2026, 10:00 on the device.
const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

async function openAt(url: string) {
  window.history.replaceState(null, '', url);
  render(<App />);
  await settle();
}

let seq = 0;
function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: `e${++seq}`,
    date: TODAY,
    slot: 'Lunch',
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: null,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    partial: false,
    source: 'app',
    logged_at: '2026-11-02T15:00:00Z',
    created: 'x',
    updated: 'x',
    ...over,
  };
}

const food = (id: string, name: string, brand = ''): Food => ({ id, name, brand, kind: 'ingredient' }) as Food;
const recipe = (id: string, name: string): RecipeSummary => ({ id, name }) as RecipeSummary;
const cook = (id: string, recipe_id: string, name: string, date: string, rating: number | null, created = ''): Cook =>
  ({ id, recipe_id, recipe_name: name, date, rating, note: '', plan_id: '', created }) as Cook;

const foods = new Map([
  ['fd_yog', food('fd_yog', 'Greek yogurt', 'Fage')],
  ['fd_oat', food('fd_oat', 'Oats')],
]);
const recipes = new Map([['rc_chili', recipe('rc_chili', 'Chili')]]);

describe('rankFoods', () => {
  it('ranks a recipe as itself and one food in two units as one item, with shares of all items', () => {
    const r = rankFoods(
      [
        entry({ food_id: 'fd_yog', unit: 'g', sodium_mg: 300 }),
        entry({ food_id: 'fd_yog', unit: 'cup', sodium_mg: 300 }),
        entry({ recipe_id: 'rc_chili', unit: 'serving', sodium_mg: 400 }),
        entry({ food_id: 'fd_oat', sodium_mg: 0 }),
        entry({ food_id: 'fd_gone', sodium_mg: 100 }),
        entry({ recipe_id: 'rc_gone', sodium_mg: 100 }),
      ],
      'sodium',
      foods,
      recipes,
    );
    expect(r.items.map((i) => [i.name, i.amount, i.times, i.shareText])).toEqual([
      ['Fage Greek yogurt', 600, 2, '50%'],
      ['Chili', 400, 1, '33%'],
      ['Removed food', 100, 1, '8%'],
      ['Removed recipe', 100, 1, '8%'],
    ]);
    expect(r.items[0].meter).toBe(100);
    expect(r.entries).toBe(6);
  });

  it('counts a blank as nothing, a real zero as an unlisted item, and says how many are blank', () => {
    const r = rankFoods(
      [
        entry({ food_id: 'fd_yog', protein_g: 10 }),
        entry({ food_id: 'fd_yog', protein_g: null }),
        entry({ food_id: 'fd_oat', protein_g: null }),
        entry({ food_id: 'fd_oat', protein_g: 0 }),
      ],
      'protein',
      foods,
      recipes,
    );
    expect(r.items.map((i) => [i.name, i.times, i.shareText])).toEqual([['Fage Greek yogurt', 2, '100%']]);
    expect(r.blank).toBe(2);
    expect(r.entries).toBe(4);
    expect(r.reported).toBe(true);
    const none = rankFoods([entry({ food_id: 'fd_oat' })], 'protein', foods, recipes);
    expect(none.reported).toBe(false);
    expect(none.items).toEqual([]);
  });

  it('shows <1% for a real value that rounds to 0, takes the top 7, and breaks ties by times then name', () => {
    const many = Array.from({ length: 9 }, (_, i) => entry({ food_id: `f${i}`, kcal: 10 }));
    many.push(entry({ food_id: 'f3', kcal: 0 }), entry({ food_id: 'big', kcal: 100000 }));
    const r = rankFoods(many, 'kcal', new Map(), new Map());
    expect(r.items).toHaveLength(7);
    expect(r.items[0].name).toBe('Removed food');
    expect(r.items.at(-1)!.shareText).toBe('<1%');
    const t = rankFoods(
      [
        entry({ food_id: 'fd_oat', kcal: 50 }),
        entry({ food_id: 'fd_yog', kcal: 25 }),
        entry({ food_id: 'fd_yog', kcal: 25 }),
      ],
      'kcal',
      foods,
      recipes,
    );
    expect(t.items.map((i) => i.name)).toEqual(['Fage Greek yogurt', 'Oats']);
  });

  it('writes amounts and a one-sentence name with the figures in words', () => {
    expect(amountText('sodium', 1240)).toBe('1,240 mg');
    expect(amountText('kcal', 1240)).toBe('1,240 kcal');
    expect(amountText('protein', 85.4)).toBe('85 g');
    expect(amountText('added_sugars', 8.52)).toBe('8.5 g');
    expect(amountText('added_sugars', 12.4)).toBe('12 g');
    const [item] = rankFoods(
      Array.from({ length: 14 }, () => entry({ food_id: 'fd_yog', sodium_mg: 88.57 })),
      'sodium',
      foods,
      recipes,
    ).items;
    expect(itemLabel(item, 'sodium')).toBe('Fage Greek yogurt, 100% of sodium, 1,240 milligrams, logged 14 times');
  });
});

describe('rankUsuals', () => {
  const line = (over: Partial<FoodLogEntry>) =>
    entry({ usual_id: 'us_a', group_id: 'gr_1', group_name: 'Weekday oats', ...over });

  it('counts a usual once per group, names it by its latest group and picks the most common meal', () => {
    const r = rankUsuals([
      line({ food_id: 'a', date: '2026-10-20', slot: 'Breakfast' }),
      line({ food_id: 'b', date: '2026-10-20', slot: 'Breakfast' }),
      line({ food_id: 'a', date: '2026-10-21', group_id: 'gr_2', slot: 'Snacks', group_name: 'Oats' }),
      line({ food_id: 'a', date: '2026-10-22', group_id: 'gr_3', slot: 'Breakfast', group_name: 'Morning oats' }),
      entry({ food_id: 'z', date: '2026-10-22' }),
      line({ usual_id: 'us_b', group_id: 'gr_9', group_name: 'Dinner bowl', slot: 'Dinner' }),
    ]);
    expect(r.map((u) => [u.id, u.name, u.count, u.slot])).toEqual([
      ['us_a', 'Morning oats', 3, 'Breakfast'],
      ['us_b', 'Dinner bowl', 1, 'Dinner'],
    ]);
    expect(r[1].meter).toBeCloseTo(33.3, 0);
  });

  it('sends a tie in meals to the most recent group and leaves out entries whose usual was deleted', () => {
    const r = rankUsuals([
      line({ date: '2026-10-20', slot: 'Lunch' }),
      line({ date: '2026-10-25', group_id: 'gr_2', slot: 'Dinner' }),
      // A deleted usual has its `usual_id` cleared: the entries are ordinary.
      entry({ group_id: 'gr_7', group_name: 'Gone', usual_id: '' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].slot).toBe('Dinner');
  });
});

describe('rankCooked', () => {
  const cooks = [
    cook('1', 'rc_a', 'Fajitas', '2026-10-01', 5),
    cook('2', 'rc_a', 'Fajitas', '2026-10-28', null),
    cook('3', 'rc_a', 'Fajitas', '2026-11-02', null),
    cook('4', 'rc_b', 'Chili', '2026-10-30', 3),
    cook('5', 'rc_b', 'Chili', '2026-10-30', null),
    cook('6', 'rc_c', 'Soup', '2026-09-01', 4),
    cook('7', 'rc_d', 'Bread', '2026-11-01', null),
    cook('8', 'rc_d', 'Bread', '2026-11-01', null),
  ];

  it('counts cooks in the range today included, ties by the most recent then name, never a zero rating', () => {
    const r = rankCooked(cooks, '2026-10-10', TODAY);
    expect(r.map((c) => [c.name, c.count, c.rating])).toEqual([
      ['Fajitas', 2, 5],
      ['Bread', 2, null],
      ['Chili', 2, 3],
    ]);
    expect(rankCooked([cook('x', 'rc_z', 'Zero', TODAY, 0)], '2026-10-10', TODAY)[0].rating).toBeNull();
  });

  it('takes the latest non-blank rating across all cooks, in or out of the range', () => {
    const r = rankCooked(
      [
        cook('1', 'rc_a', 'A', '2026-05-01', 2),
        cook('2', 'rc_a', 'A', '2026-06-01', 4),
        cook('3', 'rc_a', 'A', TODAY, null),
      ],
      '2026-10-10',
      TODAY,
    );
    expect(r).toEqual([{ recipeId: 'rc_a', name: 'A', count: 1, rating: 4 }]);
  });
});

describe('the route', () => {
  it('reads by on the Foods tab only', () => {
    expect(parseTrendsHash('#/eaten/trends?tab=foods&by=sodium')).toEqual({
      range: null,
      tab: 'foods',
      metric: null,
      by: 'sodium',
    });
    expect(parseTrendsHash('#/eaten/trends?tab=foods&by=bogus')).toEqual({ range: null, tab: 'foods', metric: null });
    expect(parseTrendsHash('#/eaten/trends?tab=meals&by=sodium')).toEqual({ range: null, tab: 'meals', metric: null });
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
  _resetTrends();
  resetFoods();
  trendsRoute.value = null;
  seq = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function seed(api: ReturnType<typeof fakeApi>) {
  const usual = { usual_id: 'us_a', group_name: 'Oat bowl', slot: 'Breakfast' as const };
  api.foods.push(food('fd_yog', 'Greek yogurt', 'Fage'), food('fd_oat', 'Oats'));
  api.recipes.push(recipe('rc_chili', 'Chili'));
  api.log.push(
    entry({ food_id: 'fd_yog', date: '2026-10-30', sodium_mg: 600, kcal: 100, group_id: 'gr_1', ...usual }),
    entry({ food_id: 'fd_oat', date: '2026-10-30', sodium_mg: null, kcal: 300, group_id: 'gr_1', ...usual }),
    entry({ food_id: 'fd_yog', date: TODAY, sodium_mg: 400, kcal: 100, group_id: 'gr_2', ...usual }),
    entry({ recipe_id: 'rc_chili', date: TODAY, sodium_mg: 1000, kcal: 500, unit: 'serving' }),
  );
  api.cooks.push(
    cook('c1', 'rc_chili', 'Chili', '2026-10-01', 4, 'a'),
    cook('c2', 'rc_chili', 'Chili', '2026-11-01', null, 'b'),
    cook('c3', 'rc_chili', 'Chili', TODAY, null, 'c'),
    cook('c4', 'rc_old', 'Old stew', '2026-01-01', 2, 'd'),
  );
}

const q = (id: string) => screen.getByTestId(id);

describe('the Foods tab', () => {
  it('is the fifth tab, opens by ?tab=foods, disables Average with its note, and reads the range', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=foods');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Energy',
      'Macros',
      'Nutrients',
      'Meals',
      'Foods',
    ]);
    expect(screen.getByRole('tab', { name: 'Foods' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('radio', { name: '7d' }).hasAttribute('disabled')).toBe(true);
    expect(q('weekly-note').textContent).toBe('No average on this tab');
    expect(window.location.hash).toBe('#/eaten/trends?tab=foods&range=1M&by=kcal');
    expect(api.calls('getFoodLogTotals')).toHaveLength(0);
    const first = api.calls('getFoodLog');
    expect(first).toHaveLength(1);
    expect(first[0].params.get('to')).toBe(TODAY);
    fireEvent.click(screen.getByRole('radio', { name: '1W' }));
    await settle();
    expect(api.calls('getFoodLog')).toHaveLength(2);
    expect(api.calls('getFoodLog')[1].params.get('from')).toBe('2026-10-27');
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    await settle();
    expect(api.calls('getFoodLog')[2].params.get('from')).toBe('2000-01-01');
    expect(screen.getAllByTestId('cooked-row').map((r) => within(r).getByTestId('cooked-name').textContent)).toEqual([
      'Chili',
      'Old stew',
    ]);
  });

  it('ranks by Calories to start, rebuilds on a new metric without a request, and remembers it', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=foods');
    const names = () => screen.getAllByTestId('food-name').map((n) => n.textContent);
    expect(names()).toEqual(['Chili', 'Oats', 'Fage Greek yogurt']);
    expect(screen.getAllByTestId('food-amount')[0].textContent).toBe('500 kcal · 1×');
    const reads = api.calls('getFoodLog').length;
    fireEvent.click(screen.getByRole('radio', { name: 'Sodium' }));
    await settle();
    expect(api.calls('getFoodLog')).toHaveLength(reads);
    expect(names()).toEqual(['Chili', 'Fage Greek yogurt'].reverse());
    const row = screen.getAllByTestId('food-row')[0];
    expect(row.getAttribute('aria-label')).toBe('Fage Greek yogurt, 50% of sodium, 1,000 milligrams, logged 2 times');
    expect(within(row).getByTestId('food-share').textContent).toBe('50%');
    expect(q('foods-note').textContent).toBe(
      'Shares are of what entries reported. 1 of 4 entries have no sodium value and are left out.',
    );
    expect(localStorage.getItem(FOOD_METRIC_KEY)).toBe('sodium');
    expect(window.location.hash).toBe('#/eaten/trends?tab=foods&range=1M&by=sodium');
    cleanup();
    _resetTrends();
    resetFoods();
    window.history.replaceState(null, '', '/#/eaten/trends?tab=foods');
    render(<App />);
    await settle();
    expect(screen.getByRole('radio', { name: 'Sodium' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens on the metric a link names without storing it, and says when no entry reports it', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=foods&by=added_sugars');
    expect(screen.getByRole('radio', { name: 'Added sugars' }).getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(FOOD_METRIC_KEY)).toBeNull();
    expect(q('foods-none-metric').textContent).toBe('None of the entries in this range report added sugars.');
    fireEvent.click(screen.getByRole('radio', { name: 'Calories' }));
    await settle();
    expect(q('foods-note').textContent).toBe(
      'Share of all the calories logged in the range. A logged recipe ranks as itself.',
    );
  });

  it('lists the usuals by times added and the recipes by cooks, as sentences, not buttons', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=foods');
    const usual = q('usual-row');
    expect(usual.getAttribute('aria-label')).toBe('Oat bowl, added 2 times, usually for Breakfast');
    expect(within(usual).getByTestId('usual-count').textContent).toBe('2×');
    expect(within(usual).getByTestId('usual-slot').textContent).toBe('usually Breakfast');
    const cooked = q('cooked-row');
    expect(cooked.getAttribute('aria-label')).toBe('Chili, cooked 2 times, rated 4 of 5');
    expect(within(cooked).getByTestId('cooked-rating').textContent).toContain('4 of 5');
    expect(q('foods-drives').querySelectorAll('li button, li a')).toHaveLength(0);
    expect(q('foods-cooked').querySelectorAll('li button, li a')).toHaveLength(0);
  });

  it('shows each empty state', async () => {
    fakeApi();
    await openAt('/#/eaten/trends?tab=foods');
    expect(q('foods-none').textContent).toBe('Nothing logged in this range.');
    expect(q('usuals-none').textContent).toBe('No usuals added in this range.');
    expect(q('cooked-none').textContent).toBe('Nothing cooked in this range.');
  });

  it('fails the cooks alone, and the log cards together, each with its own Try again', async () => {
    const api = fakeApi();
    seed(api);
    api.answer('getCooks', () => ({ success: false, error: 'boom' }));
    await openAt('/#/eaten/trends?tab=foods');
    expect(q('cooked-error').textContent).toContain("Couldn't load your cooks.");
    expect(screen.getAllByTestId('food-row').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('foods-error')).toBeNull();
    api.answer('getCooks', () => ({ success: true, data: api.cooks }));
    fireEvent.click(within(q('cooked-error')).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByTestId('cooked-error')).toBeNull();
    expect(screen.getAllByTestId('cooked-row').length).toBeGreaterThan(0);

    api.answer('getFoodLog', () => ({ success: false, error: 'boom' }));
    fireEvent.click(screen.getByRole('radio', { name: '1W' }));
    await settle();
    expect(q('foods-error').textContent).toContain("Couldn't load your log.");
    expect(q('usuals-error').textContent).toContain("Couldn't load your log.");
    expect(screen.queryByTestId('cooked-error')).toBeNull();
    expect(screen.getAllByTestId('cooked-row').length).toBeGreaterThan(0);
  });
});

describe('slow and out-of-order reads', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  it('adds a line after 3 seconds of loading, and never lets an older answer replace a newer one', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    const logs = [deferred<FoodLogEntry[]>(), deferred<FoodLogEntry[]>()];
    let n = 0;
    const api = {
      getFoodLog: () => logs[Math.min(n++, 1)].promise,
      getFoods: async () => [],
      getRecipes: async () => [],
      getCooks: async () => [],
    } as unknown as ForageApi;
    render(<FoodsTab api={api} range="1M" />);
    await act(async () => {});
    expect(screen.queryByTestId('foods-slow')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.getAllByTestId('foods-slow')[0].textContent).toBe('Reading a long range can take a moment.');
  });

  it('keeps the newest answer when an older one lands last', async () => {
    const first = deferred<FoodLogEntry[]>();
    const second = deferred<FoodLogEntry[]>();
    const answers = [first, second];
    let n = 0;
    const api = {
      getFoodLog: () => answers[n++].promise,
      getFoods: async () => [],
      getRecipes: async () => [],
    } as unknown as ForageApi;
    const older = loadFoodsLog(api, '1M', true);
    const newer = loadFoodsLog(api, '1W', true);
    second.resolve([entry({ food_id: 'new', kcal: 5 })]);
    await newer;
    first.resolve([entry({ food_id: 'old', kcal: 5 })]);
    await older;
    expect(foodsLog.value.range).toBe('1W');
    expect(foodsLog.value.entries.map((e) => e.food_id)).toEqual(['new']);
  });
});
