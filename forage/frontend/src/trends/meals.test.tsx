// #915: the Meals tab: the meal-day maths, the stack and its gaps, the readout and its links, the tab row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { FoodLogDay, FoodLogEntry, FoodLogMeal } from '../api/types';
import { _resetEaten } from '../eaten/eaten-store';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { trendsHash, trendsRoute } from '../shell/routes';
import { fakeApi } from '../test-api';
import { buildMealDays, buildMealWeeks, slotOrder, typicalDay } from './meals';
import { rowLabel, splitLabel } from './meals-tab';
import { _resetTrends } from './trends-store';

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

async function go(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
}

let seq = 0;
function entry(date: string, slot: string, kcal: number | null, over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: `e${++seq}`,
    date,
    slot: slot as FoodLogEntry['slot'],
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: null,
    kcal,
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

/**
 * Three counted days. Breakfast 400 and 200 (avg 300), Lunch 600 and 500 (avg 550), Dinner 800 and 900 (one low, avg 850;
 * a third dinner has no nutrition), After dinner 300 once, Brunch (a renamed slot) 100 once, Snacks never. Today: 250.
 */
function seed(api: ReturnType<typeof fakeApi>) {
  api.log.push(
    entry('2026-10-30', 'Breakfast', 400),
    entry('2026-10-30', 'Lunch', 600),
    entry('2026-10-30', 'Dinner', 800),
    entry('2026-10-31', 'Lunch', 500),
    entry('2026-10-31', 'Dinner', 900, { partial: true }),
    entry('2026-10-31', 'After dinner', 300),
    entry('2026-11-01', 'Breakfast', 200),
    entry('2026-11-01', 'Brunch', 100),
    entry('2026-11-01', 'Dinner', null),
    entry(TODAY, 'Breakfast', 250),
  );
}

const q = (id: string) => screen.getByTestId(id);
const rowText = (slot: string) => within(q(`meals-row-${slot}`));

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
  _resetTrends();
  trendsRoute.value = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

const meal = (slot: string, kcal: number | null, partial = false): FoodLogMeal =>
  ({ slot, kcal, partial, entries: 1, unknown_entries: kcal === null ? 1 : 0 }) as unknown as FoodLogMeal;
const dayOf = (date: string, meals: FoodLogMeal[], over: Partial<FoodLogDay> = {}): FoodLogDay =>
  ({
    date,
    entries: meals.length,
    unknown_entries: 0,
    kcal: meals.reduce((t, m) => t + (m.kcal ?? 0), 0) || null,
    partial: false,
    meals,
    ...over,
  }) as unknown as FoodLogDay;
const mapOf = (...days: FoodLogDay[]) => new Map(days.map((d) => [d.date, d]));

describe('the meal-day maths', () => {
  const by = mapOf(
    dayOf('2026-10-30', [meal('Breakfast', 400), meal('Lunch', 600), meal('Dinner', 800)]),
    dayOf('2026-10-31', [meal('Lunch', 500), meal('Dinner', 900, true), meal('After dinner', 300)]),
    dayOf('2026-11-01', [meal('Breakfast', 200), meal('Brunch', 100), meal('Dinner', null)]),
    dayOf(TODAY, [meal('Breakfast', 9999)]),
  );

  it('averages on the days eaten, shares adding to 100, and leaves today out', () => {
    const t = typicalDay(by, '2026-10-30', TODAY);
    expect(t.counted).toBe(3);
    expect(t.slots.map((s) => s.slot)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'After dinner', 'Snacks', 'Brunch']);
    expect(t.slots.map((s) => [s.days, s.average])).toEqual([
      [2, 300],
      [2, 550],
      [2, 850],
      [1, 300],
      [0, null],
      [1, 100],
    ]);
    expect(t.slots.map((s) => s.pct)).toEqual([16, 29, 45, 8, 0, 2]);
    expect(t.slots.reduce((n, s) => n + s.pct, 0)).toBe(100);
    expect(t.low).toBe(1);
  });

  it('shows <1% for a real value that rounds to 0, and never counts a no-calorie meal as a meal-day', () => {
    const small = mapOf(dayOf('2026-10-30', [meal('Breakfast', 2000), meal('Snacks', 1)]));
    const t = typicalDay(small, '2026-10-30', TODAY);
    expect(t.slots.find((s) => s.slot === 'Snacks')).toMatchObject({ days: 1, shareText: '<1%', pct: 0 });
    expect(typicalDay(by, '2026-10-30', TODAY).slots.find((s) => s.slot === 'Dinner')!.days).toBe(2);
  });

  it('has no counted day when nothing has calories', () => {
    const t = typicalDay(mapOf(dayOf('2026-10-30', [meal('Dinner', null)], { kcal: null })), '2026-10-30', TODAY);
    expect(t.counted).toBe(0);
    expect(t.slots.every((s) => s.days === 0)).toBe(true);
    expect(splitLabel(t.slots, t.counted)).toBe('Calories by meal: none');
  });

  it('words a row as one sentence, and a never-eaten slot as 0 days, not 0 kcal', () => {
    const t = typicalDay(by, '2026-10-30', TODAY);
    expect(rowLabel(t.slots[3], 3)).toBe('After dinner, 300 kcal on 1 of 3 days, 8% of all calories');
    expect(rowLabel(t.slots[4], 3)).toBe('Snacks, not eaten, 0 of 3 days, 0% of all calories');
  });

  it('stacks a day in slot order, gaps a day without calories, and averages a week over its counted days', () => {
    const order = slotOrder(by, '2026-10-30', TODAY);
    const days = buildMealDays(by, '2026-10-29', TODAY, TODAY, order);
    expect(days[0]).toMatchObject({ date: '2026-10-29', logged: false, total: null });
    expect(days[2].meals.map((m) => m.slot)).toEqual(['Lunch', 'Dinner', 'After dinner']);
    expect(days[2].total).toBe(1700);
    expect(days[3].total).toBe(300);
    expect(days[3].meals.map((m) => m.slot)).toEqual(['Breakfast', 'Dinner', 'Brunch']);
    const week = buildMealWeeks(days, by, order)[0];
    // Oct 29 to Nov 1 sits in the week of Oct 26: four counted days, three with calories.
    expect(week.date).toBe('2026-10-26');
    expect(week.logged).toBe(3);
    expect(week.perSlot.find((s) => s.slot === 'Breakfast')!.kcal).toBe(200);
    expect(week.perSlot.find((s) => s.slot === 'Snacks')!.kcal).toBeNull();
    expect(week.perSlot.find((s) => s.slot === 'Dinner')!.partial).toBe(true);
    const sum = week.perSlot.reduce((t, s) => t + (s.kcal ?? 0), 0);
    expect(week.total).toBeCloseTo(sum, 6);
  });
});

