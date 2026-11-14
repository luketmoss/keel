// #883 in the app: the ＋ Serving pill in the inline amount editor, the panel for a vague `serving` and for weighing
// your own, the validation, the switch of the entry, the toast, Library's copy of the food, and a failed save.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { Food, FoodLogEntry } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods, libraryFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { toastText } from '../ui/toast';
import { _resetEaten } from './eaten-store';
import { fieldNumber, labelServing, nameProblem, vagueServing, withLabelServing } from './serving-edit';

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

const ALMOND = food('fd_alm', 'Almond butter', {
  kcal_100g: 600,
  protein_100g: 20,
  carbs_100g: 20,
  fat_100g: 50,
  servings_json: [{ name: 'serving', g: 32 }],
});
const OIL = food('fd_oil', 'Olive oil', {
  kcal_100g: 884,
  protein_100g: 0,
  carbs_100g: 0,
  fat_100g: 100,
  servings_json: [{ name: 'tbsp', g: 14 }],
});

function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Breakfast',
    food_id: 'fd_alm',
    recipe_id: '',
    qty: 0.5,
    unit: 'serving',
    grams: 16,
    kcal: 96,
    protein_g: 3.2,
    carbs_g: 3.2,
    fat_g: 8,
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
const type = (row: HTMLElement, id: string, value: string) =>
  fireEvent.input(within(row).getByTestId(id), { target: { value } });
const upserts = (api: ReturnType<typeof fakeApi>) => api.calls('upsertFood');
const saves = (api: ReturnType<typeof fakeApi>) =>
  api.calls('updateLogEntry').filter((c) => !(c.payload as { dry_run?: boolean }).dry_run);

async function openEditor(api: ReturnType<typeof fakeApi>) {
  api.foods.push(ALMOND, OIL);
  api.log.push(
    entry({}),
    entry({ id: 'lg_old', qty: 1, unit: 'serving', grams: 32, kcal: 192, logged_at: '2026-11-02T14:00:00Z' }),
  );
  await open();
  const row = rows().find((r) => chipOf(r).textContent?.startsWith('½')) as HTMLElement;
  fireEvent.click(chipOf(row));
  await settle();
  return row;
}

describe('the arithmetic', () => {
  it('knows a vague serving, reads numbers, and refuses names', () => {
    expect(vagueServing(ALMOND)?.g).toBe(32);
    expect(vagueServing(food('x', 'X', { servings_json: [{ name: 'SERVING', g: 5 }] }))).not.toBeNull();
    expect(
      vagueServing(
        food('x', 'X', {
          servings_json: [
            { name: 'cup', g: 5 },
            { name: 'serving', g: 5 },
          ],
        }),
      ),
    ).toBeNull();
    expect(vagueServing(food('x', 'X'))).toBeNull();
    expect(['2', ' 1.5 ', '0,5', '.5'].map(fieldNumber)).toEqual([2, 1.5, 0.5, 0.5]);
    expect(['', '0', '-1', 'abc', '2 tbsp'].map(fieldNumber)).toEqual([null, null, null, null, null]);
    expect(nameProblem(OIL, 'Olive oil', 'TBSP')).toBe('Olive oil already has a “TBSP”.');
    expect(nameProblem(OIL, 'Olive oil', 'g')).toBe('Grams are always there. Name a portion instead.');
    expect(nameProblem(OIL, 'Olive oil', 'Grams')).toBe('Grams are always there. Name a portion instead.');
    expect(nameProblem(OIL, 'Olive oil', 'bowl')).toBeNull();
  });

  it('turns 2 tbsp in 32 g into 1 tbsp = 16 g and renames the serving', () => {
    const l = labelServing({ name: 'serving', g: 32 }, '2', 'tbsp')!;
    expect(l).toEqual({ unit: 'tbsp', label: '2 tbsp', grams: 16 });
    expect(withLabelServing(ALMOND, l)).toEqual([
      { name: '2 tbsp', g: 32 },
      { name: 'tbsp', g: 16 },
    ]);
    expect(labelServing({ name: 'serving', g: 32 }, '', 'tbsp')).toBeNull();
    expect(labelServing({ name: 'serving', g: 32 }, '0', 'tbsp')).toBeNull();
  });
});

