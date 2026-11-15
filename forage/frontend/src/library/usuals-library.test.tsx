// #887: Library's Usuals segment and the usual editor, driven against the demo API (which stands in for #877).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ForageApi } from '../api/client';
import type { Usual } from '../api/types';
import { createDemoApi } from '../demo/demo-api';
import { readGlobalCss, rule } from '../test-css';
import { toastText } from '../ui/toast';
import { LibraryScreen } from './library-screen';
import { _resetFoods, libraryFoods, librarySection } from './foods-store';
import { _resetRecipes } from './recipes-store';
import {
  _resetUsuals,
  createSaver,
  draftFrom,
  foodsInShort,
  layoutNote,
  newUsualRequested,
  pickLayout,
  slotForTime,
  toInput,
  usuals,
} from './usuals-store';

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function mount(api: ForageApi) {
  librarySection.value = 'usuals';
  return render(<LibraryScreen api={api} empty={<p>empty recipes</p>} icon={() => null} />);
}

async function openUsual(name: string) {
  const rows = await screen.findAllByTestId('usual-row');
  const row = rows.find((r) => within(r).queryByText(name))!;
  fireEvent.click(within(row).getAllByRole('button')[0]);
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  _resetFoods();
  _resetRecipes();
  _resetUsuals();
  toastText.value = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the Usuals segment', () => {
  it('Library shows Foods, Usuals, Recipes in that order', async () => {
    mount(createDemoApi());
    await settle();
    const names = within(screen.getByRole('group', { name: 'Library' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names[0]).toMatch(/^Foods/);
    expect(names[1]).toMatch(/^Usuals/);
    expect(names[2]).toMatch(/^Recipes/);
  });

  it('lists every usual, most recently used first, with its foods, use line and starting kcal', async () => {
    mount(createDemoApi());
    await settle();
    const rows = screen.getAllByTestId('usual-row');
    expect(rows).toHaveLength(4);
    const order = rows.map((r) => r.querySelector('.recipe-name')!.textContent);
    // Two were last used yesterday (by name), then two days ago, then three.
    expect(order).toEqual(['After dinner cereal', 'Oatmeal', 'Side salad', 'Yogurt bowl']);
    const oat = rows[1];
    expect(within(oat).getByTestId('usual-usage').textContent).toBe('Breakfast · used 12 times, last yesterday');
    expect(within(oat).getByTestId('usual-foods').textContent).toContain(' · ');
    expect(within(oat).getByTestId('usual-kcal').textContent).toMatch(/kcal$/);
  });

  it('shows skeletons while loading, and Retry when it fails', async () => {
    const api = createDemoApi();
    let fail = true;
    const real = api.getUsuals;
    api.getUsuals = vi.fn(async (...a) => {
      if (fail) throw new Error('down');
      return real(...a);
    });
    mount(api);
    expect(screen.getByTestId('usuals-loading')).toBeTruthy();
    await settle();
    expect(screen.getByText("Couldn't load your usuals.")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settle();
    expect(screen.getAllByTestId('usual-row')).toHaveLength(4);
  });

  it('says what an empty list means', async () => {
    const api = createDemoApi();
    api.getUsuals = vi.fn(async () => []);
    mount(api);
    await settle();
    expect(screen.getByTestId('usuals-empty').textContent).toBe(
      'No usuals yet. Save one from a meal in Eaten, or start one with ＋ New usual.',
    );
  });
});

describe('the editor', () => {
  it('opens a usual; a name, slot, amount, order or removal saves within a second and survives reopening', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    expect(screen.getByTestId('usual-hint').textContent).toBe('Changes save as you go');

    fireEvent.input(screen.getByTestId('usual-name'), { target: { value: 'Porridge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /^More / })[0]);
    expect(upsert).not.toHaveBeenCalled();
    await wait(700);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('usual-hint').textContent).toBe('Saved');
    await wait(2100);
    expect(screen.getByTestId('usual-hint').textContent).toBe('Changes save as you go');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove line' })[0]);
    await wait(700);
    expect(upsert).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('usual-back'));
    await settle();
    await openUsual('Porridge');
    expect((screen.getByTestId('usual-name') as HTMLInputElement).value).toBe('Porridge');
    expect(screen.getByRole('button', { name: 'Lunch' }).getAttribute('aria-pressed')).toBe('true');
    const saved = await api.getUsual('us_demo_oatmeal');
    expect(saved.lines).toHaveLength(3);
  });

  it('ten fast taps on plus send at most two saves', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    const plus = screen.getAllByRole('button', { name: /^More / })[0];
    for (let i = 0; i < 10; i++) {
      fireEvent.click(plus);
      await wait(50);
    }
    await wait(1500);
    expect(upsert.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(upsert.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('Pick each time turns an Always line into a pick-one with the option search open; off keeps the starting option', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    const lines = screen.getAllByTestId('usual-line');
    expect(lines).toHaveLength(4);
    fireEvent.click(within(lines[1]).getByRole('switch'));
    await settle();
    expect(screen.getByTestId('usual-food-search')).toBeTruthy();
    fireEvent.click(screen.getAllByTestId('usual-food-result')[0]);
    await settle();
    let line = screen.getAllByTestId('usual-line')[1];
    expect(within(line).getAllByTestId('usual-option')).toHaveLength(2);
    expect(within(line).getByText(/starts here/)).toBeTruthy();
    await wait(700);
    expect(upsert.mock.calls.at(-1)![0].lines[1].options).toHaveLength(2);

    fireEvent.click(within(line).getByRole('switch'));
    await wait(700);
    line = screen.getAllByTestId('usual-line')[1];
    expect(within(line).queryByTestId('usual-option')).toBeNull();
    expect(upsert.mock.calls.at(-1)![0].lines[1].options).toBeUndefined();
    expect(upsert.mock.calls.at(-1)![0].lines[1].food_id).toBe('fd_demo_almond');
  });

  it('closing the option search with no second option puts the line back as it was', async () => {
    mount(createDemoApi());
    await settle();
    await openUsual('Oatmeal');
    const line = screen.getAllByTestId('usual-line')[1];
    fireEvent.click(within(line).getByRole('switch'));
    await settle();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();
    expect(within(screen.getAllByTestId('usual-line')[1]).queryByTestId('usual-option')).toBeNull();
    expect(screen.queryByTestId('usual-food-search')).toBeNull();
  });

  it('removing options down to one makes it an Always line', async () => {
    mount(createDemoApi());
    await settle();
    await openUsual('After dinner cereal');
    const line = screen.getAllByTestId('usual-line')[0];
    expect(within(line).getAllByTestId('usual-option')).toHaveLength(2);
    const removers = within(line)
      .getAllByRole('button')
      .filter(
        (b) => /^Remove /.test(b.getAttribute('aria-label') ?? '') && b.getAttribute('aria-label') !== 'Remove line',
      );
    fireEvent.click(removers[1]);
    await settle();
    expect(within(screen.getAllByTestId('usual-line')[0]).queryByTestId('usual-option')).toBeNull();
  });

  it('shows each option with its name and a note on buttons or a list', async () => {
    mount(createDemoApi());
    await settle();
    await openUsual('Yogurt bowl');
    const pickFive = screen.getAllByTestId('usual-line')[1];
    expect(within(pickFive).getAllByTestId('usual-option')).toHaveLength(5);
    expect(within(pickFive).getByTestId('layout-note').textContent).toContain('more than 3 options');
    expect(within(pickFive).getAllByText(/No brand|Kroger|Simple Truth|[A-Z]/).length).toBeGreaterThan(0);
  });

  it('a short name saves to the food and shows in the list', async () => {
    const api = createDemoApi();
    const save = vi.spyOn(api, 'saveFood');
    mount(api);
    await settle();
    await openUsual('After dinner cereal');
    const field = screen.getAllByTestId('short-name')[0] as HTMLInputElement;
    expect(field.maxLength).toBe(20);
    fireEvent.input(field, { target: { value: 'Cheeri' } });
    expect(save).not.toHaveBeenCalled();
    await wait(700);
    expect(save).toHaveBeenCalledWith({ id: 'fd_demo_cheerios', short_name: 'Cheeri' });
    expect(libraryFoods.value.find((f) => f.id === 'fd_demo_cheerios')!.short_name).toBe('Cheeri');
    fireEvent.click(screen.getByTestId('usual-back'));
    await settle();
    const row = screen.getAllByTestId('usual-row')[0];
    expect(within(row).getByTestId('usual-foods').textContent).toContain('Cheeri');
  });

  it('＋ Add a food adds an Always line at the first serving, quantity 1', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    fireEvent.click(screen.getByTestId('add-usual-food'));
    await settle();
    fireEvent.click(screen.getAllByTestId('usual-food-result')[0]);
    await wait(700);
    const lines = upsert.mock.calls.at(-1)![0].lines;
    expect(lines).toHaveLength(5);
    expect(lines[4].qty).toBe(1);
    expect(screen.getByText('Foods (5)')).toBeTruthy();
  });

  it('＋ New usual creates "New usual" for the meal of the time of day with the food search open', async () => {
    const api = createDemoApi();
    const upsert = vi.spyOn(api, 'upsertUsual');
    mount(api);
    await settle();
    await act(async () => {
      newUsualRequested.value = true;
    });
    await settle();
    expect(upsert.mock.calls[0][0]).toMatchObject({ name: 'New usual', slot: slotForTime(), lines: [] });
    expect((screen.getByTestId('usual-name') as HTMLInputElement).value).toBe('New usual');
    expect(screen.getByTestId('usual-food-search')).toBeTruthy();
    expect(usuals.value.some((u) => u.name === 'New usual')).toBe(true);
  });

  it('Delete usual asks inline, then returns to the list with a toast; Keep it cancels', async () => {
    const api = createDemoApi();
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    fireEvent.click(screen.getByRole('button', { name: 'Delete usual' }));
    expect(screen.getByText('Delete Oatmeal?')).toBeTruthy();
    expect(screen.getByText('Days you logged it keep their entries.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText('Delete Oatmeal?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete usual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(toastText.value).toBe('Deleted Oatmeal');
    expect(screen.getAllByTestId('usual-row')).toHaveLength(3);
    expect(await api.getUsuals()).toHaveLength(3);
  });

  it('a failed delete toasts and stays in the editor', async () => {
    const api = createDemoApi();
    api.deleteUsual = vi.fn(async () => {
      throw new Error('no');
    });
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    fireEvent.click(screen.getByRole('button', { name: 'Delete usual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(toastText.value).toBe("Couldn't delete Oatmeal. Try again.");
    expect(screen.getByTestId('usual-editor')).toBeTruthy();
  });

  it('a failed save says so, keeps the edits, and Try again sends them', async () => {
    const api = createDemoApi();
    const real = api.upsertUsual;
    let fail = true;
    api.upsertUsual = vi.fn(async (u) => {
      if (fail) throw new Error('down');
      return real(u);
    });
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    fireEvent.input(screen.getByTestId('usual-name'), { target: { value: 'Porridge' } });
    await wait(700);
    expect(screen.getByTestId('save-failed').textContent).toContain("Couldn't save. Your changes are kept here.");
    expect((screen.getByTestId('usual-name') as HTMLInputElement).value).toBe('Porridge');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByTestId('save-failed')).toBeNull();
    expect((await api.getUsual('us_demo_oatmeal')).name).toBe('Porridge');
  });

  it('leaving with a save pending sends it first', async () => {
    const api = createDemoApi();
    mount(api);
    await settle();
    await openUsual('Oatmeal');
    fireEvent.input(screen.getByTestId('usual-name'), { target: { value: 'Porridge' } });
    fireEvent.click(screen.getByTestId('usual-back'));
    await settle();
    expect((await api.getUsual('us_demo_oatmeal')).name).toBe('Porridge');
    expect(screen.getAllByTestId('usual-row').some((r) => r.textContent!.includes('Porridge'))).toBe(true);
  });
});

describe('the words and the saver', () => {
  it('picks the meal of the time of day', () => {
    const at = (h: number, m: number) => slotForTime(new Date(2026, 10, 14, h, m));
    expect([at(9, 0), at(10, 29)]).toEqual(['Breakfast', 'Breakfast']);
    expect([at(10, 30), at(14, 59)]).toEqual(['Lunch', 'Lunch']);
    expect([at(15, 0), at(19, 29)]).toEqual(['Dinner', 'Dinner']);
    expect([at(19, 30), at(20, 59)]).toEqual(['After dinner', 'After dinner']);
    expect([at(21, 0), at(23, 59)]).toEqual(['Snacks', 'Snacks']);
  });

  it('buttons need 3 options or fewer and every label 20 characters or fewer', () => {
    const f = (id: string, name: string, short_name = '') => [id, { id, name, short_name }] as const;
    const foods = new Map<string, any>([
      f('a', 'Oats'),
      f('b', 'Natural Creamy Peanut Butter'),
      f('c', 'Natural Creamy Peanut Butter', 'Creamy PB'),
    ]);
    const o = (id: string) => ({ food_id: id, qty: 1, unit: 'g' });
    expect(pickLayout([o('a'), o('c')], foods)).toEqual({ kind: 'buttons' });
    expect(pickLayout([o('a'), o('b')], foods)).toEqual({ kind: 'list', reason: 'name' });
    expect(pickLayout([o('a'), o('c'), o('a'), o('c')], foods)).toEqual({ kind: 'list', reason: 'count' });
    expect(layoutNote({ kind: 'list', reason: 'name' })).toContain('Short names on the foods can turn it back');
  });

  it('writes a pick-one with one option as an Always line, and a long pick-one as "A or n more"', async () => {
    const api = createDemoApi();
    const yogurt = (await api.getUsuals()).find((u) => u.name === 'Yogurt bowl')!;
    const foods = new Map((await api.getFoods()).map((x) => [x.id, x]));
    expect(foodsInShort(yogurt, foods)).toContain(' or 4 more');
    const draft = draftFrom(yogurt);
    draft.lines[0].options = [draft.lines[0].options![0]];
    expect(toInput('us_x', draft).lines[0]).toMatchObject({ food_id: 'fd_demo_kyogurt', qty: 0.75 });
  });

  it('a saver sends one call for a run and one more for changes made while it is out', async () => {
    const releases: (() => void)[] = [];
    const api = {
      upsertUsual: vi.fn(
        () =>
          new Promise<Usual>((r) => {
            releases.push(() => r({ lines: [] } as unknown as Usual));
          }),
      ),
    } as unknown as ForageApi;
    const saver = createSaver(api, { onState: () => {}, onSaved: () => {} });
    const job = { input: { name: 'x', slot: 'Lunch' as const, lines: [] }, keys: [] };
    for (let i = 0; i < 10; i++) saver.schedule(job);
    await wait(700);
    expect(api.upsertUsual).toHaveBeenCalledTimes(1);
    saver.schedule(job);
    await wait(700);
    expect(api.upsertUsual).toHaveBeenCalledTimes(1);
    await act(async () => releases[0]());
    await settle();
    expect(api.upsertUsual).toHaveBeenCalledTimes(2);
    await act(async () => releases[1]());
    await settle();
  });
});

describe('the stylesheet', () => {
  it('Library has three segments and nothing scrolls sideways at 375px', () => {
    const css = readGlobalCss();
    expect(rule(css, '.segmented')).toContain('repeat(3, minmax(0, 1fr))');
    expect(rule(css, '.usual-option')).toContain('min-width: 0');
    expect(rule(css, '.usual-option .recipe-name,\n.usual-option .recipe-meta')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.usual-line-name')).toContain('overflow-wrap: anywhere');
  });
});
