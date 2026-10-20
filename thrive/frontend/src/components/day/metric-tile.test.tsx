// #491 — the metric tiles: resting HR, HRV and average stress.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

vi.mock('../../state/actions', () => ({ loadHealth: vi.fn(async () => {}) }));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import { VitalsTiles, lineGeometry, rangeScale, LINE_W } from './metric-tile';
import { SleepCard } from './sleep-card';
import { GlanceRow } from './glance-row';
import { SLOTS, slotsFor } from './slots';
import { dailyHealth } from '../../state/store';
import { DAILY_HEALTH_FIELDS, type DailyHealthRow } from '../../api/health-api';
import { addDays, type DayState } from '../../day/dates';
import { readGlobalCss } from '../../test-css';

afterEach(cleanup);
beforeEach(() => {
  dailyHealth.value = { state: 'idle' };
});

const D = '2026-09-26';
const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };

function hr(date: string, over: Partial<Record<string, string>> = {}): DailyHealthRow {
  const r = { sheetRow: 2 } as DailyHealthRow;
  for (const f of DAILY_HEALTH_FIELDS) (r as unknown as Record<string, string>)[f] = '';
  return { ...r, date, ...over } as DailyHealthRow;
}

/** 20 days before D: resting HR 49/55, HRV 41/50, stress 20/30 alternating. */
const HISTORY = Array.from({ length: 20 }, (_, i) =>
  hr(addDays(D, -(i + 1)), {
    resting_hr: i % 2 ? '49' : '55',
    hrv: i % 2 ? '41' : '50',
    stress_avg: i % 2 ? '20' : '30',
  }),
);

function mount(rows: DailyHealthRow[], state: DayState = 'past') {
  dailyHealth.value = { state: 'loaded', rows };
  return render(
    <AuthContext.Provider value={AUTH}>
      <VitalsTiles date={D} state={state} today={state === 'today' ? D : '2026-09-30'} />
    </AuthContext.Provider>,
  );
}

const tile = (c: Element, key: string) => c.querySelector(`[data-metric="${key}"]`)!;
const caption = (c: Element, key: string) => tile(c, key).querySelector('.tile-caption')!.textContent;

describe('slot', () => {
  it('is the vitals slot, after sleep and the drinks cards, and never mounts on a future day', () => {
    expect(SLOTS.vitals).toBe(VitalsTiles);
    expect(slotsFor('past').indexOf('vitals')).toBe(slotsFor('past').indexOf('drinks') + 1);
    expect(slotsFor('today')).toContain('vitals');
    expect(slotsFor('future')).not.toContain('vitals');
  });

  it('lays the tiles out two to a row', () => {
    const css = readGlobalCss();
    expect(css).toMatch(/\.vitals\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.vitals\s*\{[^}]*gap:\s*var\(--day-gap\)/);
  });
});

describe('AC1 — the 14-day line', () => {
  it('breaks at each blank day: one path per run, a dot for a lone value, never a zero', () => {
    const g = lineGeometry([50, 52, null, 51, null, 49, 53]);
    expect(g.runs).toHaveLength(2);
    expect(g.runs[0].split(/[ML]/).filter(Boolean)).toHaveLength(2);
    // The lone 51 and the viewed day's point.
    expect(g.dots).toHaveLength(2);
    expect(g.dots[1][0]).toBe(LINE_W);
    // No point is drawn at a blank's x.
    const xs = [...g.runs.join(' ').matchAll(/[ML]([\d.]+)/g)].map((m) => Number(m[1]));
    const step = LINE_W / 6;
    for (const i of [2, 4]) expect(xs.some((x) => Math.abs(x - i * step) < 0.2)).toBe(false);
  });

  it('draws nothing at the end when the viewed day is blank, and nothing at all with no values', () => {
    expect(lineGeometry([50, 52, null]).dots).toEqual([]);
    expect(lineGeometry([null, null])).toEqual({ runs: [], dots: [] });
  });

  it('scales to the values with 10% padding, at least 1 unit, so a flat fortnight is a flat line', () => {
    const flat = lineGeometry([52, 52, 52]);
    expect(flat.runs[0]).toBe('M0 16 L70 16 L140 16');
  });

  it('draws the last 14 days, aria-hidden, with the tile text carrying value and range', () => {
    const { container } = mount([...HISTORY, hr(D, { resting_hr: '52', hrv: '45', stress_avg: '25' })]);
    const svg = tile(container, 'resting_hr').querySelector('svg.tile-line')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('.tile-line-run')).toHaveLength(1);
    expect(svg.querySelector('.tile-line-run')!.getAttribute('d')!.match(/[ML]/g)).toHaveLength(14);
    expect(tile(container, 'resting_hr').querySelector('.tile-value')!.textContent).toBe('52 bpm');
    expect(caption(container, 'resting_hr')).toBe('49–55 · in range');
  });
});

