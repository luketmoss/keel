// #520, #551 - the Water and Alcohol tiles, the log row under them and the state
// behind both: the optimistic add, rollback, time edit, delete behind the in-app
// confirm, the past-day and future-day rules, loading and failure, rapid taps,
// the goal, the Trends link, the last 7 days, and demo mode.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';

const api = vi.hoisted(() => ({
  logDrink: vi.fn(),
  getDrinks: vi.fn(),
  getDrinkTotals: vi.fn(),
  updateDrinkTime: vi.fn(),
  deleteDrink: vi.fn(),
  updateSetting: vi.fn(),
}));
vi.mock('../../api/drinks', async (orig) => ({ ...(await orig<typeof import('../../api/drinks')>()), ...api }));
const demo = vi.hoisted(() => ({ on: false }));
vi.mock('../../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../../api/demo-data')>()),
  isDemo: () => demo.on,
}));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import type { Drink } from '../../api/drinks';
import { DrinkCards } from './drinks-cards';
import { SLOTS, slotsFor } from './slots';
import { readGlobalCss } from '../../test-css';
import { confirmText, mountConfirmHost, openedConfirm } from '../shared/confirm-test-utils';
import {
  addDrink,
  drinkDays,
  formatOz,
  loadDrinks,
  ozToGoalMl,
  QUICK_WATER_ML,
  resetDrinks,
  saveWaterGoal,
  waterGoalMl,
} from '../../state/drinks';

const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };
const TODAY = '2026-10-20';
const YESTERDAY = '2026-10-19';
/** 12:00 in Denver (MDT, UTC-6). */
const NOW = new Date('2026-10-20T18:00:00.000Z');

