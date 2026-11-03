// #712 in the app: the Eaten day view (the day card from getFoodLogTotals, the meal cards, planned meals), the
// Add sheet, the amount sheet's dry-run preview, editing and deleting, day navigation, demo mode, and the
// stylesheet's 44px and 375px rules. The API's own rules are in apps-script/tests/food-log.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import App from '../App';
import type { Food, FoodLogEntry, PlanEntry, RecipeSummary } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { _resetEaten, unloggedPlan } from './eaten-store';
import { amountLine, dayTitle, fullDate } from './format';

const env = import.meta.env as Record<string, string | undefined>;
// Monday 2 November 2026, 10:00 on the device.
const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function open(demo = false) {
  window.history.replaceState(null, '', `/${demo ? '?demo=true' : ''}#/eaten`);
  render(<App />);
  await settle();
}

function food(id: string, name: string, over: Partial<Food> = {}): Food {
  return {
    id,
    name,
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: null,
    protein_100g: null,
    carbs_100g: null,
    fat_100g: null,
    servings_json: null,
    source: 'manual',
    created: '',
    updated: '',
    ...over,
  };
}

const YOGURT = food('fd_yog', 'Greek yogurt', {
  kind: 'packaged',
  kcal_100g: 61.2,
  protein_100g: 2.45,
  carbs_100g: 3.67,
  fat_100g: 0.16,
  servings_json: [{ name: 'cup', g: 245 }],
});
const BAR = food('fd_bar', 'Nut bar', {
  kind: 'packaged',
  brand: 'Kindly',
  kcal_100g: 475,
  protein_100g: 15,
  carbs_100g: 40,
  fat_100g: 30,
  servings_json: [{ name: 'bar', g: 40 }],
});
const HERBS = food('fd_herbs', 'Herbes de Provence');

function recipe(id: string, name: string, over: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    name,
    source_url: '',
    source_site: '',
    servings: 6,
    total_min: null,
    notes: '',
    created: '2026-10-01T00:00:00Z',
    updated: '',
    nutrition: { per_serving: { kcal: 412, protein_g: 30, carbs_g: 20, fat_g: 18 }, missing: [], partial: false },
    partial: false,
    rating: null,
    last_cooked: null,
    has_walkthrough: false,
    cook_count: 0,
    unrated_cook_id: null,
    ...over,
  };
}

const STEW = recipe('rc_stew', 'Beef Stew');

function planned(over: Partial<PlanEntry>): PlanEntry {
  return {
    id: 'pl_1',
    date: TODAY,
    slot: 'Dinner',
    recipe_id: 'rc_stew',
    note: '',
    trip_id: '',
    created: 'x',
    updated: 'x',
    recipe_name: 'Beef Stew',
    servings: 6,
    kcal_serving: 412,
    partial: false,
    trip_status: '',
    on_trip: false,
    shopped: false,
    ...over,
  };
}

function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Breakfast',
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const kcal = () => screen.getByTestId('day-kcal').textContent;
const card = (slot: string) =>
  screen.getAllByTestId('meal-card').find((c) => c.querySelector('h2')!.textContent === slot)!;
const entriesIn = (slot: string) => within(card(slot)).queryAllByTestId('entry-row');

/** Open the Add sheet for a meal and wait for its lists. */
async function addTo(slot: string) {
  fireEvent.click(within(card(slot)).getByTestId('add-to-meal'));
  await settle();
  return screen.getByTestId('add-sheet');
}

/** Wait for the amount sheet's preview to settle. */
async function previewed() {
  await waitFor(() => expect(within(screen.getByTestId('amount-sheet')).queryByText('Updating…')).toBeNull());
}

