/**
 * Tests for issue #79 — Apply unified orange color scheme; #397 moved it to cobalt
 * Validates that global.css token values match the spec.
 *
 * Strategy: parse the raw CSS text and extract custom property values
 * from the [data-theme="light"] and [data-theme="dark"] blocks.
 * This avoids needing a browser environment.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { readGlobalCss } from './test-css';

let cssText: string;

beforeAll(() => {
  cssText = readGlobalCss();
});

function extractBlock(css: string, selector: string): string {
  // Match the block for the given selector (handles nested braces by counting depth)
  const idx = css.indexOf(selector);
  if (idx === -1) return '';
  const start = css.indexOf('{', idx);
  if (start === -1) return '';
  let depth = 0;
  let end = start;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return css.slice(start + 1, end);
}

function getToken(block: string, token: string): string | null {
  const re = new RegExp(`${token}\\s*:\\s*([^;]+);`);
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

describe('AC1: Primary color tokens — light mode (#397 cobalt identity)', () => {
  let block: string;
  beforeAll(() => { block = extractBlock(cssText, '[data-theme="light"]'); });

  it('--color-primary is #2f66f0', () => {
    expect(getToken(block, '--color-primary')).toBe('#2f66f0');
  });
  it('--color-primary-hover is #2452c9', () => {
    expect(getToken(block, '--color-primary-hover')).toBe('#2452c9');
  });
  it('--color-primary-light is #ebf1ff', () => {
    expect(getToken(block, '--color-primary-light')).toBe('#ebf1ff');
  });
  it('--color-primary-on-light is #2452c9', () => {
    expect(getToken(block, '--color-primary-on-light')).toBe('#2452c9');
  });
  it('--color-primary-text is #2452c9', () => {
    expect(getToken(block, '--color-primary-text')).toBe('#2452c9');
  });
  it('--color-primary-rgb is 47, 102, 240', () => {
    expect(getToken(block, '--color-primary-rgb')).toBe('47, 102, 240');
  });
  it('--color-primary-focus-ring is rgba(47, 102, 240, 0.25)', () => {
    expect(getToken(block, '--color-primary-focus-ring')).toBe('rgba(47, 102, 240, 0.25)');
  });
  it('--color-primary-fill is #2f66f0', () => {
    expect(getToken(block, '--color-primary-fill')).toBe('#2f66f0');
  });
  it('--color-primary-fill-hover is #2452c9', () => {
    expect(getToken(block, '--color-primary-fill-hover')).toBe('#2452c9');
  });
  it('--chart-line is #2452c9', () => {
    expect(getToken(block, '--chart-line')).toBe('#2452c9');
  });
  it('--chart-band is #e1e9fd', () => {
    expect(getToken(block, '--chart-band')).toBe('#e1e9fd');
  });
});

describe('AC1: Primary color tokens — dark mode (#397 cobalt identity)', () => {
  let block: string;
  beforeAll(() => { block = extractBlock(cssText, '[data-theme="dark"]'); });

  it('--color-primary is #6e97ff', () => {
    expect(getToken(block, '--color-primary')).toBe('#6e97ff');
  });
  it('--color-primary-hover is #8fb1ff', () => {
    expect(getToken(block, '--color-primary-hover')).toBe('#8fb1ff');
  });
  it('--color-primary-light is #16213f', () => {
    expect(getToken(block, '--color-primary-light')).toBe('#16213f');
  });
  it('--color-primary-on-light is #8fb1ff', () => {
    expect(getToken(block, '--color-primary-on-light')).toBe('#8fb1ff');
  });
  it('--color-primary-text is #6e97ff', () => {
    expect(getToken(block, '--color-primary-text')).toBe('#6e97ff');
  });
  it('--color-primary-rgb is 110, 151, 255', () => {
    expect(getToken(block, '--color-primary-rgb')).toBe('110, 151, 255');
  });
  it('--color-primary-focus-ring is rgba(110, 151, 255, 0.3)', () => {
    expect(getToken(block, '--color-primary-focus-ring')).toBe('rgba(110, 151, 255, 0.3)');
  });
  it('--color-primary-fill is #6e97ff', () => {
    expect(getToken(block, '--color-primary-fill')).toBe('#6e97ff');
  });
  it('--color-primary-fill-hover is #8fb1ff', () => {
    expect(getToken(block, '--color-primary-fill-hover')).toBe('#8fb1ff');
  });
  it('--chart-line is #6e97ff', () => {
    expect(getToken(block, '--chart-line')).toBe('#6e97ff');
  });
  it('--chart-band is #1a2645', () => {
    expect(getToken(block, '--chart-band')).toBe('#1a2645');
  });
});

describe('AC1: brand accent and no orange left (#397)', () => {
  it('--color-accent is #2f66f0', () => {
    expect(cssText).toMatch(/--color-accent:\s*#2f66f0;/);
  });
});

describe('AC3: Neutral palette tokens — light mode', () => {
  let lightBlock: string;
  beforeAll(() => { lightBlock = extractBlock(cssText, '[data-theme="light"]'); });

  it('--color-bg is #f0f2f5', () => {
    expect(getToken(lightBlock, '--color-bg')).toBe('#f0f2f5');
  });
  it('--color-border is #dadce0', () => {
    expect(getToken(lightBlock, '--color-border')).toBe('#dadce0');
  });
  it('--color-border-light is #e8eaed', () => {
    expect(getToken(lightBlock, '--color-border-light')).toBe('#e8eaed');
  });
  it('--color-text is #1f1f1f', () => {
    expect(getToken(lightBlock, '--color-text')).toBe('#1f1f1f');
  });
  it('--color-text-secondary is #5f6368', () => {
    expect(getToken(lightBlock, '--color-text-secondary')).toBe('#5f6368');
  });
});

describe('AC3: Neutral palette tokens — dark mode', () => {
  let darkBlock: string;
  beforeAll(() => { darkBlock = extractBlock(cssText, '[data-theme="dark"]'); });

  it('--color-bg is #121212', () => {
    expect(getToken(darkBlock, '--color-bg')).toBe('#121212');
  });
  it('--color-surface-raised is #252528', () => {
    expect(getToken(darkBlock, '--color-surface-raised')).toBe('#252528');
  });
  it('--color-border is #3c3c3c', () => {
    expect(getToken(darkBlock, '--color-border')).toBe('#3c3c3c');
  });
  it('--color-text is #e8eaed', () => {
    expect(getToken(darkBlock, '--color-text')).toBe('#e8eaed');
  });
  it('--color-text-secondary is #9aa0a6', () => {
    expect(getToken(darkBlock, '--color-text-secondary')).toBe('#9aa0a6');
  });
});

describe('AC4: Semantic color tokens — light mode', () => {
  let lightBlock: string;
  beforeAll(() => { lightBlock = extractBlock(cssText, '[data-theme="light"]'); });

  it('--color-danger is #d32f2f', () => {
    expect(getToken(lightBlock, '--color-danger')).toBe('#d32f2f');
  });
  it('--color-success is #2e7d32', () => {
    expect(getToken(lightBlock, '--color-success')).toBe('#2e7d32');
  });
  it('--color-warning is #a05d00', () => {
    expect(getToken(lightBlock, '--color-warning')).toBe('#a05d00');
  });
});

describe('AC4: Semantic color tokens — dark mode', () => {
  let darkBlock: string;
  beforeAll(() => { darkBlock = extractBlock(cssText, '[data-theme="dark"]'); });

  it('--color-danger is #ef5350', () => {
    expect(getToken(darkBlock, '--color-danger')).toBe('#ef5350');
  });
  it('--color-success is #66bb6a', () => {
    expect(getToken(darkBlock, '--color-success')).toBe('#66bb6a');
  });
  it('--color-warning is #ffb74d', () => {
    expect(getToken(darkBlock, '--color-warning')).toBe('#ffb74d');
  });
});

describe('AC5: Focus ring token, manifest, no blue remnants', () => {
  it('focus box-shadow rules use var(--color-primary-focus-ring), not var(--color-primary-light)', () => {
    // Should not find old pattern
    expect(cssText).not.toMatch(/box-shadow:\s*0 0 0 [23]px var\(--color-primary-light\)/);
    // Should find new pattern at least once
    expect(cssText).toMatch(/box-shadow:.*var\(--color-primary-focus-ring\)/);
  });

  it('no blue primary hex remnants in global.css', () => {
    expect(cssText).not.toMatch(/#4f6ef7/i);
    expect(cssText).not.toMatch(/#6b8aff/i);
    expect(cssText).not.toMatch(/#3b5de5/i);
    expect(cssText).not.toMatch(/#5a7af5/i);
  });

  it('manifest.json background_color is the tile navy #0f2a7a (#397)', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../public/manifest.json'), 'utf-8')
    );
    expect(manifest.background_color).toBe('#0f2a7a');
  });
});

describe('#112: the weekly target row is removed, its shared styling is not', () => {
  it('AC4: the .target-met rule is gone', () => {
    expect(cssText).not.toMatch(/\.target-met/);
  });

  it('AC2: .stats-row and .stats-row-value survive — the cardio row still uses them', () => {
    expect(cssText).toMatch(/^\.stats-row \{/m);
    expect(cssText).toMatch(/^\.stats-row-value \{/m);
  });

  it('AC4: --color-success stays, it is used elsewhere', () => {
    expect(cssText).toMatch(/--color-success:/);
  });
});