function drink(id: string, kind: 'water' | 'alcohol' | 'coffee', date: string, time: string, amount?: number): Drink {
  return {
    id,
    kind,
    amount: amount ?? (kind === 'water' ? 118 : 1),
    date,
    time,
    logged_at_utc: `${date}T${time}Z`,
    source: 'app',
    created: 'c',
    updated: 'u',
  };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

async function mount(date = TODAY, state: 'today' | 'past' = 'today') {
  const view = render(
    <AuthContext.Provider value={AUTH}>
      <DrinkCards date={date} state={state} today={TODAY} />
    </AuthContext.Provider>,
  );
  await flush();
  return view;
}

const card = (c: Element, title: string) =>
  [...c.querySelectorAll('section.day-panel')].find((s) => s.querySelector('h2')!.textContent === title)!;
const toggle = (c: Element) => c.querySelector<HTMLButtonElement>('button.drinks-log-toggle');
/** The log row opens on a press; the entry list is not there before it. */
const openLog = (c: Element) => {
  const t = toggle(c);
  if (t && t.getAttribute('aria-expanded') === 'false') fireEvent.click(t);
};
/** One kind's entries, from the one list under the tiles (opened if it is not). */
const entries = (c: Element, title: string) => {
  openLog(c);
  const icon = `.drink-icon-${title.toLowerCase()}`;
  return [...c.querySelectorAll('li.drink-entry')].filter((li) => li.querySelector(icon));
};
const total = (c: Element, title: string) => card(c, title).querySelector('.drink-total')!.textContent;
const button = (c: Element, label: string) => c.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  for (const f of Object.values(api)) f.mockReset();
  demo.on = false;
  resetDrinks();
  api.getDrinks.mockResolvedValue({ ok: true, data: { drinks: [], water_goal_ml: 1893 } });
  api.logDrink.mockImplementation(async (input) => ({
    ok: true,
    data: { ...drink(input.id, input.kind, TODAY, '12:00:00', input.amount), logged_at_utc: input.logged_at_utc },
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('slot', () => {
  it('is the drinks slot, between sleep and the tiles, and never mounts on a future day', () => {
    expect(SLOTS.drinks).toBe(DrinkCards);
    expect(slotsFor('today').indexOf('drinks')).toBe(slotsFor('today').indexOf('sleep') + 1);
    expect(slotsFor('today').indexOf('vitals')).toBe(slotsFor('today').indexOf('drinks') + 1);
    expect(slotsFor('future')).not.toContain('drinks');
  });
});

describe('display', () => {
  it('formats ounces to the nearest whole ounce', () => {
    expect(formatOz(118)).toBe('4');
    expect(formatOz(590)).toBe('20');
    expect(formatOz(1893)).toBe('64');
    expect(formatOz(0)).toBe('0');
    expect(formatOz(100)).toBe('3');
    expect(formatOz(251)).toBe('8');
  });

  it('reads any number of + 4 oz taps as a multiple of 4', () => {
    // 118 ml is 3.99 oz: tenths showed six taps as "23.9" (#571).
    for (let taps = 1; taps <= 40; taps++) {
      expect(formatOz(taps * QUICK_WATER_ML)).toBe(String(taps * 4));
    }
  });

  it('shows 0 oz / 0 drinks and one "Nothing logged yet." line, not a button, on a quiet day', async () => {
    const { container } = await mount();
    expect(total(container, 'Water')).toBe('0oz');
    expect(card(container, 'Water').textContent).toContain('of 64');
    expect(card(container, 'Water').textContent).not.toContain('of 64 oz');
    expect(total(container, 'Alcohol')).toBe('0drinks');
    expect(total(container, 'Coffee')).toBe('0cups');
    expect(container.querySelector('.drinks-log-empty')!.textContent).toBe('Nothing logged yet.');
    expect(toggle(container)).toBeNull();
    expect(card(container, 'Water').querySelector('.drink-bar-fill')!.getAttribute('style')).toContain('width: 0%');
  });

  it('lists entries newest first with their times and amounts', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [
          drink('a', 'water', TODAY, '13:10:00'),
          drink('b', 'water', TODAY, '15:42:00'),
          drink('c', 'alcohol', TODAY, '21:05:00'),
        ],
        water_goal_ml: 1893,
      },
    });
    const { container } = await mount();
    expect(entries(container, 'Water').map((e) => e.textContent)).toEqual(['3:42 PM4 oz⋯', '1:10 PM4 oz⋯']);
    expect(total(container, 'Water')).toBe('8oz');
    expect(entries(container, 'Alcohol')[0].textContent).toContain('9:05 PM1 drink');
    expect(total(container, 'Alcohol')).toBe('1drink');
  });

  it('fills the bar to total / goal, capped at 100%, while the figure keeps counting', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', TODAY, '08:00:00', 2129)], water_goal_ml: 1893 },
    });
    const { container } = await mount();
    const bar = card(container, 'Water').querySelector('.drink-bar')!;
    expect(total(container, 'Water')).toBe('72oz');
    expect(card(container, 'Water').textContent).toContain('of 64');
    expect(bar.querySelector('.drink-bar-fill')!.getAttribute('style')).toContain('width: 100%');
    expect(bar.getAttribute('aria-valuenow')).toBe('64');
    expect(bar.getAttribute('aria-valuemax')).toBe('64');
    expect(bar.getAttribute('aria-valuetext')).toBe('Water 72 ounces of 64');
    expect(card(container, 'Water').querySelector('.drink-total-reached')).not.toBeNull();
  });

  it('names each total and button for a screen reader', async () => {
    const { container } = await mount();
    expect(card(container, 'Water').querySelector('p.sr-only[role="status"]')!.textContent).toBe(
      'Water 0 ounces of 64',
    );
    expect(card(container, 'Alcohol').querySelector('p.sr-only[role="status"]')!.textContent).toBe('Alcohol 0 drinks');
    expect(button(container, 'Add 4 ounces of water').textContent).toBe('+ 4 oz');
    expect(button(container, 'Add one alcoholic drink').textContent).toBe('+ 1');
    expect(card(container, 'Coffee').querySelector('p.sr-only[role="status"]')!.textContent).toBe('Coffee 0 cups');
    expect(button(container, 'Add one cup of coffee').textContent).toBe('+ 1');
  });

  it('uses the goal the API returned', async () => {
    api.getDrinks.mockResolvedValue({ ok: true, data: { drinks: [], water_goal_ml: 2957 } });
    const { container } = await mount();
    expect(card(container, 'Water').textContent).toContain('of 100');
  });
});

