// #712 in the app: the Eaten day view (the day card from getFoodLogTotals, the meal cards, planned meals), the
// Add sheet, the amount sheet's dry-run preview, editing and deleting, day navigation, demo mode, and the
// stylesheet's 44px and 375px rules. The API's own rules are in apps-script/tests/food-log.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import App from '../App';
import { createLiveApi } from '../api/client';
import type { Food, FoodLogEntry, PlanEntry, RecipeSummary, Slot } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { toastText } from '../ui/toast';
import { _resetEaten, unloggedPlan } from './eaten-store';
import { AmountSheet, type LogTarget } from './amount-sheet';
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
/** #884: Select is in the meal's ⋯ menu. */
function startSelect(slot: string) {
  fireEvent.click(within(card(slot)).getByTestId('meal-menu'));
  fireEvent.click(screen.getByTestId('menu-select'));
}
const openOf = (row: HTMLElement) => within(row).getByTestId('entry-open');
const entriesIn = (slot: string) => within(card(slot)).queryAllByTestId('entry-row');

/** Open the Add sheet for a meal and wait for its lists. */
async function addTo(slot: string) {
  fireEvent.click(within(card(slot)).getByTestId('add-to-meal'));
  await settle();
  return screen.getByTestId('add-sheet');
}

/**
 * The amount sheet in logging mode. The Add sheet no longer opens it (#933: a tap puts the food in the tray), but it
 * stays for any other caller, so it is mounted on its own here.
 */
function mountAmount(target: LogTarget, slot: Slot = 'Dinner') {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <AmountSheet
      api={createLiveApi('tok')}
      target={target}
      date={TODAY}
      today={TODAY}
      slot={slot}
      onSaved={onSaved}
      onClose={onClose}
    />,
  );
  return { onSaved, onClose };
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
    expect(screen.getByTestId('day-macros').textContent).toBe('Protein—Carbs—Fat—');
    expect(screen.getByTestId('day-card').textContent).not.toMatch(/\b0 kcal/);
    // Five meal cards, each a region with only its Add row.
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))).toEqual([
      'meal-breakfast',
      'meal-lunch',
      'meal-dinner',
      'meal-after-dinner',
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
    expect(screen.getByTestId('day-macros').textContent).toBe(
      'Protein6 g38% of kcalCarbs9 g56% of kcalFat0 g6% of kcal',
    );

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

  it('After dinner is its own card: logging stores the slot, a move keeps the numbers, and deleting names it (#826)', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    expect(within(card('After dinner')).getByTestId('add-to-meal').textContent).toContain('Add to after dinner');
    expect(card('After dinner').querySelector('h2')!.id).toBe('meal-after-dinner');
    expect(document.querySelectorAll('[id*=" "], [data-testid*=" "]')).toHaveLength(0);
    const sheet = await addTo('After dinner');
    expect(within(sheet).getByRole('heading').textContent).toBe('Add to after dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'greek' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    fireEvent.click(within(sheet).getByTestId('tray-save'));
    await settle();
    expect(api.log[0]).toMatchObject({ slot: 'After dinner' });
    expect(entriesIn('After dinner')[0].textContent).toContain('Greek yogurt');
    expect(screen.getByTestId('toast').textContent).toContain('Added Greek yogurt to after dinner');
    const stored = { kcal: api.log[0].kcal, protein_g: api.log[0].protein_g, carbs_g: api.log[0].carbs_g };

    // Snacks and back again: only the meal changes.
    for (const [from, to] of [
      ['After dinner', 'Snacks'],
      ['Snacks', 'After dinner'],
    ]) {
      fireEvent.click(openOf(entriesIn(from)[0]));
      await settle();
      const amount = screen.getByTestId('amount-sheet');
      expect(within(amount).getByRole('group', { name: 'Meal' }).textContent).toBe(
        'BreakfastLunchDinnerAfter dinnerSnacks',
      );
      fireEvent.click(within(amount).getByRole('button', { name: to }));
      fireEvent.click(within(amount).getByTestId('log-it'));
      await settle();
      expect(entriesIn(to)).toHaveLength(1);
    }
    expect(api.log[0]).toMatchObject({ slot: 'After dinner', ...stored });

    // Select mode and the delete confirmation work in the card.
    startSelect('After dinner');
    expect(within(card('After dinner')).getByTestId('select-cancel').textContent).toBe('Cancel');
    fireEvent.click(within(card('After dinner')).getByTestId('select-cancel'));
    fireEvent.click(openOf(entriesIn('After dinner')[0]));
    await settle();
    fireEvent.click(screen.getByTestId('delete-entry'));
    expect(screen.getByTestId('confirm').textContent).toContain('Delete Greek yogurt from After dinner?');
    expect(screen.getByTestId('confirm').textContent).toContain("Its calories come off today's total.");
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
  it('a food in a named serving: its figures are on the sheet at once with no request, and a save writes through logFood', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    const { onSaved } = mountAmount({ kind: 'food', food: YOGURT });
    const amount = screen.getByTestId('amount-sheet');
    expect(within(amount).getByRole('heading').textContent).toBe('Greek yogurt');
    expect(within(amount).getByTestId('amount-subline').textContent).toBe('Greek yogurt · 1 cup = 245 g');
    // #929: worked out in the app, so nothing was asked of the API for it.
    expect(api.calls('logFood')).toHaveLength(0);
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('150');
    expect(within(amount).queryByTestId('amount-macros')).toBeNull();
    expect(within(amount).getByTestId('macro-bar').getAttribute('aria-label')).toBe(
      'Calories by macro: protein 38%, carbs 56%, fat 6%.',
    );
    expect(within(amount).getByTestId('macro-col-protein').textContent).toBe('Protein6 g38% of kcal');
    expect(within(amount).getByTestId('macro-col-carbs').textContent).toBe('Carbs9 g56% of kcal');
    expect(within(amount).getByTestId('macro-col-fat').textContent).toBe('Fat0.4 g6% of kcal');
    expect(api.log).toHaveLength(0);

    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    const saved = api.calls('logFood').filter((c) => !c.payload.dry_run);
    expect(saved).toHaveLength(1);
    expect(saved[0].payload).toMatchObject({ food_id: 'fd_yog', qty: 1, unit: 'cup', slot: 'Dinner', date: TODAY });
    expect(saved[0].payload.id).toMatch(/^lg_[0-9a-f]{8}$/);
    expect(api.log[0]).toMatchObject({ kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 });
    expect(onSaved).toHaveBeenCalledWith('Logged Greek yogurt', { entry: expect.objectContaining({ kcal: 149.9 }) });
  });

  it('a food in grams: changing the unit resets the amount, and the stepper steps by 10', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    const { onSaved } = mountAmount({ kind: 'food', food: YOGURT }, 'Breakfast');
    const amount = screen.getByTestId('amount-sheet');
    fireEvent.change(within(amount).getByTestId('log-unit'), { target: { value: 'g' } });
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('100');
    fireEvent.click(within(amount).getByRole('button', { name: 'More' }));
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('110');
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '150' } });
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('92');
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.log[0]).toMatchObject({ qty: 150, unit: 'g', grams: 150, kcal: 91.8, slot: 'Breakfast' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('a recipe in servings, with partial said in words', async () => {
    const api = fakeApi();
    const bread = recipe('rc_p', 'Banana Bread', {
      partial: true,
      nutrition: { per_serving: { kcal: 68, protein_g: 1, carbs_g: 9, fat_g: 3 }, missing: [], partial: true },
    });
    api.recipes.push(bread);
    mountAmount({ kind: 'recipe', recipe: bread }, 'Lunch');
    const amount = screen.getByTestId('amount-sheet');
    expect(within(amount).getByTestId('amount-subline').textContent).toBe('Serves 6');
    expect(within(amount).queryByTestId('log-unit')).toBeNull();
    expect(amount.textContent).toContain('Some ingredients are left out.');
    fireEvent.click(within(amount).getByRole('button', { name: 'More' }));
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('102');
    expect(api.calls('logFood')).toHaveLength(0);
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.log[0]).toMatchObject({ recipe_id: 'rc_p', qty: 1.5, unit: 'serving', kcal: 102 });
  });

  it('an amount of 0 or blank disables Log it with the helper', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    mountAmount({ kind: 'food', food: YOGURT });
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
    const { onSaved } = mountAmount({ kind: 'food', food: YOGURT });
    api.answer('logFood', () => ({ success: false, error: 'food_id "fd_yog" is not a food' }));
    fireEvent.click(screen.getByTestId('log-it'));
    await settle();
    expect(screen.getByTestId('amount-error').textContent).toBe("Couldn't save: this food was deleted.");
    expect(screen.getByTestId('amount-sheet')).toBeDefined();
    expect(onSaved).not.toHaveBeenCalled();
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
    fireEvent.click(openOf(entriesIn('Breakfast')[0]));
    await settle();
    let amount = screen.getByTestId('amount-sheet');
    // The first figures are the entry itself, and no figure is ever asked of the API (#929).
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('150');
    expect(api.calls('updateLogEntry')).toHaveLength(0);
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '2' } });
    expect(api.calls('updateLogEntry')).toHaveLength(0);
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('300');
    expect(amount.textContent).toContain('Recalculated from the food as it is now.');
    fireEvent.click(within(amount).getByRole('button', { name: 'Lunch' }));
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(api.calls('updateLogEntry').at(-1)!.payload).toEqual({ id: 'lg_1', changes: { slot: 'Lunch', qty: 2 } });
    expect(entriesIn('Breakfast')).toHaveLength(0);
    expect(entriesIn('Lunch')[0].textContent).toContain('2 cup · 490 g');
    expect(kcal()).toBe('300');

    // Only the meal: the stored numbers are kept.
    fireEvent.click(openOf(entriesIn('Lunch')[0]));
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
    fireEvent.click(openOf(entriesIn('Snacks')[0]));
    await settle();
    amount = screen.getByTestId('amount-sheet');
    fireEvent.change(within(amount).getByTestId('log-unit'), { target: { value: 'g' } });
    fireEvent.click(within(amount).getByTestId('log-it'));
    await settle();
    expect(entriesIn('Snacks')[0].textContent).toContain('100 g');
    expect(kcal()).toBe('61');

    // Delete, after a confirmation.
    fireEvent.click(openOf(entriesIn('Snacks')[0]));
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

