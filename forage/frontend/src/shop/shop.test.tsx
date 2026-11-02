// #718 in the app: the Shop tab's no-trip state, the trip setup sheet (from Shop and from the Plan banner),
// Sort, Shop mode, Done shopping, the trip menu, failed writes and loads, demo mode, and the stylesheet's 44px
// and 375px rules. The API's own rules are in forage/apps-script/tests/trips.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { PlanEntry, Trip, TripItem } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetPlan } from '../plan/plan-store';
import { fakeApi } from '../test-api';
import { readGlobalCss, rule } from '../test-css';
import { _resetShop } from './shop-store';
import { lastTripLine } from './trip-format';

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

function line(plan_id: string, recipe_name: string, date: string, text: string, amt = '1') {
  return { plan_id, recipe_name, date, slot: 'Dinner', line_id: 'L1', text, amt };
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
    ...over,
  };
}

const WED = '2026-11-04';
const FRI = '2026-11-06';

/** Two meals; an onion both use, a suggested Costco butter, a suggested Have it oil, two unsorted, one unmatched. */
function trip(over: Partial<Trip> = {}): Trip {
  const items = over.items ?? [
    item({
      food_id: 'fd_onion',
      name: 'Yellow onion',
      category: 'Produce',
      need: 'about 3 onions',
      lines: [
        line('pl_wed', 'Weeknight chili', WED, '2 onions, diced'),
        line('pl_fri', 'Beef Stew', FRI, '1 medium onion, chopped'),
      ],
    }),
    item({
      food_id: 'fd_cilantro',
      name: 'Cilantro',
      category: 'Produce',
      need: '1 bunch',
      lines: [line('pl_wed', 'Weeknight chili', WED, '1 bunch cilantro')],
    }),
    item({
      food_id: 'fd_butter',
      name: 'Butter',
      category: 'Dairy',
      choice: 'costco',
      suggested: true,
      need: '2 tbsp',
      lines: [line('pl_fri', 'Beef Stew', FRI, '2 tbsp butter')],
    }),
    item({
      food_id: 'fd_oil',
      name: 'Olive oil',
      category: 'Pantry',
      choice: 'have',
      suggested: true,
      need: '2 tbsp + 1 tbsp',
      lines: [line('pl_wed', 'Weeknight chili', WED, '2 tbsp olive oil'), line('pl_fri', 'Beef Stew', FRI, '')],
    }),
  ];
  return {
    id: 'tr_1',
    status: 'open',
    through: '2026-11-07',
    created: 'x',
    closed_at: '',
    meals: [
      { plan_id: 'pl_wed', date: WED, slot: 'Dinner', recipe_id: 'rc_chili', recipe_name: 'Weeknight chili' },
      { plan_id: 'pl_fri', date: FRI, slot: 'Dinner', recipe_id: 'rc_stew', recipe_name: 'Beef Stew' },
    ],
    items,
    counts: { all: items.length, todo: 0, have: 0, ks: 0, costco: 0, other: 0, to_buy: 0, bought: 0 },
    unmatched: [{ plan_id: 'pl_fri', recipe_name: 'Beef Stew', line_id: 'L9', text: '1 bay leaf' }],
    ...over,
  };
}

