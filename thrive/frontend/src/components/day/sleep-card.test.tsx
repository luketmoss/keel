// #490 — the Sleep card and `sleepView`.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

vi.mock('../../state/actions', () => ({ loadHealth: vi.fn(async () => {}) }));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import { SleepCard } from './sleep-card';
import { sleepView, healthView, spokenDuration, stageDuration } from './health-rows';
import { SLOTS, slotsFor } from './slots';
import { dailyHealth } from '../../state/store';
import { DAILY_HEALTH_FIELDS, type DailyHealthRow } from '../../api/health-api';
import { addDays, type DayState } from '../../day/dates';

afterEach(cleanup);
beforeEach(() => {
  dailyHealth.value = { state: 'idle' };
});

const D = '2026-09-26';
const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };
const min = (m: number) => String(m * 60);

function hr(date: string, over: Partial<Record<string, string>> = {}): DailyHealthRow {
  const r = { sheetRow: 2 } as DailyHealthRow;
  for (const f of DAILY_HEALTH_FIELDS) (r as unknown as Record<string, string>)[f] = '';
  return { ...r, date, ...over } as DailyHealthRow;
}

const NIGHT = {
  sleep_total_s: min(7 * 60 + 48),
  sleep_deep_s: min(117),
  sleep_rem_s: min(91),
  sleep_light_s: min(219),
  sleep_awake_s: min(41),
  sleep_score: '84',
  bed_time: '22:27',
  wake_time: '06:15',
};

function mount(rows: DailyHealthRow[], state: DayState = 'past') {
  dailyHealth.value = { state: 'loaded', rows };
  return render(
    <AuthContext.Provider value={AUTH}>
      <SleepCard date={D} state={state} today={state === 'today' ? D : '2026-09-30'} />
    </AuthContext.Provider>,
  );
}

const history = Array.from({ length: 20 }, (_, i) =>
  hr(addDays(D, -(i + 1)), { sleep_total_s: i % 2 ? min(6 * 60 + 40) : min(8 * 60) }),
);

describe('AC1 — the stage bar', () => {
  it('draws deep, REM, light, awake in order with widths in proportion, and names them', () => {
    const { container } = mount([hr(D, NIGHT)]);
    const bar = container.querySelector('.sleep-bar')!;
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toBe(
      'Deep 1 hour 57 minutes, REM 1 hour 31 minutes, Light 3 hours 39 minutes, Awake 41 minutes',
    );
    const segs = [...bar.children] as HTMLElement[];
    expect(segs.map((s) => s.className.replace('sleep-seg sleep-seg-', ''))).toEqual(['deep', 'rem', 'light', 'awake']);
    expect(segs.map((s) => Number(s.style.flexGrow))).toEqual([117 * 60, 91 * 60, 219 * 60, 41 * 60]);
    const legend = [...container.querySelectorAll('.sleep-legend-item')].map((l) => l.textContent);
    expect(legend).toEqual(['Deep1h 57m', 'REM1h 31m', 'Light3h 39m', 'Awake41m']);
  });
});

describe('AC2 — blank stages', () => {
  it('draws and lists only the present stages', () => {
    const { container } = mount([hr(D, { ...NIGHT, sleep_rem_s: '', sleep_awake_s: '' })]);
    expect(container.querySelectorAll('.sleep-seg')).toHaveLength(2);
    expect(container.querySelectorAll('.sleep-legend-item')).toHaveLength(2);
  });

  it('shows no bar or legend with none, and the total still', () => {
    const { container } = mount([
      hr(D, { ...NIGHT, sleep_deep_s: '', sleep_rem_s: '', sleep_light_s: '', sleep_awake_s: '' }),
    ]);
    expect(container.querySelector('.sleep-bar')).toBeNull();
    expect(container.querySelector('.sleep-legend')).toBeNull();
    expect(container.querySelector('.sr-only')!.textContent).toBe('7 hours 48 minutes');
  });
});

