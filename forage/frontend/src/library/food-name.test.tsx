// #781: a food's brand and name as two spans in a row title, and the brand leading the food sheet's hint.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import type { Food } from '../api/types';
import { readGlobalCss, rule } from '../test-css';
import { FoodName } from './food-name';
import { displayName } from './food-math';

const f = (brand: string | null, name: string): Pick<Food, 'brand' | 'name'> => ({ brand: brand as string, name });

describe('FoodName', () => {
  it('renders the brand as its own span, then the name, reading as displayName() does', () => {
    render(
      <p data-testid="t">
        <FoodName food={f('Hilltop Dairy', 'Plain yogurt')} />
      </p>,
    );
    const p = screen.getByTestId('t');
    expect(p.querySelector('.food-brand')?.textContent).toBe('Hilltop Dairy');
    expect(p.textContent).toBe(displayName(f('Hilltop Dairy', 'Plain yogurt')));
    expect(p.textContent).toBe('Hilltop Dairy Plain yogurt');
  });

  it.each([null, '', '   '])('renders the name alone, with no span, for brand %j', (brand) => {
    render(
      <p data-testid="t">
        <FoodName food={f(brand, 'Garlic')} />
      </p>,
    );
    const p = screen.getByTestId('t');
    expect(p.querySelector('.food-brand')).toBeNull();
    expect(p.textContent).toBe('Garlic');
  });

  it('styles the brand with existing tokens at regular weight', () => {
    const css = rule(readGlobalCss(), '.food-brand');
    expect(css).toContain('color: var(--color-text-secondary)');
    expect(css).toContain('font-weight: 400');
  });
});