describe('the tiles', () => {
  const seed = () =>
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [
          drink('a', 'water', TODAY, '10:00:00'),
          drink('c', 'alcohol', TODAY, '21:05:00'),
          drink('k', 'coffee', TODAY, '07:00:00'),
          drink('k2', 'coffee', TODAY, '08:00:00'),
        ],
        water_goal_ml: 1893,
      },
    });

  it('are Water full width, then Coffee and Alcohol side by side, in a two-column grid, with the card padding and title size', async () => {
    const { container } = await mount();
    const grid = container.querySelector('.drinks-grid')!;
    expect([...grid.children].map((c) => c.getAttribute('data-drink'))).toEqual(['water', 'coffee', 'alcohol']);
    const css = readGlobalCss();
    expect(css).toMatch(/\.drink-tile-water\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(css).toMatch(/\.drinks-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.drinks-grid\s*\{[^}]*gap:\s*var\(--day-gap\)/);
    expect(css).toMatch(/\.drink-tile \.day-panel\s*\{[^}]*padding:\s*calc\(var\(--space-md\) - var\(--space-xs\)\)/);
    expect(css).toMatch(/\.day-screen \.drink-tile \.day-panel-title\s*\{[^}]*font-size:\s*var\(--text-sm\)/);
  });

  it('show the figure, the ›, and a link to Trends Intake for the viewed date', async () => {
    seed();
    const { container } = await mount();
    expect(card(container, 'Water').querySelector('.day-card-chevron')!.textContent).toBe('›');
    expect(card(container, 'Alcohol').querySelector('.day-card-chevron')).not.toBeNull();
    const water = card(container, 'Water').querySelector<HTMLAnchorElement>('a.day-card-link')!;
    expect(water.getAttribute('href')).toBe(`#/trends/intake?date=${TODAY}`);
    expect(water.textContent).toBe('Water 4 oz. Open Intake trends');
    expect(card(container, 'Alcohol').querySelector('a.day-card-link')!.textContent).toBe(
      'Alcohol 1 drink. Open Intake trends',
    );
    expect(card(container, 'Coffee').querySelector('.day-card-chevron')).not.toBeNull();
    expect(card(container, 'Coffee').querySelector<HTMLAnchorElement>('a.day-card-link')!.textContent).toBe(
      'Coffee 2 cups. Open Intake trends',
    );
  });

  it('link the date being viewed, not today', async () => {
    const { container } = await mount(YESTERDAY, 'past');
    expect(card(container, 'Water').querySelector('a.day-card-link')!.getAttribute('href')).toBe(
      `#/trends/intake?date=${YESTERDAY}`,
    );
  });

  it('keep the add button apart from the link: it adds and never navigates', async () => {
    const { container } = await mount();
    const before = location.hash;
    const add = button(container, 'Add 4 ounces of water');
    expect(add.closest('a')).toBeNull();
    fireEvent.click(add);
    expect(location.hash).toBe(before);
    expect(total(container, 'Water')).toBe('4oz');
    const css = readGlobalCss();
    expect(css).toMatch(/\.drink-add\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1/);
    expect(css).toMatch(/\.drink-add::before\s*\{[^}]*inset:\s*-5px 0/);
  });

  it('draw the water bar 6px and no bar for alcohol', async () => {
    const { container } = await mount();
    expect(readGlobalCss()).toMatch(/--drink-bar-height:\s*6px/);
    expect(card(container, 'Water').querySelector('.drink-bar')).not.toBeNull();
    expect(card(container, 'Alcohol').querySelector('.drink-bar')).toBeNull();
    expect(card(container, 'Coffee').querySelector('.drink-bar')).toBeNull();
  });

  it('give the add buttons the compact size, left-aligned, at the foot of the tile', async () => {
    const { container } = await mount();
    for (const label of ['Add 4 ounces of water', 'Add one cup of coffee', 'Add one alcoholic drink']) {
      expect(button(container, label).classList.contains('btn-sm')).toBe(true);
    }
    expect(readGlobalCss()).toMatch(/\.drink-add\s*\{[^}]*align-self:\s*flex-start;[^}]*margin-top:\s*auto/);
  });

  it('have no add button on a past day, and still link and draw their bars', async () => {
    seed();
    const { container } = await mount(YESTERDAY, 'past');
    expect(container.querySelector('.drink-add')).toBeNull();
    expect(container.querySelectorAll('.drink-week')).toHaveLength(3);
  });

  it('do not say "Drinks can only be added today." any more, nor label the card "today"', async () => {
    const { container } = await mount(YESTERDAY, 'past');
    expect(container.textContent).not.toContain('Drinks can only be added today.');
    expect(card(container, 'Water').querySelector('.day-panel-meta')).toBeNull();
  });

  it('draw seven bars for the 7 days ending on the viewed day, the viewed day highlighted', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [
          drink('h1', 'water', '2026-10-16', '09:00:00', 946), // 32 oz
          drink('h2', 'water', '2026-10-17', '09:00:00', 1419), // 48 oz
          drink('h4', 'alcohol', '2026-10-17', '20:00:00'),
          drink('h5', 'water', TODAY, '09:00:00', 236),
        ],
        water_goal_ml: 1893,
      },
    });
    const { container } = await mount();
    const water = card(container, 'Water').querySelector('.drink-week')!;
    expect(water.getAttribute('role')).toBe('img');
    expect(water.getAttribute('aria-label')).toBe('Water, last 7 days: no data, no data, 32, 48, 0, 0, 8 ounces');
    expect(water.querySelectorAll('.drink-week-slot')).toHaveLength(7);
    expect(water.querySelectorAll('.drink-week-slot:empty')).toHaveLength(2);
    expect(water.querySelectorAll('.drink-week-bar-viewed')).toHaveLength(1);
    expect(water.querySelector('.drink-week-slot:last-child .drink-week-bar-viewed')).not.toBeNull();
    expect(water.querySelector('.drink-week-goal')).not.toBeNull();
    const heights = [...water.querySelectorAll('.drink-week-bar')].map((b) => b.getAttribute('style'));
    expect(heights).toEqual(['height: 50%;', 'height: 75%;', 'height: 0%;', 'height: 0%;', 'height: 12.5%;']);
    const alcohol = card(container, 'Alcohol').querySelector('.drink-week')!;
    expect(alcohol.getAttribute('aria-label')).toBe('Alcohol, last 7 days: no data, no data, 0, 1, 0, 0, 0 drinks');
    expect(alcohol.querySelector('.drink-week-goal')).toBeNull();
  });

  it('draw coffee bars on a 4-cup scale, capped, with the cups worded', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [
          drink('k1', 'coffee', '2026-10-17', '08:00:00'),
          ...[1, 2, 3, 4, 5].map((n) => drink(`k2${n}`, 'coffee', '2026-10-18', `0${n}:00:00`)),
          drink('k3', 'coffee', TODAY, '07:00:00'),
          drink('k4', 'coffee', TODAY, '09:00:00'),
        ],
        water_goal_ml: 1893,
      },
    });
    const { container } = await mount();
    const coffee = card(container, 'Coffee').querySelector('.drink-week')!;
    expect(coffee.getAttribute('aria-label')).toBe('Coffee, last 7 days: no data, no data, no data, 1, 5, 0, 2 cups');
    expect(coffee.querySelector('.drink-week-goal')).toBeNull();
    const heights = [...coffee.querySelectorAll('.drink-week-bar')].map((b) => b.getAttribute('style'));
    expect(heights).toEqual(['height: 25%;', 'height: 100%;', 'height: 0%;', 'height: 50%;']);
  });

  it("move the viewed day's bar at once when a drink is added", async () => {
    const { container } = await mount();
    api.getDrinks.mockClear();
    expect(card(container, 'Water').querySelector('.drink-week')!.getAttribute('aria-label')).toContain('no data');
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    const label = card(container, 'Water').querySelector('.drink-week')!.getAttribute('aria-label')!;
    expect(label.endsWith('4 ounces')).toBe(true);
  });
});