describe('the helpers', () => {
  it('names a day and an amount as the design note does', () => {
    expect([dayTitle(TODAY, TODAY), dayTitle('2026-11-01', TODAY), dayTitle('2026-10-30', TODAY)]).toEqual([
      'Today',
      'Yesterday',
      'Fri 30 Oct',
    ]);
    expect(fullDate(TODAY)).toBe('Monday 2 November 2026');
    expect(amountLine(entry({ food_id: 'f', qty: 1, unit: 'bar', grams: 40, kcal: 190 }))).toBe('1 bar · 40 g');
    expect(amountLine(entry({ food_id: 'f', qty: 150, unit: 'g', grams: 150, kcal: 90 }))).toBe('150 g');
    expect(amountLine(entry({ food_id: 'f', qty: 1.5, unit: 'cup', grams: 187.5, kcal: 90 }))).toBe('1.5 cup · 188 g');
    expect(amountLine(entry({ recipe_id: 'r', qty: 2, unit: 'serving', kcal: 800 }))).toBe('2 servings');
    expect(amountLine(entry({ recipe_id: 'r', qty: 1, unit: 'serving', kcal: 400, partial: true }))).toBe(
      '1 serving · partial',
    );
    expect(amountLine(entry({ food_id: 'f', qty: 2, unit: 'g', grams: 2, kcal: null }))).toBe('2 g · No nutrition');
  });

  it('each log entry hides one plan entry with the same recipe and slot', () => {
    const plan = [planned({ id: 'pl_a' }), planned({ id: 'pl_b' }), planned({ id: 'pl_c', slot: 'Lunch' })];
    const logged = [entry({ recipe_id: 'rc_stew', slot: 'Dinner', unit: 'serving' })];
    expect(unloggedPlan(plan, logged).map((p) => p.id)).toEqual(['pl_b', 'pl_c']);
  });
});

describe('the day view', () => {
  it('a day with nothing logged shows — and "Nothing logged", never 0 kcal', async () => {
    const api = fakeApi();
    await open();
    expect(screen.getByTestId('eaten-day').textContent).toBe('Today');
    expect(api.calls('getFoodLogTotals')[0].params.get('from')).toBe(TODAY);
    expect(kcal()).toBe('—');
    expect(screen.getByTestId('day-note').textContent).toBe('Nothing logged today.');
    expect(screen.getByTestId('day-macros').textContent).toBe('Protein —Carbs —Fat —');
    expect(screen.getByTestId('day-card').textContent).not.toMatch(/\b0 kcal/);
    // Four meal cards, each a region with only its Add row.
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))).toEqual([
      'meal-breakfast',
      'meal-lunch',
      'meal-dinner',
      'meal-snacks',
    ]);
    expect(screen.getByRole('group', { name: 'Totals for Monday 2 November 2026' })).toBeDefined();
  });

  it("today's total says so far; another day's does not, and its empty state names the weekday", async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(
      entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 }),
    );
    api.log.push(entry({ id: 'lg_y', date: '2026-11-01', food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9 }));
    await open();
    expect(kcal()).toBe('150');
    expect(screen.getByTestId('day-card').textContent).toContain('kcal so far');
    expect(screen.getByTestId('day-macros').textContent).toBe('Protein 6 gCarbs 9 gFat 0 g');

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(screen.getByTestId('eaten-day').textContent).toBe('Yesterday');
    expect(screen.getByTestId('day-card').textContent).not.toContain('so far');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(screen.getByTestId('eaten-day').textContent).toBe('Sat 31 Oct');
    expect(screen.getByTestId('day-note').textContent).toBe('Nothing logged on Saturday.');
  });

  it('next stops at today; previous works', async () => {
    fakeApi();
    await open();
    const next = screen.getByRole('button', { name: 'Next day' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    await settle();
    expect(screen.getByTestId('eaten-day').textContent).toBe('Today');
    expect(next.disabled).toBe(true);
  });

  it('a day with an entry with no nutrition, or a partial recipe, says it is low in words', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, HERBS);
    api.recipes.push(recipe('rc_p', 'Banana Bread', { partial: true }));
    api.log.push(entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 150, protein_g: 6, carbs_g: 9, fat_g: 0 }));
    api.log.push(entry({ id: 'lg_h', slot: 'Lunch', food_id: 'fd_herbs', qty: 2, grams: 2, partial: true }));
    await open();
    const low = screen.getByTestId('day-low');
    expect(low.textContent).toBe(
      'Low Some entries have no nutrition or are missing ingredients, so this total is low.',
    );
    const herbs = entriesIn('Lunch')[0];
    expect(herbs.textContent).toContain('2 g · No nutrition');
    expect(herbs.textContent).toContain('—');

    // A partial recipe alone is low too.
    api.log.length = 0;
    api.log.push(
      entry({ id: 'lg_p', slot: 'Lunch', recipe_id: 'rc_p', unit: 'serving', kcal: 68, protein_g: 1, partial: true }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    await settle();
    expect(screen.getByTestId('day-low')).toBeDefined();
    expect(entriesIn('Lunch')[0].textContent).toContain('1 serving · partial');
  });

  it('a day whose every entry is unknown shows — and says none has nutrition', async () => {
    const api = fakeApi();
    api.foods.push(HERBS);
    api.log.push(entry({ id: 'lg_h', food_id: 'fd_herbs', qty: 2, grams: 2, partial: true }));
    await open();
    expect(kcal()).toBe('—');
    expect(screen.getByTestId('day-note').textContent).toBe("None of today's entries has nutrition yet.");
  });

  it('a failed load says so with Try again, and the meal cards show nothing', async () => {
    const api = fakeApi();
    api.answer('getFoodLogTotals', () => ({ success: false, error: 'boom' }));
    await open();
    expect(screen.getByTestId('day-error').textContent).toContain("Couldn't load your log.");
    expect(screen.queryAllByTestId('meal-card')).toHaveLength(0);
  });
});

