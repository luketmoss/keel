// #242 AC1, AC5 — the Trends screen: controls, remembering them, and the
// loading, empty and failed states.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/preact';
import { h } from 'preact';
import { effect } from '@preact/signals';

const loadHealth = vi.fn(async (_t: string) => {});
vi.mock('../../state/actions', () => ({ loadHealth: (t: string) => loadHealth(t) }));

import { TrendsScreen, captionText, selectedDay, announcement } from './trends-screen';
import { RouteFocus } from '../../router/route-focus';
import { currentRoute, navigate, goBack } from '../../router/router';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary } from '../../state/store';
import { addDays } from '../../day/dates';
import { todayInDenver } from '../../day/dates';
import { chip, menuItems, pickRange, pickAverage, pickView, viewButton } from './toolbar-test-utils';

const TODAY = todayInDenver();

function rows(n: number, skip: number[] = []) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ date: addDays(TODAY, -i), resting_hr: skip.includes(i) ? '' : String(50 + (i % 5)), sheetRow: i + 2 });
  }
  return out as never[];
}

function renderScreen(token: string | null = 'tok') {
  return render(
    h(AuthContext.Provider, {
      value: { token, user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

const loaded = (r: never[]) => {
  dailyHealth.value = { state: 'loaded', rows: r };
  bodyMeasurements.value = { state: 'loaded', rows: [] };
  dailySummary.value = { state: 'loaded', rows: [] };
};

beforeEach(() => {
  localStorage.clear();
  loadHealth.mockClear();
  dailyHealth.value = { state: 'idle' };
  bodyMeasurements.value = { state: 'idle' };
  dailySummary.value = { state: 'idle' };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pressed = (g: Element) =>
  [...g.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'));
const viewGroup = (c: Element) => c.querySelector('.trends-view-switch')!;

describe('AC1: controls', () => {
  it('puts a range chip, an average chip and a View switch on the heading row, right of the heading', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')!.textContent).toBe('Trends');
    // The three labelled rows are gone.
    expect(container.querySelector('.trends-controls')).toBeNull();
    expect(container.querySelector('.trends-control-label')).toBeNull();
    const header = container.querySelector('header')!;
    const toolbar = header.querySelector('.trends-toolbar')!;
    expect(
      header.querySelector('h1')!.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect([...toolbar.children].map((el) => el.className)).toEqual([
      'trends-menu-wrap',
      'trends-menu-wrap',
      'trends-view-switch',
    ]);
    expect(chip(container, 'Range').textContent).toBe('3M');
    expect(chip(container, 'Average').textContent).toBe('7d');
  });

  it('names the chips for their state, and the View buttons in a group named View', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    expect(chip(container, 'Range').getAttribute('aria-label')).toBe('Range: 3M');
    expect(chip(container, 'Average').getAttribute('aria-label')).toBe('Average: 7-day');
    for (const w of ['Range', 'Average'] as const) {
      expect(chip(container, w).getAttribute('aria-haspopup')).toBe('menu');
      expect(chip(container, w).getAttribute('aria-expanded')).toBe('false');
    }
    const view = viewGroup(container);
    expect(view.getAttribute('role')).toBe('group');
    expect(view.getAttribute('aria-label')).toBe('View');
    expect([...view.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Chart', 'Table']);
    expect(pressed(view)).toEqual(['Chart']);
    pickAverage(container, 'Off');
    expect(chip(container, 'Average').getAttribute('aria-label')).toBe('Average: off');
    expect(chip(container, 'Average').textContent).toBe('Off');
  });

  it('lists the six ranges and four averages, marks the current one, and follows aria-expanded', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    fireEvent.click(chip(container, 'Range'));
    expect(chip(container, 'Range').getAttribute('aria-expanded')).toBe('true');
    const items = menuItems(container);
    expect(items.map((b) => b.querySelector('.trends-menu-label')!.textContent)).toEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 3 months',
      'Last 6 months',
      'Last year',
      'All time',
    ]);
    expect(items.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(items.map((b) => b.textContent!.includes('✓'))).toEqual([false, false, true, false, false, false]);
    fireEvent.click(chip(container, 'Average'));
    // Opening one closes the other.
    expect(chip(container, 'Range').getAttribute('aria-expanded')).toBe('false');
    expect(chip(container, 'Average').getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(menuItems(container).map((b) => b.querySelector('.trends-menu-label')!.textContent)).toEqual([
      'No average',
      '7-day average',
      '14-day average',
      '30-day average',
    ]);
    expect(menuItems(container).map((b) => b.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
  });

  it('redraws from loaded rows without a read, stores the choice, and restores it', () => {
    loaded(rows(100));
    const first = renderScreen();
    expect(loadHealth).not.toHaveBeenCalled();
    pickRange(first.container, '1W');
    pickAverage(first.container, 'Off');
    // A choice closes the menu and puts focus back on the chip.
    expect(first.container.querySelector('[role="menu"]')).toBeNull();
    expect(chip(first.container, 'Average').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(chip(first.container, 'Average'));
    expect(chip(first.container, 'Range').textContent).toBe('1W');
    expect(chip(first.container, 'Average').textContent).toBe('Off');
    expect(first.container.querySelector('svg[role="img"]')!.getAttribute('aria-label')).toBe(
      'Resting HR, last 7 days',
    );
    expect(first.container.querySelectorAll('circle.trend-dot')).toHaveLength(7);
    expect(first.container.querySelector('path.trend-line')).toBeNull();
    expect(localStorage.getItem('thrive-trends-range')).toBe('1W');
    expect(localStorage.getItem('thrive-trends-average')).toBe('Off');
    expect(loadHealth).not.toHaveBeenCalled();
    cleanup();
    const again = renderScreen();
    expect(chip(again.container, 'Range').textContent).toBe('1W');
    expect(chip(again.container, 'Average').textContent).toBe('Off');
  });

  it('applies a choice for this visit when storage fails, and reads defaults when it cannot read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    loaded(rows(100));
    const { container } = renderScreen();
    expect(chip(container, 'Range').textContent).toBe('3M');
    pickView(container, 'Table');
    expect(viewButton(container, 'Table').getAttribute('aria-pressed')).toBe('true');
    expect(viewButton(container, 'Chart').getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('table')).not.toBeNull();
  });
});

describe('#503: menus open, move and close', () => {
  const open = (c: Element, w: 'Range' | 'Average') => fireEvent.click(chip(c, w));

  it('opens with focus on the current item, and Arrow keys wrap while Home and End jump', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    open(container, 'Range');
    const items = menuItems(container);
    expect(document.activeElement).toBe(items[2]);
    const menu = container.querySelector('[role="menu"]')!;
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[3]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[5]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[5]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('ArrowDown on a closed chip opens it', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    fireEvent.keyDown(chip(container, 'Average'), { key: 'ArrowDown' });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('Escape closes and returns focus to the chip, choosing nothing', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    open(container, 'Range');
    fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'Escape' });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(chip(container, 'Range'));
    expect(chip(container, 'Range').textContent).toBe('3M');
  });

  it('Tab closes it', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    open(container, 'Average');
    fireEvent.keyDown(container.querySelector('[role="menu"]')!, { key: 'Tab' });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('a press outside closes it, a press on a group tab too, and a press on its own chip does not', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    open(container, 'Range');
    fireEvent.pointerDown(chip(container, 'Range'));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    fireEvent.pointerDown(container.querySelector('.trend-card')!);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    open(container, 'Average');
    fireEvent.pointerDown(container.querySelector('.trends-group-btn')!);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    open(container, 'Average');
    pickView(container, 'Table');
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('items are real buttons, so Enter and Space press them', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    open(container, 'Range');
    for (const b of menuItems(container)) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
    }
  });

  it('opens while the data is loading and a choice is remembered for when it lands', () => {
    dailyHealth.value = { state: 'loading' };
    bodyMeasurements.value = { state: 'loading' };
    dailySummary.value = { state: 'loading' };
    const { container } = renderScreen();
    pickRange(container, '6M');
    expect(chip(container, 'Range').textContent).toBe('6M');
    expect(localStorage.getItem('thrive-trends-range')).toBe('6M');
  });
});

describe('AC2: caption', () => {
  it('follows the average and the band', () => {
    expect(captionText(7, true)).toBe(
      'Dots are each day · line is the 7-day average · shaded band is your range, the mean ± 1 SD of the 30 days before today. Blank days stay blank.',
    );
    expect(captionText(0, true)).not.toMatch(/line/);
    expect(captionText(14, false)).toBe('Dots are each day · line is the 14-day average. Blank days stay blank.');
  });

  it('is shown under the controls in chart and table view', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    expect(container.querySelector('.trends-caption')!.textContent).toContain('7-day average');
    pickView(container, 'Table');
    expect(container.querySelector('.trends-caption')).not.toBeNull();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(91);
  });
});

describe('AC5: loading, empty and failed', () => {
  it('calls loadHealth once when idle', () => {
    renderScreen();
    expect(loadHealth).toHaveBeenCalledTimes(1);
    expect(loadHealth).toHaveBeenCalledWith('tok');
  });

  it('does not call it when loading or loaded', () => {
    dailyHealth.value = { state: 'loading' };
    bodyMeasurements.value = { state: 'loading' };
    dailySummary.value = { state: 'loading' };
    const { container } = renderScreen();
    expect(loadHealth).not.toHaveBeenCalled();
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('Loading…');
    cleanup();
    loaded(rows(10));
    renderScreen();
    expect(loadHealth).not.toHaveBeenCalled();
  });

  it('shows the error with a Try again that reloads', () => {
    dailyHealth.value = { state: 'error' };
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    dailySummary.value = { state: 'loaded', rows: [] };
    const { container, getByText } = renderScreen();
    expect(container.textContent).toContain("Couldn't load your health data.");
    fireEvent.click(getByText('Try again'));
    expect(loadHealth).toHaveBeenCalledWith('tok');
  });

  it('says "Nothing recorded yet." with no resting HR ever, and draws no chart', () => {
    loaded([]);
    const { container } = renderScreen();
    expect(container.textContent).toContain('Nothing recorded yet.');
    expect(container.querySelector('svg[role="img"]')).toBeNull();
  });

  it('says "No resting HR in this range." when none fall in it', () => {
    loaded([{ date: addDays(TODAY, -200), resting_hr: '50', sheetRow: 2 }] as never[]);
    const { container } = renderScreen();
    expect(container.textContent).toContain('No resting HR in this range.');
    expect(container.querySelector('svg[role="img"]')).toBeNull();
  });
});

// ── #243 ─────────────────────────────────────────────────────────────
import { groupHasBand } from './trends-screen';
import { metricSeries } from './series';
import type { TrendMetric } from './metrics';

describe('#243 AC5: mixed band flags', () => {
  const pts = Array.from({ length: 60 }, (_, i) => ({ date: addDays(TODAY, -i), value: 50 + (i % 5) }));
  const m = (id: string, band: boolean): TrendMetric => ({
    id,
    label: id,
    unit: '',
    points: () => pts,
    format: String,
    band,
  });
  const built = (metrics: TrendMetric[], sets: (typeof pts)[]) =>
    metrics.map((x, i) => metricSeries(x, addDays(TODAY, -29), TODAY, 7, TODAY, sets[i]));

  it('keeps the clause when one metric has a band', () => {
    expect(groupHasBand([m('a', false), m('b', true)], built([m('a', false), m('b', true)], [pts, pts]))).toBe(true);
  });
  it('drops it when none do, by flag or by lack of data', () => {
    expect(groupHasBand([m('a', false), m('b', false)], built([m('a', false), m('b', false)], [pts, pts]))).toBe(false);
    expect(groupHasBand([m('a', true)], built([m('a', true)], [[]]))).toBe(false);
    expect(groupHasBand([m('a', true)], built([m('a', true)], [pts.slice(0, 3)]))).toBe(false);
  });
});

describe('#243 AC4: switcher in the screen', () => {
  const click = (c: Element, text: string) =>
    fireEvent.click(
      [...c.querySelectorAll<HTMLButtonElement>('.trends-group-btn')].find((b) => b.textContent === text)!,
    );

  it('shows the groups as tabs under the heading, defaulting to Recovery', () => {
    loaded(rows(100));
    const { container } = renderScreen();
    const region = container.querySelector('[role="region"][aria-label="Metric group"]')!;
    expect(
      container.querySelector('header')!.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect([...region.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Recovery',
      'Sleep',
      'Fitness',
      'Body',
      'Blood Pressure',
      'Activity',
      'Intake',
      'Custom',
    ]);
    expect(container.querySelectorAll('.trend-card')).toHaveLength(3);
  });

  it('swaps the cards, stores the group, keeps other controls, and restores on reopen', () => {
    loaded(rows(100));
    const first = renderScreen();
    pickRange(first.container, '1W');
    click(first.container, 'Sleep');
    expect(first.container.querySelectorAll('.trend-card')).toHaveLength(4);
    expect(first.container.textContent).toContain('Nothing recorded yet.');
    expect(chip(first.container, 'Range').textContent).toBe('1W');
    expect(localStorage.getItem('thrive-trends-group')).toBe('sleep');
    cleanup();
    const again = renderScreen();
    expect(again.container.querySelector('.trends-group-btn.active')!.textContent).toBe('Sleep');
  });

  it('falls back to Recovery for an unknown stored group', () => {
    localStorage.setItem('thrive-trends-group', 'gone');
    loaded(rows(100));
    const { container } = renderScreen();
    expect(container.querySelector('.trends-group-btn.active')!.textContent).toBe('Recovery');
  });
});

describe('#244: per-group loading and error state', () => {
  const pickGroup = (c: Element, name: string) =>
    fireEvent.click(
      [...c.querySelectorAll<HTMLButtonElement>('.trends-group-btn')].find((b) => b.textContent === name)!,
    );

  it('Body is not held up by DailyHealth still loading', () => {
    dailyHealth.value = { state: 'loading' };
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    const { container } = renderScreen();
    pickGroup(container, 'Body');
    expect(container.querySelector('.trends-loading')).toBeNull();
    expect(container.textContent).toContain('Nothing recorded yet.');
  });
  it('Body shows loading while BodyMeasurements loads, even if DailyHealth has', () => {
    dailyHealth.value = { state: 'loaded', rows: rows(5) };
    bodyMeasurements.value = { state: 'loading' };
    const { container } = renderScreen();
    pickGroup(container, 'Body');
    expect(container.querySelector('.trends-loading')).not.toBeNull();
  });
  it('a BodyMeasurements error shows on Blood Pressure but not on Recovery', () => {
    dailyHealth.value = { state: 'loaded', rows: rows(5) };
    bodyMeasurements.value = { state: 'error', message: 'x' } as never;
    const { container } = renderScreen();
    expect(container.querySelector('.trends-error')).toBeNull();
    pickGroup(container, 'Blood Pressure');
    expect(container.querySelector('.trends-error')).not.toBeNull();
  });
  it('a DailyHealth error does not mask a loaded Body group', () => {
    dailyHealth.value = { state: 'error', message: 'x' } as never;
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    const { container } = renderScreen();
    pickGroup(container, 'Body');
    expect(container.querySelector('.trends-error')).toBeNull();
  });
});

describe('#245: Activity group state', () => {
  const pickGroup = (c: Element, name: string) =>
    fireEvent.click(
      [...c.querySelectorAll<HTMLButtonElement>('.trends-group-btn')].find((b) => b.textContent === name)!,
    );

  it('waits on DailySummary and DailyHealth (Steps, #504), and is not held up by Body', () => {
    dailyHealth.value = { state: 'loaded', rows: [] };
    bodyMeasurements.value = { state: 'loading' };
    dailySummary.value = { state: 'loaded', rows: [] };
    const { container } = renderScreen();
    pickGroup(container, 'Activity');
    expect(container.querySelector('.trends-loading')).toBeNull();
    expect(container.textContent).toContain('Nothing recorded yet.');
  });
  it('is held up by DailyHealth, which Steps reads', () => {
    dailyHealth.value = { state: 'loading' };
    dailySummary.value = { state: 'loaded', rows: [] };
    const { container } = renderScreen();
    pickGroup(container, 'Activity');
    expect(container.querySelector('.trends-loading')).not.toBeNull();
  });
  it('shows loading while DailySummary loads, and Recovery is unaffected by it', () => {
    dailyHealth.value = { state: 'loaded', rows: rows(5) };
    dailySummary.value = { state: 'loading' };
    const { container } = renderScreen();
    expect(container.querySelector('.trends-loading')).toBeNull();
    pickGroup(container, 'Activity');
    expect(container.querySelector('.trends-loading')).not.toBeNull();
  });
  it('a DailySummary error shows on Activity only', () => {
    dailyHealth.value = { state: 'loaded', rows: rows(5) };
    dailySummary.value = { state: 'error', message: 'x' } as never;
    const { container } = renderScreen();
    expect(container.querySelector('.trends-error')).toBeNull();
    pickGroup(container, 'Activity');
    expect(container.querySelector('.trends-error')).not.toBeNull();
  });
});

// #256 AC5: Back restores focus to the charts, and a script restore is not a
// Tab arrival: no day is selected and nothing is announced.

describe('#256 AC5: Back restores the charts without selecting a day', () => {
  const settle = () => new Promise((r) => setTimeout(r, 120));
  async function go(move: () => void, name: string) {
    move();
    await waitFor(() => expect(currentRoute.value.name).toBe(name));
    await settle();
  }
  // Trends on #/trends, a stand-in Day elsewhere: the app's Router in small.
  function Screen() {
    return currentRoute.value.name === 'trends' ? h(TrendsScreen, {}) : h('h1', {}, 'Day');
  }
  function renderInMain() {
    return render(
      h(
        'main',
        { class: 'app-content', tabIndex: -1 },
        h(AuthContext.Provider, {
          value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
          children: h(Screen, {}),
        }),
        h(RouteFocus, {}),
      ),
    );
  }

  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    localStorage.setItem('thrive-trends-range', '1W');
    loaded(rows(30));
    selectedDay.value = null;
    announcement.value = '';
  });

  async function openDayFromCharts(container: Element) {
    await settle(); // RouteFocus subscribes after paint
    if (currentRoute.value.name !== 'trends') await go(() => navigate('/trends'), 'trends');
    container.querySelector<HTMLElement>('.trend-charts')!.focus(); // a Tab arrival: selects today
    expect(selectedDay.value).toBe(TODAY);
    await go(() => navigate(`/day/${addDays(TODAY, -1)}`), 'day');
    selectedDay.value = null;
    announcement.value = '';
  }

  it('focuses div.trend-charts, selects nothing and announces nothing; arrows then select', async () => {
    const { container } = renderInMain();
    await openDayFromCharts(container);
    expect(document.activeElement!.textContent).toBe('Day');
    // Every value either signal takes on the way back, not just the last:
    // the screen's mount effect clears the selection, which would hide one.
    const seen: unknown[] = [];
    const stop = effect(() => {
      seen.push(selectedDay.value, announcement.value);
    });
    await go(() => goBack(), 'trends');
    stop();
    const charts = container.querySelector<HTMLElement>('.trend-charts')!;
    expect(document.activeElement).toBe(charts);
    expect(seen.every((v) => v === null || v === '')).toBe(true);
    expect(selectedDay.value).toBeNull();
    expect(announcement.value).toBe('');
    fireEvent.keyDown(charts, { key: 'ArrowLeft' });
    expect(selectedDay.value).not.toBeNull();
  });

  it('focuses the heading when the charts are not rendered (Table view)', async () => {
    const { container } = renderInMain();
    await openDayFromCharts(container);
    localStorage.setItem('thrive-trends-view', 'Table'); // Trends comes back in Table view
    await go(() => goBack(), 'trends');
    expect(document.activeElement!.tagName).toBe('H1');
    expect(document.activeElement!.textContent).toBe('Trends');
  });
});

// #290 — Try again keeps focus in a stable container and hands it to the h1.
describe('#290: Try again focus', () => {
  const state = (c: Element) => c.querySelector('.trends-state') as HTMLElement | null;
  const asError = () => {
    dailyHealth.value = { state: 'error' } as never;
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    dailySummary.value = { state: 'loaded', rows: [] };
  };
  const flush = () =>
    act(async () => {
      await Promise.resolve();
    });

  it('the press focuses the container; error, loading, error keeps node and focus', async () => {
    asError();
    const { container } = renderScreen();
    const holder = state(container)!;
    expect(holder.getAttribute('tabindex')).toBe('-1');
    expect(holder.querySelector('[role="alert"]')).not.toBeNull();
    const btn = container.querySelector('.trends-retry') as HTMLElement;
    btn.focus();
    fireEvent.click(btn);
    expect(document.activeElement).toBe(holder);
    act(() => {
      dailyHealth.value = { state: 'loading' };
    });
    expect(state(container)).toBe(holder);
    expect(holder.querySelector('[role="status"]')!.textContent).toBe('Loading…');
    expect(document.activeElement).toBe(holder);
    act(() => {
      dailyHealth.value = { state: 'error' } as never;
    });
    await flush();
    expect(state(container)).toBe(holder);
    expect(document.activeElement).toBe(holder);
    expect(holder.querySelector('[role="alert"]')).not.toBeNull();
    fireEvent.click(container.querySelector('.trends-retry')!);
    expect(loadHealth).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(holder);
  });

  it('loaded: focus goes to the h1 with no ring marker, not the charts', async () => {
    asError();
    const { container } = renderScreen();
    fireEvent.click(container.querySelector('.trends-retry')!);
    act(() => {
      dailyHealth.value = { state: 'loading' };
    });
    act(() => {
      loaded(rows(100));
    });
    await flush();
    const h1 = container.querySelector('h1')!;
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(h1);
    expect(h1.hasAttribute('data-route-focus')).toBe(true);
    expect(document.activeElement).not.toBe(container.querySelector('.trend-charts'));
    expect(selectedDay.value).toBeNull();
  });

  it('leaves focus where the user moved it', async () => {
    asError();
    const { container } = renderScreen();
    fireEvent.click(container.querySelector('.trends-retry')!);
    act(() => {
      dailyHealth.value = { state: 'loading' };
    });
    const control = chip(container, 'Range');
    control.focus();
    act(() => {
      loaded(rows(100));
    });
    await flush();
    expect(document.activeElement).toBe(control);
  });

  it('an unmount mid-retry focuses nothing and throws nothing', async () => {
    asError();
    const { container, unmount } = renderScreen();
    fireEvent.click(container.querySelector('.trends-retry')!);
    unmount();
    await flush();
    expect(document.activeElement).toBe(document.body);
  });

  it('a load with no press takes no focus, on first load or a refresh', async () => {
    dailyHealth.value = { state: 'loading' };
    bodyMeasurements.value = { state: 'loading' };
    dailySummary.value = { state: 'loading' };
    const { container } = renderScreen();
    expect(state(container)).not.toBeNull();
    act(() => {
      loaded(rows(100));
    });
    await flush();
    expect(document.activeElement).toBe(document.body);
    act(() => {
      asError();
    });
    expect(document.activeElement).toBe(document.body);
  });
});
