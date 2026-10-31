// #690 — trails from the real data: the three states on the activity, the notes on
// search and on the Trail screen, the failed-read state, and a refresh swapping cells.
// Signed in (isDemo false) throughout, over the demo rows' cells.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../../api/demo-data')>()),
  isDemo: () => false,
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

const navigate = vi.fn();
vi.mock('../../router/router', async (orig) => ({
  ...(await orig<typeof import('../../router/router')>()),
  navigate: (p: string) => navigate(p),
  goBack: vi.fn(),
}));

const loadInitialData = vi.fn();
vi.mock('../../state/actions', async (orig) => ({
  ...(await orig<typeof import('../../state/actions')>()),
  loadInitialData: (t: string) => loadInitialData(t),
}));

import { shiftDemoWorkouts } from '../../api/demo-data';
import { encodeTrailsCell } from '../../api/demo-trails';
import { workouts, loadFailed } from '../../state/store';
import { trailQuery } from '../../state/trails';
import { WorkoutDetail } from '../activities/workout-detail';
import { ActivitiesScreen } from '../activities/activities-screen';
import { TrailScreen } from './trail-screen';
import { trailPath } from '../../trails/groups';
import type { TrailPass } from '../../trails/types';

const pass = (trail: string, metres = 3000): TrailPass => ({
  trail,
  metres,
  durationS: 600,
  climbM: 40,
  startPct: 0,
  endPct: 100,
  direction: 'forward',
  entryOffsetS: 60,
});

/** The demo rows with the given cells set, and every other cell blank. */
function setCells(cells: Record<string, string>) {
  workouts.value = shiftDemoWorkouts(new Date()).map((w) => ({ ...w, trails: cells[w.id] ?? '' }));
}

beforeEach(() => {
  trailQuery.value = '';
  loadFailed.value = false;
  navigate.mockClear();
  loadInitialData.mockClear();
});
afterEach(cleanup);

describe('the activity, by its own cell', () => {
  it('a tracked activity with a blank cell: the line, not a card, not a button', () => {
    setCells({});
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    const line = document.querySelector('.trail-status')!;
    expect(line.tagName).toBe('P');
    expect(line.textContent).toBe('Trails not tagged yet');
    expect(line.closest('button')).toBeNull();
    expect(document.querySelector('.trail-card')).toBeNull();
  });

  it('an unreadable cell: its line, and the raw cell is never shown', () => {
    setCells({ w_demo011: '{"v":2,"secret":"RAWCELL"}' });
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(document.querySelector('.trail-status')!.textContent).toBe("Trails couldn't be read");
    expect(document.body.textContent).not.toContain('RAWCELL');
  });

  it('tagged with no passes, a blank cell with no track, and a planned activity show nothing', () => {
    setCells({ w_demo011: encodeTrailsCell({ passes: [], unmatchedM: 5 }) });
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(document.querySelector('.trail-card, .trail-status')).toBeNull();
    cleanup();
    render(h(WorkoutDetail, { workoutId: 'w_demo003' })); // no track
    expect(document.querySelector('.trail-card, .trail-status')).toBeNull();
    cleanup();
    const planned = workouts.value.find((w) => w.status === 'planned')!;
    setCells({ [planned.id]: '' });
    workouts.value = workouts.value.map((w) => (w.id === planned.id ? { ...w, track_ref: 'x' } : w));
    render(h(WorkoutDetail, { workoutId: planned.id }));
    expect(document.querySelector('.trail-card, .trail-status')).toBeNull();
  });

  it('a pass left out: the footer says so, singular and plural', () => {
    setCells({ w_demo011: encodeTrailsCell({ passes: [pass('Juniper Ridge')], unmatchedM: 0, omitted: 1 }) });
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByText("1 short pass isn't shown")).toBeTruthy();
    cleanup();
    setCells({ w_demo011: encodeTrailsCell({ passes: [pass('Juniper Ridge')], unmatchedM: 0, omitted: 3 }) });
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByText("3 short passes aren't shown")).toBeTruthy();
  });

  it('a refresh that swaps the workouts turns the line into the card, with no reload', async () => {
    setCells({});
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByText('Trails not tagged yet')).toBeTruthy();
    setCells({ w_demo011: encodeTrailsCell({ passes: [pass('Juniper Ridge')], unmatchedM: 0 }) });
    await waitFor(() => expect(screen.queryByText('Trails not tagged yet')).toBeNull());
    expect(document.querySelector('.trail-card')).not.toBeNull();
  });
});

