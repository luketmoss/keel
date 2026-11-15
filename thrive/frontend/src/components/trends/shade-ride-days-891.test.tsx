// #891 — Custom's Shade ride days: the toggle, the bands, the words, the wait on DailySummary.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../state/actions', () => ({ loadHealth: async () => {} }));

import { TrendsScreen, selectedDay, announcement, captionText } from './trends-screen';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary } from '../../state/store';
import { addDays, todayInDenver } from '../../day/dates';
import { announceText } from './readout';
import { SHADE_PREF, readPref } from './prefs';

const TODAY = todayInDenver();
const ago = (n: number) => addDays(TODAY, -n);

function renderScreen() {
  return render(
    h(AuthContext.Provider, {
      value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

const hr = Array.from({ length: 20 }, (_, i) => ({
  date: ago(i),
  resting_hr: String(50 + i),
  sleep_score: String(70 + i),
  sheetRow: i + 2,
})) as never[];

const summary = (rows: { date: string; activity_types: string }[]) =>
  rows.map((r, i) => ({ ...r, sheetRow: i + 2 })) as never[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('thrive-trends-group', 'custom');
  localStorage.setItem('thrive-trends-custom', JSON.stringify(['resting_hr']));
  localStorage.setItem('thrive-trends-range', '1M');
  dailyHealth.value = { state: 'loaded', rows: hr };
  bodyMeasurements.value = { state: 'loaded', rows: [] };
  dailySummary.value = {
    state: 'loaded',
    rows: summary([
      { date: ago(3), activity_types: 'bike:road' },
      { date: ago(4), activity_types: 'bike:indoor,weight' },
      { date: ago(5), activity_types: 'weight' },
      { date: ago(40), activity_types: 'bike' },
    ]),
  };
  selectedDay.value = null;
  announcement.value = '';
});
afterEach(cleanup);

const chip = (c: Element) => c.querySelector<HTMLButtonElement>('.trends-shade');
const bands = (c: Element) => [...c.querySelectorAll('.trend-ride-day')].map((e) => e.getAttribute('data-date'));

describe('the toggle', () => {
  it('is a pressed-state chip after Edit metrics, Off the first time, with no tick and no bands', () => {
    const { container } = renderScreen();
    const b = chip(container)!;
    expect(b.textContent).toBe('Shade ride days');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.previousElementSibling?.textContent).toBe('Edit metrics');
    expect(container.querySelector('.trend-ride-day')).toBeNull();
    expect(container.querySelector('.trends-caption')!.textContent).not.toMatch(/ride/i);
  });

  it('turns on with a tick, remembers it, and a remount starts On', () => {
    const a = renderScreen();
    fireEvent.click(chip(a.container)!);
    expect(chip(a.container)!.getAttribute('aria-pressed')).toBe('true');
    expect(chip(a.container)!.querySelector('.chip-check')?.getAttribute('aria-hidden')).toBe('true');
    expect(localStorage.getItem('thrive-trends-shade')).toBe('on');
    cleanup();
    const b = renderScreen();
    expect(chip(b.container)!.getAttribute('aria-pressed')).toBe('true');
    expect(bands(b.container).length).toBeGreaterThan(0);
  });

  it('works for the visit when storage is blocked, and reads Off', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { container } = renderScreen();
    fireEvent.click(chip(container)!);
    expect(chip(container)!.getAttribute('aria-pressed')).toBe('true');
    setItem.mockRestore();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPref(SHADE_PREF)).toBe('off');
    getItem.mockRestore();
  });

  it('is absent in other groups, in the Table view, and with no metric picked', () => {
    localStorage.setItem('thrive-trends-group', 'body');
    const a = renderScreen();
    expect(chip(a.container)).toBeNull();
    cleanup();
    localStorage.setItem('thrive-trends-group', 'custom');
    localStorage.setItem('thrive-trends-view', 'Table');
    const b = renderScreen();
    expect(chip(b.container)).toBeNull();
    cleanup();
    localStorage.setItem('thrive-trends-view', 'Chart');
    localStorage.setItem('thrive-trends-custom', '[]');
    const c = renderScreen();
    expect(chip(c.container)).toBeNull();
  });

  it('no other group is shaded even when the choice is On', () => {
    localStorage.setItem('thrive-trends-shade', 'on');
    localStorage.setItem('thrive-trends-group', 'body');
    const { container } = renderScreen();
    expect(container.querySelector('.trend-ride-day')).toBeNull();
    expect(container.querySelector('.trends-caption')!.textContent).not.toMatch(/ride/i);
  });
});

