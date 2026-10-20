// #485 — the Day screen's metric colours. Data colours (marks and icons, never
// text, never status), so each is held to WCAG 1.4.11's 3:1 on the card in its
// theme, the sleep stages to 1.4:1 between neighbours in bar order, and none
// may borrow a status colour. Alongside chart-contrast.test.ts, read the same way.

import { describe, it, expect } from 'vitest';
import { readGlobalCss } from './test-css';

const css = readGlobalCss().replace(/\/\*[\s\S]*?\*\//g, '');

const THEMES = ['light', 'dark'] as const;

const METRICS = [
  '--metric-heart',
  '--metric-hrv',
  '--metric-stress',
  '--metric-sleep-deep',
  '--metric-sleep-rem',
  '--metric-sleep-light',
  '--metric-sleep-awake',
  '--metric-steps',
  '--metric-calories',
  '--metric-water',
  '--metric-alcohol',
];

/** Deep, REM, light, awake: the order they sit in along the sleep bar. */
const STAGES = ['--metric-sleep-deep', '--metric-sleep-rem', '--metric-sleep-light', '--metric-sleep-awake'];

const STATUS = ['--color-success', '--color-warning', '--color-danger'];

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

describe.each(THEMES)('metric colours (%s)', (theme) => {
  it.each(METRICS)('%s is at least 3:1 on --color-surface', (name) => {
    const ratio = contrast(token(theme, name), token(theme, '--color-surface'));
    expect(ratio, `${name} on the card is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it.each(STAGES.slice(1).map((s, i) => [STAGES[i], s]))('%s and %s differ by at least 1.4:1', (a, b) => {
    const ratio = contrast(token(theme, a), token(theme, b));
    expect(ratio, `${a} / ${b} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.4);
  });

  it('no metric colour is a status colour', () => {
    const status = STATUS.map((s) => token(theme, s));
    for (const name of METRICS) expect(status, name).not.toContain(token(theme, name));
  });

  it('--metric-sleep is the REM colour', () => {
    const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1] ?? '';
    expect(block).toMatch(/--metric-sleep:\s*var\(--metric-sleep-rem\);/);
  });
});
