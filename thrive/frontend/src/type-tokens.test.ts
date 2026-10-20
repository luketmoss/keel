// #526 — activity type and effort colours are tokens, and the badge and effort
// pill rules read them. The values are the text colours those rules had before,
// so nothing on screen changes.

import { describe, it, expect } from 'vitest';
import { readGlobalCss, tokens } from './test-css';

const css = readGlobalCss();
const light = tokens(css, '[data-theme="light"]');
const dark = tokens(css, '[data-theme="dark"]');

const TYPE: Record<string, [string, string]> = {
  weight: ['#c53030', '#fca5a5'],
  stretch: ['#2e7d32', '#86efac'],
  bike: ['#1565c0', '#93c5fd'],
  hike: ['#5d4037', '#d7ccc8'],
  run: ['#9d174d', '#f5a8d3'],
  walk: ['#10605a', '#7fded3'],
};
const EFFORT: Record<string, [string, string]> = {
  easy: ['#2e7d32', '#86efac'],
  medium: ['#a05d00', '#ffb74d'],
  hard: ['#c62828', '#ef9a9a'],
};

/** The text colour a rule declares, by exact selector. */
function colorOf(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  const c = m[1].match(/(?:^|[;\s])color\s*:\s*([^;]+);/);
  if (!c) throw new Error(`${selector} declares no color`);
  return c[1].trim();
}

describe('#526: type colour tokens', () => {
  for (const [type, [l, d]] of Object.entries(TYPE)) {
    it(`--type-${type} has its badge colour in both themes`, () => {
      expect(light[`--type-${type}`]).toBe(l);
      expect(dark[`--type-${type}`]).toBe(d);
    });

    it(`.badge-${type} reads the token in both themes`, () => {
      expect(colorOf(`.badge-${type}`)).toBe(`var(--type-${type})`);
      expect(colorOf(`[data-theme="dark"] .badge-${type}`)).toBe(`var(--type-${type})`);
    });
  }
});

describe('#526: effort colour tokens', () => {
  for (const [effort, [l, d]] of Object.entries(EFFORT)) {
    it(`--effort-${effort} has its pill colour in both themes`, () => {
      expect(light[`--effort-${effort}`]).toBe(l);
      expect(dark[`--effort-${effort}`]).toBe(d);
    });

    it(`.workout-effort-${effort} reads the token in both themes`, () => {
      expect(colorOf(`.workout-effort-${effort}`)).toBe(`var(--effort-${effort})`);
      expect(colorOf(`[data-theme="dark"] .workout-effort-${effort}`)).toBe(`var(--effort-${effort})`);
    });
  }
});
