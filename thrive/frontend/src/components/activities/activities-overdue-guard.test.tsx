// #347 AC2 regression guard: carrying overdue plans onto the Day view's today
// changes nothing on the Activities page. Its Planned section still lists a
// past-dated plan once, on its own date, marked overdue through `isOverdue`.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

import { ActivitiesScreen } from './activities-screen';
import { isOverdue } from './activities-helpers';
import { workouts, sets, exercises, activitiesMonth } from '../../state/store';
import type { WorkoutWithRow } from '../../api/types';

function wk(over: Partial<WorkoutWithRow>): WorkoutWithRow {
  return {
    id: 'w1',
    date: '2026-09-30',
    time: '',
    type: 'weight',
    name: '',
    template_id: '',
    notes: '',
    elapsed_seconds: '',
    created: '',
    copied_from: '',
    status: 'planned',
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
    sheetRow: 2,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T12:00:00'));
  activitiesMonth.value = '2026-09';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
});

describe('#347 AC2 — the Activities plans are unchanged', () => {
  it('isOverdue keeps its meaning: strictly before today', () => {
    expect(isOverdue('2026-09-29', '2026-09-30')).toBe(true);
    expect(isOverdue('2026-09-30', '2026-09-30')).toBe(false);
    expect(isOverdue('2026-10-01', '2026-09-30')).toBe(false);
  });

  it("lists a missed plan once, first, as overdue, and today's as planned, in Up next (#528)", () => {
    workouts.value = [
      wk({ id: 'old', name: 'Missed Pull', date: '2026-09-27', sheetRow: 2 }),
      wk({ id: 'now', name: 'Today Push', date: '2026-09-30', sheetRow: 3 }),
    ];
    const { container } = render(h(ActivitiesScreen, {}));
    const cards = [...container.querySelectorAll<HTMLButtonElement>('.up-next-row button.up-next-card')];
    expect(cards.map((c) => c.querySelector('.up-next-name')!.textContent)).toEqual(['Missed Pull', 'Today Push']);
    expect(cards[0].getAttribute('aria-label')).toContain('Missed Pull, overdue, was planned for Sunday September 27');
    expect(cards[0].querySelector('.badge-overdue')!.textContent).toBe('Overdue');
    expect(cards[0].querySelector('.up-next-date')!.textContent).toBe('Overdue SEP 27');
    expect(cards[1].getAttribute('aria-label')).toContain('Today Push, planned for Wednesday September 30');
    expect(cards[1].querySelector('.up-next-date')!.textContent).toBe('TODAY');
    // No Day-view actions here.
    expect(container.querySelector('.training-overdue')).toBeNull();
  });
});
