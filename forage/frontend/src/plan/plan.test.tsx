// #709 in the app: the Plan tab's 8 days, rows, chips, banner and states; the
// "Plan a meal" sheet; the meal sheet's move and remove; failed writes; demo
// mode; and the stylesheet's 44px and 375px rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { PlanEntry, RecipeSummary, Trip } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetRecipes } from '../library/recipes-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { addDays, dayChip, dayName, longDay, planDays, shortDay } from './dates';
import { _resetPlan } from './plan-store';

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
  window.history.replaceState(null, '', `/${demo ? '?demo=true' : ''}#/plan`);
  render(<App />);
  await settle();
}

function recipe(id: string, name: string, over: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    name,
    source_url: '',
    source_site: 'example.com',
    servings: 4,
    total_min: null,
    notes: '',
    created: '2026-10-01T00:00:00Z',
    updated: '',
    nutrition: { per_serving: { kcal: 412.4, protein_g: 30, carbs_g: 20, fat_g: 18 }, missing: [], partial: false },
    partial: false,
    rating: 4,
    last_cooked: null,
    has_walkthrough: false,
    cook_count: 0,
    unrated_cook_id: null,
    ...over,
  };
}

function meal(over: Partial<PlanEntry>): PlanEntry {
  return {
    id: 'pl_1',
    date: TODAY,
    slot: 'Dinner',
    recipe_id: '',
    note: '',
    trip_id: '',
    created: 'x',
    updated: 'x',
    recipe_name: '',
    servings: null,
    kcal_serving: null,
    partial: false,
    trip_status: '',
    on_trip: false,
    shopped: false,
    ...over,
  };
}

const CHILI = { recipe_id: 'rc_chili', recipe_name: 'Weeknight chili', servings: 4, kcal_serving: 412.4 };