describe('logging', () => {
  it('a food in a named serving: the preview is shown before saving, and what is saved equals it', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    expect(within(sheet).getByRole('heading').textContent).toBe('Add to dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'greek' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    await previewed();
    const amount = screen.getByTestId('amount-sheet');
    expect(within(amount).getByTestId('amount-subline').textContent).toBe('Greek yogurt · 1 cup = 245 g');
    const dry = api.calls('logFood').filter((c) => c.payload.dry_run);
    expect(dry).toHaveLength(1);
    expect(dry[0].payload).toMatchObject({ food_id: 'fd_yog', qty: 1, unit: 'cup', slot: 'Dinner', date: TODAY });
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('150');
    expect(within(amount).getByTestId('amount-macros').textContent).toBe('Protein 6 g · Carbs 9 g · Fat 0.4 g');
    expect(api.log).toHaveLength(0);

    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    const saved = api.calls('logFood').filter((c) => !c.payload.dry_run);
    expect(saved).toHaveLength(1);
    expect(saved[0].payload.id).toBe(dry[0].payload.id);
    expect(saved[0].payload.id).toMatch(/^lg_[0-9a-f]{8}$/);
    expect(api.log[0]).toMatchObject({ kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 });
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    expect(entriesIn('Dinner')[0].textContent).toContain('Greek yogurt');
    expect(entriesIn('Dinner')[0].textContent).toContain('1 cup · 245 g');
    expect(kcal()).toBe('150');
    expect(screen.getByTestId('toast').textContent).toBe('Logged Greek yogurt');
  });

  it('a food in grams: changing the unit resets the amount, the stepper steps by 10, and the day changes', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Breakfast');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'yog' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    const amount = screen.getByTestId('amount-sheet');
    fireEvent.change(within(amount).getByTestId('log-unit'), { target: { value: 'g' } });
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('100');
    fireEvent.click(within(amount).getByRole('button', { name: 'More' }));
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('110');
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '150' } });
    await previewed();
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('92');
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.log[0]).toMatchObject({ qty: 150, unit: 'g', grams: 150, kcal: 91.8 });
    expect(entriesIn('Breakfast')[0].textContent).toContain('150 g');
    expect(kcal()).toBe('92');
  });

  it('a recipe in servings, with partial said in words', async () => {
    const api = fakeApi();
    api.recipes.push(
      recipe('rc_p', 'Banana Bread', {
        partial: true,
        nutrition: { per_serving: { kcal: 68, protein_g: 1, carbs_g: 9, fat_g: 3 }, missing: [], partial: true },
      }),
    );
    await open();
    const sheet = await addTo('Lunch');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'bread' } });
    expect(within(sheet).getAllByTestId('add-result')[0].textContent).toContain(
      'Recipe · about 68 kcal a serving, partial',
    );
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    await previewed();
    const amount = screen.getByTestId('amount-sheet');
    expect(within(amount).getByTestId('amount-subline').textContent).toBe('Serves 6');
    expect(within(amount).queryByTestId('log-unit')).toBeNull();
    expect(amount.textContent).toContain('Some ingredients are left out.');
    fireEvent.click(within(amount).getByRole('button', { name: 'More' }));
    await previewed();
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('102');
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.log[0]).toMatchObject({ recipe_id: 'rc_p', qty: 1.5, unit: 'serving', kcal: 102 });
    expect(entriesIn('Lunch')[0].textContent).toContain('1.5 servings · partial');
  });

  it('an amount of 0 or blank disables Log it with the helper', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'yog' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    const amount = screen.getByTestId('amount-sheet');
    for (const v of ['0', '', '100000']) {
      fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: v } });
      expect((within(amount).getByTestId('log-it') as HTMLButtonElement).disabled).toBe(true);
      expect(amount.textContent).toContain('Enter an amount above 0.');
    }
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '1 1/2' } });
    expect((within(amount).getByTestId('log-it') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failed save keeps the sheet open and says so', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'yog' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    await previewed();
    api.answer('logFood', () => ({ success: false, error: 'food_id "fd_yog" is not a food' }));
    fireEvent.click(screen.getByTestId('log-it'));
    await settle();
    expect(screen.getByTestId('amount-error').textContent).toBe("Couldn't save: this food was deleted.");
    expect(screen.getByTestId('amount-sheet')).toBeDefined();
  });
});

