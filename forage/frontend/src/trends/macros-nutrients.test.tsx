// #914: the Macros and Nutrients tabs: shares, the week split and its rules, the macro control, the nutrient rows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { FoodLogDay, FoodLogEntry } from '../api/types';
import { _resetEaten } from '../eaten/eaten-store';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { parseTrendsHash, trendsHash, trendsRoute } from '../shell/routes';
import { fakeApi } from '../test-api';
import { nutrientText } from './nutrients-tab';
import { buildSeries, buildSeriesWeeks, macroOverview, pickNutrient, summarizeSeries, weekSplits } from './series';
import { weekSplitText } from './macros-tab';
import { _resetTrends, MACRO_KEY, RANGE_KEY } from './trends-store';

// Monday 2 November 2026, 10:00 on the device.
const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';

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

let seq = 0;
/** A day of 100 g protein, 200 g carbs, 50 g fat (400 + 800 + 450 kcal: 24%, 49%, 27% of the macros' calories). */
function day(date: string, over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return entry({
    id: `e${++seq}`,
    date,
    kcal: 1650,
    protein_g: 100,
    carbs_g: 200,
    fat_g: 50,
    sodium_mg: 2000,
    fiber_g: 20,
    transfat_g: 0,
    satfat_g: 8.46,
    ...over,
  });
}

/** Two full weeks (Oct 19-25: 4 days, Oct 26-Nov 1: 5 days) and a thin one (Oct 12-18: 2 days). */
function seedWeeks(api: ReturnType<typeof fakeApi>) {
  for (const d of ['2026-10-12', '2026-10-13']) api.log.push(day(d));
  for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) api.log.push(day(d));
  for (const d of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) api.log.push(day(d));
}

const q = (id: string) => screen.getByTestId(id);

beforeEach(() => {
  seq = 0;
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
  window.history.replaceState(null, '', '/');
});

const dayOf = (date: string, over: Partial<FoodLogDay> = {}): FoodLogDay => ({
  date,
  entries: 1,
  unknown_entries: 0,
  kcal: 1650,
  protein_g: 100,
  carbs_g: 200,
  fat_g: 50,
  partial: false,
  ...over,
});
const mapOf = (...days: FoodLogDay[]) => new Map(days.map((d) => [d.date, d]));

