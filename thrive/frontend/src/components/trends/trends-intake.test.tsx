// #521, #590 — Water, Coffee, Alcohol and Unwind in Trends: the Intake group, summed per local day from getDrinks.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';

const loadHealth = vi.fn(async (_t: string) => {});
vi.mock('../../state/actions', () => ({ loadHealth: (t: string) => loadHealth(t) }));
const getDrinks = vi.fn();
vi.mock('../../api/drinks', async (orig) => ({
  ...(await orig<typeof import('../../api/drinks')>()),
  getDrinks: (...a: unknown[]) => getDrinks(...a),
}));

import { TrendsScreen, captionText } from './trends-screen';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary } from '../../state/store';
import { drinkHistory, resetDrinks } from '../../state/drinks';
import { addDays, todayInDenver } from '../../day/dates';
import { WATER, COFFEE, ALCOHOL, UNWIND, TREND_GROUPS, CUSTOM_SECTIONS, intakePoints } from './metrics';
import { summaryText, TrendPlot } from './trend-chart';
import { metricSeries } from './series';
import { today as todaySignal } from '../../day/today';

const TODAY = todayInDenver();
const day = (back: number) => addDays(TODAY, -back);

function drink(id: string, kind: 'water' | 'alcohol' | 'coffee' | 'unwind', amount: number, date: string) {
  return {
    id,
    kind,
    amount,
    date,
    time: '08:00:00',
    logged_at_utc: `${date}T14:00:00Z`,
    source: 'app',
    created: '',
    updated: '',
  };
}

