// #579 — the start choice is remembered on the device and preselected next time.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { ChoiceSheet, WEIGHT_MODE_KEY, loadWeightMode } from './choice-sheet';

const checked = (c: Element) =>
  [...c.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.getAttribute('aria-checked') === 'true')
    ?.textContent;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the choice sheet remembers the last choice', () => {
  it('preselects Lift Mode with nothing stored', () => {
    const { container } = render(<ChoiceSheet onContinue={() => undefined} onCancel={() => undefined} />);
    expect(checked(container)).toContain('Lift Mode');
  });

  it('Logbook chosen once is preselected next time', () => {
    const onContinue = vi.fn();
    const first = render(<ChoiceSheet onContinue={onContinue} onCancel={() => undefined} />);
    fireEvent.click(
      [...first.container.querySelectorAll('[role="radio"]')].find((r) => r.textContent?.includes('Logbook'))!,
    );
    fireEvent.click([...first.container.querySelectorAll('button')].find((b) => b.textContent === 'Continue')!);
    expect(onContinue).toHaveBeenCalledWith('logbook');
    expect(window.localStorage.getItem(WEIGHT_MODE_KEY)).toBe('logbook');
    first.unmount();
    const next = render(<ChoiceSheet onContinue={() => undefined} onCancel={() => undefined} />);
    expect(checked(next.container)).toContain('Logbook');
  });

  it('Lift Mode chosen after Logbook is preselected next time', () => {
    window.localStorage.setItem(WEIGHT_MODE_KEY, 'logbook');
    const first = render(<ChoiceSheet onContinue={() => undefined} onCancel={() => undefined} />);
    fireEvent.click(
      [...first.container.querySelectorAll('[role="radio"]')].find((r) => r.textContent?.includes('Lift Mode'))!,
    );
    fireEvent.click([...first.container.querySelectorAll('button')].find((b) => b.textContent === 'Continue')!);
    expect(loadWeightMode()).toBe('lift');
  });

  it('cancelling remembers nothing', () => {
    const { container } = render(<ChoiceSheet onContinue={() => undefined} onCancel={() => undefined} />);
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!);
    expect(window.localStorage.getItem(WEIGHT_MODE_KEY)).toBeNull();
  });

  it('ignores a stored value that is not a mode', () => {
    window.localStorage.setItem(WEIGHT_MODE_KEY, 'other');
    expect(loadWeightMode()).toBeNull();
  });

  it('with storage unavailable nothing is preselected and Continue still works', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const onContinue = vi.fn();
    const { container } = render(<ChoiceSheet onContinue={onContinue} onCancel={() => undefined} />);
    expect(checked(container)).toContain('Lift Mode');
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Continue')!);
    expect(onContinue).toHaveBeenCalledWith('lift');
  });
});
