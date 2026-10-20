// #447 — Hive's light-mode primary passes AA, keeping the gold hue. The surfaces
// are the rows of docs/design/447-light-primary-aa.md's table; the ratios are
// the WCAG relative-luminance formula over the stylesheet's own hex values.
import { describe, it, expect } from 'vitest';
import { readGlobalCss, tokens } from './test-css';

const css = readGlobalCss();
const light = { ...tokens(css, ':root'), ...tokens(css, '[data-theme="light"]') };
const dark = { ...tokens(css, ':root'), ...tokens(css, '[data-theme="dark"]') };

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lum = ([r, g, b]: RGB) => {
  const l = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` composited onto `bg`. */
const over = (fg: RGB, alpha: number, bg: RGB): RGB =>
  fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;

const PRIMARY = hex('#805F00');
const WHITE = hex('#ffffff');
const COLUMNS = [
  '--color-todo',
  '--color-inprogress',
  '--color-done',
  '--color-col-indigo',
  '--color-col-purple',
  '--color-col-pink',
  '--color-col-teal',
  '--color-col-amber',
];
const BUCKETS = [
  '--color-bucket-overdue',
  '--color-bucket-this-week',
  '--color-bucket-next-week',
  '--color-bucket-later',
];

/** Every light surface the primary is drawn on as text, tints included. */
function surfaces(): [string, RGB][] {
  const white = hex(light['--color-surface']);
  const page = hex(light['--color-bg']);
  const out: [string, RGB][] = [
    ['surface', white],
    ['page', page],
  ];
  // The note's rows: the 8% tint sits on the control bar and on the page; the
  // 10%, 12% and 18% ones (sub-task date chip, quick-date chip, both hovers)
  // sit on the white surface.
  out.push(['8% tint on page', over(PRIMARY, 0.08, page)]);
  for (const pct of [8, 10, 12, 18]) out.push([`${pct}% tint on surface`, over(PRIMARY, pct / 100, white)]);
  for (const n of [...COLUMNS, ...BUCKETS]) out.push([n, hex(light[n])]);
  return out;
}

describe('AC1: the light primary family, and nothing else, moved', () => {
  it('light values', () => {
    expect(light['--color-primary']).toBe('#805F00');
    expect(light['--color-primary-hover']).toBe('#6B5000');
    expect(light['--color-primary-rgb']).toBe('128, 95, 0');
    expect(light['--color-focus']).toBe('#805F00');
  });

  it('--color-primary-rgb is the primary', () => {
    expect(light['--color-primary-rgb'].split(', ').map(Number)).toEqual(hex(light['--color-primary']));
  });

  it('the accent is #F5B700 in both themes', () => {
    expect(light['--color-accent']).toBe('#F5B700');
    expect(dark['--color-accent']).toBe('#F5B700');
  });

  it('every dark primary-family value equals its present value', () => {
    expect(dark['--color-primary']).toBe('#F5B700');
    expect(dark['--color-primary-hover']).toBe('#FFD54F');
    expect(dark['--color-primary-rgb']).toBe('245, 183, 0');
    expect(dark['--color-focus']).toBe('#F5B700');
  });
});

describe('AC2: the primary is at least 4.5:1 as text on every surface it sits on', () => {
  it.each(surfaces())('%s', (_name, bg) => {
    expect(ratio(PRIMARY, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the tightest is the 18% tint, 4.57', () => {
    const worst = Math.min(...surfaces().map(([, bg]) => ratio(PRIMARY, bg)));
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(worst).toBeLessThan(4.7);
  });
});

describe('AC3: the primary is at least 3:1 as a border or ring', () => {
  it.each([
    ...surfaces(),
    ['--color-border', hex(light['--color-border'])] as [string, RGB],
    ['--color-border-light', hex(light['--color-border-light'])] as [string, RGB],
  ])('against %s', (_name, bg) => {
    expect(ratio(PRIMARY, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('AC4: white on the fill and on its hover is at least 4.5:1', () => {
  it('the fill, 5.91', () => {
    expect(ratio(WHITE, hex(light['--color-primary']))).toBeGreaterThanOrEqual(5.9);
  });
  it('the hover, 7.57', () => {
    expect(ratio(WHITE, hex(light['--color-primary-hover']))).toBeGreaterThanOrEqual(7.5);
  });
});

describe('AC5: .btn-primary and .login-btn text is --color-on-primary', () => {
  it.each(['.btn-primary', '.login-btn'])('%s', (sel) => {
    const rule = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*\\}`).exec(css)![0];
    expect(rule).toContain('color: var(--color-on-primary)');
    expect(rule).not.toContain('#1f1f1f');
  });

  it('white in light (5.91), #1f1f1f in dark (9.15), as today', () => {
    expect(light['--color-on-primary']).toBe('#ffffff');
    expect(dark['--color-on-primary']).toBe('#1f1f1f');
    expect(ratio(hex(light['--color-on-primary']), hex(light['--color-primary']))).toBeGreaterThanOrEqual(5.9);
    expect(ratio(hex(dark['--color-on-primary']), hex(dark['--color-primary']))).toBeGreaterThanOrEqual(9.1);
  });
});

describe('AC6: the sort arrow follows the theme, and no #C49200 remains', () => {
  it('light arrow is #805F00, dark is #F5B700', () => {
    expect(/\.column-sort-active\s*\{[^}]*\}/.exec(css)![0]).toContain("fill='%23805F00'");
    expect(/\[data-theme="dark"\]\s*\.column-sort-active\s*\{[^}]*\}/.exec(css)![0]).toContain("fill='%23F5B700'");
  });

  it('global.css holds no #C49200 or its hover, in any case', () => {
    expect(css).not.toMatch(/c49200|a67b00/i);
  });
});
