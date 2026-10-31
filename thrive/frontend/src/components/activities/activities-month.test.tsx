// #527 — the Activities header: month button and picker, month summary card, type chips.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

import { ActivitiesScreen } from './activities-screen';
import { workouts, sets, exercises, labels, activitiesMonth, filterType, filterTags, loading } from '../../state/store';
import { monthName, monthYearLabel } from './activities-helpers';
import type { WorkoutWithRow } from '../../api/types';

const now = new Date();
/** 'YYYY-MM' for the month `back` months before this one. */
function ym(back: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const THIS = ym(0);
const LAST = ym(1);
const OLDER = ym(3);

let n = 0;
function w(month: string, overrides: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  n += 1;
  return {
    id: `w${n}`,
    date: `${month}-01`,
    time: '08:00',
    type: 'weight',
    name: `Session ${n}`,
    template_id: '',
    notes: '',
    elapsed_seconds: '3600',
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

function show(list: WorkoutWithRow[]) {
  workouts.value = list;
  loading.value = false;
  return render(h(ActivitiesScreen, {}));
}

const monthButton = () => screen.getByRole('button', { name: /^Choose month/ });
const card = () => document.querySelector('.month-card') as HTMLElement;
const figures = () =>
  [...document.querySelectorAll('.month-figure')].map((f) => [
    f.querySelector('.month-figure-value')!.textContent,
    f.querySelector('.month-figure-label')!.textContent,
  ]);

afterEach(() => {
  cleanup();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
  labels.value = [];
  filterType.value = null;
  filterTags.value = [];
  loading.value = true;
  activitiesMonth.value = THIS;
});

describe('AC1: the old header is gone', () => {
  it('renders no week streak, stats bar or cardio row', () => {
    show([w(THIS, { type: 'bike', distance_m: '8046.72', ascent_m: '300' })]);
    for (const cls of ['.week-streak-bar', '.week-streak-dots', '.stats-bar', '.stats-row', '.streak-dot']) {
      expect(document.querySelector(cls), cls).toBeNull();
    }
    expect(screen.queryByText('This week')).toBeNull();
    expect(screen.queryByText(/Cardio this week/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle filters' })).toBeNull();
  });
});

describe('AC2: the month button and picker', () => {
  const data = () => [w(THIS), w(LAST), w(LAST), w(OLDER)];

  it('names the chosen month and year', () => {
    show(data());
    expect(monthButton().textContent).toBe(monthYearLabel(THIS));
    expect(monthButton().getAttribute('aria-label')).toBe(`Choose month, ${monthYearLabel(THIS)}`);
    expect(monthButton().getAttribute('aria-haspopup')).toBe('listbox');
    expect(monthButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('lists the current month and each earlier month with an activity, newest first, with counts', () => {
    show(data());
    fireEvent.click(monthButton());
    const opts = screen.getAllByRole('option');
    expect(opts.map((o) => o.textContent!.replace('✓', ''))).toEqual([
      `${monthYearLabel(THIS)}1`,
      `${monthYearLabel(LAST)}2`,
      `${monthYearLabel(OLDER)}1`,
    ]);
    expect(opts[0].getAttribute('aria-selected')).toBe('true');
    expect(opts[1].getAttribute('aria-selected')).toBe('false');
  });

  it('lists the current month even when it is empty, and skips months with nothing', () => {
    show([w(LAST), w(OLDER)]);
    fireEvent.click(monthButton());
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getAllByRole('option')[0].textContent).toContain(`${monthYearLabel(THIS)}`);
    expect(screen.queryByText(new RegExp(monthYearLabel(ym(2))))).toBeNull();
  });

  it('picking a month shows it, closes the picker and returns focus to the button', () => {
    show(data());
    fireEvent.click(monthButton());
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(monthButton().textContent).toBe(monthYearLabel(LAST));
    expect(document.activeElement).toBe(monthButton());
    expect(activitiesMonth.value).toBe(LAST);
  });

  it('Escape closes without changing anything and returns focus to the button', () => {
    show(data());
    fireEvent.click(monthButton());
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(activitiesMonth.value).toBe(THIS);
    expect(document.activeElement).toBe(monthButton());
  });

  it('a tap outside closes without changing anything and returns focus to the button', async () => {
    show(data());
    fireEvent.click(monthButton());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(activitiesMonth.value).toBe(THIS);
    await waitFor(() => expect(document.activeElement).toBe(monthButton()));
  });

  it('moves with Up and Down', () => {
    show(data());
    fireEvent.click(monthButton());
    const opts = screen.getAllByRole('option');
    expect(document.activeElement).toBe(opts[0]);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opts[1]);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(opts[0]);
  });
});

describe('AC3: one month at a time', () => {
  it('lists only completed activities dated in the chosen month, opening on the current one', () => {
    show([w(THIS, { name: 'Now' }), w(LAST, { name: 'Before' }), w(THIS, { name: 'Soon', status: 'planned' })]);
    expect(screen.queryByText(/· Now$/)).toBeTruthy();
    expect(screen.queryByText(/· Before$/)).toBeNull();
    // The planned row stays in its own section, not in the month's list.
    expect(document.querySelector('.workout-list')!.textContent).not.toContain('Soon');
  });

  it('shows a past month when it is chosen', () => {
    activitiesMonth.value = LAST;
    show([w(THIS, { name: 'Now' }), w(LAST, { name: 'Before' })]);
    expect(screen.queryByText(/· Before$/)).toBeTruthy();
    expect(screen.queryByText(/· Now$/)).toBeNull();
  });

  it('keeps a picked month when the screen is left and opened again', () => {
    const list = [w(THIS, { name: 'Now' }), w(LAST, { name: 'Before' })];
    show(list);
    fireEvent.click(monthButton());
    fireEvent.click(screen.getAllByRole('option')[1]);
    cleanup();
    render(h(ActivitiesScreen, {}));
    expect(monthButton().textContent).toBe(monthYearLabel(LAST));
    expect(screen.queryByText(/· Before$/)).toBeTruthy();
  });
});

describe('AC4: the card title', () => {
  it('reads "<Month> so far" for the current month', () => {
    show([w(THIS)]);
    expect(card().querySelector('h2')!.textContent).toBe(`${monthName(THIS)} so far`);
  });

  it('reads "<Month>" for a past month', () => {
    activitiesMonth.value = LAST;
    show([w(LAST)]);
    const title = card().querySelector('h2')!.textContent!;
    expect(title.startsWith(monthName(LAST))).toBe(true);
    expect(title).not.toContain('so far');
  });
});

describe('AC5: the figures', () => {
  it('shows the count, the summed time and the summed distance in miles', () => {
    show([
      w(THIS, { type: 'bike', elapsed_seconds: '3600', distance_m: '16093.44' }),
      w(THIS, { type: 'hike', elapsed_seconds: '5400', distance_m: '8046.72' }),
    ]);
    expect(figures()).toEqual([
      ['2', 'activities'],
      ['2 h 30', 'total time'],
      ['15 mi', 'distance'],
    ]);
  });

  it('says "activity" for one, and "min" under an hour', () => {
    show([w(THIS, { elapsed_seconds: '2700' })]);
    expect(figures()).toEqual([
      ['1', 'activity'],
      ['45 min', 'total time'],
    ]);
  });

  it('leaves distance out when no activity has one', () => {
    show([w(THIS), w(THIS)]);
    expect(figures().map((f) => f[1])).toEqual(['activities', 'total time']);
  });

  it('says how many activities count towards the time when some have none', () => {
    show([
      w(THIS, { elapsed_seconds: '3600' }),
      w(THIS, { elapsed_seconds: '' }),
      w(THIS, { elapsed_seconds: '1800' }),
    ]);
    expect(figures()[1]).toEqual(['1 h 30', 'total time, 2 of 3']);
  });

  it('says so when no activity has a time', () => {
    show([w(THIS, { elapsed_seconds: '' })]);
    expect(figures()[1]).toEqual(['—', 'no times recorded']);
  });
});

describe('AC6: the split bar', () => {
  const mixed = () => [
    ...Array.from({ length: 3 }, () => w(THIS, { type: 'weight' })),
    w(THIS, { type: 'bike' }),
    w(THIS, { type: 'bike' }),
    w(THIS, { type: 'stretch' }),
  ];

  it('has one segment per type present, sized by count and coloured by its token', () => {
    show(mixed());
    const segs = [...document.querySelectorAll<HTMLElement>('.month-split-seg')];
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.style.flexGrow)).toEqual(['3', '2', '1']);
    expect(segs.map((s) => s.style.background)).toEqual([
      'var(--type-weight)',
      'var(--type-bike)',
      'var(--type-stretch)',
    ]);
  });

  it('names every type and count on the bar and lists them in the legend', () => {
    show(mixed());
    expect(document.querySelector('.month-split')!.getAttribute('aria-label')).toBe(
      'By type: 3 weight, 2 bike, 1 stretch',
    );
    expect([...document.querySelectorAll('.month-legend li')].map((l) => l.textContent)).toEqual([
      '3 weight',
      '2 bike',
      '1 stretch',
    ]);
  });

  it('is left out when only one type is present', () => {
    show([w(THIS), w(THIS)]);
    expect(document.querySelector('.month-split')).toBeNull();
    expect(document.querySelector('.month-legend')).toBeNull();
  });
});

describe('AC7: type chips', () => {
  const mixed = () => [
    w(THIS, { type: 'bike' }),
    w(THIS, { type: 'bike' }),
    w(THIS, { type: 'hike' }),
    w(LAST, { type: 'run' }),
  ];
  const chips = () => [...document.querySelectorAll('.activities-chips .filter-chip[aria-pressed]')];

  it('lists All, then each type with any completed activity in history, in order', () => {
    show(mixed());
    expect(chips().map((c) => c.textContent)).toEqual(['All', 'Bike', 'Hike', 'Run']);
  });

  it('presses exactly one chip at a time', () => {
    show(mixed());
    const pressed = () =>
      chips()
        .filter((c) => c.getAttribute('aria-pressed') === 'true')
        .map((c) => c.textContent);
    expect(pressed()).toEqual(['All']);
    fireEvent.click(screen.getByRole('button', { name: 'Bike' }));
    expect(pressed()).toEqual(['Bike']);
    fireEvent.click(screen.getByRole('button', { name: 'Hike' }));
    expect(pressed()).toEqual(['Hike']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(pressed()).toEqual(['All']);
  });

  it('limits both the list and the summary card to the type, and All clears it', () => {
    show(mixed());
    expect(figures()[0]).toEqual(['3', 'activities']);
    fireEvent.click(screen.getByRole('button', { name: 'Hike' }));
    expect(document.querySelectorAll('.workout-card')).toHaveLength(1);
    expect(figures()[0]).toEqual(['1', 'activity']);
    expect(document.querySelector('.month-split')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('.workout-card')).toHaveLength(3);
    expect(figures()[0]).toEqual(['3', 'activities']);
  });
});

describe('AC8: the Tags chip', () => {
  it('shows and hides the tag row, and counts active tags', () => {
    labels.value = [
      { id: '1', name: 'Heavy', color_key: 'red', created: '', sheetRow: 2 },
      { id: '2', name: 'Light', color_key: 'blue', created: '', sheetRow: 3 },
    ];
    show([w(THIS)]);
    const tags = screen.getByRole('button', { name: 'Tags' });
    expect(tags.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.tag-filter-row')).toBeNull();
    fireEvent.click(tags);
    expect(tags.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.tag-filter-row')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Heavy/ }));
    expect(filterTags.value).toEqual(['Heavy']);
    expect(tags.textContent).toBe('Tags · 1');
    fireEvent.click(tags);
    expect(document.querySelector('.tag-filter-row')).toBeNull();
  });
});

describe('AC9: an empty month', () => {
  it('reads "Nothing logged in <Month> yet" in place of the figures and bar', () => {
    show([w(LAST)]);
    expect(card().textContent).toContain(`Nothing logged in ${monthName(THIS)} yet`);
    expect(figures()).toEqual([]);
    expect(document.querySelector('.month-split')).toBeNull();
  });

  it('names the type under a chip with no match', () => {
    show([w(LAST, { type: 'run' }), w(THIS, { type: 'bike' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(card().textContent).toContain(`No run activities in ${monthName(THIS)} yet`);
  });
});

describe('loading', () => {
  it('shows the header and chips with dashes for the figures and no bar', () => {
    workouts.value = [];
    loading.value = true;
    render(h(ActivitiesScreen, {}));
    expect(monthButton()).toBeTruthy();
    expect(figures().map((f) => f[0])).toEqual(['—', '—']);
    expect(document.querySelector('.month-split')).toBeNull();
  });
});
