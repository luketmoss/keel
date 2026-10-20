// #504 — a Day card opens its Trends group: which cards link, where, what they say
// aloud, and what the stylesheet gives the link.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

vi.mock('../../state/actions', () => ({ loadHealth: vi.fn(async () => {}) }));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import { VitalsTiles } from './metric-tile';
import { SleepCard } from './sleep-card';
import { GlanceRow } from './glance-row';
import { BodyPanel } from './body-panel';
import { JournalPanel } from './journal-panel';
import { trendsHref } from './card-link';
import { dailyHealth, bodyMeasurements } from '../../state/store';
import {
  DAILY_HEALTH_FIELDS,
  BODY_MEASUREMENT_FIELDS,
  type DailyHealthRow,
  type BodyMeasurementRow,
} from '../../api/health-api';
import { addDays, type DayState } from '../../day/dates';
import { readGlobalCss } from '../../test-css';

afterEach(cleanup);
beforeEach(() => {
  dailyHealth.value = { state: 'idle' };
  bodyMeasurements.value = { state: 'idle' };
});

const D = '2026-09-26';
const TODAY = '2026-09-30';
const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };

function hr(date: string, over: Partial<Record<string, string>> = {}): DailyHealthRow {
  const r = { sheetRow: 2 } as DailyHealthRow;
  for (const f of DAILY_HEALTH_FIELDS) (r as unknown as Record<string, string>)[f] = '';
  return { ...r, date, ...over } as DailyHealthRow;
}
function bm(over: Partial<BodyMeasurementRow>): BodyMeasurementRow {
  const r = { sheetRow: 2 } as BodyMeasurementRow;
  for (const f of BODY_MEASUREMENT_FIELDS) (r as unknown as Record<string, string>)[f] = '';
  return { ...r, attrib: '0', date: D, ...over };
}

const HISTORY = Array.from({ length: 20 }, (_, i) =>
  hr(addDays(D, -(i + 1)), { resting_hr: i % 2 ? '49' : '55', hrv: i % 2 ? '41' : '50', stress_avg: '25' }),
);
const DAY = hr(D, {
  resting_hr: '53',
  hrv: '45',
  stress_avg: '24',
  steps: '3035',
  calories: '1800',
  sleep_total_s: String((7 * 60 + 12) * 60),
  sleep_score: '84',
});

function mountAll(date = D, state: DayState = 'past', today = TODAY) {
  return render(
    <AuthContext.Provider value={AUTH}>
      <GlanceRow date={date} state={state} today={today} />
      <SleepCard date={date} state={state} today={today} />
      <VitalsTiles date={date} state={state} today={today} />
      <BodyPanel date={date} state={state} today={today} />
    </AuthContext.Provider>,
  );
}

const links = (c: Element) => [...c.querySelectorAll<HTMLAnchorElement>('a.day-card-link')];
const byKey = (c: Element, key: string) => links(c).find((a) => a.dataset.focusKey === key)!;
const name = (a: Element) => a.textContent;

function loadFull() {
  dailyHealth.value = { state: 'loaded', rows: [DAY, ...HISTORY] };
  bodyMeasurements.value = {
    state: 'loaded',
    rows: [
      bm({
        grpid: 's',
        kind: 'scale',
        time: '06:58',
        measured_at_utc: `${D}T06:58:00-06:00`,
        weight_kg: '82.4',
        fat_ratio_pct: '18.2',
      }),
      bm({
        grpid: 'b',
        kind: 'bp',
        time: '07:05',
        measured_at_utc: `${D}T07:05:00-06:00`,
        systolic_mmhg: '118',
        diastolic_mmhg: '76',
      }),
    ],
  };
}

describe('which cards link, and where', () => {
  it('links the seven targets to their groups, on the day shown', () => {
    loadFull();
    const { container } = mountAll();
    expect(links(container).map((a) => [a.dataset.focusKey, a.getAttribute('href')])).toEqual([
      ['day-link-steps', `#/trends/activity?date=${D}`],
      ['day-link-sleep', `#/trends/sleep?date=${D}`],
      ['day-link-resting_hr', `#/trends/recovery?date=${D}`],
      ['day-link-hrv', `#/trends/recovery?date=${D}`],
      ['day-link-stress', `#/trends/recovery?date=${D}`],
      ['day-link-weight', `#/trends/body?date=${D}`],
      ['day-link-bp', `#/trends/blood_pressure?date=${D}`],
    ]);
  });

  it('builds the href from a group and a date', () => {
    expect(trendsHref('blood_pressure', '2026-01-02')).toBe('#/trends/blood_pressure?date=2026-01-02');
  });

  it('gives the Recovery ring, Calories and the Note card no link', () => {
    dailyHealth.value = {
      state: 'loaded',
      rows: [hr(TODAY, { steps: '1', calories: '2', recovery: '76' }), ...HISTORY],
    };
    const { container } = render(
      <AuthContext.Provider value={AUTH}>
        <GlanceRow date={TODAY} state="today" today={TODAY} />
        <JournalPanel date={TODAY} state="today" today={TODAY} />
      </AuthContext.Provider>,
    );
    expect(links(container).map((a) => a.dataset.focusKey)).toEqual(['day-link-steps']);
    expect(container.querySelector('.glance-ring a')).toBeNull();
    expect(container.querySelector('.glance-calories a')).toBeNull();
    expect(container.querySelector('.journal-panel a, [class*="journal"] a')).toBeNull();
  });

  it('links nothing while health is loading or failed, and not the note card in the tiles place', () => {
    for (const state of [{ state: 'loading' }, { state: 'error', message: 'x' }] as never[]) {
      dailyHealth.value = state;
      bodyMeasurements.value = state;
      const { container, unmount } = mountAll();
      expect(links(container)).toEqual([]);
      unmount();
    }
    dailyHealth.value = { state: 'loaded', rows: [] };
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    const { container } = mountAll();
    // "No watch data for this day." is a note, not a link; Body still shows its two blank halves.
    expect(container.querySelector('.vitals-one a')).toBeNull();
    expect(links(container).map((a) => a.dataset.focusKey)).toEqual(['day-link-weight', 'day-link-bp']);
  });

  it('keeps a card with no reading a link', () => {
    dailyHealth.value = { state: 'loaded', rows: [hr(D), ...HISTORY] };
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    const { container } = mountAll();
    expect(links(container).map((a) => name(a))).toEqual([
      'Steps, no reading. Open Activity trends',
      'Sleep, no reading. Open Sleep trends',
      'Resting HR, no reading. Open Recovery trends',
      'HRV, no reading. Open Recovery trends',
      'Average stress, no reading. Open Recovery trends',
      'Weight, no reading. Open Body trends',
      'Blood pressure, no reading. Open Blood Pressure trends',
    ]);
  });
});

