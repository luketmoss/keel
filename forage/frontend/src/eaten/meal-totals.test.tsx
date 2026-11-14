// #866: the meal cards' kcal, split bar and macro line, from getFoodLogTotals with by_meal (#865).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { FoodLogEntry, FoodLogMeal, Slot } from '../api/types';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { _resetEaten, dayMeals } from './eaten-store';
import { mealGrams, mealMg } from './format';

const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function open() {
  window.history.replaceState(null, '', '/#/eaten');
  render(<App />);
  await settle();
}

function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Breakfast',
    food_id: 'fd_x',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: 1,
    kcal: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    partial: false,
    source: 'app',
    logged_at: '2026-11-02T15:00:00Z',
    created: 'x',
    updated: 'x',
    ...over,
  };
}

function meal(slot: Slot, over: Partial<FoodLogMeal> = {}): FoodLogMeal {
  return {
    slot,
    entries: 1,
    unknown_entries: 0,
    kcal: 412,
    protein_g: 22,
    carbs_g: 36,
    fat_g: 16,
    partial: false,
    sodium_mg: 160,
    fiber_g: 4,
    unknown: { sodium_mg: 0, fiber_g: 0 },
    ...over,
  };
}

/** A fake API whose day has these entries and these `meals`; `meals` undefined answers without the field. */
function withMeals(entries: Partial<FoodLogEntry>[], meals: FoodLogMeal[] | undefined) {
  const api = fakeApi();
  api.foods.push({
    id: 'fd_x',
    name: 'Oats',
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: 100,
    protein_100g: 5,
    carbs_100g: 10,
    fat_100g: 2,
    servings_json: null,
    source: 'manual',
    created: '',
    updated: '',
  });
  api.log.push(...entries.map((e, i) => entry({ id: `lg_${i}`, ...e })));
  api.answer('getFoodLogTotals', () => ({
    success: true,
    data: {
      from: TODAY,
      to: TODAY,
      days: [
        {
          date: TODAY,
          entries: entries.length,
          unknown_entries: 0,
          kcal: 500,
          protein_g: 30,
          carbs_g: 40,
          fat_g: 20,
          partial: false,
          ...(meals ? { meals } : {}),
        },
      ],
    },
  }));
  return api;
}

const card = (slot: string) =>
  screen.getAllByTestId('meal-card').find((c) => c.querySelector('h2')!.textContent === slot)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('figures', () => {
  it('never shows a real value as 0', () => {
    expect(mealGrams(22.4)).toBe('22 g');
    expect(mealGrams(0.3)).toBe('<1 g');
    expect(mealGrams(0)).toBe('0 g');
    expect(mealMg(0.4)).toBe('<1 mg');
    expect(mealMg(1840)).toBe('1,840 mg');
  });
});