describe('AC2 — the range bar', () => {
  it('puts the band at the bounds and the marker at the value on one scale', () => {
    // lo 49, hi 55: 15% of 6 is 0.9, under the 1-unit floor, so the scale is 48 … 56.
    const s = rangeScale(49, 55, 52);
    expect(s.band).toEqual([12.5, 87.5]);
    expect(s.marker).toBe(50);
  });

  it('keeps a value beyond the range on the bar, and pins it to the end', () => {
    const s = rangeScale(49, 55, 200);
    expect(s.marker).toBeLessThanOrEqual(100);
    expect(s.marker).toBeGreaterThan(s.band[1]);
    expect(rangeScale(49, 55, -1000).marker).toBeGreaterThanOrEqual(0);
  });

  it('draws the displayed numbers the caption prints', () => {
    const { container } = mount([...HISTORY, hr(D, { resting_hr: '52', hrv: '45', stress_avg: '25' })]);
    const bar = tile(container, 'resting_hr').querySelector('.tile-range')!;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    const band = bar.querySelector<HTMLElement>('.tile-range-band')!;
    expect([band.style.left, band.style.width]).toEqual(['12.5%', '75%']);
    expect(bar.querySelector<HTMLElement>('.tile-range-marker')!.style.left).toBe('50%');
    // Stress has bars, not a range bar.
    expect(tile(container, 'stress').querySelector('.tile-range')).toBeNull();
  });
});

describe('AC3 — the caption agrees with the numbers', () => {
  it('rounds the value and bounds before comparing, as rangeCaption does', () => {
    // 49.4 / 55.4: the range displays as 49–55; 55.3 displays as 55, so within.
    const hist = Array.from({ length: 20 }, (_, i) =>
      hr(addDays(D, -(i + 1)), { resting_hr: i % 2 ? '49.4' : '55.4' }),
    );
    const within = mount([...hist, hr(D, { resting_hr: '55.3' })]).container;
    expect(tile(within, 'resting_hr').querySelector('.tile-value')!.textContent).toBe('55 bpm');
    expect(caption(within, 'resting_hr')).toBe('49–55 · in range');
    cleanup();
    const above = mount([...hist, hr(D, { resting_hr: '55.6' })]).container;
    expect(caption(above, 'resting_hr')).toBe('49–55 · ↑ above');
  });
});

describe('AC4 — the unwelcome direction', () => {
  it('above for resting HR and below for HRV: arrow, word and --color-warning; the other side plain', () => {
    const { container } = mount([...HISTORY, hr(D, { resting_hr: '60', hrv: '30', stress_avg: '10' })]);
    for (const key of ['resting_hr', 'hrv']) {
      const att = tile(container, key).querySelector('.tile-attention')!;
      expect(att.textContent).toBe(key === 'hrv' ? '↓ below' : '↑ above');
      expect(att.querySelector('[aria-hidden="true"]')!.textContent).toMatch(/^[↑↓] $/);
      expect(tile(container, key).querySelector('.tile-range-attention')).not.toBeNull();
    }
    // Stress below range is the welcome side.
    expect(caption(container, 'stress')).toBe('20–30 · ↓ below');
    expect(tile(container, 'stress').querySelector('.tile-attention')).toBeNull();
    cleanup();
    const welcome = mount([...HISTORY, hr(D, { resting_hr: '40', hrv: '60' })]).container;
    expect(caption(welcome, 'resting_hr')).toBe('49–55 · ↓ below');
    expect(caption(welcome, 'hrv')).toBe('41–50 · ↑ above');
    expect(welcome.querySelector('.tile-attention')).toBeNull();
    expect(welcome.querySelector('.tile-range-attention')).toBeNull();
  });

  it('colours attention --color-warning and bold, and the caption --color-text-secondary', () => {
    const css = readGlobalCss();
    expect(css).toMatch(/\.tile-attention\s*\{[^}]*font-weight:\s*700;[^}]*color:\s*var\(--color-warning\)/);
    expect(css).toMatch(/\.tile-caption\s*\{[^}]*color:\s*var\(--color-text-secondary\)/);
    expect(css).toMatch(/\.tile-range-attention\s*\{[^}]*background:\s*var\(--color-warning\)/);
  });
});