describe('the numbers', () => {
  it('averages the macros over counted days and leaves today out', () => {
    const by = mapOf(
      dayOf('2026-10-30'),
      dayOf('2026-10-31', { protein_g: 50, carbs_g: 100, fat_g: 0, partial: true }),
      dayOf('2026-11-01', { kcal: null, protein_g: null, carbs_g: null, fat_g: null }),
      dayOf(TODAY, { protein_g: 900 }),
    );
    const o = macroOverview(by, '2026-10-30', TODAY);
    expect(o.grams).toEqual({ protein: 75, carbs: 150, fat: 25 });
    expect(o).toMatchObject({ logged: 2, total: 3, low: 1 });
    expect(macroOverview(new Map(), '2026-10-30', TODAY).grams).toEqual({ protein: null, carbs: null, fat: null });
  });

  it('splits by week from each week summed days, with a 3-day rule', () => {
    const by = mapOf(
      dayOf('2026-10-12'),
      dayOf('2026-10-13'),
      ...['2026-10-19', '2026-10-20', '2026-10-21'].map((d) => dayOf(d)),
      ...['2026-10-26', '2026-10-27', '2026-10-28'].map((d) => dayOf(d)),
    );
    const w = weekSplits(by, '2026-10-12', TODAY);
    expect(w.map((x) => [x.date, x.days, x.pct !== null])).toEqual([
      ['2026-10-12', 2, false],
      ['2026-10-19', 3, true],
      ['2026-10-26', 3, true],
      ['2026-11-02', 0, false],
    ]);
    expect(w[1].pct).toEqual({ protein: 24, carbs: 49, fat: 27 });
    expect(Object.values(w[1].pct!).reduce((a, b) => a + b, 0)).toBe(100);
    expect(weekSplitText(w[1])).toBe('Oct 19–25 · Protein 24% · Carbs 49% · Fat 27% · 3 days logged');
    expect(weekSplitText(w[0])).toBe('Oct 12–18 · too few days to split · 2 days logged');
    expect(weekSplitText({ date: '2026-10-26', days: 1, pct: null })).toBe(
      'Oct 26–Nov 1 · too few days to split · 1 day logged',
    );
  });

  it('counts a week cut by the range only for its days inside it', () => {
    const by = mapOf(...['2026-10-19', '2026-10-20', '2026-10-21'].map((d) => dayOf(d)));
    const w = weekSplits(by, '2026-10-21', TODAY);
    expect(w[0]).toMatchObject({ date: '2026-10-19', days: 1, pct: null });
  });

  it('rounds nutrient values: mg whole, g whole and one decimal under 10, a measured 0 as 0 g', () => {
    expect(nutrientText('mg', 1239.6)).toBe('1,240 mg');
    expect(nutrientText('g', 22.4)).toBe('22 g');
    expect(nutrientText('g', 8.46)).toBe('8.5 g');
    expect(nutrientText('g', 0.43)).toBe('0.4 g');
    expect(nutrientText('g', 9.97)).toBe('10 g');
    expect(nutrientText('g', 0)).toBe('0 g');
  });

  it('averages over days that have a value, reads at least, and keeps all-null as null', () => {
    const by = mapOf(
      dayOf('2026-10-29', { sodium_mg: 1000, unknown: { sodium_mg: 0 } }),
      dayOf('2026-10-30', { sodium_mg: 2000, unknown: { sodium_mg: 1 } }),
      dayOf('2026-10-31', { sodium_mg: null, unknown: { sodium_mg: 1 } }),
      dayOf('2026-11-01', { sodium_mg: null, fiber_g: 0, unknown: { sodium_mg: 0 } }),
    );
    const pts = buildSeries(by, '2026-10-29', TODAY, TODAY, 0, pickNutrient('sodium_mg'), 'sodium_mg');
    const s = summarizeSeries(pts);
    expect(s).toMatchObject({ average: 1500, withValue: 2, logged: 4, total: 4, atLeast: true });
    expect(pts.find((p) => p.date === '2026-10-30')).toMatchObject({ atLeast: true, value: 2000 });
    // No value, but entries had calories and lacked it: a gap, not an "at least" bar.
    expect(pts.find((p) => p.date === '2026-10-31')).toMatchObject({ value: null, atLeast: false });
    expect(buildSeriesWeeks(pts)[0]).toMatchObject({ value: 1500, atLeast: true });
    const none = summarizeSeries(buildSeries(by, '2026-10-29', TODAY, TODAY, 0, pickNutrient('cholesterol_mg')));
    expect(none).toMatchObject({ average: null, withValue: 0, atLeast: false });
    const zero = summarizeSeries(buildSeries(by, '2026-11-01', TODAY, TODAY, 0, pickNutrient('fiber_g')));
    expect(zero.average).toBe(0);
  });

  it('writes and reads the metric in the hash', () => {
    expect(trendsHash('nutrients', '3M', 'sodium')).toBe('#/eaten/trends?tab=nutrients&range=3M&metric=sodium');
    expect(parseTrendsHash('#/eaten/trends?metric=sodium')).toEqual({
      range: null,
      tab: 'nutrients',
      metric: 'sodium',
    });
    expect(parseTrendsHash('#/eaten/trends?metric=added_sugars')).toMatchObject({ tab: 'nutrients' });
    expect(parseTrendsHash('#/eaten/trends?metric=fat&tab=energy')).toMatchObject({ tab: 'macros', metric: 'fat' });
  });
});