describe('meal card totals', () => {
  it("asks for by_meal and keeps the day's meals", async () => {
    const api = withMeals([{}], [meal('Breakfast')]);
    await open();
    expect(api.calls('getFoodLogTotals')[0].params.get('by_meal')).toBe('true');
    expect(dayMeals.value.map((m) => m.slot)).toEqual(['Breakfast']);
  });

  it('shows kcal, the bar and the line on a complete meal, and nothing on an empty one', async () => {
    withMeals([{}], [meal('Breakfast', { kcal: 1240 })]);
    await open();
    const c = card('Breakfast');
    expect(within(c).getByTestId('meal-kcal').textContent).toBe('1,240 kcal');
    expect(within(c).queryByText('Low')).toBeNull();
    expect(within(c).getByTestId('macro-bar').className).toContain('macro-bar-meal');
    expect(within(c).getByTestId('macro-bar').getAttribute('aria-label')).toMatch(/^Calories by macro: protein/);
    expect(within(c).getByTestId('meal-line').textContent).toBe('P 22 g · C 36 g · F 16 g | Sodium 160 mg · Fiber 4 g');
    const lunch = card('Lunch');
    expect(within(lunch).queryByTestId('meal-total')).toBeNull();
    expect(within(lunch).queryByTestId('meal-totals')).toBeNull();
    expect(within(lunch).getByTestId('add-to-meal')).toBeTruthy();
  });

  it('shows Low on a partial meal only, with its accessible name', async () => {
    withMeals([{}, { slot: 'Lunch' }], [meal('Breakfast'), meal('Lunch', { partial: true })]);
    await open();
    expect(within(card('Breakfast')).queryByText('Low')).toBeNull();
    const chip = within(card('Lunch')).getByText('Low');
    expect(chip.getAttribute('aria-label')).toBe('Low: some entries have no nutrition or are missing ingredients');
  });

  it('reads a + for a partly known extra, and — for an unknown one', async () => {
    withMeals(
      [{}],
      [meal('Breakfast', { sodium_mg: 300, unknown: { sodium_mg: 1, fiber_g: 0 }, fiber_g: null, protein_g: 0.3 })],
    );
    await open();
    const line = within(card('Breakfast')).getByTestId('meal-line');
    expect(line.textContent).toBe('P <1 g · C 36 g · F 16 g | Sodium 300+ mg · Fiber —');
    expect(within(line).getByRole('img', { name: 'not known' })).toBeTruthy();
  });

  it('a meal whose entries all lack nutrition shows — and a sentence, no bar and no line', async () => {
    withMeals(
      [{ kcal: null }],
      [
        meal('Breakfast', {
          kcal: null,
          protein_g: null,
          carbs_g: null,
          fat_g: null,
          sodium_mg: null,
          fiber_g: null,
          unknown_entries: 1,
          partial: true,
        }),
      ],
    );
    await open();
    const c = card('Breakfast');
    expect(within(c).getByRole('img', { name: 'not known' }).textContent).toBe('—');
    expect(within(c).queryByTestId('macro-bar')).toBeNull();
    expect(within(c).queryByTestId('meal-none')?.textContent).toBe('None of these entries has nutrition yet.');
    expect(within(c).queryByText('Low')).toBeNull();
  });

  it('kcal known with all macros 0 shows the empty bar and zeros', async () => {
    withMeals([{}], [meal('Breakfast', { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })]);
    await open();
    const c = card('Breakfast');
    expect(within(c).getByTestId('macro-empty')).toBeTruthy();
    expect(within(c).getByTestId('meal-line').textContent).toContain('P 0 g · C 0 g · F 0 g');
  });

  it('an entry whose slot has no meals row, and a meals row with no entries, show no totals', async () => {
    withMeals([{ slot: 'Lunch' }], [meal('Dinner')]);
    await open();
    expect(within(card('Lunch')).queryByTestId('meal-total')).toBeNull();
    expect(within(card('Lunch')).queryByTestId('meal-totals')).toBeNull();
    expect(within(card('Lunch')).queryByRole('img', { name: 'not known' })).toBeNull();
    expect(within(card('Dinner')).queryByTestId('meal-total')).toBeNull();
  });

  it('an answer without meals leaves the cards as they were', async () => {
    withMeals([{}], undefined);
    await open();
    expect(within(card('Breakfast')).queryByTestId('meal-total')).toBeNull();
    expect(within(card('Breakfast')).queryByTestId('meal-totals')).toBeNull();
    expect(within(card('Breakfast')).getAllByTestId('entry-row')).toHaveLength(1);
  });

  it('keeps the bar and line in select mode', async () => {
    withMeals([{}], [meal('Breakfast')]);
    await open();
    fireEvent.click(within(card('Breakfast')).getByTestId('select-meal'));
    await settle();
    expect(within(card('Breakfast')).getByTestId('meal-totals')).toBeTruthy();
    expect(within(card('Breakfast')).getByTestId('meal-kcal').textContent).toBe('412 kcal');
  });
});