describe('the ＋ Serving pill and the vague serving line', () => {
  it('shows the pill after the unit pills and, for a vague serving, the line with Say what it is', async () => {
    const api = fakeApi();
    const row = await openEditor(api);
    const pills = within(row).getByRole('group', { name: 'Unit' });
    const labels = Array.from(pills.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels[labels.length - 1]).toBe('＋ Serving');
    expect(within(row).getByTestId('add-serving').getAttribute('aria-expanded')).toBe('false');
    expect(within(row).getByTestId('vague-serving').textContent).toContain("“serving” isn't a real amount.");
    fireEvent.click(within(row).getByTestId('say-what'));
    expect(within(row).getByTestId('serving-panel')).toBeDefined();
    expect(within(row).queryByTestId('vague-serving')).toBeNull();
  });

  it('the pill opens the same panel, and a food with a real serving has no line and no label block', async () => {
    const api = fakeApi();
    api.foods.push(OIL);
    api.log.push(entry({ food_id: 'fd_oil', qty: 1, unit: 'tbsp', grams: 14, kcal: 124 }));
    await open();
    const [row] = rows();
    fireEvent.click(chipOf(row));
    await settle();
    expect(within(row).queryByTestId('vague-serving')).toBeNull();
    fireEvent.click(within(row).getByTestId('add-serving'));
    expect(within(row).getByTestId('add-serving').getAttribute('aria-expanded')).toBe('true');
    expect(within(row).getByText('New serving for Olive oil')).toBeDefined();
    expect(within(row).queryByTestId('serving-label-add')).toBeNull();
    expect(within(row).getByTestId('serving-own-add').className).toContain('btn-primary');
  });
});

