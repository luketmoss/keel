// #531 — the activity detail screen's shell: top bar and More actions menu,
// title block, stats card, note card and provenance row.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

const navigate = vi.fn();
const goBack = vi.fn();
vi.mock('../../router/router', async (orig) => ({
  ...(await orig<typeof import('../../router/router')>()),
  navigate: (p: string) => navigate(p),
  goBack: (...a: unknown[]) => goBack(...a),
}));

const deleteWorkout = vi.fn(async () => {});
const copyWorkout = vi.fn(async () => 'w_copy');
vi.mock('../../state/actions', async (orig) => ({
  ...(await orig<typeof import('../../state/actions')>()),
  deleteWorkout: (...a: unknown[]) => (deleteWorkout as (...x: unknown[]) => Promise<void>)(...a),
  copyWorkout: (...a: unknown[]) => (copyWorkout as (...x: unknown[]) => Promise<string>)(...a),
}));

import { WorkoutDetail } from './workout-detail';
import { detailStats } from './detail-stats';
import { detailDateLine } from './detail-title';
import { pendingConfirm } from '../../state/confirm';
import { workouts, sets } from '../../state/store';
import type { WorkoutWithRow, SetWithRow } from '../../api/types';

function wk(over: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    id: 'w1',
    date: '2026-10-18',
    time: '12:04',
    type: 'bike',
    name: 'Gravel Loop',
    template_id: '',
    notes: '',
    elapsed_seconds: '6473',
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
    ...over,
  };
}

const show = (w: WorkoutWithRow) => {
  workouts.value = [w];
  return render(h(WorkoutDetail, { workoutId: w.id }));
};

const SET: SetWithRow = {
  workout_id: 'w1',
  exercise_id: 'ex1',
  exercise_name: 'Squat',
  section: 'primary',
  exercise_order: 1,
  set_number: 1,
  planned_reps: '5',
  weight: '225',
  reps: '5',
  effort: '',
  sheetRow: 2,
};

beforeEach(() => {
  navigate.mockClear();
  goBack.mockClear();
  deleteWorkout.mockClear();
  copyWorkout.mockClear();
});
afterEach(() => {
  pendingConfirm.value?.settle(false);
  cleanup();
  workouts.value = [];
  sets.value = [];
});

const more = () => screen.getByRole('button', { name: 'More actions' });
const menuItems = () => screen.queryAllByRole('menuitem').map((b) => b.textContent);

describe('AC1: the top bar', () => {
  it('shows Back, Edit workout and More actions, and none of the old buttons', () => {
    show(wk());
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit workout' })).toBeTruthy();
    expect(more().getAttribute('aria-haspopup')).toBe('menu');
    expect(more().getAttribute('aria-expanded')).toBe('false');
    for (const old of ['Save Template', 'Copy', 'Edit', 'Delete Workout', '← Back']) {
      expect(screen.queryByText(old)).toBeNull();
    }
  });

  it('Back goes back, and Edit opens the editor, keeping its focus key', () => {
    show(wk());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(goBack).toHaveBeenCalledTimes(1);
    const edit = screen.getByRole('button', { name: 'Edit workout' });
    expect(edit.getAttribute('data-focus-key')).toBe('workout-edit');
    fireEvent.click(edit);
    expect(navigate).toHaveBeenCalledWith('/history/w1/edit');
  });
});