describe('the bands', () => {
  beforeEach(() => localStorage.setItem('thrive-trends-shade', 'on'));

  it('shade exactly the ride days in range, behind the grid, over the full plot height, in one x on every card', () => {
    localStorage.setItem('thrive-trends-custom', JSON.stringify(['resting_hr', 'sleep_score']));
    const { container } = renderScreen();
    const cards = [...container.querySelectorAll('.trend-card')];
    expect(cards).toHaveLength(2);
    const per = cards.map((c) => bands(c).sort());
    expect(per[0]).toEqual([ago(4), ago(3)].sort());
    expect(per[1]).toEqual(per[0]);
    // Days with only a lift, with no row, and the ride outside the 1M range have none.
    expect(bands(container)).not.toContain(ago(5));
    expect(bands(container)).not.toContain(ago(2));
    expect(bands(container)).not.toContain(ago(40));
    const xs = cards.map((c) => [...c.querySelectorAll('.trend-ride-day')].map((r) => r.getAttribute('x')));
    expect(xs[1]).toEqual(xs[0]);
    const svg = cards[0].querySelector('svg')!;
    const group = svg.querySelector('.trend-ride-days')!;
    expect(group.getAttribute('pointer-events')).toBe('none');
    const before = (sel: string) =>
      group.compareDocumentPosition(svg.querySelector(sel)!) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(before('.trend-grid')).toBeTruthy();
    expect(before('.trend-dots')).toBeTruthy();
    const r = group.querySelector('rect')!;
    expect(Number(r.getAttribute('height'))).toBeGreaterThan(100);
    expect(r.getAttribute('fill')).toBe('var(--trend-ride-shade)');
  });

  it('adjacent ride days touch', () => {
    const { container } = renderScreen();
    const rs = [...container.querySelectorAll('.trend-ride-day')].map((r) => ({
      x: Number(r.getAttribute('x')),
      w: Number(r.getAttribute('width')),
    }));
    rs.sort((a, b) => a.x - b.x);
    expect(rs[0].x + rs[0].w).toBeCloseTo(rs[1].x, 5);
  });

  it('say so in the caption, or that the range has none', () => {
    const a = renderScreen();
    expect(a.container.querySelector('.trends-caption')!.textContent).toMatch(/Shaded days had a ride\.$/);
    cleanup();
    dailySummary.value = { state: 'loaded', rows: summary([{ date: ago(5), activity_types: 'weight' }]) };
    const b = renderScreen();
    expect(b.container.querySelector('.trends-caption')!.textContent).toMatch(/No rides in this range\.$/);
    expect(b.container.querySelector('.trend-ride-day')).toBeNull();
  });

  it('say ride day in a selected ride day readout and keyboard status, and nothing on another day', () => {
    const keys = (c: Element, n: number) => {
      const charts = c.querySelector('.trend-charts')!;
      for (let k = 0; k < n; k++) fireEvent.keyDown(charts, { key: 'ArrowLeft' });
    };
    // ArrowLeft from nothing selects today; three more reach ago(3).
    const a = renderScreen();
    keys(a.container, 4);
    expect(selectedDay.value).toBe(ago(3));
    expect(a.container.querySelector('.trend-readout-date')!.textContent).toMatch(/ · ride day$/);
    expect(announcement.value).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+\. Ride day\./);
    cleanup();
    const b = renderScreen();
    keys(b.container, 6);
    expect(selectedDay.value).toBe(ago(5));
    expect(b.container.querySelector('.trend-readout-date')!.textContent).not.toMatch(/ride/i);
    expect(announcement.value).not.toMatch(/ride day/i);
  });

  it('keep their state through a selected day, with no change to the stored choice', () => {
    const { container } = renderScreen();
    fireEvent.keyDown(container.querySelector('.trend-charts')!, { key: 'ArrowLeft' });
    expect(chip(container)!.getAttribute('aria-pressed')).toBe('true');
    expect(bands(container).length).toBe(2);
    expect(localStorage.getItem('thrive-trends-shade')).toBe('on');
  });
});

describe('announcements and captions', () => {
  it('announce a ride day second, and nothing extra otherwise', () => {
    const rides = new Set(['2026-09-26']);
    expect(announceText('2026-09-26', '2026-09-30', [], 7, rides)).toMatch(/^Sat, Sep 26\. Ride day\./);
    expect(announceText('2026-09-25', '2026-09-30', [], 7, rides)).not.toMatch(/ride/i);
    expect(announceText('2026-09-26', '2026-09-30', [], 7)).not.toMatch(/ride/i);
  });

  it('captionText adds the ride sentence only when asked', () => {
    expect(captionText(7, false)).not.toMatch(/ride/i);
    expect(captionText(7, false, false, 'some')).toMatch(/ Shaded days had a ride\.$/);
    expect(captionText(7, false, false, 'none')).toMatch(/ No rides in this range\.$/);
  });
});

describe('waiting on DailySummary', () => {
  it('Off, a set that does not read it does not wait', () => {
    dailySummary.value = { state: 'loading' };
    const { container } = renderScreen();
    expect(container.querySelector('.trends-loading')).toBeNull();
    expect(container.querySelector('.trend-card')).not.toBeNull();
  });

  it('On, it shows Loading while it loads and the error state if it fails', () => {
    localStorage.setItem('thrive-trends-shade', 'on');
    dailySummary.value = { state: 'loading' };
    const a = renderScreen();
    expect(a.container.querySelector('.trends-loading')).not.toBeNull();
    expect(chip(a.container)).not.toBeNull();
    cleanup();
    dailySummary.value = { state: 'error', message: 'x' } as never;
    const b = renderScreen();
    expect(b.container.querySelector('.trends-error')!.textContent).toMatch(/Couldn't load your health data\./);
  });
});
