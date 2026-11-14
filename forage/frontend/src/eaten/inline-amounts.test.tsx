// #882 in the app: the amount chip on an entry row and the inline editor under it (stepper, unit pills, Done), the
// one dry-run preview, the save on Done or when the editor is left, and its failure. The Amount sheet is #712's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import App from '../App';
import type { Food, FoodLogEntry } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { toastText } from '../ui/toast';
import { fractionQty, stepQty, switchUnit, unitOptions } from './amount-edit';
import { _resetEaten } from './eaten-store';

const env = import.meta.env as Record<string, string | undefined>;
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
  kcal_100g: 61.2,
  protein_100g: 2.45,
  carbs_100g: 3.67,
  fat_100g: 0.16,
  servings_json: [{ name: 'cup', g: 245 }],
});
const OIL = food('fd_oil', 'Olive oil', {
  kcal_100g: 884,
  protein_100g: 0,
  carbs_100g: 0,
  fat_100g: 100,
  servings_json: [
    { name: 'tbsp', g: 14 },
    { name: 'tsp', g: 4.6 },
  ],
});

function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Breakfast',
    food_id: 'fd_yog',
    recipe_id: '',
    qty: 1,
    unit: 'cup',
    grams: 245,
    kcal: 149.9,
    protein_g: 6,
    carbs_g: 9,
    fat_g: 0.4,
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
  toastText.value = null;
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

const rows = () => screen.getAllByTestId('entry-row');
const chipOf = (row: HTMLElement) => within(row).getByTestId('amount-chip');
const editorIn = (row: HTMLElement) => within(row).queryByTestId('amount-editor');
const press = (row: HTMLElement, name: string) => fireEvent.click(within(row).getByRole('button', { name }));
const dryRuns = (api: ReturnType<typeof fakeApi>) =>
  api.calls('updateLogEntry').filter((c) => (c.payload as { dry_run?: boolean }).dry_run);
const saves = (api: ReturnType<typeof fakeApi>) =>
  api.calls('updateLogEntry').filter((c) => !(c.payload as { dry_run?: boolean }).dry_run);

describe('the arithmetic', () => {
  it('steps a serving by 0.25 below 1 and 0.5 from 1, never below 0.25, and grams by 5, never below 5', () => {
    expect(stepQty(0.75, 'cup', 1)).toBe(1);
    expect(stepQty(1, 'cup', 1)).toBe(1.5);
    expect(stepQty(1, 'cup', -1)).toBe(0.75);
    expect(stepQty(1.5, 'cup', -1)).toBe(1);
    expect(stepQty(0.25, 'cup', -1)).toBe(0.25);
    expect(stepQty(99, 'cup', 1)).toBe(99);
    expect(stepQty(100, 'g', 1)).toBe(105);
    expect(stepQty(5, 'g', -1)).toBe(5);
  });

  it('keeps the weight across units, to the nearest 0.25 serving or 5 g', () => {
    const options = unitOptions(entry({ food_id: 'fd_oil', unit: 'tbsp', grams: 14 }), OIL);
    const [tbsp, tsp, g] = [options[0], options[1], options[2]];
    expect(options.map((o) => o.label)).toEqual(['tbsp (14 g)', 'tsp (4.6 g)', 'grams']);
    expect(switchUnit(1, tbsp, g)).toBe(15);
    expect(switchUnit(100, g, tbsp)).toBe(7.25);
    expect(switchUnit(1, tbsp, tsp)).toBe(3);
    expect(switchUnit(0.25, tsp, g)).toBe(5);
  });

  it('writes quantities as fractions where exact', () => {
    expect([0.25, 0.5, 0.75, 1, 1.5, 2.25, 0.33].map(fractionQty)).toEqual(['¼', '½', '¾', '1', '1½', '2¼', '0.33']);
  });
});

describe('the amount chip', () => {
  it('shows the serving and grams, only grams for a gram entry, 1 serving for a recipe, and none for a removed food', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT, OIL);
    api.log.push(
      entry({ id: 'lg_1', qty: 0.5, grams: 122.5, kcal: 75 }),
      entry({
        id: 'lg_2',
        food_id: 'fd_oil',
        qty: 15,
        unit: 'g',
        grams: 15,
        kcal: 133,
        logged_at: '2026-11-02T15:01:00Z',
      }),
      entry({
        id: 'lg_3',
        food_id: 'fd_gone',
        qty: 1,
        unit: 'cup',
        grams: 100,
        kcal: 50,
        logged_at: '2026-11-02T15:02:00Z',
      }),
    );
    await open();
    const [a, b, c] = rows();
    expect(chipOf(a).textContent).toBe('½ cup · 123 g');
    expect(chipOf(a).getAttribute('aria-label')).toBe('Amount, ½ cup, 123 grams. Edit');
    expect(chipOf(a).getAttribute('aria-expanded')).toBe('false');
    expect(chipOf(b).textContent).toBe('15 g');
    expect(within(c).queryByTestId('amount-chip')).toBeNull();
    expect(c.textContent).toContain('A removed food');
    expect(c.textContent).toContain('1 cup · 100 g');
  });

  it("a recipe entry's chip reads 1 serving and its editor has no unit pills", async () => {
    const api = fakeApi();
    api.recipes.push({
      id: 'rc_stew',
      name: 'Beef Stew',
      servings: 6,
      nutrition: { per_serving: { kcal: 412, protein_g: 30, carbs_g: 20, fat_g: 18 }, missing: [], partial: false },
      partial: false,
    } as never);
    api.log.push(entry({ food_id: '', recipe_id: 'rc_stew', qty: 1, unit: 'serving', grams: null, kcal: 412 }));
    await open();
    const [row] = rows();
    expect(chipOf(row).textContent).toBe('1 serving');
    fireEvent.click(chipOf(row));
    await settle();
    expect(editorIn(row)).not.toBeNull();
    expect(within(row).queryByRole('group', { name: 'Unit' })).toBeNull();
  });

  it('opens the editor from the chip and the Amount sheet from the rest of the row', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(entry({}));
    await open();
    const [row] = rows();
    fireEvent.click(within(row).getByTestId('entry-open'));
    await settle();
    expect(screen.getByTestId('amount-sheet')).toBeDefined();
    expect(editorIn(row)).toBeNull();
  });
});

