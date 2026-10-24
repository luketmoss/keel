// #446 — Hive takes its shared tokens from the suite file, ui/tokens/suite.css.
// The snapshot, tokens-before-446.json, was taken from global.css on main before
// it imported the suite file, and committed first: what each theme's tokens
// resolved to, with Hive's light values (they lived in :root) as `light`.
// The design note (docs/design/446-suite-tokens.md) tabulates every place the
// suite's values differ; EXPECTED below is that table, and nothing else may move.
import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore -- Node builtins available at test runtime
import { dirname, resolve } from 'path';
// @ts-ignore -- Node builtins available at test runtime
import { fileURLToPath } from 'url';
import { SUITE_CSS_PATH, TOKEN_SELECTORS, readGlobalCss, readGlobalCssRaw, readSuiteCss, tokens } from './test-css';
import before from './tokens-before-446.json';

const here = dirname(fileURLToPath(import.meta.url));
const suite = readSuiteCss();
const raw = readGlobalCssRaw();
const resolved = readGlobalCss();
const snapshot = before as { light: Record<string, string>; dark: Record<string, string> };

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const sorted = (names: string[]) => [...names].sort();

/** What a theme resolves to: the theme-independent :root plus that theme's block. */
function theme(css: string, name: 'light' | 'dark'): Record<string, string> {
  return { ...tokens(css, ':root'), ...tokens(css, `[data-theme="${name}"]`) };
}

const HIVE_ROOT = [
  '--color-accent',
  '--color-primary-light',
  '--focus-ring',
  '--column-width',
  '--header-height',
  '--control-bar-height',
  // #452's interaction-state tokens
  '--state-hover',
  '--state-pressed',
  '--opacity-disabled',
  '--focus-ring-width',
  '--focus-ring-offset',
  // #453's touch-target floor
  '--touch-target',
  // #623's shell: rail widths, icon size, page-title and glance figures
  '--rail-width',
  '--rail-width-compact',
  '--icon-md',
  '--figure-lg',
  '--figure-md',
  // #624's Today: the glance figure, the two rings, the row avatar
  '--figure-xl',
  '--ring-lg',
  '--ring-md',
  '--avatar-sm',
];
const HIVE_THEME = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-rgb',
  '--color-focus',
  '--color-on-primary',
  '--color-todo',
  '--color-inprogress',
  '--color-done',
  '--color-col-indigo',
  '--color-col-purple',
  '--color-col-pink',
  '--color-col-teal',
  '--color-col-amber',
  '--color-overdue',
  '--color-demo-bg',
  '--color-demo-text',
];

describe('AC1: global.css imports the suite file and redefines none of it', () => {
  it('imports it by relative path before any rule', () => {
    expect(SUITE_CSS_PATH.replace(/\\/g, '/')).toMatch(/\/ui\/tokens\/suite\.css$/);
    const first = stripComments(raw).trim().split('\n')[0].trim();
    expect(first).toBe("@import '../../../ui/tokens/suite.css';");
  });

  it('declares none of the suite tokens anywhere, except the two dark shadows', () => {
    const shared = new Set(TOKEN_SELECTORS.flatMap((s) => Object.keys(tokens(suite, s))));
    const declared = [...stripComments(raw).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.filter((n) => shared.has(n)).sort()).toEqual(['--shadow', '--shadow-lg']);
    expect(
      Object.keys(tokens(raw, '[data-theme="dark"]'))
        .filter((n) => shared.has(n))
        .sort(),
    ).toEqual(['--shadow', '--shadow-lg']);
  });
});

describe('AC2: Hive keeps its own tokens, light and dark apart', () => {
  it(':root holds only the theme-independent ones', () => {
    expect(sorted(Object.keys(tokens(raw, ':root')))).toEqual(sorted(HIVE_ROOT));
  });

  it('[data-theme="light"] holds Hive\'s light values', () => {
    expect(sorted(Object.keys(tokens(raw, '[data-theme="light"]')))).toEqual(sorted(HIVE_THEME));
  });

  it('[data-theme="dark"] holds the same list and its two shadows', () => {
    expect(sorted(Object.keys(tokens(raw, '[data-theme="dark"]')))).toEqual(
      sorted([...HIVE_THEME, '--shadow', '--shadow-lg']),
    );
  });
});

