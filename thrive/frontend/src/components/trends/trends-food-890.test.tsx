// #890 - the Food group in Trends: Calories, Protein, Carbs and Fat from Forage's daily totals.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';

const loadHealth = vi.fn(async (_t: string) => {});
vi.mock('../../state/actions', () => ({ loadHealth: (t: string) => loadHealth(t) }));
const getFoodLogTotals = vi.fn();
vi.mock('../../api/forage-food', async (orig) => ({
  ...(await orig<typeof import('../../api/forage-food')>()),
  getFoodLogTotals: (...a: unknown[]) => getFoodLogTotals(...a),
}));

import { TrendsScreen, captionText } from './trends-screen';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary } from '../../state/store';
import { foodHistory, resetFoodHistory, demoFoodHistory } from '../../state/food';
import { addDays, todayInDenver } from '../../day/dates';
import {
  CALORIES,
  PROTEIN,
  CARBS,
  FAT,
  TREND_GROUPS,
  trendGroups,
  availableSections,
  normaliseCustom,
  customGroup,
  foodPoints,
} from './metrics';
import { summaryText } from './trend-chart';
import { metricSeries } from './series';
import { dayCells, pointsByDate, announceText, readoutLine } from './readout';
import { forageTrendsUrl } from '../../api/forage-food';
import { today as todaySignal } from '../../day/today';
import { pickRange, pickAverage, pickView } from './toolbar-test-utils';

const TODAY = todayInDenver();
const day = (back: number) => addDays(TODAY, -back);
const API = 'https://forage.example/exec';

function fd(date: string, over: Record<string, unknown> = {}) {
  return {
    date,
    entries: 3,
    unknown_entries: 0,
    kcal: 2000,
    protein_g: 100,
    carbs_g: 250,
    fat_g: 70,
    partial: false,
    ...over,
  };
}
const loaded = (rows: ReturnType<typeof fd>[]) => {
  foodHistory.value = { state: 'loaded', rows: rows as never[] };
};