describe('the inline editor', () => {
  async function twoRows() {
    const api = fakeApi();
    api.foods.push(YOGURT, OIL);
    api.log.push(
      entry({ id: 'lg_1' }),
      entry({
        id: 'lg_2',
        food_id: 'fd_oil',
        qty: 1,
        unit: 'tbsp',
        grams: 14,
        kcal: 123.8,
        logged_at: '2026-11-02T15:01:00Z',
      }),
    );
    await open();
    return api;
  }

  it('opens under its row, and opening another closes the first with no request when nothing changed', async () => {
    const api = await twoRows();
    fireEvent.click(chipOf(rows()[0]));
    await settle();
    expect(editorIn(rows()[0])).not.toBeNull();
    expect(chipOf(rows()[0]).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chipOf(rows()[1]));
    await settle();
    expect(editorIn(rows()[0])).toBeNull();
    expect(editorIn(rows()[1])).not.toBeNull();
    expect(screen.getAllByTestId('amount-editor')).toHaveLength(1);
    expect(api.calls('updateLogEntry')).toHaveLength(0);
    fireEvent.click(within(rows()[1]).getByTestId('editor-done'));
    await settle();
    expect(screen.queryAllByTestId('amount-editor')).toHaveLength(0);
    expect(api.calls('updateLogEntry')).toHaveLength(0);
  });

  it('lists the servings in order then grams, and steps; the chip follows at once and one dry run follows the last change', async () => {
    const api = await twoRows();
    const [, oil] = rows();
    fireEvent.click(chipOf(oil));
    await settle();
    const pills = within(oil).getByRole('group', { name: 'Unit' });
    expect(Array.from(pills.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'tbsp (14 g)',
      'tsp (4.6 g)',
      'grams',
      '＋ Serving',
    ]);
    expect(within(pills).getByRole('button', { name: 'tbsp (14 g)' }).getAttribute('aria-pressed')).toBe('true');

    press(oil, 'More');
    press(oil, 'More');
    press(oil, 'More');
    expect(within(oil).getByTestId('editor-qty').textContent).toBe('2½');
    expect(chipOf(oil).textContent).toBe('2½ tbsp · 35 g');
    // Calories are the stored ones until the preview answers.
    expect(oil.textContent).toContain('124');
    await new Promise((r) => setTimeout(r, 200));
    expect(dryRuns(api)).toHaveLength(0);
    await waitFor(() => expect(oil.textContent).toContain('309'), { timeout: 2000 });
    expect(dryRuns(api)).toHaveLength(1);
    expect(dryRuns(api)[0].payload).toEqual({ id: 'lg_2', changes: { qty: 2.5, unit: 'tbsp' }, dry_run: true });
    expect(saves(api)).toHaveLength(0);
  });

  it('switching unit keeps the weight', async () => {
    const api = await twoRows();
    const [, oil] = rows();
    fireEvent.click(chipOf(oil));
    await settle();
    press(oil, 'grams');
    expect(within(oil).getByTestId('editor-qty').textContent).toBe('15');
    expect(chipOf(oil).textContent).toBe('15 g');
    press(oil, 'More');
    expect(within(oil).getByTestId('editor-qty').textContent).toBe('20');
    press(oil, 'tsp (4.6 g)');
    // 20 g is 4.35 tsp, to the nearest 0.25.
    expect(within(oil).getByTestId('editor-qty').textContent).toBe('4¼');
    expect(api.calls('updateLogEntry')).toHaveLength(0);
  });

  it('Done saves a changed amount: the stored entry is on the row, the editor closes, no toast, the totals refresh', async () => {
    const api = await twoRows();
    const [row] = rows();
    const before = api.calls('getFoodLogTotals').length;
    fireEvent.click(chipOf(row));
    await settle();
    press(row, 'More');
    fireEvent.click(within(row).getByTestId('editor-done'));
    await settle();
    expect(saves(api)).toHaveLength(1);
    expect(saves(api)[0].payload).toEqual({ id: 'lg_1', changes: { qty: 1.5 } });
    expect(screen.queryAllByTestId('amount-editor')).toHaveLength(0);
    expect(chipOf(rows()[0]).textContent).toBe('1½ cup · 368 g');
    expect(rows()[0].textContent).toContain('225');
    expect(screen.getByTestId('toast').textContent).toBe('');
    expect(api.calls('getFoodLogTotals').length).toBeGreaterThan(before);
    expect(screen.getByTestId('day-kcal').textContent).toBe('349');
  });

  it('a failed save keeps the editor open with the error and the stored figures, and Done tries again', async () => {
    const api = await twoRows();
    fireEvent.click(chipOf(rows()[0]));
    await settle();
    press(rows()[0], 'More');
    api.answer('updateLogEntry', () => ({ success: false, error: 'boom' }));
    fireEvent.click(within(rows()[0]).getByTestId('editor-done'));
    await settle();
    expect(within(rows()[0]).getByTestId('editor-error').textContent).toBe("Couldn't save. Try again.");
    expect(editorIn(rows()[0])).not.toBeNull();
    expect(within(rows()[0]).getByTestId('editor-done').getAttribute('aria-busy')).toBe('false');
    expect(rows()[0].textContent).toContain('150');
  });

  it('moving to another day with an unsaved change saves it first, and a failed save keeps the day', async () => {
    const api = await twoRows();
    fireEvent.click(chipOf(rows()[0]));
    await settle();
    press(rows()[0], 'More');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(saves(api)).toHaveLength(1);
    expect(saves(api)[0].payload).toEqual({ id: 'lg_1', changes: { qty: 1.5 } });
    expect(screen.getByTestId('eaten-day').textContent).toBe('Yesterday');
    expect(api.log[0].qty).toBe(1.5);
  });

  it('stays on the day when the save fails', async () => {
    const api = await twoRows();
    fireEvent.click(chipOf(rows()[0]));
    await settle();
    press(rows()[0], 'More');
    api.answer('updateLogEntry', () => ({ success: false, error: 'boom' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(screen.getByTestId('eaten-day').textContent).toBe('Today');
    expect(within(rows()[0]).getByTestId('editor-error')).toBeDefined();
  });

  it('opening another editor, or the Amount sheet, saves a pending change first', async () => {
    const api = await twoRows();
    fireEvent.click(chipOf(rows()[0]));
    await settle();
    press(rows()[0], 'More');
    fireEvent.click(chipOf(rows()[1]));
    await settle();
    expect(saves(api)).toHaveLength(1);
    expect(editorIn(rows()[1])).not.toBeNull();
    press(rows()[1], 'More');
    fireEvent.click(within(rows()[0]).getByTestId('entry-open'));
    await settle();
    expect(saves(api)).toHaveLength(2);
    expect(screen.getByTestId('amount-sheet')).toBeDefined();
  });

  it('an entry whose unit the food no longer has offers it first, labelled from the entry', async () => {
    const api = fakeApi();
    api.foods.push(YOGURT);
    api.log.push(entry({ unit: 'serving', qty: 2, grams: 64, kcal: 39 }));
    await open();
    const [row] = rows();
    expect(chipOf(row).textContent).toBe('2 serving · 64 g');
    fireEvent.click(chipOf(row));
    await settle();
    const pills = within(row).getByRole('group', { name: 'Unit' });
    expect(Array.from(pills.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'serving (32 g)',
      'cup (245 g)',
      'grams',
      '＋ Serving',
    ]);
    expect(within(pills).getByRole('button', { name: 'serving (32 g)' }).getAttribute('aria-pressed')).toBe('true');
    press(row, 'cup (245 g)');
    // 64 g is 0.26 cup: the nearest 0.25.
    expect(within(row).getByTestId('editor-qty').textContent).toBe('¼');
  });

  it('keeps nothing wider than the screen and the controls at 44px', () => {
    const css = readGlobalCss();
    expect(rule(css, '.amount-editor-step')).toContain('flex-wrap: wrap');
    expect(rule(css, '.amount-chip')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.amount-chip::after')).toContain('inset: -8px 0');
    expect(rule(css, '.chip')).toContain('min-height: var(--touch-target)');
    expect(rule(css, '.icon-btn')).toContain('width: var(--touch-target)');
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

  it('edits an amount in place with no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await open(true);
    const row = screen.getAllByTestId('amount-chip')[0].closest('li') as HTMLElement;
    const before = chipOf(row).textContent;
    fireEvent.click(chipOf(row));
    await settle();
    press(row, 'More');
    const changed = chipOf(row).textContent;
    expect(changed).not.toBe(before);
    fireEvent.click(within(row).getByTestId('editor-done'));
    await settle();
    expect(screen.queryAllByTestId('amount-editor')).toHaveLength(0);
    expect(chipOf(screen.getAllByTestId('amount-chip')[0].closest('li') as HTMLElement).textContent).toBe(changed);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