describe('editing and deleting', () => {
  it("edits the amount, unit and meal, then deletes after a confirmation; the day's total follows each", async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(
      entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 }),
    );
    await open();
    fireEvent.click(entriesIn('Breakfast')[0]);
    await settle();
    let amount = screen.getByTestId('amount-sheet');
    // The first preview is the entry itself: no dry run.
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('150');
    expect(api.calls('updateLogEntry')).toHaveLength(0);
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '2' } });
    await previewed();
    expect(api.calls('updateLogEntry')[0].payload).toEqual({
      id: 'lg_1',
      changes: { qty: 2, unit: 'cup' },
      dry_run: true,
    });
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('300');
    expect(amount.textContent).toContain('Recalculated from the food as it is now.');
    fireEvent.click(within(amount).getByRole('button', { name: 'Lunch' }));
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.calls('updateLogEntry').at(-1)!.payload).toEqual({ id: 'lg_1', changes: { slot: 'Lunch', qty: 2 } });
    expect(entriesIn('Breakfast')).toHaveLength(0);
    expect(entriesIn('Lunch')[0].textContent).toContain('2 cup · 490 g');
    expect(kcal()).toBe('300');

    // Only the meal: the stored numbers are kept and no preview is asked for.
    fireEvent.click(entriesIn('Lunch')[0]);
    await settle();
    amount = screen.getByTestId('amount-sheet');
    const before = api.calls('updateLogEntry').length;
    fireEvent.click(within(amount).getByRole('button', { name: 'Snacks' }));
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(
      api
        .calls('updateLogEntry')
        .slice(before)
        .map((c) => c.payload),
    ).toEqual([{ id: 'lg_1', changes: { slot: 'Snacks' } }]);

    // The unit: grams, from its default.
    fireEvent.click(entriesIn('Snacks')[0]);
    await settle();
    amount = screen.getByTestId('amount-sheet');
    fireEvent.change(within(amount).getByTestId('log-unit'), { target: { value: 'g' } });
    await previewed();
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(entriesIn('Snacks')[0].textContent).toContain('100 g');
    expect(kcal()).toBe('61');

    // Delete, after a confirmation.
    fireEvent.click(entriesIn('Snacks')[0]);
    await settle();
    fireEvent.click(screen.getByTestId('delete-entry'));
    const confirm = screen.getByTestId('confirm');
    expect(confirm.textContent).toContain('Delete Greek yogurt from Snacks?');
    expect(confirm.textContent).toContain("Its calories come off today's total.");
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await settle();
    expect(api.log).toHaveLength(0);
    expect(kcal()).toBe('—');
    expect(screen.getByTestId('toast').textContent).toBe('Deleted Greek yogurt');
  });
});

