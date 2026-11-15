// #885: a usual logged as a group in Eaten: the Add sheet's Usuals, the group heading and its chips, a pick-one's choice,
// and the group's ⋯ menu. Driven against the demo API, whose usuals stand in for #877 and #878.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ForageApi } from '../api/client';
import type { FoodLogEntry, Usual } from '../api/types';
import App from '../App';
import { _resetDemoApi } from '../api/use-api';
import { createDemoApi } from '../demo/demo-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { readGlobalCss, rule } from '../test-css';
import { Toast, toastAction, toastText } from '../ui/toast';
import { _resetLookback } from './copy-meal';
import { EatenScreen } from './eaten-screen';
import { _resetEaten } from './eaten-store';
import { dayItems, groupChanges, groupKcal, updatedUsual, usualsFor } from './usual-group';

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

async function openAdd(slot: string) {
  fireEvent.click(within(card(slot)).getByTestId('add-to-meal'));
  await settle();
  return screen.getByTestId('add-sheet');
}

/** Put a usual in the Add sheet's tray, save it, and return its group in the meal card. */
async function logUsual(slot: string, name: string) {
  const sheet = await openAdd(slot);
  const row = within(sheet)
    .getAllByTestId('usual-result')
    .find((r) => r.querySelector('.recipe-name')!.textContent === name)!;
  fireEvent.click(row);
  await settle();
  // #933: a usual goes into the tray as a group; the footer saves it and the day shows it.
  fireEvent.click(within(screen.getByTestId('add-sheet')).getByTestId('tray-save'));
  await settle();
  return within(card(slot)).getByTestId('group');
}

const names = (g: HTMLElement) =>
  within(g)
    .getAllByTestId('entry-row')
    .map((r) => r.querySelector('.recipe-name')!.textContent);

describe('the Add sheet', () => {
  it('leads with Usuals, the meal’s own first, each with its foods in short and its starting kcal', async () => {
    await mount(createDemoApi());
    const sheet = await openAdd('Breakfast');
    const rows = within(sheet).getAllByTestId('usual-result');
    // Breakfast's two (most recently used first), then the other meals' (After dinner's, then Lunch's).
    expect(rows.map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Oatmeal',
      'Yogurt bowl',
      'After dinner cereal',
      'Side salad',
    ]);
    expect(within(sheet).getByText('Usuals for breakfast')).toBeTruthy();
    expect(rows[0].querySelector('.recipe-meta')!.textContent).toBe(
      'Rolled oats · Almond butter · Blueberries / Banana / Strawberries · Milk, 2%',
    );
    expect(rows[0].textContent).toMatch(/kcal$/);
    // Usuals come before the foods.
    const label = within(sheet).getByText('Usuals for breakfast');
    const recent = within(sheet)
      .getAllByRole('list')
      .find((l) => l.getAttribute('aria-labelledby') === 'add-list-label');
    if (recent) expect(label.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('summarises a pick-one too long for buttons as `<label> or <n> more`', async () => {
    await mount(createDemoApi());
    const sheet = await openAdd('Breakfast');
    const yogurt = within(sheet)
      .getAllByTestId('usual-result')
      .find((r) => r.textContent!.startsWith('Yogurt bowl'))!;
    expect(yogurt.querySelector('.recipe-meta')!.textContent).toMatch(/ or 1 more · .* or 4 more · Blueberries$/);
  });

  it('filters usuals by name along with foods, and keeps the heading while any match', async () => {
    await mount(createDemoApi());
    const sheet = await openAdd('Breakfast');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'oatm' } });
    await settle();
    expect(within(sheet).getAllByTestId('usual-result')).toHaveLength(1);
    expect(within(sheet).getByText('Usuals with oatm')).toBeTruthy();
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'zzzz' } });
    await settle();
    expect(within(sheet).queryByText('Usuals with zzzz')).toBeNull();
    expect(within(sheet).getByTestId('add-no-match')).toBeTruthy();
  });

  it('shows no Usuals section when they fail to load or there are none', async () => {
    const api = createDemoApi();
    api.getUsuals = vi.fn(async () => {
      throw new Error('down');
    });
    await mount(api);
    const sheet = await openAdd('Breakfast');
    expect(within(sheet).queryByText('Usuals for breakfast')).toBeNull();
    expect(within(sheet).getAllByTestId('add-result').length).toBeGreaterThan(0);
  });

  it('a tap puts the usual in the tray as a group and writes nothing; saving sends one logMeal with its usual and lines', async () => {
    const api = createDemoApi();
    const logMeal = vi.spyOn(api, 'logMeal');
    const logUsual = vi.spyOn(api, 'logUsual');
    await mount(api);
    const sheet = await openAdd('Breakfast');
    fireEvent.click(within(sheet).getAllByTestId('usual-result')[0]);
    await settle();
    expect(logMeal).not.toHaveBeenCalled();
    expect(within(sheet).getByTestId('tray-group-name').textContent).toBe('Oatmeal');
    expect(within(sheet).getAllByTestId('tray-item')).toHaveLength(4);
    fireEvent.click(within(sheet).getByTestId('tray-save'));
    await settle();
    expect(logMeal).toHaveBeenCalledTimes(1);
    expect(logUsual).not.toHaveBeenCalled();
    const items = logMeal.mock.calls[0][0].items;
    expect(items).toHaveLength(4);
    expect(new Set(items.map((i) => i.group!.key)).size).toBe(1);
    expect(items[0].group).toMatchObject({ name: 'Oatmeal', usual_id: expect.any(String) });
    expect(items.every((i) => !!i.group!.usual_line_id)).toBe(true);
  });
});

