// #772 — a planned bike's Spin workout: the edit form's picker (change, clear, and never on a completed
// ride), the detail screen's line, and the Day screen left as it was.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const saveSimpleWorkoutEdits = vi.fn(async (_id: string, _patch: unknown, _token: string) => {});
vi.mock('../../state/actions', () => ({
  saveSimpleWorkoutEdits: (id: string, patch: unknown, token: string) => saveSimpleWorkoutEdits(id, patch, token),
  deleteWorkout: vi.fn(),
  copyWorkout: vi.fn(),
  saveWorkoutAsTemplate: vi.fn(),
  startPlannedWorkout: vi.fn(),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));
const goBack = vi.fn();
vi.mock('../../router/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../router/router')>()),
  navigate: vi.fn(),
  goBack: (...a: unknown[]) => goBack(...a),
}));
const sheetsGet = vi.fn();
vi.mock('../../api/sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/sheets')>()),
  sheetsGet: (...a: unknown[]) => sheetsGet(...a),
  withReauth: (token: string, fn: (t: string) => Promise<unknown>) => fn(token),
}));

import { EditWorkoutForm } from './edit-workout-form';
import { WorkoutDetail } from './workout-detail';
import { resetRideLibrary } from '../../spin/ride-library';
import { workouts } from '../../state/store';
import type { WorkoutWithRow } from '../../api/types';
import { DEMO_WORKOUTS } from '../../api/demo-data';

const LIBRARY = [
  ['rw_1', 'Sweet Spot 3×12', 'Sweet spot', '', '', '3600', '', ''],
  ['rw_2', 'Endurance 75', 'Endurance', '', '', '4500', '', ''],
];

