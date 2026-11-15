// #886: swap a food in a usual's group, make a swapped line a pick-one, and save a usual from a meal. Driven against the
// demo API, whose usuals and groups stand in for #877 and #878.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry } from '../api/types';
import { createDemoApi } from '../demo/demo-api';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { Toast, toastAction, toastText } from '../ui/toast';
import { _resetLookback } from './copy-meal';
import { EatenScreen } from './eaten-screen';
import { _resetEaten } from './eaten-store';
import { amountText, swapAmount, swapSections } from './swap';

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

async function mount(api: ForageApi) {
  window.history.replaceState(null, '', '/#/eaten');
  render(
    <>
      <EatenScreen api={api} />
      <Toast />
    </>,
  );
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  _resetEaten();
  _resetLookback();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
  toastText.value = null;
  toastAction.value = null;
});

afterEach(() => {
  cleanup();
});

const card = (slot: string) =>
  screen.getAllByTestId('meal-card').find((c) => c.querySelector('h2')!.textContent === slot)!;
const toast = () => screen.getByTestId('toast').textContent;
const rowNames = (g: HTMLElement) =>
  within(g)
    .getAllByTestId('entry-row')
    .map((r) => r.querySelector('.recipe-name')!.textContent);

async function logUsual(slot: string, name: string) {
  fireEvent.click(within(card(slot)).getByTestId('add-to-meal'));
  await settle();
  const row = within(screen.getByTestId('add-sheet'))
    .getAllByTestId('usual-result')
    .find((r) => r.querySelector('.recipe-name')!.textContent === name)!;
  fireEvent.click(row);
  await settle();
  // #933: the usual is in the tray; the footer saves it.
  fireEvent.click(within(screen.getByTestId('add-sheet')).getByTestId('tray-save'));
  await settle();
  const groups = within(card(slot)).getAllByTestId('group');
  return groups[groups.length - 1];
}

const swapOn = (g: HTMLElement, food: string) =>
  within(g)
    .getAllByTestId('entry-row')
    .find((r) => r.querySelector('.recipe-name')!.textContent === food)!
    .querySelector<HTMLElement>('[data-testid="swap-entry"]');

async function openSwap(g: HTMLElement, food: string) {
  fireEvent.click(swapOn(g, food)!);
  await settle();
  return screen.getByTestId('swap-sheet');
}

const pickRow = (sheet: HTMLElement, food: string) =>
  within(sheet)
    .getAllByTestId('swap-row')
    .find((r) => r.querySelector('.recipe-name')!.textContent === food)!;

describe('the swap amount', () => {
  const entry = { unit: 'serving', qty: 0.5, grams: 16 } as FoodLogEntry;
  const food = (servings: { name: string; g: number }[]) => ({ servings_json: servings }) as Food;

  it('keeps the quantity when the new food has a serving of that name', () => {
    expect(swapAmount({ ...entry, unit: 'tbsp', qty: 1 } as FoodLogEntry, food([{ name: 'tbsp', g: 14 }]))).toEqual({
      qty: 1,
      unit: 'tbsp',
    });
  });

  it('otherwise keeps the weight in the first serving, to the nearest quarter', () => {
    expect(swapAmount(entry, food([{ name: 'tbsp', g: 16 }]))).toEqual({ qty: 1, unit: 'tbsp' });
    expect(swapAmount(entry, food([{ name: 'cup', g: 100 }]))).toEqual({ qty: 0.25, unit: 'cup' });
    expect(amountText({ qty: 1.5, unit: 'cup' })).toBe('1½ cup');
  });

  it('keeps grams as grams, and falls back to grams for a food with no serving', () => {
    expect(swapAmount({ ...entry, unit: 'g', qty: 40 } as FoodLogEntry, food([{ name: 'cup', g: 100 }]))).toEqual({
      qty: 40,
      unit: 'g',
    });
    expect(swapAmount(entry, food([]))).toEqual({ qty: 16, unit: 'g' });
  });

  it('orders the sections: your usual, swapped in before (most first), then any food', () => {
    const f = (id: string, name: string) => ({ id, name, servings_json: [] }) as unknown as Food;
    const foods = [f('a', 'Almond'), f('b', 'Banana'), f('c', 'Cashew'), f('d', 'Date')];
    const line = { food_id: 'a', options: null } as never;
    const swapped = { food_id: 'b' } as FoodLogEntry;
    const s = swapSections(
      swapped,
      line,
      [
        { food_id: 'd', count: 1 },
        { food_id: 'c', count: 4 },
      ],
      foods,
      '',
    );
    expect(s.usual?.id).toBe('a');
    expect(s.before.map((x) => [x.food.id, x.count])).toEqual([
      ['c', 4],
      ['d', 1],
    ]);
    expect(s.any).toEqual([]);
    expect(swapSections(swapped, line, [], foods, 'ca').any.map((x) => x.id)).toEqual(['c']);
  });
});

