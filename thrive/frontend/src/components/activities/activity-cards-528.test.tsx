// #528 — the Activities list: one-figure activity cards, Monday-to-Sunday week groups, the Up next row.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));
const navigate = vi.fn();
vi.mock('../../router/router', () => ({ navigate: (...a: unknown[]) => navigate(...a) }));

import { ActivitiesScreen } from './activities-screen';
import { workouts, sets, exercises, activitiesMonth, filterType, loading } from '../../state/store';
import type { WorkoutWithRow } from '../../api/types';

let n = 0;
function w(overrides: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  n += 1;
  return {
    id: `w${n}`,
    date: '2026-10-20',
    time: '08:00',
    type: 'weight',
    name: `Session ${n}`,
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
    sheetRow: 2 + n,
    ...overrides,
  };
}

const ride = () =>
  w({
    id: 'ride',
    name: 'Mountain Bike',
    type: 'bike',
    date: '2026-10-18',
    distance_m: '24203',
    elapsed_seconds: '6473',
    ascent_m: '494',
  });
const lift = () =>
  w({
    id: 'lift',
    name: 'Pull Day',
    type: 'weight',
    date: '2026-10-20',
    elapsed_seconds: '1980',
    avg_hr: '89',
    effort: 'Hard',
  });
const stretch = () =>
  w({
    id: 'stretch',
    name: 'Evening Stretch',
    type: 'stretch',
    date: '2026-10-19',
    elapsed_seconds: '1200',
    effort: 'Easy',
    notes: 'Hips and hamstrings\nfelt tight',
  });
const hike = () =>
  w({ id: 'hike', name: 'Ridge Trail', type: 'hike', date: '2026-10-07', distance_m: '6512', elapsed_seconds: '5143' });

function show(list: WorkoutWithRow[]) {
  workouts.value = list;
  loading.value = false;
  return render(h(ActivitiesScreen, {}));
}

const cards = () => [...document.querySelectorAll<HTMLButtonElement>('button.activity-card')];
const cardOf = (id: string) => document.querySelector<HTMLButtonElement>(`[data-focus-key="workout:${id}"]`)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:00'));
  activitiesMonth.value = '2026-10';
  navigate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
  filterType.value = null;
});

describe('AC1–AC3: the card', () => {
  it('shows the icon, the big figure with its unit, the stats line and "day · name", with no badge or counts', () => {
    show([ride()]);
    const c = cardOf('ride');
    expect(c.querySelector('.activity-card-icon svg')).toBeTruthy();
    expect((c.querySelector('.activity-card-icon') as HTMLElement).style.color).toBe('var(--type-bike)');
    expect(c.querySelector('.activity-card-figure')!.textContent).toBe('15.0');
    expect(c.querySelector('.activity-card-unit')!.textContent).toBe('mi');
    expect(c.querySelector('.activity-card-stats')!.textContent).toBe('1:47:53 · 8.4 mph · ↑1,620 ft');
    expect(c.querySelector('.activity-card-name')!.textContent).toBe('Sun · Mountain Bike');
    expect(c.querySelector('.type-badge')).toBeNull();
    expect(c.textContent).not.toMatch(/exercise|\bsets?\b/);
  });

  it('draws a duration figure for a weight session, "33 min" and "1:48 h"', () => {
    show([lift(), w({ id: 'long', type: 'weight', elapsed_seconds: '6480', date: '2026-10-19' })]);
    expect(cardOf('lift').querySelector('.activity-card-figure')!.textContent).toBe('33');
    expect(cardOf('lift').querySelector('.activity-card-unit')!.textContent).toBe('min');
    expect(cardOf('long').querySelector('.activity-card-figure')!.textContent).toBe('1:48');
    expect(cardOf('long').querySelector('.activity-card-unit')!.textContent).toBe('h');
  });

  it('gives a weight card its heart rate and an effort word in its effort colour', () => {
    show([lift()]);
    const stats = cardOf('lift').querySelector('.activity-card-stats')!;
    expect(stats.textContent).toBe('89 bpm · hard');
    expect(stats.querySelector('.activity-effort-hard')!.textContent).toBe('hard');
  });

  it("gives a stretch card its effort word then the note's first line", () => {
    show([stretch()]);
    expect(cardOf('stretch').querySelector('.activity-card-stats')!.textContent).toBe('easy · Hips and hamstrings');
  });

  it('leaves the stats line out when nothing is known, and never draws 0 or a dash in it', () => {
    show([w({ id: 'bare', type: 'bike', elapsed_seconds: '', distance_m: '0', ascent_m: '0' })]);
    const c = cardOf('bare');
    expect(c.querySelector('.activity-card-stats')).toBeNull();
    expect(c.querySelector('.activity-card-figure')!.textContent).toBe('—');
    expect(c.querySelector('.activity-card-unit')).toBeNull();
  });

  it('reads Today, Yesterday or the short weekday', () => {
    show([lift(), stretch(), ride()]);
    expect(cardOf('lift').querySelector('.activity-card-name')!.textContent).toBe('Today · Pull Day');
    expect(cardOf('stretch').querySelector('.activity-card-name')!.textContent).toBe('Yesterday · Evening Stretch');
    expect(cardOf('ride').querySelector('.activity-card-name')!.textContent).toBe('Sun · Mountain Bike');
  });

  it('puts the type-icon tile in the visual slot, hidden from assistive technology', () => {
    show([ride()]);
    const tile = cardOf('ride').querySelector('.activity-tile')!;
    expect(tile.getAttribute('aria-hidden')).toBe('true');
    expect(tile.classList.contains('badge-bike')).toBe(true);
    expect(tile.querySelector('svg')).toBeTruthy();
  });
});

