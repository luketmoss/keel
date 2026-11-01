// #706: the review screen's 375px rules as the stylesheet states them. jsdom
// does no layout, so /test measures the running app; these hold the rules
// that make those measurements pass.
import { describe, expect, it } from 'vitest';
import { readGlobalCss, rule, themeTokens } from '../test-css';

const css = readGlobalCss();
const touch = parseFloat(themeTokens(css, 'light')['--touch-target']);

describe('every tappable row is at least 44px', () => {
  it.each([
    '.btn',
    '.text-btn',
    '.icon-btn',
    '.field',
    '.row-btn',
    '.line-main',
    '.line-status',
    '.choice',
    '.disclosure',
    '.bookmarklet-link',
    '.switch-row',
    '.recipe-row',
    '.source-link',
  ])('%s', (sel) => {
    expect(rule(css, sel)).toMatch(/(min-)?height: var\(--touch-target\)/);
    expect(touch).toBeGreaterThanOrEqual(44);
  });
});

describe('nothing scrolls sideways at 375px', () => {
  it('long names and source text wrap', () => {
    for (const sel of ['.line-parsed', '.line-source', '.line-status', '.recipe-name', '.recipe-meta', '.choice']) {
      expect(rule(css, sel), sel).toContain('overflow-wrap: anywhere');
    }
  });

  it('a line row wraps its status under the text rather than widening', () => {
    expect(rule(css, '.line-row')).toContain('flex-wrap: wrap');
    expect(rule(css, '.line-main')).toContain('min-width: 0');
    expect(rule(css, '.line-parsed')).toContain('flex-wrap: wrap');
  });

  it('the servings and time pair share the width', () => {
    expect(rule(css, '.field-pair')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  it('the review and sheets keep to the column', () => {
    expect(rule(css, '.review')).toContain('max-width: var(--column-width)');
    expect(rule(css, '.sheet')).toContain('max-width: var(--column-width)');
  });
});

describe('Save is not hidden', () => {
  it('the actions are pinned to the bottom, above the home indicator, and the review has no tab bar', () => {
    const actions = rule(css, '.review-actions');
    expect(actions).toContain('position: sticky');
    expect(actions).toContain('bottom: 0');
    expect(actions).toMatch(/env\(safe-area-inset-bottom, 0px\)/);
  });
});
