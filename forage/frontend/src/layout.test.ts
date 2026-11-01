// #704: the 375px rules as the stylesheet states them. jsdom does no layout, so
// /test measures the running app with getBoundingClientRect(); these hold the
// rules that make those measurements pass.
import { describe, expect, it } from 'vitest';
import { readGlobalCss, rule, themeTokens } from './test-css';

const css = readGlobalCss();
const set = themeTokens(css, 'light');
const px = (name: string) => parseFloat(set[name]);

describe('tab targets are at least 44px tall', () => {
  it('a tab is at least --nav-height, which is at least 44px', () => {
    expect(rule(css, '.tab-bar-tab')).toContain('min-height: var(--nav-height)');
    expect(px('--nav-height')).toBeGreaterThanOrEqual(44);
  });

  it.each(['.account-btn', '.login-btn', '.login-link', '.demo-exit', '.account-signout'])(
    '%s is at least 44px',
    (sel) => {
      expect(rule(css, sel)).toMatch(/(min-)?height: var\(--touch-target\)/);
      expect(px('--touch-target')).toBeGreaterThanOrEqual(44);
    },
  );
});

describe('the last content is not hidden behind the tab bar', () => {
  it('content pads its bottom by the bar and the safe area', () => {
    expect(rule(css, '.tab-content')).toMatch(
      /padding: .*calc\(var\(--nav-height\) \+ env\(safe-area-inset-bottom, 0px\) \+ var\(--space-md\)\)/,
    );
  });

  it('the bar is fixed to the bottom', () => {
    const bar = rule(css, '.tab-bar');
    expect(bar).toContain('position: fixed');
    expect(bar).toContain('bottom: 0');
  });
});

describe('nothing scrolls horizontally at 375px', () => {
  it('the body clips sideways overflow', () => {
    expect(rule(css, 'body')).toContain('overflow-x: hidden');
  });

  it('four tabs share the width equally, never wider than their column', () => {
    expect(rule(css, '.tab-bar-inner')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
  });

  it('long emails wrap instead of widening the page', () => {
    expect(rule(css, '.account-email')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.login-btn')).toContain('overflow-wrap: anywhere');
  });
});

describe('wide screens', () => {
  it('the bar and content centre in the prototype column, 440px', () => {
    expect(set['--column-width']).toBe('440px');
    expect(rule(css, '.shell')).toContain('max-width: var(--column-width)');
    expect(rule(css, '.tab-bar-inner')).toContain('max-width: var(--column-width)');
  });
});
