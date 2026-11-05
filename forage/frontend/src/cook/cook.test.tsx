// #708 in the app: Library's search, sort and rows; the recipe sheet's rating,
// Cook, steps and history; the choice sheet; log mode's checklist, clock,
// timers and persistence; finishing, logging to Eaten and undo; rating later;
// and demo mode end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import App from '../App';
import type { Cook, RecipeDetail, RecipeSummary } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { review, savedNotice } from '../import/review-state';
import { _resetRecipes } from '../library/recipes-store';
import { syncFromHash } from '../shell/routes';
import { fakeApi } from '../test-api';
import { COOK_KEY, MODE_KEY, RATE_SKIP_KEY, _resetCookMemory, readCook } from './cook-store';
import { clockText, shortDate, slotForTime, starsText } from './format';

const env = import.meta.env as Record<string, string | undefined>;

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function go(hash: string, demo = false) {
  window.history.replaceState(null, '', `/${demo ? '?demo=true' : ''}${hash}`);
  render(<App />);
  await settle();
}

/** Navigate inside a rendered app, as a link or Back would. */
async function navigate(hash: string) {
  window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  await act(async () => syncFromHash());
  await settle();
}

function summary(id: string, name: string, over: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    name,
    source_url: '',
    source_site: 'example.com',
    servings: 6,
    total_min: null,
    notes: '',
    created: '2026-10-01T00:00:00Z',
    updated: '',
    nutrition: { per_serving: { kcal: 520.4, protein_g: 30, carbs_g: 20, fat_g: 25 }, missing: [], partial: false },
    partial: false,
    rating: null,
    last_cooked: null,
    has_walkthrough: false,
    cook_count: 0,
    unrated_cook_id: null,
    ...over,
  };
}

const STEW: RecipeDetail = {
  ...summary('rc_stew', 'Beef Stew', { rating: 4, last_cooked: '2026-10-28', cook_count: 2 }),
  lines: [
    {
      recipe_id: 'rc_stew',
      line_id: 'L1',
      position: 1,
      section: '',
      text: '2 lb beef chuck',
      qty: 2,
      unit: 'lb',
      food_id: '',
      grams: null,
      optional: false,
      resolved_grams: null,
      reason: '',
    },
    {
      recipe_id: 'rc_stew',
      line_id: 'L2',
      position: 2,
      section: 'To serve',
      text: 'Parsley',
      qty: null,
      unit: '',
      food_id: '',
      grams: null,
      optional: true,
      resolved_grams: null,
      reason: '',
    },
    {
      recipe_id: 'rc_stew',
      line_id: 'L3',
      position: 3,
      section: 'To serve',
      text: '',
      qty: null,
      unit: '',
      food_id: '',
      grams: null,
      optional: false,
      resolved_grams: null,
      reason: '',
    },
  ],
  steps: [
    {
      recipe_id: 'rc_stew',
      position: 1,
      section: 'For the stew',
      name: 'Brown the beef',
      text: 'Brown it in batches.',
    },
    { recipe_id: 'rc_stew', position: 2, section: 'For the stew', name: '', text: 'Simmer 2 hours.' },
  ],
};

const COOKS: Cook[] = [
  {
    id: 'ck_2',
    recipe_id: 'rc_stew',
    recipe_name: 'Beef Stew',
    date: '2026-10-28',
    rating: 4,
    note: 'Good',
    plan_id: '',
    created: 'b',
  },
  {
    id: 'ck_1',
    recipe_id: 'rc_stew',
    recipe_name: 'Beef Stew',
    date: '2026-10-04',
    rating: null,
    note: '',
    plan_id: '',
    created: 'a',
  },
];