describe('coffee', () => {
  it('shows "1 cup" and "2 cups" in the figure and in the log, and counts coffee in the log row', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [drink('k1', 'coffee', TODAY, '07:00:00'), drink('k2', 'coffee', TODAY, '09:00:00')],
        water_goal_ml: 1893,
      },
    });
    const { container } = await mount();
    expect(total(container, 'Coffee')).toBe('2cups');
    expect(toggle(container)!.textContent).toContain("Today's log · 2 drinks");
    const rows = entries(container, 'Coffee');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.drink-entry-amount')!.textContent).toBe('1 cup');
  });

  it('+ 1 raises the cups, the log and the bar at once, without touching water or alcohol', async () => {
    const { container } = await mount();
    fireEvent.click(button(container, 'Add one cup of coffee'));
    expect(total(container, 'Coffee')).toBe('1cup');
    expect(toggle(container)!.textContent).toContain('1 drink');
    expect(card(container, 'Coffee').querySelector('.drink-week')!.getAttribute('aria-label')!.endsWith('1 cups')).toBe(
      true,
    );
    await flush();
    expect(api.logDrink.mock.calls[0][0]).toMatchObject({ kind: 'coffee', amount: 1 });
    expect(total(container, 'Alcohol')).toBe('0drinks');
    expect(total(container, 'Water')).toBe('0oz');
  });

  it('rolls back and shows the error under the Coffee tile when the log fails', async () => {
    api.logDrink.mockResolvedValue({ ok: false, kind: 'network' });
    const { container } = await mount();
    fireEvent.click(button(container, 'Add one cup of coffee'));
    await flush();
    expect(total(container, 'Coffee')).toBe('0cups');
    expect(card(container, 'Coffee').querySelector('.drink-error')).not.toBeNull();
    expect(card(container, 'Alcohol').querySelector('.drink-error')).toBeNull();
  });

  it('names the entry "1 cup" in the delete confirm', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('k1', 'coffee', TODAY, '07:00:00')], water_goal_ml: 1893 },
    });
    mountConfirmHost();
    const { container } = await mount();
    openLog(container);
    fireEvent.click(button(container, 'More actions for the 7:00 AM coffee entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!);
    await openedConfirm();
    expect(confirmText()!.message).toContain('7:00 AM · 1 cup.');
  });
});

