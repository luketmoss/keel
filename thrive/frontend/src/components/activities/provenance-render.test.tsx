// #157 AC1/AC2 — the provenance mark on the Activities card and the line on
// the detail screen, rendered.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

import { ActivitiesScreen } from './activities-screen';
import { WorkoutDetail } from './workout-detail';
import { workouts, sets, exercises, activitiesMonth } from '../../state/store';
import { toLocalDateStr } from './activities-helpers';
import { formatLocalStamp } from '../../api/provenance';
import type { WorkoutWithRow } from '../../api/types';

function makeWorkout(overrides: Partial<WorkoutWithRow>): WorkoutWithRow {
  return {
    id: 'w1',
    date: '2026-09-20',
    time: '08:10',
    type: 'hike',
    name: 'Ridge Trail',
    template_id: '',
    notes: '',
    elapsed_seconds: '5143',
    created: '',
    copied_from: '',
    status: '',
    moving_seconds: '',
    effort: '',
    distance_m: '6512',
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
    ...overrides,
  };
}

const synced = makeWorkout({
  id: 'w_s',
  name: 'Synced Hike',
  source: 'coros',
  source_activity_id: '4721',
  synced_at: '2026-09-20T18:00:00.000Z',
});
const enriched = makeWorkout({
  id: 'w_e',
  name: 'Leg Day',
  type: 'weight',
  elapsed_seconds: '3947',
  distance_m: '',
  source_activity_id: '4722',
  synced_at: '2026-09-19T15:02:37.000Z',
  sheetRow: 3,
});
const manual = makeWorkout({ id: 'w_m', name: 'Manual Walk', type: 'walk', sheetRow: 4 });

function card(name: string): HTMLElement {
  return screen.getByText(new RegExp(`· ${name}$`)).closest('button') as HTMLElement;
}

afterEach(() => {
  cleanup();
  activitiesMonth.value = toLocalDateStr(new Date()).slice(0, 7);
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
});

describe('AC1: provenance on the card (#528: spoken, not drawn)', () => {
  function renderList() {
    workouts.value = [synced, enriched, manual];
    activitiesMonth.value = '2026-09';
    render(h(ActivitiesScreen, {}));
  }

  it('draws no provenance mark and no chip on any card', () => {
    renderList();
    expect(document.querySelector('.provenance-mark')).toBeNull();
    expect(document.querySelectorAll('.workout-card .type-badge')).toHaveLength(0);
  });

  it("speaks provenance last in the card's single label", () => {
    renderList();
    expect(card('Synced Hike').getAttribute('aria-label')).toBe(
      'Synced Hike, hike, Sunday September 20, 4.0 miles, 1 hour 25 minutes, 21 minutes 11 seconds per mile, synced from COROS',
    );
    expect(card('Leg Day').getAttribute('aria-label')).toBe(
      'Leg Day, weight, Sunday September 20, 1 hour 6 minutes, logged by hand, enriched from COROS',
    );
    expect(card('Manual Walk').getAttribute('aria-label')).toBe(
      'Manual Walk, walk, Sunday September 20, 4.0 miles, 1 hour 25 minutes, 21 minutes 11 seconds per mile',
    );
  });
});

describe('AC2: the detail line', () => {
  it('says synced from COROS with the last-synced time', () => {
    workouts.value = [synced];
    render(h(WorkoutDetail, { workoutId: 'w_s' }));
    expect(document.querySelector('.detail-provenance')!.textContent).toBe(
      `Synced from COROS · last synced ${formatLocalStamp(synced.synced_at)}`,
    );
  });

  it('says logged by hand, enriched from COROS on an enriched workout', () => {
    workouts.value = [enriched];
    render(h(WorkoutDetail, { workoutId: 'w_e' }));
    expect(document.querySelector('.detail-provenance')!.textContent).toBe(
      `Logged by hand · enriched from COROS ${formatLocalStamp(enriched.synced_at)}`,
    );
  });

  it('shows no line for a manual workout', () => {
    workouts.value = [manual];
    render(h(WorkoutDetail, { workoutId: 'w_m' }));
    expect(document.querySelector('.detail-provenance')).toBeNull();
  });
});