describe('search', () => {
  const field = () => screen.queryByRole('searchbox', { name: 'Search trails' }) as HTMLInputElement | null;

  it('has no field with nothing tagged, or with only tagged-with-no-trail', () => {
    setCells({});
    render(h(ActivitiesScreen, {}));
    expect(field()).toBeNull();
    cleanup();
    setCells({ w_demo011: encodeTrailsCell({ passes: [], unmatchedM: 5 }) });
    render(h(ActivitiesScreen, {}));
    expect(field()).toBeNull();
  });

  it('ends the results and the no-match line with the note, which does not change as the user types', () => {
    setCells({
      w_demo011: encodeTrailsCell({ passes: [pass('Juniper Ridge')], unmatchedM: 0 }),
      w_demo021: '',
      w_demo027: '{"v":2}',
    });
    render(h(ActivitiesScreen, {}));
    fireEvent.input(field()!, { target: { value: 'juniper' } });
    const note = () => document.querySelector('.trail-untagged')!.textContent;
    const expected = "2 activities not tagged yet. Their trails aren't listed. 1 activity's trails couldn't be read.";
    // Tracked, blank: the demo has several tracked rows; count them from the rows.
    const untagged = workouts.value.filter((w) => !w.status && w.track_ref && w.trails === '').length;
    expect(untagged).toBeGreaterThan(0);
    expect(note()).toMatch(/not tagged yet\. Their trails aren't listed\. 1 activity's trails couldn't be read\.$/);
    expect(note()).toBe(expected.replace('2 activities', `${untagged} activities`));
    fireEvent.input(field()!, { target: { value: 'juniper x' } });
    expect(screen.getByText('No trails match “juniper x”')).toBeTruthy();
    expect(note()).toBe(expected.replace('2 activities', `${untagged} activities`));
  });

  it('opens a trail whose name holds /, % and &', () => {
    setCells({ w_demo011: encodeTrailsCell({ passes: [pass('Fox/Hollow 100% & Co')], unmatchedM: 0 }) });
    render(h(ActivitiesScreen, {}));
    fireEvent.input(field()!, { target: { value: 'fox' } });
    fireEvent.click(document.querySelector('.trail-result')!);
    const path = navigate.mock.calls[0][0] as string;
    expect(path).toBe(trailPath('fox/hollow 100% & co'));
    expect(path).toBe('/trail/fox%2Fhollow%20100%25%20%26%20co');
    cleanup();
    render(h(TrailScreen, { trailKey: 'fox/hollow 100% & co' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Fox/Hollow 100% & Co');
  });
});

describe('the Trail screen', () => {
  const ride = (n: number) => encodeTrailsCell({ passes: [pass('Juniper Ridge')], unmatchedM: n });
  const note = () => document.querySelector('.trail-untagged')?.textContent ?? null;

  it('says nothing when everything is tagged or has no track', () => {
    setCells({ w_demo011: ride(1) });
    // Every other tracked demo row is blank: blank them of their track, so none counts.
    workouts.value = workouts.value.map((w) => (w.id === 'w_demo011' ? w : { ...w, track_ref: '' }));
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    expect(note()).toBeNull();
  });

  it('newer untagged activities: the may-not-be-the-last-time note, between Last time and Every time', () => {
    // w_demo034 is the oldest; the others, tracked and blank, are newer.
    setCells({ w_demo034: ride(1) });
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    expect(note()).toMatch(/^\d+ newer activities not tagged yet, so this may not be the last time\.$/);
    const last = screen.getByRole('heading', { name: 'Last time' }).closest('section')!;
    expect(last.nextElementSibling!.classList.contains('trail-untagged')).toBe(true);
  });

  it('only older untagged activities: the may-have-been note; and the unreadable sentence follows', () => {
    setCells({ w_demo011: ride(1), w_demo021: '{"v":2}' });
    workouts.value = workouts.value.map((w) =>
      w.id === 'w_demo011' || w.id === 'w_demo021' ? w : { ...w, track_ref: '' },
    );
    workouts.value = workouts.value.map((w) => (w.id === 'w_demo034' ? { ...w, track_ref: 'r' } : w));
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    expect(note()).toBe(
      "1 activity not tagged yet. It may have been on this trail. 1 activity's trails couldn't be read.",
    );
  });

  it('an unknown key: not found, and says when untagged activities may hold it', () => {
    setCells({ w_demo011: ride(1) });
    workouts.value = workouts.value.map((w) =>
      w.id === 'w_demo011' || w.id === 'w_demo034' ? { ...w, track_ref: 'r' } : { ...w, track_ref: '' },
    );
    render(h(TrailScreen, { trailKey: 'nowhere' }));
    expect(screen.getByText('Trail not found')).toBeTruthy();
    expect(screen.getByText('1 activity not tagged yet, so it may be in there.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Activities' })).toBeTruthy();
  });

  it('a failed initial read: its own message, Try again runs the initial load, Back goes to Activities', () => {
    workouts.value = [];
    loadFailed.value = true;
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    expect(screen.getByText("Couldn't load your activities, so trails can't be shown.")).toBeTruthy();
    expect(screen.queryByText('Trail not found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(loadInitialData).toHaveBeenCalledWith('tok');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Activities' }));
    expect(navigate).toHaveBeenCalledWith('/activities');
  });

  it('shows the trail, not the failure, once the read succeeds', async () => {
    workouts.value = [];
    loadFailed.value = true;
    render(h(TrailScreen, { trailKey: 'juniper ridge' }));
    setCells({ w_demo011: ride(1) });
    loadFailed.value = false;
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Juniper Ridge');
  });
});
