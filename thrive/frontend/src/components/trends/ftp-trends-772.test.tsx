// #772 — FTP in Trends: two held-value cards in the Fitness group, a step line, a dot per entry day
// (filled for a ramp test, a ring for a hand-set FTP), the entries list, the readout and the table.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../state/actions', () => ({ loadHealth: async () => {} }));

import { TrendsScreen, selectedDay, announcement } from './trends-screen';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary, ftpHistory } from '../../state/store';
import { addDays, todayInDenver } from '../../day/dates';
import { rowDate, shortDate, sinceDate } from './series';
import { ftpEntries, FTP, FTP_WKG } from './metrics';

const TODAY = todayInDenver();
const ago = (n: number) => addDays(TODAY, -n);

function ftp(id: string, date: string, ftp_w: string, source: string, created = `${date}T10:00:00.000Z`) {
  return { id, date, ftp_w, source, ride_id: '', created };
}

function weighIn(date: string, kg: string) {
  return {
    grpid: `g${date}`,
    date,
    time: '06:30',
    measured_at_utc: `${date}T12:30:00Z`,
    kind: 'scale',
    weight_kg: kg,
    fat_ratio_pct: '',
    sheetRow: 2,
  };
}

// Entries: 200 days ago a ramp test (before a 6-month range), 100 a hand-set value, 40 a ramp test
// that was entered twice on the day, 10 a ramp test; plus a future one and a blank one that must not draw.
const ENTRIES = [
  ftp('f1', ago(200), '212', 'ramp_test'),
  ftp('f2', ago(100), '220', 'manual'),
  ftp('f3', ago(40), '999', 'ramp_test', `${ago(40)}T09:00:00.000Z`),
  ftp('f4', ago(40), '232', 'ramp_test', `${ago(40)}T11:00:00.000Z`),
  ftp('f5', ago(10), '250', 'ramp_test'),
  ftp('f6', addDays(TODAY, 5), '300', 'ramp_test'),
  ftp('f7', ago(20), '', 'manual'),
];

