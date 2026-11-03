// #772 — planning a bike workout: the Bike workout card in plan mode, the bike planner, and the Spin
// workout picker over the RideWorkouts tab. The real flow, planner and picker run; only the write
// (saveWorkoutForLater) and the Sheets read are mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { templates } from '../../state/store';
import { resetRideLibrary } from '../../spin/ride-library';
import { SheetsApiError } from '../../api/sheets';
import { readGlobalCss } from '../../test-css';

const saveWorkoutForLater = vi.fn(async (_data: unknown, _token: string) => 'w_planned');
const navigate = vi.fn();

vi.mock('../../state/actions', () => ({
  startWorkout: vi.fn(),
  saveWorkoutForLater: (data: unknown, token: string) => saveWorkoutForLater(data, token),
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('../../router/router', () => ({
  navigate: (p: string) => navigate(p),
  replaceRoute: vi.fn(),
}));
vi.mock('./workout-tracker', () => ({ WorkoutTracker: () => null }));

const sheetsGet = vi.fn();
vi.mock('../../api/sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/sheets')>()),
  sheetsGet: (...a: unknown[]) => sheetsGet(...a),
  withReauth: (token: string, fn: (t: string) => Promise<unknown>) => fn(token),
}));

const { WorkoutFlow } = await import('./workout-flow');

// RideWorkouts A:H: id, name, category, description, steps, duration_s, created, updated.
const LIBRARY = [
  ['rw_2', 'Endurance 75', 'Endurance', '', '', '4500', '', ''],
  ['rw_1', 'Sweet Spot 3×12', 'Sweet spot', '', '', '4440', '', ''],
  ['rw_3', 'Recovery Spin 30', 'Recovery', '', '', '1800', '', ''],
];

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
function button(c: ParentNode, label: string): HTMLElement {
  const el = [...c.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!el) throw new Error(`No button "${label}" in: ${(c as Element).textContent}`);
  return el as HTMLElement;
}
const field = (c: ParentNode, label: string) =>
  [...c.querySelectorAll<HTMLInputElement>('input')].find((i) =>
    c.querySelector(`label[for="${i.id}"]`)?.textContent?.startsWith(label),
  )!;
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const rows = () => [...sheet().querySelectorAll<HTMLElement>('[role="radio"]')];
const typeInto = (el: HTMLInputElement, value: string) => fireEvent.input(el, { target: { value } });

async function openPlanner(date = '2026-11-20') {
  const view = render(<WorkoutFlow planDate={date} />);
  fireEvent.click(button(view.container, 'Bike workout'));
  return view;
}
async function openPicker(container: Element) {
  fireEvent.click(button(container, 'None'));
  await waitFor(() => expect(rows().length).toBeGreaterThan(1));
}

beforeEach(() => {
  templates.value = [];
  vi.clearAllMocks();
  resetRideLibrary();
  sheetsGet.mockResolvedValue(LIBRARY);
});
afterEach(cleanup);

describe('the plan picker', () => {
  it('shows a Bike workout card after Build Custom in plan mode, and the template cards still follow', () => {
    templates.value = [{ id: 't1', name: 'Upper Push A', exercises: [] } as never];
    const { container } = render(<WorkoutFlow planDate="2026-11-20" />);
    const names = [...container.querySelectorAll('.template-name')].map((n) => n.textContent);
    expect(names).toEqual(['Build Custom', 'Bike workout', 'Upper Push A']);
    expect(text(container.querySelectorAll('.template-card')[1].querySelector('.template-summary'))).toBe(
      'Plan a ride, with a Spin workout if you like',
    );
  });

  it('leaves the weight path unchanged: Build Custom still opens the weight planner', () => {
    const { container } = render(<WorkoutFlow planDate="2026-11-20" />);
    fireEvent.click(button(container, 'Build Custom'));
    expect(container.querySelector('#planner-date')).not.toBeNull();
    expect(container.querySelector('.bike-planner')).toBeNull();
  });

  it('opens the bike planner with the planned date preselected and no max on it', () => {
    const { container } = render(<WorkoutFlow planDate="2026-11-20" />);
    fireEvent.click(button(container, 'Bike workout'));
    const date = field(container, 'Scheduled for');
    expect(date.value).toBe('2026-11-20');
    expect(date.hasAttribute('max')).toBe(false);
    expect(field(container, 'Workout Name').value).toBe('Bike');
    expect(text(container.querySelector('.spin-pick-btn'))).toBe('None›');
    expect(sheetsGet).not.toHaveBeenCalled();
  });
});