describe('a usual in the tray (#933)', () => {
  const oatmeal = async () => {
    const sheet = await openAdd('Breakfast');
    const row = within(sheet)
      .getAllByTestId('usual-result')
      .find((r) => r.querySelector('.recipe-name')!.textContent === 'Oatmeal')!;
    fireEvent.click(row);
    await settle();
    return sheet;
  };

  it('a pick-one is changed in the tray by its buttons, at the option’s own amount, and saves as that food on the same line', async () => {
    const api = createDemoApi();
    const logMeal = vi.spyOn(api, 'logMeal');
    await mount(api);
    const sheet = await oatmeal();
    const berries = within(sheet)
      .getAllByTestId('tray-row')
      .find((r) => r.textContent!.includes('Blueberries'))!;
    fireEvent.click(berries);
    await settle();
    expect(logMeal).not.toHaveBeenCalled();
    const pills = within(sheet).getAllByTestId('pick-option');
    expect(pills.map((p) => [p.textContent, p.getAttribute('aria-pressed')])).toEqual([
      ['Blueberries', 'true'],
      ['Banana', 'false'],
      ['Strawberries', 'false'],
    ]);
    fireEvent.click(pills[1]);
    await settle();
    const rows = within(sheet).getAllByTestId('tray-row');
    expect(rows.some((r) => r.textContent!.includes('Blueberries'))).toBe(false);
    expect(rows.find((r) => r.textContent!.includes('Banana'))!.textContent).toContain('½ medium');
    fireEvent.click(within(sheet).getByTestId('tray-save'));
    await settle();
    const items = logMeal.mock.calls[0][0].items;
    expect(items).toHaveLength(4);
    const banana = items.find((i) => i.food_id === 'fd_demo_banana')!;
    expect(banana).toMatchObject({ qty: 0.5, unit: 'medium', group: { name: 'Oatmeal' } });
    expect(banana.group!.usual_line_id).toBeTruthy();
    expect(items.some((i) => i.food_id === 'fd_demo_blueberries')).toBe(false);
  });

  it('Remove all takes the group out and its heading with it; a second usual adds a second group', async () => {
    await mount(createDemoApi());
    const sheet = await oatmeal();
    expect(within(sheet).getAllByTestId('tray-group')).toHaveLength(1);
    fireEvent.click(within(sheet).getByTestId('tray-remove-all'));
    await settle();
    expect(within(sheet).queryByTestId('tray')).toBeNull();
    expect(within(sheet).getByTestId('tray-save').textContent).toBe('Tap foods to add them');
    expect(within(sheet).getByTestId('add-status').textContent).toBe('Removed Oatmeal');
    const row = () =>
      within(sheet)
        .getAllByTestId('usual-result')
        .find((r) => r.querySelector('.recipe-name')!.textContent === 'Oatmeal')!;
    fireEvent.click(row());
    fireEvent.click(row());
    await settle();
    // The usual is a set: adding it again adds the group anyway.
    expect(within(sheet).getAllByTestId('tray-group')).toHaveLength(2);
    expect(within(sheet).getAllByTestId('tray-item')).toHaveLength(8);
  });

  it('removing the last item of a group takes the heading with it', async () => {
    await mount(createDemoApi());
    const sheet = await oatmeal();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(within(sheet).getAllByTestId('tray-row')[0]);
      fireEvent.click(within(sheet).getByTestId('tray-remove'));
    }
    expect(within(sheet).queryByTestId('tray-group')).toBeNull();
    expect(within(sheet).queryByTestId('tray')).toBeNull();
  });
});