describe('planned meals', () => {
  it('shows as Planned with Log 1 serving; one tap logs one serving and the row becomes an entry', async () => {
    const api = fakeApi();
    api.recipes.push(STEW);
    api.plan.push(planned({}), planned({ id: 'pl_note', recipe_id: '', recipe_name: '', note: 'Eating out' }));
    await open();
    const row = within(card('Dinner')).getByTestId('planned-row');
    expect(row.textContent).toContain('Planned: Beef Stew');
    expect(row.textContent).toContain('412 kcal a serving');
    // A note is not offered, and a planned meal counts toward nothing.
    expect(within(card('Dinner')).queryAllByTestId('planned-row')).toHaveLength(1);
    expect(kcal()).toBe('—');

    const log = within(row).getByTestId('log-planned');
    fireEvent.click(log);
    fireEvent.click(log);
    await settle();
    const writes = api.calls('logFood');
    expect(new Set(writes.map((w) => w.payload.id)).size).toBe(1);
    expect(writes[0].payload).toMatchObject({
      recipe_id: 'rc_stew',
      qty: 1,
      unit: 'serving',
      slot: 'Dinner',
      date: TODAY,
    });
    expect(api.log).toHaveLength(1);
    expect(within(card('Dinner')).queryAllByTestId('planned-row')).toHaveLength(0);
    expect(entriesIn('Dinner')[0].textContent).toContain('Beef Stew');
    expect(entriesIn('Dinner')[0].textContent).toContain('1 serving');
    expect(kcal()).toBe('412');
    expect(screen.getByTestId('toast').textContent).toBe('Logged Beef Stew');
  });

  it('a failed log keeps the row and says so; a recipe with no nutrition has no button', async () => {
    const api = fakeApi();
    api.recipes.push(STEW);
    api.plan.push(planned({}), planned({ id: 'pl_2', slot: 'Lunch', kcal_serving: null, recipe_name: 'Mystery' }));
    api.answer('logFood', () => ({ success: false, error: 'offline' }));
    await open();
    fireEvent.click(within(card('Dinner')).getByTestId('log-planned'));
    await settle();
    expect(card('Dinner').textContent).toContain("Couldn't log. Try again.");
    expect(within(card('Dinner')).getByTestId('planned-row')).toBeDefined();
    const lunch = within(card('Lunch')).getByTestId('planned-row');
    expect(lunch.textContent).toContain('No nutrition yet');
    expect(within(lunch).queryByTestId('log-planned')).toBeNull();
  });
});

