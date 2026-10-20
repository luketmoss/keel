// #529 — the muscle figure on weight cards and the stretch figure on stretch cards.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { h } from 'preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));
vi.mock('../../router/router', () => ({ navigate: vi.fn() }));

import { ActivitiesScreen } from './activities-screen';
import { workedGroups, spokenGroups } from './muscle-regions';
import { workouts, sets, exercises, activitiesMonth, filterType, loading } from '../../state/store';
import type { ExerciseWithRow, SetWithRow, WorkoutWithRow } from '../../api/types';

function workout(id: string, type: WorkoutWithRow['type'], name: string): WorkoutWithRow {
  return {
    id,
    date: '2026-10-20',
    time: '08:00',
    type,
    name,
    template_id: '',
    notes: '',
    elapsed_seconds: '1980',
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
    sheetRow: 2,
  };
}

const ex = (id: string, tags: string): ExerciseWithRow => ({
  id,
  name: id,
  tags,
  notes: '',
  created: '',
  sheetRow: 2,
});

let order = 0;
const set = (workout_id: string, exercise_id: string, section = 'primary'): SetWithRow => ({
  workout_id,
  exercise_id,
  exercise_name: exercise_id,
  section,
  exercise_order: (order += 1),
  set_number: 1,
  planned_reps: '',
  weight: '',
  reps: '',
  effort: '',
  sheetRow: 2,
});

describe('workedGroups and spokenGroups', () => {
  it('reads tags case-insensitively, trims them, ignores other tags, and returns figure order', () => {
    const list = [ex('a', ' LEGS , push,BB'), ex('b', 'Chest, Core'), ex('c', 'Compound')];
    const rows = [set('w', 'a'), set('w', 'b'), set('w', 'c')];
    expect(workedGroups(rows, list)).toEqual(['chest', 'core', 'legs']);
  });

  it('drops warm-up rows, so a warm-up-only tag shades nothing', () => {
    const list = [ex('a', 'Shoulders'), ex('b', 'Back')];
    expect(workedGroups([set('w', 'a', 'warmup'), set('w', 'b')], list)).toEqual(['back']);
    expect(workedGroups([set('w', 'a', 'warmup')], list)).toEqual([]);
  });

  it('speaks the groups like a sentence', () => {
    expect(spokenGroups(['back'])).toBe('back');
    expect(spokenGroups(['back', 'arms'])).toBe('back and arms');
    expect(spokenGroups(['shoulders', 'chest', 'arms'])).toBe('shoulders, chest and arms');
  });
});

function show(list: WorkoutWithRow[]) {
  workouts.value = list;
  loading.value = false;
  return render(h(ActivitiesScreen, {}));
}
const cardOf = (id: string) => document.querySelector<HTMLButtonElement>(`[data-focus-key="workout:${id}"]`)!;
const lit = (c: Element) => c.querySelectorAll('.fig-on').length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:00'));
  activitiesMonth.value = '2026-10';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
  filterType.value = null;
});

describe('the muscle figure on a weight card', () => {
  it('replaces the tile and shades Back in the back view only, naming it in the card label', () => {
    exercises.value = [ex('row', 'Pull, Back')];
    sets.value = [set('w1', 'row')];
    show([workout('w1', 'weight', 'Pull Day')]);
    const c = cardOf('w1');
    expect(c.querySelector('.activity-tile')).toBeNull();
    const svg = c.querySelector('svg.activity-figure')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 92 80');
    expect(lit(c)).toBe(1);
    const backView = svg.querySelectorAll('g')[1];
    expect(backView.querySelectorAll('.fig-on').length).toBe(1);
    expect(c.getAttribute('aria-label')).toMatch(/, worked back$/);
  });

  it('shades Shoulders, Arms, Legs and Core in both views, in figure order in the label', () => {
    exercises.value = [ex('a', 'Legs'), ex('b', 'Arms, Shoulders'), ex('c', 'Core')];
    sets.value = [set('w1', 'a'), set('w1', 'b'), set('w1', 'c')];
    show([workout('w1', 'weight', 'Full body')]);
    const c = cardOf('w1');
    // shoulders 2x2, arms 4x2, core 1x2, legs 2x2; chest and back stay unlit
    expect(lit(c)).toBe(4 + 8 + 2 + 4);
    expect(c.getAttribute('aria-label')).toMatch(/, worked shoulders, arms, core and legs$/);
  });

  it('keeps the type tile when only a warm-up carries a tag, or no tag matches, or there are no sets', () => {
    exercises.value = [ex('a', 'Chest'), ex('b', 'Push, DB')];
    sets.value = [set('w1', 'a', 'warmup'), set('w2', 'b')];
    show([workout('w1', 'weight', 'One'), workout('w2', 'weight', 'Two'), workout('w3', 'weight', 'Three')]);
    for (const id of ['w1', 'w2', 'w3']) {
      expect(cardOf(id).querySelector('.activity-tile')).toBeTruthy();
      expect(cardOf(id).querySelector('svg.activity-figure')).toBeNull();
      expect(cardOf(id).getAttribute('aria-label')).not.toMatch(/worked/);
    }
  });

  it('shows the tile, never an empty figure, while data is loading', () => {
    exercises.value = [ex('a', 'Chest')];
    sets.value = [set('w1', 'a')];
    workouts.value = [workout('w1', 'weight', 'One')];
    loading.value = true;
    render(h(ActivitiesScreen, {}));
    expect(cardOf('w1').querySelector('.activity-tile')).toBeTruthy();
    expect(cardOf('w1').querySelector('svg.activity-figure')).toBeNull();
  });
});

describe('the stretch figure', () => {
  it('replaces the tile on every stretch card, hidden from assistive technology, name unchanged', () => {
    show([workout('s1', 'stretch', 'Evening Stretch')]);
    const c = cardOf('s1');
    expect(c.querySelector('.activity-tile')).toBeNull();
    const svg = c.querySelector('svg.activity-figure')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelectorAll('.fig-stretch').length).toBeGreaterThan(0);
    expect(svg.querySelectorAll('.fig-on, .fig-off').length).toBe(0);
    expect(c.getAttribute('aria-label')).not.toMatch(/worked/);
  });
});

describe('colours', () => {
  const css = readFileSync(resolve(__dirname, '../../global.css'), 'utf8').replace(/\r\n/g, '\n');

  it('draws lit regions in --type-weight, unlit in --color-border and the stretch in --type-stretch', () => {
    expect(css).toMatch(/\.activity-figure \.fig-on \{\s*fill: var\(--type-weight\);/);
    expect(css).toMatch(/\.activity-figure \.fig-off \{\s*fill: var\(--color-border\);/);
    expect(css).toMatch(/\.activity-figure \.fig-stretch \{\s*fill: var\(--type-stretch\);/);
  });

  it('maps them to CanvasText and GrayText under forced colours', () => {
    const block = css.slice(css.indexOf('@media (forced-colors: active) {\n  /* #529'));
    expect(block).toMatch(/\.fig-on,\s*\.activity-figure \.fig-stretch \{\s*fill: CanvasText;/);
    expect(block).toMatch(/\.fig-off \{\s*fill: GrayText;/);
  });
});