describe('logging a usual', () => {
  it('adds its entries under a heading with a Usual chip and the total, and the toast has Undo', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(within(group).getByTestId('group-name').textContent).toBe('Oatmeal');
    expect(within(group).getByTestId('group-usual-chip').textContent).toBe('Usual');
    expect(within(group).queryByTestId('group-changed-chip')).toBeNull();
    expect(within(group).getByTestId('group-kcal').textContent).toMatch(/\d kcal$/);
    expect(names(group)).toHaveLength(4);
    expect(toast()).toContain('Added 4 to breakfastUndo');
    expect(within(group).getByRole('button', { name: 'Oatmeal options' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(within(card('Breakfast')).queryByTestId('group')).toBeNull();
  });
});

describe('a pick-one', () => {
  it('shows buttons for 3 short options, the logged one pressed; a pick swaps it in place at the option’s amount', async () => {
    const api = createDemoApi();
    const update = vi.spyOn(api, 'updateLogEntry');
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    const pills = within(group).getAllByTestId('pick-option');
    expect(pills.map((p) => [p.textContent, p.getAttribute('aria-pressed')])).toEqual([
      ['Blueberries', 'true'],
      ['Banana', 'false'],
      ['Strawberries', 'false'],
    ]);
    const before = names(group);
    fireEvent.click(pills[1]);
    await settle();
    expect(update).toHaveBeenCalledWith(expect.any(String), { food_id: 'fd_demo_banana', qty: 0.5, unit: 'medium' });
    const after = within(card('Breakfast')).getByTestId('group');
    expect(names(after)).toEqual(before.map((n) => (n === 'Blueberries' ? 'Banana' : n)));
    expect(within(after).getAllByTestId('pick-option')[1].getAttribute('aria-pressed')).toBe('true');
    // Picking another option is not a change.
    expect(within(after).queryByTestId('group-changed-chip')).toBeNull();
  });

  it('shows Pick one · i of n for a long name, opens full-width rows with full names, and closes on a pick', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('After dinner', 'After dinner cereal');
    expect(within(group).queryByTestId('pick-option')).toBeNull();
    const trigger = within(group).getByTestId('pick-trigger');
    expect(trigger.textContent).toContain('Pick one · 1 of 2');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const list = within(group).getByRole('radiogroup');
    const items = within(list).getAllByTestId('pick-item');
    expect(items[0].querySelector('.recipe-name')!.textContent).toBe('Cinnamon Cheerios Protein');
    expect(items[0].querySelector('.recipe-meta')!.textContent).toBe('General Mills · 1¼ cup');
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(items[0].textContent).toMatch(/\d kcal$/);
    fireEvent.click(items[1]);
    await settle();
    const after = within(card('After dinner')).getByTestId('group');
    expect(within(after).queryByRole('radiogroup')).toBeNull();
    expect(within(after).getByTestId('pick-trigger').textContent).toContain('Pick one · 2 of 2');
    expect(names(after)[0]).toBe("Kellogg's Raisin Bran Crunch");
  });

  it('shows a 5-option list for the Yogurt bowl, and opening an amount editor closes it', async () => {
    const api = createDemoApi();
    await mount(api);
    const group = await logUsual('Breakfast', 'Yogurt bowl');
    const triggers = within(group).getAllByTestId('pick-trigger');
    expect(triggers[1].textContent).toContain('Pick one · 2 of 5');
    fireEvent.click(triggers[1]);
    await settle();
    expect(within(group).getAllByTestId('pick-item')).toHaveLength(5);
    fireEvent.click(within(group).getAllByTestId('amount-chip')[0]);
    await settle();
    expect(within(group).queryByRole('radiogroup')).toBeNull();
  });

  it('turns a list into buttons once every option has a short name', async () => {
    const api = createDemoApi();
    for (const [id, short] of [
      ['fd_demo_cheerios', 'Cheerios'],
      ['fd_demo_raisinbran', 'Raisin Bran'],
    ]) {
      const f = await api.getFood(id);
      await api.saveFood({ ...f, short_name: short });
    }
    await mount(api);
    const group = await logUsual('After dinner', 'After dinner cereal');
    expect(
      within(group)
        .getAllByTestId('pick-option')
        .map((p) => p.textContent),
    ).toEqual(['Cheerios', 'Raisin Bran']);
  });
});

describe('Changed', () => {
  /** Raise the oats from ½ cup to 1 cup with the inline editor. */
  async function moreOats() {
    const group = within(card('Breakfast')).getByTestId('group');
    const row = within(group).getAllByTestId('entry-row')[0];
    fireEvent.click(within(row).getByTestId('amount-chip'));
    await settle();
    for (let i = 0; i < 2; i++) fireEvent.click(within(row).getByLabelText('More'));
    fireEvent.click(within(row).getByTestId('editor-done'));
    await settle();
  }

  it('shows when an amount differs, and Update the usual lists it, saves it, and clears Changed', async () => {
    const api = createDemoApi();
    await mount(api);
    await logUsual('Breakfast', 'Oatmeal');
    await moreOats();
    let group = within(card('Breakfast')).getByTestId('group');
    expect(within(group).getByTestId('group-changed-chip').textContent).toBe('Changed');

    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    const sheet = screen.getByTestId('group-menu-sheet');
    const update = within(sheet).getByTestId('group-update');
    expect(update.textContent).toContain('Update the Oatmeal usual');
    expect(update.textContent).toContain('Rolled oats 1 cup, was ½ cup');
    fireEvent.click(update);
    await settle();
    expect(toast()).toBe('Updated Oatmeal. Next time it starts like this.');
    const saved = await api.getUsual('us_demo_oatmeal');
    expect(saved.lines[0]).toMatchObject({ food_id: 'fd_demo_oats', qty: 1, unit: 'cup' });
    expect(saved.lines[2].options).toHaveLength(3);
    group = within(card('Breakfast')).getByTestId('group');
    expect(within(group).queryByTestId('group-changed-chip')).toBeNull();

    // Nothing differs now: Update is disabled.
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    const again = within(screen.getByTestId('group-menu-sheet')).getByTestId('group-update');
    expect(again.getAttribute('aria-disabled')).toBe('true');
    expect(again.textContent).toContain('Matches your usual');
  });

  it('is disabled with `Matches your usual` on a group that has not changed', async () => {
    await mount(createDemoApi());
    const group = await logUsual('Breakfast', 'Oatmeal');
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    const update = within(screen.getByTestId('group-menu-sheet')).getByTestId('group-update');
    expect(update.getAttribute('aria-disabled')).toBe('true');
    expect(update.textContent).toContain('Matches your usual');
  });
});

describe('the group menu', () => {
  it('Copy to… copies only that group', async () => {
    const api = createDemoApi();
    const copy = vi.spyOn(api, 'copyMeal');
    await mount(api);
    const group = await logUsual('Breakfast', 'Oatmeal');
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    fireEvent.click(screen.getByTestId('group-copy'));
    await settle();
    const sheet = screen.getByTestId('copy-sheet');
    expect(within(sheet).getByText('Copy Oatmeal')).toBeTruthy();
    fireEvent.click(within(sheet).getByTestId('copy-go'));
    await settle();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy.mock.calls[0][0]).toMatchObject({ from_slot: 'Breakfast', group_id: expect.stringMatching(/^gr_/) });
  });

  it('Ungroup keeps the entries and removes the heading', async () => {
    await mount(createDemoApi());
    const loose = within(card('Breakfast')).queryAllByTestId('entry-row').length;
    const group = await logUsual('Breakfast', 'Oatmeal');
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    expect(screen.getByTestId('group-ungroup').textContent).toContain('Keep the 4 entries, drop the heading');
    fireEvent.click(screen.getByTestId('group-ungroup'));
    await settle();
    expect(toast()).toBe('Ungrouped');
    expect(within(card('Breakfast')).queryByTestId('group')).toBeNull();
    expect(within(card('Breakfast')).getAllByTestId('entry-row')).toHaveLength(loose + 4);
  });

  it('Remove all 4 deletes them, and Undo brings them back', async () => {
    const api = createDemoApi();
    await mount(api);
    const loose = within(card('Breakfast')).queryAllByTestId('entry-row').length;
    const group = await logUsual('Breakfast', 'Oatmeal');
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    expect(screen.getByTestId('group-remove').textContent).toBe('Remove all 4');
    fireEvent.click(screen.getByTestId('group-remove'));
    await settle();
    expect(toast()).toBe('Removed OatmealUndo');
    expect(within(card('Breakfast')).queryAllByTestId('entry-row')).toHaveLength(loose);
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    const back = within(card('Breakfast')).getByTestId('group');
    expect(within(back).getByTestId('group-name').textContent).toBe('Oatmeal');
    expect(names(back)).toHaveLength(4);
  });

  it('shows no Usual chip and no Update item once the usual is deleted', async () => {
    const api = createDemoApi();
    await mount(api);
    await logUsual('Breakfast', 'Oatmeal');
    cleanup();
    await api.deleteUsual('us_demo_oatmeal');
    _resetEaten();
    await mount(api);
    const group = within(card('Breakfast')).getByTestId('group');
    expect(within(group).queryByTestId('group-usual-chip')).toBeNull();
    expect(within(group).queryByTestId('group-changed-chip')).toBeNull();
    fireEvent.click(within(group).getByTestId('group-menu'));
    await settle();
    expect(screen.queryByTestId('group-update')).toBeNull();
    expect(screen.getByTestId('group-copy')).toBeTruthy();
  });
});

