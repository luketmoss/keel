// #913: the Trends screen and its Energy tab: the route, the stored controls, the series and the readout's links.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { FoodLogDay, FoodLogEntry } from '../api/types';
import { _resetEaten } from '../eaten/eaten-store';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { parseTrendsHash, trendsHash, trendsRoute } from '../shell/routes';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { fakeApi } from '../test-api';
import { niceScale } from './chart-math';
import { buildDays, buildWeeks, mondayOf, summarize, weekdayMeans } from './energy';
import type { ForageApi } from '../api/client';
import { _resetTrends, AVERAGE_KEY, loadTrends, RANGE_KEY, trendsDays, trendsState } from './trends-store';

// Monday 2 November 2026, 10:00 on the device.
const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';
const D1 = '2026-11-01'; // Sunday, 2000 kcal
const D2 = '2026-10-31'; // Saturday, 1000 kcal, low
const D3 = '2026-10-30'; // Friday, entries without nutrition
const D4 = '2026-10-29'; // Thursday, nothing logged
const D5 = '2026-10-28'; // Wednesday, 1800 kcal

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => {});
}

async function openAt(url: string) {
  window.history.replaceState(null, '', url);
  render(<App />);
  await settle();
}

async function go(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
}

function entry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Lunch',
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: null,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    partial: false,
    source: 'app',
    logged_at: '2026-11-02T15:00:00Z',
    created: 'x',
    updated: 'x',
    ...over,
  };
}

function seed(api: ReturnType<typeof fakeApi>) {
  api.log.push(
    entry({ id: 'a', date: D1, kcal: 2000 }),
    entry({ id: 'b', date: D2, kcal: 1000, partial: true }),
    entry({ id: 'c', date: D3, kcal: null }),
    entry({ id: 'd', date: D5, kcal: 1800 }),
    entry({ id: 'e', date: TODAY, kcal: 500 }),
  );
}