describe('AC3: exactly this moves', () => {
  // The design note's tables. Each entry is [token, was, becomes]; `null` is
  // "not defined".
  const light: [string, string | null, string | null][] = [
    // #447: the light primary family darkens, and gains --color-on-primary.
    ['--color-primary', '#C49200', '#805F00'],
    ['--color-primary-hover', '#A67B00', '#6B5000'],
    ['--color-primary-rgb', '196, 146, 0', '128, 95, 0'],
    ['--color-focus', '#C49200', '#805F00'],
    ['--color-on-primary', null, '#ffffff'],
    ['--color-surface-raised', '#f8f9fa', '#ffffff'],
    ['--color-border-light', '#969696', '#e8eaed'],
    ['--color-text-muted', '#767676', '#606b76'],
    ['--overlay-xs', 'rgba(0, 0, 0, 0.02)', 'rgba(0, 0, 0, 0.04)'],
    ['--overlay-sm', 'rgba(0, 0, 0, 0.03)', 'rgba(0, 0, 0, 0.08)'],
    ['--overlay-md', 'rgba(0, 0, 0, 0.05)', 'rgba(0, 0, 0, 0.12)'],
    ['--overlay-lg', 'rgba(0, 0, 0, 0.06)', 'rgba(0, 0, 0, 0.16)'],
    ['--overlay-xl', 'rgba(0, 0, 0, 0.08)', 'rgba(0, 0, 0, 0.24)'],
    ['--overlay-2xl', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.32)'],
    ['--overlay-3xl', 'rgba(0, 0, 0, 0.15)', 'rgba(0, 0, 0, 0.40)'],
    ['--overlay-4xl', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.60)'],
    ['--overlay-badge', 'rgba(0, 0, 0, 0.15)', null],
    ['--overlay-view-toggle', 'rgba(0, 0, 0, 0.04)', null],
    // Same colour, now spelt as the suite's literal rather than through --overlay-*.
    [
      '--shadow',
      '0 1px 3px var(--overlay-3xl), 0 1px 2px var(--overlay-md)',
      '0 1px 3px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.05)',
    ],
    ['--shadow-lg', '0 4px 12px var(--overlay-3xl)', '0 4px 12px rgba(0,0,0,0.15)'],
  ];
  const dark: [string, string | null, string | null][] = [
    ['--color-on-primary', null, '#1f1f1f'],
    ['--color-surface', '#1e1e1e', '#1a1a1e'],
    ['--color-surface-raised', '#2a2a2a', '#252528'],
    ['--color-border-light', '#787878', '#25252b'],
    ['--color-text-muted', '#8b8b8b', '#868e98'],
    ['--overlay-xs', 'rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.04)'],
    ['--overlay-sm', 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.08)'],
    ['--overlay-md', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.12)'],
    ['--overlay-lg', 'rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.16)'],
    ['--overlay-xl', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.24)'],
    ['--overlay-2xl', 'rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.32)'],
    ['--overlay-3xl', 'rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.40)'],
    // The same black backdrop, spelt 0.60 by the suite and 0.6 by Hive.
    ['--overlay-4xl', 'rgba(0, 0, 0, 0.6)', 'rgba(0, 0, 0, 0.60)'],
    ['--overlay-badge', 'rgba(255, 255, 255, 0.15)', null],
    ['--overlay-view-toggle', 'rgba(255, 255, 255, 0.04)', null],
  ];
  // #452: Hive's five interaction-state tokens, theme-independent.
  const STATES: [string, string | null, string | null][] = [
    ['--state-hover', null, 'var(--overlay-sm)'],
    ['--state-pressed', null, 'var(--overlay-md)'],
    ['--opacity-disabled', null, '0.4'],
    ['--focus-ring-width', null, '2px'],
    ['--focus-ring-offset', null, '2px'],
    ['--touch-target', null, '44px'],
  ];
  const GONE = [
    '--color-bucket-overdue',
    '--color-bucket-this-week',
    '--color-bucket-next-week',
    '--color-bucket-later',
  ];
  // Tokens the suite defines and Hive did not: they arrive unused.
  const ARRIVE = [
    '--nav-height',
    '--shadow-strong',
    '--color-border-strong',
    '--color-danger-text',
    '--color-danger-fill',
    '--color-danger-fill-hover',
    '--color-success-light',
    '--color-success-fill',
    '--color-warning-light',
    '--color-on-fill',
    '--color-overlay',
    '--color-shadow',
    '--color-shadow-strong',
    // #623's shell tokens are Hive's own and new
    '--rail-width',
    '--rail-width-compact',
    '--icon-md',
    '--figure-lg',
    '--figure-md',
    '--figure-xl',
    '--ring-lg',
    '--ring-md',
    '--avatar-sm',
  ];

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: the resolved set differs from the snapshot in the tabulated places only', (name, expected) => {
    const was = snapshot[name];
    const now = theme(resolved, name);
    const changed: Record<string, [string | null, string | null]> = {};
    for (const k of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if ((was[k] ?? null) !== (now[k] ?? null)) changed[k] = [was[k] ?? null, now[k] ?? null];
    }
    const norm = (s: string | null) => (s === null ? null : s.replace(/\s+/g, ''));
    const want: typeof changed = {};
    for (const [k, a, b] of [...expected, ...STATES]) want[k] = [a, b];
    for (const k of ARRIVE) if (!(k in was)) want[k] = [null, now[k] ?? null];
    // #624 removed Upcoming's four bucket pastels with the view that drew them.
    for (const k of GONE) want[k] = [was[k] ?? null, null];
    // Values compared without whitespace; the keys must match exactly.
    expect(sorted(Object.keys(changed))).toEqual(sorted(Object.keys(want)));
    for (const k of Object.keys(want)) {
      expect([norm(changed[k][0]), norm(changed[k][1])]).toEqual([norm(want[k][0]), norm(want[k][1])]);
    }
  });

  it("dark keeps its own shadows, not the suite's", () => {
    expect(theme(resolved, 'dark')['--shadow']).toBe(snapshot.dark['--shadow']);
    expect(theme(resolved, 'dark')['--shadow-lg']).toBe(snapshot.dark['--shadow-lg']);
  });
});

