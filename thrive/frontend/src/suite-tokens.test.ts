// #402 — Thrive takes its shared tokens from the suite file, ui/tokens/suite.css,
// and nothing visible changes. The snapshot, tokens-before-402.json, was taken
// from global.css on main before it imported the suite file: every custom
// property in its :root and two theme blocks, comments removed. #404 added its
// five interaction-state tokens to Thrive's :root, and to the snapshot with
// them, deliberately: the snapshot is what Thrive's tokens resolve to, and
// those five are new, not changed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  SUITE_CSS_PATH,
  TOKEN_SELECTORS,
  readGlobalCss,
  readGlobalCssRaw,
  readSuiteCss,
  tokens,
} from './test-css';
import before from './tokens-before-402.json';

const suite = readSuiteCss();
const raw = readGlobalCssRaw();
const resolved = readGlobalCss();

const SCALES = [
  '--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl', '--space-2xl',
  '--radius-sm', '--radius-md', '--radius', '--radius-lg', '--radius-full',
  '--font-sans', '--font-mono',
  '--text-xs', '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-2xl',
  '--transition-fast', '--transition-normal',
  '--nav-height',
  '--shadow', '--shadow-lg', '--shadow-strong',
];
const NEUTRALS = [
  '--color-bg', '--color-surface', '--color-surface-raised',
  '--color-border', '--color-border-light', '--color-border-strong',
  '--color-text', '--color-text-secondary', '--color-text-muted',
];
const STATUS = [
  '--color-danger', '--color-danger-hover', '--color-danger-text',
  '--color-danger-fill', '--color-danger-fill-hover',
  '--color-success', '--color-success-light', '--color-success-fill',
  '--color-warning', '--color-warning-light',
];
const OVERLAYS = [
  '--color-overlay', '--color-shadow', '--color-shadow-strong',
  '--overlay-xs', '--overlay-sm', '--overlay-md', '--overlay-lg',
  '--overlay-xl', '--overlay-2xl', '--overlay-3xl', '--overlay-4xl',
];
const THEME = [...NEUTRALS, ...STATUS, '--color-on-fill', ...OVERLAYS];

const sorted = (names: string[]) => [...names].sort();

describe('AC1: the suite file defines exactly the shared token groups', () => {
  it('exists at ui/tokens/suite.css', () => {
    expect(SUITE_CSS_PATH.replace(/\\/g, '/')).toMatch(/\/ui\/tokens\/suite\.css$/);
    expect(suite.length).toBeGreaterThan(0);
  });

  it(':root holds the scales, fonts, transitions, nav height and shadows', () => {
    expect(sorted(Object.keys(tokens(suite, ':root')))).toEqual(sorted(SCALES));
  });

  it.each(['light', 'dark'])('[data-theme="%s"] holds the neutrals, status, on-fill and overlays', (theme) => {
    expect(sorted(Object.keys(tokens(suite, `[data-theme="${theme}"]`)))).toEqual(sorted(THEME));
  });

  it('declares custom properties nowhere else', () => {
    const all = [...suite.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:/g)].length;
    const inBlocks = TOKEN_SELECTORS.reduce((n, s) => n + Object.keys(tokens(suite, s)).length, 0);
    expect(all).toBe(inBlocks);
  });
});

describe('AC2: the suite file carries no accent and no data colour', () => {
  const names = TOKEN_SELECTORS.flatMap((s) => Object.keys(tokens(suite, s)));

  it('defines no --color-accent and no --color-primary* token', () => {
    expect(names.filter((n) => n === '--color-accent' || n.startsWith('--color-primary'))).toEqual([]);
  });

  it('defines no chart, calendar or badge colour', () => {
    expect(names.filter((n) => /^--(chart|cal|badge)-/.test(n))).toEqual([]);
  });
});

describe('AC3: the neutrals equal the suite language table', () => {
  const doc = readFileSync(resolve(SUITE_CSS_PATH, '../../docs/design/suite-language.md'), 'utf-8');
  const section = doc.slice(doc.indexOf('### Neutrals'), doc.indexOf('### Status'));
  const rows = [...section.matchAll(/^\| `(--[\w-]+)` \| `(#[0-9a-f]{6})` \| `(#[0-9a-f]{6})` \|$/gim)];

  it('reads all nine rows of the table', () => {
    expect(sorted(rows.map((r) => r[1]))).toEqual(sorted(NEUTRALS));
  });

  it.each(NEUTRALS)('%s matches in both themes', (name) => {
    const row = rows.find((r) => r[1] === name)!;
    expect(tokens(suite, '[data-theme="light"]')[name]).toBe(row[2].toLowerCase());
    expect(tokens(suite, '[data-theme="dark"]')[name]).toBe(row[3].toLowerCase());
  });
});

describe('AC4: global.css imports the suite file and redefines none of it', () => {
  it('imports it by relative path before any rule', () => {
    const first = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n')[0].trim();
    expect(first).toBe("@import '../../../ui/tokens/suite.css';");
  });

  it('declares none of the suite tokens anywhere', () => {
    const shared = new Set(TOKEN_SELECTORS.flatMap((s) => Object.keys(tokens(suite, s))));
    const declared = [...raw.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.filter((n) => shared.has(n))).toEqual([]);
  });
});

describe('AC5: no visible change — every token resolves as it did before #402', () => {
  const snapshot = before as Record<string, Record<string, string>>;

  // The cascade: the import comes first, so Thrive's own declarations follow
  // the suite's in the same selector and win on any clash.
  it.each(TOKEN_SELECTORS)('%s: suite file plus Thrive equals the snapshot', (selector) => {
    expect({ ...tokens(suite, selector), ...tokens(raw, selector) }).toEqual(snapshot[selector]);
  });

  // The other CSS tests read readGlobalCss(), so it must resolve the same way.
  it.each(TOKEN_SELECTORS)('%s: the stylesheet the CSS tests read equals the snapshot', (selector) => {
    expect(tokens(resolved, selector)).toEqual(snapshot[selector]);
  });
});