describe('AC3 — score and total', () => {
  it('shows the score and total at figure size', () => {
    const { container } = mount([hr(D, NIGHT)]);
    expect(container.querySelector('.sleep-score')!.textContent).toBe('84sleepscore');
    expect(container.querySelector('.sleep-total')!.textContent).toBe('7 hours 48 minutes7h 48m');
  });

  it('shows no score, and no dash, when the score is blank', () => {
    const { container } = mount([hr(D, { ...NIGHT, sleep_score: '' })]);
    expect(container.querySelector('.sleep-score')).toBeNull();
    expect(container.querySelector('.sleep-figures')!.textContent).not.toContain('—');
  });

  it('shows a dash and the reason when the total is blank', () => {
    expect(mount([hr(D, { ...NIGHT, sleep_total_s: '' })]).container.textContent).toContain('—No sleep recorded.');
    cleanup();
    expect(mount([hr(D, { ...NIGHT, sleep_total_s: '' })], 'today').container.textContent).toContain(
      '—Arrives with the next sync.',
    );
  });
});

describe('AC4 — bed and wake', () => {
  it('shows both under the bar, and neither when one is missing', () => {
    const { container } = mount([hr(D, NIGHT)]);
    expect([...container.querySelectorAll('.sleep-times span')].map((s) => s.textContent)).toEqual([
      '10:27 PM',
      '6:15 AM',
    ]);
    cleanup();
    expect(mount([hr(D, { ...NIGHT, wake_time: '' })]).container.querySelector('.sleep-times')).toBeNull();
  });
});

describe('AC5 — the range line', () => {
  it('matches the Health rules: in range, building, and attention below range', () => {
    const inRange = mount([...history, hr(D, { ...NIGHT, sleep_total_s: min(7 * 60 + 20) })]);
    expect(inRange.container.querySelector('.sleep-range')!.textContent).toBe('Your range 6h 40m–8h 00m · in range');
    cleanup();
    const low = mount([...history, hr(D, { ...NIGHT, sleep_total_s: min(5 * 60) })]);
    const att = low.container.querySelector('.health-attention')!;
    expect(att.textContent).toBe('↓ below your range');
    cleanup();
    expect(mount([hr(D, NIGHT)]).container.querySelector('.sleep-range')!.textContent).toBe(
      'Building your range — 0 of 14 days so far.',
    );
  });

  it('is the caption the Health panel used to carry for sleep', () => {
    const v = sleepView([...history, hr(D, NIGHT)], D, false)!;
    expect(v.range).toMatchObject({ kind: 'range', zone: 'within' });
  });
});

describe('AC6 — Sleep leaves Health', () => {
  it('is not among the Health rows', () => {
    const v = healthView([hr(D, NIGHT)], D, false);
    expect(v.kind === 'rows' && v.rows.map((r) => r.key)).not.toContain('sleep');
  });
});

describe('AC7 — mounting and loading', () => {
  it('is a slot after training and never mounts on a future day', () => {
    expect(SLOTS.sleep).toBe(SleepCard);
    expect(slotsFor('past').indexOf('sleep')).toBe(slotsFor('past').indexOf('training') + 1);
    expect(slotsFor('future')).not.toContain('sleep');
  });

  it('shows the panel status while loading or failed', () => {
    dailyHealth.value = { state: 'loading' };
    const a = render(<SleepCard date={D} state="past" today="2026-09-30" />);
    expect(a.container.querySelector('[role="status"]')!.textContent).toBe('Loading…');
    cleanup();
    dailyHealth.value = { state: 'error', message: 'x' } as never;
    const b = render(
      <AuthContext.Provider value={AUTH}>
        <SleepCard date={D} state="past" today="2026-09-30" />
      </AuthContext.Provider>,
    );
    expect(b.container.textContent).toContain("Couldn't load your sleep.");
  });

  it('draws nothing for a day with no row', () => {
    expect(mount([hr('2026-09-25', NIGHT)]).container.querySelector('section')).toBeNull();
  });

  it('says the night in the title row', () => {
    expect(mount([hr(D, NIGHT)]).container.querySelector('.day-panel-meta')!.textContent).toBe('Fri night');
    cleanup();
    expect(mount([hr(D, NIGHT)], 'today').container.querySelector('.day-panel-meta')!.textContent).toBe('last night');
  });
});

describe('durations', () => {
  it('writes under an hour as minutes only, and speaks singulars', () => {
    expect(stageDuration(41 * 60)).toBe('41m');
    expect(stageDuration(117 * 60)).toBe('1h 57m');
    expect(spokenDuration(61 * 60)).toBe('1 hour 1 minute');
    expect(spokenDuration(120 * 60)).toBe('2 hours');
  });
});
