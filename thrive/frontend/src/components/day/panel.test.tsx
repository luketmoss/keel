// #485 — a Day panel's optional title icon is decoration: the heading's
// accessible name is its words only.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { Panel } from './panel';

afterEach(cleanup);

const icon = (
  <svg viewBox="0 0 24 24">
    <title>Heart</title>
    <path d="M12 21 3 12a5 5 0 0 1 9-6 5 5 0 0 1 9 6z" />
  </svg>
);

describe('Panel title icon (#485)', () => {
  it('names the heading by its words alone, with the icon aria-hidden', () => {
    const { getByRole, container } = render(<Panel title="Resting heart rate" icon={icon} />);
    const heading = getByRole('heading', { level: 2, name: 'Resting heart rate' });
    const wrap = heading.querySelector('.day-panel-icon')!;
    expect(wrap.getAttribute('aria-hidden')).toBe('true');
    expect(wrap.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('section')!.getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('draws no icon wrapper without an icon', () => {
    const { getByRole } = render(<Panel title="Training" />);
    expect(getByRole('heading', { name: 'Training' }).querySelector('.day-panel-icon')).toBeNull();
  });
});
