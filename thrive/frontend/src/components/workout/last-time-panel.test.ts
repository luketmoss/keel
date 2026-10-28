// #667 — an exercise's Last time line in the Logbook: "Last time (Oct 21): 135 lb × 8 · Medium" and a Copy button.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { h } from 'preact';
import { LastTimeLine } from './last-time-panel';
import * as lastTimeData from './last-time-data';
import type { SetWithRow } from '../../api/types';

// Mock getLastTimeData
vi.mock('./last-time-data', async () => {
  const actual = (await vi.importActual('./last-time-data')) as Record<string, unknown>;
  return {
    ...actual,
    getLastTimeData: vi.fn(),
  };
});

function makeSet(overrides: Partial<SetWithRow> = {}): SetWithRow {
  return {
    workout_id: 'w-prev',
    exercise_id: 'ex1',
    exercise_name: 'Bench Press',
    section: 'primary',
    exercise_order: 1,
    set_number: 1,
    planned_reps: '8-10',
    weight: '135',
    reps: '10',
    effort: 'Medium',
    sheetRow: 2,
    ...overrides,
  };
}

describe('LastTimeLine', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderLine(overrides: Record<string, unknown> = {}) {
    const props = {
      exerciseId: 'ex1',
      exerciseName: 'Bench Press',
      currentWorkoutId: 'w1',
      onCopyDown: vi.fn(),
      ...overrides,
    };
    return { ...render(h(LastTimeLine as any, props)), props };
  }

  it('reads the date and the best set of the previous performance', () => {
    vi.mocked(lastTimeData.getLastTimeData).mockReturnValue({
      workoutDate: '2026-10-21',
      sets: [
        makeSet({ set_number: 1, weight: '125', reps: '10', effort: '' }),
        makeSet({ set_number: 2, weight: '135', reps: '8' }),
      ],
    });
    const { container } = renderLine();
    expect(container.querySelector('.lb-last-time-text')!.textContent).toBe('Last time (Oct 21): 135 lb × 8 · Medium');
  });

  it('has a Copy button named for the exercise, which hands over the previous sets', () => {
    const sets = [makeSet()];
    vi.mocked(lastTimeData.getLastTimeData).mockReturnValue({ workoutDate: '2026-10-21', sets });
    const { container, props } = renderLine();
    const copy = container.querySelector('button')!;
    expect(copy.textContent).toBe('Copy');
    expect(copy.getAttribute('aria-label')).toBe('Copy last time into Bench Press');
    fireEvent.click(copy);
    expect(props.onCopyDown).toHaveBeenCalledWith(sets);
  });

  it('shows no line, and no "No previous data", when there is no previous performance', () => {
    vi.mocked(lastTimeData.getLastTimeData).mockReturnValue(null);
    const { container } = renderLine();
    expect(container.innerHTML).toBe('');
  });

  it('shows no line when the previous sets hold nothing to show', () => {
    vi.mocked(lastTimeData.getLastTimeData).mockReturnValue({
      workoutDate: '2026-10-21',
      sets: [makeSet({ weight: '', reps: '', effort: '' })],
    });
    const { container } = renderLine();
    expect(container.innerHTML).toBe('');
  });
});