describe('the words and the rules', () => {
  const foods = new Map();
  function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
    return {
      id: 'lg_1',
      date: '2026-11-02',
      slot: 'Breakfast',
      food_id: '',
      recipe_id: '',
      qty: 1,
      unit: 'cup',
      grams: 100,
      kcal: 100,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
      partial: false,
      source: 'app',
      logged_at: '2026-11-02T08:00:00Z',
      created: '',
      updated: '',
      group_id: 'gr_1',
      group_name: 'Oatmeal',
      usual_id: 'us_1',
      ...over,
    };
  }
  const usual: Usual = {
    id: 'us_1',
    name: 'Oatmeal',
    slot: 'Breakfast',
    created: '',
    updated: '',
    used_count: 1,
    last_used: '2026-11-01',
    start: { kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, partial: false } as Usual['start'],
    lines: [
      { line_id: 'L1', position: 1, food_id: 'a', qty: 0.5, unit: 'cup', options: null, last_pick: '', swaps: [] },
      {
        line_id: 'L2',
        position: 2,
        food_id: '',
        qty: null,
        unit: '',
        options: [
          { food_id: 'b', qty: 1, unit: 'cup' },
          { food_id: 'c', qty: 2, unit: 'medium' },
        ],
        last_pick: '',
        swaps: [],
      },
    ],
  };
  for (const id of ['a', 'b', 'c', 'd']) foods.set(id, { id, name: id.toUpperCase(), short_name: '' });
  const base = [
    entry({ id: 'e1', food_id: 'a', qty: 0.5, usual_line_id: 'L1' }),
    entry({ id: 'e2', food_id: 'c', qty: 2, unit: 'medium', usual_line_id: 'L2' }),
  ];

  it('finds no difference in a group as logged, nor in another pick', () => {
    expect(groupChanges(base, usual, foods)).toEqual([]);
    expect(
      groupChanges([base[0], entry({ id: 'e2', food_id: 'b', qty: 1, usual_line_id: 'L2' })], usual, foods),
    ).toEqual([]);
  });

  it('finds a removed line, an amount, a food, and an added entry, in that words', () => {
    const e = (over: Partial<FoodLogEntry>) => entry({ ...over });
    expect(groupChanges([base[0]], usual, foods)).toEqual(['B removed']);
    expect(
      groupChanges([e({ id: 'e1', food_id: 'a', qty: 0.75, usual_line_id: 'L1' }), base[1]], usual, foods),
    ).toEqual(['A ¾ cup, was ½ cup']);
    expect(groupChanges([e({ id: 'e1', food_id: 'd', qty: 0.5, usual_line_id: 'L1' }), base[1]], usual, foods)).toEqual(
      ['D instead of A'],
    );
    expect(groupChanges([...base, e({ id: 'e3', food_id: 'd' })], usual, foods)).toEqual(['D added']);
  });

  it('builds the usual from the group, keeping other options, and drops a line with no entry', () => {
    const input = updatedUsual(
      [entry({ id: 'e2', food_id: 'b', qty: 1.5, usual_line_id: 'L2' }), entry({ id: 'e3', food_id: 'd', qty: 3 })],
      usual,
    );
    expect(input.lines).toEqual([
      {
        line_id: 'L2',
        options: [
          { food_id: 'b', qty: 1.5, unit: 'cup' },
          { food_id: 'c', qty: 2, unit: 'medium' },
        ],
        last_pick: 'b',
      },
      { food_id: 'd', qty: 3, unit: 'cup' },
    ]);
  });

  it('groups a day’s entries where the first of each sits, and totals a group', () => {
    const items = dayItems([
      entry({ id: 'x1', group_id: '' }),
      entry({ id: 'g1', kcal: 50 }),
      entry({ id: 'x2', group_id: '' }),
      entry({ id: 'g2', kcal: null }),
    ]);
    expect(items.map((i) => (i.kind === 'group' ? `g:${i.entries.length}` : 'e'))).toEqual(['e', 'g:2', 'e']);
    expect(groupKcal([entry({ kcal: 50 }), entry({ kcal: null })])).toBe(50);
    expect(groupKcal([entry({ kcal: null })])).toBeNull();
  });

  it('orders usuals for a meal: its own first, then most recently used', () => {
    const u = (name: string, slot: Usual['slot'], last: string | null): Usual => ({
      ...usual,
      id: name,
      name,
      slot,
      last_used: last,
    });
    const list = [u('A', 'Lunch', '2026-11-01'), u('B', 'Breakfast', '2026-10-01'), u('C', 'Breakfast', null)];
    expect(usualsFor(list, 'Breakfast', '').map((x) => x.name)).toEqual(['B', 'C', 'A']);
    expect(usualsFor(list, 'Breakfast', 'a').map((x) => x.name)).toEqual(['A']);
  });

  it('keeps a long list inside the screen: rows wrap, the heading wraps, nothing is wider than 100%', () => {
    const css = readGlobalCss();
    expect(rule(css, '.pick-row-item')).toContain('width: 100%');
    expect(rule(css, '.pick-row-item .recipe-name,\n.pick-row-item .recipe-meta')).toContain('white-space: normal');
    expect(rule(css, '.group-title')).toContain('flex-wrap: wrap');
    expect(rule(css, '.pick-list')).toContain('overflow: hidden');
  });
});

describe('demo mode', () => {
  it('logs the demo Oatmeal at ?demo=true with no network call, as a group', async () => {
    const env = import.meta.env as Record<string, string | undefined>;
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      window.history.replaceState(null, '', '/?demo=true#/eaten');
      render(<App />);
      await settle();
      const group = await logUsual('Breakfast', 'Oatmeal');
      expect(within(group).getByTestId('group-usual-chip')).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      delete env.VITE_DEMO_MODE;
      _resetDemoModeCache();
      _resetDemoApi();
    }
  });
});