describe('what a link says aloud', () => {
  it('is the card title and value, then Open <Group> trends', () => {
    loadFull();
    const { container } = mountAll();
    expect(links(container).map((a) => name(a))).toEqual([
      'Steps 3,035. Open Activity trends',
      'Sleep 7h 12m. Open Sleep trends',
      'Resting HR 53 bpm. Open Recovery trends',
      'HRV 45 ms. Open Recovery trends',
      'Average stress 24. Open Recovery trends',
      'Weight 181.7 lb. Open Body trends',
      'Blood pressure 118/76 mmHg. Open Blood Pressure trends',
    ]);
  });

  it('says "so far" for a day in progress', () => {
    dailyHealth.value = {
      state: 'loaded',
      rows: [hr(TODAY, { steps: '3035', stress_avg: '31', resting_hr: '53' }), ...HISTORY],
    };
    bodyMeasurements.value = { state: 'loaded', rows: [] };
    const { container } = mountAll(TODAY, 'today');
    expect(name(byKey(container, 'day-link-steps'))).toBe('Steps 3,035 so far. Open Activity trends');
    expect(name(byKey(container, 'day-link-stress'))).toBe('Average stress 31 so far. Open Recovery trends');
  });

  it('leaves each card heading as it was', () => {
    loadFull();
    const { container } = mountAll();
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Sleep',
      'Resting HR',
      'HRV',
      'Average stress',
      'Body',
    ]);
  });

  it('puts the words in the link and nothing else in it', () => {
    loadFull();
    const { container } = mountAll();
    for (const a of links(container)) {
      expect(a.children).toHaveLength(1);
      expect(a.firstElementChild!.classList.contains('sr-only')).toBe(true);
      expect(a.getAttribute('aria-label')).toBeNull();
    }
  });
});

describe('the › mark', () => {
  it('shows on every linked card but Steps, hidden from screen readers', () => {
    loadFull();
    const { container } = mountAll();
    const chevrons = [...container.querySelectorAll('.day-card-chevron')];
    expect(chevrons).toHaveLength(6);
    for (const c of chevrons) {
      expect(c.textContent).toBe('›');
      expect(c.getAttribute('aria-hidden')).toBe('true');
    }
    expect(container.querySelector('.glance-steps .day-card-chevron')).toBeNull();
  });

  it('sits in the title row of a card, and in each half of Body', () => {
    loadFull();
    const { container } = mountAll();
    expect(container.querySelectorAll('.day-panel-head .day-card-chevron')).toHaveLength(4);
    expect(container.querySelectorAll('.body-weight .day-card-chevron, .body-bp .day-card-chevron')).toHaveLength(2);
  });
});

describe('what the link is placed in', () => {
  it('is the last child of a card that is its positioning box', () => {
    loadFull();
    const { container } = mountAll();
    for (const key of ['day-link-sleep', 'day-link-resting_hr', 'day-link-hrv', 'day-link-stress']) {
      const a = byKey(container, key);
      expect(a.parentElement!.classList.contains('day-panel-linked'), key).toBe(true);
      expect(a.parentElement!.lastElementChild, key).toBe(a);
    }
    expect(byKey(container, 'day-link-steps').parentElement!.classList.contains('glance-stat-linked')).toBe(true);
    expect(byKey(container, 'day-link-weight').parentElement!.classList.contains('body-weight')).toBe(true);
    expect(byKey(container, 'day-link-bp').parentElement!.classList.contains('body-bp')).toBe(true);
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss().replace(/\r\n/g, '\n');
  const rule = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('stretches the link over its box, with an inset ring', () => {
    expect(rule('.day-card-link')).toMatch(/position:\s*absolute/);
    expect(rule('.day-card-link')).toMatch(/inset:\s*0/);
    expect(rule('.day-card-link:focus-visible')).toMatch(/outline-offset:\s*-2px/);
  });

  it('makes each target a positioning box', () => {
    const at = css.indexOf('.day-panel-linked,');
    const list = css.slice(at, css.indexOf('}', at));
    for (const s of ['.day-panel-linked', '.glance-stat-linked', '.body-weight', '.body-bp']) expect(list).toContain(s);
    expect(list).toMatch(/position:\s*relative/);
  });
});