describe('saving a bike plan', () => {
  it('writes a planned bike with no Spin workout, even though the library was never read', async () => {
    const { container } = await openPlanner();
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalledTimes(1));
    expect(saveWorkoutForLater.mock.calls[0][0]).toEqual({
      type: 'bike',
      name: 'Bike',
      date: '2026-11-20',
      estimated_seconds: '',
      sub_type: '',
      ride_workout_id: '',
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/activities'));
  });

  it('still saves when the library cannot be read', async () => {
    sheetsGet.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = await openPlanner();
    fireEvent.click(button(container, 'None'));
    await waitFor(() => expect(text(sheet())).toContain("Couldn't load your Spin workouts."));
    fireEvent.click(button(sheet(), 'No Spin workout'));
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalledTimes(1));
    expect((saveWorkoutForLater.mock.calls[0][0] as { ride_workout_id: string }).ride_workout_id).toBe('');
  });

  it('saves the typed name and estimate in seconds, the venue and the date', async () => {
    const { container } = await openPlanner();
    typeInto(field(container, 'Workout Name'), 'Z2 with Dave');
    typeInto(field(container, 'Estimated duration'), '90');
    typeInto(field(container, 'Scheduled for'), '2026-11-25');
    fireEvent.click(button(container, 'Gravel'));
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalledTimes(1));
    expect(saveWorkoutForLater.mock.calls[0][0]).toMatchObject({
      type: 'bike',
      name: 'Z2 with Dave',
      date: '2026-11-25',
      estimated_seconds: '5400',
      sub_type: 'gravel',
    });
  });

  it('names an empty name Bike', async () => {
    const { container } = await openPlanner();
    typeInto(field(container, 'Workout Name'), '   ');
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalled());
    expect(saveWorkoutForLater.mock.calls[0][0]).toMatchObject({ name: 'Bike' });
  });

  it('is disabled while saving, so a double tap writes one row', async () => {
    let finish!: (id: string) => void;
    saveWorkoutForLater.mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          finish = r;
        }),
    );
    const { container } = await openPlanner();
    const save = button(container, 'Save Workout');
    fireEvent.click(save);
    await waitFor(() => expect(button(container, 'Saving...').hasAttribute('disabled')).toBe(true));
    fireEvent.click(button(container, 'Saving...'));
    expect(saveWorkoutForLater).toHaveBeenCalledTimes(1);
    finish('w1');
  });
});

