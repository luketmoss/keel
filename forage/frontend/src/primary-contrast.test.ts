// #704: Forage's accent family equals its registry row in
// ui/docs/design/keel-wide-rules.md, and passes where it is drawn. The ratios
// are the WCAG relative-luminance formula over the stylesheet's own values, as
// in Hive's primary-contrast.test.ts.
import { describe, expect, it } from 'vitest';
import { readGlobalCss, readRegistry, themeTokens } from './test-css';

const css = readGlobalCss();
const light = themeTokens(css, 'light');
const dark = themeTokens(css, 'dark');

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lum = (rgb: RGB) => {
  const l = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The registry's Forage row: `| Forage | hue | accent | light | dark |`. */
function registryRow(): { light: string; dark: string } {
  const line = readRegistry()
    .split('\n')
    .find((l) => /^\|\s*Forage\s*\|/.test(l) && l.includes('`#'));
  if (!line) throw new Error('no Forage row in the registry');
  const cells = line.split('|').map((c) => c.trim());
  const code = (cell: string) => /`(#[0-9a-fA-F]{6})`/.exec(cell)![1];
  return { light: code(cells[4]), dark: code(cells[5]) };
}

describe('the accent family equals the registry row', () => {
  const row = registryRow();

  it('the row is green: #357A38 light, #66BB6A dark', () => {
    expect(row).toEqual({ light: '#357A38', dark: '#66BB6A' });
  });

  it('light --color-primary is the light value', () => {
    expect(light['--color-primary'].toLowerCase()).toBe(row.light.toLowerCase());
  });

  it('dark --color-primary is the dark value', () => {
    expect(dark['--color-primary'].toLowerCase()).toBe(row.dark.toLowerCase());
  });

  it('the brand accent is the same in both themes, the tile sun (#702)', () => {
    expect(light['--color-accent']).toBe(dark['--color-accent']);
    expect(light['--color-accent'].toLowerCase()).toBe('#66bb6a');
  });
});

describe('the primary passes as text on every surface it is drawn on', () => {
  it.each([
    ['light', '--color-surface', 5.26],
    ['light', '--color-bg', 4.69],
    ['light', '--color-primary-light', 4.5],
    ['dark', '--color-surface', 7.34],
    ['dark', '--color-surface-raised', 6.46],
    ['dark', '--color-bg', 4.5],
    ['dark', '--color-primary-light', 4.5],
  ] as const)('%s on %s, at least %s', (theme, surface, min) => {
    const set = theme === 'light' ? light : dark;
    expect(ratio(set['--color-primary'], set[surface])).toBeGreaterThanOrEqual(min - 0.005);
  });

  it.each(['light', 'dark'] as const)('%s hover passes as text on the surface', (theme) => {
    const set = theme === 'light' ? light : dark;
    expect(ratio(set['--color-primary-hover'], set['--color-surface'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('--color-on-primary passes on the fill and its hover', () => {
  it.each(['light', 'dark'] as const)('%s', (theme) => {
    const set = theme === 'light' ? light : dark;
    expect(ratio(set['--color-on-primary'], set['--color-primary'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(set['--color-on-primary'], set['--color-primary-hover'])).toBeGreaterThanOrEqual(4.5);
  });

  it('white on the light fill is 5.26', () => {
    expect(ratio('#ffffff', light['--color-primary'])).toBeCloseTo(5.26, 1);
  });
});