describe('AC4: no hover tint moves by more than 0.02 alpha', () => {
  const alpha = (v: string) => parseFloat(/,\s*([\d.]+)\)$/.exec(v)![1]);
  // Where a token was read, which suite step it reads now.
  const MAP: Record<string, string> = {
    '--overlay-xs': '--overlay-xs',
    '--overlay-sm': '--overlay-xs',
    '--overlay-md': '--overlay-xs',
    '--overlay-lg': '--overlay-sm',
    '--overlay-xl': '--overlay-sm',
    '--overlay-2xl': '--overlay-md',
    '--overlay-3xl': '--overlay-lg',
    '--overlay-badge': '--overlay-lg',
    '--overlay-view-toggle': '--overlay-xs',
  };

  it.each(['light', 'dark'] as const)('%s: each re-point is within 0.02', (name) => {
    const now = theme(resolved, name);
    for (const [old, next] of Object.entries(MAP)) {
      expect(Math.abs(alpha(snapshot[name][old]) - alpha(now[next]))).toBeLessThanOrEqual(0.0201);
    }
  });

  it('the retired and drifted names are no longer read by name', () => {
    const css = stripComments(raw);
    expect(css).not.toMatch(/var\(--overlay-(badge|view-toggle|4xl|2xl|3xl|xl)\)/);
  });

  it('backdrops read --color-overlay, which is the 0.4 / 0.6 they had', () => {
    for (const sel of ['.modal-overlay', '.detail-overlay', '.column-date-sort-overlay']) {
      const m = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*\\}`).exec(raw)!;
      expect(m[0]).toContain('background: var(--color-overlay)');
    }
    expect(tokens(resolved, '[data-theme="light"]')['--color-overlay']).toBe('rgba(0, 0, 0, 0.4)');
    expect(tokens(resolved, '[data-theme="dark"]')['--color-overlay']).toBe('rgba(0, 0, 0, 0.6)');
  });

  it('the two shadows are shadows, black in both themes', () => {
    for (const [sel, token] of [
      ['.detail-panel', '--color-shadow-strong'],
      ['.theme-toggle-active', '--color-shadow-strong'],
    ]) {
      const m = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*\\}`).exec(raw)!;
      expect(m[0]).toContain(`var(${token})`);
    }
    for (const name of ['light', 'dark'] as const) {
      const now = theme(resolved, name);
      expect(now['--color-shadow']).toMatch(/^rgba\(0, 0, 0,/);
      expect(now['--color-shadow-strong']).toMatch(/^rgba\(0, 0, 0,/);
    }
  });
});