describe('⇄ swap', () => {
  it('is on every Always entry of a usual group, and not on a pick-one, a loose entry or a group with no usual', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    const found = within(group)
      .getAllByTestId('entry-row')
      .map((r) => [r.querySelector('.recipe-name')!.textContent, !!r.querySelector('[data-testid="swap-entry"]')]);
    expect(found).toEqual([
      ['Rolled oats', true],
      ['Almond butter', true],
      ['Blueberries', false],
      ['Milk, 2%', true],
    ]);
    expect(within(group).getByLabelText('Swap Almond butter')).toBeTruthy();

    // A loose entry and a group with no usual.
    await api.logEntry({
      id: 'lg_loose',
      date: new Date().toLocaleDateString('en-CA'),
      slot: 'Lunch',
      food_id: 'fd_demo_banana',
      qty: 1,
      unit: 'medium',
    });
    await api.logGroup({
      date: new Date().toLocaleDateString('en-CA'),
      slot: 'Lunch',
      name: 'Snack plate',
      items: [{ food_id: 'fd_demo_oats', qty: 1, unit: 'cup' }],
    });
    cleanup();
    _resetEaten();
    await mount(api);
    expect(within(card('Lunch')).queryAllByTestId('swap-entry')).toHaveLength(0);
  });

  it('opens a sheet with the note, a search and the library rows, each with its amount and kcal', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    const sheet = await openSwap(group, 'Almond butter');
    expect(within(sheet).getByText('Swap Almond butter')).toBeTruthy();
    expect(within(sheet).getByTestId('swap-note').textContent).toBe(
      'Just for this day. Your Oatmeal usual stays as it is.',
    );
    expect(within(sheet).queryByText('Your usual')).toBeNull();
    expect(within(sheet).queryByText('Swapped in before')).toBeNull();
    expect(within(sheet).getByText('Or any food')).toBeTruthy();
    const rows = within(sheet).getAllByTestId('swap-row');
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const r of rows) {
      expect(r.textContent).toMatch(/\d kcal$|—$/);
      expect(r.querySelector('.recipe-meta')!.textContent).toBeTruthy();
    }
    // Search filters by name and short name, and the last section reads Foods.
    fireEvent.input(within(sheet).getByTestId('swap-q'), { target: { value: 'peanut' } });
    await settle();
    expect(within(sheet).getByText('Foods')).toBeTruthy();
    expect(
      within(sheet)
        .getAllByTestId('swap-row')
        .map((r) => r.querySelector('.recipe-name')!.textContent),
    ).toContain('Peanut butter');
    expect(within(sheet).getAllByTestId('swap-row')).toHaveLength(4);
    // ½ serving (16 g) of almond butter is 1 tbsp of a 16 g tbsp.
    expect(pickRow(sheet, 'Peanut butter').querySelector('.recipe-meta')!.textContent).toBe('1 tbsp · 16 g');
  });

  it('swaps in place with the carried-over amount, the Changed chip and an Undo toast; the usual is unchanged', async () => {
    const api = createDemoApi();
    const update = vi.spyOn(api, 'updateLogEntry');
    const upsert = vi.spyOn(api, 'upsertUsual');
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    const before = rowNames(group);
    const sheet = await openSwap(group, 'Almond butter');
    fireEvent.input(within(sheet).getByTestId('swap-q'), { target: { value: 'peanut' } });
    await settle();
    fireEvent.click(pickRow(sheet, 'Peanut butter'));
    await settle();
    expect(update).toHaveBeenCalledWith(expect.any(String), { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' });
    expect(upsert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('swap-sheet')).toBeNull();
    expect(toast()).toContain('Swapped in Peanut butter for this day');
    const after = within(card('Breakfast')).getByTestId('group');
    expect(rowNames(after)).toEqual(before.map((n) => (n === 'Almond butter' ? 'Peanut butter' : n)));
    expect(within(after).getByTestId('group-changed-chip')).toBeTruthy();
    expect(within(after).getByTestId('group-usual-chip')).toBeTruthy();
    const usual = await api.getUsual('us_demo_oatmeal');
    expect(usual.lines[1].food_id).toBe('fd_demo_almond');

    // Undo puts the almond butter back.
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    const undone = within(card('Breakfast')).getByTestId('group');
    expect(rowNames(undone)).toEqual(before);
    expect(within(undone).queryByTestId('group-changed-chip')).toBeNull();
  });

  it('offers Your usual · Back to the usual first on a swapped entry, and swapping back says so', async () => {
    const api = createDemoApi();
    await mount(api);
    let group = await logUsual('Breakfast', 'Oatmeal');
    let sheet = await openSwap(group, 'Almond butter');
    fireEvent.input(within(sheet).getByTestId('swap-q'), { target: { value: 'peanut' } });
    await settle();
    fireEvent.click(pickRow(sheet, 'Peanut butter'));
    await settle();
    group = within(card('Breakfast')).getByTestId('group');
    sheet = await openSwap(group, 'Peanut butter');
    expect(within(sheet).getByText('Your usual')).toBeTruthy();
    const first = within(sheet).getAllByTestId('swap-row')[0];
    expect(first.querySelector('.recipe-name')!.textContent).toBe('Almond butter');
    expect(first.querySelector('.recipe-meta')!.textContent).toMatch(/^Back to the usual · /);
    fireEvent.click(first);
    await settle();
    expect(toast()).toContain('Back to Almond butter');
    expect(within(within(card('Breakfast')).getByTestId('group')).queryByTestId('group-changed-chip')).toBeNull();
  });

  it('lists Swapped in before with each food’s count', async () => {
    const api = createDemoApi();
    await mount(api);
    let group = await logUsual('Breakfast', 'Oatmeal');
    let sheet = await openSwap(group, 'Almond butter');
    fireEvent.input(within(sheet).getByTestId('swap-q'), { target: { value: 'peanut' } });
    await settle();
    fireEvent.click(pickRow(sheet, 'Peanut butter'));
    await settle();
    // A second Oatmeal: its almond butter has been swapped for peanut butter once before.
    group = await logUsual('Breakfast', 'Oatmeal');
    sheet = await openSwap(group, 'Almond butter');
    expect(within(sheet).getByText('Swapped in before')).toBeTruthy();
    const first = within(sheet).getAllByTestId('swap-row')[0];
    expect(first.querySelector('.recipe-name')!.textContent).toBe('Peanut butter');
    expect(first.querySelector('.recipe-meta')!.textContent).toBe('1 time · 1 tbsp · 16 g');
  });

  it('says so in the sheet when the swap fails, and keeps it open', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    const sheet = await openSwap(group, 'Almond butter');
    api.updateLogEntry = vi.fn(async () => {
      throw new Error('down');
    });
    fireEvent.input(within(sheet).getByTestId('swap-q'), { target: { value: 'peanut' } });
    await settle();
    fireEvent.click(pickRow(sheet, 'Peanut butter'));
    await settle();
    expect(within(screen.getByTestId('swap-sheet')).getByTestId('swap-error').textContent).toBe(
      "Couldn't swap. Try again.",
    );
  });
});