describe('the log row', () => {
  it('is collapsed on load, counts the drinks, and opens the list on a press', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [
          drink('a', 'water', TODAY, '13:10:00'),
          drink('b', 'water', TODAY, '15:42:00'),
          drink('c', 'alcohol', TODAY, '21:05:00'),
        ],
        water_goal_ml: 1893,
      },
    });
    const { container } = await mount();
    const t = toggle(container)!;
    expect(t.textContent).toBe("Today's log · 3 drinks");
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('li.drink-entry')).toBeNull();
    fireEvent.click(t);
    expect(t.getAttribute('aria-expanded')).toBe('true');
    expect(t.getAttribute('aria-controls')).toBe(container.querySelector('ul.drink-list')!.id);
    expect([...container.querySelectorAll('li.drink-entry')].map((li) => li.getAttribute('data-entry-id'))).toEqual([
      'c',
      'b',
      'a',
    ]);
    fireEvent.click(t);
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('li.drink-entry')).toBeNull();
  });

  it('says "1 drink" for one entry and names the weekday on a past day', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('p1', 'water', YESTERDAY, '08:00:00')], water_goal_ml: 1893 },
    });
    const { container } = await mount(YESTERDAY, 'past');
    expect(toggle(container)!.textContent).toBe("Mon's log · 1 drink");
  });

  it('counts a pending add at once', async () => {
    let release!: (v: unknown) => void;
    api.logDrink.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = await mount();
    expect(toggle(container)).toBeNull();
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    expect(toggle(container)!.textContent).toBe("Today's log · 1 drink");
    release({ ok: false, kind: 'network' });
    await flush();
    expect(toggle(container)).toBeNull();
  });

  it('is closed again on the next load: the open state is not kept', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', TODAY, '13:10:00')], water_goal_ml: 1893 },
    });
    const first = await mount();
    openLog(first.container);
    first.unmount();
    const second = await mount();
    expect(toggle(second.container)!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('adding', () => {
  it('+ 4 oz raises the total at once and stamps the current time; five taps read 20 oz', async () => {
    const { container } = await mount();
    const add = button(container, 'Add 4 ounces of water');
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    // Before the API answers: five pending entries, already counted.
    expect(total(container, 'Water')).toBe('20oz');
    expect(toggle(container)!.textContent).toBe("Today's log · 5 drinks");
    expect(entries(container, 'Water')).toHaveLength(5);
    expect(entries(container, 'Water')[0].textContent).toContain('12:00 PM');
    expect(entries(container, 'Water')[0].textContent).toContain('Saving…');
    await flush();
    expect(total(container, 'Water')).toBe('20oz');
    expect(container.textContent).not.toContain('Saving…');
  });

  it('sends one call per tap, each with its own id, 118 ml and the instant of the tap', async () => {
    const { container } = await mount();
    const add = button(container, 'Add 4 ounces of water');
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    await flush();
    expect(api.logDrink).toHaveBeenCalledTimes(5);
    const sent = api.logDrink.mock.calls.map((c) => c[0]);
    expect(new Set(sent.map((s) => s.id)).size).toBe(5);
    for (const s of sent) {
      expect(s).toMatchObject({ kind: 'water', amount: 118, logged_at_utc: NOW.toISOString(), source: 'app' });
    }
    expect(api.logDrink.mock.calls[0][1]).toBe('tok');
  });

  it('+ 1 raises the alcohol count by 1', async () => {
    const { container } = await mount();
    fireEvent.click(button(container, 'Add one alcoholic drink'));
    expect(total(container, 'Alcohol')).toBe('1drink');
    await flush();
    expect(api.logDrink.mock.calls[0][0]).toMatchObject({ kind: 'alcohol', amount: 1 });
    expect(entries(container, 'Alcohol')).toHaveLength(1);
    expect(total(container, 'Water')).toBe('0oz');
  });

  it('a double-send of one id is counted once', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('same', 'water', TODAY, '09:00:00')], water_goal_ml: 1893 },
    });
    await mount();
    // The same row arrives again from a later read.
    await act(async () => {
      await loadDrinks(TODAY, 'tok');
    });
    expect(drinkDays.value[TODAY].entries).toHaveLength(1);
  });

  it('rolls back and says so when the log fails', async () => {
    api.logDrink.mockResolvedValue({ ok: false, kind: 'network' });
    const { container } = await mount();
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    expect(total(container, 'Water')).toBe('4oz');
    await flush();
    expect(total(container, 'Water')).toBe('0oz');
    expect(entries(container, 'Water')).toHaveLength(0);
    expect(card(container, 'Water').querySelector('[role="alert"]')!.textContent).toBe(
      "Couldn't save that drink. Try again.",
    );
    // The next tap clears the message.
    api.logDrink.mockResolvedValue({ ok: true, data: drink('x', 'water', TODAY, '12:00:00') });
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    expect(card(container, 'Water').querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps a pending entry through a read that began before it settled', async () => {
    let release!: (v: unknown) => void;
    api.logDrink.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = await mount();
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    await act(async () => {
      await loadDrinks(TODAY, 'tok');
    });
    expect(entries(container, 'Water')).toHaveLength(1);
    release({ ok: false, kind: 'network' });
    await flush();
    expect(entries(container, 'Water')).toHaveLength(0);
  });
});