describe('AC5: week groups', () => {
  it('heads each Monday-to-Sunday week, newest first, with count, time and distance', () => {
    show([lift(), stretch(), ride(), hike()]);
    const heads = [...document.querySelectorAll('.week-heading')].map((x) => [
      x.querySelector('h2')!.textContent,
      x.querySelector('.week-totals')!.textContent,
    ]);
    expect(heads).toEqual([
      ['This week', '2 · 53 min'],
      ['Last week', '1 · 1 h 48 · 15 mi'],
      ['Oct 5 – 11', '1 · 1 h 26 · 4 mi'],
    ]);
  });

  it('puts Sunday 18 Oct in the week before Monday 19 Oct', () => {
    show([ride(), stretch()]);
    const heads = [...document.querySelectorAll('.week-heading h2')].map((x) => x.textContent);
    expect(heads).toEqual(['This week', 'Last week']);
  });
});

describe('AC6: Up next', () => {
  const plans = () => [
    w({ id: 'late', name: 'Missed Pull', status: 'planned', date: '2026-10-15', sheetRow: 9 }),
    w({ id: 'today', name: 'Today Push', status: 'planned', date: '2026-10-20', sheetRow: 3 }),
    w({
      id: 'soon',
      name: 'Easy Spin',
      type: 'bike',
      status: 'planned',
      date: '2026-10-22',
      estimated_seconds: '1500',
      sheetRow: 4,
    }),
  ];

  it('lists overdue first, then by date, with the date line, name and meta', () => {
    show([lift(), ...plans()]);
    const row = [...document.querySelectorAll('.up-next-card')];
    expect(row.map((c) => c.querySelector('.up-next-name')!.textContent)).toEqual([
      'Missed Pull',
      'Today Push',
      'Easy Spin',
    ]);
    expect(row.map((c) => c.querySelector('.up-next-date')!.textContent)).toEqual([
      'Overdue OCT 15',
      'TODAY',
      'THU 22',
    ]);
    expect(row[0].querySelector('.badge-overdue')!.textContent).toBe('Overdue');
    expect(row[2].querySelector('.up-next-meta')!.textContent).toBe('~25 min');
    expect(row[1].querySelector('.up-next-meta')!.textContent).toBe('weight');
    expect(document.querySelector('.up-next h2')!.textContent).toBe('Up next');
    expect(document.querySelector('.up-next .week-totals')!.textContent).toBe('3 planned');
  });

  it("opens the workout's detail", () => {
    show(plans());
    fireEvent.click(cardOf('soon'));
    expect(navigate).toHaveBeenCalledWith('/history/soon');
  });

  it('is not shown on a past month, or when nothing is planned', () => {
    activitiesMonth.value = '2026-09';
    show([w({ date: '2026-09-02' }), ...plans()]);
    expect(document.querySelector('.up-next')).toBeNull();
    cleanup();
    activitiesMonth.value = '2026-10';
    show([lift()]);
    expect(document.querySelector('.up-next')).toBeNull();
  });

  it('is not in the activity list and the cards are dashed plan cards, not activity cards', () => {
    show([lift(), ...plans()]);
    expect(cards()).toHaveLength(1);
    expect(document.querySelectorAll('.week-group .up-next-card')).toHaveLength(0);
  });
});

describe('AC8: one button, one name, focus handoff', () => {
  it('is a single button with no interactive child, named with the name, day, figure and stats', () => {
    show([ride()]);
    const c = cardOf('ride');
    expect(c.tagName).toBe('BUTTON');
    expect(c.querySelector('button, a, input, select, [role="button"]')).toBeNull();
    const label = c.getAttribute('aria-label')!;
    for (const part of [
      'Mountain Bike',
      'Sunday October 18',
      '15.0 miles',
      '1 hour 47 minutes',
      '8.4 miles per hour',
      '1,620 feet climbed',
    ]) {
      expect(label).toContain(part);
    }
  });

  it('keeps data-focus-key on every card and plan', () => {
    show([ride(), w({ id: 'p', status: 'planned', date: '2026-10-21' })]);
    expect(cardOf('ride')).toBeTruthy();
    expect(cardOf('p')).toBeTruthy();
  });
});

describe('AC9: empty lists', () => {
  it('reads "Nothing logged yet. Tap + to start a workout." on the current month', () => {
    show([]);
    expect(document.querySelector('.activities-empty')!.textContent).toBe(
      'Nothing logged yet. Tap + to start a workout.',
    );
  });

  it('names the type when a chip leaves nothing', () => {
    filterType.value = 'run';
    show([ride()]);
    expect(document.querySelector('.activities-empty')!.textContent).toBe('No run activities in October.');
  });

  it('says nothing while loading', () => {
    workouts.value = [];
    loading.value = true;
    render(h(ActivitiesScreen, {}));
    expect(document.querySelector('.activities-empty')).toBeNull();
  });

  it('keeps Up next above the empty line when there are plans', () => {
    show([w({ id: 'p', status: 'planned', date: '2026-10-21' })]);
    expect(document.querySelector('.up-next')).toBeTruthy();
    expect(screen.getByText('Nothing logged yet. Tap + to start a workout.')).toBeTruthy();
  });
});