describe('AC5: nothing reads --color-border-light as an outline', () => {
  it('.check-box and .share-archive-board-btn use --color-border-strong', () => {
    for (const sel of ['.check-box', '.share-archive-board-btn']) {
      const rules = [...raw.matchAll(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*\\}`, 'g'))];
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r[0].includes('var(--color-border-strong)'))).toBe(true);
    }
  });

  it("no rule reads --color-border-light, except Today's and Boards' hairlines and tracks (#624, #625)", () => {
    // A hairline between rows and the unfilled part of a ring or a bar are decoration, not the
    // outline of a control; the design notes for #624 and #625 name the token for them.
    const reads = [...stripComments(raw).matchAll(/([^{}]+)\{[^{}]*var\(--color-border-light\)[^{}]*\}/g)].map((m) =>
      m[1].trim(),
    );
    expect(reads.filter((sel) => !/^\.(today|boards)-/.test(sel))).toEqual([]);
  });
});

describe('AC6: muted text passes AA on every surface Hive draws it on', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const l = c.map((s) => (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)));
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const PASTELS = [
    '--color-todo',
    '--color-inprogress',
    '--color-done',
    '--color-col-indigo',
    '--color-col-purple',
    '--color-col-pink',
    '--color-col-teal',
    '--color-col-amber',
  ];
  // The two pastels muted text misses by a hair (4.489 and 4.412). Only
  // .column-add-row draws text on them; the "+" glyph needs 3:1.
  const SHORT = { light: '--color-col-purple', dark: '--color-todo' } as const;

  it.each(['light', 'dark'] as const)('%s: at least 4.5:1, except the one recorded pastel', (name) => {
    const t = theme(resolved, name);
    const surfaces = ['--color-bg', '--color-surface', '--color-surface-raised', ...PASTELS];
    for (const s of surfaces) {
      const r = ratio(t['--color-text-muted'], t[s]);
      if (s === SHORT[name]) {
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThan(4.5);
        expect(ratio(t['--color-text-secondary'], t[s])).toBeGreaterThanOrEqual(4.5);
      } else {
        expect(r, `${name} ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('.column-add-row text is --color-text-secondary', () => {
    const m = /\.column-add-row\s*\{[^}]*\}/.exec(raw)!;
    expect(m[0]).toContain('color: var(--color-text-secondary)');
  });
});

describe('AC7: every variable the CSS reads is defined', () => {
  // #452 gave the two rules that read --overlay-hover, and the one that read
  // --color-surface-hover, the shared hover layer instead, so none is left.
  // --label-color and --label-text-color are set inline by the label components.
  const PENDING_449: string[] = [];
  const INLINE = ['--label-color', '--label-text-color'];

  it('names only tokens that exist', () => {
    const defined = new Set<string>();
    for (const s of TOKEN_SELECTORS) Object.keys(tokens(resolved, s)).forEach((n) => defined.add(n));
    // Not tokens: set inline or by a rule, not in a token block.
    const css = stripComments(raw);
    for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    const used = new Set<string>();
    for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) if (m[2] === ')') used.add(m[1]);
    expect(sorted([...used].filter((n) => !defined.has(n) && !INLINE.includes(n)))).toEqual(PENDING_449);
  });

  it('--overlay-badge and --overlay-view-toggle are gone', () => {
    expect(stripComments(raw)).not.toMatch(/--overlay-(badge|view-toggle)/);
  });
});

describe('AC8: data-theme is set before first paint, even without storage', () => {
  const html = readFileSync(resolve(here, '../index.html'), 'utf-8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

  function run(opts: { stored?: string | null; throws?: boolean; dark?: boolean }) {
    const attrs: Record<string, string> = {};
    const win = {
      matchMedia: () => ({ matches: !!opts.dark }),
    };
    const storage = {
      getItem: () => {
        if (opts.throws) throw new Error('blocked');
        return opts.stored ?? null;
      },
    };
    const doc = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    new Function('window', 'localStorage', 'document', script)(win, storage, doc);
    return attrs['data-theme'];
  }

  it('with localStorage throwing, follows the OS preference', () => {
    expect(run({ throws: true, dark: true })).toBe('dark');
    expect(run({ throws: true, dark: false })).toBe('light');
  });

  it('a stored choice wins, and system or garbage follows the OS', () => {
    expect(run({ stored: 'light', dark: true })).toBe('light');
    expect(run({ stored: 'dark', dark: false })).toBe('dark');
    expect(run({ stored: 'system', dark: true })).toBe('dark');
    expect(run({ stored: 'nonsense', dark: false })).toBe('light');
  });
});

describe('AC9: the build and CI can see the suite file', () => {
  it('hive.yml triggers on ui/tokens/**', () => {
    const yml = readFileSync(resolve(here, '../../../.github/workflows/hive.yml'), 'utf-8');
    expect(yml.match(/paths: \[[^\]]*'ui\/tokens\/\*\*'[^\]]*\]/g)?.length).toBe(2);
  });

  it('the dev server may read ui/tokens', () => {
    const cfg = readFileSync(resolve(here, '../vite.config.ts'), 'utf-8');
    expect(cfg).toContain("'../../ui/tokens'");
    expect(cfg).toContain('searchForWorkspaceRoot');
  });
});