describe('the Add sheet', () => {
  it('finds foods by name or brand and recipes by name; a food with no nutrition is listed as such and does not log', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, BAR, HERBS);
    api.recipes.push(STEW, recipe('rc_bar', 'Bar cookies'));
    await open();
    const sheet = await addTo('Snacks');
    const search = within(sheet).getByTestId('add-search');
    const names = () =>
      within(sheet)
        .queryAllByTestId('add-result')
        .map((r) => r.querySelector('.recipe-name')!.textContent);
    fireEvent.input(search, { target: { value: 'kindly' } });
    expect(names()).toEqual(['Kindly Nut bar']);
    expect(within(sheet).getAllByTestId('add-result')[0].textContent).toContain('Packaged · 190 kcal a bar');
    fireEvent.input(search, { target: { value: 'BAR' } });
    expect(names()).toEqual(['Kindly Nut bar', 'Bar cookies']);
    fireEvent.input(search, { target: { value: 'stew' } });
    expect(names()).toEqual(['Beef Stew']);
    fireEvent.input(search, { target: { value: 'zzz' } });
    expect(within(sheet).getByTestId('add-no-match').textContent).toBe('Nothing matches "zzz".');
    expect(within(sheet).getByTestId('not-here')).toBeDefined();

    fireEvent.input(search, { target: { value: 'herbes' } });
    const herbs = within(sheet).getAllByTestId('add-result')[0];
    expect(herbs.textContent).toContain('No nutrition yet');
    expect(herbs.textContent).toContain('Add nutrition');
    fireEvent.click(herbs);
    await settle();
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    const form = screen.getByTestId('food-form');
    expect(api.calls('logFood')).toHaveLength(0);

    // Its nutrition saved, the form comes back to the Add sheet, where the food is now loggable.
    for (const [k, v] of [
      ['n-kcal', '276'],
      ['n-protein', '11'],
      ['n-carbs', '64'],
      ['n-fat', '7'],
    ]) {
      fireEvent.input(within(form).getByTestId(k), { target: { value: v } });
    }
    api.answer('upsertFood', (p) => {
      const i = api.foods.findIndex((f) => f.id === p.id);
      api.foods[i] = { ...api.foods[i], ...p };
      return { success: true, data: api.foods[i] };
    });
    fireEvent.click(within(form).getByTestId('food-save'));
    await settle();
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    const back = screen.getByTestId('add-sheet');
    fireEvent.input(within(back).getByTestId('add-search'), { target: { value: 'herbes' } });
    expect(within(back).getAllByTestId('add-result')[0].textContent).toContain('Ingredient · 276 kcal / 100 g');
  });

  it('with no text lists what was logged most recently, newest first, each once, without foods lacking nutrition', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, BAR, HERBS);
    api.recipes.push(STEW);
    api.log.push(
      entry({
        id: 'a',
        food_id: 'fd_yog',
        unit: 'cup',
        kcal: 150,
        logged_at: '2026-10-30T10:00:00Z',
        date: '2026-10-30',
      }),
      entry({
        id: 'b',
        recipe_id: 'rc_stew',
        unit: 'serving',
        kcal: 412,
        logged_at: '2026-11-01T10:00:00Z',
        date: '2026-11-01',
      }),
      entry({ id: 'c', food_id: 'fd_herbs', qty: 2, logged_at: '2026-11-01T11:00:00Z', date: '2026-11-01' }),
      entry({
        id: 'd',
        food_id: 'fd_yog',
        unit: 'cup',
        kcal: 150,
        logged_at: '2026-11-01T12:00:00Z',
        date: '2026-11-01',
      }),
    );
    await open();
    const sheet = await addTo('Lunch');
    expect(api.calls('getFoodLog').at(-1)!.params.get('from')).toBe('2026-09-03');
    expect(sheet.textContent).toContain('Recent');
    const names = within(sheet)
      .getAllByTestId('add-result')
      .map((r) => r.querySelector('.recipe-name')!.textContent);
    expect(names).toEqual(['Greek yogurt', 'Beef Stew']);
  });

  it('with nothing logged yet offers up to 3 recipes', async () => {
    const api = fakeApi();
    api.recipes.push(STEW, recipe('rc_2', 'Two'), recipe('rc_3', 'Three'), recipe('rc_4', 'Four'));
    await open();
    const sheet = await addTo('Lunch');
    expect(sheet.textContent).toContain('Nothing logged yet. Search for a food or recipe.');
    expect(sheet.textContent).toContain('Your recipes');
    expect(within(sheet).getAllByTestId('add-result')).toHaveLength(3);
  });

  it('closes on Escape and gives focus back to its Add row', async () => {
    fakeApi();
    await open();
    const add = within(card('Lunch')).getByTestId('add-to-meal');
    add.focus();
    fireEvent.click(add);
    await settle();
    const sheet = screen.getByTestId('add-sheet');
    expect(document.activeElement).toBe(within(sheet).getByTestId('add-search'));
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await settle();
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(document.activeElement).toBe(add);
  });

  it('"Not here? Add a food" opens the Add a food sheet, and the food saved there opens the amount sheet', async () => {
    const api = fakeApi();
    await open();
    const sheet = await addTo('Snacks');
    fireEvent.click(within(sheet).getByTestId('not-here'));
    await settle();
    expect(screen.getByTestId('add-food')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Type from a label/ }));
    const form = screen.getByTestId('food-form');
    fireEvent.input(within(form).getByTestId('food-name'), { target: { value: 'Protein bar' } });
    fireEvent.input(within(form).getByTestId('serving-name'), { target: { value: 'bar' } });
    fireEvent.input(within(form).getByTestId('serving-g'), { target: { value: '30' } });
    fireEvent.input(within(form).getByTestId('n-kcal'), { target: { value: '120' } });
    fireEvent.input(within(form).getByTestId('n-protein'), { target: { value: '5' } });
    fireEvent.input(within(form).getByTestId('n-carbs'), { target: { value: '15' } });
    fireEvent.input(within(form).getByTestId('n-fat'), { target: { value: '4' } });
    fireEvent.click(within(form).getByTestId('food-save'));
    await settle();
    await previewed();
    const amount = screen.getByTestId('amount-sheet');
    expect(within(amount).getByRole('heading').textContent).toBe('Protein bar');
    expect(within(amount).getByRole('button', { name: 'Snacks' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('120');
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.log[0]).toMatchObject({ slot: 'Snacks', qty: 1, unit: 'bar' });
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
  });
  afterEach(() => {
    delete env.VITE_DEMO_MODE;
    _resetDemoModeCache();
    _resetDemoApi();
  });

  it('has a sample day with every state: logged, partial, no nutrition and planned, and the days before', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await open(true);
    expect(entriesIn('Breakfast')).toHaveLength(2);
    expect(entriesIn('Lunch').map((r) => r.textContent)).toEqual([
      expect.stringContaining('partial'),
      expect.stringContaining('No nutrition'),
    ]);
    expect(entriesIn('Dinner')).toHaveLength(0);
    expect(within(card('Dinner')).getByTestId('planned-row').textContent).toContain('Planned: Weeknight chili');
    expect(entriesIn('Snacks')).toHaveLength(1);
    expect(screen.getByTestId('day-low')).toBeDefined();

    fireEvent.click(within(card('Dinner')).getByTestId('log-planned'));
    await settle();
    expect(entriesIn('Dinner')).toHaveLength(1);
    expect(within(card('Dinner')).queryAllByTestId('planned-row')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(screen.getAllByTestId('entry-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(kcal()).toBe('—');
    expect(screen.getByTestId('day-note').textContent).toMatch(/^Nothing logged on \w+day\.$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();

  it.each(['.meal-add', '.chip', '.btn', '.text-btn', '.field'])('%s is at least 44px', (sel) => {
    expect(rule(css, sel)).toContain('min-height: var(--touch-target)');
  });

  it('the arrows and the stepper are 44px icon buttons; entry and result rows are 56px', () => {
    expect(rule(css, '.icon-btn')).toContain('width: var(--touch-target)');
    expect(rule(css, '.icon-btn')).toContain('height: var(--touch-target)');
    expect(rule(css, '.log-row')).toContain('min-height: 56px');
  });

  it('Delete entry is a danger text button, not the primary colour', () => {
    expect(rule(css, '.delete-entry')).toContain('color: var(--color-danger-text)');
  });

  it('nothing scrolls sideways at 375px: the day card and macros wrap, names wrap', () => {
    expect(rule(css, '.day-card')).toContain('flex-wrap: wrap');
    expect(rule(css, '.day-macros')).toContain('flex-wrap: wrap');
    expect(rule(css, '.eaten-nav')).toContain('min-width: 0');
    expect(rule(css, '.recipe-name')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.recipe-text')).toContain('min-width: 0');
  });
});

describe('a save shows at once (#785)', () => {
  const offline = () => ({ success: false as const, error: 'offline' });

  it('a logged food is under its meal when the sheet closes, whatever the refresh does; the old totals stay', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'greek' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    await previewed();
    // Every read after the save fails: what shows can only be the write's own answer.
    api.answer('getFoodLog', offline);
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByTestId('log-it'));
    await settle();
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    expect(entriesIn('Dinner')).toHaveLength(1);
    expect(entriesIn('Dinner')[0].textContent).toContain('Greek yogurt');
    expect(entriesIn('Dinner')[0].textContent).toContain('150');
    expect(screen.getByTestId('toast').textContent).toBe('Logged Greek yogurt');
    // The failed refresh leaves the screen as it is: no error, no skeleton, the previous totals.
    expect(screen.queryByTestId('day-error')).toBeNull();
    expect(screen.queryByTestId('day-loading')).toBeNull();
    expect(kcal()).toBe('—');
  });

  it('the refresh brings the totals up without the skeleton', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'greek' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    await previewed();
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByTestId('log-it'));
    await act(async () => {});
    expect(screen.queryByTestId('day-loading')).toBeNull();
    await settle();
    expect(kcal()).toBe('150');
    expect(entriesIn('Dinner')).toHaveLength(1);
  });

  it('a failed save keeps the sheet open with the error and the screen unchanged', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'greek' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    await previewed();
    const real = (p: any) => ({ success: true as const, data: entry({ food_id: 'fd_yog', slot: p.slot, kcal: 150 }) });
    api.answer('logFood', (p) => (p.dry_run ? real(p) : { success: false, error: 'Network error' }));
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByTestId('log-it'));
    await settle();
    expect(screen.getByTestId('amount-error')).toBeDefined();
    expect(screen.getByTestId('amount-sheet')).toBeDefined();
    expect(entriesIn('Dinner')).toHaveLength(0);
    expect(kcal()).toBe('—');
  });

  it('an edit and a delete show when the sheet closes, whatever the refresh does', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(
      entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 }),
    );
    await open();
    api.answer('getFoodLog', offline);
    fireEvent.click(entriesIn('Breakfast')[0]);
    await settle();
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByRole('button', { name: 'Lunch' }));
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByTestId('log-it'));
    await settle();
    expect(entriesIn('Breakfast')).toHaveLength(0);
    expect(entriesIn('Lunch')).toHaveLength(1);
    fireEvent.click(entriesIn('Lunch')[0]);
    await settle();
    fireEvent.click(screen.getByTestId('delete-entry'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(api.calls('deleteLogEntry')).toHaveLength(1);
    expect(entriesIn('Lunch')).toHaveLength(0);
    expect(screen.queryByTestId('day-error')).toBeNull();
  });

  it('logging a planned meal shows the entry and drops the planned row, whatever the refresh does', async () => {
    const api = fakeApi();
    api.recipes.push(STEW);
    api.plan.push(planned({}));
    await open();
    expect(screen.getAllByTestId('planned-row')).toHaveLength(1);
    api.answer('getFoodLog', offline);
    fireEvent.click(screen.getByTestId('log-planned'));
    await settle();
    expect(screen.queryAllByTestId('planned-row')).toHaveLength(0);
    expect(entriesIn('Dinner')).toHaveLength(1);
    expect(screen.queryByTestId('day-error')).toBeNull();
  });
});
