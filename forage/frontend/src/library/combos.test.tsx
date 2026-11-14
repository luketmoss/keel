// #888: combos in the Add sheet and in Library → Usuals, driven against the demo API (which stands in for #879).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ForageApi } from '../api/client';
import type { Combo } from '../api/types';
import { createDemoApi } from '../demo/demo-api';
import { EatenScreen } from '../eaten/eaten-screen';
import { _resetEaten } from '../eaten/eaten-store';
import { _resetLookback } from '../eaten/copy-meal';
import { Toast, toastAction, toastText } from '../ui/toast';
import {
  _resetCombos,
  comboKcalText,
  groupItems,
  joinLine,
  lastText,
  libraryMeta,
  usualFromCombo,
} from './combos-store';
import { _resetFoods, librarySection } from './foods-store';
import { LibraryScreen } from './library-screen';
import { _resetRecipes } from './recipes-store';
import { _resetUsuals } from './usuals-store';

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

function mountLibrary(api: ForageApi) {
  librarySection.value = 'usuals';
  return render(
    <>
      <LibraryScreen api={api} empty={<p>empty recipes</p>} icon={() => null} />
      <Toast />
    </>,
  );
}

async function mountEaten(api: ForageApi) {
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
  _resetRecipes();
  _resetFoods();
  _resetUsuals();
  _resetCombos();
  toastText.value = null;
  toastAction.value = null;
});

afterEach(() => cleanup());

const comboRows = () => screen.queryAllByTestId('combo-row');
const rowNames = () => comboRows().map((r) => r.querySelector('.recipe-name')!.textContent);

async function openCombo(name: string) {
  fireEvent.click(within(comboRows().find((r) => r.textContent!.includes(name))!).getAllByRole('button')[0]);
  await settle();
  return screen.getByTestId('combo-sheet');
}