/** #718: an open trip, so the banner keeps #709's text with no button. */
const OPEN_TRIP: Trip = {
  id: 'tr_1',
  status: 'open',
  through: '2026-11-07',
  created: 'x',
  closed_at: '',
  meals: [],
  items: [],
  counts: { all: 0, todo: 0, have: 0, ks: 0, costco: 0, other: 0, to_buy: 0, bought: 0 },
  unmatched: [],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetPlan();
  _resetRecipes();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const days = () => screen.getAllByTestId('plan-day');
const rowsIn = (day: HTMLElement) => within(day).queryAllByTestId('meal-row');

describe('the helpers', () => {
  it('names the days as the design note does', () => {
    expect(planDays(NOW)).toEqual(Array.from({ length: 8 }, (_, i) => addDays(TODAY, i)));
    expect(planDays(NOW)[7]).toBe('2026-11-09');
    expect([dayName(TODAY, TODAY), dayName('2026-11-03', TODAY), dayName('2026-11-04', TODAY)]).toEqual([
      'Today',
      'Tomorrow',
      'Wednesday',
    ]);
    expect(shortDay('2026-11-04')).toBe('Nov 4');
    expect(dayChip('2026-11-05', TODAY)).toBe('Thu 5');
    expect(longDay('2026-11-03')).toBe('Tuesday, Nov 3');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('the Plan tab', () => {
  it('shows 8 day sections from today, meals in slot order, two in one slot both shown', async () => {
    const api = fakeApi();
    api.plan.push(
      meal({ id: 'pl_d', date: '2026-11-03', slot: 'Dinner', ...CHILI }),
      meal({ id: 'pl_b', date: '2026-11-03', slot: 'Breakfast', note: 'Toast' }),
      meal({ id: 'pl_d2', date: '2026-11-03', slot: 'Dinner', note: 'Salad' }),
      meal({ id: 'pl_s', date: '2026-11-03', slot: 'Snacks', note: 'Fruit' }),
    );
    await open();
    expect(api.calls('getPlan')[0].params.get('from')).toBe(TODAY);
    expect(api.calls('getPlan')[0].params.get('to')).toBe('2026-11-09');
    expect(api.calls('getPlan')[0].params.get('today')).toBe(TODAY);
    expect(days().map((d) => d.querySelector('h2')!.textContent)).toEqual([
      'Today Nov 2',
      'Tomorrow Nov 3',
      'Wednesday Nov 4',
      'Thursday Nov 5',
      'Friday Nov 6',
      'Saturday Nov 7',
      'Sunday Nov 8',
      'Monday Nov 9',
    ]);
    expect(rowsIn(days()[1]).map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Toast',
      'Weeknight chili',
      'Salad',
      'Fruit',
    ]);
  });

  it('a recipe row shows its slot and rounded kcal, a Partial chip, "no calories yet"; a note no calories', async () => {
    const api = fakeApi();
    api.plan.push(
      meal({ id: 'pl_1', date: TODAY, slot: 'Dinner', ...CHILI }),
      meal({
        id: 'pl_2',
        date: TODAY,
        slot: 'Snacks',
        recipe_id: 'rc_s',
        recipe_name: 'Stew',
        kcal_serving: 388.6,
        partial: true,
      }),
      meal({ id: 'pl_3', date: TODAY, slot: 'Snacks', recipe_id: 'rc_t', recipe_name: 'Toast', kcal_serving: null }),
      meal({ id: 'pl_4', date: TODAY, slot: 'Lunch', note: 'Leftovers' }),
    );
    await open();
    const meta = rowsIn(days()[0]).map((r) => r.querySelector('.recipe-meta')!.textContent);
    expect(meta).toEqual([
      'Lunch',
      'Dinner · 412 kcal a serving',
      'Snacks · 389 kcal a servingPartial',
      'Snacks · no calories yet',
    ]);
    const rows = rowsIn(days()[0]);
    expect(rows[1].getAttribute('aria-label')).toBe('Weeknight chili, Dinner, 412 kcal a serving');
    expect(rows[2].getAttribute('aria-label')).toBe('Stew, Snacks, 389 kcal a serving, partial');
    expect(rows[0].getAttribute('aria-label')).toBe('Leftovers, Lunch');
  });

  it('an open trip shows "On list", a closed one "Shopped", no trip neither', async () => {
    const api = fakeApi();
    api.plan.push(
      meal({ id: 'pl_1', date: TODAY, ...CHILI, trip_id: 'tr_1', trip_status: 'open', on_trip: true }),
      meal({
        id: 'pl_2',
        date: '2026-11-03',
        ...CHILI,
        trip_id: 'tr_0',
        trip_status: 'closed',
        on_trip: true,
        shopped: true,
      }),
      meal({ id: 'pl_3', date: '2026-11-04', ...CHILI }),
    );
    await open();
    expect(within(days()[0]).getByTestId('trip-chip').textContent).toBe('On list');
    expect(within(days()[1]).getByTestId('trip-chip').textContent).toBe('Shopped');
    expect(within(days()[2]).queryByTestId('trip-chip')).toBeNull();
    expect(rowsIn(days()[0])[0].getAttribute('aria-label')).toBe(
      'Weeknight chili, Dinner, 412 kcal a serving, on list',
    );
  });

  it('a day with nothing shows "Nothing planned", which opens Plan a meal with that day chosen', async () => {
    const api = fakeApi();
    api.recipes.push(recipe('rc_chili', 'Weeknight chili'));
    api.plan.push(meal({ ...CHILI }));
    await open();
    const ghost = within(days()[3]).getByRole('button', { name: 'Nothing planned' });
    fireEvent.click(ghost);
    await settle();
    const sheet = screen.getByTestId('plan-meal-sheet');
    expect(within(sheet).getByRole('button', { name: 'Thu 5' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('with nothing planned shows the empty state instead of 8 empty days', async () => {
    fakeApi();
    await open();
    const tab = screen.getByTestId('screen-plan');
    expect(tab.querySelector('h2')!.textContent).toBe('Nothing planned yet');
    expect(tab.querySelector('p')!.textContent).toBe('Meals you plan will show here, by day, with their calories.');
    expect(screen.queryAllByTestId('plan-day')).toEqual([]);
    expect(screen.getByTestId('plan-meal-btn').textContent).toBe('Plan a meal');
  });

  it('shows skeleton days while loading, and "Couldn\'t load your plan." with Try again', async () => {
    const api = fakeApi();
    let fail = true;
    api.answer('getPlan', () =>
      fail
        ? { success: false, error: 'boom' }
        : { success: true, data: { entries: [meal({ ...CHILI })], not_on_trip: 0 } },
    );
    window.history.replaceState(null, '', '/#/plan');
    render(<App />);
    expect(screen.getByTestId('plan-loading').querySelectorAll('h2')).toHaveLength(8);
    expect(screen.getByTestId('plan-loading').querySelectorAll('.skeleton-row')).toHaveLength(8);
    expect(screen.queryByTestId('plan-banner')).toBeNull();
    await settle();
    const error = screen.getByTestId('plan-error');
    expect(error.getAttribute('role')).toBe('status');
    expect(error.textContent).toContain("Couldn't load your plan.");
    fail = false;
    fireEvent.click(within(error).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByTestId('plan-error')).toBeNull();
    expect(screen.getByText('Weeknight chili')).toBeDefined();
  });

  it('keeps meals on screen under a refresh that fails', async () => {
    const api = fakeApi();
    api.plan.push(meal({ ...CHILI }));
    await open();
    api.answer('getPlan', () => ({ success: false, error: 'offline' }));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(screen.getByTestId('plan-error')).toBeDefined();
    expect(screen.getByText('Weeknight chili')).toBeDefined();
  });
});

describe('the banner', () => {
  it('reads the count in bold, singular and plural, with no trip open', async () => {
    const api = fakeApi();
    api.plan.push(meal({ ...CHILI }));
    api.counts.notOnTrip = 3;
    await open();
    const banner = screen.getByTestId('plan-banner');
    expect(banner.querySelector('p')!.textContent).toBe("3 planned meals aren't on a shopping trip yet.");
    expect(banner.querySelector('strong')!.textContent).toBe('3 planned meals');
    expect(banner.getAttribute('role')).toBeNull();
  });

  it('#719: with a trip open and nothing late there is no banner, whatever the count', async () => {
    const api = fakeApi();
    api.trips.open = OPEN_TRIP;
    api.plan.push(meal({ ...CHILI }));
    api.counts.notOnTrip = 3;
    await open();
    expect(screen.queryByTestId('plan-banner')).toBeNull();
  });

  it('#719: with a trip open and a late meal, the late sentence and Add to list, which opens Shop', async () => {
    const api = fakeApi();
    api.trips.open = OPEN_TRIP;
    api.plan.push(meal({ ...CHILI }));
    api.lateMeals.push({ plan_id: 'pl_thu', recipe_name: 'Beef Stew', date: '2026-11-05', slot: 'Dinner' });
    await open();
    const banner = screen.getByTestId('plan-banner');
    expect(banner.querySelector('p')!.textContent).toBe('Beef Stew (Thu Nov 5) was planned after this list was made.');
    expect(banner.querySelector('strong')!.textContent).toBe('Beef Stew');
    api.lateMeals.push({ plan_id: 'pl_fri', recipe_name: 'Weeknight chili', date: '2026-11-06', slot: 'Dinner' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(screen.getByTestId('plan-banner').querySelector('p')!.textContent).toBe(
      '2 meals were planned after this list was made.',
    );
    fireEvent.click(screen.getByTestId('banner-add-to-list'));
    await settle();
    expect(window.location.hash).toBe('#/shop');
  });

  it('updates after a plan, a move and a remove, with no reload', async () => {
    const api = fakeApi();
    api.recipes.push(recipe('rc_chili', 'Weeknight chili'));
    api.plan.push(meal({ id: 'pl_0', date: '2026-11-04', ...CHILI }));
    api.counts.notOnTrip = 1;
    await open();
    const text = () => screen.getByTestId('plan-banner').querySelector('p')!.textContent;
    expect(text()).toBe("1 planned meal isn't on a shopping trip yet.");

    api.counts.notOnTrip = 2;
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    fireEvent.click(screen.getAllByTestId('plan-recipe')[0]);
    await settle();
    expect(text()).toBe("2 planned meals aren't on a shopping trip yet.");

    api.counts.notOnTrip = 0;
    fireEvent.click(rowsIn(days()[2])[0]);
    fireEvent.click(within(screen.getByTestId('meal-sheet')).getByRole('button', { name: 'Remove from plan' }));
    fireEvent.click(within(screen.getByTestId('meal-sheet')).getByRole('button', { name: 'Remove' }));
    await settle();
    expect(screen.queryByTestId('plan-banner')).toBeNull();
  });
});

describe('Plan a meal', () => {
  it('offers 8 days, 4 slots and the recipes; tapping one plans it, closes the sheet, and the meal appears', async () => {
    const api = fakeApi();
    api.recipes.push(
      recipe('rc_chili', 'Weeknight chili'),
      recipe('rc_stew', 'Beef Stew', { rating: null, servings: 6 }),
    );
    api.plan.push(meal({ id: 'pl_0', date: '2026-11-06', note: 'Out' }));
    await open();
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    const sheet = screen.getByTestId('plan-meal-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    const groups = within(sheet).getAllByRole('group');
    expect(
      within(groups[0])
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Today', 'Tomorrow', 'Wed 4', 'Thu 5', 'Fri 6', 'Sat 7', 'Sun 8', 'Mon 9']);
    expect(within(groups[0]).getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')).toBe('true');
    expect(
      within(groups[1])
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
    expect(within(groups[1]).getByRole('button', { name: 'Dinner' }).getAttribute('aria-pressed')).toBe('true');
    const rows = within(sheet).getAllByTestId('plan-recipe');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Weeknight chili★★★★☆ · serves 4',
      'Beef StewNot rated · serves 6',
    ]);

    fireEvent.click(within(groups[0]).getByRole('button', { name: 'Wed 4' }));
    fireEvent.click(within(groups[1]).getByRole('button', { name: 'Lunch' }));
    fireEvent.click(rows[1]);
    await settle();
    expect(screen.queryByTestId('plan-meal-sheet')).toBeNull();
    const [sent] = api.calls('upsertPlanEntry');
    expect(sent.payload).toMatchObject({ date: '2026-11-04', slot: 'Lunch', recipe_id: 'rc_stew' });
    expect(sent.payload.id).toMatch(/^pl_[0-9a-f]{8}$/);
    expect(rowsIn(days()[2]).map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual(['Beef Stew']);
  });

  it('plans a note from "Something else"; Plan it is disabled while blank', async () => {
    const api = fakeApi();
    await open();
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    const sheet = screen.getByTestId('plan-meal-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Something else' }));
    const planIt = within(sheet).getByRole('button', { name: 'Plan it' });
    expect(planIt.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Eating out' }));
    expect((within(sheet).getByLabelText("What's the plan?") as HTMLInputElement).value).toBe('Eating out');
    fireEvent.click(planIt);
    await settle();
    expect(api.calls('upsertPlanEntry')[0].payload).toMatchObject({
      date: '2026-11-03',
      slot: 'Dinner',
      note: 'Eating out',
    });
    expect(screen.queryByTestId('plan-meal-sheet')).toBeNull();
    expect(screen.getByText('Eating out')).toBeDefined();
  });

  it('with no recipes says so, with a link to Library', async () => {
    fakeApi();
    await open();
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    const sheet = screen.getByTestId('plan-meal-sheet');
    expect(sheet.textContent).toContain('No recipes yet. Import one from Library.');
    expect(within(sheet).getByRole('link', { name: 'Go to Library' }).getAttribute('href')).toBe('#/library');
  });

  it('a failed write keeps the sheet open with the line and the screen unchanged; a retry sends the same id', async () => {
    const api = fakeApi();
    api.recipes.push(recipe('rc_chili', 'Weeknight chili'));
    let fail = true;
    const real = (p: any) => ({ success: true as const, data: meal({ ...p, ...CHILI }) });
    api.answer('upsertPlanEntry', (p) => (fail ? { success: false, error: 'Network' } : real(p)));
    await open();
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    const status = screen.getByTestId('plan-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    fireEvent.click(screen.getAllByTestId('plan-recipe')[0]);
    await settle();
    expect(screen.getByTestId('plan-meal-sheet')).toBeDefined();
    expect(status.textContent).toBe("Couldn't save that. Try again.");
    expect(api.calls('getPlan')).toHaveLength(1);
    fail = false;
    fireEvent.click(screen.getAllByTestId('plan-recipe')[0]);
    await settle();
    const ids = api.calls('upsertPlanEntry').map((s) => s.payload.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('a double tap sends one write: the list is inert while a call is out', async () => {
    const api = fakeApi();
    api.recipes.push(recipe('rc_chili', 'Weeknight chili'));
    await open();
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    const row = screen.getAllByTestId('plan-recipe')[0];
    fireEvent.click(row);
    fireEvent.click(row);
    await settle();
    expect(api.calls('upsertPlanEntry')).toHaveLength(1);
    expect(api.plan).toHaveLength(1);
  });

  it('a recipe deleted meanwhile says so and reloads the list', async () => {
    const api = fakeApi();
    api.recipes.push(recipe('rc_chili', 'Weeknight chili'));
    api.answer('upsertPlanEntry', () => ({ success: false, error: 'recipe_id "rc_chili" is not a recipe' }));
    await open();
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    fireEvent.click(screen.getAllByTestId('plan-recipe')[0]);
    await settle();
    expect(screen.getByTestId('plan-status').textContent).toBe("That recipe isn't in your library any more.");
    expect(api.calls('getRecipes')).toHaveLength(2);
  });
});

describe('the meal sheet', () => {
  it('moves a meal: Save is disabled until the day or slot changes; it lands under the new day', async () => {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_1', date: '2026-11-03', ...CHILI }));
    await open();
    fireEvent.click(rowsIn(days()[1])[0]);
    const sheet = screen.getByTestId('meal-sheet');
    expect(sheet.querySelector('h2')!.textContent).toBe('Weeknight chili');
    expect(sheet.textContent).toContain('Tuesday, Nov 3 · Dinner');
    expect(sheet.textContent).toContain('412 kcal a serving');
    const save = within(sheet).getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fri 6' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Breakfast' }));
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Tomorrow' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dinner' }));
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fri 6' }));
    fireEvent.click(save);
    await settle();
    expect(api.calls('movePlanEntry')[0].payload).toEqual({ id: 'pl_1', date: '2026-11-06' });
    expect(screen.queryByTestId('meal-sheet')).toBeNull();
    expect(rowsIn(days()[1])).toEqual([]);
    expect(rowsIn(days()[4]).map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual(['Weeknight chili']);
  });

  it('remove asks first, naming the day and slot; Keep goes back, Remove deletes it', async () => {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_1', date: '2026-11-03', ...CHILI }));
    await open();
    fireEvent.click(rowsIn(days()[1])[0]);
    const sheet = () => screen.getByTestId('meal-sheet');
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove from plan' }));
    expect(within(sheet()).getByTestId('remove-question').querySelector('p')!.textContent).toBe(
      "Remove Weeknight chili from Tomorrow's dinner?",
    );
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Keep' }));
    expect(within(sheet()).queryByTestId('remove-question')).toBeNull();
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove from plan' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Remove' }));
    await settle();
    expect(api.calls('deletePlanEntry')[0].payload).toEqual({ id: 'pl_1' });
    expect(screen.queryByTestId('meal-sheet')).toBeNull();
    expect(screen.queryByText('Weeknight chili')).toBeNull();
  });

  it('a meal on a trip adds the trip sentence to the question', async () => {
    const api = fakeApi();
    api.plan.push(
      meal({ id: 'pl_1', date: '2026-11-04', ...CHILI, trip_id: 'tr_1', trip_status: 'open', on_trip: true }),
    );
    await open();
    fireEvent.click(rowsIn(days()[2])[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from plan' }));
    expect(screen.getByTestId('remove-question').querySelector('p')!.textContent).toBe(
      "Remove Weeknight chili from Wednesday's dinner? It's on a shopping trip. Removing it doesn't change the trip.",
    );
  });

  it('a note meal edits its text; a failed save keeps the sheet with the line and the screen unchanged', async () => {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_1', date: TODAY, slot: 'Lunch', note: 'Leftovers' }));
    api.answer('movePlanEntry', () => ({ success: false, error: 'Network error' }));
    await open();
    fireEvent.click(rowsIn(days()[0])[0]);
    const sheet = screen.getByTestId('meal-sheet');
    expect(within(sheet).queryByRole('button', { name: 'View recipe' })).toBeNull();
    fireEvent.input(within(sheet).getByLabelText("What's the plan?"), { target: { value: 'Pizza night' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await settle();
    expect(api.calls('movePlanEntry')[0].payload).toEqual({ id: 'pl_1', note: 'Pizza night' });
    expect(screen.getByTestId('meal-status').textContent).toBe("Couldn't save that. Try again.");
    expect(screen.getByTestId('meal-sheet')).toBeDefined();
    expect(rowsIn(days()[0])[0].querySelector('.recipe-name')!.textContent).toBe('Leftovers');
  });

  it('a meal removed elsewhere closes the sheet with "That meal was already removed." and reloads', async () => {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_1', date: TODAY, ...CHILI }));
    await open();
    fireEvent.click(rowsIn(days()[0])[0]);
    api.plan.splice(0, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Snacks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    expect(screen.queryByTestId('meal-sheet')).toBeNull();
    expect(screen.getByText('That meal was already removed.')).toBeDefined();
    expect(api.calls('getPlan')).toHaveLength(2);
  });

  it("View recipe opens the recipe's Nutrition sheet on top", async () => {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_1', date: TODAY, ...CHILI }));
    api.answer('getRecipe', () => ({
      success: true,
      data: { ...recipe('rc_chili', 'Weeknight chili'), lines: [], steps: [] },
    }));
    await open();
    fireEvent.click(rowsIn(days()[0])[0]);
    fireEvent.click(screen.getByRole('button', { name: 'View recipe' }));
    await settle();
    expect(screen.getByTestId('nutrition-sheet')).toBeDefined();
    expect(screen.getByTestId('meal-sheet')).toBeDefined();
    expect(api.calls('getRecipe')[0].params.get('id')).toBe('rc_chili');
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    _resetDemoModeCache();
    _resetDemoApi();
    env.VITE_DEMO_MODE = 'true';
  });
  afterEach(() => {
    delete env.VITE_DEMO_MODE;
    _resetDemoModeCache();
    _resetDemoApi();
  });

  it('shows 7 sample meals: one On list, one Shopped, one Partial, one note, and #712 dinner tonight; planning, moving and removing work in memory', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await open(true);
    const all = screen.getAllByTestId('meal-row');
    expect(all).toHaveLength(7);
    expect(
      screen
        .getAllByTestId('trip-chip')
        .map((c) => c.textContent)
        .sort(),
    ).toEqual(['On list', 'On list', 'Shopped']);
    expect(screen.getAllByText('Partial')).toHaveLength(1);
    expect(rowsIn(days()[0]).map((r) => r.getAttribute('aria-label'))).toEqual([
      'Leftovers, Lunch',
      expect.stringMatching(/^Weeknight chili, Dinner, \d+ kcal a serving/),
    ]);
    // #719: the sample trip is open, so the banner names its late meal.
    const late = () => screen.getByTestId('plan-banner').querySelector('p')!.textContent;
    expect(late()).toMatch(
      /^Weeknight beef stew \(\w{3} \w{3} \d+\) was planned after this list was made\.$|was planned after this list was made\.$/,
    );

    // Plan: a second late meal, inside the trip's dates.
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    fireEvent.click(within(screen.getByTestId('plan-meal-sheet')).getByRole('button', { name: 'Sat 7' }));
    fireEvent.click(screen.getAllByTestId('plan-recipe')[0]);
    await settle();
    expect(screen.getAllByTestId('meal-row')).toHaveLength(8);
    expect(late()).toBe('2 meals were planned after this list was made.');

    // Move one to today: no longer late.
    fireEvent.click(rowsIn(days()[5])[0]);
    fireEvent.click(within(screen.getByTestId('meal-sheet')).getByRole('button', { name: 'Today' }));
    fireEvent.click(within(screen.getByTestId('meal-sheet')).getByRole('button', { name: 'Save' }));
    await settle();
    expect(rowsIn(days()[0])).toHaveLength(3);
    expect(late()).toMatch(/was planned after this list was made\.$/);

    // Remove one.
    fireEvent.click(rowsIn(days()[0])[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await settle();
    expect(screen.getAllByTestId('meal-row')).toHaveLength(7);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();
  it.each(['.meal-row', '.plan-recipe', '.chip', '.btn', '.text-btn', '.segment'])('%s is at least 44px', (sel) => {
    expect(rule(css, sel)).toContain('min-height: var(--touch-target)');
  });

  it('nothing scrolls sideways at 375px: chips wrap, names wrap, the banner wraps', () => {
    expect(rule(css, '.chip-row')).toContain('flex-wrap: wrap');
    expect(rule(css, '.recipe-name')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.recipe-text')).toContain('min-width: 0');
    expect(rule(css, '.plan-banner')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.trip-chip')).toContain('flex: none');
  });
});

describe('a save shows at once (#785)', () => {
  it('planning, moving and removing show when the sheet closes, whatever the refresh does', async () => {
    const api = fakeApi();
    api.recipes.push(recipe('rc_chili', 'Weeknight chili'));
    api.plan.push(meal({ id: 'pl_0', date: '2026-11-06', note: 'Out' }));
    await open();
    api.answer('getPlan', () => ({ success: false, error: 'offline' }));
    fireEvent.click(screen.getByTestId('plan-meal-btn'));
    await settle();
    fireEvent.click(screen.getAllByTestId('plan-recipe')[0]);
    await settle();
    expect(screen.queryByTestId('plan-meal-sheet')).toBeNull();
    expect(screen.getByText('Weeknight chili')).toBeDefined();
    // The failed refresh shows nothing: no error line, no skeleton.
    expect(screen.queryByTestId('plan-error')).toBeNull();
    expect(screen.queryByTestId('plan-loading')).toBeNull();

    fireEvent.click(rowsIn(days()[4])[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    expect(rowsIn(days()[4])[0].textContent).toContain('Lunch');

    fireEvent.click(rowsIn(days()[1])[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await settle();
    expect(screen.queryByText('Weeknight chili')).toBeNull();
    expect(screen.queryByTestId('plan-error')).toBeNull();
  });
});