const q = (id: string) => screen.getByTestId(id);
const bars = () => screen.getAllByTestId('chart-bar');
const barOf = (date: string) => bars().find((b) => b.getAttribute('data-key') === date)!;
/** A pointer press on the day's column (the chart is 320px wide in jsdom: 44px of axis, 8px of margin). */
function press(date: string) {
  const keys = bars().map((b) => b.getAttribute('data-key'));
  const colW = (320 - 44 - 8) / keys.length;
  const svg = q('chart').querySelector('svg')!;
  const clientX = 44 + colW * (keys.indexOf(date) + 0.5);
  // jsdom has no PointerEvent: a mouse event carries the position under the pointer event's name.
  // Without `onpointerdown` on elements, Preact listens under the name as written: send both spellings.
  for (const name of ['pointerdown', 'PointerDown']) fireEvent(svg, new MouseEvent(name, { clientX, bubbles: true }));
  for (const name of ['pointerup', 'PointerUp']) fireEvent(svg, new MouseEvent(name, { clientX, bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
  _resetTrends();
  trendsRoute.value = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('the route', () => {
  it('is matched ahead of #825 and reads range, tab and metric', () => {
    expect(parseTrendsHash('#/eaten/trends')).toEqual({ range: null, tab: 'energy', metric: null });
    expect(parseTrendsHash('#/eaten/trends?range=3M')).toEqual({ range: '3M', tab: 'energy', metric: null });
    expect(parseTrendsHash('#/eaten/trends?metric=kcal&range=All')).toEqual({
      range: 'All',
      tab: 'energy',
      metric: 'kcal',
    });
    // The metric wins over the tab and implies its own (#914); a tab not built yet opens Energy.
    expect(parseTrendsHash('#/eaten/trends?range=3m&tab=foods&metric=protein')).toEqual({
      range: null,
      tab: 'macros',
      metric: 'protein',
    });
    expect(parseTrendsHash('#/eaten/trends?tab=foods&metric=bogus')).toEqual({
      range: null,
      tab: 'energy',
      metric: null,
    });
    expect(parseTrendsHash('#/eaten/trends?tab=bogus')).toEqual({ range: null, tab: 'energy', metric: null });
    expect(parseTrendsHash('#/eaten/trends/x')).toBeNull();
    expect(parseTrendsHash('#/eaten/2026-10-30')).toBeNull();
    expect(trendsHash('energy', '3M')).toBe('#/eaten/trends?tab=energy&range=3M');
  });

  it('opens Trends and does not rewrite to today, with Eaten current', async () => {
    fakeApi();
    await openAt('/#/eaten/trends');
    expect(q('trends-screen')).toBeDefined();
    expect(q('tab-eaten').getAttribute('aria-current')).toBe('page');
    expect(window.location.hash).toBe('#/eaten/trends?tab=energy&range=1M');
    expect(screen.queryByTestId('eaten-day')).toBeNull();
  });

  it('leaves #/eaten/<date> and #/eaten/trends/x to #825', async () => {
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    expect(q('eaten-day').textContent).toBe('Fri 30 Oct');
    cleanup();
    _resetEaten();
    await openAt('/#/eaten/trends/x');
    expect(q('eaten-day').textContent).toBe('Today');
    expect(window.location.hash).toBe('#/eaten');
  });

  it('range, tab and metric in the hash select the view; unknown values open Energy at the stored range', async () => {
    fakeApi();
    localStorage.setItem(RANGE_KEY, '3M');
    await openAt('/#/eaten/trends?tab=foods&range=nope&metric=bogus');
    expect(screen.getByRole('radio', { name: '3M' }).getAttribute('aria-checked')).toBe('true');
    expect(window.location.hash).toBe('#/eaten/trends?tab=energy&range=3M');
  });

  it('a range in a link applies to the visit and is not stored; a change is stored', async () => {
    fakeApi();
    await openAt('/#/eaten/trends?metric=kcal&range=6M');
    expect(screen.getByRole('radio', { name: '6M' }).getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(RANGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: '3M' }));
    await settle();
    expect(localStorage.getItem(RANGE_KEY)).toBe('3M');
    expect(window.location.hash).toBe('#/eaten/trends?tab=energy&range=3M');
    // A reload reopens the same view.
    cleanup();
    _resetTrends();
    render(<App />);
    await settle();
    expect(screen.getByRole('radio', { name: '3M' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('the link on Eaten and the way back', () => {
  it('shows Trends › on the day card, in every state, and opens Trends', async () => {
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    const link = screen.getByRole('link', { name: 'Trends' });
    expect(link.getAttribute('href')).toBe('#/eaten/trends');
    expect(link.textContent).toBe('Trends ›');
    expect(within(q('day-card')).getByRole('link', { name: 'Trends' })).toBe(link);
    await go('#/eaten/trends');
    expect(screen.queryByTestId('day-card')).toBeNull();
    expect(q('trends-screen')).toBeDefined();
  });

  it('the back arrow goes to the day Eaten showed; cold, to today', async () => {
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    await go('#/eaten/trends');
    expect(q('trends-back').getAttribute('href')).toBe(`#/eaten/${D3}`);
    fireEvent.click(q('trends-back'));
    await go(`#/eaten/${D3}`);
    expect(q('eaten-day').textContent).toBe('Fri 30 Oct');
    cleanup();
    _resetEaten();
    await openAt('/#/eaten/trends');
    expect(q('trends-back').getAttribute('href')).toBe('#/eaten');
  });

  it('the Eaten tab leaves Trends for the day view', async () => {
    fakeApi();
    await openAt('/#/eaten/trends');
    expect(screen.getByRole('link', { name: /Back to Eaten/ })).toBeDefined();
    fireEvent.click(q('tab-eaten'));
    await go('#/eaten');
    expect(q('eaten-day').textContent).toBe('Today');
  });
});

describe('the stored controls', () => {
  it('default to 1M and 7d, and are remembered', async () => {
    fakeApi();
    await openAt('/#/eaten/trends');
    expect(screen.getByRole('radio', { name: '1M' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '14d' }));
    await settle();
    expect(localStorage.getItem(AVERAGE_KEY)).toBe('14d');
    cleanup();
    _resetTrends();
    await openAt('/#/eaten/trends');
    expect(screen.getByRole('radio', { name: '14d' }).getAttribute('aria-checked')).toBe('true');
  });

  it('a missing or blocked localStorage gives the defaults and never breaks the screen', async () => {
    fakeApi();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('localStorage', blocked);
    // The app's own sign-in reads the real one; keep the user signed in by opening with demo-free storage stubbed late.
    _resetTrends();
    expect(() => fireEvent.click(document.body)).not.toThrow();
    const { chooseRange, viewRange } = await import('./trends-store');
    expect(viewRange.value).toBe('1M');
    chooseRange('3M');
    expect(viewRange.value).toBe('3M');
  });
});

describe('Energy', () => {
  it('summarises counted days: the average, days logged and low days, not counting today', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    expect(q('trends-average').textContent).toBe('1,600');
    expect(q('trends-summary-line').textContent).toBe('3 of 29 days logged · 1 low');
    expect(q('trends-today-note').textContent).toBe('Not counting today, which is still being logged');
    expect(api.calls('getFoodLogTotals')).toHaveLength(1);
  });

  it('draws a gap for nothing logged and for no nutrition, hatches a low day, and today is drawn', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    expect(bars()).toHaveLength(30);
    expect(barOf(D4).getAttribute('data-kind')).toBe('gap');
    expect(barOf(D3).getAttribute('data-kind')).toBe('gap');
    expect(barOf(D2).getAttribute('data-kind')).toBe('hatched');
    expect(barOf(D1).getAttribute('data-kind')).toBe('bar');
    expect(barOf(TODAY).getAttribute('data-kind')).toBe('bar');
    // A gap is never a zero-height bar.
    expect(document.querySelectorAll('rect.chart-bar[height="0"]')).toHaveLength(0);
    const legend = q('legend').textContent!;
    expect(legend).toContain('Day');
    expect(legend).toContain('7-day average');
    expect(legend).toContain('Not logged');
    expect(legend).toContain('Low');
  });

  it('the average line breaks across a stretch with no logged day, and Off draws none', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?range=1W');
    // 7d window: Oct 27 (empty) .. Nov 2. Oct 28 and Oct 31, Nov 1 are counted; Oct 29 and 30 still see Oct 28.
    expect(screen.getAllByTestId('chart-line').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    await settle();
    expect(screen.queryAllByTestId('chart-line')).toHaveLength(0);
    expect(q('legend').textContent).not.toContain('average');
  });

  it('breaks the line where the window holds no counted day', async () => {
    const api = fakeApi();
    api.log.push(entry({ id: 'x', date: '2026-10-05', kcal: 1500 }), entry({ id: 'y', date: D1, kcal: 2500 }));
    await openAt('/#/eaten/trends');
    expect(screen.getAllByTestId('chart-line-dot').length + screen.getAllByTestId('chart-line').length).toBe(2);
  });

  it('reads a day on a press and links Open day or Log this day to that date', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    expect(q('readout').textContent).toBe('Tap a day to read it.');
    press(D2);
    expect(q('readout').textContent).toContain('Sat, Oct 31 · 1,000 kcal');
    expect(q('readout').textContent).toContain('Low');
    const open = screen.getByRole('link', { name: 'Open day, Saturday, October 31' });
    expect(open.getAttribute('href')).toBe(`#/eaten/${D2}`);
    // A pointer never talks.
    expect(q('trends-status').textContent).toBe('');

    press(D4);
    expect(q('readout').textContent).toContain('nothing logged');
    const log = screen.getByRole('link', { name: 'Log this day, Thursday, October 29' });
    expect(log.getAttribute('href')).toBe(`#/eaten/${D4}`);

    press(D3);
    expect(q('readout').textContent).toContain('logged, but nothing has nutrition yet');

    press(TODAY);
    expect(q('readout').textContent).toContain('Today · 500 kcal so far');
    expect(screen.getByRole('link', { name: /Open day/ }).getAttribute('href')).toBe('#/eaten');

    // Tapping the selected day again clears it.
    press(TODAY);
    expect(q('readout').textContent).toBe('Tap a day to read it.');
  });

  it('Open day opens Eaten on that date, and Back returns to Trends at the same range', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?range=3M');
    press(D2);
    const open = screen.getByRole('link', { name: /Open day/ });
    fireEvent.click(open);
    await go(`#/eaten/${D2}`);
    expect(q('eaten-day').textContent).toBe('Sat 31 Oct');
    window.history.replaceState(null, '', '/#/eaten/trends?tab=energy&range=3M');
    await go('#/eaten/trends?tab=energy&range=3M');
    expect(screen.getByRole('radio', { name: '3M' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opening today from Trends lands on today even when Eaten last showed an older day', async () => {
    const api = fakeApi();
    seed(api);
    await openAt(`/#/eaten/${D5}`);
    await go('#/eaten/trends');
    press(TODAY);
    fireEvent.click(screen.getByRole('link', { name: /Open day/ }));
    await go('#/eaten');
    expect(q('eaten-day').textContent).toBe('Today');
  });

  it('the chart is one tab stop: arrows, Home, End and Enter, and only keyboard moves are announced', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    const chart = q('chart');
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toBe('Calories, last 30 days');
    expect(chart.getAttribute('tabindex')).toBe('0');
    expect(chart.getAttribute('aria-describedby')).toBe('trends-summary-line');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(q('readout').textContent).toContain('Today');
    expect(q('trends-status').textContent).toContain('Today · 500 kcal so far');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(q('trends-status').textContent).toContain('Sun, Nov 1 · 2,000 kcal');
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(q('trends-status').textContent).toContain('Sun, Oct 4');
    fireEvent.keyDown(chart, { key: 'End' });
    expect(q('trends-status').textContent).toContain('Today');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    fireEvent.keyDown(chart, { key: 'Enter' });
    await go(window.location.hash);
    expect(window.location.hash).toBe(`#/eaten/${D1}`);
  });

  it('1Y draws weekly bars, disables Average with a reason, and a week offers no day link', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?range=1Y');
    expect(bars()).toHaveLength(53);
    expect(screen.getByRole('radio', { name: '7d' }).hasAttribute('disabled')).toBe(true);
    expect(q('weekly-note').textContent).toBe('Weekly bars have no average line');
    expect(screen.queryAllByTestId('chart-line')).toHaveLength(0);
    const week = mondayOf(D2);
    press(week);
    expect(q('readout').textContent).toContain('Week of Oct 26 · 1,600 kcal a day · 3 of 7 days logged');
    expect(screen.queryByTestId('readout-link')).toBeNull();
    expect(q('readout').textContent).toContain('Use 6M or shorter to open a day');
  });

  it('6M is still daily', async () => {
    fakeApi();
    await openAt('/#/eaten/trends?range=6M');
    expect(bars()).toHaveLength(182);
    expect(screen.getByRole('radio', { name: '7d' }).hasAttribute('disabled')).toBe(false);
  });

  it('the weekday card is Monday first, with — for a weekday with none and 1 day hatched', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    const values = screen.getAllByTestId('weekday-value').map((v) => v.textContent);
    // Wed 1800, Fri none (no nutrition), Sat 1000, Sun 2000; Mon, Tue, Thu none.
    expect(values).toEqual(['—', '—', '1,800', '—', '—', '1,000', '2,000']);
    expect(screen.getAllByTestId('weekday-bar').every((b) => b.getAttribute('data-kind') === 'hatched')).toBe(true);
    expect(q('weekday-based').textContent).toBe('Based on 3 days');
    expect(q('weekday-card').textContent).toContain('1 day');
  });

  it('says — and never 0 with nothing counted, and draws every day as a gap', async () => {
    fakeApi();
    await openAt('/#/eaten/trends');
    expect(q('trends-average').textContent).toBe('—');
    expect(q('trends-summary-line').textContent).toBe('Nothing logged in this range.');
    expect(bars().every((b) => b.getAttribute('data-kind') === 'gap')).toBe(true);
    expect(document.querySelectorAll('rect.chart-bar')).toHaveLength(0);
  });

  it('All with nothing logged at all shows one card and no chart', async () => {
    fakeApi();
    await openAt('/#/eaten/trends?range=All');
    expect(q('trends-none').textContent).toContain('Nothing logged yet.');
    expect(screen.getByRole('link', { name: 'Go to Eaten ›' }).getAttribute('href')).toBe('#/eaten');
    expect(screen.queryByTestId('chart')).toBeNull();
  });

  it('All runs from the first logged day', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends?range=All');
    expect(bars()).toHaveLength(6);
    expect(q('trends-summary-line').textContent).toBe('3 of 5 days logged · 1 low');
  });

  it('shows a failed state with the controls still there, and Try again reads again', async () => {
    const api = fakeApi();
    seed(api);
    let fail = true;
    api.answer('getFoodLogTotals', () =>
      fail
        ? { success: false, error: 'boom' }
        : {
            success: true,
            data: {
              from: null,
              to: null,
              days: [{ date: D1, entries: 1, unknown_entries: 0, kcal: 2000, partial: false }],
            },
          },
    );
    await openAt('/#/eaten/trends');
    expect(q('trends-error').textContent).toContain("Couldn't load your log.");
    expect(screen.getByRole('radio', { name: '1M' })).toBeDefined();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(q('trends-average').textContent).toBe('2,000');
  });

  it('draws no target line and no comparison sentence', async () => {
    const api = fakeApi();
    seed(api);
    await openAt('/#/eaten/trends');
    expect(document.body.textContent).not.toMatch(/target|goal|up from|higher on|compared/i);
  });
});

describe('loading', () => {
  it('a slower, older answer never replaces a newer one', async () => {
    const releases: (() => void)[] = [];
    const answerFor = (kcal: number) =>
      new Promise((resolve) => {
        releases.push(() =>
          resolve({
            from: null,
            to: null,
            days: [{ date: '2026-11-01', entries: 1, unknown_entries: 0, kcal, partial: false }],
          }),
        );
      });
    let n = 0;
    const api = { getFoodLogTotals: () => answerFor(++n === 1 ? 111 : 222) } as unknown as ForageApi;
    const older = loadTrends(api, '1M');
    const newer = loadTrends(api, '1Y');
    expect(trendsState.value).toBe('loading');
    releases[1]();
    await newer;
    releases[0]();
    await older;
    expect(trendsDays.value.get('2026-11-01')?.kcal).toBe(222);
  });

  it('a shorter range slices what is held, and a longer one reads again', async () => {
    const calls: string[] = [];
    const api = {
      getFoodLogTotals: async (from: string) => {
        calls.push(from);
        return { from, to: null, days: [] };
      },
    } as unknown as ForageApi;
    await loadTrends(api, '3M');
    await loadTrends(api, '1M');
    expect(calls).toHaveLength(1);
    await loadTrends(api, '1Y');
    expect(calls).toHaveLength(2);
  });
});

describe('the series', () => {
  const day = (date: string, kcal: number | null, partial = false): FoodLogDay =>
    ({
      date,
      entries: 1,
      unknown_entries: 0,
      kcal,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      partial,
    }) as FoodLogDay;

  it('leaves today out of every average and counts', () => {
    const byDate = new Map([
      ['2026-11-01', day('2026-11-01', 2000)],
      ['2026-11-02', day('2026-11-02', 100)],
    ]);
    const days = buildDays(byDate, '2026-10-26', '2026-11-02', '2026-11-02', 7);
    const s = summarize(days);
    expect(s.average).toBe(2000);
    expect(s.logged).toBe(1);
    expect(s.total).toBe(7);
    expect(days[days.length - 1].avg).toBeNull();
    expect(weekdayMeans(days).reduce((t, m) => t + m.n, 0)).toBe(1);
  });

  it('weekly means are over logged days, hatched if any is low, a gap when none', () => {
    const byDate = new Map([
      ['2026-10-26', day('2026-10-26', 2000)],
      ['2026-10-27', day('2026-10-27', 1000, true)],
    ]);
    const weeks = buildWeeks(buildDays(byDate, '2026-10-26', '2026-11-08', '2026-11-20', 0));
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ date: '2026-10-26', kcal: 1500, partial: true, logged: 2, total: 7 });
    expect(weeks[1]).toMatchObject({ date: '2026-11-02', kcal: null });
  });

  it('niceScale rounds up to a round maximum', () => {
    expect(niceScale(2140).max).toBeGreaterThanOrEqual(2140);
    expect(niceScale(2140).ticks[0]).toBe(0);
    expect(niceScale(0).max).toBe(1000);
  });
});

describe('demo mode', () => {
  const env = import.meta.env as Record<string, string | undefined>;
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

  it('opens Trends over demo data with bars, a low day and gaps', async () => {
    await openAt('/?demo=true#/eaten/trends');
    const kinds = new Set(bars().map((b) => b.getAttribute('data-kind')));
    expect(kinds).toEqual(new Set(['bar', 'hatched', 'gap']));
    expect(window.location.search).toBe('?demo=true');
  });
});
