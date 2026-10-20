// #486 — the Day header's new colours, on the page background they sit on (the
// header has no card). Text 4.5:1, marks 3:1 (WCAG 1.4.3, 1.4.11). Read the same
// way as metric-contrast.test.ts.

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

describe.each(['light', 'dark'] as const)('Day header colours (%s)', (theme) => {
  const bg = () => token(theme, '--color-bg');

  it.each(['--color-text', '--color-text-secondary'])('%s text is at least 4.5:1 on the page', (name) => {
    const ratio = contrast(token(theme, name), bg());
    expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--color-text-muted', '--metric-calories', '--color-text-secondary'])(
    '%s marks (separator dot, sun, sync icon) are at least 3:1 on the page',
    (name) => {
      const ratio = contrast(token(theme, name), bg());
      expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(['--color-success', '--color-warning', '--color-danger'])(
    'the sync dot in %s is at least 3:1 on its --color-bg ring',
    (name) => {
      const ratio = contrast(token(theme, name), bg());
      expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    },
  );
});