describe('Library → Usuals', () => {
  it('lists every combo under the usuals, with the explainer, a meal count, when and kcal', async () => {
    mountLibrary(createDemoApi());
    await settle();
    const section = screen.getByTestId('combos-section');
    expect(within(section).getByText("Combos you've logged")).toBeTruthy();
    expect(within(section).getByText("Foods you've had together in 3 or more meals in the last 60 days.")).toBeTruthy();
    expect(rowNames()).toEqual([
      'Plain yogurt + Granola',
      'Sourdough bread + Deli turkey + Cheddar / Swiss cheese',
      'Apple + Peanut butter',
    ]);
    const first = comboRows()[0];
    expect(within(first).getByTestId('combo-usage').textContent).toBe('9 breakfasts · last 4 days ago');
    expect(first.textContent).toMatch(/kcal$/);
    // The section sits after the usuals list.
    const usuals = screen.getByLabelText('Usuals');
    expect(usuals.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no section while loading, and says what none means', async () => {
    const api = createDemoApi();
    api.getCombos = vi.fn(async () => ({ combos: [], stats: { hidden: 0 } as never }));
    mountLibrary(api);
    expect(screen.queryByTestId('combos-section')).toBeNull();
    await settle();
    expect(screen.getByTestId('combos-empty').textContent).toBe(
      "Nothing new. Combos your usuals already cover don't show here.",
    );
  });

  it('says it could not look, and Retry looks again', async () => {
    const api = createDemoApi();
    const real = api.getCombos;
    let fail = true;
    api.getCombos = vi.fn(async (...a) => {
      if (fail) throw new Error('down');
      return real(...a);
    });
    mountLibrary(api);
    await settle();
    expect(screen.getByText("Couldn't look for combos.")).toBeTruthy();
    // The usuals still show.
    expect(screen.getAllByTestId('usual-row').length).toBeGreaterThan(0);
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settle();
    expect(comboRows()).toHaveLength(3);
  });

  it('opens a combo sheet with its counts, join line, typical amounts and meals', async () => {
    mountLibrary(createDemoApi());
    await settle();
    const sheet = await openCombo('Sourdough');
    expect(within(sheet).getByTestId('combo-meta').textContent).toBe(
      'In 7 lunch meals over the last 60 days · last 4 days ago',
    );
    expect(within(sheet).getByTestId('combo-join').textContent).toMatch(
      /^2 combos that differ only by Cheddar.* or Swiss.*were joined, so that's a pick-one\.$/,
    );
    const amounts = within(within(sheet).getByTestId('combo-amounts')).getAllByRole('listitem');
    expect(amounts).toHaveLength(3);
    expect(amounts[0].textContent).toContain('2 slice');
    expect(within(amounts[2]).getByText('Pick one')).toBeTruthy();
    const meals = within(within(sheet).getByTestId('combo-meals')).getAllByRole('listitem');
    expect(meals).toHaveLength(7);
    // Newest first.
    expect(meals[0].textContent).toMatch(/^Today|^Yesterday|^\w{3} \d+ \w{3}/);
  });

  it('shows at most 10 meals, then how many more', async () => {
    const api = createDemoApi();
    const real = api.getCombos;
    api.getCombos = vi.fn(async (...a) => {
      const r = await real(...a);
      const c = r.combos[0];
      c.meal_dates = Array.from({ length: 13 }, (_, i) => ({
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        slot: c.slot,
      }));
      return r;
    });
    mountLibrary(api);
    await settle();
    const sheet = await openCombo('Plain yogurt');
    expect(within(within(sheet).getByTestId('combo-meals')).getAllByRole('listitem')).toHaveLength(10);
    expect(within(sheet).getByText('and 3 more')).toBeTruthy();
  });

  it('prefills the name when there is no pick-one, and asks for one when there is', async () => {
    mountLibrary(createDemoApi());
    await settle();
    let sheet = await openCombo('Plain yogurt');
    expect((within(sheet).getByTestId('combo-name') as HTMLInputElement).value).toBe('Plain yogurt + Granola');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await settle();
    sheet = await openCombo('Sourdough');
    const name = within(sheet).getByTestId('combo-name') as HTMLInputElement;
    expect(name.value).toBe('');
    expect(name.placeholder).toBe('Name it');
    expect((within(sheet).getByTestId('combo-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save as a usual creates it with the combo’s lines, lists it first, drops the combo and toasts', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    mountLibrary(api);
    await settle();
    const sheet = await openCombo('Sourdough');
    fireEvent.input(within(sheet).getByTestId('combo-name'), { target: { value: 'Turkey sandwich' } });
    fireEvent.click(within(sheet).getByTestId('combo-save'));
    await settle();
    expect(upsert).toHaveBeenCalledTimes(1);
    const sent = upsert.mock.calls[0][0];
    expect(sent).toMatchObject({ name: 'Turkey sandwich', slot: 'Lunch' });
    expect(sent.lines).toHaveLength(3);
    expect(sent.lines[2]).toMatchObject({ last_pick: 'fd_demo_cheddar' });
    expect(sent.lines[2].options).toHaveLength(2);
    expect(screen.queryByTestId('combo-sheet')).toBeNull();
    expect(screen.getByTestId('toast').textContent).toBe('Saved Turkey sandwich to your usuals');
    expect(screen.getAllByTestId('usual-row')[0].textContent).toContain('Turkey sandwich');
    expect(rowNames()).toEqual(['Plain yogurt + Granola', 'Apple + Peanut butter']);
  });

  it('says so in the sheet when saving fails, and keeps the sheet', async () => {
    const api = createDemoApi();
    api.upsertUsual = vi.fn(async () => {
      throw new Error('down');
    });
    mountLibrary(api);
    await settle();
    const sheet = await openCombo('Plain yogurt');
    fireEvent.click(within(sheet).getByTestId('combo-save'));
    await settle();
    expect(within(sheet).getByTestId('combo-error').textContent).toBe("Couldn't save. Try again.");
    expect((within(sheet).getByTestId('combo-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Hide this combo removes it, and the toast’s Undo brings it back', async () => {
    const api = createDemoApi();
    const hide = vi.spyOn(api, 'hideCombo');
    const unhide = vi.spyOn(api, 'unhideCombos');
    mountLibrary(api);
    await settle();
    const sheet = await openCombo('Apple');
    fireEvent.click(within(sheet).getByTestId('combo-hide'));
    await settle();
    expect(hide).toHaveBeenCalledWith('fd_demo_apple+fd_demo_pb');
    expect(screen.queryByTestId('combo-sheet')).toBeNull();
    expect(rowNames()).not.toContain('Apple + Peanut butter');
    expect(screen.getByTestId('toast').textContent).toContain("Hidden. It won't be suggested again.");
    expect(screen.getByTestId('combos-show-hidden').textContent).toBe('Show 1 hidden');
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(unhide).toHaveBeenCalledWith(['fd_demo_apple+fd_demo_pb']);
    expect(rowNames()).toContain('Apple + Peanut butter');
    expect(screen.queryByTestId('combos-show-hidden')).toBeNull();
  });

  it('says so in the sheet when hiding fails', async () => {
    const api = createDemoApi();
    api.hideCombo = vi.fn(async () => {
      throw new Error('down');
    });
    mountLibrary(api);
    await settle();
    const sheet = await openCombo('Apple');
    fireEvent.click(within(sheet).getByTestId('combo-hide'));
    await settle();
    expect(within(sheet).getByTestId('combo-error').textContent).toBe("Couldn't hide it. Try again.");
  });

  it('Show <n> hidden unhides every hidden combo', async () => {
    const api = createDemoApi();
    await api.hideCombo('fd_demo_apple+fd_demo_pb');
    await api.hideCombo('fd_demo_granola+fd_demo_yogurt');
    const unhide = vi.spyOn(api, 'unhideCombos');
    mountLibrary(api);
    await settle();
    expect(comboRows()).toHaveLength(1);
    fireEvent.click(screen.getByText('Show 2 hidden'));
    await settle();
    expect(unhide).toHaveBeenCalledWith();
    expect(comboRows()).toHaveLength(3);
  });
});

describe('the Add sheet', () => {
  const card = (slot: string) =>
    screen.getAllByTestId('meal-card').find((c) => c.querySelector('h2')!.textContent === slot)!;
  async function openAdd(slot: string) {
    fireEvent.click(within(card(slot)).getByTestId('add-to-meal'));
    await settle();
    return screen.getByTestId('add-sheet');
  }

  /** The demo's combos plus more, so a search has more to find than the top 3. */
  function manyCombos(api: ForageApi) {
    const real = api.getCombos;
    api.getCombos = vi.fn(async (...a) => {
      const r = await real(...a);
      const base = r.combos[0];
      const extra: Combo[] = [1, 2, 3].map((i) => ({ ...base, key: `${base.key}-${i}`, name: `Extra apple mix ${i}` }));
      return { ...r, combos: [...r.combos, ...extra] };
    });
  }

  it('shows Combos you’ve logged under Usuals: the top 3, the meal’s own first, with meals, when and kcal', async () => {
    const api = createDemoApi();
    manyCombos(api);
    await mountEaten(api);
    const sheet = await openAdd('Lunch');
    expect(within(sheet).getByText("Combos you've logged")).toBeTruthy();
    const rows = within(sheet).getAllByTestId('combo-result');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('.recipe-name')!.textContent).toMatch(/^Sourdough bread/);
    expect(rows[0].querySelector('.recipe-meta')!.textContent).toBe('In 7 meals · last 4 days ago');
    expect(rows[0].textContent).toMatch(/kcal$/);
    const usuals = within(sheet).getByText('Usuals');
    const combos = within(sheet).getByText("Combos you've logged");
    expect(usuals.compareDocumentPosition(combos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('with a search, shows every combo whose name matches', async () => {
    const api = createDemoApi();
    manyCombos(api);
    await mountEaten(api);
    const sheet = await openAdd('Snacks');
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'apple' } });
    await settle();
    expect(within(sheet).getAllByTestId('combo-result')).toHaveLength(4);
    fireEvent.input(within(sheet).getByTestId('add-search'), { target: { value: 'zzzz' } });
    await settle();
    expect(within(sheet).queryByText("Combos you've logged")).toBeNull();
  });

  it('tapping a combo logs its foods as a group with no usual, and the toast offers Undo', async () => {
    const api = createDemoApi();
    const logGroup = vi.spyOn(api, 'logGroup');
    await mountEaten(api);
    const sheet = await openAdd('Breakfast');
    const row = within(sheet)
      .getAllByTestId('combo-result')
      .find((r) => r.textContent!.startsWith('Plain yogurt'))!;
    fireEvent.click(row);
    await settle();
    expect(logGroup).toHaveBeenCalledTimes(1);
    expect(logGroup.mock.calls[0][0]).toMatchObject({
      slot: 'Breakfast',
      name: 'Plain yogurt + Granola',
      items: [
        { food_id: 'fd_demo_yogurt', qty: 1, unit: 'cup' },
        { food_id: 'fd_demo_granola', qty: 0.5, unit: 'cup' },
      ],
    });
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    const group = within(card('Breakfast')).getByTestId('group');
    expect(group.textContent).toContain('Plain yogurt + Granola');
    expect(within(group).queryByText('Usual')).toBeNull();
    expect(screen.getByTestId('toast').textContent).toContain('Added Plain yogurt + Granola');
    fireEvent.click(screen.getByTestId('toast-action'));
    await settle();
    expect(within(card('Breakfast')).queryByTestId('group')).toBeNull();
  });

  it('a pick-one logs its default', async () => {
    const api = createDemoApi();
    const logGroup = vi.spyOn(api, 'logGroup');
    await mountEaten(api);
    const sheet = await openAdd('Lunch');
    fireEvent.click(within(sheet).getAllByTestId('combo-result')[0]);
    await settle();
    const items = logGroup.mock.calls[0][0].items;
    expect(items.map((i) => i.food_id)).toEqual(['fd_demo_bread', 'fd_demo_turkey', 'fd_demo_cheddar']);
  });

  it('still works when combos fail: no section, and the foods are there', async () => {
    const api = createDemoApi();
    api.getCombos = vi.fn(async () => {
      throw new Error('down');
    });
    await mountEaten(api);
    const sheet = await openAdd('Breakfast');
    expect(within(sheet).queryByText("Combos you've logged")).toBeNull();
    expect(within(sheet).getAllByTestId('usual-result').length).toBeGreaterThan(0);
    expect(within(sheet).getByTestId('add-search')).toBeTruthy();
  });

  it('says it could not add when logging fails, and keeps the sheet', async () => {
    const api = createDemoApi();
    api.logGroup = vi.fn(async () => {
      throw new Error('down');
    });
    await mountEaten(api);
    const sheet = await openAdd('Breakfast');
    fireEvent.click(within(sheet).getAllByTestId('combo-result')[0]);
    await settle();
    expect(screen.getByTestId('add-status').textContent).toBe("Couldn't add Plain yogurt + Granola. Try again.");
  });
});

describe('the words and what a combo turns into', () => {
  it('says when in days', () => {
    expect(lastText('2026-11-14', '2026-11-14')).toBe('today');
    expect(lastText('2026-11-13', '2026-11-14')).toBe('yesterday');
    expect(lastText('2026-11-10', '2026-11-14')).toBe('4 days ago');
  });

  it('builds the usual from the combo, a pick-one keeping its default', async () => {
    const { combos } = await createDemoApi().getCombos();
    const c = combos.find((x) => x.name.startsWith('Sourdough'))!;
    expect(usualFromCombo(c, ' Sandwich ')).toMatchObject({ name: 'Sandwich', slot: 'Lunch' });
    expect(groupItems(c)).toHaveLength(3);
    expect(libraryMeta(c, '2026-11-14')).toMatch(/^7 lunches · last /);
  });

  it('works out kcal from the foods, or says about when one lacks them', async () => {
    const api = createDemoApi();
    const { combos } = await api.getCombos();
    const foods = new Map((await api.getFoods()).map((f) => [f.id, f]));
    const c = combos[0];
    expect(comboKcalText(c, foods)).toMatch(/^\d+ kcal$/);
    const first = foods.get(c.lines[0].food_id!)!;
    foods.set(first.id, { ...first, kcal_100g: null } as never);
    expect(comboKcalText(c, foods)).toMatch(/^about \d+ kcal$/);
    expect(joinLine(c, foods)).toBeNull();
  });
});
