// #884: copy a meal to another day, or repeat the last one: the "Same as…" suggestion, the meal's ⋯ menu, the Copy
// sheet, Copy from another day…, and Undo. The API's own copy rules are in apps-script/tests/groups.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { Food, FoodLogEntry } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { toastAction, toastText } from '../ui/toast';
import { _resetLookback, chipDays, chipLabel, copiedToast, dayWord, mealSummary, pulledToast } from './copy-meal';
import { _resetEaten } from './eaten-store';

const env = import.meta.env as Record<string, string | undefined>;
// Monday 2 November 2026, 10:00 on the device.
const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';
const YESTERDAY = '2026-11-01';
const THURSDAY = '2026-10-29';

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
    kcal_100g: 100,
    protein_100g: 5,
    carbs_100g: 10,
    fat_100g: 2,
    servings_json: null,
    source: 'manual',
    created: '',
    updated: '',
    ...over,
  };
}

const OATS = food('fd_oats', 'Oats');
const MILK = food('fd_milk', 'Milk', { short_name: 'Milk' });
const BREAD = food('fd_bread', 'Seeded bread loaf', { short_name: 'Bread' });
const TURKEY = food('fd_turkey', 'Turkey');

let n = 0;
function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  n++;
  return {
    id: `lg_${n}`,
    date: TODAY,
    slot: 'Breakfast',
    food_id: '',
    recipe_id: '',
    qty: 100,
    unit: 'g',
    grams: 100,
    kcal: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    partial: false,
    source: 'app',
    logged_at: `2026-11-01T0${n % 10}:00:00Z`,
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
  n = 0;
  _resetEaten();
  _resetLookback();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
  toastText.value = null;
  toastAction.value = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const card = (slot: string) =>
  screen.getAllByTestId('meal-card').find((c) => c.querySelector('h2')!.textContent === slot)!;
const entriesIn = (slot: string) => within(card(slot)).queryAllByTestId('entry-row');
const toast = () => screen.getByTestId('toast').textContent;

/** A fake log: yesterday's oatmeal (a group of two foods) and Thursday's lunch. */
function seed() {
  const api = fakeApi();
  api.foods.push(OATS, MILK, BREAD, TURKEY);
  api.log.push(
    entry({ id: 'lg_o1', date: YESTERDAY, food_id: 'fd_oats', kcal: 300, group_id: 'gr_1', group_name: 'Oatmeal' }),
    entry({ id: 'lg_o2', date: YESTERDAY, food_id: 'fd_milk', kcal: 118, group_id: 'gr_1', group_name: 'Oatmeal' }),
    entry({ id: 'lg_t1', date: THURSDAY, slot: 'Lunch', food_id: 'fd_bread', kcal: 200 }),
    entry({ id: 'lg_t2', date: THURSDAY, slot: 'Lunch', food_id: 'fd_turkey', kcal: 246 }),
  );
  return api;
}

describe('the helpers', () => {
  it('word a day and a copy as the design note does', () => {
    expect([dayWord(YESTERDAY, TODAY), dayWord(THURSDAY, TODAY)]).toEqual(['yesterday', 'Thursday']);
    expect(pulledToast(YESTERDAY, TODAY, 'Breakfast', 4)).toBe("Copied yesterday's breakfast · 4 items");
    expect(pulledToast(THURSDAY, TODAY, 'Lunch', 1)).toBe("Copied Thursday's lunch · 1 item");
    expect(copiedToast(TODAY, TODAY, 'Lunch', 4)).toBe("Copied 4 items to today's lunch");
    expect(copiedToast('2026-10-25', TODAY, 'After dinner', 2)).toBe("Copied 2 items to Sun 25 Oct's after dinner");
    expect(chipDays(TODAY).map((d) => chipLabel(d, TODAY))).toEqual([
      'Today',
      'Yesterday',
      'Sat 31',
      'Fri 30',
      'Thu 29',
      'Wed 28',
      'Tue 27',
    ]);
  });

  it('names the group and the foods, short names first, then the calories; none known omits them', () => {
    const e = [
      entry({ food_id: 'fd_oats', kcal: 300, group_name: 'Oatmeal' }),
      entry({ food_id: 'fd_bread', kcal: 118 }),
    ];
    expect(mealSummary(e, [OATS, BREAD], [])).toBe('Oatmeal · Oats, Bread · 418 kcal');
    expect(mealSummary([entry({ food_id: 'fd_oats', kcal: null })], [OATS], [])).toBe('Oats');
  });
});

describe('pull: Same as yesterday', () => {
  it('shows on an empty meal with the foods and the calories; one tap copies, grouped, with Undo that removes exactly them', async () => {
    const api = seed();
    api.log.push(entry({ id: 'lg_keep', slot: 'Snacks', food_id: 'fd_oats' }));
    await open();
    const suggest = within(card('Breakfast')).getByTestId('same-as');
    expect(suggest.textContent).toContain('Same as yesterday');
    expect(within(suggest).getByTestId('same-as-names').textContent).toBe('Oatmeal · Oats, Milk · 418 kcal');
    // Lunch had nothing in the week but Thursday's: its own suggestion names the weekday; Dinner has none.
    expect(within(card('Lunch')).getByTestId('same-as').textContent).toContain('Same as Thursday');
    expect(within(card('Dinner')).queryByTestId('same-as')).toBeNull();
    // A meal with entries does not offer it.
    expect(within(card('Snacks')).queryByTestId('same-as')).toBeNull();

    fireEvent.click(suggest);
    await settle();
    expect(api.calls('copyMeal')[0].payload).toEqual({
      from_date: YESTERDAY,
      from_slot: 'Breakfast',
      to_date: TODAY,
      to_slot: 'Breakfast',
    });
    expect(entriesIn('Breakfast')).toHaveLength(2);
    expect(within(card('Breakfast')).queryByTestId('same-as')).toBeNull();
    expect(toast()).toContain("Copied yesterday's breakfast · 2 items");
    const made = api.log.filter((e) => e.id.startsWith('lg_c')).map((e) => e.id);
    expect(made).toHaveLength(2);

    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(api.calls('deleteLogEntry')[0].payload).toEqual({ ids: made });
    expect(entriesIn('Breakfast')).toHaveLength(0);
    // Nothing else was touched.
    expect(api.log.map((e) => e.id).sort()).toEqual(['lg_keep', 'lg_o1', 'lg_o2', 'lg_t1', 'lg_t2']);
    expect(within(card('Breakfast')).getByTestId('same-as')).toBeDefined();
  });

  it('is not offered beyond 7 days, and not while another day is shown without a meal that week', async () => {
    const api = fakeApi();
    api.foods.push(OATS);
    api.log.push(entry({ date: '2026-10-25', food_id: 'fd_oats' }));
    await open();
    expect(screen.queryAllByTestId('same-as')).toHaveLength(0);
    expect(api.calls('getFoodLog').some((c) => c.params.get('from') === '2026-10-26')).toBe(true);
  });

  it('a failed pull keeps the suggestion and says so in a toast', async () => {
    const api = seed();
    api.answer('copyMeal', () => ({ success: false, error: 'offline' }));
    await open();
    fireEvent.click(within(card('Breakfast')).getByTestId('same-as'));
    await settle();
    expect(toast()).toBe("Couldn't copy yesterday's breakfast. Try again.");
    expect(within(card('Breakfast')).getByTestId('same-as')).toBeDefined();
    expect(entriesIn('Breakfast')).toHaveLength(0);
  });

  it('a second tap while a copy is out does nothing', async () => {
    const api = seed();
    await open();
    const suggest = within(card('Breakfast')).getByTestId('same-as');
    fireEvent.click(suggest);
    fireEvent.click(suggest);
    await settle();
    expect(api.calls('copyMeal')).toHaveLength(1);
    expect(entriesIn('Breakfast')).toHaveLength(2);
  });

  it('Undo failing says the copied items are still there', async () => {
    const api = seed();
    await open();
    fireEvent.click(within(card('Breakfast')).getByTestId('same-as'));
    await settle();
    api.answer('deleteLogEntry', () => ({ success: false, error: 'offline' }));
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(toast()).toBe("Couldn't undo. The copied items are still there.");
    expect(entriesIn('Breakfast')).toHaveLength(2);
  });
});

describe('the meal menu', () => {
  it('replaces Select with ⋯, holding Copy to…, Select and Copy from another day…', async () => {
    seed();
    await open();
    expect(screen.queryByTestId('select-meal')).toBeNull();
    const menu = within(card('Lunch')).getByTestId('meal-menu') as HTMLButtonElement;
    expect(menu.getAttribute('aria-label')).toBe('More for lunch');
    fireEvent.click(menu);
    const sheet = screen.getByTestId('meal-menu-sheet');
    expect(within(sheet).getByTestId('menu-copy-to').textContent).toContain('Copy to…');
    expect(within(sheet).getByTestId('menu-select').textContent).toContain('Select');
    expect(within(sheet).getByTestId('menu-copy-from').textContent).toContain("Pick a day's lunch to bring here");
    // Lunch is empty today: Copy to… is disabled and says why.
    expect(within(sheet).getByTestId('menu-copy-to').getAttribute('aria-disabled')).toBe('true');
    expect(within(sheet).getByTestId('menu-copy-to').textContent).toContain('Nothing to copy yet');
    fireEvent.click(within(sheet).getByTestId('menu-copy-to'));
    expect(screen.queryByTestId('copy-sheet')).toBeNull();
  });

  it('Select enters select mode as before', async () => {
    const api = seed();
    api.log.push(entry({ id: 'lg_b', food_id: 'fd_oats' }));
    await open();
    fireEvent.click(within(card('Breakfast')).getByTestId('meal-menu'));
    fireEvent.click(screen.getByTestId('menu-select'));
    expect(screen.queryByTestId('meal-menu-sheet')).toBeNull();
    expect(within(card('Breakfast')).getByTestId('select-cancel').textContent).toBe('Cancel');
    expect(within(card('Breakfast')).getAllByTestId('select-row')).toHaveLength(1);
  });

  it('the ⋯ button is 44px', async () => {
    const css = readGlobalCss();
    expect(rule(css, '.icon-btn')).toMatch(/width: var\(--touch-target\)/);
    expect(rule(css, '.toast-action')).toMatch(/min-height: var\(--touch-target\)/);
  });
});

describe('push: Copy to…', () => {
  async function openCopy(slot: string) {
    fireEvent.click(within(card(slot)).getByTestId('meal-menu'));
    fireEvent.click(screen.getByTestId('menu-copy-to'));
    await settle();
    return screen.getByTestId('copy-sheet');
  }

  it("copies Thursday's lunch to today's lunch after what is there, with the toast and Undo", async () => {
    const api = seed();
    api.log.push(entry({ id: 'lg_now', slot: 'Lunch', food_id: 'fd_oats', logged_at: '2026-11-02T08:00:00Z' }));
    await open();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
      await settle();
    }
    expect(screen.getByTestId('eaten-day').textContent).toBe('Thu 29 Oct');
    const sheet = await openCopy('Lunch');
    expect(sheet.querySelector('h2')!.textContent).toBe('Copy lunch');
    expect(within(sheet).getByTestId('copy-summary').textContent).toBe('2 items · 446 kcal · Bread, Turkey');
    expect(
      within(sheet)
        .getAllByTestId('copy-day-chip')
        .map((c) => c.textContent),
    ).toEqual(['Today', 'Yesterday', 'Sat 31', 'Fri 30', 'Thu 29', 'Wed 28', 'Tue 27']);
    expect(within(sheet).getByTestId('copy-pick-date').textContent).toBe('Pick a date…');
    expect(within(sheet).getByTestId('copy-go').textContent).toBe('Copy 2 items to today');
    expect(sheet.textContent).toContain("Adds to what's there already; nothing is replaced.");
    fireEvent.click(within(sheet).getByTestId('copy-go'));
    await settle();
    expect(api.calls('copyMeal')[0].payload).toEqual({
      from_date: THURSDAY,
      from_slot: 'Lunch',
      to_date: TODAY,
      to_slot: 'Lunch',
    });
    expect(screen.queryByTestId('copy-sheet')).toBeNull();
    expect(toast()).toContain("Copied 2 items to today's lunch");
    // Thursday is on screen, so nothing there changed; today's lunch has its three, the new ones after.
    expect(entriesIn('Lunch')).toHaveLength(2);
    expect(api.log.filter((e) => e.date === TODAY && e.slot === 'Lunch')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(api.log.filter((e) => e.date === TODAY && e.slot === 'Lunch').map((e) => e.id)).toEqual(['lg_now']);
  });

  it('copies to another meal on the day on screen and the entries appear without a reload', async () => {
    const api = seed();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    const sheet = await openCopy('Breakfast');
    fireEvent.click(within(sheet).getAllByTestId('copy-day-chip')[1]);
    fireEvent.click(within(sheet).getAllByTestId('copy-meal-chip')[2]);
    expect(within(sheet).getByTestId('copy-go').textContent).toBe('Copy 2 items to yesterday');
    const before = api.calls('getFoodLog').length;
    fireEvent.click(within(sheet).getByTestId('copy-go'));
    await settle();
    expect(toast()).toContain("Copied 2 items to yesterday's dinner");
    expect(entriesIn('Dinner')).toHaveLength(2);
    expect(within(card('Dinner')).getAllByTestId('entry-row')[0].textContent).toContain('Oats');
    // The entries came from the write's own reply: no read for them, the quiet refresh reads the day only.
    expect(api.calls('getFoodLog').length - before).toBeLessThanOrEqual(1);
  });

  it('no day after today can be chosen, and Pick a date… takes a date up to today', async () => {
    const api = seed();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    const sheet = await openCopy('Breakfast');
    fireEvent.click(within(sheet).getByTestId('copy-pick-date'));
    const date = within(sheet).getByTestId('copy-date') as HTMLInputElement;
    expect(date.max).toBe(TODAY);
    fireEvent.input(date, { target: { value: '2026-11-03' } });
    expect(within(sheet).getByTestId('copy-go').textContent).toBe('Copy 2 items to today');
    fireEvent.input(date, { target: { value: '2026-10-19' } });
    expect(within(sheet).getByTestId('copy-go').textContent).toBe('Copy 2 items to Mon 19 Oct');
    expect(within(sheet).getByTestId('copy-pick-date').textContent).toBe('Mon 19 Oct');
    fireEvent.click(within(sheet).getByTestId('copy-go'));
    await settle();
    expect(api.calls('copyMeal')[0].payload).toMatchObject({ to_date: '2026-10-19' });
    expect(toast()).toContain("Copied 2 items to Mon 19 Oct's breakfast");
  });

  it('a failed copy keeps the sheet open with the message; the button is busy and a second tap does nothing', async () => {
    const api = seed();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    const sheet = await openCopy('Breakfast');
    api.answer('copyMeal', () => ({ success: false, error: 'offline' }));
    const go = within(sheet).getByTestId('copy-go');
    fireEvent.click(go);
    fireEvent.click(go);
    expect(go.getAttribute('aria-busy')).toBe('true');
    expect(go.textContent).toBe('Copying…');
    await settle();
    expect(api.calls('copyMeal')).toHaveLength(1);
    expect(screen.getByTestId('copy-sheet')).toBeDefined();
    expect(within(screen.getByTestId('copy-sheet')).getByTestId('copy-error').textContent).toBe(
      "Couldn't copy. Try again.",
    );
    expect(go.getAttribute('aria-busy')).toBe('false');
  });
});

describe('Copy from another day…', () => {
  async function openFrom(slot: string) {
    fireEvent.click(within(card(slot)).getByTestId('meal-menu'));
    fireEvent.click(screen.getByTestId('menu-copy-from'));
    await settle();
    return screen.getByTestId('copy-from-sheet');
  }

  it('lists the recent days with that meal, newest first, and tapping one copies it here', async () => {
    const api = seed();
    api.log.push(entry({ id: 'lg_b0', date: '2026-10-30', food_id: 'fd_oats', kcal: 100 }));
    api.log.push(entry({ id: 'lg_now', food_id: 'fd_milk' }));
    await open();
    const sheet = await openFrom('Breakfast');
    const days = within(sheet).getAllByTestId('copy-from-day');
    expect(days.map((d) => d.textContent)).toEqual([
      'YesterdayOatmeal · Oats, Milk · 418 kcal',
      'Fri 30 OctOats · 100 kcal',
    ]);
    fireEvent.click(days[1]);
    await settle();
    expect(api.calls('copyMeal')[0].payload).toEqual({
      from_date: '2026-10-30',
      from_slot: 'Breakfast',
      to_date: TODAY,
      to_slot: 'Breakfast',
    });
    expect(screen.queryByTestId('copy-from-sheet')).toBeNull();
    expect(entriesIn('Breakfast')).toHaveLength(2);
    expect(toast()).toContain("Copied Friday's breakfast · 1 item");
  });

  it('says so when none of the 7 days has the meal, and a failure keeps the sheet open', async () => {
    const api = seed();
    await open();
    let sheet = await openFrom('Snacks');
    expect(within(sheet).getByTestId('copy-from-empty').textContent).toBe('No snacks in the last 7 days.');
    fireEvent.keyDown(sheet, { key: 'Escape' });

    sheet = await openFrom('Breakfast');
    api.answer('copyMeal', () => ({ success: false, error: 'offline' }));
    fireEvent.click(within(sheet).getByTestId('copy-from-day'));
    await settle();
    expect(within(screen.getByTestId('copy-from-sheet')).getByTestId('copy-error').textContent).toBe(
      "Couldn't copy. Try again.",
    );
  });
});

describe('demo mode', () => {
  it("copies demo yesterday's breakfast into today with no network call, and Undo takes it back", async () => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await open(true);
      const before = entriesIn('Breakfast').length;
      fireEvent.click(within(card('Breakfast')).getByTestId('meal-menu'));
      fireEvent.click(screen.getByTestId('menu-copy-from'));
      await settle();
      fireEvent.click(within(screen.getByTestId('copy-from-sheet')).getAllByTestId('copy-from-day')[0]);
      await settle();
      expect(entriesIn('Breakfast')).toHaveLength(before + 1);
      expect(toast()).toContain("Copied yesterday's breakfast · 1 item");
      fireEvent.click(screen.getByTestId('toast-action'));
      await settle();
      expect(entriesIn('Breakfast')).toHaveLength(before);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete env.VITE_DEMO_MODE;
      _resetDemoModeCache();
      _resetDemoApi();
    }
  });
});
