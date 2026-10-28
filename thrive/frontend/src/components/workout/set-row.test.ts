// #667 — a set's tile and the one editor that opens under its exercise's tiles.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { h } from 'preact';
import { SetTile, SetEditor, EffortPills } from './set-row';
import type { TrackerSet } from './set-row';

afterEach(cleanup);

function makeSet(overrides: Partial<TrackerSet> = {}): TrackerSet {
  return {
    set_number: 1,
    planned_reps: '',
    weight: '135',
    reps: '8',
    effort: '',
    saved: false,
    sheetRow: -1,
    ...overrides,
  };
}

const tile = (set: TrackerSet, over: Record<string, unknown> = {}) =>
  render(h(SetTile as any, { set, open: false, removing: false, onToggle: vi.fn(), ...over }));

describe('SetTile', () => {
  it('a logged set reads weight×reps over its effort, in its colour', () => {
    const { container } = tile(makeSet({ effort: 'Medium' }));
    expect(container.querySelector('.lb-tile-value')!.textContent).toBe('135×8');
    const note = container.querySelector('.lb-tile-note')!;
    expect(note.textContent).toBe('MED');
    expect(note.classList.contains('lb-tile-effort-medium')).toBe(true);
    expect(container.querySelector('.lb-tile-undone')).toBeNull();
  });

  it.each([
    ['Easy', 'EASY'],
    ['Hard', 'HARD'],
  ] as const)('%s reads %s', (effort, word) => {
    const { container } = tile(makeSet({ effort }));
    expect(container.querySelector('.lb-tile-note')!.textContent).toBe(word);
  });

  it('a set with no effort has no second line', () => {
    const { container } = tile(makeSet());
    expect(container.querySelector('.lb-tile-note')).toBeNull();
  });

  it('reps only reads BW×reps and weight only reads "135 lb"', () => {
    expect(tile(makeSet({ weight: '', reps: '7' })).container.querySelector('.lb-tile-value')!.textContent).toBe(
      'BW×7',
    );
    cleanup();
    expect(tile(makeSet({ reps: '' })).container.querySelector('.lb-tile-value')!.textContent).toBe('135 lb');
  });

  it('an unlogged set shows its planned reps on a dashed tile, over SET n', () => {
    const { container } = tile(makeSet({ set_number: 3, weight: '', reps: '', planned_reps: '8' }));
    const el = container.querySelector('.lb-tile')!;
    expect(el.classList.contains('lb-tile-undone')).toBe(true);
    expect(el.querySelector('.lb-tile-value')!.textContent).toBe('×8');
    expect(el.querySelector('.lb-tile-note')!.textContent).toBe('SET 3');
  });

  it('an unlogged set with no plan reads a dash', () => {
    const { container } = tile(makeSet({ weight: '', reps: '', planned_reps: '' }));
    expect(container.querySelector('.lb-tile-value')!.textContent).toBe('—');
  });

  it.each([
    [{ effort: 'Hard' as const }, 'Set 1: 135 pounds by 8, hard'],
    [{ weight: '', reps: '7' }, 'Set 1: bodyweight by 7, no effort'],
    [{ weight: '', reps: '', planned_reps: '8', set_number: 3 }, 'Set 3: not logged, target 8'],
    [{ weight: '', reps: '', planned_reps: '' }, 'Set 1: not logged'],
    [{ weight: '1', reps: '5' }, 'Set 1: 1 pound by 5, no effort'],
  ])('is named for a screen reader (%#)', (over, name) => {
    const { container } = tile(makeSet(over));
    expect(container.querySelector('.lb-tile')!.getAttribute('aria-label')).toBe(name);
  });

  it('carries aria-expanded and toggles on a tap', () => {
    const onToggle = vi.fn();
    const { container } = tile(makeSet(), { onToggle, open: true });
    const el = container.querySelector('.lb-tile')!;
    expect(el.getAttribute('aria-expanded')).toBe('true');
    expect(el.classList.contains('lb-tile-open')).toBe(true);
    fireEvent.click(el);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('is aria-disabled, and does nothing, while its set is being removed', () => {
    const onToggle = vi.fn();
    const { container } = tile(makeSet(), { onToggle, removing: true });
    const el = container.querySelector('.lb-tile')!;
    expect(el.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(el);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

function editor(set: TrackerSet, over: Record<string, unknown> = {}) {
  const props = {
    exerciseName: 'Barbell Row',
    set,
    status: '',
    canCopyToAll: true,
    isLast: false,
    removing: false,
    onChange: vi.fn(),
    onSameForAll: vi.fn(),
    onRemove: vi.fn(),
    onNext: vi.fn(),
    ...over,
  };
  return { props, ...render(h(SetEditor as any, props)) };
}

const fields = (c: Element) => c.querySelectorAll<HTMLInputElement>('input.lb-step-input');
const named = (c: Element, name: string) =>
  [...c.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name)!;

describe('SetEditor', () => {
  it('is a group named for its exercise and set, with its target and status', () => {
    const { container } = editor(makeSet({ set_number: 3, planned_reps: '8' }), { status: 'Saving…' });
    expect(container.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Barbell Row, set 3');
    expect(container.querySelector('.lb-editor-title')!.textContent).toBe('Set 3');
    expect(container.querySelector('.lb-editor-target')!.textContent).toBe('target 8');
    const status = container.querySelector('.lb-editor-status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Saving…');
  });

  it('leaves the target out when no reps are planned', () => {
    const { container } = editor(makeSet());
    expect(container.querySelector('.lb-editor-target')).toBeNull();
  });

  it('has weight and reps fields with the placeholders BW and the planned reps', () => {
    const { container } = editor(makeSet({ weight: '', reps: '', planned_reps: '8' }));
    const [weight, reps] = [...fields(container)];
    expect(weight.getAttribute('inputmode')).toBe('decimal');
    expect(weight.placeholder).toBe('BW');
    expect(reps.getAttribute('inputmode')).toBe('numeric');
    expect(reps.placeholder).toBe('8');
  });

  it('types into the fields directly, keeping only digits (and one point in a weight)', () => {
    const { container, props } = editor(makeSet());
    fireEvent.input(fields(container)[0], { target: { value: '137.5kg' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ weight: '137.5' });
    fireEvent.input(fields(container)[1], { target: { value: '1o2' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ reps: '12' });
    fireEvent.input(fields(container)[0], { target: { value: '1.2.3' } });
    expect(props.onChange).toHaveBeenLastCalledWith({ weight: '1.2' });
  });

  it('steps weight by 5 from 20 lb up and by 1 below, and reps by 1', () => {
    const { container, props } = editor(makeSet({ weight: '20', reps: '8' }));
    fireEvent.click(named(container, 'More weight'));
    expect(props.onChange).toHaveBeenLastCalledWith({ weight: '25' });
    fireEvent.click(named(container, 'Less weight'));
    expect(props.onChange).toHaveBeenLastCalledWith({ weight: '15' });
    fireEvent.click(named(container, 'More reps'));
    expect(props.onChange).toHaveBeenLastCalledWith({ reps: '9' });
    fireEvent.click(named(container, 'Fewer reps'));
    expect(props.onChange).toHaveBeenLastCalledWith({ reps: '7' });
  });

  it('steps up from blank and never goes below 0: stepping down to 0 leaves the field blank', () => {
    const blank = editor(makeSet({ weight: '', reps: '' }));
    fireEvent.click(named(blank.container, 'More weight'));
    expect(blank.props.onChange).toHaveBeenLastCalledWith({ weight: '1' });
    fireEvent.click(named(blank.container, 'Fewer reps'));
    expect(blank.props.onChange).toHaveBeenLastCalledWith({ reps: '' });
    cleanup();
    const one = editor(makeSet({ weight: '1', reps: '1' }));
    fireEvent.click(named(one.container, 'Less weight'));
    expect(one.props.onChange).toHaveBeenLastCalledWith({ weight: '' });
    fireEvent.click(named(one.container, 'Fewer reps'));
    expect(one.props.onChange).toHaveBeenLastCalledWith({ reps: '' });
  });

  it('sets an effort, and clears it when the selected one is tapped again', () => {
    const { container, props } = editor(makeSet());
    fireEvent.click(named(container, 'Hard'));
    expect(props.onChange).toHaveBeenLastCalledWith({ effort: 'Hard' });
    cleanup();
    const again = editor(makeSet({ effort: 'Hard' }));
    expect(named(again.container, 'Hard').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(named(again.container, 'Hard'));
    expect(again.props.onChange).toHaveBeenLastCalledWith({ effort: '' });
  });

  it('Same for all sets, Remove set and Next set call their handlers', () => {
    const { container, props } = editor(makeSet());
    fireEvent.click(named(container, 'Same for all sets'));
    fireEvent.click(named(container, 'Remove set'));
    fireEvent.click(named(container, 'Next set'));
    expect(props.onSameForAll).toHaveBeenCalledTimes(1);
    expect(props.onRemove).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('reads Done on the last set, and has no Same for all sets with one set', () => {
    const { container } = editor(makeSet(), { isLast: true, canCopyToAll: false });
    expect(named(container, 'Done')).toBeTruthy();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Same for all sets')).toBe(false);
  });

  it('Remove set is aria-disabled, and does nothing, while the removal is in flight', () => {
    const { container, props } = editor(makeSet(), { removing: true });
    const remove = named(container, 'Remove set');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(remove);
    expect(props.onRemove).not.toHaveBeenCalled();
  });
});

describe('EffortPills', () => {
  it('shows nothing selected by default and names its group by label', () => {
    const { getByRole, container } = render(h(EffortPills as any, { value: '', onChange: vi.fn(), label: 'Effort' }));
    expect(getByRole('group', { name: 'Effort' })).toBeTruthy();
    expect(container.querySelector('.active')).toBeNull();
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Easy', 'Medium', 'Hard']);
  });
});
