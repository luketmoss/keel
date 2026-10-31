// #489 — the Training card redrawn: a sets ring or type icon on a done card,
// a date block and a dashed outline on a planned one, Up next, and the 7-day load.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { TrainingPanel, upNextFor } from './training-panel';
import { workouts, sets, dailyHealth } from '../../state/store';
import { DAILY_HEALTH_FIELDS, type DailyHealthRow } from '../../api/health-api';
import { isSetLogged } from '../../api/set-logged';
import { readGlobalCss } from '../../test-css';
import type { WorkoutWithRow, SetWithRow } from '../../api/types';
import type { DayState } from '../../day/dates';

afterEach(cleanup);
beforeEach(() => {
  workouts.value = [];
  sets.value = [];
  dailyHealth.value = { state: 'idle' };
});

const T = '2026-10-19'; // today, a Monday

function wk(id: string, over: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    id,
    date: T,
    time: '',
    type: 'weight',
    name: '',
    template_id: '',
    notes: '',
    elapsed_seconds: '',
    created: '',
    copied_from: '',
    status: '',
    moving_seconds: '',
    effort: '',
    distance_m: '',
    ascent_m: '',
    descent_m: '',
    avg_hr: '',
    sub_type: '',
    source: '',
    source_activity_id: '',
    raw_ref: '',
    fit_ref: '',
    fit_fetched_at: '',
    synced_at: '',
    started_at_utc: '',
    calories: '',
    estimated_seconds: '',
    sport_type: '',
    track_ref: '',
    trails: '',
    sheetRow: 2,
    ...over,
  };
}
function st(workout_id: string, n: number, over: Partial<SetWithRow> = {}): SetWithRow {
  return {
    workout_id,
    exercise_id: `e${n}`,
    exercise_name: `e${n}`,
    section: 'primary',
    exercise_order: n,
    set_number: 1,
    planned_reps: '10',
    weight: '',
    reps: '',
    effort: '',
    sheetRow: 2,
    ...over,
  };
}
function hr(date: string, training_load: string): DailyHealthRow {
  const r = { sheetRow: 2 } as DailyHealthRow;
  for (const f of DAILY_HEALTH_FIELDS) (r as unknown as Record<string, string>)[f] = '';
  return { ...r, date, training_load } as DailyHealthRow;
}
/** Loads Tue 13 to Mon 19 October, in order. */
function week(...loads: string[]) {
  const dates = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'];
  dailyHealth.value = { state: 'loaded', rows: dates.map((d, i) => hr(d, loads[i] ?? '')) };
}
function panel(state: DayState, date = T) {
  return render(<TrainingPanel date={date} state={state} today={T} />);
}

describe('isSetLogged mirrors the MCP rule', () => {
  it('counts reps or weight on a done workout, reps or effort on a planned one', () => {
    expect(isSetLogged({ reps: '8', weight: '', effort: '' }, false)).toBe(true);
    expect(isSetLogged({ reps: '', weight: '135', effort: '' }, false)).toBe(true);
    expect(isSetLogged({ reps: '', weight: '', effort: 'Hard' }, false)).toBe(false);
    expect(isSetLogged({ reps: '', weight: '135', effort: '' }, true)).toBe(false);
    expect(isSetLogged({ reps: '', weight: '', effort: 'Easy' }, true)).toBe(true);
  });
});

describe('AC1 — a done card: sets ring or type icon', () => {
  it('fills the ring to logged / total sets with the logged count inside; badge and chip stay', () => {
    workouts.value = [wk('w', { name: 'Upper', elapsed_seconds: '1980', effort: 'Easy' })];
    sets.value = [st('w', 1, { reps: '8' }), st('w', 2, { weight: '95' }), st('w', 3), st('x', 1, { reps: '5' })];
    const { container } = panel('today');
    const card = container.querySelector('a.training-done')!;
    const ring = card.querySelector('.training-ring')!;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.querySelector('.training-ring-count')!.textContent).toBe('2');
    expect(
      Number(ring.querySelector('.training-ring-value')!.getAttribute('stroke-dasharray')!.split(' ')[0]),
    ).toBeCloseTo(66.667, 2);
    expect(card.querySelector('.training-type-mark')).toBeNull();
    expect(card.querySelector('.workout-meta')!.textContent).toBe('33 min · 2/3 sets');
    expect(card.querySelector('.training-type')!.textContent).toBe('weight');
    expect(card.querySelector('.workout-effort-easy')!.textContent).toBe('Easy');
  });

  it('draws no value arc with nothing logged, and the count reads 0', () => {
    workouts.value = [wk('w')];
    sets.value = [st('w', 1), st('w', 2)];
    const ring = panel('today').container.querySelector('.training-ring')!;
    expect(ring.querySelector('.training-ring-value')).toBeNull();
    expect(ring.querySelector('.training-ring-count')!.textContent).toBe('0');
  });

  it('draws the type icon for any other type, and for a weight workout with no set rows', () => {
    workouts.value = [
      wk('b', { type: 'bike', name: 'Ride', moving_seconds: '3600', effort: 'Hard', time: '07:00' }),
      wk('w', { name: 'Empty lift', time: '08:00' }),
    ];
    sets.value = [st('b', 1, { reps: '1' })];
    const cards = [...panel('today').container.querySelectorAll('a.training-done')];
    expect(cards).toHaveLength(2);
    for (const c of cards) {
      expect(c.querySelector('.training-ring')).toBeNull();
      const mark = c.querySelector('.training-type-mark')!;
      expect(mark.getAttribute('aria-hidden')).toBe('true');
      expect(mark.querySelector('svg')).not.toBeNull();
      expect(c.querySelector('.training-type')).not.toBeNull();
    }
    expect(cards[0].querySelector('.workout-effort-hard')).not.toBeNull();
  });
});

