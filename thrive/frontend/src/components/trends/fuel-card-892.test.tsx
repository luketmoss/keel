// #892 - the Fuel and training card in Trends' Food group.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { h } from 'preact';

const loadHealth = vi.fn(async (_t: string) => {});
vi.mock('../../state/actions', () => ({ loadHealth: (t: string) => loadHealth(t) }));
const getFoodLogTotals = vi.fn();
vi.mock('../../api/forage-food', async (orig) => ({
  ...(await orig<typeof import('../../api/forage-food')>()),
  getFoodLogTotals: (...a: unknown[]) => getFoodLogTotals(...a),
}));

import { TrendsScreen } from './trends-screen';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary } from '../../state/store';
import { foodHistory, resetFoodHistory } from '../../state/food';
import { addDays, todayInDenver } from '../../day/dates';
import { fuelAndTraining } from './fuel-and-training';
import { today as todaySignal } from '../../day/today';
import { pickRange } from './toolbar-test-utils';

const TODAY = todayInDenver();
const day = (back: number) => addDays(TODAY, -back);

const fd = (back: number, over: Record<string, unknown> = {}) => ({
  date: day(back),
  entries: 3,
  unknown_entries: 0,
  kcal: 2000,
  protein_g: 100,
  carbs_g: 250,
  fat_g: 70,
  partial: false,
  ...over,
});
const sr = (back: number, types: string, count: string) => ({
  date: day(back),
  activity_types: types,
  activity_count: count,
});

describe('fuelAndTraining', () => {
  const from = day(30);
  const to = TODAY;
  it('averages each kind; a ride and a lift counts in both; other days are in no row', () => {
    const food = [fd(1, { kcal: 2400 }), fd(2, { kcal: 2200 }), fd(3, { kcal: 1800 }), fd(4, { kcal: 1500 }), fd(5)];
    const summary = [
      sr(1, 'bike:road', '1'),
      sr(2, 'weight,bike:mountain', '2'),
      sr(3, 'weight', '1'),
      sr(4, '', '0'),
      sr(5, 'run', '1'),
    ];
    const f = fuelAndTraining(food as never, summary as never, from, to, TODAY);
    expect(f.rows.map((r) => [r.kind, r.avg, r.count])).toEqual([
      ['ride', 2300, 2],
      ['lift', 2000, 2],
      ['rest', 1500, 1],
    ]);
    expect(f.otherDays).toBe(1);
    expect(f.lowLeftOut).toBe(0);
  });
  it('leaves out a low day, a gap, null kcal, today and a missing row, never as 0', () => {
    const food = [
      fd(1, { kcal: 2000 }),
      fd(2, { kcal: 900, partial: true }),
      fd(3, { kcal: null }),
      fd(0, { kcal: 5000 }),
      fd(6, { kcal: 3000 }),
    ];
    const summary = [
      sr(1, 'bike', '1'),
      sr(2, 'bike', '1'),
      sr(3, 'bike', '1'),
      sr(0, 'bike', '1'),
      sr(4, 'bike', '1'),
    ];
    const f = fuelAndTraining(food as never, summary as never, from, to, TODAY);
    expect(f.rows[0]).toMatchObject({ avg: 2000, count: 1 });
    expect(f.lowLeftOut).toBe(1);
    expect(f.rows[1]).toMatchObject({ avg: null, count: 0 });
    expect(f.rows[2]).toMatchObject({ avg: null, count: 0 });
  });
  it('respects the range', () => {
    const f = fuelAndTraining([fd(10)] as never, [sr(10, 'weight', '1')] as never, day(7), TODAY, TODAY);
    expect(f.rows[1].count).toBe(0);
  });
});