function meal(over: Partial<PlanEntry>): PlanEntry {
  return {
    id: 'pl_1',
    date: TODAY,
    slot: 'Dinner',
    recipe_id: 'rc_chili',
    note: '',
    trip_id: '',
    created: 'x',
    updated: 'x',
    recipe_name: 'Weeknight chili',
    servings: 4,
    kcal_serving: 400,
    partial: false,
    trip_status: '',
    on_trip: false,
    shopped: false,
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

const sortItems = () => screen.getAllByTestId('sort-item');
const itemNamed = (name: string) =>
  sortItems().find((el) => el.querySelector('.trip-item-name')!.textContent === name)!;
const choice = (el: HTMLElement, label: string) => within(el).getByRole('button', { name: label });
const segment = (label: RegExp) => screen.getByRole('button', { name: label });

describe('Shop with no open trip', () => {
  it("shows No trip in progress, Plan a trip and the Last trip line; #704's copy is replaced", async () => {
    const api = fakeApi();
    api.trips.closed = [
      {
        id: 'tr_0',
        status: 'closed',
        through: '',
        created: '',
        closed_at: '2026-10-27T18:00:00.000Z',
        items: 19,
        bought: 17,
        stores: ['ks', 'costco'],
      },
    ];
    await open();
    const card = screen.getByTestId('no-trip');
    expect(card.textContent).toContain('No trip in progress');
    expect(card.textContent).toContain(
      'A trip gathers what your planned meals need, so you can mark what you have and split the rest by store.',
    );
    expect(within(card).getByRole('button', { name: 'Plan a trip' })).toBeDefined();
    expect(screen.getByTestId('last-trip').textContent).toBe('Last trip: Oct 27, King Soopers and Costco, 19 items.');
    expect(screen.queryByText('No shopping list')).toBeNull();
    expect(screen.queryByTestId('trip-menu-btn')).toBeNull();
  });

  it('has no Last trip line before any trip has closed, and words three stores and one item', async () => {
    fakeApi();
    await open();
    expect(screen.queryByTestId('last-trip')).toBeNull();
    expect(
      lastTripLine({
        id: 't',
        status: 'closed',
        through: '',
        created: '',
        closed_at: '2026-10-27T18:00:00Z',
        items: 1,
        bought: 1,
        stores: ['ks', 'costco', 'other'],
      }),
    ).toBe('Last trip: Oct 27, King Soopers, Costco and Other, 1 item.');
  });

  it('a failed load offers Try again, which loads it', async () => {
    const api = fakeApi();
    let fail = true;
    api.answer('getTrip', () => (fail ? { success: false, error: 'down' } : { success: true, data: { trip: null } }));
    await open();
    const err = screen.getByTestId('shop-error');
    expect(err.getAttribute('role')).toBe('status');
    expect(err.textContent).toContain("Couldn't load your trip.");
    fail = false;
    fireEvent.click(within(err).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(screen.queryByTestId('shop-error')).toBeNull();
    expect(screen.getByTestId('no-trip')).toBeDefined();
  });
});

describe('the Plan banner', () => {
  it('shows Plan a trip when no trip is open, which opens the setup sheet over Plan', async () => {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_wed', date: WED }));
    api.counts.notOnTrip = 1;
    api.trips.built = trip({ items: [] });
    await open('#/plan');
    const banner = screen.getByTestId('plan-banner');
    expect(banner.textContent).toBe("1 planned meal isn't on a shopping trip yet.Plan a trip");
    fireEvent.click(within(banner).getByRole('button', { name: 'Plan a trip' }));
    await settle();
    expect(screen.getByTestId('trip-setup')).toBeDefined();
    expect(screen.getByTestId('screen-plan')).toBeDefined();
  });
});

describe('the trip setup sheet', () => {
  function seedPlan(api: ReturnType<typeof fakeApi>) {
    api.plan.push(
      meal({ id: 'pl_today', date: TODAY }),
      meal({ id: 'pl_wed', date: WED, recipe_name: 'Weeknight chili' }),
      meal({ id: 'pl_note', date: WED, slot: 'Lunch', recipe_id: '', recipe_name: '', note: 'Out' }),
      meal({ id: 'pl_fri', date: FRI, recipe_id: 'rc_stew', recipe_name: 'Beef Stew' }),
      meal({ id: 'pl_on', date: FRI, slot: 'Lunch', trip_id: 'tr_0', on_trip: true }),
      meal({ id: 'pl_mon', date: '2026-11-09', recipe_id: 'rc_stew', recipe_name: 'Beef Stew' }),
    );
    api.trips.built = trip();
  }

  async function openSheet() {
    await open();
    fireEvent.click(screen.getByTestId('plan-trip-btn'));
    await settle();
    return screen.getByTestId('trip-setup');
  }

  it('defaults to 5 days ahead with every eligible meal ticked, counted by a dry run', async () => {
    const api = fakeApi();
    seedPlan(api);
    const sheet = await openSheet();
    const chips = within(sheet).getAllByTestId('through-chip');
    expect(chips.map((c) => c.textContent)).toEqual(['Thu 5', 'Sat 7', 'Mon 9']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    const rows = within(sheet).getAllByTestId('trip-meal');
    expect(rows.map((r) => r.textContent)).toEqual([
      '✓Weeknight chiliWed Nov 4 · Dinner',
      '✓Beef StewFri Nov 6 · Dinner',
    ]);
    expect(rows.every((r) => r.getAttribute('aria-pressed') === 'true')).toBe(true);
    const dry = api.calls('startTrip');
    expect(dry).toHaveLength(1);
    expect(dry[0].payload).toMatchObject({
      through: '2026-11-07',
      plan_ids: ['pl_wed', 'pl_fri'],
      today: TODAY,
      dry_run: true,
    });
    expect(dry[0].payload.id).toMatch(/^tr_[0-9a-f]{8}$/);
    expect(within(sheet).getByTestId('trip-count').textContent).toBe(
      '4 ingredients, combined where meals share them. Things you usually have start as "Have it".' +
        "1 ingredient isn't matched to a food yet, so it won't be on the list.",
    );
    expect(within(sheet).getByTestId('build-trip').textContent).toBe('Build the list');
  });

  it('a date or a tick asks again after 300 ms; a tick survives a date change; none ticked starts an empty list', async () => {
    const api = fakeApi();
    seedPlan(api);
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getAllByTestId('through-chip')[2]);
    await settle();
    expect(within(sheet).getByTestId('trip-count').textContent).toBe('Counting…');
    await wait(350);
    expect(api.calls('startTrip').at(-1)!.payload.plan_ids).toEqual(['pl_wed', 'pl_fri', 'pl_mon']);
    fireEvent.click(within(sheet).getAllByTestId('trip-meal')[2]);
    fireEvent.click(within(sheet).getAllByTestId('through-chip')[1]);
    fireEvent.click(within(sheet).getAllByTestId('through-chip')[2]);
    await wait(350);
    expect(within(sheet).getAllByTestId('trip-meal')[2].getAttribute('aria-pressed')).toBe('false');
    expect(api.calls('startTrip').at(-1)!.payload.plan_ids).toEqual(['pl_wed', 'pl_fri']);
    for (const r of within(sheet).getAllByTestId('trip-meal').slice(0, 2)) fireEvent.click(r);
    await wait(350);
    expect(api.calls('startTrip').at(-1)!.payload.plan_ids).toEqual([]);
    expect(within(sheet).getByTestId('build-trip').textContent).toBe('Start a list with no meals');
  });

  it('says so when no meals are in range, and the count failing leaves Build working', async () => {
    const api = fakeApi();
    api.trips.built = trip({ items: [], unmatched: [], meals: [] });
    api.answer('startTrip', (p) =>
      p.dry_run
        ? { success: false, error: 'x' }
        : { success: true, data: { trip: trip({ items: [], meals: [] }), written: true, dry_run: false } },
    );
    const sheet = await openSheet();
    expect(within(sheet).getByTestId('no-trip-meals').textContent).toBe('No planned meals in these dates');
    expect(within(sheet).getByTestId('trip-count').textContent).toBe("Couldn't count the ingredients.");
    fireEvent.click(within(sheet).getByTestId('build-trip'));
    await settle();
    expect(screen.queryByTestId('trip-setup')).toBeNull();
    expect(screen.getByTestId('trip-empty').textContent).toBe(
      'Nothing on this list.This trip has no ingredients to sort.',
    );
    expect(screen.getByTestId('make-lists').textContent).toBe('Make lists: 0 to buy');
    expect(screen.getByTestId('make-lists').getAttribute('aria-disabled')).toBeNull();
    expect(screen.getByTestId('trip-subline').textContent).toBe('No meals · through Sat Nov 7');
  });

  it('a refusal shows the API text under the button and keeps the sheet; the same id is sent again', async () => {
    const api = fakeApi();
    seedPlan(api);
    let refuse = true;
    api.answer('startTrip', (p) =>
      p.dry_run || !refuse
        ? { success: true, data: { trip: trip(), written: !p.dry_run, dry_run: !!p.dry_run } }
        : { success: false, error: 'pl_wed is already on trip tr_9.', code: 'ineligible' },
    );
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByTestId('build-trip'));
    await settle();
    expect(within(sheet).getByTestId('trip-setup-status').textContent).toBe('pl_wed is already on trip tr_9.');
    refuse = false;
    fireEvent.click(within(sheet).getByTestId('build-trip'));
    await settle();
    const writes = api.calls('startTrip').filter((c) => c.payload.dry_run === false);
    expect(writes).toHaveLength(2);
    expect(writes[0].payload.id).toBe(writes[1].payload.id);
    expect(screen.queryByTestId('trip-setup')).toBeNull();
  });
});

describe('Sort', () => {
  async function building(over: Partial<Trip> = {}) {
    const api = fakeApi();
    api.plan.push(meal({ id: 'pl_wed', date: WED }));
    api.trips.built = trip(over);
    await open();
    fireEvent.click(screen.getByTestId('plan-trip-btn'));
    await settle();
    fireEvent.click(screen.getByTestId('build-trip'));
    await settle();
    return api;
  }

  it('Build opens Sort: progress, counts, To sort selected, groups by category, needs, breakdowns, four choices', async () => {
    await building();
    expect(screen.getByTestId('trip-subline').textContent).toBe('2 meals · through Sat Nov 7');
    expect(screen.getByTestId('trip-menu-btn')).toBeDefined();
    expect(screen.getByText('Do you have it, or where will you get it?')).toBeDefined();
    const counts = screen.getByTestId('sort-counts');
    expect(counts.textContent).toBe('2 of 4 sorted · 1 have · 0 King Soopers · 1 Costco · 0 other');
    expect(counts.getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('.trip-progress')!.getAttribute('aria-hidden')).toBe('true');
    expect(segment(/^To sort/).textContent).toBe('To sort (2)');
    expect(segment(/^To sort/).getAttribute('aria-pressed')).toBe('true');
    expect(segment(/^Everything/).textContent).toBe('Everything (4)');
    expect(screen.getAllByTestId('trip-group').map((g) => g.querySelector('h2')!.textContent)).toEqual(['Produce']);

    fireEvent.click(segment(/^Everything/));
    expect(screen.getAllByTestId('trip-group').map((g) => g.querySelector('h2')!.textContent)).toEqual([
      'Dairy',
      'Pantry',
      'Produce',
    ]);
    const onion = itemNamed('Yellow onion');
    expect(onion.querySelector('.trip-need')!.textContent).toBe('about 3 onions');
    const more = within(onion).getByRole('button', { name: 'Show 2 meals' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(within(onion).getByRole('button', { name: 'Hide 2 meals' }).getAttribute('aria-expanded')).toBe('true');
    expect(
      within(onion)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['Weeknight chili · Wed: 2 onions, diced', 'Beef Stew · Fri: 1 medium onion, chopped']);
    expect(itemNamed('Cilantro').querySelector('.trip-muted')!.textContent).toBe(
      'Weeknight chili · Wed: 1 bunch cilantro',
    );
    const group = within(onion).getByRole('group');
    expect(group.getAttribute('aria-labelledby')).toBe(onion.querySelector('.trip-item-name')!.id);
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Have it', 'King Soopers', 'Costco', 'Other']);
    // A breakdown line whose recipe line is gone shows the snapshot's amount.
    fireEvent.click(within(itemNamed('Olive oil')).getByRole('button', { name: 'Show 2 meals' }));
    expect(within(itemNamed('Olive oil')).getAllByRole('listitem')[1].textContent).toBe('Beef Stew · Fri: 1');
    expect(screen.getByTestId('unmatched').textContent).toContain('1 bay leaf · Beef Stew');
  });

  it('a pick stays in To sort until the filter changes; suggested items say why; a remembered store says so', async () => {
    const api = await building();
    api.answer('setTripItem', (p) => ({
      success: true,
      data: {
        item: { ...trip().items.find((i) => i.food_id === p.food_id)!, choice: p.choice },
        remembered: p.choice === 'ks',
      },
    }));
    fireEvent.click(choice(itemNamed('Yellow onion'), 'King Soopers'));
    expect(choice(itemNamed('Yellow onion'), 'King Soopers').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('sort-counts').textContent).toBe(
      '3 of 4 sorted · 1 have · 1 King Soopers · 1 Costco · 0 other',
    );
    await settle();
    expect(api.calls('setTripItem')[0].payload).toMatchObject({ food_id: 'fd_onion', choice: 'ks' });
    expect(itemNamed('Yellow onion')).toBeDefined();
    expect(within(itemNamed('Yellow onion')).getByTestId('why').textContent).toBe(
      'Forage will suggest King Soopers next time',
    );
    fireEvent.click(segment(/^Everything/));
    fireEvent.click(segment(/^To sort/));
    expect(sortItems().map((el) => el.querySelector('.trip-item-name')!.textContent)).toEqual(['Cilantro']);
    fireEvent.click(segment(/^Everything/));
    expect(within(itemNamed('Butter')).getByTestId('why').textContent).toBe(
      'Suggested: you usually get this at Costco',
    );
    expect(within(itemNamed('Olive oil')).getByTestId('why').textContent).toBe('Suggested: you usually have this');
  });

  it('Make lists is disabled, saying why, while anything is unsorted; To sort empty says everything is sorted', async () => {
    await building();
    const make = screen.getByTestId('make-lists');
    expect(make.textContent).toBe('Sort 2 more to make your lists');
    expect(make.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(make);
    expect(screen.getByTestId('make-lists').textContent).toBe('Sort 2 more to make your lists');
    fireEvent.click(choice(itemNamed('Yellow onion'), 'King Soopers'));
    fireEvent.click(choice(itemNamed('Cilantro'), 'Other'));
    await settle();
    expect(screen.getByTestId('make-lists').textContent).toBe('Make lists: 3 to buy');
    fireEvent.click(segment(/^Everything/));
    fireEvent.click(segment(/^To sort/));
    expect(screen.getByTestId('all-sorted').textContent).toContain('Everything is sorted');
  });

  it('a failed choice reverts and says so', async () => {
    const api = await building();
    api.answer('setTripItem', () => ({ success: false, error: 'down' }));
    fireEvent.click(choice(itemNamed('Yellow onion'), 'Costco'));
    expect(choice(itemNamed('Yellow onion'), 'Costco').getAttribute('aria-pressed')).toBe('true');
    await settle();
    expect(choice(itemNamed('Yellow onion'), 'Costco').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('toast').textContent).toBe("Couldn't save that. Try again.");
  });

  it('a write refused because the trip was closed elsewhere says so and reloads', async () => {
    const api = await building();
    api.answer('setTripItem', () => ({ success: false, error: 'Trip tr_1 is closed.', code: 'trip_closed' }));
    api.trips.open = null;
    fireEvent.click(choice(itemNamed('Yellow onion'), 'Costco'));
    await settle();
    expect(screen.getByTestId('toast').textContent).toBe('This trip was closed or thrown away.');
    expect(screen.getByTestId('no-trip')).toBeDefined();
  });
});

describe('Shop mode, Done shopping and the trip menu', () => {
  /** A sorted trip: two King Soopers items, one Costco, one Have it. */
  function sorted(): Trip {
    return trip({
      items: [
        item({
          food_id: 'fd_onion',
          name: 'Yellow onion',
          category: 'Produce',
          choice: 'ks',
          need: 'about 3 onions',
          lines: [line('pl_wed', 'Weeknight chili', WED, 'x'), line('pl_fri', 'Beef Stew', FRI, 'y')],
        }),
        item({
          food_id: 'fd_cilantro',
          name: 'Cilantro',
          category: 'Produce',
          choice: 'ks',
          need: '1 bunch',
          lines: [line('pl_wed', 'Weeknight chili', WED, 'z')],
        }),
        item({ food_id: 'fd_butter', name: 'Butter', category: 'Dairy', choice: 'costco', need: '2 tbsp' }),
        item({ food_id: 'fd_oil', name: 'Olive oil', category: 'Pantry', choice: 'have' }),
      ],
    });
  }

  async function shopping() {
    const api = fakeApi();
    api.trips.open = sorted();
    await open();
    fireEvent.click(screen.getByTestId('make-lists'));
    await settle();
    return api;
  }

  it('shows a tab per store with bought/total; ticking toggles bought and saves; the Have it line', async () => {
    const api = await shopping();
    const tabs = screen.getAllByTestId('store-tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['King Soopers 0/2', 'Costco 0/1']);
    expect(tabs[0].closest('[role="group"]')!.getAttribute('aria-label')).toBe('Store');
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
    const rows = screen.getAllByTestId('shop-row');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Cilantro, 1 bunch, not bought',
      'Yellow onion, about 3 onions, not bought',
    ]);
    expect(rows[1].textContent).toContain('about 3 onions · Weeknight chili, Beef Stew');
    fireEvent.click(rows[0]);
    expect(screen.getAllByTestId('shop-row')[0].getAttribute('aria-pressed')).toBe('true');
    await settle();
    expect(api.calls('setTripItem')[0].payload).toEqual({ trip_id: 'tr_1', food_id: 'fd_cilantro', bought: true });
    // The row stays put until the tab changes.
    expect(screen.getAllByTestId('shop-row')[0].getAttribute('aria-label')).toBe('Cilantro, 1 bunch, bought');
    expect(screen.getAllByTestId('store-tab')[0].textContent).toBe('King Soopers 1/2');
    expect(screen.getByTestId('done-shopping').textContent).toBe('Done shopping · 1/3 bought');
    expect(screen.getByText('Have it: 1 item, not on any list.')).toBeDefined();
    fireEvent.click(screen.getAllByTestId('store-tab')[1]);
    fireEvent.click(screen.getAllByTestId('store-tab')[0]);
    expect(screen.getAllByTestId('shop-row').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Yellow onion, about 3 onions, not bought',
      'Cilantro, 1 bunch, bought',
    ]);
    fireEvent.click(screen.getByTestId('change-where'));
    await settle();
    expect(segment(/^Everything/).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the view in localStorage for the trip, and opens in it again', async () => {
    await shopping();
    fireEvent.click(screen.getAllByTestId('store-tab')[1]);
    expect(JSON.parse(localStorage.getItem('forage_trip_view')!)).toEqual({
      trip_id: 'tr_1',
      mode: 'shop',
      store: 'costco',
    });
  });

  it('Done shopping lists what was not bought; Close the trip closes it, goes to Plan and says so', async () => {
    const api = await shopping();
    api.plan.push(
      meal({ id: 'pl_wed', date: WED, trip_id: 'tr_1', on_trip: true, shopped: true, trip_status: 'closed' }),
    );
    fireEvent.click(screen.getByTestId('done-shopping'));
    const sheet = screen.getByTestId('done-sheet');
    expect(sheet.textContent).toContain('0 of 3 bought.');
    expect(
      within(sheet)
        .getAllByRole('listitem')
        .map((l) => l.textContent),
    ).toEqual(['Yellow onionKing Soopers', 'CilantroKing Soopers', 'ButterCostco']);
    expect(sheet.textContent).toContain(
      'Not bought. Closing the trip forgets them, and their meals still count as shopped.',
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Keep shopping' }));
    expect(screen.queryByTestId('done-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('done-shopping'));
    fireEvent.click(screen.getByTestId('close-trip'));
    await settle();
    expect(api.calls('closeTrip')[0].payload).toEqual({ trip_id: 'tr_1' });
    expect(window.location.hash).toBe('#/plan');
    expect(screen.getByTestId('toast').textContent).toBe('Trip closed. Its meals are marked shopped.');
    expect(screen.getByTestId('trip-chip').textContent).toBe('Shopped');
    expect(localStorage.getItem('forage_trip_view')).toBeNull();
  });

  it('the trip menu lists the meals; Throw this list away asks first, then deletes it, leaving the meals planned', async () => {
    const api = await shopping();
    fireEvent.click(screen.getByTestId('trip-menu-btn'));
    await settle();
    const menu = screen.getByTestId('trip-menu');
    expect(within(menu).getByTestId('trip-menu-meals').textContent).toBe(
      'Weeknight chili · Wed Nov 4Beef Stew · Fri Nov 6',
    );
    expect(within(menu).getByTestId('menu-change-where')).toBeDefined();
    expect(within(menu).getByTestId('menu-discard').textContent).toBe(
      'Throw this list away4 items. Your meals stay planned.',
    );
    fireEvent.click(within(menu).getByTestId('menu-discard'));
    expect(within(menu).getByTestId('discard-question').textContent).toContain(
      'Its 4 items and your choices on them are deleted. Your meals stay planned.',
    );
    expect(api.calls('discardTrip')).toHaveLength(0);
    fireEvent.click(within(menu).getByTestId('discard-yes'));
    await settle();
    expect(api.calls('discardTrip')[0].payload).toEqual({ trip_id: 'tr_1' });
    expect(screen.queryByTestId('trip-menu')).toBeNull();
    expect(screen.getByTestId('no-trip')).toBeDefined();
    expect(screen.getByTestId('toast').textContent).toBe('List thrown away. Your meals are still planned.');
  });

  it('a failed close says so under the buttons and keeps the sheet', async () => {
    const api = await shopping();
    api.answer('closeTrip', () => ({ success: false, error: 'down' }));
    fireEvent.click(screen.getByTestId('done-shopping'));
    fireEvent.click(screen.getByTestId('close-trip'));
    await settle();
    expect(within(screen.getByTestId('done-sheet')).getByRole('status').textContent).toBe(
      "Couldn't save that. Try again.",
    );
  });

  it('with every item Have it, Shop mode says Nothing to buy and Done shopping still closes', async () => {
    const api = fakeApi();
    api.trips.open = trip({ items: [item({ food_id: 'fd_oil', name: 'Olive oil', choice: 'have' })] });
    await open();
    fireEvent.click(screen.getByTestId('make-lists'));
    expect(screen.queryAllByTestId('store-tab')).toEqual([]);
    expect(screen.getByTestId('nothing-to-buy').textContent).toBe('Nothing to buy.');
    expect(screen.getByTestId('done-shopping').textContent).toBe('Done shopping · 0/0 bought');
  });
});

describe('the stylesheet: 44px targets, nothing sideways at 375px', () => {
  const css = readGlobalCss();
  it.each(['.trip-choice', '.shop-row', '.tick-row', '.segment', '.btn', '.text-btn', '.chip'])(
    '%s is at least 44px',
    (sel) => {
      expect(rule(css, sel)).toContain('min-height: var(--touch-target)');
    },
  );

  it('the four choices share the row and wrap their labels; names and needs wrap', () => {
    expect(rule(css, '.choice-grid')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(rule(css, '.trip-choice')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.trip-item-name')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.trip-need')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.trip-item-head')).toContain('flex-wrap: wrap');
    expect(rule(css, '.toast')).toContain('max-width: calc(100% - 2 * var(--space-md))');
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

  it('opens on the sample trip in Sort; sorting, shopping, closing, throwing away and building work in memory', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await open('#/shop', true);
    expect(segment(/^To sort/).getAttribute('aria-pressed')).toBe('true');
    expect(segment(/^Everything/).textContent).toBe('Everything (10)');
    expect(screen.getByTestId('sort-counts').textContent).toBe(
      '6 of 10 sorted · 2 have · 2 King Soopers · 1 Costco · 1 other',
    );
    expect(screen.getByTestId('unmatched').textContent).toContain('1 bay leaf · Weeknight chili');
    fireEvent.click(segment(/^Everything/));
    expect(within(itemNamed('Olive oil')).getByRole('button', { name: 'Show 2 meals' })).toBeDefined();
    expect(itemNamed('Olive oil').querySelector('.trip-need')!.textContent).toBe('2 tbsp + 1 tbsp');
    expect(within(itemNamed('Garlic')).getByTestId('why').textContent).toBe(
      'Suggested: you usually get this at King Soopers',
    );

    for (const name of ['Cilantro', 'Hilltop Dairy Plain yogurt', 'Kidney beans', 'Paper towels'])
      fireEvent.click(choice(itemNamed(name), 'Costco'));
    await settle();
    expect(screen.getByTestId('make-lists').textContent).toBe('Make lists: 8 to buy');
    fireEvent.click(screen.getByTestId('make-lists'));
    fireEvent.click(screen.getAllByTestId('shop-row')[0]);
    await settle();
    expect(screen.getAllByTestId('store-tab')[0].textContent).toBe('King Soopers 1/2');

    // Throw it away: the meals stay planned, and Plan a trip builds from them in memory.
    fireEvent.click(screen.getByTestId('trip-menu-btn'));
    await settle();
    fireEvent.click(screen.getByTestId('menu-discard'));
    fireEvent.click(screen.getByTestId('discard-yes'));
    await settle();
    expect(screen.getByTestId('last-trip').textContent).toMatch(
      /^Last trip: \w{3} \d+, King Soopers and Costco, 2 items\.$/,
    );
    fireEvent.click(screen.getByTestId('plan-trip-btn'));
    await settle();
    expect(screen.getAllByTestId('trip-meal').length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByTestId('build-trip'));
    await settle();
    fireEvent.click(segment(/^Everything/));
    const onion = itemNamed('Onion');
    expect(within(onion).getByRole('button', { name: /^Show \d meals$/ })).toBeDefined();
    expect(onion.querySelector('.trip-need')!.textContent).toMatch(/^about \d+ onions$/);

    // Close it.
    for (const el of sortItems()) if (!el.querySelector('[aria-pressed="true"]')) fireEvent.click(choice(el, 'Other'));
    await settle();
    fireEvent.click(screen.getByTestId('make-lists'));
    fireEvent.click(screen.getByTestId('done-shopping'));
    fireEvent.click(screen.getByTestId('close-trip'));
    await settle();
    expect(window.location.hash).toBe('#/plan');
    expect(screen.getAllByTestId('trip-chip').every((c) => c.textContent === 'Shopped')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