describe('AC2 — planned and overdue cards: date block, dashed outline', () => {
  it("reads TODAY over the number on today's plan, the weekday on others, with no Planned badge", () => {
    workouts.value = [wk('p', { status: 'planned', name: 'Push' }), wk('o', { status: 'planned', date: '2026-10-14' })];
    const { container } = panel('today');
    const own = container.querySelector('.training-list > a.training-planned')!;
    expect(own.querySelector('.training-date-day')!.textContent).toBe('Today');
    expect(own.querySelector('.training-date-num')!.textContent).toBe('19');
    expect(own.querySelector('.type-badge')).toBeNull();
    expect(own.querySelector('.training-chevron')!.getAttribute('aria-hidden')).toBe('true');
    const carried = container.querySelector('.training-overdue a.training-planned')!;
    expect(carried.querySelector('.training-date-day')!.textContent).toBe('Wed');
    expect(carried.querySelector('.training-date-num')!.textContent).toBe('14');
    expect(carried.querySelector('.badge-overdue')!.textContent).toBe('Overdue');
  });

  it('draws planned cards and the overdue unit as a 1px dashed outline, done cards filled and borderless', () => {
    const css = readGlobalCss().replace(/\r\n/g, '\n');
    const rule = (sel: string) => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
      if (!m) throw new Error(`no rule for ${sel}`);
      return m[1];
    };
    expect(rule('.training-list > .training-planned')).toMatch(/border:\s*1px dashed var\(--color-border\)/);
    expect(rule('.training-overdue')).toMatch(/border:\s*1px dashed var\(--color-border\)/);
    expect(rule('.training-done')).toMatch(/background:\s*var\(--color-surface-raised\)/);
    expect(rule('.workout-card.training-card')).toMatch(/border:\s*none/);
    expect(rule('.workout-card.training-card')).toMatch(/box-shadow:\s*none/);
    expect(rule('.training-ring-value')).toMatch(/stroke:\s*var\(--color-primary\)/);
    expect(rule('.training-ring-track')).toMatch(/stroke:\s*var\(--color-border-light\)/);
  });
});

describe('AC3/AC4 — Up next', () => {
  const plans = () => [
    wk('later', { status: 'planned', date: '2026-10-23', name: 'Later' }),
    wk('b', { status: 'planned', date: '2026-10-21', name: 'Upper Push B', sheetRow: 5 }),
    wk('done', { date: '2026-10-20', name: 'Odd done' }),
    wk('c', { status: 'planned', date: '2026-10-21', name: 'Second same day', sheetRow: 6 }),
    wk('past', { status: 'planned', date: '2026-10-18', name: 'Overdue' }),
  ];

  it('picks the earliest date after today, then sheet order', () => {
    expect(upNextFor(plans(), T)!.id).toBe('b');
    expect(upNextFor([wk('t', { status: 'planned' })], T)).toBeUndefined();
  });

  it('shows exactly one Up next card on today, after its own cards, opening the detail view', () => {
    workouts.value = [...plans(), wk('own', { status: 'planned', name: 'Today plan' })];
    sets.value = [st('b', 1), st('b', 2, { set_number: 2 }), st('b', 2)];
    const { container } = panel('today');
    const next = [...container.querySelectorAll('a.training-card')].filter((a) =>
      a.getAttribute('aria-label')!.startsWith('Up next'),
    );
    expect(next).toHaveLength(1);
    expect(next[0].getAttribute('aria-label')).toBe('Up next, Wednesday October 21: Upper Push B, planned');
    expect(next[0].getAttribute('href')).toBe('#/history/b');
    expect(next[0].querySelector('.workout-meta')!.textContent).toBe('Up next · 2 exercises · 3 sets');
    expect(next[0].querySelector('.training-date-day')!.textContent).toBe('Wed');
    const all = [...container.querySelectorAll('a.training-card')];
    expect(all.indexOf(next[0])).toBe(all.length - 1);
    expect(container.querySelectorAll('.badge-overdue')).toHaveLength(1);
  });

  it('shows Up next under the note on an empty today', () => {
    workouts.value = [wk('b', { status: 'planned', date: '2026-10-21', name: 'Upper Push B' })];
    const { container } = panel('today');
    expect(container.querySelector('.panel-note')!.textContent).toBe('Nothing planned today.');
    expect(container.querySelectorAll('a.training-card')).toHaveLength(1);
  });

  it('shows none on a past or future day, or on today with nothing planned after it', () => {
    workouts.value = plans();
    expect(panel('past', '2026-10-18').container.textContent).not.toContain('Up next');
    cleanup();
    expect(panel('future', '2026-10-20').container.textContent).not.toContain('Up next');
    cleanup();
    workouts.value = [wk('past', { status: 'planned', date: '2026-10-18' }), wk('d', { date: '2026-10-25' })];
    expect(panel('today').container.textContent).not.toContain('Up next');
  });
});