function renderScreen() {
  return render(
    h(AuthContext.Provider, {
      value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

function load(rows: unknown[], body: unknown[] = []) {
  dailyHealth.value = { state: 'loaded', rows: [] };
  bodyMeasurements.value = { state: 'loaded', rows: body as never[] };
  dailySummary.value = { state: 'loaded', rows: [] };
  ftpHistory.value = { state: 'loaded', rows: rows as never[] };
}

const BODY = [weighIn(ago(40), '80'), weighIn(ago(10), '78.4')];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('thrive-trends-group', 'fitness');
  localStorage.setItem('thrive-trends-range', '6M');
  selectedDay.value = null;
  announcement.value = '';
  window.location.hash = '#/trends';
  load(ENTRIES, BODY);
});
afterEach(cleanup);

const card = (c: Element, id: string) => c.querySelector<HTMLElement>(`.trend-card[data-metric="${id}"]`)!;
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('the entries FTP draws', () => {
  it('is one per date (the newest by created), none after today, none blank', () => {
    expect(ftpEntries().map((e) => [e.date, e.watts])).toEqual([
      [ago(200), 212],
      [ago(100), 220],
      [ago(40), 232],
      [ago(10), 250],
    ]);
  });

  it('is empty until the tab has loaded', () => {
    ftpHistory.value = { state: 'loading' };
    expect(ftpEntries()).toEqual([]);
    expect(FTP.points()).toEqual([]);
  });

  it('gives W/kg as the entry over that date first weight, and none on a date with no weight', () => {
    const v = FTP_WKG.heldEntries!().map((e) => [e.date, e.value === null ? null : Number(e.value.toFixed(2))]);
    expect(v).toEqual([
      [ago(200), null],
      [ago(100), null],
      [ago(40), 2.9],
      [ago(10), 3.19],
    ]);
  });
});

describe('Fitness: FTP and FTP per kg', () => {
  it('adds the two cards after Training Load, each with its unit', () => {
    const { container } = renderScreen();
    expect([...container.querySelectorAll('.trend-card')].map((c) => c.getAttribute('data-metric'))).toEqual([
      'vo2max',
      'training_load',
      'ftp',
      'ftp_wkg',
    ]);
    expect(text(card(container, 'ftp').querySelector('h2'))).toBe('FTP W');
    expect(text(card(container, 'ftp_wkg').querySelector('h2'))).toBe('FTP per kg W/kg');
  });

  it('names the chart for its range and reads the summary without a delta', () => {
    const { container } = renderScreen();
    const c = card(container, 'ftp');
    expect(c.querySelector('svg')!.getAttribute('aria-label')).toBe('FTP, last 6 months');
    const summary = text(c.querySelector('.trend-summary'))!;
    expect(summary).toBe(`Current 250 W since ${shortDate(ago(10))} · 3 entries in range`);
    expect(summary).not.toMatch(/[+↑↓▲▼]|up|down|from|vs/);
  });

  it('draws one step line from the range start at the FTP then in effect, with no dot there', () => {
    const { container } = renderScreen();
    const c = card(container, 'ftp');
    const paths = c.querySelectorAll('path.trend-step');
    expect(paths).toHaveLength(1);
    const d = paths[0].getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(1);
    // Three steps (to 220's day is the range start, so: 220 to 232, 232 to 250): two vertical risers.
    expect(d.match(/ L/g)!.length).toBeGreaterThanOrEqual(5);
    // The first point is the range's first day: the leftmost x, no dot at it.
    const first = c.querySelector('svg')!.querySelectorAll('.trend-dot');
    expect([...first].map((x) => x.getAttribute('data-date'))).toEqual([ago(100), ago(40), ago(10)]);
  });

  it('marks a ramp test with a filled dot and a hand-set FTP with a ring, and the legend says both', () => {
    const { container } = renderScreen();
    const c = card(container, 'ftp');
    const dot = (date: string) => c.querySelector<SVGElement>(`.trend-dot[data-date="${date}"]`)!;
    expect(dot(ago(40)).getAttribute('fill')).toBe('var(--chart-line)');
    expect(dot(ago(10)).getAttribute('fill')).toBe('var(--chart-line)');
    expect(dot(ago(100)).classList.contains('trend-dot-hand')).toBe(true);
    expect(dot(ago(100)).getAttribute('fill')).toBe('var(--color-surface)');
    expect(text(c.querySelector('.trend-legend'))).toBe('● Ramp test ○ Set by hand');
  });

  it('names only the dot kinds the range draws', () => {
    localStorage.setItem('thrive-trends-range', '1M');
    const { container } = renderScreen();
    expect(text(card(container, 'ftp').querySelector('.trend-legend'))).toBe('● Ramp test');
  });

  it('draws no average line and no range band, and the Average control changes nothing', () => {
    localStorage.setItem('thrive-trends-average', 'Off');
    const off = renderScreen();
    const dOff = card(off.container, 'ftp').querySelector('path.trend-step')!.getAttribute('d');
    cleanup();
    localStorage.setItem('thrive-trends-average', '30d');
    const on = renderScreen();
    const c = card(on.container, 'ftp');
    expect(c.querySelector('path.trend-step')!.getAttribute('d')).toBe(dOff);
    expect(c.querySelector('.trend-band')).toBeNull();
    expect(c.querySelector('.trend-average')).toBeNull();
  });

  it('draws no average even where entries sit close enough for one to exist', () => {
    load([
      ftp('a', ago(12), '240', 'ramp_test'),
      ftp('b', ago(10), '244', 'manual'),
      ftp('c', ago(8), '248', 'manual'),
    ]);
    localStorage.setItem('thrive-trends-average', '30d');
    const { container } = renderScreen();
    const c = card(container, 'ftp');
    expect(c.querySelector('.trend-average')).toBeNull();
    expect(c.querySelectorAll('path.trend-line')).toHaveLength(1);
  });

  it('lists the entries in the range, newest first, with the source in words', () => {
    const { container } = renderScreen();
    const list = card(container, 'ftp').querySelector('ul.trend-entries')!;
    expect(list.getAttribute('aria-label')).toBe('FTP entries, last 6 months');
    expect([...list.querySelectorAll('li')].map((li) => text(li))).toEqual([
      `${rowDate(ago(10), TODAY)} Ramp test 250 W`,
      `${rowDate(ago(40), TODAY)} Ramp test 232 W`,
      `${rowDate(ago(100), TODAY)} Set by hand 220 W`,
    ]);
  });

  it('shows no list, no dots and no legend when no entry is in the range, but the held line and its summary', () => {
    load([ftp('only', ago(200), '212', 'ramp_test')]);
    const { container } = renderScreen();
    const c = card(container, 'ftp');
    expect(c.querySelector('ul.trend-entries')).toBeNull();
    expect(c.querySelector('.trend-legend')).toBeNull();
    expect(c.querySelectorAll('.trend-dot')).toHaveLength(0);
    expect(c.querySelectorAll('path.trend-step')).toHaveLength(1);
    expect(text(c.querySelector('.trend-summary'))).toBe(
      `Current 212 W since ${sinceDate(ago(200), TODAY)} · No entries in this range`,
    );
  });

  it('says 1 entry for one, and writes the year when the entry is not this year', () => {
    load([ftp('one', ago(400), '200', 'ramp_test'), ftp('two', ago(3), '205', 'manual')]);
    const { container } = renderScreen();
    expect(text(card(container, 'ftp').querySelector('.trend-summary'))).toBe(
      `Current 205 W since ${shortDate(ago(3))} · 1 entry in range`,
    );
    expect(sinceDate('2020-02-03', TODAY)).toBe('Feb 3, 2020');
  });

  it('says there is no FTP yet, on both cards, with no rows, with only future rows, or with no tab', () => {
    for (const rows of [[], [ftp('x', addDays(TODAY, 2), '250', 'ramp_test')], [ftp('b', ago(2), '', 'manual')]]) {
      load(rows);
      const { container, unmount } = renderScreen();
      for (const id of ['ftp', 'ftp_wkg']) {
        expect(text(card(container, id).querySelector('.trend-empty'))).toBe(
          'No FTP yet. A ramp test in Thrive Spin adds one.',
        );
        expect(card(container, id).querySelector('svg')).toBeNull();
      }
      unmount();
    }
  });
});

describe('FTP per kg', () => {
  it('shows the value to two decimals, breaks the line where an entry has no weight, and has no dot there', () => {
    const { container } = renderScreen();
    const c = card(container, 'ftp_wkg');
    expect(text(c.querySelector('.trend-summary'))).toBe(
      `Current 3.19 W/kg since ${shortDate(ago(10))} · 3 entries in range`,
    );
    // Entries on weighed days only.
    expect([...c.querySelectorAll('.trend-dot')].map((x) => x.getAttribute('data-date'))).toEqual([ago(40), ago(10)]);
    // The line is one run, from the weighed entry; nothing is drawn across the days with none.
    expect(c.querySelectorAll('path.trend-step')).toHaveLength(1);
  });

  it('lists a no-weight entry with a dash and says so', () => {
    const { container } = renderScreen();
    const rows = [...card(container, 'ftp_wkg').querySelectorAll('ul.trend-entries li')].map((li) => text(li));
    expect(rows).toEqual([
      `${rowDate(ago(10), TODAY)} Ramp test 3.19 W/kg`,
      `${rowDate(ago(40), TODAY)} Ramp test 2.90 W/kg`,
      `${rowDate(ago(100), TODAY)} No weight that day —`,
    ]);
  });

  it('says it needs a weigh-in when FTP exists but no entry day has a weight', () => {
    load(ENTRIES, []);
    const { container } = renderScreen();
    expect(text(card(container, 'ftp_wkg').querySelector('.trend-empty'))).toBe(
      'No FTP per kg yet. It needs a weigh-in on the day of an FTP entry.',
    );
    expect(card(container, 'ftp').querySelector('svg')).not.toBeNull();
  });

  it('says there is no weight that day when the current entry has none', () => {
    load([ftp('a', ago(5), '250', 'ramp_test')], [weighIn(ago(1), '80')]);
    const { container } = renderScreen();
    expect(text(card(container, 'ftp_wkg').querySelector('.trend-empty'))).toBe(
      'No FTP per kg yet. It needs a weigh-in on the day of an FTP entry.',
    );
    load([ftp('a', ago(60), '250', 'ramp_test'), ftp('b', ago(5), '260', 'manual')], [weighIn(ago(60), '80')]);
    cleanup();
    const again = renderScreen();
    expect(text(card(again.container, 'ftp_wkg').querySelector('.trend-summary'))).toBe(
      `Current — since ${shortDate(ago(5))} · no weight that day`,
    );
  });
});

describe('the readout and the table', () => {
  const readout = (c: Element, id: string) => text(card(c, id).querySelector('.trend-readout-value'));

  it('shows the FTP in effect on a selected day: the source on an entry day, since otherwise', async () => {
    const { container } = renderScreen();
    selectedDay.value = ago(10);
    await Promise.resolve();
    expect(readout(container, 'ftp')).toBe('250 W · ramp test');
    selectedDay.value = ago(5);
    await Promise.resolve();
    expect(readout(container, 'ftp')).toBe(`250 W · since ${shortDate(ago(10))}`);
    selectedDay.value = ago(100);
    await Promise.resolve();
    expect(readout(container, 'ftp')).toBe('220 W · set by hand');
    expect(readout(container, 'ftp_wkg')).toBe('— · no weight that day');
  });

  it('marks the selected day on the step line, a ring on a hand-set entry', async () => {
    const { container } = renderScreen();
    selectedDay.value = ago(100);
    await Promise.resolve();
    expect(card(container, 'ftp').querySelector('.trend-marker-partial')).not.toBeNull();
    selectedDay.value = ago(5);
    await Promise.resolve();
    const m = card(container, 'ftp').querySelector('.trend-marker')!;
    expect(m).not.toBeNull();
    expect(m.classList.contains('trend-marker-partial')).toBe(false);
  });

  it('puts the same values in the table: the value in effect every day, the source on entry days, no average column', () => {
    localStorage.setItem('thrive-trends-view', 'Table');
    localStorage.setItem('thrive-trends-average', 'Off');
    const { container } = renderScreen();
    const heads = [...container.querySelectorAll('thead th')].map((th) => text(th));
    expect(heads).toEqual(
      ['Date', 'VO2max (mL/kg/min)', 'Training Load', 'FTP (W)', 'FTP per kg (W/kg)'].map((x) => x),
    );
    const row = (date: string) =>
      [...container.querySelectorAll('tbody tr')].find((tr) =>
        text(tr.querySelector('th'))!.startsWith(rowDate(date, TODAY)),
      )!;
    const cells = (date: string) => [...row(date).querySelectorAll('td')].map((td) => text(td));
    expect(cells(ago(10))).toEqual(['—', '—', '250 ramp test', '3.19 ramp test']);
    expect(cells(ago(5))).toEqual(['—', '—', '250', '3.19']);
    expect(cells(ago(100))).toEqual(['—', '—', '220 set by hand', '— no weight that day']);
  });

  it('keeps the average column off the FTP columns when the average is on', () => {
    localStorage.setItem('thrive-trends-view', 'Table');
    localStorage.setItem('thrive-trends-average', '7d');
    const { container } = renderScreen();
    const heads = [...container.querySelectorAll('thead th')].map((th) => text(th));
    expect(heads.filter((x) => x === '7-day avg')).toHaveLength(2);
    expect(heads.indexOf('FTP (W)') + 1).toBe(heads.indexOf('FTP per kg (W/kg)'));
  });

  it('announces the day by keyboard with the same words', () => {
    const { container } = renderScreen();
    const charts = container.querySelector<HTMLElement>('.trend-charts')!;
    charts.focus();
    fireEvent.keyDown(charts, { key: 'End' });
    expect(announcement.value).toContain('FTP 250 W');
  });
});
