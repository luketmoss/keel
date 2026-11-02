// #719 in the app: the Add sheet (regulars, search, Add "…"), the buying amount sheet (meals need, chips, Save,
// Buy just what the meals need, Take off the list), late meals on Shop, the "need a store" banner, the header
// and row text, a list closed elsewhere, demo mode, and the stylesheet. The API's own rules are in
// forage/apps-script/tests/trips-added.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { Food, Trip, TripItem } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { _resetShop } from './shop-store';

const env = import.meta.env as Record<string, string | undefined>;
const NOW = new Date(2026, 10, 2, 10, 0);
const WED = '2026-11-04';
const THU = '2026-11-05';

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
  await settle();
}

async function open(hash = '#/shop', demo = false) {
  window.history.replaceState(null, '', `/${demo ? '?demo=true' : ''}${hash}`);
  render(<App />);
  await settle();
}

function item(over: Partial<TripItem>): TripItem {
  return {
    food_id: 'fd_1',
    name: 'Food',
    category: '',
    choice: '',
    suggested: false,
    bought: false,
    buy: '',
    mine: false,
    need: null,
    lines: [],
    packs: [],
    last_buy: '',
    last_bought_on: '',
    ...over,
  };
}

const line = (plan_id: string, recipe_name: string, date: string, amt: string) => ({
  plan_id,
  recipe_name,
  date,
  slot: 'Dinner',
  line_id: 'L1',
  text: amt,
  amt,
});

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
    created: 'x',
    updated: 'x',
    ...over,
  };
}