describe('what is 1 serving on the label', () => {
  it('previews, then saves the food once and switches the entry to 1 tbsp (16 g), with the toast', async () => {
    const api = fakeApi();
    const row = await openEditor(api);
    fireEvent.click(within(row).getByTestId('say-what'));
    expect(within(row).getByText('What is 1 serving (32 g) on the label?')).toBeDefined();
    expect((within(row).getByTestId('serving-qty') as HTMLInputElement).value).toBe('2');
    expect((within(row).getByTestId('serving-unit') as HTMLInputElement).value).toBe('tbsp');
    expect(within(row).getByTestId('serving-label-line').textContent).toBe(
      'Adds 1 tbsp = 16 g, and renames the serving “2 tbsp”.',
    );
    expect(within(row).getByTestId('serving-label-add').textContent).toBe('Add tbsp');
    fireEvent.click(within(row).getByTestId('serving-label-add'));
    await settle();

    expect(upserts(api)).toHaveLength(1);
    expect(upserts(api)[0].payload).toEqual({
      id: 'fd_alm',
      servings_json: [
        { name: '2 tbsp', g: 32 },
        { name: 'tbsp', g: 16 },
      ],
    });
    expect(saves(api)).toHaveLength(1);
    expect(saves(api)[0].payload).toEqual({ id: 'lg_1', changes: { qty: 1, unit: 'tbsp' } });
    const now = rows().find((r) =>
      within(r).queryByTestId('amount-chip')?.textContent?.startsWith('1 tbsp'),
    ) as HTMLElement;
    expect(chipOf(now).textContent).toBe('1 tbsp · 16 g');
    expect(within(now).queryByTestId('serving-panel')).toBeNull();
    expect(within(now).getByTestId('amount-editor')).toBeDefined();
    const pills = within(now).getByRole('group', { name: 'Unit' });
    expect(within(pills).queryByRole('button', { name: /^serving/ })).toBeNull();
    expect(within(pills).getByRole('button', { name: 'tbsp (16 g)' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(pills).getByRole('button', { name: '2 tbsp (32 g)' })).toBeDefined();
    expect(screen.getByTestId('toast').textContent).toBe('Added tbsp (16 g) to Almond butter');
    expect(api.foods.find((f) => f.id === 'fd_alm')?.servings_json).toEqual([
      { name: '2 tbsp', g: 32 },
      { name: 'tbsp', g: 16 },
    ]);
  });

  it('puts the saved food into Library without a reload and leaves an earlier entry as stored', async () => {
    const api = fakeApi();
    await openEditor(api);
    const row = rows().find((r) => chipOf(r).textContent?.startsWith('½')) as HTMLElement;
    fireEvent.click(within(row).getByTestId('say-what'));
    fireEvent.click(within(row).getByTestId('serving-label-add'));
    await settle();
    expect(libraryFoods.value.find((f) => f.id === 'fd_alm')?.servings_json?.map((s) => s.name)).toEqual([
      '2 tbsp',
      'tbsp',
    ]);
    expect(api.log.find((e) => e.id === 'lg_old')).toMatchObject({ unit: 'serving', qty: 1, grams: 32, kcal: 192 });
  });

  it('refuses a name the food has, and g or grams, with the button disabled', async () => {
    const api = fakeApi();
    const row = await openEditor(api);
    fireEvent.click(within(row).getByTestId('say-what'));
    const add = () => within(row).getByTestId('serving-label-add') as HTMLButtonElement;
    type(row, 'serving-unit', 'serving');
    expect(within(row).getByTestId('serving-label-problem').textContent).toBe('Almond butter already has a “serving”.');
    expect(add().disabled).toBe(true);
    type(row, 'serving-unit', 'g');
    expect(within(row).getByTestId('serving-label-problem').textContent).toBe(
      'Grams are always there. Name a portion instead.',
    );
    expect(add().disabled).toBe(true);
    type(row, 'serving-unit', 'Grams');
    expect(add().disabled).toBe(true);
    type(row, 'serving-unit', 'tbsp');
    type(row, 'serving-qty', '');
    expect(within(row).getByTestId('serving-label-line').textContent).toBe("Type the label's serving, like 2 tbsp.");
    expect(add().disabled).toBe(true);
    expect(add().textContent).toBe('Add it');
    expect(upserts(api)).toHaveLength(0);
  });
});

describe('weigh your own', () => {
  it('adds bowl at 60 g with the line, and switches the entry to it at the same weight, to 0.25', async () => {
    const api = fakeApi();
    const row = await openEditor(api);
    fireEvent.click(within(row).getByTestId('say-what'));
    expect(within(row).getByTestId('serving-own-add').className).toContain('btn-secondary');
    expect(within(row).getByTestId('serving-own-line').textContent).toBe(
      "Weigh it once, name it, and it's a serving from now on.",
    );
    type(row, 'serving-own-name', 'bowl');
    type(row, 'serving-own-grams', '60');
    expect(within(row).getByTestId('serving-own-line').textContent).toBe('1 bowl = 60 g · 360 kcal');
    fireEvent.click(within(row).getByTestId('serving-own-add'));
    await settle();
    expect(upserts(api)[0].payload).toEqual({
      id: 'fd_alm',
      servings_json: [
        { name: 'serving', g: 32 },
        { name: 'bowl', g: 60 },
      ],
    });
    // 16 g is 0.27 bowl: the nearest 0.25.
    expect(saves(api)[0].payload).toEqual({ id: 'lg_1', changes: { qty: 0.25, unit: 'bowl' } });
    const now = rows().find((r) => chipOf(r).textContent?.includes('bowl')) as HTMLElement;
    expect(chipOf(now).textContent).toBe('¼ bowl · 15 g');
    expect(screen.getByTestId('toast').textContent).toBe('Added bowl (60 g) to Almond butter');
  });

  it('refuses a duplicate, grams that are not above 0 or over 5000, and shows the footnote', async () => {
    const api = fakeApi();
    api.foods.push(OIL);
    api.log.push(entry({ food_id: 'fd_oil', qty: 1, unit: 'tbsp', grams: 14, kcal: 124 }));
    await open();
    const [row] = rows();
    fireEvent.click(chipOf(row));
    await settle();
    fireEvent.click(within(row).getByTestId('add-serving'));
    const add = () => within(row).getByTestId('serving-own-add') as HTMLButtonElement;
    expect(row.textContent).toContain("Saved to Olive oil, so it's there next time. Past days don't change.");
    type(row, 'serving-own-name', 'Tbsp');
    type(row, 'serving-own-grams', '10');
    expect(within(row).getByTestId('serving-own-problem').textContent).toBe('Olive oil already has a “Tbsp”.');
    expect(add().disabled).toBe(true);
    type(row, 'serving-own-name', 'cup');
    expect(add().disabled).toBe(false);
    type(row, 'serving-own-grams', '0');
    expect(add().disabled).toBe(true);
    type(row, 'serving-own-grams', '5001');
    expect(add().disabled).toBe(true);
    type(row, 'serving-own-grams', '5000');
    expect(add().disabled).toBe(false);
    expect(upserts(api)).toHaveLength(0);
  });
});

describe('failures', () => {
  it('a failed food save keeps the panel and what was typed, with the message', async () => {
    const api = fakeApi();
    const row = await openEditor(api);
    fireEvent.click(within(row).getByTestId('say-what'));
    type(row, 'serving-qty', '3');
    type(row, 'serving-unit', 'scoop');
    api.answer('upsertFood', () => ({ success: false, error: 'boom' }));
    fireEvent.click(within(row).getByTestId('serving-label-add'));
    await settle();
    expect(within(row).getByTestId('serving-error').textContent).toBe("Couldn't save the serving. Try again.");
    expect(within(row).getByTestId('serving-panel')).toBeDefined();
    expect((within(row).getByTestId('serving-qty') as HTMLInputElement).value).toBe('3');
    expect((within(row).getByTestId('serving-unit') as HTMLInputElement).value).toBe('scoop');
    expect((within(row).getByTestId('serving-label-add') as HTMLButtonElement).disabled).toBe(false);
    expect(saves(api)).toHaveLength(0);
    expect(screen.getByTestId('toast').textContent).toBe('');
  });

  it('a saved food with a failed entry update keeps the serving and shows the editor error', async () => {
    const api = fakeApi();
    const row = await openEditor(api);
    fireEvent.click(within(row).getByTestId('say-what'));
    api.answer('updateLogEntry', () => ({ success: false, error: 'boom' }));
    fireEvent.click(within(row).getByTestId('serving-label-add'));
    await settle();
    const now = rows().find((r) => within(r).queryByTestId('amount-editor')) as HTMLElement;
    expect(within(now).getByTestId('editor-error').textContent).toBe("Couldn't save. Try again.");
    expect(within(now).queryByTestId('serving-panel')).toBeNull();
    expect(within(now).getByRole('button', { name: 'tbsp (16 g)' }).getAttribute('aria-pressed')).toBe('true');
    expect(api.foods.find((f) => f.id === 'fd_alm')?.servings_json?.map((s) => s.name)).toEqual(['2 tbsp', 'tbsp']);
    expect(screen.getByTestId('toast').textContent).toBe('');
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

  it('weighs your own with no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await open(true);
    const first = screen.getAllByTestId('amount-chip')[0].closest('li') as HTMLElement;
    fireEvent.click(chipOf(first));
    await settle();
    fireEvent.click(within(first).getByTestId('add-serving'));
    type(first, 'serving-own-name', 'heap');
    type(first, 'serving-own-grams', '80');
    fireEvent.click(within(first).getByTestId('serving-own-add'));
    await settle();
    expect(screen.getByTestId('toast').textContent).toMatch(/^Added heap \(80 g\) to /);
    expect(screen.getAllByTestId('amount-chip').some((c) => c.textContent?.includes('heap'))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
