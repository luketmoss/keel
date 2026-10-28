// #667 — the Logbook's stylesheet: every control holds a 44 x 44 hit area, the selected effort pill and the
// tiles meet 4.5:1 in both themes, the screen takes forced colours, and the redraw adds no token.
import { describe, it, expect } from 'vitest';
import { readGlobalCss } from './test-css';

const css = readGlobalCss()
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function rules(selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`, 'g');
  return [...css.matchAll(re)].map((m) => m[1]);
}
function rule(selector: string): string {
  const r = rules(selector);
  if (r.length === 0) throw new Error(`no rule for ${selector}`);
  return r[0];
}
const px = (body: string, prop: string): number | undefined => {
  const m = body.match(new RegExp(`(?:^|[\\s;])${prop}:\\s*(\\d+)px`));
  return m ? Number(m[1]) : undefined;
};

describe('hit areas (375 px wide)', () => {
  // The control, and the size property that makes its hit area.
  const TALL: [string, string][] = [
    ['.lb-tile', 'height'],
    ['.lb-step-btn', 'height'],
    ['.form-input.lb-step-input', 'min-height'],
    ['.lb-text-btn', 'min-height'],
    ['.lb-effort-pill', 'min-height'],
    ['.btn.lb-next-btn', 'min-height'],
    ['.btn-ghost.lb-add-btn', 'min-height'],
    ['.lb-lift-chip.btn', 'min-height'],
    ['.lb-screen .filter-chip', 'min-height'],
    ['.lb-section-row', 'min-height'],
    ['.lb-name-row', 'min-height'],
    ['.form-input.lb-input', 'min-height'],
    ['.lb-sheet-actions .lb-keep-btn', 'min-height'],
    ['.lb-sheet-actions .lb-save-btn', 'min-height'],
    ['.lb-finish-bar .btn', 'min-height'],
  ];
  it.each(TALL)('%s is at least 44 px high', (sel, prop) => {
    expect(px(rule(sel), prop), `${sel} ${prop}`).toBeGreaterThanOrEqual(44);
  });

  it('the tile and the stepper buttons are at least 44 px wide, and the tile is 58 x 44', () => {
    expect(px(rule('.lb-tile'), 'width')).toBe(58);
    expect(px(rule('.lb-tile'), 'height')).toBe(44);
    expect(px(rule('.lb-step-btn'), 'width')).toBe(44);
  });

  it("the options button is the detail screen's round 44 px one", () => {
    expect(px(rule('.detail-icon-btn'), 'width')).toBe(44);
    expect(px(rule('.detail-icon-btn'), 'height')).toBe(44);
  });
});

function block(theme: 'light' | 'dark'): string {
  const m = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`));
  if (!m) throw new Error(`no ${theme} block`);
  return m[1];
}
const token = (theme: 'light' | 'dark', name: string) => {
  const m = block(theme).match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`${name} is not a hex in ${theme}`);
  return m[1];
};
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

describe.each(['light', 'dark'] as const)('contrast (%s)', (theme) => {
  it.each(['easy', 'medium', 'hard'])('a selected %s pill: --color-on-fill on its --effort fill is 4.5:1', (effort) => {
    expect(rule(`.lb-effort-${effort}.active`)).toContain(`background: var(--effort-${effort})`);
    const ratio = contrast(token(theme, '--color-on-fill'), token(theme, `--effort-${effort}`));
    expect(ratio, `${theme} ${effort}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['easy', 'medium', 'hard'])('the %s word on a logged tile is 4.5:1 on the tile and on the card', (effort) => {
    const fill = theme === 'light' ? '--color-bg' : '--color-surface-raised';
    expect(contrast(token(theme, `--effort-${effort}`), token(theme, fill))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(theme, `--effort-${effort}`), token(theme, '--color-surface'))).toBeGreaterThanOrEqual(4.5);
  });

  it('text, secondary and muted text meet 4.5:1 on the tile fills, the editor and the card', () => {
    const fills =
      theme === 'light'
        ? ['--color-bg', '--color-surface']
        : ['--color-surface-raised', '--color-bg', '--color-surface'];
    for (const fg of ['--color-text', '--color-text-secondary', '--color-text-muted', '--color-primary-text']) {
      for (const bg of fills) {
        expect(contrast(token(theme, fg), token(theme, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the banner text, its icon and Sync now meet 4.5:1 on --color-warning-light', () => {
    const bg = token(theme, '--color-warning-light');
    for (const fg of ['--color-text', '--color-warning', '--color-primary-text']) {
      expect(contrast(token(theme, fg), bg), fg).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the look', () => {
  it('the logged tile is --color-bg on the light theme and --color-surface-raised on dark', () => {
    expect(rule('.lb-tile')).toMatch(/background:\s*var\(--color-bg\)/);
    expect(rule('[data-theme="dark"] .lb-tile')).toMatch(/background:\s*var\(--color-surface-raised\)/);
  });

  it('the open tile has a 2px brand border and the unlogged one a dashed strong border', () => {
    expect(rule('.lb-tile.lb-tile-open')).toMatch(/border:\s*2px solid var\(--color-primary\)/);
    expect(rule('.lb-tile.lb-tile-undone,\n.lb-tile.lb-tile-add')).toMatch(
      /border:\s*1px dashed var\(--color-border-strong\)/,
    );
  });

  it("the tile's bottom line is --text-2xs", () => {
    expect(rule('.lb-tile-note')).toMatch(/font-size:\s*var\(--text-2xs\)/);
  });

  it('the redraw adds no token to the stylesheet', () => {
    const declared = [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).filter((n) => /^--lb-/.test(n));
    expect(declared).toEqual([]);
  });
});

describe('forced colours', () => {
  const forced = (() => {
    const start = css.indexOf('@media (forced-colors: active)');
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    throw new Error('Unterminated forced-colors block');
  })();

  it('names the selected effort pill with Highlight and HighlightText', () => {
    expect(forced).toContain('.lb-effort-pill.active');
  });

  it('tiles and cards take a CanvasText edge, the open tile a 2px Highlight one', () => {
    expect(forced).toMatch(/\.lb-tile,[^{]*\{[^}]*border:\s*1px solid CanvasText/);
    expect(forced).toMatch(/\.lb-tile\.lb-tile-open\s*\{[^}]*border:\s*2px solid Highlight/);
    expect(forced).toMatch(/\.lb-card,[^{]*\{[^}]*border:\s*1px solid CanvasText/);
  });
});

describe('the old Logbook look is gone from the stylesheet', () => {
  it.each([
    '.tracker-exercise',
    '.tracker-set',
    '.quick-fill-row',
    '.set-weight-input',
    '.set-remove-btn',
    '.exercise-toolbar-btn',
    '.section-badge-btn',
    '.sync-status-bar',
    '.workout-tracker-header',
    '.add-set-btn',
    '.last-time-panel',
    '.section-ss-group',
  ])('has no %s rule', (sel) => {
    expect(css.includes(sel + ' ') || css.includes(sel + ',') || css.includes(sel + '{')).toBe(false);
  });
});
