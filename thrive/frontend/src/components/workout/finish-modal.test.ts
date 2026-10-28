// #667 — the finish sheet (was the centred Finish Workout dialog): a bottom sheet in the exercise
// picker's frame with a summary line, session effort, notes, Save workout and Keep logging.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { h } from 'preact';
import { FinishWorkoutSheet } from './finish-modal';

function renderSheet(overrides: Record<string, unknown> = {}) {
  const props = {
    notes: '',
    onNotesChange: vi.fn(),
    effort: '',
    onEffortChange: vi.fn(),
    onFinish: vi.fn(),
    onCancel: vi.fn(),
    finishing: false,
    summary: '14 of 17 sets logged · 3 need effort',
    ...overrides,
  };
  return { props, ...render(h(FinishWorkoutSheet as any, props)) };
}

const button = (container: Element, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

afterEach(cleanup);

describe('the sheet is an accessible dialog', () => {
  it('has role="dialog", aria-modal and a heading that labels it', () => {
    const { container } = renderSheet();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = container.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)!;
    expect(heading.textContent).toBe('Finish workout');
  });

  it('sits in the picker sheet frame: a scrim and a panel, not the centred modal', () => {
    const { container } = renderSheet();
    expect(container.querySelector('.lb-sheet-overlay .lb-sheet')).toBeTruthy();
    expect(container.querySelector('.modal-overlay')).toBeNull();
  });

  it('focuses the notes textarea on open', () => {
    const { container } = renderSheet();
    expect(document.activeElement).toBe(container.querySelector('textarea'));
  });
});

describe('contents', () => {
  it('shows the summary line under the heading', () => {
    const { container } = renderSheet();
    expect(container.querySelector('.lb-sheet-summary')!.textContent).toBe('14 of 17 sets logged · 3 need effort');
  });

  it('has Session effort pills, then Notes with its placeholder, then Save workout and Keep logging', () => {
    const { container } = renderSheet();
    const group = container.querySelector('[role="group"]')!;
    const textarea = container.querySelector('textarea')!;
    expect(textarea.getAttribute('placeholder')).toBe('How did it go?');
    expect(group.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const texts = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(texts.indexOf('Save workout')).toBeGreaterThan(texts.indexOf('Hard'));
    expect(texts.indexOf('Save workout')).toBeLessThan(texts.indexOf('Keep logging'));
  });

  it('Save workout is a primary button and Keep logging a secondary one', () => {
    const { container } = renderSheet();
    expect(button(container, 'Save workout').classList.contains('btn-primary')).toBe(true);
    expect(button(container, 'Keep logging').classList.contains('btn-secondary')).toBe(true);
  });

  it('passes the notes value to the textarea and reports typing', () => {
    const { container, props } = renderSheet({ notes: 'Great session!' });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Great session!');
    fireEvent.input(textarea, { target: { value: 'New notes' } });
    expect(props.onNotesChange).toHaveBeenCalled();
  });
});

describe('dismissing', () => {
  it('Keep logging, the scrim and Escape close it without saving', () => {
    const { container, props } = renderSheet();
    fireEvent.click(button(container, 'Keep logging'));
    fireEvent.click(container.querySelector('.lb-sheet-overlay')!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(3);
    expect(props.onFinish).not.toHaveBeenCalled();
  });

  it('a tap inside the panel does not close it', () => {
    const { container, props } = renderSheet();
    fireEvent.click(container.querySelector('.lb-sheet')!);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on the scrim or Escape while saving, and disables both buttons', () => {
    const { container, props } = renderSheet({ finishing: true });
    fireEvent.click(container.querySelector('.lb-sheet-overlay')!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(button(container, 'Saving…').hasAttribute('disabled')).toBe(true);
    expect(button(container, 'Keep logging').hasAttribute('disabled')).toBe(true);
  });
});

describe('saving', () => {
  it('calls onFinish from Save workout, with effort unset or not', () => {
    const { container, props } = renderSheet();
    const save = button(container, 'Save workout');
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(save);
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('session effort pills', () => {
  let onEffortChange: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    onEffortChange = vi.fn();
  });

  it('nothing is pre-selected', () => {
    const { container } = renderSheet({ onEffortChange });
    expect(container.querySelector('[role="group"] .active')).toBeNull();
  });

  it('reports the chosen effort, and clears it when the selected one is tapped again', () => {
    const first = renderSheet({ onEffortChange });
    fireEvent.click(button(first.container, 'Hard'));
    expect(onEffortChange).toHaveBeenCalledWith('Hard');
    cleanup();
    const second = renderSheet({ onEffortChange, effort: 'Hard' });
    fireEvent.click(button(second.container, 'Hard'));
    expect(onEffortChange).toHaveBeenCalledWith('');
  });

  it('marks the selected pill pressed', () => {
    const { container } = renderSheet({ effort: 'Hard' });
    expect(button(container, 'Hard').getAttribute('aria-pressed')).toBe('true');
    expect(button(container, 'Easy').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('accessible names (#372)', () => {
  it('names the notes box and the effort group by their visible labels', () => {
    const { getByRole } = renderSheet();
    const box = getByRole('textbox', { name: 'Notes' });
    expect(box.getAttribute('placeholder')).toBe('How did it go?');
    const group = getByRole('group', { name: 'Session effort' });
    expect(group.hasAttribute('aria-label')).toBe(false);
  });

  it('generates distinct ids for two instances in one tree', () => {
    const props = {
      notes: '',
      onNotesChange: vi.fn(),
      effort: '',
      onEffortChange: vi.fn(),
      onFinish: vi.fn(),
      onCancel: vi.fn(),
      finishing: false,
      summary: '',
    };
    const { container } = render(
      h('div', null, h(FinishWorkoutSheet as any, props), h(FinishWorkoutSheet as any, props)),
    );
    const ids = [...container.querySelectorAll('textarea')].map((t) => t.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });
});
