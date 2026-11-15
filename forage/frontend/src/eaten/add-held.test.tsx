// #931: the Add sheet's lists are held between opens, kept on the device for the signed-in account, refreshed once
// an open behind what is shown, patched by the app's own writes, and removed at sign-out. Driven against the demo API
// with every read counted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry } from '../api/types';
import App from '../App';
import { fakeApi } from '../test-api';
import { AuthContext } from '../auth/auth-context';
import { createDemoApi } from '../demo/demo-api';
import { _resetFoods, keepFood, deleteFood } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { _resetLookback } from './copy-meal';
import { addCombos, addFailed, addLists, bindAddAccount, clearAddHeld, refreshAdd } from './add-store';
import { EatenScreen } from './eaten-screen';
import { _resetEaten, removeEntry, upsertEntry } from './eaten-store';

const EMAIL = 'luke@example.com';
const KEY = `forage_add:${EMAIL}`;

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

/** The demo API with each read counted, and made to fail once `state.down` is set. */
function counted() {
  const state = { down: false };
  const api = createDemoApi();
  const counts = { getFoods: 0, getRecipes: 0, getFoodLog: 0, getCombos: 0 };
  const wrap = (name: keyof typeof counts) => {
    const real = (api as any)[name].bind(api);
    (api as any)[name] = (...a: unknown[]) => {
      counts[name]++;
      return state.down ? Promise.reject(new Error('down')) : real(...a);
    };
  };
  (Object.keys(counts) as (keyof typeof counts)[]).forEach(wrap);
  return { api: api as ForageApi, counts, state };
}

const auth = (email: string | null) => ({
  token: email ? 'tok' : null,
  user: email ? { email, name: 'Luke', picture: '' } : null,
  isAuthenticated: !!email,
  login: () => {},
  logout: () => {},
  rememberedUser: null,
  ready: true,
  renewing: false,
  renewError: null,
  continueAs: () => {},
});

async function mount(api: ForageApi, email: string | null = EMAIL) {
  window.history.replaceState(null, '', '/#/eaten');
  const view = render(
    <AuthContext.Provider value={auth(email)}>
      <EatenScreen api={api} />
    </AuthContext.Provider>,
  );
  await settle();
  return view;
}

const addButton = (slot = 'Breakfast') =>
  screen.getAllByTestId('add-to-meal').find((b) => b.getAttribute('data-slot') === slot) as HTMLElement;

async function openAdd(slot = 'Breakfast') {
  fireEvent.click(addButton(slot));
}

function food(id: string, name: string): Food {
  return {
    id,
    name,
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: 100,
    protein_100g: 1,
    carbs_100g: 1,
    fat_100g: 1,
    servings_json: null,
    source: 'manual',
    created: '',
    updated: '',
  };
}

function entry(id: string, over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id,
    date: new Date().toISOString().slice(0, 10),
    slot: 'Breakfast',
    food_id: 'fd_new',
    recipe_id: '',
    qty: 100,
    unit: 'g',
    grams: 100,
    kcal: 100,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
    partial: false,
    source: 'app',
    logged_at: new Date().toISOString(),
    created: 'x',
    updated: 'x',
    ...over,
  } as FoodLogEntry;
}