function renderScreen() {
  return render(
    h(AuthContext.Provider, {
      value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_FORAGE_API_URL', API);
  localStorage.clear();
  resetFoodHistory();
  getFoodLogTotals.mockReset();
  loadHealth.mockClear();
  todaySignal.value = TODAY;
  dailyHealth.value = { state: 'loaded', rows: [] };
  bodyMeasurements.value = { state: 'loaded', rows: [] };
  dailySummary.value = { state: 'loaded', rows: [] };
  localStorage.setItem('thrive-trends-group', 'food');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('the registry', () => {
  it('has Food after Intake and before Custom, four cards in order', () => {
    expect(trendGroups().map((g) => g.id)).toEqual([
      'recovery',
      'sleep',
      'fitness',
      'body',
      'blood_pressure',
      'activity',
      'intake',
      'food',
      'custom',
    ]);
    expect(TREND_GROUPS.find((g) => g.id === 'food')!.metrics).toEqual([CALORIES, PROTEIN, CARBS, FAT]);
    expect([CALORIES, PROTEIN, CARBS, FAT].map((m) => `${m.label} ${m.unit}`)).toEqual([
      'Calories kcal',
      'Protein g',
      'Carbs g',
      'Fat g',
    ]);
    expect(CALORIES.note).toBe('Eaten, from Forage');
  });
  it('has a Food picker section after Intake, and canonical order puts Food after Intake', () => {
    const labels = availableSections().map((s) => s.label);
    expect(labels.slice(-2)).toEqual(['Intake', 'Food']);
    expect(normaliseCustom(['protein', 'training_load', 'weight', 'hrv']).join()).toBe(
      'hrv,training_load,weight,protein',
    );
    expect(customGroup(['fat', 'water']).metrics.map((m) => m.id)).toEqual(['water', 'fat']);
    // A set with no food ids is what it was.
    expect(normaliseCustom(['hrv', 'weight'])).toEqual(['hrv', 'weight']);
  });
});

describe('points', () => {
  it('holds only logged days: an absent day is a gap, never 0', () => {
    loaded([fd(day(3)), fd(day(1))]);
    expect(foodPoints('kcal').map((p) => p.date)).toEqual([day(3), day(1)]);
    const s = metricSeries(CALORIES, day(4), day(0), 7, TODAY);
    expect(s.covered).toBe(2);
    expect(s.mean).toBe(2000);
    expect(summaryText(CALORIES, s, TODAY)).toBe('Average 2,000 kcal · 2 of 5 days');
    const cells = dayCells(CALORIES, s, pointsByDate(s), day(2), 7, TODAY);
    expect(cells.value).toBe('—');
    expect(readoutLine(CALORIES, cells, 7)).toContain('— · nothing logged');
    expect(readoutLine(CALORIES, cells, 7)).not.toMatch(/\b0\b/);
  });
  it('treats a null figure as a gap for that metric only', () => {
    loaded([fd(day(2), { kcal: 1800, protein_g: null })]);
    expect(CALORIES.points()).toHaveLength(1);
    expect(PROTEIN.points()).toEqual([]);
  });
  it('keeps a real 0', () => {
    loaded([fd(day(2), { fat_g: 0 })]);
    expect(FAT.points()).toEqual([{ date: day(2), value: 0 }]);
  });
  it('marks a partial day low, counted in the average, worded for each surface', () => {
    loaded([fd(day(2), { kcal: 1240, partial: true }), fd(day(1), { kcal: 2000 })]);
    const s = metricSeries(CALORIES, day(3), day(0), 0, TODAY);
    expect(s.covered).toBe(2);
    expect(s.mean).toBe(1620);
    const cells = dayCells(CALORIES, s, pointsByDate(s), day(2), 0, TODAY);
    expect(readoutLine(CALORIES, cells, 0)).toBe('1,240 kcal (low)');
    expect(cells.partial).toBe('low: some items have no nutrition');
    expect(announceText(day(2), TODAY, [{ metric: CALORIES, series: s }], 0)).toContain(
      'Calories 1,240 kcal low: some items have no nutrition.',
    );
  });
  it('does not plot today, and says why when it is selected', () => {
    loaded([fd(day(1)), fd(TODAY, { kcal: 900 })]);
    const s = metricSeries(CALORIES, day(2), day(0), 0, TODAY, CALORIES.points());
    expect(s.covered).toBe(1);
    const cells = dayCells(CALORIES, s, pointsByDate(s), TODAY, 0, TODAY);
    expect(readoutLine(CALORIES, cells, 0)).toBe("— · today isn't counted until it's over");
    expect(announceText(TODAY, TODAY, [{ metric: CALORIES, series: s }], 0)).toContain(
      "Calories —, today isn't counted until it's over.",
    );
  });
  it('formats whole numbers with a thousands separator', () => {
    expect(CALORIES.format(2040.4)).toBe('2,040');
    expect(PROTEIN.format(98.6)).toBe('99');
  });
});

describe('captions', () => {
  it('replaces "Blank days stay blank." for food, and names hatching only with a low day', () => {
    expect(captionText(7, false, true, undefined, { low: false })).toBe(
      'Bars are each day · line is the 7-day average. A day with nothing logged is a gap.',
    );
    expect(captionText(0, false, true, undefined, { low: true })).toBe(
      'Bars are each day. A day with nothing logged is a gap. Hatched bars are low days: some items have no nutrition.',
    );
    expect(captionText(7, false, true)).toContain('Blank days stay blank.');
  });
});

describe('the screen', () => {
  it('shows the Food tab and reads the whole log once, with no from or to', async () => {
    localStorage.setItem('thrive-trends-custom', JSON.stringify(['protein']));
    getFoodLogTotals.mockResolvedValue({ ok: true, days: [fd(day(2)), fd(day(1), { partial: true, kcal: 1240 })] });
    const { container, getByRole, getByText } = renderScreen();
    await waitFor(() => expect(container.querySelectorAll('.trend-card:not(.fuel-card)')).toHaveLength(4));
    expect(getFoodLogTotals).toHaveBeenCalledTimes(1);
    expect(getFoodLogTotals).toHaveBeenCalledWith('tok');
    expect(
      [...container.querySelectorAll('.trend-card:not(.fuel-card) .trend-card-title')].map((e) =>
        e.textContent!.trim(),
      ),
    ).toEqual(['Calories kcal', 'Protein g', 'Carbs g', 'Fat g']);
    expect(container.querySelectorAll('.trend-card:not(.fuel-card) .trend-note')).toHaveLength(4);
    expect(getByText('Eaten, from Forage', { selector: '#trend-calories-note' })).toBeTruthy();
    expect(container.querySelectorAll('.trend-bar-low').length).toBe(4);
    expect(container.querySelector('.trends-caption, .trend-caption')!.textContent).toContain(
      'Hatched bars are low days',
    );
    // Range, average, view, and group changes read nothing more.
    pickRange(container, '1M');
    pickAverage(container, '14d');
    pickView(container, 'Table');
    pickView(container, 'Chart');
    // Another food group (a Custom set holding food) and back: no further read.
    fireEvent.click(getByRole('button', { name: 'Custom' }));
    fireEvent.click(getByRole('button', { name: 'Food' }));
    expect(getFoodLogTotals).toHaveBeenCalledTimes(1);
  });
  it('shows held rows with no Loading flash on re-entry, and reads again', async () => {
    loaded([fd(day(2))]);
    let resolve!: (v: unknown) => void;
    getFoodLogTotals.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container, queryByText } = renderScreen();
    expect(container.querySelectorAll('.trend-card:not(.fuel-card)')).toHaveLength(4);
    expect(queryByText('Loading…')).toBeNull();
    expect(getFoodLogTotals).toHaveBeenCalledTimes(1);
    resolve({ ok: true, days: [fd(day(2))] });
  });
  it('shows Loading… on the first read, then the error with Try again, which reads again', async () => {
    let resolve!: (v: unknown) => void;
    getFoodLogTotals.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { getByText, findByText, container } = renderScreen();
    expect(getByText('Loading…')).toBeTruthy();
    resolve({ ok: false, kind: 'network' });
    await findByText("Couldn't load your food.");
    getFoodLogTotals.mockResolvedValueOnce({ ok: true, days: [fd(day(2))] });
    fireEvent.click(getByText('Try again'));
    await waitFor(() => expect(container.querySelectorAll('.trend-card:not(.fuel-card)')).toHaveLength(4));
    expect(getFoodLogTotals).toHaveBeenCalledTimes(2);
  });
  it('says nothing is logged yet, and what an empty range holds', async () => {
    getFoodLogTotals.mockResolvedValue({ ok: true, days: [] });
    const { findAllByText } = renderScreen();
    expect((await findAllByText('Nothing logged in Forage yet.')).length).toBe(4);
    cleanup();
    resetFoodHistory();
    getFoodLogTotals.mockResolvedValue({ ok: true, days: [fd(day(400))] });
    const r = renderScreen();
    expect(await r.findByText('No calories in this range.')).toBeTruthy();
    expect(r.getByText('No protein in this range.')).toBeTruthy();
  });
  it('a Custom set holding food reads once and says "your food" when food alone failed', async () => {
    localStorage.setItem('thrive-trends-group', 'custom');
    localStorage.setItem('thrive-trends-custom', JSON.stringify(['hrv', 'protein']));
    getFoodLogTotals.mockResolvedValue({ ok: false, kind: 'network' });
    const { findByText } = renderScreen();
    await findByText("Couldn't load your food.");
    expect(getFoodLogTotals).toHaveBeenCalledTimes(1);
  });
  it('a Custom set without food never calls Forage', () => {
    localStorage.setItem('thrive-trends-group', 'custom');
    localStorage.setItem('thrive-trends-custom', JSON.stringify(['hrv']));
    renderScreen();
    expect(getFoodLogTotals).not.toHaveBeenCalled();
  });
});

describe('Explore in Forage', () => {
  it('links each food card to Forage Trends at its metric and the range, named per card', async () => {
    getFoodLogTotals.mockResolvedValue({ ok: true, days: [fd(day(2))] });
    const { container, getByRole, findByRole } = renderScreen();
    const link = await findByRole('link', { name: 'Explore Calories in Forage' });
    expect(link.getAttribute('href')).toBe(
      'https://luketmoss.github.io/keel/forage/#/eaten/trends?metric=kcal&range=3M',
    );
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(link.getAttribute('target')).toBeNull();
    expect(getByRole('link', { name: 'Explore Protein in Forage' }).getAttribute('href')).toContain('metric=protein');
    expect(getByRole('link', { name: 'Explore Carbs in Forage' }).getAttribute('href')).toContain('metric=carbs');
    expect(getByRole('link', { name: 'Explore Fat in Forage' }).getAttribute('href')).toContain('metric=fat');
    pickRange(container, 'All');
    expect(getByRole('link', { name: 'Explore Calories in Forage' }).getAttribute('href')).toMatch(/range=All$/);
    expect(container.querySelectorAll('a.food-link')).toHaveLength(4);
    expect(forageTrendsUrl('fat', '1W')).toBe(
      'https://luketmoss.github.io/keel/forage/#/eaten/trends?metric=fat&range=1W',
    );
  });
  it('is on no other card', () => {
    localStorage.setItem('thrive-trends-group', 'intake');
    const { container } = renderScreen();
    expect(container.querySelector('a.food-link')).toBeNull();
  });
  it('has no link in the Table view', async () => {
    localStorage.setItem('thrive-trends-view', 'Table');
    getFoodLogTotals.mockResolvedValue({ ok: true, days: [fd(day(2))] });
    const { container } = renderScreen();
    await waitFor(() => expect(container.querySelector('table')).toBeTruthy());
    expect(container.querySelector('a.food-link')).toBeNull();
  });
});

describe('a build without Forage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FORAGE_API_URL', '');
  });
  it('has no Food tab, no Food section, makes no request, and falls back from a stored choice', () => {
    expect(trendGroups().some((g) => g.id === 'food')).toBe(false);
    expect(availableSections().some((s) => s.label === 'Food')).toBe(false);
    expect(normaliseCustom(['hrv', 'calories'])).toEqual(['hrv']);
    const { container, queryByRole } = renderScreen();
    expect(queryByRole('button', { name: 'Food' })).toBeNull();
    expect(container.querySelector('[data-metric="calories"]')).toBeNull();
    expect(container.querySelector('[data-metric="resting_hr"]')).toBeTruthy();
    expect(getFoodLogTotals).not.toHaveBeenCalled();
  });
});

describe('demo history', () => {
  it('is a year-plus of days with gaps and a few low days, today excluded', () => {
    const rows = demoFoodHistory(TODAY);
    expect(rows.length).toBeGreaterThan(300);
    expect(rows.length).toBeLessThan(400);
    expect(rows.some((r) => r.partial)).toBe(true);
    expect(rows.every((r) => r.date < TODAY && r.kcal !== null)).toBe(true);
    expect(rows.some((r) => r.date === day(3))).toBe(false);
  });
});