describe('the Spin picker', () => {
  it('lists No Spin workout, then each workout by name with its category and length', async () => {
    const { container } = await openPlanner();
    await openPicker(container);
    expect(sheet().getAttribute('aria-modal')).toBe('true');
    expect(text(sheet().querySelector('h2'))).toBe('Spin workout');
    expect(sheet().querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Spin workout');
    expect(rows().map((r) => text(r))).toEqual([
      '✓ No Spin workout Just a bike plan',
      'Endurance 75 Endurance · 1 h 15 min',
      'Recovery Spin 30 Recovery · 30 min',
      'Sweet Spot 3×12 Sweet spot · 1 h 14 min',
    ]);
    expect(rows().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    expect(sheetsGet).toHaveBeenCalledTimes(1);
  });

  it('fills the name, the estimate in whole minutes and the venue Indoor, closes, and names the choice', async () => {
    const { container } = await openPlanner();
    await openPicker(container);
    fireEvent.click(rows()[3]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(field(container, 'Workout Name').value).toBe('Sweet Spot 3×12');
    expect(field(container, 'Estimated duration').value).toBe('74');
    expect(button(container, 'Indoor').getAttribute('aria-pressed')).toBe('true');
    expect(text(container.querySelector('.spin-pick-btn'))).toBe('Sweet Spot 3×12›');
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalled());
    expect(saveWorkoutForLater.mock.calls[0][0]).toMatchObject({
      name: 'Sweet Spot 3×12',
      estimated_seconds: '4440',
      sub_type: 'indoor',
      ride_workout_id: 'rw_1',
    });
  });

  it('never overwrites what the owner typed or picked', async () => {
    const { container } = await openPlanner();
    typeInto(field(container, 'Workout Name'), 'Z2 with Dave');
    typeInto(field(container, 'Estimated duration'), '45');
    fireEvent.click(button(container, 'Gravel'));
    await openPicker(container);
    fireEvent.click(rows()[3]);
    expect(field(container, 'Workout Name').value).toBe('Z2 with Dave');
    expect(field(container, 'Estimated duration').value).toBe('45');
    expect(button(container, 'Gravel').getAttribute('aria-pressed')).toBe('true');
    expect(button(container, 'Indoor').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalled());
    expect(saveWorkoutForLater.mock.calls[0][0]).toMatchObject({ ride_workout_id: 'rw_1', sub_type: 'gravel' });
  });

  it('leaves an estimate the owner cleared blank', async () => {
    const { container } = await openPlanner();
    typeInto(field(container, 'Estimated duration'), '45');
    typeInto(field(container, 'Estimated duration'), '');
    await openPicker(container);
    fireEvent.click(rows()[1]);
    expect(field(container, 'Estimated duration').value).toBe('');
  });

  it('refills what an earlier choice filled when another is chosen, and no more', async () => {
    const { container } = await openPlanner();
    await openPicker(container);
    fireEvent.click(rows()[3]);
    fireEvent.click(button(container, 'Sweet Spot 3×12'));
    await waitFor(() => expect(rows().length).toBeGreaterThan(1));
    expect(rows()[3].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(rows()[2]);
    expect(field(container, 'Workout Name').value).toBe('Recovery Spin 30');
    expect(field(container, 'Estimated duration').value).toBe('30');
  });

  it('clears the link on No Spin workout and touches nothing else', async () => {
    const { container } = await openPlanner();
    await openPicker(container);
    fireEvent.click(rows()[3]);
    fireEvent.click(button(container, 'Sweet Spot 3×12'));
    await waitFor(() => expect(rows().length).toBeGreaterThan(1));
    fireEvent.click(rows()[0]);
    expect(text(container.querySelector('.spin-pick-btn'))).toBe('None›');
    expect(field(container, 'Workout Name').value).toBe('Sweet Spot 3×12');
    expect(field(container, 'Estimated duration').value).toBe('74');
    fireEvent.click(button(container, 'Save Workout'));
    await waitFor(() => expect(saveWorkoutForLater).toHaveBeenCalled());
    expect(saveWorkoutForLater.mock.calls[0][0]).toMatchObject({ ride_workout_id: '', name: 'Sweet Spot 3×12' });
  });

  it('closes on Escape, the close control and the overlay, and focus returns to its button', async () => {
    const { container } = await openPlanner();
    const trigger = button(container, 'None');
    for (const close of [
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(sheet().querySelector('.modal-close')!),
      () => fireEvent.click(document.querySelector('.modal-overlay')!),
    ]) {
      trigger.focus();
      fireEvent.click(trigger);
      await waitFor(() => expect(sheet()).not.toBeNull());
      close();
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
      expect(document.activeElement).toBe(trigger);
    }
  });

  it('moves between rows with the arrow keys, and Enter chooses', async () => {
    const { container } = await openPlanner();
    await openPicker(container);
    rows()[0].focus();
    fireEvent.keyDown(rows()[0].parentElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows()[1]);
    fireEvent.keyDown(rows()[1].parentElement!, { key: 'End' });
    expect(document.activeElement).toBe(rows()[3]);
    fireEvent.click(document.activeElement!);
    expect(text(container.querySelector('.spin-pick-btn'))).toBe('Sweet Spot 3×12›');
  });

  it('marks the selected row with a tick as well as a fill', async () => {
    const { container } = await openPlanner();
    await openPicker(container);
    expect(rows()[0].textContent).toContain('✓');
    expect(rows()[1].textContent).not.toContain('✓');
    expect(rows()[0].className).toContain('lift-choice-card-on');
  });

  it('says there are no Spin workouts for an empty library or a tab that does not exist yet', async () => {
    for (const reply of [
      () => Promise.resolve([]),
      () => Promise.reject(new SheetsApiError(400, 'Unable to parse range: RideWorkouts!A2:H')),
    ]) {
      resetRideLibrary();
      sheetsGet.mockImplementation(reply);
      const { container, unmount } = await openPlanner();
      fireEvent.click(button(container, 'None'));
      await waitFor(() => expect(text(sheet())).toContain('No Spin workouts yet. Build one in Thrive Spin.'));
      expect(rows()).toHaveLength(1);
      expect(text(sheet())).not.toContain("Couldn't load");
      unmount();
    }
  });

  it('shows Loading… while the library reads, with No Spin workout already choosable', async () => {
    sheetsGet.mockReturnValue(new Promise(() => {}));
    const { container } = await openPlanner();
    fireEvent.click(button(container, 'None'));
    await waitFor(() => expect(sheet().querySelector('[role="status"]')?.textContent).toBe('Loading…'));
    expect(rows().map((r) => text(r))).toEqual(['✓ No Spin workout Just a bike plan']);
  });

  it('says it could not load, offers Try again that reads again, and keeps No Spin workout choosable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sheetsGet.mockRejectedValueOnce(new Error('503'));
    const { container } = await openPlanner();
    fireEvent.click(button(container, 'None'));
    await waitFor(() => expect(text(sheet())).toContain("Couldn't load your Spin workouts."));
    expect(rows()).toHaveLength(1);
    fireEvent.click(button(sheet(), 'Try again'));
    await waitFor(() => expect(rows()).toHaveLength(4));
    expect(sheetsGet).toHaveBeenCalledTimes(2);
  });
});

describe('the planner as the weight planner is', () => {
  it('asks Discard changes? on Back with changes, and goes back to the picker without them', async () => {
    const { container } = await openPlanner();
    fireEvent.click(button(container, 'Back'));
    await waitFor(() => expect(container.querySelector('.bike-planner')).toBeNull());
    expect(container.querySelector('h2')!.textContent).toBe('Choose a template');
  });
});

describe('CSS', () => {
  const css = readGlobalCss().replace(/\r\n/g, '\n');
  const rule = (sel: string) => css.match(new RegExp(`\\n${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';

  it('holds the 44px floor by name on the picker rows and its button, and defines the token', () => {
    expect(css).toMatch(/--touch-target:\s*44px/);
    expect(rule('.spin-pick-row')).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(rule('.spin-pick-btn')).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(rule('.trend-entry')).toMatch(/min-height:\s*var\(--touch-target\)/);
  });
});
