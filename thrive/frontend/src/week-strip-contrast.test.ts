// #487 — the viewed day's filled tile: the number is 4.5:1 and the marks 3:1
// against --color-primary-fill, in both themes (WCAG 1.4.3, 1.4.11). Read the
// same way as day-header-contrast.test.ts.

import { describe, it, expect } from 'vitest';
import { readGlobalCss } from './test-css';

const css = readGlobalCss().replace(/\/\*[\s\S]*?\*\//g, '');

function token(theme: string, name: string): string {
  const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1] ?? '';
  const m = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`${name} is not a six-digit hex in the ${theme} block`);
  return m[1].toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

describe.each(['light', 'dark'] as const)('viewed week-strip tile (%s)', (theme) => {
  const fill = () => token(theme, '--color-primary-fill');

  it('is filled with --color-primary-fill, and its number is at least 4.5:1 on it', () => {
    expect(rule('.week-day-viewed')).toMatch(/background:\s*var\(--color-primary-fill\)/);
    expect(rule('.week-day-viewed .week-day-letter,\n.week-day-viewed .week-day-num')).toMatch(
      /color:\s*var\(--color-on-fill\)/,
    );
    const ratio = contrast(token(theme, '--color-on-fill'), fill());
    expect(ratio, `on-fill on fill is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('draws its marks in --color-on-fill, at least 3:1 on the fill', () => {
    expect(rule('.week-day-viewed .week-mark-dot')).toMatch(/background:\s*var\(--color-on-fill\)/);
    expect(rule('.week-day-viewed .week-mark-ring')).toMatch(/var\(--color-on-fill\)/);
    const ratio = contrast(token(theme, '--color-on-fill'), fill());
    expect(ratio, `marks are ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});

describe('today in the week strip (#487)', () => {
  it('stays underlined and bold without colour, and the viewed tile recolours (not removes) the underline', () => {
    const today = rule('.week-day-today .week-day-num');
    expect(today).toMatch(/font-weight:\s*700/);
    expect(today).toMatch(/text-decoration:\s*underline/);
    // Same specificity, later in the file: the viewed colour wins and the
    // underline (which follows currentColor) turns on-fill.
    expect(css.indexOf('.week-day-viewed .week-day-letter,')).toBeGreaterThan(
      css.indexOf('.week-day-today .week-day-num {'),
    );
    expect(rule('.week-day-viewed .week-day-num')).not.toMatch(/text-decoration:\s*none/);
  });
});