describe('past and future days', () => {
  it('a past day has entries, totals and actions, and no add buttons', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('p1', 'water', YESTERDAY, '08:00:00')], water_goal_ml: 1893 },
    });
    const { container } = await mount(YESTERDAY, 'past');
    expect(api.getDrinks).toHaveBeenCalledWith({ from: YESTERDAY, to: YESTERDAY }, 'tok');
    expect(container.querySelector('.drink-add')).toBeNull();
    expect(total(container, 'Water')).toBe('4oz');
    expect(entries(container, 'Water')[0].querySelector('.drink-more')).not.toBeNull();
  });

  it("today's log row says Today's", async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', TODAY, '13:10:00')], water_goal_ml: 1893 },
    });
    const { container } = await mount();
    expect(toggle(container)!.textContent).toContain("Today's log");
  });
});

describe('editing a time', () => {
  const seed = () =>
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [drink('a', 'water', TODAY, '10:00:00'), drink('b', 'water', TODAY, '11:00:00')],
        water_goal_ml: 1893,
      },
    });

  it('moves the entry to its new place and changes nothing else', async () => {
    seed();
    api.updateDrinkTime.mockResolvedValue({ ok: true, data: drink('a', 'water', TODAY, '12:30:00') });
    const { container } = await mount();
    expect(entries(container, 'Water').map((e) => e.getAttribute('data-entry-id'))).toEqual(['b', 'a']);
    fireEvent.click(button(container, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    const input = container.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect(input.value).toBe('10:00');
    fireEvent.input(input, { target: { value: '12:30' } });
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    expect(api.updateDrinkTime).toHaveBeenCalledWith('a', '12:30:00', 'tok');
    expect(entries(container, 'Water').map((e) => e.getAttribute('data-entry-id'))).toEqual(['a', 'b']);
    expect(entries(container, 'Water')[0].textContent).toContain('12:30 PM');
    expect(entries(container, 'Water')[0].textContent).toContain('4 oz');
    expect(total(container, 'Water')).toBe('8oz');
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('saving the same time sends nothing', async () => {
    seed();
    const { container } = await mount();
    openLog(container);
    fireEvent.click(button(container, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    expect(api.updateDrinkTime).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('says so and keeps the field open when the save fails', async () => {
    seed();
    api.updateDrinkTime.mockResolvedValue({ ok: false, kind: 'network' });
    const { container } = await mount();
    openLog(container);
    fireEvent.click(button(container, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    fireEvent.input(container.querySelector('input[type="time"]')!, { target: { value: '09:00' } });
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    expect(card(container, 'Water').querySelector('[role="alert"]')!.textContent).toBe("Couldn't save that time.");
    expect(container.querySelector('input[type="time"]')).not.toBeNull();
    expect(entries(container, 'Water')[1].textContent).toContain('10:00 AM');
  });
});

describe('deleting', () => {
  const seed = () =>
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [drink('a', 'water', TODAY, '10:00:00'), drink('b', 'water', TODAY, '11:00:00')],
        water_goal_ml: 1893,
      },
    });
  const openDelete = (c: Element) => {
    openLog(c);
    fireEvent.click(button(c, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...c.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!);
  };

  it('asks first, then removes the entry and lowers the total', async () => {
    seed();
    api.deleteDrink.mockResolvedValue({ ok: true, data: drink('a', 'water', TODAY, '10:00:00') });
    mountConfirmHost();
    const { container } = await mount();
    openDelete(container);
    await openedConfirm();
    expect(confirmText()).toMatchObject({ title: 'Delete this drink?', confirm: 'Delete', cancel: 'Cancel' });
    expect(api.deleteDrink).not.toHaveBeenCalled();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete')!);
    await flush();
    expect(api.deleteDrink).toHaveBeenCalledWith('a', 'tok');
    expect(entries(container, 'Water')).toHaveLength(1);
    expect(total(container, 'Water')).toBe('4oz');
  });

  it('cancelling changes nothing', async () => {
    seed();
    mountConfirmHost();
    const { container } = await mount();
    openDelete(container);
    await openedConfirm();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Cancel')!);
    await flush();
    expect(api.deleteDrink).not.toHaveBeenCalled();
    expect(total(container, 'Water')).toBe('8oz');
  });

  it('keeps the entry and says so when the delete fails', async () => {
    seed();
    api.deleteDrink.mockResolvedValue({ ok: false, kind: 'network' });
    mountConfirmHost();
    const { container } = await mount();
    openDelete(container);
    await openedConfirm();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete')!);
    await flush();
    expect(total(container, 'Water')).toBe('8oz');
    expect(card(container, 'Water').querySelector('[role="alert"]')!.textContent).toBe("Couldn't delete that drink.");
  });
});

describe('loading and failure', () => {
  it('shows "—" in both tiles, the add buttons disabled and no log row while the first read runs', async () => {
    let release!: (v: unknown) => void;
    api.getDrinks.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = await mount();
    expect(card(container, 'Water').querySelector('.drink-total')!.textContent).toBe('—');
    expect(card(container, 'Alcohol').querySelector('.drink-total')!.textContent).toBe('—');
    expect(card(container, 'Coffee').querySelector('.drink-total')!.textContent).toBe('—');
    expect(button(container, 'Add one cup of coffee').disabled).toBe(true);
    expect(container.querySelector('.drinks-log, .drinks-log-empty')).toBeNull();
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(true);
    expect(button(container, 'Add one alcoholic drink').disabled).toBe(true);
    release({ ok: true, data: { drinks: [], water_goal_ml: 1893 } });
    await flush();
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(false);
  });

  it('shows one panel error, titled Drinks, with a retry across all tiles when the read fails', async () => {
    api.getDrinks.mockResolvedValueOnce({ ok: false, kind: 'network' });
    const { container } = await mount();
    expect(container.querySelectorAll('section.day-panel')).toHaveLength(1);
    expect(container.querySelector('h2')!.textContent).toBe('Drinks');
    expect(container.textContent).toContain("Couldn't load your drinks.");
    expect(container.querySelector('.drink-add')).toBeNull();
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
    fireEvent.click(retry);
    await flush();
    const dayReads = api.getDrinks.mock.calls.filter(([range]) => range.from === range.to);
    expect(dayReads).toHaveLength(2);
    expect(container.textContent).not.toContain("Couldn't load");
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(false);
  });
});

describe('the goal', () => {
  it('converts whole ounces to ml and refuses what the API would', () => {
    expect(ozToGoalMl('64')).toBe(1893);
    expect(ozToGoalMl('9')).toBe(266);
    expect(ozToGoalMl('8')).toBeNull();
    expect(ozToGoalMl('338')).toBe(9996);
    expect(ozToGoalMl('339')).toBeNull();
    expect(ozToGoalMl('6.5')).toBeNull();
    expect(ozToGoalMl('')).toBeNull();
    expect(ozToGoalMl('abc')).toBeNull();
  });

  it('saves through updateSetting and the Water card follows it without a reload', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2957', updated: 'u' } });
    const { container } = await mount();
    expect(card(container, 'Water').textContent).toContain('of 64');
    let ok = false;
    await act(async () => {
      ok = await saveWaterGoal(2957, 'tok');
    });
    expect(ok).toBe(true);
    expect(api.updateSetting).toHaveBeenCalledWith('water_goal_ml', 2957, 'tok');
    expect(waterGoalMl.value).toBe(2957);
    expect(card(container, 'Water').textContent).toContain('of 100');
  });

  it('keeps the old goal when the save fails', async () => {
    api.updateSetting.mockResolvedValue({ ok: false, kind: 'network' });
    expect(await saveWaterGoal(2957, 'tok')).toBe(false);
    expect(waterGoalMl.value).toBe(1893);
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    demo.on = true;
  });

  it('shows tiles populated from memory, makes no API call, and can add, edit and delete', async () => {
    mountConfirmHost();
    const { container } = await mount();
    expect(api.getDrinks).not.toHaveBeenCalled();
    expect(entries(container, 'Water').length).toBeGreaterThan(0);
    // The last 7 days come from the demo history, with no call either.
    expect(card(container, 'Water').querySelector('.drink-week')!.getAttribute('aria-label')).not.toContain('no data');
    const before = Number(total(container, 'Water')!.replace('oz', ''));

    fireEvent.click(button(container, 'Add 4 ounces of water'));
    await flush();
    expect(Number(total(container, 'Water')!.replace('oz', ''))).toBe(before + 4);
    expect(api.logDrink).not.toHaveBeenCalled();

    const first = entries(container, 'Water')[0];
    const label = first.querySelector('.drink-more')!.getAttribute('aria-label')!;
    fireEvent.click(button(container, label));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    fireEvent.input(container.querySelector('input[type="time"]')!, { target: { value: '03:15' } });
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    const last = (() => {
      const l = entries(container, 'Water');
      return l[l.length - 1];
    })();
    expect(last.textContent).toContain('3:15 AM');

    fireEvent.click(last.querySelector('.drink-more')!);
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!);
    await openedConfirm();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete')!);
    await flush();
    expect(Number(total(container, 'Water')!.replace('oz', ''))).toBe(before);
    expect(api.deleteDrink).not.toHaveBeenCalled();
  });

  it('adds through the state function without a token call', async () => {
    await addDrink('alcohol', 'tok');
    expect(drinkDays.value[TODAY].entries).toHaveLength(1);
    expect(api.logDrink).not.toHaveBeenCalled();
  });
});

// #553 - back in the foreground, the cards re-read what the widget may have logged.
describe('returning to the app', () => {
  const dayReads = (date: string) =>
    api.getDrinks.mock.calls.filter(([range]) => range.from === date && range.to === date);
  const historyReads = () => api.getDrinks.mock.calls.filter(([range]) => range.from !== range.to);
  const comeBack = async () => {
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
  };
  const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
  let visibility: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => visibility.mockRestore());

  it('shows a drink logged elsewhere, in the total, the list and the 7-day bars, with no loading state', async () => {
    const { container } = await mount();
    expect(total(container, 'Water')).toBe('0oz');
    const widget = drink('w1', 'water', TODAY, '11:00:00', 354);
    api.getDrinks.mockResolvedValue({ ok: true, data: { drinks: [widget], water_goal_ml: 1893 } });
    later(61_000);
    const seen: string[] = [];
    const watch = new MutationObserver(() => seen.push(total(container, 'Water')!));
    watch.observe(container, { childList: true, subtree: true, characterData: true });
    await comeBack();
    watch.disconnect();
    expect(total(container, 'Water')).toBe('12oz');
    expect(seen).not.toContain('—');
    expect(entries(container, 'Water')).toHaveLength(1);
    expect(card(container, 'Water').querySelector('.drink-week')!.getAttribute('aria-label')).toContain('12');
  });

  it('starts at most one day read and one history read in 60 s, and another after it', async () => {
    await mount();
    expect(dayReads(TODAY)).toHaveLength(1);
    expect(historyReads()).toHaveLength(1);
    later(30_000);
    await comeBack();
    await comeBack();
    expect(dayReads(TODAY)).toHaveLength(1);
    expect(historyReads()).toHaveLength(1);
    later(31_000);
    await comeBack();
    await comeBack();
    expect(dayReads(TODAY)).toHaveLength(2);
    expect(historyReads()).toHaveLength(2);
  });

  it('never starts a second read while one is running', async () => {
    await mount();
    let release!: (v: unknown) => void;
    api.getDrinks.mockReturnValue(new Promise((r) => (release = r)));
    later(61_000);
    await comeBack();
    later(61_000);
    await comeBack();
    expect(dayReads(TODAY)).toHaveLength(2);
    release({ ok: true, data: { drinks: [], water_goal_ml: 1893 } });
    await flush();
  });

  it('keeps a tap that is still saving, once, when the re-read lands', async () => {
    const { container } = await mount();
    let settle!: (v: unknown) => void;
    api.logDrink.mockReturnValue(new Promise((r) => (settle = r)));
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    expect(total(container, 'Water')).toBe('4oz');
    later(61_000);
    await comeBack(); // the server has not seen the tap yet
    expect(total(container, 'Water')).toBe('4oz');
    expect(entries(container, 'Water')).toHaveLength(1);
    const id = api.logDrink.mock.calls[0][0].id;
    settle({ ok: true, data: { ...drink(id, 'water', TODAY, '12:00:00', 118), logged_at_utc: NOW.toISOString() } });
    await flush();
    expect(total(container, 'Water')).toBe('4oz');
    expect(entries(container, 'Water')).toHaveLength(1);
  });

  it('leaves the shown entries alone, with no error panel, when the re-read fails', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', TODAY, '09:00:00', 236)], water_goal_ml: 1893 },
    });
    const { container } = await mount();
    api.getDrinks.mockResolvedValue({ ok: false, kind: 'network' });
    later(61_000);
    await comeBack();
    expect(total(container, 'Water')).toBe('8oz');
    expect(container.textContent).not.toContain("Couldn't load");
  });

  it('re-reads the date shown when it is a past day', async () => {
    await mount(YESTERDAY, 'past');
    later(61_000);
    await comeBack();
    expect(dayReads(YESTERDAY)).toHaveLength(2);
    expect(dayReads(TODAY)).toHaveLength(0);
  });

  it('stops listening when the cards go away', async () => {
    const { unmount } = await mount();
    unmount();
    later(61_000);
    await comeBack();
    expect(dayReads(TODAY)).toHaveLength(1);
  });

  it('makes no API call on return in demo mode', async () => {
    demo.on = true;
    await mount();
    later(61_000);
    await comeBack();
    expect(api.getDrinks).not.toHaveBeenCalled();
  });
});