beforeEach(() => {
  localStorage.clear();
  _resetCookMemory();
  signIn();
  review.value = null;
  savedNotice.value = null;
  _resetRecipes();
  document.title = 'Forage';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the helpers', () => {
  it('stars, dates, the clock and the slot', () => {
    expect(starsText(4)).toBe('★★★★☆');
    expect(shortDate('2026-10-28', new Date(2026, 10, 2))).toBe('Oct 28');
    expect(shortDate('2025-10-28', new Date(2026, 10, 2))).toBe('Oct 28, 2025');
    expect(clockText(61_000)).toBe('1:01');
    expect(clockText(3_725_000)).toBe('1:02:05');
    expect(slotForTime(new Date(2026, 0, 1, 10, 59))).toBe('Breakfast');
    expect(slotForTime(new Date(2026, 0, 1, 14, 0))).toBe('Lunch');
    expect(slotForTime(new Date(2026, 0, 1, 15, 0))).toBe('Dinner');
    expect(slotForTime(new Date(2026, 0, 1, 20, 59))).toBe('Dinner');
    expect(slotForTime(new Date(2026, 0, 1, 21, 0))).toBe('After dinner');
  });
});

describe('Library → Recipes: search, sort and rows', () => {
  function library(n: number) {
    const api = fakeApi();
    for (let i = 0; i < n; i++) api.recipes.push(summary(`rc_${i}`, `Recipe ${i}`));
    return api;
  }

  it('the search shows from 8 recipes and asks the API after 250 ms; an ingredient match names its line', async () => {
    const api = library(8);
    api.answer('getRecipes', () => ({ success: true, data: api.recipes }));
    await go('#/library');
    expect(screen.queryByTestId('recipe-search')).not.toBeNull();
    api.answer('getRecipes', () => ({
      success: true,
      data: [summary('rc_3', 'Recipe 3', { matched_line: '2 lb chicken thighs' })],
    }));
    vi.useFakeTimers();
    fireEvent.input(screen.getByTestId('recipe-search'), { target: { value: 'Chicken' } });
    expect(api.calls('getRecipes')).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    await settle();
    const last = api.sent.filter((s) => s.action === 'getRecipes').at(-1)!;
    expect(last).toBeDefined();
    const body = (api.fetch.mock.calls.at(-1)![1] as RequestInit).body as URLSearchParams;
    expect(body.get('q')).toBe('Chicken');
    expect(screen.getAllByTestId('recipe-row')).toHaveLength(1);
    expect(screen.getByTestId('matched-line').textContent).toBe('has 2 lb chicken thighs');
  });

  it('no match says so and offers to clear it', async () => {
    const api = library(8);
    await go('#/library');
    api.answer('getRecipes', () => ({ success: true, data: [] }));
    fireEvent.input(screen.getByTestId('recipe-search'), { target: { value: 'zucchini' } });
    await waitFor(() => expect(screen.getByTestId('no-match').textContent).toContain('No recipe matches "zucchini".'));
    api.answer('getRecipes', () => ({ success: true, data: api.recipes }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await settle();
    expect(screen.getAllByTestId('recipe-row')).toHaveLength(8);
  });

  it('the search is hidden under 8; the sort chips show from 2 and ask the API for the order', async () => {
    const api = library(2);
    await go('#/library');
    expect(screen.queryByTestId('recipe-search')).toBeNull();
    const chips = within(screen.getByRole('group', { name: 'Sort recipes' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Newest', 'Name', 'Rating', 'Last cooked']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chips[2]);
    await settle();
    const body = (api.fetch.mock.calls.at(-1)![1] as RequestInit).body as URLSearchParams;
    expect(body.get('action')).toBe('getRecipes');
    expect(body.get('sort')).toBe('rating');
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('a row shows the stars, when it was last cooked, and Rate it while the latest cook is unrated', async () => {
    const api = fakeApi();
    api.recipes.push(
      summary('rc_1', 'Beef Stew', {
        rating: 4,
        last_cooked: `${new Date().getFullYear()}-10-28`,
        unrated_cook_id: 'ck_9',
      }),
    );
    await go('#/library');
    const row = screen.getByTestId('recipe-row');
    expect(within(row).getByRole('img', { name: '4 of 5 stars' }).textContent).toBe('★★★★☆');
    expect(within(row).getByTestId('recipe-meta').textContent).toBe('★★★★☆ · cooked Oct 28 · 520 kcal');
    expect(within(row).getByTestId('rate-chip').textContent).toBe('Rate it');
  });

  it('a failed load says so and offers Try again', async () => {
    const api = fakeApi();
    api.answer('getRecipes', () => ({ success: false, error: 'down' }));
    await go('#/library');
    expect(screen.getByText("Couldn't load your recipes.")).toBeDefined();
    api.answer('getRecipes', () => ({ success: true, data: [summary('rc_1', 'Soup')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.getAllByTestId('recipe-row')).toHaveLength(1);
  });
});

describe('the recipe sheet', () => {
  function stewApi(cooks = COOKS, over: Partial<RecipeDetail> = {}) {
    const api = fakeApi();
    api.recipes.push(summary('rc_stew', 'Beef Stew'));
    api.cooks.push(...cooks.map((c) => ({ ...c })));
    api.answer('getRecipe', () => ({ success: true, data: { ...STEW, ...over } }));
    return api;
  }

  async function openStew() {
    await go('#/library');
    fireEvent.click(screen.getByText('Beef Stew'));
    await settle();
    return screen.getByTestId('nutrition-sheet');
  }

  it('shows the stars, last cooked, Cook, the steps under their headings, and one history row per cook', async () => {
    stewApi();
    const sheet = await openStew();
    expect(within(sheet).getByTestId('recipe-sheet-meta').textContent).toBe(
      `★★★★☆ · serves 6 · 2 steps · last cooked ${shortDate('2026-10-28')}`,
    );
    expect(within(sheet).getByTestId('cook-btn').textContent).toBe('Cook');
    expect(sheet.textContent).toContain('No walkthrough yet. Cook it in log mode');
    fireEvent.click(within(sheet).getByTestId('steps-toggle'));
    expect(within(sheet).getByTestId('steps-toggle').getAttribute('aria-expanded')).toBe('true');
    const group = within(sheet).getByTestId('step-group');
    expect(group.textContent).toContain('For the stew');
    expect(
      within(sheet)
        .getAllByTestId('sheet-step')
        .map((s) => s.textContent),
    ).toEqual(['1. Brown the beefBrown it in batches.', '2. Simmer 2 hours.']);
    const rows = within(sheet).getAllByTestId('history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(shortDate('2026-10-28'));
    expect(rows[0].textContent).toContain('Good');
    expect(within(sheet).getByText('Cooked 2 times')).toBeDefined();
  });

  it('a recipe never cooked says Not rated, never cooked and Not cooked yet', async () => {
    stewApi([], { rating: null, last_cooked: null });
    const sheet = await openStew();
    expect(within(sheet).getByTestId('recipe-sheet-meta').textContent).toBe(
      'Not rated · serves 6 · 2 steps · never cooked',
    );
    expect(within(sheet).getByText('Not cooked yet.')).toBeDefined();
  });

  it('How was it? saves a star at once, turns into the stars, and takes an optional note', async () => {
    const api = stewApi(COOKS, { unrated_cook_id: 'ck_1' });
    const sheet = await openStew();
    const card = within(sheet).getByTestId('rate-card');
    expect(card.textContent).toContain(`How was it? You cooked this on ${shortDate('2026-10-04')}.`);
    fireEvent.click(within(card).getByRole('radio', { name: '4 stars' }));
    await settle();
    expect(api.calls('upsertCook')[0].payload).toEqual({ id: 'ck_1', rating: 4 });
    const after = within(sheet).getByTestId('rate-card');
    expect(after.textContent).toContain('Rated 4 stars');
    fireEvent.input(within(after).getByPlaceholderText('Add a note (optional)'), { target: { value: 'Salty' } });
    fireEvent.click(within(after).getByRole('button', { name: 'Save' }));
    await settle();
    expect(api.calls('upsertCook')[1].payload).toEqual({ id: 'ck_1', note: 'Salty' });
  });

  it('Not now hides the card on this device only', async () => {
    stewApi(COOKS, { unrated_cook_id: 'ck_1' });
    const sheet = await openStew();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Not now' }));
    expect(within(sheet).queryByTestId('rate-card')).toBeNull();
    expect(JSON.parse(localStorage.getItem(RATE_SKIP_KEY)!)).toEqual(['ck_1']);
  });

  it('a history row re-rates, clears on its filled last star, and removes after asking', async () => {
    const api = stewApi();
    const sheet = await openStew();
    const first = within(sheet).getAllByTestId('history-row')[0];
    fireEvent.click(within(first).getByRole('radio', { name: '4 stars' }));
    await settle();
    expect(api.calls('upsertCook')[0].payload).toEqual({ id: 'ck_2', rating: null });
    fireEvent.click(within(within(sheet).getAllByTestId('history-row')[1]).getByRole('radio', { name: '2 stars' }));
    await settle();
    expect(api.calls('upsertCook')[1].payload).toEqual({ id: 'ck_1', rating: 2 });
    const row = within(sheet).getAllByTestId('history-row')[1];
    fireEvent.click(within(row).getByRole('button', { name: /More for the cook/ }));
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Remove this cook' }));
    expect(screen.getByText(`Remove the cook from ${shortDate('2026-10-04')}?`)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await settle();
    expect(api.calls('deleteCook')[0].payload).toEqual({ id: 'ck_1' });
  });

  it('a rating that cannot be saved says so and reverts', async () => {
    const api = stewApi(COOKS, { unrated_cook_id: 'ck_1' });
    api.answer('upsertCook', () => ({ success: false, error: 'offline', code: 'network' }));
    const sheet = await openStew();
    fireEvent.click(within(within(sheet).getByTestId('rate-card')).getByRole('radio', { name: '5 stars' }));
    await settle();
    const card = within(sheet).getByTestId('rate-card');
    expect(card.textContent).toContain("Couldn't save the rating.");
    expect(card.textContent).toContain('How was it?');
  });
});

describe('the Cook choice sheet', () => {
  async function openChoice(hasWalkthrough: boolean) {
    const api = fakeApi();
    api.recipes.push(summary('rc_stew', 'Beef Stew'));
    api.answer('getRecipe', () => ({ success: true, data: { ...STEW, has_walkthrough: hasWalkthrough } }));
    await go('#/library');
    fireEvent.click(screen.getByText('Beef Stew'));
    await settle();
    fireEvent.click(screen.getByTestId('cook-btn'));
    return screen.getByTestId('cook-choice');
  }

  it('disables Walkthrough without one, preselects Log mode, and Cancel starts nothing', async () => {
    const sheet = await openChoice(false);
    const walk = within(sheet).getByTestId('mode-walkthrough');
    expect(walk.hasAttribute('disabled')).toBe(true);
    expect(walk.textContent).toContain('No walkthrough yet.');
    expect(within(sheet).getByTestId('mode-log').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('cook-choice')).toBeNull();
    expect(readCook()).toBeNull();
    expect(window.location.hash).toBe('#/library');
  });

  it('preselects the last choice when it is still available, else Walkthrough when there is one', async () => {
    let sheet = await openChoice(true);
    expect(within(sheet).getByTestId('mode-walkthrough').getAttribute('aria-checked')).toBe('true');
    document.body.innerHTML = '';
    localStorage.setItem(MODE_KEY, 'log');
    sheet = await openChoice(true);
    expect(within(sheet).getByTestId('mode-log').getAttribute('aria-checked')).toBe('true');
  });

  it('Continue in log mode remembers it and opens #/cook/<id>', async () => {
    const sheet = await openChoice(false);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continue' }));
    await act(async () => syncFromHash());
    await settle();
    expect(localStorage.getItem(MODE_KEY)).toBe('log');
    expect(window.location.hash).toBe('#/cook/rc_stew');
    expect(screen.getByTestId('log-mode')).toBeDefined();
  });
});

describe('log mode', () => {
  function cookApi() {
    const api = fakeApi();
    api.recipes.push(summary('rc_stew', 'Beef Stew'));
    api.answer('getRecipe', () => ({ success: true, data: STEW }));
    return api;
  }

  it('lists every line verbatim and every step with its number, title and section, in order; none scaled', async () => {
    cookApi();
    await go('#/cook/rc_stew');
    expect(screen.getAllByTestId('check-line').map((b) => b.textContent)).toEqual([
      '2 lb beef chuck',
      'Parsley (optional)',
    ]);
    expect(screen.getAllByTestId('check-step').map((b) => b.textContent)).toEqual([
      '1. Brown the beefBrown it in batches.',
      '2. Simmer 2 hours.',
    ]);
    expect(screen.getByText('To serve')).toBeDefined();
    expect(screen.getByText('For the stew')).toBeDefined();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Beef Stew');
  });

  it('checks items, and a reload returns the same checks, timers and clock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getAllByTestId('check-line')[0]);
    expect(screen.getAllByTestId('check-line')[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('timer-10'));
    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByTestId('cook-clock').textContent).toBe('1:05');
    expect(screen.getByTestId('timer-left').textContent).toBe('8:55');

    document.body.innerHTML = '';
    await go('#/cook/rc_stew');
    expect(screen.getAllByTestId('check-line')[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('timer-left').textContent).toBe('8:55');
    expect(screen.getByTestId('cook-clock').textContent).toBe('1:05');
  });

  it('a timer at zero shows Done, vibrates and is announced, and nothing else moves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getByTestId('timer-5'));
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000 + 1000);
    });
    expect(screen.getByTestId('timer-left').textContent).toBe('Done');
    expect(screen.getByTestId('timer-chip').className).toContain('is-done');
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(screen.getByTestId('timer-announce').textContent).toBe('5 min timer is done');
    expect(document.title).toBe('Timer done · Forage');
    expect(screen.getAllByTestId('check-line').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByTestId('finish').textContent).toBe('Finish');
    fireEvent.click(screen.getByRole('button', { name: 'Remove the 5 min timer' }));
    expect(screen.queryByTestId('timer-chip')).toBeNull();
    expect(document.title).toBe('Forage');
  });

  it('takes a custom number of minutes, two identical quick timers are two chips, and a seventh is refused', async () => {
    cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getByTestId('timer-custom'));
    fireEvent.input(screen.getByTestId('custom-minutes'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByTestId('timer-5'));
    expect(screen.getAllByTestId('timer-chip').map((c) => c.firstChild!.textContent)).toEqual([
      '45 min',
      '5 min',
      '5 min',
      '5 min',
      '5 min',
      '5 min',
    ]);
    fireEvent.click(screen.getByTestId('timer-60'));
    expect(screen.getAllByTestId('timer-chip')).toHaveLength(6);
    expect(screen.getByText('Six timers is the most. Remove one first.')).toBeDefined();
  });

  it('✕ asks first; Keep cooking stays, Leave discards the cook and records nothing', async () => {
    const api = cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getByTestId('cook-leave'));
    expect(screen.getByText('Leave this cook?')).toBeDefined();
    expect(screen.getByText('Nothing is recorded.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Keep cooking' }));
    expect(screen.getByTestId('log-mode')).toBeDefined();
    fireEvent.click(screen.getByTestId('cook-leave'));
    fireEvent.click(within(screen.getByTestId('leave-cook')).getByRole('button', { name: 'Leave' }));
    await act(async () => syncFromHash());
    await settle();
    expect(localStorage.getItem(COOK_KEY)).toBeNull();
    expect(api.calls('upsertCook')).toHaveLength(0);
    expect(window.location.hash).toBe('#/library');
    expect(screen.getByTestId('nutrition-sheet')).toBeDefined();
  });

  it('Back mid-cook asks too, and keeps the cook on screen', async () => {
    cookApi();
    await go('#/cook/rc_stew');
    await navigate('#/library');
    expect(screen.getByTestId('log-mode')).toBeDefined();
    expect(screen.getByText('Leave this cook?')).toBeDefined();
    expect(window.location.hash).toBe('#/cook/rc_stew');
  });

  it('another recipe in progress asks first', async () => {
    cookApi();
    await go('#/cook/rc_stew');
    document.body.innerHTML = '';
    localStorage.setItem(COOK_KEY, JSON.stringify({ ...readCook()!, recipe_id: 'rc_other', recipe_name: 'Chili' }));
    await go('#/cook/rc_stew');
    expect(screen.getByText("You're already cooking Chili.")).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Start this one instead' }));
    await settle();
    expect(readCook()!.recipe_id).toBe('rc_stew');
  });

  it('an unknown recipe goes back to Library and says so', async () => {
    const api = fakeApi();
    api.answer('getRecipe', () => ({ success: false, error: 'Recipe "rc_nope" not found' }));
    await go('#/cook/rc_nope');
    await act(async () => syncFromHash());
    await settle();
    expect(window.location.hash).toBe('#/library');
    expect(screen.getByText("That recipe isn't in your library.")).toBeDefined();
  });
});

describe('Finish', () => {
  function cookApi() {
    const api = fakeApi();
    api.recipes.push(summary('rc_stew', 'Beef Stew'));
    api.answer('getRecipe', () => ({ success: true, data: STEW }));
    return api;
  }

  it('works with nothing checked: one cook with a blank rating, how long it took, no rating asked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = cookApi();
    await go('#/cook/rc_stew');
    const id = readCook()!.cook_id;
    await act(async () => {
      vi.advanceTimersByTime(12 * 60_000);
    });
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    expect(api.calls('upsertCook')).toHaveLength(1);
    expect(api.calls('upsertCook')[0].payload).toEqual({ id, recipe_id: 'rc_stew', rating: null });
    expect(screen.getByTestId('cook-done').textContent).toContain('Done cooking');
    expect(screen.getByTestId('done-time').textContent).toMatch(/^12:0\d$/);
    expect(screen.getByTestId('cook-done').textContent).toContain(`Cook recorded for ${shortDate('2026-11-01')}.`);
    expect(screen.queryByRole('radio', { name: '4 stars' })).toBeNull();
    expect(localStorage.getItem(COOK_KEY)).toBeNull();
  });

  it('works with everything checked, and logs N servings to Eaten', async () => {
    const api = cookApi();
    await go('#/cook/rc_stew');
    for (const b of [...screen.getAllByTestId('check-line'), ...screen.getAllByTestId('check-step')])
      fireEvent.click(b);
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'One more serving' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }));
    expect(screen.getByTestId('log-eaten').textContent).toBe('Log 2 servings to Eaten');
    fireEvent.click(screen.getByTestId('log-eaten'));
    await settle();
    expect(api.calls('logFood')[0].payload).toMatchObject({
      date: '2026-11-01',
      slot: 'Dinner',
      recipe_id: 'rc_stew',
      qty: 2,
      unit: 'serving',
    });
    expect(screen.getByTestId('log-eaten').textContent).toBe('Logged 2 servings to Eaten (Dinner)');
    expect(screen.getByTestId('log-eaten').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('undo-cook')).toBeNull();
  });

  it('Undo this cook removes the cook', async () => {
    const api = cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    fireEvent.click(screen.getByTestId('undo-cook'));
    await settle();
    expect(api.calls('deleteCook')[0].payload).toEqual({ id: api.calls('upsertCook')[0].payload.id });
    expect(screen.getByTestId('cook-done').textContent).toContain('Cook removed.');
  });

  it('a failed save says so, keeps the cook, and Try again sends the same id', async () => {
    const api = cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getAllByTestId('check-line')[0]);
    api.answer('upsertCook', () => ({ success: false, error: 'Network error', code: 'network' }));
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    expect(screen.getByTestId('finish-failed').textContent).toBe("Couldn't save the cook.");
    expect(screen.getByTestId('finish').textContent).toBe('Try again');
    expect(screen.getAllByTestId('check-line')[0].getAttribute('aria-pressed')).toBe('true');
    expect(readCook()).not.toBeNull();
    api.answer('upsertCook', (p) => ({ success: true, data: { date: '2026-11-01', rating: null, note: '', ...p } }));
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    const [first, second] = api.calls('upsertCook');
    expect(second.payload.id).toBe(first.payload.id);
    expect(screen.getByTestId('cook-done')).toBeDefined();
  });

  it('Close returns to the recipe sheet with the history refreshed', async () => {
    const api = cookApi();
    await go('#/cook/rc_stew');
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    fireEvent.click(screen.getByTestId('done-close'));
    await act(async () => syncFromHash());
    await settle();
    expect(screen.getByTestId('nutrition-sheet')).toBeDefined();
    expect(screen.getAllByTestId('history-row')).toHaveLength(1);
    expect(api.cooks).toHaveLength(1);
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

  it('offers the sample recipes with ratings and cooks, and log mode works end to end with no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await go('#/library', true);
    // #709 added the last two, for the plan's sample.
    const rows = screen.getAllByTestId('recipe-row').slice(2);
    expect(screen.getAllByTestId('recipe-row').map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Overnight oats',
      'Weeknight chili',
      'One-Pot Chili',
      'Banana Bread',
      'Sheet-Pan Chicken',
      'Turkey Taco Lettuce Wraps',
      'Beef Stew',
    ]);
    expect(within(rows[2]).getByTestId('rate-chip')).toBeDefined();
    expect(rows[1].textContent).toContain('never cooked');
    expect(within(rows[4]).getByRole('img', { name: '4 of 5 stars' })).toBeDefined();

    fireEvent.click(screen.getByText('Beef Stew'));
    await settle();
    fireEvent.click(screen.getByTestId('cook-btn'));
    const choice = screen.getByTestId('cook-choice');
    expect(within(choice).getByTestId('mode-walkthrough').hasAttribute('disabled')).toBe(false);
    fireEvent.click(within(choice).getByTestId('mode-log'));
    fireEvent.click(within(choice).getByRole('button', { name: 'Continue' }));
    await act(async () => syncFromHash());
    await settle();
    expect(screen.getByTestId('log-mode')).toBeDefined();
    fireEvent.click(screen.getByTestId('finish'));
    await settle();
    fireEvent.click(screen.getByTestId('log-eaten'));
    await settle();
    expect(screen.getByTestId('log-eaten').textContent).toMatch(/^Logged 1 serving to Eaten/);
    fireEvent.click(screen.getByTestId('done-close'));
    await act(async () => syncFromHash());
    await settle();
    expect(screen.getByText('Cooked 3 times')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the stylesheet (#708)', () => {
  it('checklist rows are 56px or more, stars and controls 44px, and the timer and sort rows scroll on purpose', async () => {
    const { readGlobalCss, rule } = await import('../test-css');
    const css = readGlobalCss();
    expect(rule(css, '.check-row')).toContain('min-height: 56px');
    expect(rule(css, '.star-btn')).toContain('height: var(--touch-target)');
    expect(rule(css, '.mode-card')).toContain('min-height: var(--touch-target)');
    expect(rule(css, '.cook-actions .btn')).toContain('min-height: 52px');
    expect(rule(css, '.timer-row')).toContain('overflow-x: auto');
    expect(rule(css, '.sort-chips')).toContain('overflow-x: auto');
    expect(rule(css, '.check-text')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.cook-actions')).toContain('max-width: var(--column-width)');
  });
});
