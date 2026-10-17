import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { ThriveLogo } from './thrive-logo';

describe('ThriveLogo — #397: the cobalt mark as an <img> of the public asset', () => {
  it('renders an <img>, not an inline <svg>', () => {
    const { container } = render(<ThriveLogo />);
    expect(container.querySelector('img')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('polygon')).toBeNull();
  });

  it('points at thrive-mark.svg under the base path', () => {
    const { container } = render(<ThriveLogo />);
    const src = container.querySelector('img')?.getAttribute('src');
    expect(src).toBe(`${import.meta.env.BASE_URL}thrive-mark.svg`);
    expect(src?.endsWith('thrive-mark.svg')).toBe(true);
  });

  it('is decorative: empty alt', () => {
    const { container } = render(<ThriveLogo />);
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('defaults to size 24', () => {
    const { container } = render(<ThriveLogo />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe('24');
    expect(img?.getAttribute('height')).toBe('24');
  });

  it('accepts a custom size prop', () => {
    const { container } = render(<ThriveLogo size={64} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe('64');
    expect(img?.getAttribute('height')).toBe('64');
  });

  it('passes class prop through to the img element', () => {
    const { container } = render(<ThriveLogo class="login-icon" />);
    expect(container.querySelector('img')?.classList.contains('login-icon')).toBe(true);
  });
});