describe('AC5 — building a range', () => {
  it('draws no range bar and says how many days so far', () => {
    const { container } = mount([...HISTORY.slice(0, 9), hr(D, { resting_hr: '52', hrv: '45' })]);
    expect(container.querySelector('.tile-range')).toBeNull();
    expect(caption(container, 'resting_hr')).toBe('Building your range — 9 of 14 days so far');
  });
});

describe('AC6 — stress', () => {
  it('draws seven bars named by their values, the viewed day in the metric colour', () => {
    const rows = [...HISTORY.filter((r) => r.date !== addDays(D, -3)), hr(addDays(D, -3)), hr(D, { stress_avg: '31' })];
    const { container } = mount(rows);
    const bars = tile(container, 'stress').querySelector('.tile-bars')!;
    expect(bars.getAttribute('role')).toBe('img');
    expect(bars.getAttribute('aria-label')).toBe('Average stress, last 7 days: 20, 30, 20, no data, 20, 30, 31');
    expect(bars.querySelectorAll('.tile-bar-slot')).toHaveLength(7);
    expect(bars.querySelectorAll('.tile-bar')).toHaveLength(6);
    expect(bars.querySelectorAll('.tile-bar-viewed')).toHaveLength(1);
    expect(bars.lastElementChild!.querySelector('.tile-bar-viewed')).not.toBeNull();
    expect(bars.querySelector<HTMLElement>('.tile-bar-viewed')!.style.height).toBe('51.7%');
  });

  it('on today reads "31 so far" and "Last 7 days"', () => {
    const { container } = mount([...HISTORY, hr(D, { stress_avg: '31' })], 'today');
    expect(tile(container, 'stress').querySelector('.tile-value')!.textContent).toBe('31 so far');
    expect(caption(container, 'stress')).toBe('Last 7 days');
  });
});

describe('AC7 — a blank value', () => {
  it('shows "—" and why, and the chart still draws the other days', () => {
    const past = mount([...HISTORY, hr(D, { resting_hr: '52' })]).container;
    const hrv = tile(past, 'hrv');
    expect(hrv.querySelector('.tile-value')!.textContent).toBe('—');
    expect(caption(past, 'hrv')).toBe('No reading this day.');
    expect(hrv.querySelector('.tile-line-run')).not.toBeNull();
    expect(hrv.querySelector('.tile-range')).toBeNull();
    expect(caption(past, 'stress')).toBe('No reading this day.');
    expect(tile(past, 'stress').querySelectorAll('.tile-bar')).toHaveLength(6);
    cleanup();
    const today = mount([...HISTORY, hr(D, { resting_hr: '52' })], 'today').container;
    expect(caption(today, 'hrv')).toBe('Arrives with the next sync.');
  });
});

describe('AC8 — no row for the day', () => {
  it('shows the note once in place of the tiles', () => {
    const past = mount(HISTORY).container;
    expect(past.querySelectorAll('section')).toHaveLength(1);
    expect(past.querySelector('h2')!.textContent).toBe('Health');
    expect(past.querySelector('.panel-note')!.textContent).toBe('No watch data for this day.');
    expect(past.querySelector('.metric-tile')).toBeNull();
    cleanup();
    const today = mount(HISTORY, 'today').container;
    expect(today.querySelector('.day-panel-sub')!.textContent).toBe('Not synced yet today');
    expect(today.querySelectorAll('.panel-note')).toHaveLength(1);
  });
});

describe('AC9 — structure, loading and Try again', () => {
  it('makes each tile a section labelled by its h2', () => {
    const { container } = mount([...HISTORY, hr(D, { resting_hr: '52', hrv: '45', stress_avg: '25' })]);
    const sections = [...container.querySelectorAll('section')];
    expect(sections).toHaveLength(3);
    for (const s of sections) {
      const h2 = s.querySelector('h2')!;
      expect(s.getAttribute('aria-labelledby')).toBe(h2.id);
    }
    expect(sections.map((s) => s.querySelector('h2')!.textContent)).toEqual(['Resting HR', 'HRV', 'Average stress']);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('says loading and failure once for the glance row, the sleep card and the tiles', () => {
    for (const state of ['loading', 'error'] as const) {
      dailyHealth.value = { state } as never;
      const { container } = render(
        <AuthContext.Provider value={AUTH}>
          <GlanceRow date={D} state="past" today="2026-09-30" />
          <SleepCard date={D} state="past" today="2026-09-30" />
          <VitalsTiles date={D} state="past" today="2026-09-30" />
        </AuthContext.Provider>,
      );
      expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(container.querySelectorAll('.panel-retry')).toHaveLength(state === 'error' ? 1 : 0);
      expect(container.querySelector('h2')!.textContent).toBe('Health');
      cleanup();
    }
  });
});