function renderScreen() {
  return render(
    h(AuthContext.Provider, {
      value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  resetDrinks();
  getDrinks.mockReset();
  loadHealth.mockClear();
  todaySignal.value = TODAY;
  dailyHealth.value = { state: 'loaded', rows: [] };
  bodyMeasurements.value = { state: 'loaded', rows: [] };
  dailySummary.value = { state: 'loaded', rows: [] };
  localStorage.setItem('thrive-trends-group', 'intake');
});
afterEach(cleanup);

const loadedHistory = (rows: ReturnType<typeof drink>[]) => {
  drinkHistory.value = { state: 'loaded', rows: rows as never[] };
};

describe('the registry', () => {
  it('has Intake after Activity with Water (oz), Coffee (cups), Alcohol (drinks) then Unwind (mg), none banded', () => {
    const ids = TREND_GROUPS.map((g) => g.id);
    expect(ids.indexOf('intake')).toBe(ids.indexOf('activity') + 1);
    expect(TREND_GROUPS.find((g) => g.id === 'intake')!.metrics).toEqual([WATER, COFFEE, ALCOHOL, UNWIND]);
    expect([WATER.unit, COFFEE.unit, ALCOHOL.unit, UNWIND.unit]).toEqual(['oz', 'cups', 'drinks', 'mg']);
    expect([WATER.band, COFFEE.band, ALCOHOL.band, UNWIND.band]).toEqual([false, false, false, false]);
    expect([UNWIND.source, UNWIND.bars, UNWIND.zeroBased, UNWIND.reference]).toEqual(['drinks', true, true, undefined]);
    expect(CUSTOM_SECTIONS.flatMap((s) => s.metrics)).toContain(UNWIND);
    expect([COFFEE.source, COFFEE.bars, COFFEE.zeroBased, COFFEE.reference]).toEqual(['drinks', true, true, undefined]);
  });
  it('sums Unwind in mg per day, with every day from the first entry of any kind a point', () => {
    loadedHistory([
      drink('a', 'water', 250, day(3)),
      drink('u1', 'unwind', 5, day(1)),
      drink('u2', 'unwind', 5, day(1)),
    ]);
    const pts = UNWIND.points();
    expect(pts.map((p) => p.date)).toEqual([day(3), day(2), day(1), day(0)]);
    expect(pts.map((p) => p.value)).toEqual([0, 0, 10, 0]);
    expect(UNWIND.format(10)).toBe('10');
    // Unwind rows are not water, coffee or alcohol.
    expect(WATER.points().every((p) => p.value === 0 || p.date === day(3))).toBe(true);
    expect(ALCOHOL.points().every((p) => p.value === 0)).toBe(true);
  });
  it('prints water in oz to one decimal with a trailing .0 dropped, alcohol whole', () => {
    expect(WATER.format(4)).toBe('4');
    expect(WATER.format(52.04)).toBe('52');
    expect(WATER.format(20.26)).toBe('20.3');
    expect(ALCOHOL.format(2)).toBe('2');
    expect(ALCOHOL.format(1.4)).toBe('1.4');
  });
});

describe('daily sums', () => {
  it('sums each local day, in oz for water, and counts alcohol drinks', () => {
    loadedHistory([
      drink('a', 'water', 118, day(2)),
      drink('b', 'water', 472, day(2)),
      drink('c', 'alcohol', 1, day(2)),
      drink('d', 'alcohol', 1, day(2)),
    ]);
    const water = WATER.points().find((p) => p.date === day(2))!;
    expect(WATER.format(water.value)).toBe('20');
    expect(ALCOHOL.points().find((p) => p.date === day(2))!.value).toBe(2);
  });
  it('is blank before the first drink, 0 on a later day with none, and runs to today', () => {
    loadedHistory([drink('a', 'water', 250, day(3))]);
    const pts = WATER.points();
    expect(pts.map((p) => p.date)).toEqual([day(3), day(2), day(1), day(0)]);
    expect(pts.slice(1).map((p) => p.value)).toEqual([0, 0, 0]);
    // The first drink of either kind starts both: Alcohol is zeros from then on, not blank.
    expect(ALCOHOL.points().map((p) => p.value)).toEqual([0, 0, 0, 0]);
  });
  it('has no points before the history loads or when nothing was ever logged', () => {
    drinkHistory.value = { state: 'idle' };
    expect(WATER.points()).toEqual([]);
    loadedHistory([]);
    expect(WATER.points()).toEqual([]);
    expect(intakePoints('alcohol', (n) => n)).toEqual([]);
  });
  it('the average ignores blank days and counts zero days', () => {
    loadedHistory([
      drink('a', 'alcohol', 1, day(4)),
      drink('b', 'alcohol', 1, day(4)),
      drink('c', 'water', 100, day(9)),
    ]);
    const s = metricSeries(ALCOHOL, day(13), day(0), 0, TODAY);
    // Days 9..0 are points (10 of them); the four before the first drink are blank.
    expect(s.covered).toBe(10);
    expect(s.mean).toBeCloseTo(2 / 10);
  });
});

describe('the chart', () => {
  it('draws the water goal as a dashed reference line labelled "goal 64 oz", Water only', () => {
    loadedHistory([drink('a', 'water', 500, day(1)), drink('b', 'water', 500, day(0))]);
    const s = metricSeries(WATER, day(6), day(0), 0, TODAY);
    const { container } = render(
      h(TrendPlot, { metric: WATER, series: s, width: 300, label: 'Water', describedBy: 'x' }),
    );
    expect(container.querySelector('.trend-reference line')!.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(container.querySelector('.trend-reference text')!.textContent).toBe('goal 64 oz');
    expect(summaryText(WATER, s, TODAY)).toContain('Goal 64 oz');
    const a = metricSeries(ALCOHOL, day(6), day(0), 0, TODAY);
    const none = render(h(TrendPlot, { metric: ALCOHOL, series: a, width: 300, label: 'A', describedBy: 'y' }));
    expect(none.container.querySelector('.trend-reference')).toBeNull();
  });
  it('omits the goal when it is not available', () => {
    drinkHistory.value = { state: 'idle' };
    expect(WATER.reference!()).toBeNull();
  });
  it('draws a bar per day with a value, in the Day cards colour, and no dots', () => {
    loadedHistory([drink('a', 'water', 500, day(2))]);
    const s = metricSeries(WATER, day(6), day(0), 0, TODAY);
    const { container } = render(
      h(TrendPlot, { metric: WATER, series: s, width: 300, label: 'Water', describedBy: 'x' }),
    );
    expect(container.querySelectorAll('rect.trend-bar')).toHaveLength(3);
    expect(container.querySelectorAll('circle.trend-dot')).toHaveLength(0);
    expect(container.querySelector('rect.trend-bar')!.getAttribute('fill')).toBe('var(--metric-water)');
  });
  it('says no average for a single day of data', () => {
    loadedHistory([drink('a', 'water', 500, day(0))]);
    const s = metricSeries(WATER, day(6), day(0), 0, TODAY);
    expect(summaryText(WATER, s, TODAY)).not.toContain('Average');
  });
});

describe('the screen', () => {
  it('reads getDrinks for the history window on entry and shows all four cards', async () => {
    getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', 1893, day(1)), drink('b', 'alcohol', 1, day(1))], water_goal_ml: 1893 },
    });
    const { container } = renderScreen();
    await waitFor(() => expect(container.querySelectorAll('.trend-card')).toHaveLength(4));
    expect(getDrinks).toHaveBeenCalledTimes(1);
    expect(getDrinks.mock.calls[0][0]).toEqual({ from: addDays(TODAY, -399), to: TODAY });
    expect([...container.querySelectorAll('.trend-card-title')].map((e) => e.textContent?.trim())).toEqual([
      'Water oz',
      'Coffee cups',
      'Alcohol drinks',
      'Unwind mg',
    ]);
    expect(loadHealth).not.toHaveBeenCalled();
  });
  it('says no drinks are logged yet when none ever were', async () => {
    getDrinks.mockResolvedValue({ ok: true, data: { drinks: [], water_goal_ml: 1893 } });
    const { container } = renderScreen();
    await waitFor(() => expect(container.querySelectorAll('.trend-empty')).toHaveLength(4));
    expect(container.querySelector('.trend-empty')!.textContent).toBe('No drinks logged yet.');
  });
  it('shows Loading, then the standard error with Try again, which reads again', async () => {
    getDrinks.mockResolvedValueOnce({ ok: false, kind: 'network' });
    const { container } = renderScreen();
    expect(container.querySelector('.trends-loading')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('.trends-error')).not.toBeNull());
    expect(container.querySelector('.trends-error p')!.textContent).toBe("Couldn't load your health data.");
    getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', 250, day(0))], water_goal_ml: 1893 },
    });
    fireEvent.click(container.querySelector('.trends-retry')!);
    await waitFor(() => expect(container.querySelectorAll('.trend-card')).toHaveLength(4));
    expect(getDrinks).toHaveBeenCalledTimes(2);
    expect(loadHealth).not.toHaveBeenCalled();
  });
  it('calls the marks bars, not dots, in the caption', () => {
    expect(captionText(7, false, true)).toBe('Bars are each day · line is the 7-day average. Blank days stay blank.');
  });
  it('does not read drinks for another group', async () => {
    localStorage.setItem('thrive-trends-group', 'recovery');
    renderScreen();
    await Promise.resolve();
    expect(getDrinks).not.toHaveBeenCalled();
  });
});