describe('AC2: the More actions menu', () => {
  it('holds only Delete workout for a completed non-weight activity', () => {
    show(wk());
    fireEvent.click(more());
    expect(more().getAttribute('aria-expanded')).toBe('true');
    expect(menuItems()).toEqual(['Delete workout']);
  });

  it('holds Copy workout and Save as template for a completed weight workout with exercises', () => {
    sets.value = [SET];
    show(wk({ type: 'weight' }));
    fireEvent.click(more());
    expect(menuItems()).toEqual(['Copy workout', 'Save as template', 'Delete workout']);
  });

  it('leaves out Save as template without exercises, and both for a plan', () => {
    show(wk({ type: 'weight' }));
    fireEvent.click(more());
    expect(menuItems()).toEqual(['Copy workout', 'Delete workout']);
    cleanup();
    show(wk({ type: 'weight', status: 'planned' }));
    fireEvent.click(more());
    expect(menuItems()).toEqual(['Delete workout']);
  });

  it("Copy workout runs today's copy and opens the copy", async () => {
    show(wk({ type: 'weight' }));
    fireEvent.click(more());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy workout' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/workout/w_copy'));
    expect(copyWorkout).toHaveBeenCalledWith('w1', 'tok');
  });

  it("Delete workout asks first with today's wording, and deletes only on yes", async () => {
    show(wk());
    fireEvent.click(more());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workout' }));
    await waitFor(() => expect(pendingConfirm.value).not.toBeNull());
    expect(pendingConfirm.value!.title).toBe('Delete "Gravel Loop"?');
    expect(pendingConfirm.value!.confirmLabel).toBe('Delete Workout');
    expect(deleteWorkout).not.toHaveBeenCalled();
    pendingConfirm.value!.settle(true);
    await waitFor(() => expect(deleteWorkout).toHaveBeenCalledWith('w1', 'tok'));
    await waitFor(() => expect(goBack).toHaveBeenCalledWith('/activities'));
  });

  it('opens on its first item, and Escape closes it and returns focus to More actions', () => {
    show(wk({ type: 'weight' }));
    fireEvent.click(more());
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it('moves between items with the arrow keys, wrapping, and Home and End', () => {
    show(wk({ type: 'weight' }));
    fireEvent.click(more());
    const [copy, del] = screen.getAllByRole('menuitem');
    fireEvent.keyDown(copy, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(del, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(copy, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(del);
    fireEvent.keyDown(del, { key: 'Home' });
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(copy, { key: 'End' });
    expect(document.activeElement).toBe(del);
  });

  it('closes on Tab and on a press outside', () => {
    show(wk());
    fireEvent.click(more());
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(more());
    expect(screen.queryByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('AC3: the title block', () => {
  it('has the name as the only h1, the date line and the type tile', () => {
    const { container } = show(wk());
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Gravel Loop');
    expect(container.querySelector('.detail-date-line')!.textContent).toBe('Sun, Oct 18 · 12:04 PM');
    expect(container.querySelector('.detail-tile.badge-bike svg')).toBeTruthy();
  });

  it('leaves the time out when none is recorded, and the effort chip out when none is set', () => {
    const { container } = show(wk({ time: '' }));
    expect(container.querySelector('.detail-date-line')!.textContent).toBe('Sun, Oct 18');
    expect(container.querySelector('.workout-effort')).toBeNull();
  });

  it('shows the effort chip when effort is set', () => {
    const { container } = show(wk({ effort: 'Hard' }));
    expect(container.querySelector('.workout-effort-hard')!.textContent).toBe('Hard');
  });

  it('falls back to the type word for a nameless activity', () => {
    const { container } = show(wk({ name: '' }));
    expect(container.querySelector('h1')!.textContent).toBe('bike');
  });

  it('writes the plan and in-progress lines', () => {
    expect(detailDateLine(wk({ status: 'planned', date: '2026-10-21', estimated_seconds: '2700' }))).toBe(
      'Planned for Wed, Oct 21 · about 45 min',
    );
    expect(detailDateLine(wk({ status: 'planned', date: '2026-10-21' }))).toBe('Planned for Wed, Oct 21');
    expect(detailDateLine(wk({ status: 'active' }))).toBe('In progress');
  });
});

describe('AC4-6: the stats card', () => {
  it('heads with the distance in miles to one decimal when there is one', () => {
    const { container } = show(wk({ distance_m: '13500' }));
    expect(container.querySelector('.detail-headline-figure')!.textContent).toBe('8.4');
    expect(container.querySelector('.detail-headline-unit')!.textContent).toBe('mi');
  });

  it('heads with the duration when there is no distance', () => {
    expect(detailStats(wk({ elapsed_seconds: '1980' })).headline).toMatchObject({ value: '33', unit: 'min' });
    expect(detailStats(wk({ elapsed_seconds: '6473' })).headline).toMatchObject({ value: '1:48', unit: 'h' });
    expect(detailStats(wk({ type: 'stretch', elapsed_seconds: '1800' })).headline).toMatchObject({ value: '30' });
  });

  it("draws a bike grid in the design's order, with Avg speed", () => {
    const d = detailStats(
      wk({
        distance_m: '13500',
        elapsed_seconds: '6473',
        moving_seconds: '6000',
        avg_hr: '142',
        ascent_m: '494',
        descent_m: '500',
        calories: '1234',
      }),
    );
    expect(d.cells.map((c) => [c.label, c.value, c.unit])).toEqual([
      ['Activity time', '1:47:53', ''],
      ['Avg speed', '4.7', 'mph'],
      ['Avg heart rate', '142', 'bpm'],
      ['Elev gain', '1,620', 'ft'],
      ['Elev loss', '1,640', 'ft'],
      ['Calories', '1,234', 'kcal'],
      ['Moving time', '1:40:00', ''],
    ]);
    expect(d.cells[1].spoken).toBe('4.7 miles per hour');
  });

  it('shows Avg pace per mile for a hike, run or walk', () => {
    for (const type of ['hike', 'run', 'walk'] as const) {
      const d = detailStats(wk({ type, distance_m: '4828', elapsed_seconds: '2700' }));
      const pace = d.cells.find((c) => c.label === 'Avg pace')!;
      expect(pace).toMatchObject({ value: '15:00', unit: '/mi', spoken: '15 minutes per mile' });
      expect(d.cells.find((c) => c.label === 'Avg speed')).toBeUndefined();
    }
  });

  it('leaves speed and pace out when distance or elapsed time is blank', () => {
    expect(detailStats(wk({ elapsed_seconds: '', distance_m: '4828' })).cells).toEqual([]);
    expect(detailStats(wk({ elapsed_seconds: '2700', distance_m: '' })).cells).toEqual([]);
  });

  it('leaves out Activity time when the duration is the headline, and Moving time when it matches', () => {
    const d = detailStats(wk({ elapsed_seconds: '1980', moving_seconds: '1990' }));
    expect(d.cells.map((c) => c.label)).toEqual([]);
  });

  it('never draws a zero or a dash', () => {
    const { container } = show(
      wk({ distance_m: '', elapsed_seconds: '1980', avg_hr: '0', ascent_m: '0', descent_m: '0', calories: '0' }),
    );
    expect(container.querySelector('.detail-stats-grid')).toBeNull();
    expect(container.querySelector('.detail-stats-card')!.textContent).not.toMatch(/—|\b0\b/);
  });

  it("puts the unit in each value's accessible name", () => {
    show(wk({ distance_m: '13500', avg_hr: '142' }));
    expect(screen.getByRole('img', { name: '8.4 miles' })).toBeTruthy();
    expect(screen.getByRole('img', { name: '142 beats per minute' })).toBeTruthy();
  });

  it('is not drawn for a plan or an active workout, weight or not', () => {
    for (const over of [
      { type: 'weight' as const, status: 'planned' },
      { status: 'planned' },
      { status: 'active' },
      { type: 'weight' as const, status: 'active' },
    ]) {
      const { container } = show(wk(over));
      expect(container.querySelector('.detail-stats-card, .detail-no-details')).toBeNull();
      cleanup();
    }
  });
});

describe('AC9: nothing to show', () => {
  it('says "No details recorded" in place of the card', () => {
    const { container } = show(wk({ elapsed_seconds: '' }));
    expect(container.querySelector('.detail-stats-card')).toBeNull();
    expect(container.querySelector('.detail-no-details')!.textContent).toBe('No details recorded');
  });
});

describe('AC7: the note card', () => {
  it('shows the note with its line breaks kept, under its own heading', () => {
    const { container } = show(wk({ notes: 'Muddy.\nSecond lap fast.' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Note' })).toBeTruthy();
    const text = container.querySelector('.detail-notes') as HTMLElement;
    expect(text.textContent).toBe('Muddy.\nSecond lap fast.');
    expect(text.classList.contains('detail-notes')).toBe(true);
  });

  it('shows no card without a note', () => {
    const { container } = show(wk({ notes: '  ' }));
    expect(container.querySelector('.detail-note-card')).toBeNull();
  });
});

describe('AC10: planned and in-progress workouts', () => {
  it('keep Start workout and gain the top bar and title block', () => {
    const { container } = show(wk({ status: 'planned', type: 'weight', date: '2026-10-21' }));
    expect(screen.getByRole('button', { name: 'Start Workout' })).toBeTruthy();
    expect(container.querySelector('.detail-top-bar')).toBeTruthy();
    expect(container.querySelector('h1')!.textContent).toBe('Gravel Loop');
    expect(container.querySelector('.workout-effort')).toBeNull();
  });
});
