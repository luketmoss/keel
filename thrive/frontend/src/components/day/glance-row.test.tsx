// #488 — the glance row: steps, recovery ring, calories.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { GlanceRow } from './glance-row';
import { SLOTS, slotsFor } from './slots';
import { dailyHealth } from '../../state/store';
import { DAILY_HEALTH_FIELDS, type DailyHealthRow } from '../../api/health-api';
import type { DayState } from '../../day/dates';

afterEach(cleanup);
beforeEach(() => {
  dailyHealth.value = { state: 'idle' };
});

const D = '2026-09-26';

function hr(date: string, over: Partial<Record<string, string>> = {}): DailyHealthRow {
  const r = { sheetRow: 2 } as DailyHealthRow;
  for (const f of DAILY_HEALTH_FIELDS) (r as unknown as Record<string, string>)[f] = '';
  return { ...r, date, ...over } as DailyHealthRow;
}

function mount(state: DayState, date = D) {
  return render(<GlanceRow date={date} state={state} today={state === 'today' ? date : '2026-09-30'} />);
}

const set = (...rows: DailyHealthRow[]) => {
  dailyHealth.value = { state: 'loaded', rows };
};

describe('AC1 — today with a recovery value', () => {
  it('shows steps, a ring named "Recovery 76%", and calories', () => {
    set(hr(D, { steps: '4450', calories: '1820', recovery: '76' }));
    const { container } = mount('today');
    const section = container.querySelector('section[aria-label="Day at a glance"]')!;
    expect(section).not.toBeNull();
    const ring = section.querySelector('[role="img"]')!;
    expect(ring.getAttribute('aria-label')).toBe('Recovery 76%');
    expect(ring.querySelector('.glance-ring-value')!.getAttribute('stroke-dasharray')).toBe('76 100');
    expect(ring.querySelector('.glance-ring-text')!.getAttribute('aria-hidden')).toBe('true');
    const stats = [...section.querySelectorAll('.glance-stat')].map((s) => s.textContent);
    expect(stats).toEqual(['4,450steps so farSteps 4,450 so far. Open Activity trends', '1,820kcal so far']);
    expect(section.className).not.toContain('glance-row-two');
  });

  it('clamps the arc for a value outside 0–100 but names it as stored', () => {
    set(hr(D, { steps: '1', calories: '1', recovery: '130' }));
    const { container } = mount('today');
    expect(container.querySelector('.glance-ring-value')!.getAttribute('stroke-dasharray')).toBe('100 100');
    expect(container.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Recovery 130%');
  });
});

describe('AC2 — no ring', () => {
  it('has no ring and no "Recovery" word on today without a recovery value', () => {
    set(hr(D, { steps: '4450', calories: '1820' }));
    const { container } = mount('today');
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.textContent).not.toMatch(/recovery/i);
    expect(container.querySelectorAll('.glance-stat')).toHaveLength(2);
    expect(container.querySelector('.glance-row-two')).not.toBeNull();
  });

  it('has no ring on a past day, whatever the row holds', () => {
    set(hr(D, { steps: '9000', calories: '2100', recovery: '76' }));
    const { container } = mount('past');
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.textContent).not.toMatch(/recovery/i);
    expect(container.querySelectorAll('.glance-stat')).toHaveLength(2);
  });
});

describe('AC3 — the words', () => {
  it('reads "so far" on today and plain on a past day', () => {
    set(hr(D, { steps: '10', calories: '20' }));
    expect([...mount('today').container.querySelectorAll('.glance-word')].map((w) => w.textContent)).toEqual([
      'steps so far',
      'kcal so far',
    ]);
    cleanup();
    expect([...mount('past').container.querySelectorAll('.glance-word')].map((w) => w.textContent)).toEqual([
      'steps',
      'kcal',
    ]);
  });
});

describe('AC4 — blanks', () => {
  it('shows "—" with the word for a blank, and a real 0 as 0', () => {
    set(hr(D, { steps: '', calories: '0' }));
    const { container } = mount('past');
    const figs = [...container.querySelectorAll('.glance-figure')].map((f) => f.textContent);
    expect(figs).toEqual(['—', '0']);
    expect(container.textContent).toContain('steps');
    expect(container.textContent).toContain('kcal');
  });
});

describe('AC5–AC8 — when the row is drawn', () => {
  it('draws nothing when the viewed day has no row', () => {
    set(hr('2026-09-25', { steps: '5' }));
    expect(mount('past').container.innerHTML).toBe('');
  });

  it('draws nothing while the tab is idle, loading or failed', () => {
    for (const state of ['idle', 'loading', 'error'] as const) {
      dailyHealth.value = { state };
      expect(mount('today').container.innerHTML).toBe('');
      cleanup();
    }
  });

  it('is first in the slot order and never mounts on a future day', () => {
    expect(SLOTS.glance).toBe(GlanceRow);
    expect(slotsFor('today')[0]).toBe('glance');
    expect(slotsFor('past')[0]).toBe('glance');
    expect(slotsFor('future')).not.toContain('glance');
  });
});