/** Eggs for the chili, sorted to King Soopers, with sizes and last time; an onion; nothing unsorted. */
function trip(over: Partial<Trip> = {}): Trip {
  const items = over.items ?? [
    item({
      food_id: 'fd_eggs',
      name: 'Eggs',
      category: 'Dairy',
      choice: 'ks',
      need: 'about 3 eggs',
      lines: [line('pl_wed', 'Weeknight chili', WED, '3')],
      packs: ['18 pack', '12 pack'],
      last_buy: '18 pack',
    }),
    item({
      food_id: 'fd_onion',
      name: 'Yellow onion',
      category: 'Produce',
      choice: 'ks',
      need: 'about 2 onions',
      lines: [line('pl_wed', 'Weeknight chili', WED, '2')],
    }),
  ];
  return {
    id: 'tr_1',
    status: 'open',
    through: '2026-11-07',
    created: 'x',
    closed_at: '',
    meals: [{ plan_id: 'pl_wed', date: WED, slot: 'Dinner', recipe_id: 'rc_chili', recipe_name: 'Weeknight chili' }],
    items,
    counts: { all: items.length, todo: 0, have: 0, ks: 0, costco: 0, other: 0, to_buy: 0, bought: 0 },
    unmatched: [],
    late_meals: [],
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetPlan();
  _resetShop();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const addSheet = () => screen.getByTestId('add-sheet');
const buySheet = () => screen.getByTestId('buy-sheet');
const rows = () => within(addSheet()).queryAllByTestId('add-row');
const rowNamed = (name: string) => rows().find((r) => r.querySelector('.recipe-name')!.textContent === name)!;
const sortItem = (name: string) =>
  screen.getAllByTestId('sort-item').find((el) => el.querySelector('.trip-item-name')!.textContent === name)!;

async function openAdd() {
  fireEvent.click(screen.getByTestId('add-item-btn'));
  await settle();
}

async function search(text: string) {
  fireEvent.input(within(addSheet()).getByTestId('add-search'), { target: { value: text } });
  await wait(300);
}

describe('the header and Sort rows', () => {
  it('Add sits left of Trip; the sub line counts items added by you; an added item says so and asks How much?', async () => {
    const api = fakeApi();
    api.trips.open = trip({ items: [...trip().items, item({ food_id: 'fd_tw', name: 'Paper towels', mine: true })] });
    await open();
    const actions = screen.getByTestId('add-item-btn').parentElement!;
    const ids = [...actions.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid'));
    expect(ids.indexOf('add-item-btn')).toBe(ids.indexOf('trip-menu-btn') - 1);
    expect(screen.getByTestId('trip-subline').textContent).toBe('1 meal · through Sat Nov 7 · 1 added by you');
    fireEvent.click(screen.getByRole('button', { name: /^Everything/ }));
    const towels = sortItem('Paper towels');
    expect(within(towels).getByText('Added by you')).toBeDefined();
    expect(within(towels).getByTestId('amount-btn').textContent).toBe('How much?');
  });
});

describe('the Add sheet', () => {
  it('with no regulars shows the ghost row; with some lists them by name, leaving out never-on-a-list foods', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    await open();
    await openAdd();
    expect(addSheet().getAttribute('role')).toBe('dialog');
    expect(within(addSheet()).getByRole('heading', { name: 'Add to the list' })).toBeDefined();
    expect(within(addSheet()).getByTestId('no-regulars').textContent).toBe(
      'No regulars yet. Mark the foods you buy every week as regulars in your library, or type to search.',
    );
    fireEvent.click(within(addSheet()).getByTestId('add-done'));
    await settle();

    api.foods.push(
      food('fd_milk', 'Milk', { regular: true, usual_store: 'ks', last_buy: '1 gallon' }),
      food('fd_bread', 'Bread', { regular: true }),
      food('fd_water', 'Water', { regular: true, never_shop: true }),
      food('fd_eggs', 'Eggs', { regular: true, usual_store: 'ks' }),
    );
    await openAdd();
    expect(within(addSheet()).getByText('Your regulars')).toBeDefined();
    expect(rows().map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual(['Bread', 'Eggs', 'Milk']);
    expect(rowNamed('Milk').querySelector('.recipe-meta')!.textContent).toBe('King Soopers · last time 1 gallon');
    expect(rowNamed('Milk').getAttribute('aria-label')).toBe('Milk, King Soopers, last time 1 gallon, add to list');
    expect(rowNamed('Bread').querySelector('.recipe-meta')!.textContent).toBe('No usual store yet');
    expect(rowNamed('Eggs').querySelector('.recipe-meta')!.textContent).toBe(
      'On the list for 1 meal · tap to change how much',
    );
    expect(rowNamed('Eggs').getAttribute('aria-label')).toBe('Eggs, on the list, change how much');
  });

  it('adding a regular stays open, says where it went, and its row becomes the tick row that opens its amount', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    api.foods.push(
      food('fd_milk', 'Milk', { regular: true, usual_store: 'ks', last_buy: '1 gallon', packs_json: ['1 gallon'] }),
      food('fd_bread', 'Bread', { regular: true }),
    );
    await open();
    await openAdd();
    fireEvent.click(rowNamed('Milk'));
    await settle();
    expect(api.calls('addToTrip').map((c) => c.payload)).toEqual([{ trip_id: 'tr_1', food_id: 'fd_milk' }]);
    expect(within(addSheet()).getByTestId('add-status').textContent).toBe('Added Milk to King Soopers: 1 gallon.');
    expect(within(addSheet()).getByTestId('add-status').getAttribute('role')).toBe('status');
    expect(rowNamed('Milk').querySelector('.recipe-meta')!.textContent).toBe('On the list: 1 gallon');
    expect(document.activeElement).toBe(rowNamed('Milk'));

    fireEvent.click(rowNamed('Bread'));
    await settle();
    expect(within(addSheet()).getByTestId('add-status').textContent).toBe('Added Bread. Pick its store on the list.');

    // A second tap opens the amount, never a second add.
    fireEvent.click(rowNamed('Milk'));
    await settle();
    expect(api.calls('addToTrip')).toHaveLength(2);
    expect(within(buySheet()).getByTestId('buy-need').textContent).toBe('Not in any planned meal. You added it.');
    expect((within(buySheet()).getByTestId('buy-field') as HTMLInputElement).value).toBe('1 gallon');
    expect(screen.getByTestId('trip-subline').textContent).toContain('2 added by you');
  });

  it('searches the library after a pause, leaving out never-on-a-list foods; Add "…" unless a name matches', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    api.foods.push(
      food('fd_milk', 'Milk'),
      food('fd_oat', 'Oat milk'),
      food('fd_water', 'Milk water', { never_shop: true }),
    );
    await open();
    await openAdd();
    await search('milk');
    expect(api.calls('getFoods').at(-1)!.params.get('q')).toBe('milk');
    expect(rows().map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual(['Milk', 'Oat milk']);
    expect(within(addSheet()).queryByTestId('add-new')).toBeNull();
    await search(' MILK ');
    expect(within(addSheet()).queryByTestId('add-new')).toBeNull();
    await search('dragon fruit');
    const fresh = within(addSheet()).getByTestId('add-new');
    expect(fresh.textContent).toBe('Add "dragon fruit"A new item. Forage remembers it for next time.+');
    fireEvent.click(fresh);
    await settle();
    expect(api.calls('addToTrip').at(-1)!.payload).toEqual({ trip_id: 'tr_1', text: 'dragon fruit' });
    expect(within(addSheet()).getByTestId('add-status').textContent).toBe(
      'Added dragon fruit. Pick its store on the list.',
    );
    expect((within(addSheet()).getByTestId('add-search') as HTMLInputElement).value).toBe('');
    expect(api.foods.some((f) => f.name === 'Dragon fruit')).toBe(true);
  });

  it('a failed search says so with Try again; Add "…" still works', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    await open();
    await openAdd();
    api.answer('getFoods', () => ({ success: false, error: 'boom' }));
    await search('kale');
    expect(within(addSheet()).getByText("Couldn't search your foods.")).toBeDefined();
    expect(within(addSheet()).getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(within(addSheet()).getByTestId('add-new')).toBeDefined();
  });

  it('a list closed elsewhere closes the sheet and Shop says so; a failed add says Try again', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    api.foods.push(food('fd_milk', 'Milk', { regular: true }));
    await open();
    await openAdd();
    api.answer('addToTrip', () => ({ success: false, error: 'x', code: 'network_glitch' }));
    fireEvent.click(rowNamed('Milk'));
    await settle();
    expect(within(addSheet()).getByTestId('add-status').textContent).toBe("Couldn't save that. Try again.");
    api.answer('addToTrip', () => ({ success: false, error: 'That trip is closed.', code: 'trip_closed' }));
    api.trips.open = null;
    fireEvent.click(rowNamed('Milk'));
    await settle();
    expect(screen.queryByTestId('add-sheet')).toBeNull();
    expect(screen.getByTestId('shop-notice').textContent).toBe('That list was already closed.');
    expect(screen.getByTestId('no-trip')).toBeDefined();
  });
});

describe('the buying amount sheet', () => {
  async function eggsSheet() {
    const api = fakeApi();
    api.trips.open = trip();
    await open();
    fireEvent.click(screen.getByRole('button', { name: /^Everything/ }));
    fireEvent.click(within(sortItem('Eggs')).getByTestId('amount-btn'));
    await settle();
    return api;
  }

  it('shows the store, what the meals need with a row per line, the field, and the chips with last time', async () => {
    await eggsSheet();
    const sheet = buySheet();
    expect(within(sheet).getByRole('heading', { name: 'Eggs' })).toBeDefined();
    expect(within(sheet).getByTestId('buy-store').textContent).toBe('King Soopers');
    const need = within(sheet).getByTestId('buy-need');
    expect(need.textContent).toBe('Your meals needabout 3 eggs3Weeknight chili · Wed');
    const field = within(sheet).getByTestId('buy-field') as HTMLInputElement;
    expect(field.maxLength).toBe(60);
    expect(field.placeholder).toBe('Just what the meals need');
    expect(within(sheet).getByLabelText("You're buying")).toBe(field);
    expect(
      within(sheet)
        .getAllByTestId('buy-chip')
        .map((c) => c.textContent),
    ).toEqual(['18 pack · last time', '12 pack']);
    expect(within(sheet).queryByTestId('buy-clear')).toBeNull();
    expect(within(sheet).queryByTestId('buy-remove')).toBeNull();
  });

  it('a chip fills the field and is pressed; tapping it again empties it; Save is disabled while unchanged', async () => {
    const api = await eggsSheet();
    const sheet = buySheet();
    const save = within(sheet).getByTestId('buy-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const [eighteen] = within(sheet).getAllByTestId('buy-chip');
    fireEvent.click(eighteen);
    expect((within(sheet).getByTestId('buy-field') as HTMLInputElement).value).toBe('18 pack');
    expect(eighteen.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(eighteen);
    expect((within(sheet).getByTestId('buy-field') as HTMLInputElement).value).toBe('');
    fireEvent.input(within(sheet).getByTestId('buy-field'), { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(eighteen);
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await settle();
    expect(api.calls('setTripItem').map((c) => c.payload)).toEqual([
      { trip_id: 'tr_1', food_id: 'fd_eggs', buy: '18 pack' },
    ]);
    expect(screen.queryByTestId('buy-sheet')).toBeNull();
    const button = within(sortItem('Eggs')).getByTestId('amount-btn');
    expect(button.querySelector('.trip-buy')!.textContent).toBe('Buying 18 pack');
    expect(button.querySelector('.trip-need')!.textContent).toBe('meals need about 3 eggs');

    // Shop mode: the buying amount leads.
    fireEvent.click(screen.getByTestId('make-lists'));
    await settle();
    const row = screen.getAllByTestId('shop-row').find((r) => r.textContent!.includes('Eggs'))!;
    expect(row.querySelector('.recipe-meta')!.textContent).toBe('18 pack · meals need about 3 eggs');
  });

  it('Buy just what the meals need shows only with an amount, and clears it at once; Have it keeps it', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    api.trips.open.items[0].buy = '18 pack';
    await open();
    fireEvent.click(screen.getByRole('button', { name: /^Everything/ }));
    fireEvent.click(within(sortItem('Eggs')).getByRole('button', { name: 'Have it' }));
    await settle();
    expect(within(sortItem('Eggs')).getByTestId('amount-btn').textContent).toContain('Buying 18 pack');
    fireEvent.click(within(sortItem('Eggs')).getByTestId('amount-btn'));
    await settle();
    expect(within(buySheet()).getByTestId('buy-store').textContent).toBe('Have it');
    fireEvent.click(within(buySheet()).getByTestId('buy-clear'));
    await settle();
    expect(api.calls('setTripItem').at(-1)!.payload).toEqual({ trip_id: 'tr_1', food_id: 'fd_eggs', buy: '' });
    expect(screen.queryByTestId('buy-sheet')).toBeNull();
    expect(within(sortItem('Eggs')).getByTestId('amount-btn').textContent).toBe('about 3 eggs');
  });

  it('Take off the list is only for an added item with no meals; from the Add sheet it goes back there', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    api.foods.push(food('fd_milk', 'Milk', { regular: true, usual_store: 'ks' }));
    await open();
    await openAdd();
    fireEvent.click(rowNamed('Milk'));
    await settle();
    fireEvent.click(rowNamed('Milk'));
    await settle();
    const remove = within(buySheet()).getByTestId('buy-remove');
    expect(remove.textContent).toBe('Take off the list');
    expect(within(buySheet()).getByTestId('buy-field').getAttribute('placeholder')).toBe('For example, 1 gallon');
    fireEvent.click(remove);
    await settle();
    expect(api.calls('removeTripItem').map((c) => c.payload)).toEqual([{ trip_id: 'tr_1', food_id: 'fd_milk' }]);
    expect(screen.queryByTestId('buy-sheet')).toBeNull();
    expect(within(addSheet()).getByTestId('add-status').textContent).toBe('Taken off the list.');
    expect(rowNamed('Milk').querySelector('.recipe-meta')!.textContent).toBe('King Soopers');
  });
});

describe('late meals and the store banner', () => {
  const LATE = [{ plan_id: 'pl_thu', recipe_name: 'Beef Stew', date: THU, slot: 'Dinner' as const }];

  it('Shop names one late meal with Add its items, two with Add their items; adding says what changed', async () => {
    const api = fakeApi();
    api.trips.open = trip({ late_meals: LATE });
    await open();
    const banner = screen.getByTestId('late-banner');
    expect(banner.querySelector('p')!.textContent).toBe('Beef Stew (Thu Nov 5) was planned after this list was made.');
    expect(banner.querySelector('strong')!.textContent).toBe('Beef Stew');
    expect(within(banner).getByRole('button').textContent).toBe('Add its items');

    api.answer('addToTrip', (p) => {
      expect(p).toMatchObject({ trip_id: 'tr_1', late_meals: true, today: '2026-11-02' });
      const t = trip({
        late_meals: [],
        items: [
          ...trip().items,
          item({ food_id: 'fd_a', name: 'A' }),
          item({ food_id: 'fd_b', name: 'B' }),
          item({ food_id: 'fd_c', name: 'C' }),
        ],
      });
      return {
        success: true,
        data: {
          trip: t,
          added: ['fd_a', 'fd_b', 'fd_c'],
          joined: ['fd_eggs', 'fd_onion'],
          meals: ['pl_thu'],
          food: null,
        },
      };
    });
    fireEvent.click(within(banner).getByRole('button'));
    await settle();
    expect(screen.queryByTestId('late-banner')).toBeNull();
    expect(screen.getByTestId('shop-notice').textContent).toBe('3 new items, and more of 2 already on the list.');
  });

  it('two late meals; nothing new says the meal is on the trip', async () => {
    const api = fakeApi();
    api.trips.open = trip({
      late_meals: [...LATE, { plan_id: 'pl_fri', recipe_name: 'Chili', date: '2026-11-06', slot: 'Dinner' }],
    });
    await open();
    const banner = screen.getByTestId('late-banner');
    expect(banner.querySelector('p')!.textContent).toBe('2 meals were planned after this list was made.');
    expect(within(banner).getByRole('button').textContent).toBe('Add their items');
    api.trips.open = trip({ late_meals: LATE });
    api.answer('addToTrip', () => ({
      success: true,
      data: { trip: trip(), added: [], joined: [], meals: ['pl_thu'], food: null },
    }));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    fireEvent.click(within(screen.getByTestId('late-banner')).getByRole('button'));
    await settle();
    expect(screen.getByTestId('shop-notice').textContent).toBe(
      'Beef Stew is on the trip. It needs nothing new on the list.',
    );
  });

  it('a Have it item that grew reads More needed under Everything', async () => {
    const api = fakeApi();
    const start = trip({ late_meals: LATE });
    start.items[1].choice = 'have';
    api.trips.open = start;
    await open();
    api.answer('addToTrip', () => {
      const t = trip();
      t.items[1] = { ...t.items[1], choice: 'have', need: 'about 8 onions' };
      return { success: true, data: { trip: t, added: [], joined: ['fd_onion'], meals: ['pl_thu'], food: null } };
    });
    fireEvent.click(within(screen.getByTestId('late-banner')).getByRole('button'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /^Everything/ }));
    expect(within(sortItem('Yellow onion')).getByTestId('more-needed').textContent).toBe('More needed: about 8 onions');
    expect(within(sortItem('Eggs')).queryByTestId('more-needed')).toBeNull();
  });

  it('Shop mode shows N added items need a store while any is unsorted; Sort opens To sort', async () => {
    const api = fakeApi();
    api.trips.open = trip();
    await open();
    fireEvent.click(screen.getByTestId('make-lists'));
    await settle();
    expect(screen.queryByTestId('store-banner')).toBeNull();
    await openAdd();
    await search('kale');
    fireEvent.click(within(addSheet()).getByTestId('add-new'));
    await settle();
    fireEvent.click(within(addSheet()).getByTestId('add-done'));
    await settle();
    const banner = screen.getByTestId('store-banner');
    expect(banner.querySelector('p')!.textContent).toBe('1 added item needs a store before it shows on a list.');
    fireEvent.click(within(banner).getByRole('button', { name: 'Sort' }));
    await settle();
    expect(screen.getByRole('button', { name: /^To sort/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByTestId('sort-item').map((el) => el.querySelector('.trip-item-name')!.textContent)).toEqual([
      'Kale',
    ]);
  });
});

describe('the stylesheet: 44px and 375px', () => {
  const css = readGlobalCss();
  it.each(['.add-row', '.trip-amount', '.chip', '.text-btn', '.btn', '.field'])('%s is at least 44px', (sel) => {
    expect(rule(css, sel)).toContain('min-height: var(--touch-target)');
  });

  it('rows and amounts wrap, chips wrap, the amount truncates after two lines', () => {
    expect(rule(css, '.add-row')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.chip-row')).toContain('flex-wrap: wrap');
    expect(rule(css, '.trip-buy')).toContain('-webkit-line-clamp: 2');
    expect(rule(css, '.trip-amount')).toContain('max-width: 60%');
    expect(rule(css, '.buy-need-amount')).toContain('overflow-wrap: anywhere');
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

  it('reaches regulars, a new-item row, an added item, chips, a late meal and the store banner, saving nothing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await open('#/shop', true);
    expect(screen.getByTestId('trip-subline').textContent).toContain('1 added by you');
    expect(screen.getByTestId('late-banner').querySelector('p')!.textContent).toMatch(
      /was planned after this list was made\.$/,
    );

    await openAdd();
    expect(rows().map((r) => r.querySelector('.recipe-name')!.textContent)).toEqual([
      'Eggs',
      'Meadowfield Oat and Honey bar',
      'Milk',
    ]);
    fireEvent.click(rowNamed('Eggs'));
    await settle();
    expect(within(addSheet()).getByTestId('add-status').textContent).toBe('Added Eggs to King Soopers: 18 pack.');
    fireEvent.click(rowNamed('Eggs'));
    await settle();
    expect(
      within(buySheet())
        .getAllByTestId('buy-chip')
        .map((c) => c.textContent),
    ).toEqual(['18 pack · last time', '12 pack']);
    fireEvent.click(within(buySheet()).getByRole('button', { name: 'Close' }));
    await settle();
    await search('dragon fruit');
    expect(within(addSheet()).getByTestId('add-new')).toBeDefined();
    fireEvent.click(within(addSheet()).getByTestId('add-done'));
    await settle();

    fireEvent.click(within(screen.getByTestId('late-banner')).getByRole('button'));
    await settle();
    expect(screen.queryByTestId('late-banner')).toBeNull();
    expect(screen.getByTestId('shop-notice').textContent).toMatch(/new item|already on the list|on the trip/);

    // Sort everything, make the lists, then add something with no store: the banner.
    for (const el of screen.getAllByTestId('sort-item')) {
      if (!el.querySelector('.choice-grid [aria-pressed="true"]')) {
        fireEvent.click(within(el).getByRole('button', { name: 'Other' }));
      }
    }
    await settle();
    fireEvent.click(screen.getByTestId('make-lists'));
    await settle();
    await openAdd();
    await search('dragon fruit');
    fireEvent.click(within(addSheet()).getByTestId('add-new'));
    await settle();
    fireEvent.click(within(addSheet()).getByTestId('add-done'));
    await settle();
    expect(screen.getByTestId('store-banner')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