describe('Make it a pick-one', () => {
  /** Log Oatmeal `n` times, swapping each almond butter for peanut butter; the last group is returned. */
  async function swapped(n: number) {
    for (let i = 0; i < n; i++) {
      const group = await logUsual('Breakfast', 'Oatmeal');
      const sheet = await openSwap(group, 'Almond butter');
      fireEvent.input(within(sheet).getByTestId('swap-q'), { target: { value: 'peanut' } });
      await settle();
      fireEvent.click(pickRow(sheet, 'Peanut butter'));
      await settle();
    }
    return within(card('Breakfast')).getAllByTestId('group')[n - 1];
  }

  async function menu(group: HTMLElement) {
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    return screen.getByTestId('group-menu-sheet');
  }

  it('is offered for a swapped line, without Suggested before the third swap', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await swapped(1);
    const sheet = await menu(group);
    const item = within(sheet).getByTestId('group-pick-one');
    expect(item.querySelector('.recipe-name')!.textContent).toBe('Make it a pick-one: Almond butter / Peanut butter');
    expect(item.textContent).not.toContain('Suggested');
    expect(item.querySelector('.recipe-meta')!.textContent).toBe('Both become options, and you choose each time');
  });

  it('is Suggested after 3 swaps of the line to that food, and saves a pick-one of both foods', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    await mount(api);
    const group = await swapped(3);
    const sheet = await menu(group);
    const item = within(sheet).getByTestId('group-pick-one');
    expect(within(item).getByTestId('suggested-chip').textContent).toBe('Suggested');
    expect(item.querySelector('.recipe-meta')!.textContent).toBe(
      "You've swapped this line 3 times. Both become options, and you choose each time",
    );
    fireEvent.click(item);
    await settle();
    const sent = upsert.mock.calls[0][0];
    expect(sent.lines[1]).toEqual({
      line_id: 'L2',
      options: [
        { food_id: 'fd_demo_almond', qty: 0.5, unit: 'serving' },
        { food_id: 'fd_demo_pb', qty: 1, unit: 'tbsp' },
      ],
      last_pick: 'fd_demo_pb',
    });
    expect(sent.lines[0]).toEqual({ line_id: 'L1', food_id: 'fd_demo_oats', qty: 0.5, unit: 'cup' });
    expect(toast()).toBe('Oatmeal now asks: Almond butter or Peanut butter');
    const after = within(card('Breakfast')).getAllByTestId('group')[2];
    const row = within(after)
      .getAllByTestId('entry-row')
      .find((r) => r.querySelector('.recipe-name')!.textContent === 'Peanut butter')!;
    expect(
      within(row)
        .getAllByTestId('pick-option')
        .map((p) => [p.textContent, p.getAttribute('aria-pressed')]),
    ).toEqual([
      ['Almond butter', 'false'],
      ['Peanut butter', 'true'],
    ]);
    expect(within(after).queryAllByTestId('swap-entry').length).toBeGreaterThan(0);
  });
});