describe('the amount sheet: focus and the macro visual (#870)', () => {
  async function openYogurt() {
    const api = fakeApi();
    api.foods.push(YOGURT);
    mountAmount({ kind: 'food', food: YOGURT });
    return api;
  }

  it('opens with focus on the dialog panel, not the amount field', async () => {
    await openYogurt();
    const amount = screen.getByTestId('amount-sheet');
    expect(amount.getAttribute('role')).toBe('dialog');
    expect(document.activeElement).toBe(amount);
    expect(document.activeElement).not.toBe(within(amount).getByTestId('log-amount'));
    expect(amount.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(amount).getByRole('heading').textContent).toBe('Greek yogurt');
  });

  it('opens an entry for editing on the panel too, and returns there after cancelling Delete', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(
      entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 }),
    );
    await open();
    fireEvent.click(openOf(entriesIn('Breakfast')[0]));
    await settle();
    let amount = screen.getByTestId('amount-sheet');
    expect(document.activeElement).toBe(amount);
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '2' } });
    fireEvent.click(within(amount).getByTestId('delete-entry'));
    fireEvent.click(within(screen.getByTestId('confirm')).getByRole('button', { name: 'Cancel' }));
    await settle();
    amount = screen.getByTestId('amount-sheet');
    expect(document.activeElement).toBe(amount);
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('2');
  });

  it('Tab from the panel goes to the first control and Shift+Tab to the last', async () => {
    await openYogurt();
    const amount = screen.getByTestId('amount-sheet');
    fireEvent.keyDown(amount, { key: 'Tab' });
    expect(document.activeElement).toBe(within(amount).getByRole('button', { name: 'Close' }));
    amount.focus();
    fireEvent.keyDown(amount, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(within(amount).getByTestId('log-it'));
  });

  it('Less at the minimum is aria-disabled, stays focusable and does nothing', async () => {
    await openYogurt();
    const amount = screen.getByTestId('amount-sheet');
    const less = within(amount).getByRole('button', { name: 'Less' });
    expect(less.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(less);
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('0.5');
    fireEvent.click(less);
    expect((within(amount).getByTestId('log-amount') as HTMLInputElement).value).toBe('0.5');
    expect(less.getAttribute('aria-disabled')).toBe('true');
    expect((less as HTMLButtonElement).disabled).toBe(false);
    less.focus();
    expect(document.activeElement).toBe(less);
  });

  it('shows the empty bar and unknown columns when a unit has no weight, at the same structure as filled, and still saves', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    // A unit the food no longer has, on an entry that kept no grams: nothing to work a new amount out from.
    api.log.push(entry({ food_id: 'fd_yog', unit: 'scoop', qty: 1, grams: null, kcal: 150 }));
    await open();
    fireEvent.click(openOf(entriesIn('Breakfast')[0]));
    await settle();
    const amount = screen.getByTestId('amount-sheet');
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('150');
    fireEvent.input(within(amount).getByTestId('log-amount'), { target: { value: '2' } });
    expect(within(amount).getByTestId('amount-kcal').textContent).toBe('—');
    expect(within(amount).getByTestId('macro-empty')).toBeDefined();
    expect(within(amount).getAllByRole('img', { name: 'not known' })).toHaveLength(3);
    expect(amount.textContent).toContain("Couldn't work out the calories.");
    // Save is allowed: the API decides.
    expect((within(amount).getByTestId('log-it') as HTMLButtonElement).disabled).toBe(false);
    expect(api.calls('updateLogEntry')).toHaveLength(0);
  });

  it('an amount and a unit show their figures on the tap, with no request (#929)', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    mountAmount({ kind: 'food', food: YOGURT });
    const amount = screen.getByTestId('amount-sheet');
    const kcalNow = () => within(amount).getByTestId('amount-kcal').textContent;
    expect(kcalNow()).toBe('150');
    fireEvent.click(within(amount).getByRole('button', { name: 'More' }));
    expect(kcalNow()).toBe('225');
    fireEvent.change(within(amount).getByTestId('log-unit'), { target: { value: 'g' } });
    expect(kcalNow()).toBe('61');
    expect(api.calls('logFood')).toHaveLength(0);
    expect(api.calls('updateLogEntry')).toHaveLength(0);
  });

  it('More nutrition opens as the parts groups', async () => {
    await openYogurt();
    const amount = screen.getByTestId('amount-sheet');
    fireEvent.click(within(amount).getByRole('button', { name: /More nutrition/ }));
    expect(amount.textContent).toContain("This food doesn't have sodium, fiber or the rest yet.");
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
    expect(within(sheet).getAllByTestId('add-result')[0].textContent).toContain('1 bar · 190 kcal');
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
    expect(api.calls('logMeal')).toHaveLength(0);

    // Its nutrition saved, the form comes back to the Add sheet, with the food in the tray (#933).
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
    expect(within(back).getByTestId('tray-row').textContent).toContain('Herbes de Provence');
    expect(within(back).getByTestId('tray-row').textContent).toContain('276 kcal');
    expect(within(back).getByTestId('tray-save').textContent).toBe('Add 1 to snacks · 276 kcal');
    fireEvent.input(within(back).getByTestId('add-search'), { target: { value: 'herbes' } });
    expect(within(back).getAllByTestId('add-result')[0].getAttribute('aria-label')).toBe(
      'Herbes de Provence, in the tray, edit',
    );
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

  it('"Not here? Add a food" opens the Add a food sheet, and the food saved there goes into the tray', async () => {
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
    // Back on the sheet with no amount sheet: the new food is in the tray at its first serving, and nothing is logged.
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    const back = screen.getByTestId('add-sheet');
    expect(within(back).getByTestId('tray-row').textContent).toContain('Protein bar');
    expect(within(back).getByTestId('tray-pill').textContent).toContain('1 bar');
    expect(within(back).getByTestId('tray-save').textContent).toBe('Add 1 to snacks · 120 kcal');
    expect(api.log).toHaveLength(0);
    fireEvent.input(within(back).getByTestId('add-search'), { target: { value: 'protein' } });
    expect(within(back).getAllByTestId('add-result')[0].textContent).toContain('Protein bar');
    fireEvent.click(within(back).getByTestId('tray-save'));
    await settle();
    expect(api.log[0]).toMatchObject({ slot: 'Snacks', qty: 1, unit: 'bar' });
    expect(entriesIn('Snacks')[0].textContent).toContain('Protein bar');
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
    // #788: the sample salad is dinner's six entries, beside the planned chili.
    expect(entriesIn('Dinner')).toHaveLength(6);
    expect(within(card('Dinner')).getByTestId('planned-row').textContent).toContain('Planned: Weeknight chili');
    expect(entriesIn('Snacks')).toHaveLength(1);
    expect(screen.getByTestId('day-low')).toBeDefined();

    fireEvent.click(within(card('Dinner')).getByTestId('log-planned'));
    await settle();
    expect(entriesIn('Dinner')).toHaveLength(7);
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

describe('saving a meal as a recipe (#788)', () => {
  const SPRING = food('fd_spring', 'Spring mix', {
    kcal_100g: 20,
    protein_100g: 2,
    carbs_100g: 3.5,
    fat_100g: 0.3,
    servings_json: [{ name: 'cup', g: 42.5 }],
  });
  const BASIL = food('fd_basil', 'Basil');
  const salad = (id: string, food_id: string, over: Partial<FoodLogEntry> = {}) =>
    entry({ id, slot: 'Dinner', food_id, qty: 2, unit: 'cup', grams: 85, kcal: 17, ...over });

  function seed() {
    const api = fakeApi();
    api.foods.push(SPRING, YOGURT, BASIL);
    api.recipes.push(STEW);
    api.log.push(
      salad('lg_a', 'fd_spring', { logged_at: '2026-11-02T18:00:00Z' }),
      salad('lg_b', 'fd_yog', { qty: 100, unit: 'g', grams: 100, kcal: 61, logged_at: '2026-11-02T18:01:00Z' }),
      salad('lg_c', 'fd_basil', {
        qty: 5,
        unit: 'g',
        grams: 5,
        kcal: null,
        partial: true,
        logged_at: '2026-11-02T18:02:00Z',
      }),
      entry({
        id: 'lg_r',
        slot: 'Dinner',
        recipe_id: 'rc_stew',
        unit: 'serving',
        kcal: 412,
        logged_at: '2026-11-02T18:03:00Z',
      }),
      entry({
        id: 'lg_x',
        slot: 'Dinner',
        food_id: 'fd_gone',
        qty: 10,
        unit: 'g',
        grams: 10,
        kcal: 5,
        logged_at: '2026-11-02T18:04:00Z',
      }),
      entry({ id: 'lg_b1', slot: 'Breakfast', recipe_id: 'rc_stew', unit: 'serving', kcal: 412 }),
    );
    return api;
  }
  const rows = () => within(card('Dinner')).getAllByTestId('select-row');

  it('Select shows only on a meal with a food entry, and select mode is one meal at a time', async () => {
    seed();
    await open();
    // #884: every meal has a ⋯ menu, and Select in it is live only on a meal with a food entry.
    fireEvent.click(within(card('Dinner')).getByTestId('meal-menu'));
    expect(screen.getByTestId('menu-select').getAttribute('aria-disabled')).toBeNull();
    fireEvent.keyDown(screen.getByTestId('meal-menu-sheet'), { key: 'Escape' });
    // Breakfast holds only a recipe entry, Lunch nothing.
    for (const slot of ['Breakfast', 'Lunch']) {
      fireEvent.click(within(card(slot)).getByTestId('meal-menu'));
      expect(screen.getByTestId('menu-select').getAttribute('aria-disabled')).toBe('true');
      fireEvent.keyDown(screen.getByTestId('meal-menu-sheet'), { key: 'Escape' });
    }

    startSelect('Dinner');
    expect(within(card('Dinner')).getByTestId('select-cancel').textContent).toBe('Cancel');
    expect(rows().map((r) => r.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', null, null]);
    expect(within(card('Dinner')).queryByTestId('add-to-meal')).toBeNull();
    expect(within(card('Dinner')).getByTestId('save-as-recipe').textContent).toBe('Save as a recipe');
    expect(card('Dinner').textContent).toContain('Tick the items that go together.');
    // Recipes and removed foods are dimmed and say why.
    expect(rows()[3].getAttribute('aria-disabled')).toBe('true');
    expect(rows()[3].textContent).toContain("Recipes can't go in a usual or a recipe");
    expect(rows()[4].textContent).toContain('This food was deleted');

    fireEvent.click(within(card('Dinner')).getByTestId('select-cancel'));
    expect(within(card('Dinner')).getByTestId('add-to-meal')).toBeDefined();
  });

  it('opening select mode in another meal leaves the first', async () => {
    const api = seed();
    api.log.push(salad('lg_l', 'fd_spring', { slot: 'Lunch' }));
    await open();
    startSelect('Dinner');
    startSelect('Lunch');
    expect(within(card('Dinner')).queryByTestId('select-cancel')).toBeNull();
    expect(within(card('Lunch')).getByTestId('select-cancel')).toBeDefined();
  });

  it('a row toggles without opening the Amount sheet, and the foot counts the ticked', async () => {
    seed();
    await open();
    startSelect('Dinner');
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[2]);
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    expect(within(card('Dinner')).getByTestId('save-as-recipe').textContent).toBe('Save 2 as a recipe');
    // A dimmed row can't be ticked.
    fireEvent.click(rows()[3]);
    expect(within(card('Dinner')).getByTestId('save-as-recipe').textContent).toBe('Save 2 as a recipe');
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[2]);
    expect((within(card('Dinner')).getByTestId('save-as-recipe') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the sheet previews per serving, follows Serves, and flags a partial recipe', async () => {
    const api = seed();
    await open();
    startSelect('Dinner');
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[2]);
    fireEvent.click(within(card('Dinner')).getByTestId('save-as-recipe'));
    await settle();
    const sheet = screen.getByTestId('save-recipe-sheet');
    expect((within(sheet).getByTestId('recipe-name') as HTMLInputElement).value).toBe('');
    expect((within(sheet).getByTestId('save-recipe') as HTMLButtonElement).disabled).toBe(true);
    expect(within(sheet).getByTestId('recipe-lines').textContent).toBe('2 cup Spring mix85 g5 g BasilNo nutrition');
    await waitFor(() => expect(within(sheet).getByTestId('recipe-kcal').textContent).toContain('17 kcal'));
    expect(within(sheet).getByTestId('recipe-kcal').textContent).toContain('partial');
    expect(sheet.textContent).toContain('Some ingredients have no nutrition, so this is low.');
    expect(api.calls('computeNutrition')[0].payload.servings).toBe(1);

    fireEvent.click(within(sheet).getByLabelText('More servings'));
    expect(sheet.textContent).toContain('The amounts below make all 2 servings.');
    await waitFor(() => expect(api.calls('computeNutrition')).toHaveLength(2));
    await waitFor(() => expect(within(sheet).getByTestId('recipe-kcal').textContent).toContain('about 9 kcal'));
  });

  it('saving creates one recipe from the entries as logged, closes, leaves select mode and changes nothing in the log', async () => {
    const api = seed();
    await open();
    const before = kcal();
    startSelect('Dinner');
    fireEvent.click(rows()[0]);
    fireEvent.click(rows()[1]);
    fireEvent.click(within(card('Dinner')).getByTestId('save-as-recipe'));
    await settle();
    const sheet = screen.getByTestId('save-recipe-sheet');
    fireEvent.input(within(sheet).getByTestId('recipe-name'), { target: { value: '  Side salad ' } });
    fireEvent.click(within(sheet).getByTestId('save-recipe'));
    await settle();
    const [call] = api.calls('upsertRecipe');
    expect(call.payload.id).toMatch(/^rc_[0-9a-f]{8}$/);
    expect(call.payload).toMatchObject({
      name: 'Side salad',
      servings: 1,
      notes: 'Saved from Dinner on Mon 2 Nov 2026.',
      lines: [
        { text: '2 cup Spring mix', qty: 2, unit: 'cup', food_id: 'fd_spring', grams: 85 },
        { text: '100 g Greek yogurt', qty: 100, unit: 'g', food_id: 'fd_yog', grams: 100 },
      ],
    });
    expect(screen.queryByTestId('save-recipe-sheet')).toBeNull();
    expect(within(card('Dinner')).getByTestId('add-to-meal')).toBeDefined();
    expect(screen.getByTestId('toast').textContent).toBe('Saved Side salad to your recipes');
    expect(kcal()).toBe(before);
    expect(api.log).toHaveLength(6);
    expect(api.calls('logFood')).toHaveLength(0);

    // It is in the Add sheet's search straight away.
    const add = await addTo('Dinner');
    fireEvent.input(within(add).getByTestId('add-search'), { target: { value: 'side' } });
    await settle();
    expect(
      within(add)
        .getAllByTestId('add-result')
        .map((r) => r.querySelector('.recipe-name')!.textContent),
    ).toEqual(['Side salad']);
  });

  it('a failed save keeps the sheet, the name and the ticks', async () => {
    const api = seed();
    api.answer('upsertRecipe', () => ({ success: false, error: 'offline', code: 'network' }));
    await open();
    startSelect('Dinner');
    fireEvent.click(rows()[0]);
    fireEvent.click(within(card('Dinner')).getByTestId('save-as-recipe'));
    await settle();
    const sheet = screen.getByTestId('save-recipe-sheet');
    fireEvent.input(within(sheet).getByTestId('recipe-name'), { target: { value: 'Greens' } });
    fireEvent.click(within(sheet).getByTestId('save-recipe'));
    await settle();
    expect(within(sheet).getByTestId('save-recipe-error').textContent).toBe(
      "Couldn't save. Your changes are kept here. Try again.",
    );
    expect((within(sheet).getByTestId('recipe-name') as HTMLInputElement).value).toBe('Greens');
    expect(within(sheet).getByTestId('save-recipe').getAttribute('aria-busy')).toBe('false');

    // Cancel returns to select mode with the ticks kept.
    fireEvent.click(within(sheet).getByTestId('save-recipe-cancel'));
    expect(screen.queryByTestId('save-recipe-sheet')).toBeNull();
    expect(within(card('Dinner')).getByTestId('save-as-recipe').textContent).toBe('Save 1 as a recipe');
  });

  it('changing the day leaves select mode with nothing saved', async () => {
    const api = seed();
    await open();
    startSelect('Dinner');
    fireEvent.click(rows()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    await settle();
    expect(within(card('Dinner')).getByTestId('meal-menu')).toBeDefined();
    expect(api.calls('upsertRecipe')).toHaveLength(0);
  });

  it('demo mode saves the sample salad with no network call, and the recipe is searchable', async () => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await open(true);
      startSelect('Dinner');
      const items = within(card('Dinner')).getAllByTestId('select-row');
      expect(items).toHaveLength(6);
      items.slice(0, 5).forEach((r) => fireEvent.click(r));
      expect(within(card('Dinner')).getByTestId('save-as-recipe').textContent).toBe('Save 5 as a recipe');
      fireEvent.click(within(card('Dinner')).getByTestId('save-as-recipe'));
      await settle();
      const sheet = screen.getByTestId('save-recipe-sheet');
      fireEvent.input(within(sheet).getByTestId('recipe-name'), { target: { value: 'Side salad' } });
      await waitFor(() => expect(within(sheet).getByTestId('recipe-kcal').textContent).toMatch(/kcal/));
      fireEvent.click(within(sheet).getByTestId('save-recipe'));
      await settle();
      expect(screen.getByTestId('toast').textContent).toBe('Saved Side salad to your recipes');
      const add = await addTo('Lunch');
      fireEvent.input(within(add).getByTestId('add-search'), { target: { value: 'side' } });
      await settle();
      expect(within(add).getAllByTestId('add-result')).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete env.VITE_DEMO_MODE;
      _resetDemoModeCache();
      _resetDemoApi();
    }
  });

  it('select mode and the sheet keep 44px controls and wrap at 375px', () => {
    const css = readGlobalCss();
    expect(rule(css, '.text-btn')).toContain('min-height: var(--touch-target)');
    expect(rule(css, '.log-row')).toContain('min-height: 56px');
    expect(rule(css, '.recipe-save-text')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.recipe-save-g')).toContain('white-space: nowrap');
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();

  it.each(['.meal-add', '.chip', '.btn', '.text-btn', '.field', '.together-row'])('%s is at least 44px', (sel) => {
    expect(rule(css, sel)).toContain('min-height: var(--touch-target)');
  });

  it('the tray: group heads 44px, the footer pinned, rows 56px, and no fade under reduced motion (#933)', () => {
    expect(rule(css, '.tray-group-head')).toContain('min-height: var(--touch-target)');
    expect(rule(css, '.sheet-footer')).toContain('position: sticky');
    expect(rule(css, '.sheet-footer')).toContain('bottom: 0');
    expect(rule(css, '.tray')).toContain('background: var(--color-primary-light)');
    expect(rule(css, '.tray')).toContain('border-radius: var(--radius-md)');
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.log-row\.is-fresh \{\s*animation: none;/);
    expect(rule(css, '.log-row.is-pending')).toContain('opacity');
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
    expect(rule(css, '.macro-cols')).toContain('repeat(3, minmax(0, 1fr))');
    expect(rule(css, '.macro-name')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.eaten-nav')).toContain('min-width: 0');
    expect(rule(css, '.recipe-name')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.recipe-text')).toContain('min-width: 0');
  });
});

describe('a save shows at once (#785)', () => {
  const offline = () => ({ success: false as const, error: 'offline' });

  it('a saved tray is under its meal when the sheet closes, whatever the refresh does; the old totals stay', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    const sheet = await addTo('Dinner');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'greek' } });
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    // Every read after the save fails: what shows can only be the write's own answer.
    api.answer('getFoodLog', offline);
    fireEvent.click(within(sheet).getByTestId('tray-save'));
    await settle();
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(entriesIn('Dinner')).toHaveLength(1);
    expect(entriesIn('Dinner')[0].textContent).toContain('Greek yogurt');
    expect(entriesIn('Dinner')[0].textContent).toContain('150');
    expect(screen.getByTestId('toast').textContent).toContain('Added Greek yogurt to dinner');
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
    fireEvent.click(within(sheet).getByTestId('tray-save'));
    await act(async () => {});
    expect(screen.queryByTestId('day-loading')).toBeNull();
    await settle();
    expect(kcal()).toBe('150');
    expect(entriesIn('Dinner')).toHaveLength(1);
  });

  it('an edit and a delete show when the sheet closes, whatever the refresh does', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(
      entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9, protein_g: 6, carbs_g: 9, fat_g: 0.4 }),
    );
    await open();
    api.answer('getFoodLog', offline);
    fireEvent.click(openOf(entriesIn('Breakfast')[0]));
    await settle();
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByRole('button', { name: 'Lunch' }));
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByTestId('log-it'));
    await settle();
    expect(entriesIn('Breakfast')).toHaveLength(0);
    expect(entriesIn('Lunch')).toHaveLength(1);
    fireEvent.click(openOf(entriesIn('Lunch')[0]));
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

describe('the Add sheet tray (#933)', () => {
  beforeEach(() => {
    toastText.value = null;
  });

  const GNOCCHI = food('fd_gn', 'Potato gnocchi', {
    brand: "Trader Joe's",
    kind: 'packaged',
    kcal_100g: 160,
    protein_100g: 4,
    carbs_100g: 34,
    fat_100g: 0.5,
    servings_json: [{ name: 'cup', g: 140 }],
  });

  const sheetEl = () => screen.getByTestId('add-sheet');
  const search = (text: string) =>
    fireEvent.input(within(sheetEl()).getByTestId('add-search'), { target: { value: text } });
  const footer = () => within(sheetEl()).getByTestId('tray-save') as HTMLButtonElement;
  const trayRows = () => within(sheetEl()).queryAllByTestId('tray-row');
  /** Search, and tap the first result: it goes into the tray. */
  async function tapFirst(text: string) {
    search(text);
    fireEvent.click(within(sheetEl()).getAllByTestId('add-result')[0]);
    await settle();
  }
  const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  /** Hold every `logMeal` until released; the rest of the API answers as usual. */
  function holdLogMeal(api: ReturnType<typeof fakeApi>) {
    const orig = api.fetch.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    api.fetch.mockImplementation(async (url, init) => {
      if ((init?.body as URLSearchParams).get('action') === 'logMeal') await gate;
      return orig(url, init);
    });
    return release;
  }

  it('lays out the search, the status line, Recent, then Not here; the tray is absent and the button disabled', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(entry({ id: 'lg_y', date: '2026-11-01', food_id: 'fd_yog', unit: 'cup', kcal: 150 }));
    await open();
    const sheet = await addTo('Dinner');
    expect(within(sheet).getByRole('heading').textContent).toBe('Add to dinner');
    const field = within(sheet).getByTestId('add-search') as HTMLInputElement;
    expect(field.placeholder).toBe('Search foods, recipes, usuals');
    expect(document.activeElement).toBe(field);
    expect(within(sheet).queryByTestId('tray')).toBeNull();
    expect(footer().textContent).toBe('Tap foods to add them');
    expect(footer().disabled).toBe(true);
    const status = within(sheet).getByTestId('add-status');
    expect(status.getAttribute('role')).toBe('status');
    const recent = within(sheet).getByText('Recent');
    const here = within(sheet).getByTestId('not-here');
    expect(follows(field, status) && follows(status, recent) && follows(recent, here) && follows(here, footer())).toBe(
      true,
    );
  });

  it('one tap puts a food in the tray at the amount last logged: no sheet, no request, a check on its row', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(entry({ id: 'lg_y', date: '2026-11-01', food_id: 'fd_yog', unit: 'cup', qty: 2, kcal: 300 }));
    await open();
    const sheet = await addTo('Dinner');
    const row = within(sheet).getAllByTestId('add-result')[0];
    expect(row.textContent).toContain('2 cup · 300 kcal');
    expect(row.getAttribute('aria-label')).toBe('Greek yogurt, 2 cup, 300 kcal, add');
    const requests = api.sent.length;
    fireEvent.click(row);
    await settle();
    expect(api.sent.length).toBe(requests);
    expect(screen.queryByTestId('amount-sheet')).toBeNull();
    const tray = within(sheet).getByTestId('tray');
    expect(tray.textContent).toContain('Going into dinner');
    expect(within(tray).getByTestId('tray-total').textContent).toBe('1 · 300 kcal');
    expect(within(tray).getByTestId('tray-pill').textContent).toContain('2 cup');
    expect(within(tray).getByTestId('tray-row').className).toContain('is-fresh');
    expect(footer().textContent).toBe('Add 1 to dinner · 300 kcal');
    expect(footer().disabled).toBe(false);
    expect(within(sheet).getByTestId('add-status').textContent).toBe('Added Greek yogurt');
    // The tray sits above the lists, and the row shows its check.
    expect(follows(tray, within(sheet).getByText('Recent'))).toBe(true);
    const back = within(sheet).getAllByTestId('add-result')[0];
    expect(back.getAttribute('aria-label')).toBe('Greek yogurt, in the tray, edit');
    expect(back.querySelector('.log-row-plus')!.classList.contains('is-in')).toBe(true);

    // A second tap on the row opens that item's editor, and adds nothing.
    fireEvent.click(back);
    await settle();
    expect(trayRows()).toHaveLength(1);
    expect(within(sheet).getByTestId('tray-editor')).toBeDefined();
    expect(document.activeElement).toBe(within(sheet).getByTestId('tray-qty'));
    expect(api.sent.length).toBe(requests);
  });

  it('starts at the default when the last unit is gone, and a recipe at its last servings, else 1', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, BAR);
    api.recipes.push(STEW, recipe('rc_new', 'Brand new'));
    api.log.push(
      entry({ id: 'a', food_id: 'fd_yog', unit: 'scoop', qty: 3, kcal: 10, logged_at: '2026-11-01T10:00:00Z' }),
      entry({ id: 'b', recipe_id: 'rc_stew', unit: 'serving', qty: 1.5, kcal: 618, logged_at: '2026-11-01T11:00:00Z' }),
      entry({ id: 'c', food_id: 'fd_bar', unit: 'g', qty: 50, kcal: 237, logged_at: '2026-11-01T12:00:00Z' }),
    );
    await open();
    const sheet = await addTo('Dinner');
    const line = (name: string) =>
      within(sheet)
        .getAllByTestId('add-result')
        .find((r) => r.textContent!.includes(name))!
        .querySelector('.recipe-meta')!.textContent;
    expect(line('Greek yogurt')).toBe('1 cup · 150 kcal');
    expect(line('Beef Stew')).toBe('1½ servings · 618 kcal');
    expect(line('Nut bar')).toBe('50 g · 238 kcal');
    search('brand');
    expect(line('Brand new')).toBe('1 serving · 412 kcal');
  });

  it('the editor changes the amount and the unit with no request; the totals follow on the same tap; Remove takes it out', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    await addTo('Dinner');
    await tapFirst('greek');
    const sheet = sheetEl();
    const requests = api.sent.length;
    fireEvent.click(within(sheet).getByTestId('tray-row'));
    const editor = within(sheet).getByTestId('tray-editor');
    expect(within(sheet).getByTestId('tray-row').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(editor).getByRole('button', { name: 'More' }));
    expect(within(sheet).getByTestId('tray-pill').textContent).toContain('1½ cup');
    expect(within(sheet).getByTestId('tray-kcal').textContent).toBe('225 kcal');
    expect(within(sheet).getByTestId('tray-total').textContent).toBe('1 · 225 kcal');
    expect(footer().textContent).toBe('Add 1 to dinner · 225 kcal');
    expect(within(editor).getByTestId('tray-macros').textContent).toMatch(/^P .* C .* F /);
    // Grams keeps the weight: 1½ cup is 367 g, to the nearest 5.
    fireEvent.click(within(editor).getByRole('button', { name: 'grams' }));
    expect(within(sheet).getByTestId('tray-pill').textContent).toContain('370 g');
    expect(within(sheet).getByTestId('tray-total').textContent).toBe('1 · 226 kcal');
    fireEvent.click(within(editor).getByRole('button', { name: /^cup/ }));
    expect(within(sheet).getByTestId('tray-pill').textContent).toContain('1½ cup');
    expect(api.sent.length).toBe(requests);

    // Less stops at a quarter and stays focusable.
    const less = within(editor).getByRole('button', { name: 'Less' });
    for (let i = 0; i < 6; i++) fireEvent.click(less);
    expect(within(sheet).getByTestId('tray-qty').textContent).toBe('¼');
    expect(less.getAttribute('aria-disabled')).toBe('true');
    expect((less as HTMLButtonElement).disabled).toBe(false);

    // Tapping the row again closes the editor.
    fireEvent.click(within(sheet).getByTestId('tray-row'));
    expect(within(sheet).queryByTestId('tray-editor')).toBeNull();

    fireEvent.click(within(sheet).getByTestId('tray-row'));
    fireEvent.click(within(sheet).getByTestId('tray-remove'));
    expect(within(sheet).queryByTestId('tray')).toBeNull();
    expect(footer().disabled).toBe(true);
    expect(within(sheet).getByTestId('add-status').textContent).toBe('Removed Greek yogurt');
    search('greek');
    expect(within(sheet).getAllByTestId('add-result')[0].getAttribute('aria-label')).toMatch(/add$/);
  });

  it('search shows foods and recipes; adding from the results clears the search and keeps focus, with the tray above', async () => {
    const api = fakeApi();
    api.foods.push(GNOCCHI, YOGURT, BAR);
    await open();
    const sheet = await addTo('Dinner');
    await tapFirst('greek');
    expect((within(sheet).getByTestId('add-search') as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(within(sheet).getByTestId('add-search'));
    search('gnocchi');
    expect(within(sheet).getByText('Foods')).toBeDefined();
    expect(follows(within(sheet).getByTestId('tray'), within(sheet).getByTestId('results-list'))).toBe(true);
    fireEvent.click(within(sheet).getAllByTestId('add-result')[0]);
    await settle();
    expect(trayRows().map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Greek yogurt',
      "Trader Joe's Potato gnocchi",
    ]);
    expect(within(sheet).getByTestId('tray-total').textContent).toBe('2 · 374 kcal');
    expect(footer().textContent).toBe('Add 2 to dinner · 374 kcal');
    expect(api.calls('logMeal')).toHaveLength(0);
  });

  it('saving sends one logMeal in tray order with fixed ids and closes at once; the day shows the rows muted until it answers', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, BAR);
    await open();
    await addTo('Dinner');
    await tapFirst('greek');
    await tapFirst('nut bar');
    const release = holdLogMeal(api);
    fireEvent.click(footer());
    await act(async () => {});
    // Gone before the answer, focus back on its Add row.
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.activeElement).toBe(within(card('Dinner')).getByTestId('add-to-meal'));
    const pending = within(card('Dinner')).getAllByTestId('pending-row');
    expect(pending).toHaveLength(2);
    expect(pending.map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Greek yogurt',
      'Kindly Nut bar',
    ]);
    for (const r of pending) {
      expect(r.textContent).toContain('Saving…');
      expect(r.querySelector('.is-pending')).not.toBeNull();
      expect(r.querySelector('button')).toBeNull();
    }
    // Not in the totals until they land.
    expect(within(card('Dinner')).queryByTestId('meal-total')).toBeNull();
    expect(entriesIn('Dinner')).toHaveLength(0);

    release();
    await settle();
    const sent = api.calls('logMeal');
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ date: TODAY, slot: 'Dinner' });
    expect(sent[0].payload.items).toEqual([
      { id: expect.stringMatching(/^lg_[0-9a-f]{8}$/), food_id: 'fd_yog', qty: 1, unit: 'cup' },
      { id: expect.stringMatching(/^lg_[0-9a-f]{8}$/), food_id: 'fd_bar', qty: 1, unit: 'bar' },
    ]);
    // The stored entries take the pending rows' place, with no Saving….
    expect(within(card('Dinner')).queryAllByTestId('pending-row')).toHaveLength(0);
    expect(entriesIn('Dinner').map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Greek yogurt',
      'Kindly Nut bar',
    ]);
    expect(card('Dinner').textContent).not.toContain('Saving…');
    expect(kcal()).toBe('340');
    const toast = screen.getByTestId('toast');
    expect(toast.textContent).toBe('Added 2 to dinnerUndo');

    // Undo deletes exactly those entries.
    const ids = api.log.map((e) => e.id);
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(api.calls('deleteLogEntry').at(-1)!.payload).toEqual({ ids });
    expect(entriesIn('Dinner')).toHaveLength(0);
    // Nothing is left of the pending meal to show again.
    expect(within(card('Dinner')).queryAllByTestId('pending-row')).toHaveLength(0);
    expect(screen.getByTestId('toast').textContent).toBe('Removed 2 from dinner');
  });

  it('a second tap on the footer cannot send two writes', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    await open();
    await addTo('Dinner');
    await tapFirst('greek');
    const button = footer();
    fireEvent.click(button);
    fireEvent.click(button);
    await settle();
    expect(api.calls('logMeal')).toHaveLength(1);
    expect(api.log).toHaveLength(1);
  });

  it('a failed write keeps the rows under Couldn’t save, Try again sends the same ids, and Discard removes them', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, BAR);
    await open();
    const payloads: any[] = [];
    let failing = true;
    const orig = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation(async (url, init) => {
      const body = init?.body as URLSearchParams;
      if (body.get('action') === 'logMeal') {
        payloads.push(JSON.parse(body.get('payload')!));
        if (failing) return { json: async () => ({ success: false, error: 'Network error' }) } as Response;
      }
      return orig(url, init);
    });
    await addTo('Dinner');
    await tapFirst('greek');
    await tapFirst('nut bar');
    fireEvent.click(footer());
    await settle();
    const failed = within(card('Dinner')).getByTestId('pending-failed');
    expect(failed.textContent).toContain("Couldn't save 2 items.");
    expect(within(failed).getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(within(card('Dinner')).getAllByTestId('pending-row')).toHaveLength(2);
    expect(card('Dinner').textContent).not.toContain('Saving…');
    expect(entriesIn('Dinner')).toHaveLength(0);

    failing = false;
    fireEvent.click(within(failed).getByTestId('pending-retry'));
    await settle();
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    expect(within(card('Dinner')).queryByTestId('pending-failed')).toBeNull();
    expect(entriesIn('Dinner')).toHaveLength(2);
    expect(api.log).toHaveLength(2);

    // Sending the same call again (a write that landed but lost its answer) leaves one copy of each.
    await addTo('Snacks');
    await tapFirst('greek');
    failing = true;
    fireEvent.click(footer());
    await settle();
    fireEvent.click(within(card('Snacks')).getByTestId('pending-discard'));
    await settle();
    expect(within(card('Snacks')).queryAllByTestId('pending-row')).toHaveLength(0);
    expect(entriesIn('Snacks')).toHaveLength(0);
    expect(api.log).toHaveLength(2);
  });

  it('closing with items asks first: Keep adding, Discard and Add each do what they say', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, BAR);
    await open();
    // An empty tray closes straight away.
    await addTo('Dinner');
    fireEvent.click(within(sheetEl()).getByRole('button', { name: 'Close' }));
    await settle();
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(screen.queryByTestId('close-prompt')).toBeNull();

    await addTo('Dinner');
    await tapFirst('greek');
    fireEvent.click(within(sheetEl()).getByRole('button', { name: 'Close' }));
    await settle();
    let prompt = screen.getByTestId('close-prompt');
    expect(prompt.getAttribute('role')).toBe('alertdialog');
    expect(within(prompt).getByRole('heading').textContent).toBe('Add 1 item to dinner?');
    expect(prompt.textContent).toContain("They're in the tray but not saved yet.");
    expect(
      within(prompt)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Discard', 'Keep adding', 'Add 1']);
    expect(document.activeElement).toBe(within(prompt).getByTestId('prompt-add'));

    // Escape and Keep adding both close the prompt and keep the tray.
    fireEvent.keyDown(prompt, { key: 'Escape' });
    await settle();
    expect(screen.queryByTestId('close-prompt')).toBeNull();
    expect(trayRows()).toHaveLength(1);
    fireEvent.keyDown(sheetEl(), { key: 'Escape' });
    await settle();
    fireEvent.click(within(screen.getByTestId('close-prompt')).getByTestId('prompt-keep'));
    await settle();
    expect(screen.queryByTestId('close-prompt')).toBeNull();
    expect(screen.getByTestId('add-sheet')).toBeDefined();
    expect(trayRows()).toHaveLength(1);

    // Discard closes the sheet, drops the tray and writes nothing.
    fireEvent.click(document.querySelector('.sheet-overlay')!);
    await settle();
    fireEvent.click(within(screen.getByTestId('close-prompt')).getByTestId('prompt-discard'));
    await settle();
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(api.calls('logMeal')).toHaveLength(0);
    await addTo('Dinner');
    expect(within(sheetEl()).queryByTestId('tray')).toBeNull();

    // Add does what the footer does.
    await tapFirst('greek');
    await tapFirst('nut bar');
    fireEvent.click(within(sheetEl()).getByRole('button', { name: 'Close' }));
    await settle();
    prompt = screen.getByTestId('close-prompt');
    expect(within(prompt).getByRole('heading').textContent).toBe('Add 2 items to dinner?');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Add 2' }));
    await settle();
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(api.calls('logMeal')).toHaveLength(1);
    expect(entriesIn('Dinner')).toHaveLength(2);
  });

  it('at 30 items every add is disabled and the status line says so; removing one frees them', async () => {
    const api = fakeApi();
    const make = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) =>
        food(`fd_${prefix}${i}`, `${prefix} ${String(i).padStart(2, '0')}`, {
          kcal_100g: 100,
          protein_100g: 1,
          carbs_100g: 1,
          fat_100g: 1,
          servings_json: [{ name: 'cup', g: 100 }],
        }),
      );
    api.foods.push(...make('alpha', 20), ...make('beta', 11));
    await open();
    await addTo('Dinner');
    for (let i = 0; i < 20; i++) {
      search('alpha');
      fireEvent.click(within(sheetEl()).getAllByTestId('add-result')[i]);
    }
    for (let i = 0; i < 10; i++) {
      search('beta');
      fireEvent.click(within(sheetEl()).getAllByTestId('add-result')[i]);
    }
    await settle();
    expect(trayRows()).toHaveLength(30);
    search('beta');
    const rows = within(sheetEl()).getAllByTestId('add-result') as HTMLButtonElement[];
    expect(rows[10].disabled).toBe(true);
    expect(rows[0].disabled).toBe(false);
    expect(within(sheetEl()).getByTestId('add-status').textContent).toBe('A meal can hold 30 items at a time.');
    expect(footer().textContent).toBe('Add 30 to dinner · 3,000 kcal');

    fireEvent.click(trayRows()[0]);
    fireEvent.click(within(sheetEl()).getByTestId('tray-remove'));
    expect((within(sheetEl()).getAllByTestId('add-result')[10] as HTMLButtonElement).disabled).toBe(false);
    expect(within(sheetEl()).getByTestId('add-status').textContent).toBe('Removed alpha 00');
  });

  it('a partial recipe reads 68+ kcal in the total, and a recipe edits in servings', async () => {
    const api = fakeApi();
    api.recipes.push(
      recipe('rc_p', 'Banana Bread', {
        partial: true,
        nutrition: { per_serving: { kcal: 68, protein_g: 1, carbs_g: 9, fat_g: 3 }, missing: [], partial: true },
      }),
    );
    await open();
    await addTo('Lunch');
    await tapFirst('bread');
    expect(within(sheetEl()).getByTestId('tray-total').textContent).toBe('1 · 68+ kcal');
    expect(footer().textContent).toBe('Add 1 to lunch · 68+ kcal');
    fireEvent.click(trayRows()[0]);
    const editor = within(sheetEl()).getByTestId('tray-editor');
    expect(within(editor).queryByRole('group', { name: 'Unit' })).toBeNull();
    fireEvent.click(within(editor).getByRole('button', { name: 'More' }));
    expect(within(sheetEl()).getByTestId('tray-pill').textContent).toContain('1½ servings');
    fireEvent.click(footer());
    await settle();
    expect(api.log[0]).toMatchObject({ recipe_id: 'rc_p', qty: 1.5, unit: 'serving', kcal: 102 });
    expect(entriesIn('Lunch')[0].textContent).toContain('1.5 servings · partial');
  });

  it('works the same in demo mode', async () => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
    try {
      await open(true);
      const before = entriesIn('Snacks').length;
      await addTo('Snacks');
      await tapFirst('yog');
      expect(trayRows()).toHaveLength(1);
      fireEvent.click(footer());
      await settle();
      expect(entriesIn('Snacks')).toHaveLength(before + 1);
      expect(screen.getByTestId('toast').textContent).toMatch(/^Added /);
    } finally {
      delete env.VITE_DEMO_MODE;
      _resetDemoModeCache();
      _resetDemoApi();
    }
  });

  it('an entry opened from the day keeps its meal chips', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(entry({ food_id: 'fd_yog', unit: 'cup', grams: 245, kcal: 149.9 }));
    await open();
    fireEvent.click(openOf(entriesIn('Breakfast')[0]));
    await settle();
    expect(within(screen.getByTestId('amount-sheet')).getByRole('button', { name: 'Lunch' })).toBeDefined();
  });
});