describe('AC5–AC7 — the 7-day load', () => {
  it('sums the non-blank values; a blank day draws no bar; the viewed day is marked', () => {
    week('50', '44', '', '81', '70', '94', '81');
    const { container } = panel('past', T);
    const block = container.querySelector('.training-load')!;
    expect(block.querySelector('.training-load-total')!.textContent).toBe('420');
    expect(block.querySelector('.training-load-label')!.textContent).toBe('7-day load');
    const days = [...block.querySelectorAll('.training-load-day')];
    expect(days.map((d) => d.querySelector('.training-load-letter')!.textContent).join('')).toBe('TWTFSSM');
    expect(days[2].querySelector('.training-load-bar')).toBeNull();
    expect(days[2].querySelector('.training-load-track')).not.toBeNull();
    expect((days[5].querySelector('.training-load-bar') as HTMLElement).style.height).toBe('100%');
    expect(parseFloat((days[0].querySelector('.training-load-bar') as HTMLElement).style.height)).toBeCloseTo(
      (50 / 94) * 100,
      3,
    );
    expect(days[6].classList.contains('training-load-viewed')).toBe(true);
    expect(block.querySelectorAll('.training-load-viewed')).toHaveLength(1);
  });

  it('names the bars with each day and the total (AC6)', () => {
    week('50', '44', '', '81', '70', '94', '81');
    const bars = panel('past', T).container.querySelector('[role="img"]')!;
    expect(bars.getAttribute('aria-label')).toBe(
      'Training load, Tue to Mon: 50, 44, no data, 81, 70, 94, 81. Total 420.',
    );
  });

  it('reads "7-day load so far" on today (AC7), drawn under the empty note', () => {
    week('', '', '', '', '', '30', '');
    const { container } = panel('today');
    expect(container.querySelector('.training-load-label')!.textContent).toBe('7-day load so far');
    expect(container.querySelector('.training-load-total')!.textContent).toBe('30');
    const note = container.querySelector('.panel-note')!;
    expect(note.compareDocumentPosition(container.querySelector('.training-load')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('is not drawn with all seven blank, while health is loading or failed, or on a future day', () => {
    week('', '', '', '', '', '', '');
    expect(panel('today').container.querySelector('.training-load')).toBeNull();
    cleanup();
    for (const state of ['loading', 'error'] as const) {
      dailyHealth.value = { state };
      workouts.value = [wk('d', { name: 'Lift' })];
      const { container } = panel('today');
      expect(container.querySelector('.training-load')).toBeNull();
      expect(container.querySelector('a.training-card')).not.toBeNull();
      cleanup();
    }
    week('50', '50', '50', '50', '50', '50', '50');
    expect(panel('future', '2026-10-20').container.querySelector('.training-load')).toBeNull();
  });
});

describe('AC8 — one link per card, named with its state', () => {
  it('never nests interactive elements and names planned and in-progress cards', () => {
    workouts.value = [
      wk('p', { status: 'planned', name: 'Push' }),
      wk('a', { status: 'active', name: 'Legs' }),
      wk('o', { status: 'planned', date: '2026-10-15', name: 'Pull' }),
      wk('n', { status: 'planned', date: '2026-10-22', name: 'Next' }),
    ];
    sets.value = [st('a', 1, { reps: '5' })];
    const { container } = panel('today');
    const links = [...container.querySelectorAll('a.training-card')];
    expect(links).toHaveLength(4);
    for (const a of links) expect(a.querySelector('a, button, input, [tabindex]')).toBeNull();
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Overdue, Thursday October 15: Pull, planned',
      'Today, Monday October 19: Push, planned',
      'Legs, in progress. Resume workout.',
      'Up next, Thursday October 22: Next, planned',
    ]);
  });
});

describe('the card title', () => {
  it('draws the barbell, hidden, and counts what is listed: "1 done · 2 planned"', () => {
    workouts.value = [
      wk('p', { status: 'planned' }),
      wk('d', {}),
      wk('o', { status: 'planned', date: '2026-10-15' }),
      wk('n', { status: 'planned', date: '2026-10-22' }),
    ];
    const { container, getByRole } = panel('today');
    expect(getByRole('heading', { level: 2, name: 'Training' }).querySelector('.day-panel-icon svg')).not.toBeNull();
    expect(container.querySelector('.day-panel-meta')!.textContent).toBe('1 done · 2 planned');
  });

  it('says only what there is, and nothing when the panel is empty', () => {
    workouts.value = [wk('d', {})];
    expect(panel('past').container.querySelector('.day-panel-meta')!.textContent).toBe('1 done');
    cleanup();
    workouts.value = [];
    expect(panel('past').container.querySelector('.day-panel-meta')).toBeNull();
  });
});