beforeEach(() => {
  localStorage.clear();
  _resetEaten();
  _resetLookback();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('opening the sheet again', () => {
  it('shows the held lists on the first frame, with one request each an open and none on a return', async () => {
    const { api, counts } = counted();
    await mount(api);
    const base = { ...counts };
    await openAdd();
    expect(screen.getByTestId('add-loading')).toBeTruthy();
    await settle();
    expect(screen.queryByTestId('add-loading')).toBeNull();
    // The first open: one of each.
    expect(counts.getFoods - base.getFoods).toBe(1);
    expect(counts.getRecipes - base.getRecipes).toBe(1);
    expect(counts.getFoodLog - base.getFoodLog).toBe(1);
    expect(counts.getCombos - base.getCombos).toBe(1);

    // Close and open again: the first frame has the lists, and one refresh follows.
    fireEvent.click(within(screen.getByTestId('add-sheet')).getByLabelText('Close'));
    await settle();
    const before = { ...counts };
    await openAdd();
    expect(screen.queryByTestId('add-loading')).toBeNull();
    expect(within(screen.getByTestId('add-sheet')).getAllByTestId('add-result').length).toBeGreaterThan(0);
    await settle();
    expect(counts.getFoods - before.getFoods).toBe(1);
    expect(counts.getRecipes - before.getRecipes).toBe(1);
    expect(counts.getFoodLog - before.getFoodLog).toBe(1);
    expect(counts.getCombos - before.getCombos).toBe(1);

    // Out to the amount sheet and back: nothing is read.
    const mid = { ...counts };
    fireEvent.click(within(screen.getByTestId('add-sheet')).getAllByTestId('add-result')[0]);
    await settle();
    expect(screen.getByTestId('amount-sheet')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('amount-sheet')).getByLabelText('Close'));
    await settle();
    expect(screen.getByTestId('add-sheet')).toBeTruthy();
    expect(counts).toEqual(mid);
  });

  it('shows the lists kept from an earlier session on the first frame, then refreshes behind them', async () => {
    const first = counted();
    const view = await mount(first.api);
    await openAdd();
    await settle();
    expect(localStorage.getItem(KEY)).toBeTruthy();
    view.unmount();

    // A fresh start: memory is gone, the device still has them.
    _resetEaten();
    _resetFoods();
    const second = counted();
    await mount(second.api);
    const base = { ...second.counts };
    await openAdd();
    expect(screen.queryByTestId('add-loading')).toBeNull();
    expect(within(screen.getByTestId('add-sheet')).getAllByTestId('add-result').length).toBeGreaterThan(0);
    await settle();
    expect(second.counts.getFoods - base.getFoods).toBe(1);
    expect(second.counts.getCombos - base.getCombos).toBe(1);
  });

  it('keeps the held lists and says nothing when the refresh fails', async () => {
    const first = counted();
    const view = await mount(first.api);
    await openAdd();
    await settle();
    view.unmount();

    const down = counted();
    await mount(down.api);
    down.state.down = true;
    await openAdd();
    await settle();
    const sheet = screen.getByTestId('add-sheet');
    expect(within(sheet).queryByTestId('add-loading')).toBeNull();
    expect(sheet.textContent).not.toContain("Couldn't load");
    expect(within(sheet).getAllByTestId('add-result').length).toBeGreaterThan(0);
  });

  it('shows the skeleton on the very first open, and Try again when that load fails', async () => {
    const down = counted();
    await mount(down.api);
    down.state.down = true;
    await openAdd();
    expect(screen.getByTestId('add-loading')).toBeTruthy();
    await settle();
    expect(screen.getByTestId('add-sheet').textContent).toContain("Couldn't load your foods.");
    expect(addFailed.value).toBe(true);
  });
});

describe('the store', () => {
  it('works from memory when storage throws', async () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    const { api, counts } = counted();
    expect(() => bindAddAccount(EMAIL)).not.toThrow();
    expect(addLists.value).toBeNull();
    await refreshAdd(api, 'Breakfast', '2026-11-15');
    await settle();
    expect(addLists.value?.foods.length).toBeGreaterThan(0);
    expect(addCombos.value.Breakfast).toBeTruthy();
    // Held in memory: a second open in the session has it, and one refresh.
    expect(counts.getFoods).toBe(1);
    expect(() => clearAddHeld()).not.toThrow();
  });

  it('reads a copy that is not what was written as nothing held', () => {
    localStorage.setItem(KEY, '{not json');
    bindAddAccount(EMAIL);
    expect(addLists.value).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ v: 1, lists: { foods: 1 }, combos: [], usuals: 2 }));
    clearAddHeld();
    bindAddAccount(EMAIL);
    expect(addLists.value).toBeNull();
    expect(addCombos.value).toEqual({});
  });

  it('keeps one account separate from another', async () => {
    const { api } = counted();
    bindAddAccount(EMAIL);
    await refreshAdd(api, 'Breakfast', '2026-11-15');
    await settle();
    expect(addLists.value).not.toBeNull();
    bindAddAccount('other@example.com');
    expect(addLists.value).toBeNull();
    bindAddAccount(EMAIL);
    expect(addLists.value).not.toBeNull();
  });

  it('removes every copy at sign-out', async () => {
    const { api } = counted();
    bindAddAccount(EMAIL);
    await refreshAdd(api, 'Breakfast', '2026-11-15');
    await settle();
    localStorage.setItem('forage_add:other@example.com', '{}');
    localStorage.setItem('forage_cook', 'keep');
    expect(localStorage.getItem(KEY)).toBeTruthy();
    clearAddHeld();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('forage_add:other@example.com')).toBeNull();
    expect(localStorage.getItem('forage_cook')).toBe('keep');
    expect(addLists.value).toBeNull();
    // Nothing is written back after it.
    await settle();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('the demo user never reads or writes the real account', async () => {
    const real = counted();
    bindAddAccount(EMAIL);
    await refreshAdd(real.api, 'Breakfast', '2026-11-15');
    await settle();
    const kept = localStorage.getItem(KEY);
    expect(kept).toBeTruthy();

    // Demo binds no account: it starts with nothing held and leaves the real copy as it was.
    bindAddAccount(null);
    expect(addLists.value).toBeNull();
    const demo = counted();
    await refreshAdd(demo.api, 'Breakfast', '2026-11-15');
    await settle();
    expect(addLists.value).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBe(kept);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('forage_add:'))).toEqual([KEY]);
  });

  it('keeps the held lists current: a food created, edited or deleted, an entry logged or deleted', async () => {
    const { api } = counted();
    bindAddAccount(EMAIL);
    await refreshAdd(api, 'Breakfast', '2026-11-15');
    await settle();
    const foods = () => addLists.value!.foods;
    const log = () => addLists.value!.log;

    keepFood(food('fd_new', 'Kohlrabi'));
    expect(foods().some((f) => f.id === 'fd_new')).toBe(true);
    keepFood({ ...food('fd_new', 'Kohlrabi'), name: 'Kohlrabi, raw' });
    expect(
      foods()
        .filter((f) => f.id === 'fd_new')
        .map((f) => f.name),
    ).toEqual(['Kohlrabi, raw']);

    upsertEntry(entry('lg_new'));
    expect(log().some((e) => e.id === 'lg_new')).toBe(true);
    removeEntry('lg_new');
    expect(log().some((e) => e.id === 'lg_new')).toBe(false);
    // One older than the 60 days is not in a refresh, so not here.
    upsertEntry(entry('lg_old', { date: '2020-01-01' }));
    expect(log().some((e) => e.id === 'lg_old')).toBe(false);

    await settle();
    expect(JSON.parse(localStorage.getItem(KEY)!).lists.foods.some((f: Food) => f.id === 'fd_new')).toBe(true);

    vi.spyOn(api, 'deleteFood').mockResolvedValue(undefined as never);
    expect(await deleteFood(api, 'fd_new')).toBeNull();
    expect(foods().some((f) => f.id === 'fd_new')).toBe(false);
  });

  it('a refresh that began before a write does not undo it', async () => {
    const { api } = counted();
    bindAddAccount(EMAIL);
    await refreshAdd(api, 'Breakfast', '2026-11-15');
    await settle();
    // A second pass: the answer is on its way when a food is created.
    const gate: { release: () => void } = { release: () => {} };
    const slow = new Promise<void>((r) => (gate.release = r));
    const realFoods = api.getFoods.bind(api);
    api.getFoods = async () => {
      await slow;
      return realFoods();
    };
    const { beginAddPass } = await import('./add-store');
    beginAddPass();
    const pending = refreshAdd(api, 'Breakfast', '2026-11-15');
    keepFood(food('fd_mid', 'Midway'));
    gate.release();
    await pending;
    expect(addLists.value!.foods.some((f) => f.id === 'fd_mid')).toBe(true);
  });
});

describe('sign-out', () => {
  it('the account menu removes the held lists from the device', async () => {
    localStorage.setItem('forage_user', JSON.stringify({ email: EMAIL, name: 'Luke', picture: '' }));
    localStorage.setItem('forage_token', 'tok');
    localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, lists: { foods: [], recipes: [], log: [] }, combos: {}, usuals: [] }),
    );
    fakeApi();
    window.history.replaceState(null, '', '/#/eaten');
    render(<App />);
    await settle();
    expect(localStorage.getItem(KEY)).toBeTruthy();
    fireEvent.click(screen.getByTestId('account-btn'));
    fireEvent.click(screen.getByText('Sign out'));
    await settle();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('forage_token')).toBeNull();
  });
});