describe('the tabs', () => {
  it('shows Energy, Macros and Nutrients; ?tab opens one; a switch makes no request and clears the day', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Energy', 'Macros', 'Nutrients']);
    expect(screen.getByRole('tab', { name: 'Energy' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '3M' }));
    await settle();
    expect(screen.getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');
    const reads = api.calls('getFoodLogTotals').length;
    const bar = screen.getAllByTestId('chart-bar')[0];
    const svg = q('chart').querySelector('svg')!;
    for (const name of ['pointerdown', 'PointerDown'])
      fireEvent(svg, new MouseEvent(name, { clientX: 60, bubbles: true }));
    expect(bar).toBeDefined();
    await go(trendsHash('macros', '3M'));
    expect(screen.getByRole('tab', { name: 'Macros' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('radio', { name: '3M' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');
    expect(api.calls('getFoodLogTotals')).toHaveLength(reads);
    expect(within(q('macro-grams-card')).getByTestId('readout').textContent).toBe('Tap a day to read it.');
    await go(trendsHash('nutrients', '3M'));
    expect(api.calls('getFoodLogTotals')).toHaveLength(reads);
    expect(screen.getByRole('tab', { name: 'Nutrients' }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens the named tab from ?tab and moves between tabs with the arrow keys', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=macros');
    expect(q('macro-where')).toBeDefined();
    const tab = screen.getByRole('tab', { name: 'Macros' });
    fireEvent.keyDown(tab.parentElement!, { key: 'ArrowRight' });
    await go(window.location.hash);
    expect(screen.getByRole('tab', { name: 'Nutrients' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Nutrients' }).parentElement!, { key: 'ArrowLeft' });
    await go(window.location.hash);
    expect(screen.getByRole('tab', { name: 'Macros' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel')).toBeDefined();
  });
});

async function go(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
}

describe('Macros', () => {
  it('shows the split bar, average grams and shares adding to 100, and the count line', async () => {
    const api = fakeApi();
    seedWeeks(api);
    api.log.push(day('2026-10-31', { partial: true }));
    await openAt('/#/eaten/trends?tab=macros&range=1M');
    expect(q('macro-grams-protein').textContent).toBe('100 g');
    expect(q('macro-grams-carbs').textContent).toBe('200 g');
    expect(q('macro-grams-fat').textContent).toBe('50 g');
    expect(q('macro-share-protein').textContent).toBe('24% of kcal');
    expect(q('macro-share-carbs').textContent).toBe('49% of kcal');
    expect(q('macro-share-fat').textContent).toBe('27% of kcal');
    expect(q('macro-count').textContent).toBe('12 of 29 days logged · 1 low');
    expect(within(q('macro-where')).getByTestId('macro-bar')).toBeDefined();
  });

  it('says <1% for a real value that rounds to 0', async () => {
    const api = fakeApi();
    api.log.push(day('2026-10-30', { protein_g: 0.1, carbs_g: 100, fat_g: 100 }));
    await openAt('/#/eaten/trends?tab=macros');
    expect(q('macro-share-protein').textContent).toBe('<1% of kcal');
  });

  it('with nothing counted shows an empty bar and a dash, never 0', async () => {
    const api = fakeApi();
    api.log.push(day('2026-09-01'));
    await openAt('/#/eaten/trends?tab=macros&range=1W');
    expect(within(q('macro-where')).getByTestId('macro-empty')).toBeDefined();
    expect(q('macro-grams-protein').textContent).toBe('—');
    expect(q('macro-share-protein').textContent).toBe('');
    expect(q('macro-count').textContent).toBe('No days logged in this range.');
    expect(q('macro-where').textContent).not.toMatch(/\b0 g\b/);
  });

  it('draws a column for a week of 3 days or more, a dashed gap for fewer, and reads a week with no day link', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=macros&range=1M');
    const card = q('macro-split');
    const cols = within(card).getAllByTestId('chart-bar');
    expect(cols.map((c) => c.getAttribute('data-kind'))).toEqual(['gap', 'gap', 'gap', 'stack', 'stack', 'gap']);
    expect(within(cols[3] as unknown as HTMLElement).getAllByTestId('chart-seg')).toHaveLength(3);
    const svg = within(card).getByTestId('chart').querySelector('svg')!;
    // Six columns in the 320px chart; the fourth is Oct 19.
    const x = 44 + ((320 - 52) / 6) * 3.5;
    for (const name of ['pointerdown', 'PointerDown'])
      fireEvent(svg, new MouseEvent(name, { clientX: x, bubbles: true }));
    expect(within(card).getByTestId('split-readout').textContent).toBe(
      'Oct 19–25 · Protein 24% · Carbs 49% · Fat 27% · 4 days logged',
    );
    expect(within(card).queryByTestId('readout-link')).toBeNull();
  });

  it('replaces the week card with one line when fewer than two weeks qualify', async () => {
    const api = fakeApi();
    api.log.push(day('2026-10-26'), day('2026-10-27'), day('2026-10-28'));
    await openAt('/#/eaten/trends?tab=macros&range=1M');
    expect(q('split-needs').textContent).toBe('Split by week needs two weeks with at least 3 days logged.');
    expect(screen.queryByTestId('macro-split')).toBeNull();
  });

  it('1W always reads the one-line state', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=macros&range=1W');
    expect(q('split-needs')).toBeDefined();
  });

  it('drives the grams chart from the macro control, remembers it, and takes it from the hash', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=macros&range=1M');
    expect(screen.getByRole('radio', { name: 'Protein' }).getAttribute('aria-checked')).toBe('true');
    expect(window.location.hash).toBe('#/eaten/trends?tab=macros&range=1M&metric=protein');
    expect(q('series-summary').textContent).toBe('100 g a day, on average · 11 of 29 days logged');
    fireEvent.click(screen.getByRole('radio', { name: 'Fat' }));
    await settle();
    expect(localStorage.getItem(MACRO_KEY)).toBe('fat');
    expect(window.location.hash).toBe('#/eaten/trends?tab=macros&range=1M&metric=fat');
    expect(q('series-summary').textContent).toBe('50 g a day, on average · 11 of 29 days logged');
    expect(q('macro-grams-card').getAttribute('style')).toContain('--color-macro-fat');
    expect(q('legend').textContent).toContain('Fat');
    // A reload starts on the remembered macro; a link's macro is for the visit and is not stored.
    cleanup();
    _resetTrends();
    trendsRoute.value = null;
    await openAt('/#/eaten/trends?tab=macros&range=1M');
    expect(screen.getByRole('radio', { name: 'Fat' }).getAttribute('aria-checked')).toBe('true');
    cleanup();
    _resetTrends();
    trendsRoute.value = null;
    await openAt('/#/eaten/trends?metric=carbs&range=1M');
    expect(screen.getByRole('radio', { name: 'Carbs' }).getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem(MACRO_KEY)).toBe('fat');
    expect(screen.getByRole('tab', { name: 'Macros' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the selected day when the macro changes, and hatches a low day with the chip', async () => {
    const api = fakeApi();
    api.log.push(day('2026-11-01', { partial: true }), day('2026-10-31'));
    await openAt('/#/eaten/trends?tab=macros&range=1W');
    const kinds = screen.getAllByTestId('chart-bar').map((b) => b.getAttribute('data-kind'));
    expect(kinds).toEqual(['gap', 'gap', 'gap', 'gap', 'bar', 'hatched', 'gap']);
    const svg = q('chart').querySelector('svg')!;
    // The chart is 320px wide in jsdom with seven columns; the sixth (Nov 1) starts at 44 + 38.3 * 5.
    const x = 44 + ((320 - 52) / 7) * 5.5;
    for (const name of ['pointerdown', 'PointerDown'])
      fireEvent(svg, new MouseEvent(name, { clientX: x, bubbles: true }));
    for (const name of ['pointerup', 'PointerUp']) fireEvent(svg, new MouseEvent(name, { clientX: x, bubbles: true }));
    expect(q('readout').textContent).toContain('Sun, Nov 1 · 100 g');
    expect(q('readout').textContent).toContain('Low');
    fireEvent.click(screen.getByRole('radio', { name: 'Carbs' }));
    await settle();
    expect(q('readout').textContent).toContain('Sun, Nov 1 · 200 g');
  });

  it('a failed read keeps the controls and tabs, as Energy does', async () => {
    const api = fakeApi();
    api.answer('getFoodLogTotals', () => ({ success: false, error: 'boom' }));
    await openAt('/#/eaten/trends?tab=macros');
    expect(q('trends-error')).toBeDefined();
    expect(screen.getByRole('radio', { name: '1M' })).toBeDefined();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('with nothing logged at all shows the one card on both tabs', async () => {
    fakeApi();
    localStorage.setItem(RANGE_KEY, 'All');
    await openAt('/#/eaten/trends?tab=macros');
    expect(q('trends-none')).toBeDefined();
    await go(trendsHash('nutrients', 'All'));
    expect(q('trends-none')).toBeDefined();
  });

  it('shows no target line or judging word', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=macros&range=1M');
    expect(document.body.textContent).not.toMatch(/target|goal|recommended|too (high|much)|healthy/i);
  });
});

describe('Nutrients', () => {
  it('lists the seven in Nutrition Facts order, each with an average and a sparkline', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=nutrients&range=1M');
    const rows = screen.getAllByTestId('nut-row');
    expect(rows.map((r) => r.querySelector('.nut-title')!.textContent)).toEqual([
      'Saturated fat',
      'Trans fat',
      'Cholesterol',
      'Sodium',
      'Fiber',
      'Sugars',
      'Added sugars',
    ]);
    const avg = (m: string) => within(q(`nut-${m}`)).getByTestId('nut-avg').textContent;
    expect(avg('satfat')).toBe('8.5 g');
    expect(avg('transfat')).toBe('0 g');
    expect(avg('sodium')).toBe('2,000 mg');
    expect(avg('fiber')).toBe('20 g');
    expect(within(q('nut-sodium')).getAllByTestId('spark-bar')).toHaveLength(11);
    expect(screen.queryByTestId('nut-at-least-note')).toBeNull();
  });

  it('reads at least with words and the note once, and a dash and "Not reported" for none, never 0', async () => {
    const api = fakeApi();
    seedWeeks(api);
    api.log.push(day('2026-10-31', { sodium_mg: null }));
    await openAt('/#/eaten/trends?tab=nutrients&range=1M');
    expect(within(q('nut-sodium')).getByTestId('nut-avg').textContent).toBe('at least 2,000 mg');
    expect(within(q('nut-sodium')).getByText("at least, some entries didn't report it")).toBeDefined();
    expect(screen.getAllByTestId('nut-at-least-note')).toHaveLength(1);
    expect(q('nut-at-least-note').textContent).toBe("At least: some entries don't have this one.");
    const none = q('nut-cholesterol');
    expect(within(none).getByTestId('nut-avg').textContent).toBe('—');
    expect(within(none).getByRole('img', { name: 'not reported' })).toBeDefined();
    expect(within(none).getByText('Not reported in this range')).toBeDefined();
  });

  it('opens a row in place, one at a time, and closes it by tapping again', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?tab=nutrients&range=1M');
    const sodium = within(q('nut-sodium')).getByTestId('nut-row');
    const fiber = within(q('nut-fiber')).getByTestId('nut-row');
    expect(sodium.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(sodium);
    await settle();
    expect(sodium.getAttribute('aria-expanded')).toBe('true');
    expect(within(q('nut-sodium')).getByTestId('nut-panel')).toBeDefined();
    expect(window.location.hash).toBe('#/eaten/trends?tab=nutrients&range=1M&metric=sodium');
    expect(q('series-summary').textContent).toBe('2,000 mg a day, on average · 11 of 29 days logged');
    fireEvent.click(fiber);
    await settle();
    expect(sodium.getAttribute('aria-expanded')).toBe('false');
    expect(fiber.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByTestId('nut-panel')).toHaveLength(1);
    fireEvent.click(fiber);
    await settle();
    expect(fiber.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('nut-panel')).toBeNull();
    expect(window.location.hash).toBe('#/eaten/trends?tab=nutrients&range=1M');
  });

  it('metric in the hash opens Nutrients with that row open', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?metric=sodium&range=1M');
    expect(screen.getByRole('tab', { name: 'Nutrients' }).getAttribute('aria-selected')).toBe('true');
    expect(within(q('nut-sodium')).getByTestId('nut-row').getAttribute('aria-expanded')).toBe('true');
    expect(within(q('nut-sodium')).getByTestId('nut-panel')).toBeDefined();
  });

  it('draws an at least day outlined, a day with no value as a gap, and never hatches or says Low', async () => {
    const api = fakeApi();
    api.log.push(
      day('2026-11-01'),
      day('2026-10-31', { id: 'x1' }),
      day('2026-10-31', { id: 'x2', sodium_mg: null }),
      day('2026-10-30', { sodium_mg: null }),
      day('2026-10-29', { partial: true }),
    );
    await openAt('/#/eaten/trends?metric=sodium&range=1W');
    const kinds = screen.getAllByTestId('chart-bar').map((b) => b.getAttribute('data-kind'));
    expect(kinds).toEqual(['gap', 'gap', 'bar', 'gap', 'outline', 'bar', 'gap']);
    expect(screen.queryByText('Low')).toBeNull();
    expect(q('legend').textContent).toContain("At least (some entries didn't report it)");
    const svg = q('chart').querySelector('svg')!;
    const press = (i: number) => {
      const x = 44 + ((320 - 52) / 7) * (i + 0.5);
      for (const name of ['pointerdown', 'PointerDown'])
        fireEvent(svg, new MouseEvent(name, { clientX: x, bubbles: true }));
      for (const name of ['pointerup', 'PointerUp'])
        fireEvent(svg, new MouseEvent(name, { clientX: x, bubbles: true }));
    };
    press(4);
    expect(q('readout').textContent).toContain('Sat, Oct 31 · at least 2,000 mg');
    expect(within(q('readout')).getByTestId('readout-link').textContent).toBe('Open day ›');
    press(3);
    expect(q('readout').textContent).toContain('Fri, Oct 30 · logged, but nothing reported this');
    expect(within(q('readout')).getByTestId('readout-link').textContent).toBe('Open day ›');
    press(1);
    expect(q('readout').textContent).toContain('nothing logged');
    expect(within(q('readout')).getByTestId('readout-link').textContent).toBe('Log this day ›');
    press(2);
    expect(q('readout').textContent).toContain('Thu, Oct 29 · 2,000 mg');
    expect(q('readout').textContent).not.toContain('Low');
  });

  it('shows seven dashes with nothing in the range', async () => {
    const api = fakeApi();
    api.log.push(day('2026-09-01'));
    await openAt('/#/eaten/trends?tab=nutrients&range=1W');
    const avgs = screen.getAllByTestId('nut-avg').map((a) => a.textContent);
    expect(avgs).toEqual(Array(7).fill('—'));
    expect(screen.getAllByText('Not reported in this range')).toHaveLength(7);
    expect(screen.queryByTestId('nut-at-least-note')).toBeNull();
  });

  it('draws weekly bars past 182 days', async () => {
    const api = fakeApi();
    seedWeeks(api);
    await openAt('/#/eaten/trends?metric=sodium&range=1Y');
    const bars = screen.getAllByTestId('chart-bar');
    expect(bars.length).toBeGreaterThan(40);
    expect(screen.getByRole('radio', { name: '7d' }).hasAttribute('disabled')).toBe(true);
  });
});