const base = DEMO_WORKOUTS.find((w) => w.id === 'w_demo018')!;
const plan = (over: Partial<WorkoutWithRow> = {}): WorkoutWithRow => ({
  ...base,
  id: 'w_plan',
  type: 'bike',
  status: 'planned',
  source: '',
  source_activity_id: '',
  ride_workout_id: 'rw_1',
  ...over,
});
const done = (over: Partial<WorkoutWithRow> = {}) => plan({ status: '', elapsed_seconds: '1800', ...over });

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const button = (c: ParentNode, label: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLElement;
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"] [role="radio"]')];
const spinButton = (c: ParentNode) => c.querySelector<HTMLElement>('.spin-pick-btn');

beforeEach(() => {
  vi.clearAllMocks();
  resetRideLibrary();
  sheetsGet.mockResolvedValue(LIBRARY);
});
afterEach(cleanup);

describe('the edit form', () => {
  it('shows the picker on a planned bike with its current selection, between Date and Duration', async () => {
    workouts.value = [plan()];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    await waitFor(() => expect(text(spinButton(container))).toBe('Sweet Spot 3×12›'));
    const order = [...container.querySelectorAll('label, .form-label')].map((l) => text(l));
    expect(order.indexOf('Date')).toBeLessThan(order.indexOf('Spin workout (optional)'));
    expect(order.indexOf('Spin workout (optional)')).toBeLessThan(order.indexOf('Duration (minutes)'));
  });

  it('shows None for a plan with no link, including one the MCP wrote', () => {
    workouts.value = [plan({ ride_workout_id: '', sub_type: '' })];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    expect(text(spinButton(container))).toBe('None›');
    expect(sheetsGet).not.toHaveBeenCalled();
  });

  it('saves a change to the link, and only that', async () => {
    workouts.value = [plan()];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    fireEvent.click(spinButton(container)!);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    fireEvent.click(rows()[1]);
    fireEvent.click(button(container, 'Save Changes'));
    await waitFor(() => expect(saveSimpleWorkoutEdits).toHaveBeenCalledTimes(1));
    expect(saveSimpleWorkoutEdits.mock.calls[0][1]).toEqual({ ride_workout_id: 'rw_2' });
  });

  it('saves a clear as an empty link', async () => {
    workouts.value = [plan()];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    fireEvent.click(spinButton(container)!);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(rows()[0]);
    expect(text(spinButton(container))).toBe('None›');
    fireEvent.click(button(container, 'Save Changes'));
    await waitFor(() => expect(saveSimpleWorkoutEdits).toHaveBeenCalled());
    expect(saveSimpleWorkoutEdits.mock.calls[0][1]).toEqual({ ride_workout_id: '' });
  });

  it('does not rewrite an untouched link', async () => {
    workouts.value = [plan()];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    await waitFor(() => expect(text(spinButton(container))).toBe('Sweet Spot 3×12›'));
    fireEvent.input(container.querySelector('#edit-name')!, { target: { value: 'Renamed' } });
    fireEvent.click(button(container, 'Save Changes'));
    await waitFor(() => expect(saveSimpleWorkoutEdits).toHaveBeenCalled());
    expect(saveSimpleWorkoutEdits.mock.calls[0][1]).toEqual({ name: 'Renamed' });
  });

  it('says the workout was removed, with None selected in the picker, and keeps the id if nothing changes', async () => {
    workouts.value = [plan({ ride_workout_id: 'rw_gone' })];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    await waitFor(() => expect(text(container.querySelector('.spin-pick-status'))).toBe('Removed from your library'));
    expect(text(spinButton(container))).toBe('None›');
    fireEvent.click(spinButton(container)!);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows()[0].getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(button(container, 'Save Changes'));
    await waitFor(() => expect(saveSimpleWorkoutEdits).toHaveBeenCalled());
    expect(saveSimpleWorkoutEdits.mock.calls[0][1]).toEqual({});
  });

  it('has no picker on a completed bike, and saving it leaves the link out of the write', async () => {
    workouts.value = [done({ source: 'spin' })];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    expect(container.querySelector('.spin-pick-btn')).toBeNull();
    expect(text(container)).not.toContain('Spin workout');
    fireEvent.input(container.querySelector('#edit-name')!, { target: { value: 'Renamed' } });
    fireEvent.click(button(container, 'Save Changes'));
    await waitFor(() => expect(saveSimpleWorkoutEdits).toHaveBeenCalled());
    expect(saveSimpleWorkoutEdits.mock.calls[0][1]).toEqual({ name: 'Renamed' });
    expect(sheetsGet).not.toHaveBeenCalled();
  });

  it('has no picker on a planned run', () => {
    workouts.value = [plan({ type: 'run', ride_workout_id: '' })];
    const { container } = render(<EditWorkoutForm workoutId="w_plan" />);
    expect(container.querySelector('.spin-pick-btn')).toBeNull();
  });
});

describe('the detail screen', () => {
  const line = (c: ParentNode) => text(c.querySelector('.detail-spin-workout'));

  it("names a planned bike's Spin workout with its category and length", async () => {
    workouts.value = [plan()];
    const { container } = render(<WorkoutDetail workoutId="w_plan" />);
    await waitFor(() => expect(line(container)).toBe('Spin workout: Sweet Spot 3×12 · Sweet spot · 1 h'));
  });

  it('says it was removed when the id is no longer in the library', async () => {
    workouts.value = [plan({ ride_workout_id: 'rw_gone' })];
    const { container } = render(<WorkoutDetail workoutId="w_plan" />);
    await waitFor(() => expect(line(container)).toBe('Spin workout removed from your library'));
  });

  it('says it could not load it when the read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sheetsGet.mockRejectedValue(new Error('503'));
    workouts.value = [plan()];
    const { container } = render(<WorkoutDetail workoutId="w_plan" />);
    await waitFor(() => expect(line(container)).toBe("Spin workout: Couldn't load it"));
  });

  it('shows no line while the library loads, and none with no link, and reads nothing with no link', async () => {
    sheetsGet.mockReturnValue(new Promise(() => {}));
    workouts.value = [plan()];
    const loading = render(<WorkoutDetail workoutId="w_plan" />);
    await waitFor(() => expect(sheetsGet).toHaveBeenCalled());
    expect(line(loading.container)).toBeUndefined();
    cleanup();
    resetRideLibrary();
    sheetsGet.mockClear();
    workouts.value = [plan({ ride_workout_id: '' })];
    const none = render(<WorkoutDetail workoutId="w_plan" />);
    expect(line(none.container)).toBeUndefined();
    expect(sheetsGet).not.toHaveBeenCalled();
  });

  it("does not add the line to a completed ride's detail, which has its Ride card for that", () => {
    workouts.value = [done()];
    const { container } = render(<WorkoutDetail workoutId="w_plan" />);
    expect(container.querySelector('.detail-spin-workout')).toBeNull();
  });
});

describe('the Day screen', () => {
  it('is untouched: nothing under components/day mentions the Spin workout', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../day');
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(readFileSync(join(dir, f), 'utf-8'), f).not.toMatch(/ride_workout_id|ride-library|spin-picker/);
    }
  });
});