describe('Save a usual from a meal', () => {
  async function startSelect(slot: string) {
    fireEvent.click(within(card(slot)).getByTestId('meal-menu'));
    fireEvent.click(screen.getByTestId('menu-select'));
    await settle();
  }
  const selectRows = (slot: string) => within(card(slot)).getAllByTestId('select-row');

  it('puts Save n as a usual first and Save n as a recipe under it, which opens #788’s sheet', async () => {
    const api = createDemoApi();
    await mount(api);
    await logUsual('Breakfast', 'Oatmeal');
    await startSelect('Breakfast');
    const usual = within(card('Breakfast')).getByTestId('save-as-usual') as HTMLButtonElement;
    const recipe = within(card('Breakfast')).getByTestId('save-as-recipe') as HTMLButtonElement;
    expect([usual.textContent, recipe.textContent]).toEqual(['Save as a usual', 'Save as a recipe']);
    expect(usual.disabled && recipe.disabled).toBe(true);
    expect(usual.className).toContain('btn-primary');
    expect(recipe.className).toContain('btn-secondary');
    expect(usual.compareDocumentPosition(recipe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const i of [2, 3, 5]) fireEvent.click(selectRows('Breakfast')[i]);
    expect(usual.textContent).toBe('Save 3 as a usual');
    expect(recipe.textContent).toBe('Save 3 as a recipe');
    fireEvent.click(recipe);
    await settle();
    expect(screen.getByTestId('save-recipe-sheet')).toBeTruthy();
  });

  it('opens New usual with the Pick each time gate, saves the usual and groups the ticked entries under it', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    const group = vi.spyOn(api, 'setLogGroup');
    await mount(api);
    await logUsual('Breakfast', 'Oatmeal');
    // Today's other Breakfast entries leave only these in the new group.
    await startSelect('Breakfast');
    for (const i of [2, 3, 5]) fireEvent.click(selectRows('Breakfast')[i]);
    fireEvent.click(within(card('Breakfast')).getByTestId('save-as-usual'));
    await settle();
    const sheet = screen.getByTestId('new-usual-sheet');
    const save = within(sheet).getByTestId('save-usual') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(within(sheet).getByText('Foods (3)')).toBeTruthy();
    expect(within(sheet).getByText(/^Saved from Breakfast today\. Your log stays as it is\.$/)).toBeTruthy();
    fireEvent.input(within(sheet).getByTestId('usual-name'), { target: { value: 'Oats and milk' } });
    expect(save.disabled).toBe(false);

    // Almond butter has no candidates of its own category: switching it on opens the search at once.
    const lines = within(sheet).getAllByTestId('usual-line');
    fireEvent.click(within(lines[1]).getByTestId('pick-each-time'));
    await settle();
    expect(screen.getByTestId('option-search')).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.keyDown(screen.getByTestId('option-search'), { key: 'Escape' });
    await settle();
    expect(within(lines[1]).getByTestId('option-needed').textContent).toBe('Add a second option, or switch this off.');
    fireEvent.click(within(lines[1]).getByTestId('add-option'));
    await settle();
    fireEvent.click(within(screen.getByTestId('option-search')).getAllByTestId('option-result')[0]);
    await settle();
    expect(within(lines[1]).queryByTestId('option-needed')).toBeNull();
    expect(within(lines[1]).getByText(/^Options: Almond butter · /)).toBeTruthy();
    expect(save.disabled).toBe(false);

    fireEvent.click(save);
    await settle();
    const sent = upsert.mock.calls[0][0];
    expect(sent).toMatchObject({ name: 'Oats and milk', slot: 'Breakfast' });
    expect(sent.lines).toHaveLength(3);
    expect(sent.lines[0]).toMatchObject({ food_id: 'fd_demo_oats', qty: 0.5, unit: 'cup' });
    expect(sent.lines[1].options).toHaveLength(2);
    expect(sent.lines[1].last_pick).toBe('fd_demo_almond');
    expect(group.mock.calls[0][1]).toEqual({ name: 'Oats and milk', usual_id: sent.id });
    expect(screen.queryByTestId('new-usual-sheet')).toBeNull();
    expect(toast()).toContain('Saved Oats and milk to your usuals');
    expect(within(card('Breakfast')).queryByTestId('select-cancel')).toBeNull();
    const groups = within(card('Breakfast')).getAllByTestId('group');
    const mine = groups.find((g) => within(g).getByTestId('group-name').textContent === 'Oats and milk')!;
    expect(within(mine).getByTestId('group-usual-chip')).toBeTruthy();
    expect(rowNames(mine)).toEqual(['Rolled oats', 'Almond butter', 'Milk, 2%']);
  });

  it('keeps the usual and says grouping failed when setLogGroup fails', async () => {
    const api = createDemoApi();
    await mount(api);
    await logUsual('Breakfast', 'Oatmeal');
    await startSelect('Breakfast');
    fireEvent.click(selectRows('Breakfast')[2]);
    fireEvent.click(within(card('Breakfast')).getByTestId('save-as-usual'));
    await settle();
    api.setLogGroup = vi.fn(async () => {
      throw new Error('down');
    });
    const sheet = screen.getByTestId('new-usual-sheet');
    fireEvent.input(within(sheet).getByTestId('usual-name'), { target: { value: 'Just oats' } });
    fireEvent.click(within(sheet).getByTestId('save-usual'));
    await settle();
    expect(toast()).toBe("Saved Just oats. Couldn't group today's items.");
    expect((await api.getUsuals()).some((u) => u.name === 'Just oats')).toBe(true);
  });

  it('keeps the sheet open with its changes when the save fails', async () => {
    const api = createDemoApi();
    await mount(api);
    await logUsual('Breakfast', 'Oatmeal');
    await startSelect('Breakfast');
    fireEvent.click(selectRows('Breakfast')[2]);
    fireEvent.click(within(card('Breakfast')).getByTestId('save-as-usual'));
    await settle();
    api.upsertUsual = vi.fn(async () => {
      throw new Error('down');
    });
    const sheet = screen.getByTestId('new-usual-sheet');
    fireEvent.input(within(sheet).getByTestId('usual-name'), { target: { value: 'Just oats' } });
    fireEvent.click(within(sheet).getByTestId('save-usual'));
    await settle();
    expect(within(screen.getByTestId('new-usual-sheet')).getByTestId('new-usual-error').textContent).toBe(
      "Couldn't save. Your changes are kept here. Try again.",
    );
    expect((within(sheet).getByTestId('usual-name') as HTMLInputElement).value).toBe('Just oats');
  });

  it('gives a group with no usual Save as a usual, prefilled with its name', async () => {
    const api = createDemoApi();
    const today = new Date().toLocaleDateString('en-CA');
    await api.logGroup({
      date: today,
      slot: 'Lunch',
      name: 'Snack plate',
      items: [
        { food_id: 'fd_demo_oats', qty: 1, unit: 'cup' },
        { food_id: 'fd_demo_milk2', qty: 1, unit: 'cup' },
      ],
    });
    await mount(api);
    const group = within(card('Lunch')).getByTestId('group');
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    const item = within(screen.getByTestId('group-menu-sheet')).getByTestId('group-save-usual');
    expect(item.querySelector('.recipe-name')!.textContent).toBe('Save as a usual');
    expect(item.querySelector('.recipe-meta')!.textContent).toBe('Use these 2 as a starting point');
    fireEvent.click(item);
    await settle();
    const sheet = screen.getByTestId('new-usual-sheet');
    expect((within(sheet).getByTestId('usual-name') as HTMLInputElement).value).toBe('Snack plate');
    expect(within(sheet).getAllByTestId('usual-line')).toHaveLength(2);
    fireEvent.click(within(sheet).getByTestId('save-usual'));
    await settle();
    expect(toast()).toBe('Saved Snack plate to your usuals');
    expect(within(within(card('Lunch')).getByTestId('group')).getByTestId('group-usual-chip')).toBeTruthy();
  });

  it('does not offer Save as a usual on a group that has one', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    expect(within(screen.getByTestId('group-menu-sheet')).queryByTestId('group-save-usual')).toBeNull();
  });
});