function renderScreen() {
  return render(
    h(AuthContext.Provider, {
      value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_FORAGE_API_URL', 'https://forage.example/exec');
  localStorage.clear();
  resetFoodHistory();
  loadHealth.mockClear();
  todaySignal.value = TODAY;
  dailyHealth.value = { state: 'loaded', rows: [] };
  bodyMeasurements.value = { state: 'loaded', rows: [] };
  const rows = [fd(1, { kcal: 2310 }), fd(2, { kcal: 2040 }), fd(3, { kcal: 900, partial: true }), fd(4)];
  foodHistory.value = { state: 'loaded', rows: rows as never[] };
  getFoodLogTotals.mockReset();
  getFoodLogTotals.mockResolvedValue({ ok: true, days: rows });
  dailySummary.value = {
    state: 'loaded',
    rows: [sr(1, 'bike', '1'), sr(2, 'weight', '1'), sr(3, 'weight', '1'), sr(4, 'run', '1')] as never[],
  };
  localStorage.setItem('thrive-trends-group', 'food');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('the card', () => {
  it('ends the Food group with three rows, notes and a subtitle, and nothing compared', () => {
    const { container, getByText } = renderScreen();
    const cards = [...container.querySelectorAll('section.trend-card')];
    expect(cards[cards.length - 1].getAttribute('data-metric')).toBe('fuel');
    expect(getByText('Fuel and training')).toBeTruthy();
    expect(getByText('Average kcal on days with each kind of training, last 3 months.')).toBeTruthy();
    const rows = [...container.querySelectorAll('.fuel-row')];
    expect(rows.map((r) => r.querySelector('.sr-only')!.textContent)).toEqual([
      'Ride days, 2,310 kcal on average, 1 day',
      'Lift days, 2,040 kcal on average, 1 day',
      'Rest days, no days',
    ]);
    const widths = [...container.querySelectorAll<HTMLElement>('.fuel-bar-fill')].map((e) => e.style.width);
    expect(widths).toEqual(['100%', `${(2040 / 2310) * 100}%`]);
    expect(rows[2].textContent).toContain('—');
    expect(getByText('1 low day left out.')).toBeTruthy();
    expect(getByText('1 day with a run, hike, walk or stretch is in no row.')).toBeTruthy();
    expect(getByText('A day with a ride and a lift is in both.')).toBeTruthy();
    expect(container.querySelector('.fuel-card')!.textContent).not.toMatch(/more than|highest|largest|difference/i);
  });
  it('is not in other groups', () => {
    localStorage.setItem('thrive-trends-group', 'recovery');
    const { container } = renderScreen();
    expect(container.querySelector('.fuel-card')).toBeNull();
  });
  it('shows Loading while DailySummary loads, leaving the food cards', () => {
    dailySummary.value = { state: 'loading' };
    const { container } = renderScreen();
    expect(container.querySelector('.fuel-card [role=status]')!.textContent).toBe('Loading…');
    expect(container.querySelector('[data-metric=calories]')).toBeTruthy();
  });
  it('fails alone when DailySummary fails, and Try again re-reads', () => {
    dailySummary.value = { state: 'error' };
    const { container, getByText } = renderScreen();
    expect(getByText("Couldn't load your activity data.")).toBeTruthy();
    expect(container.querySelector('[data-metric=calories]')).toBeTruthy();
    loadHealth.mockClear();
    fireEvent.click(getByText('Try again'));
    expect(loadHealth).toHaveBeenCalledWith('tok');
  });
  it('shows three rows of dashes with no DailySummary rows', () => {
    dailySummary.value = { state: 'loaded', rows: [] };
    const { container } = renderScreen();
    const rows = [...container.querySelectorAll('.fuel-row')];
    expect(rows.every((r) => r.textContent!.includes('no days'))).toBe(true);
    expect(container.querySelector('.fuel-bar-fill')).toBeNull();
  });
  it('recomputes for the range without a request', () => {
    const { container, getByText } = renderScreen();
    pickRange(container, '1W');
    expect(getByText('Average kcal on days with each kind of training, last 7 days.')).toBeTruthy();
    expect(container.querySelectorAll('.fuel-row').length).toBe(3);
  });
});