describe('the Meals tab', () => {
  it('adds a fourth tab (Foods the fifth), opens by ?tab=meals, keeps the range, and makes one by_meal call for all tabs', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Energy',
      'Macros',
      'Nutrients',
      'Meals',
      'Foods',
    ]);
    fireEvent.click(screen.getByRole('radio', { name: '3M' }));
    await settle();
    const reads = api.calls('getFoodLogTotals');
    expect(reads.every((r) => r.params.get('by_meal') === 'true')).toBe(true);
    await go(trendsHash('meals', '3M'));
    expect(screen.getByRole('tab', { name: 'Meals' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('radio', { name: '3M' }).getAttribute('aria-checked')).toBe('true');
    expect(api.calls('getFoodLogTotals')).toHaveLength(reads.length);
    expect(window.location.hash).toBe('#/eaten/trends?tab=meals&range=3M');
  });

  it('shows a typical day: a row per slot in order, days, average, share, and the low note', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=meals');
    const rows = screen.getAllByTestId(/^meals-row-/).map((r) => r.getAttribute('data-testid'));
    expect(rows).toEqual(
      ['Breakfast', 'Lunch', 'Dinner', 'After dinner', 'Snacks', 'Brunch'].map((s) => `meals-row-${s}`),
    );
    expect(rowText('After dinner').getByTestId('meals-days').textContent).toBe('1 of 3 days');
    expect(rowText('After dinner').getByTestId('meals-kcal').textContent).toBe('300 kcal');
    expect(rowText('After dinner').getByTestId('meals-share').textContent).toBe('8% of all');
    expect(q('meals-row-Dinner').getAttribute('aria-label')).toBe(
      'Dinner, 850 kcal on 2 of 3 days, 45% of all calories',
    );
    expect(rowText('Snacks').getByTestId('meals-days').textContent).toBe('0 of 3 days');
    expect(rowText('Snacks').getByTestId('meals-kcal').textContent).toBe('—');
    expect(rowText('Snacks').getByTestId('meals-share').textContent).toBe('0% of all');
    expect(q('meals-bar').getAttribute('aria-label')).toBe(
      'Calories by meal: Breakfast 16%, Lunch 29%, Dinner 45%, After dinner 8%, Brunch 2%',
    );
    expect(screen.queryByTestId('meals-seg-Snacks')).toBeNull();
    expect(q('meals-seg-Brunch').className).toContain('slot-other');
    expect(q('meals-low-note').textContent).toBe('Includes 1 meal with low totals (some items have no nutrition).');
    expect(q('meals-typical').textContent).toContain('kcal is the average on the days that meal was eaten.');
  });

  it('with no counted day shows an empty bar, dashes and the sentence', async () => {
    const api = fakeApi();
    api.log.push(entry(TODAY, 'Lunch', 500));
    await openAt('/#/eaten/trends?tab=meals');
    expect(q('meals-none').textContent).toBe('No days logged in this range.');
    expect(screen.getByTestId('meals-bar-empty')).toBeDefined();
    for (const k of screen.getAllByTestId('meals-kcal')) expect(k.textContent).toBe('—');
    expect(screen.queryAllByTestId('meals-share')).toHaveLength(0);
    expect(screen.queryAllByTestId('meals-days')).toHaveLength(0);
  });

  it('stacks each day in slot order with hairlines, hatches a low meal, and draws a gap for an empty day', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=meals');
    const card = within(q('meals-each'));
    const bars = card.getAllByTestId('chart-bar');
    const oct31 = bars.find((b) => b.getAttribute('data-key') === '2026-10-31')!;
    const segs = within(oct31 as unknown as HTMLElement).getAllByTestId('chart-seg');
    expect(segs.map((s) => s.getAttribute('class'))).toEqual([
      'chart-seg-slot-lunch chart-seg-line',
      'chart-seg-slot-dinner chart-seg-line',
      'chart-seg-slot-after-dinner chart-seg-line',
    ]);
    expect(segs.map((s) => s.getAttribute('data-hatched'))).toEqual([null, 'true', null]);
    expect(bars.find((b) => b.getAttribute('data-key') === '2026-10-29')!.getAttribute('data-kind')).toBe('gap');
    expect(bars.find((b) => b.getAttribute('data-key') === TODAY)!.getAttribute('data-kind')).toBe('stack');
    // The legend: only the slots drawn, then Not logged and Low. Snacks is never drawn.
    const legend = card.getByTestId('legend').textContent!;
    expect(legend).toContain('Breakfast');
    expect(legend).toContain('Brunch');
    expect(legend).not.toContain('Snacks');
    expect(legend).toContain('Not logged');
    expect(legend).toContain('Low');
  });

  it('has no average line: the control is disabled with its reason', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=meals');
    expect(screen.getByRole('radio', { name: '7d' }).hasAttribute('disabled')).toBe(true);
    expect(q('weekly-note').textContent).toBe('No average line on this chart');
    expect(screen.queryByTestId('chart-line')).toBeNull();
  });

  it('reads each meal for a selected day, with Low, no nutrition, and a link to the day in Eaten', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?tab=meals');
    const chart = within(q('meals-each')).getByTestId('chart');
    const readout = () => within(q('meals-each')).getByTestId('readout');
    expect(readout().textContent).toBe('Tap a day to read it.');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // today
    expect(readout().textContent).toContain('Today · Breakfast 250 kcal so far');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // Sun, Nov 1
    expect(readout().textContent).toContain('Sun, Nov 1 · Breakfast 200 · Dinner no nutrition · Brunch 100 kcal');
    const link = within(readout()).getByTestId('readout-link');
    expect(link.textContent).toBe('Open day ›');
    expect(link.getAttribute('href')).toBe('#/eaten/2026-11-01');
    expect(link.getAttribute('aria-label')).toBe('Open day, Sunday, November 1');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // Sat, Oct 31
    expect(readout().textContent).toContain('Sat, Oct 31 · Lunch 500 · Dinner 900 Low · After dinner 300 kcal');
    expect(within(readout()).getByText('Low').className).toContain('low-chip');
    expect(q('meals-status').textContent).toBe('Saturday, October 31: Lunch 500, Dinner 900 Low, After dinner 300');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // Fri, Oct 30
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // Thu, Oct 29: nothing logged
    expect(readout().textContent).toContain('Thu, Oct 29 · nothing logged');
    expect(within(readout()).getByTestId('readout-link').textContent).toBe('Log this day ›');
  });

  it('draws weekly stacked bars past 182 days, with no day link', async () => {
    const api = fakeApi();
    seed(api);
    localStorage.setItem('forage-trends-range', 'All');
    api.log.push(entry('2026-03-02', 'Lunch', 700));
    await openAt('/#/eaten/trends?tab=meals');
    const chart = within(q('meals-each')).getByTestId('chart');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // the week of today (Nov 2): nothing counted
    fireEvent.keyDown(chart, { key: 'ArrowLeft' }); // the week of Oct 26
    const text = within(q('meals-each')).getByTestId('readout').textContent!;
    expect(text).toContain('Week of Oct 26 · Breakfast 200 · Lunch 367 · Dinner 567 · After dinner 100 · Brunch 33');
    expect(text).toContain('3 of 7 days logged');
    expect(text).toContain('Use 6M or shorter to open a day');
    expect(within(q('meals-each')).queryByTestId('readout-link')).toBeNull();
  });
});
