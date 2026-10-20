// #504 — Trends opened by a Day card: `#/trends/<group>?date=<day>` shows that group,
// stores it as the remembered one, and selects the day on the charts.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { h } from 'preact';
import { act } from 'preact/test-utils';

vi.mock('../../state/actions', () => ({ loadHealth: async () => {} }));

import { TrendsScreen, selectedDay } from './trends-screen';
import { AuthContext } from '../../auth/auth-context';
import { dailyHealth, bodyMeasurements, dailySummary } from '../../state/store';
import { replaceRoute } from '../../router/router';
import { addDays, todayInDenver } from '../../day/dates';
import { pickRange } from './toolbar-test-utils';

const TODAY = todayInDenver();

function dailyRows(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      date: addDays(TODAY, -i),
      resting_hr: String(50 + (i % 5)),
      hrv: String(60 + (i % 7)),
      stress_avg: String(25 + (i % 6)),
      steps: String(4000 + i * 10),
      sheetRow: i + 2,
    });
  }
  return out as never[];
}

function renderScreen() {
  return render(
    h(AuthContext.Provider, {
      value: { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} },
      children: h(TrendsScreen, {}),
    }),
  );
}

/** Arrive on `#/trends…` as a Day card's link does. */
function arriveAt(path: string) {
  act(() => {
    window.history.replaceState(null, '', '#/day');
    replaceRoute(path);
  });
}

const active = (c: Element) => c.querySelector('.trends-group-btn.active')!.textContent;
const day = (n: number) => addDays(TODAY, -n);

beforeEach(() => {
  localStorage.clear();
  dailyHealth.value = { state: 'loaded', rows: dailyRows(120) };
  bodyMeasurements.value = { state: 'loaded', rows: [] };
  dailySummary.value = { state: 'loaded', rows: [] };
  selectedDay.value = null;
});
afterEach(() => {
  cleanup();
  act(() => {
    replaceRoute('/trends');
  });
});

describe('the group', () => {
  it.each([
    ['recovery', 'Recovery'],
    ['sleep', 'Sleep'],
    ['activity', 'Activity'],
    ['body', 'Body'],
    ['blood_pressure', 'Blood Pressure'],
  ])('opens on %s', (id, label) => {
    arriveAt(`/trends/${id}?date=${day(3)}`);
    const { container } = renderScreen();
    expect(active(container)).toBe(label);
  });

  it('beats the remembered group, and becomes the remembered one', () => {
    localStorage.setItem('thrive-trends-group', 'sleep');
    arriveAt(`/trends/body?date=${day(3)}`);
    const { container } = renderScreen();
    expect(active(container)).toBe('Body');
    expect(localStorage.getItem('thrive-trends-group')).toBe('body');
  });

  it('keeps the remembered range, average and view', () => {
    localStorage.setItem('thrive-trends-range', '1M');
    localStorage.setItem('thrive-trends-average', '14d');
    localStorage.setItem('thrive-trends-view', 'Table');
    arriveAt(`/trends/recovery?date=${day(3)}`);
    const { container } = renderScreen();
    expect(container.querySelector('[aria-label="Range: 1M"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Average: 14-day"]')).not.toBeNull();
    expect(container.querySelector('.trend-table')).not.toBeNull();
    expect(localStorage.getItem('thrive-trends-range')).toBe('1M');
  });

  it('a plain #/trends still opens on the remembered group', () => {
    localStorage.setItem('thrive-trends-group', 'sleep');
    arriveAt('/trends');
    const { container } = renderScreen();
    expect(active(container)).toBe('Sleep');
  });

  it('is not changed back by switching tabs afterwards', () => {
    arriveAt(`/trends/body?date=${day(3)}`);
    const { container } = renderScreen();
    fireEvent.click([...container.querySelectorAll('.trends-group-btn')].find((b) => b.textContent === 'Sleep')!);
    expect(active(container)).toBe('Sleep');
    expect(localStorage.getItem('thrive-trends-group')).toBe('sleep');
  });
});

describe('the day', () => {
  it('is selected, with the usual readout and Open day link', () => {
    arriveAt(`/trends/recovery?date=${day(3)}`);
    const { container } = renderScreen();
    expect(selectedDay.value).toBe(day(3));
    expect(container.querySelector('.trend-open-day')).not.toBeNull();
  });

  it('is selected in Activity for a past day', () => {
    arriveAt(`/trends/activity?date=${day(3)}`);
    renderScreen();
    expect(selectedDay.value).toBe(day(3));
  });

  it('selects nothing for today in Activity, where Steps does not plot today', () => {
    arriveAt(`/trends/activity?date=${TODAY}`);
    const { container } = renderScreen();
    expect(selectedDay.value).toBeNull();
    expect(active(container)).toBe('Activity');
  });

  it('selects today in a group that plots it', () => {
    arriveAt(`/trends/recovery?date=${TODAY}`);
    renderScreen();
    expect(selectedDay.value).toBe(TODAY);
  });

  it('selects nothing outside the plotted range', () => {
    localStorage.setItem('thrive-trends-range', '1W');
    arriveAt(`/trends/recovery?date=${day(30)}`);
    const { container } = renderScreen();
    expect(selectedDay.value).toBeNull();
    expect(active(container)).toBe('Recovery');
  });

  it('selects nothing for a future date, a bad date, or none', () => {
    for (const q of [`?date=${addDays(TODAY, 2)}`, '?date=2026-02-31', '?date=nonsense', '']) {
      arriveAt(`/trends/recovery${q}`);
      const { container, unmount } = renderScreen();
      expect(selectedDay.value, q).toBeNull();
      expect(active(container), q).toBe('Recovery');
      unmount();
    }
  });

  it('waits for the data, then selects', () => {
    dailyHealth.value = { state: 'loading' };
    arriveAt(`/trends/recovery?date=${day(3)}`);
    const { container } = renderScreen();
    expect(container.querySelector('.trends-loading')).not.toBeNull();
    expect(selectedDay.value).toBeNull();
    act(() => {
      dailyHealth.value = { state: 'loaded', rows: dailyRows(120) };
    });
    expect(selectedDay.value).toBe(day(3));
  });

  it('does not bring the day back once a control has cleared it', () => {
    arriveAt(`/trends/recovery?date=${day(3)}`);
    const { container } = renderScreen();
    expect(selectedDay.value).toBe(day(3));
    pickRange(container, '1M');
    expect(selectedDay.value).toBeNull();
  });
});
