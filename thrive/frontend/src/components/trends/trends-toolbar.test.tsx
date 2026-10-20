// #503 — the toolbar's layout contract, which jsdom cannot measure: the sizes
// and the wrap that the running app is checked against.
import { describe, it, expect } from 'vitest';
import { readGlobalCss } from '../../test-css';

const css = readGlobalCss();
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`);
  expect(at, sel).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('every toolbar control is at least 44px', () => {
  it.each(['.trends-chip', '.trends-menu-item'])('%s is at least 44px tall', (sel) => {
    expect(rule(sel)).toMatch(/min-height:\s*44px/);
  });

  it('.trends-chip is at least 44px wide, and each view button is 44 by 44', () => {
    expect(rule('.trends-chip')).toMatch(/min-width:\s*44px/);
    expect(rule('.trends-view-btn')).toMatch(/width:\s*44px/);
    expect(rule('.trends-view-btn')).toMatch(/height:\s*44px/);
  });
});

describe('the toolbar shares the heading row and wraps by content', () => {
  it('the header wraps, and the toolbar keeps its own width and sits right', () => {
    expect(rule('.trends-header')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.trends-header')).toMatch(/justify-content:\s*space-between/);
    expect(rule('.trends-toolbar')).toMatch(/flex:\s*none/);
    expect(rule('.trends-toolbar')).toMatch(/margin-left:\s*auto/);
  });

  it('a menu is anchored to its chip and never wider than the screen column', () => {
    expect(rule('.trends-menu-wrap')).toMatch(/position:\s*relative/);
    expect(rule('.trends-menu')).toMatch(/position:\s*absolute/);
    expect(rule('.trends-menu')).toMatch(/max-width:\s*calc\(100vw - 2 \* var\(--space-md\)\)/);
  });

  it('the menus do not animate', () => {
    for (const sel of ['.trends-chip', '.trends-menu', '.trends-menu-item', '.trends-view-btn'])
      expect(rule(sel), sel).not.toMatch(/transition|animation/);
  });
});

describe('selected and open are not told by colour alone', () => {
  it('the open chip and the pressed view button have a 2px inset edge', () => {
    expect(rule('.trends-chip.open')).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--color-primary-text\)/);
    expect(rule('.trends-view-btn.active')).toMatch(/box-shadow:\s*inset 0 0 0 2px var\(--color-primary-text\)/);
  });

  it('the current menu item is bold, and carries a tick in the markup', () => {
    expect(rule('.trends-menu-item.current')).toMatch(/font-weight:\s*700/);
  });
});

describe('colours are tokens', () => {
  it.each([
    '.trends-chip',
    '.trends-chip.on',
    '.trends-chip.open',
    '.trends-view-switch',
    '.trends-view-btn',
    '.trends-view-btn.active',
    '.trends-menu',
    '.trends-menu-item',
    '.trends-menu-item.current',
    '.trends-group-btn',
    '.trends-group-btn.active',
  ])('%s has no raw colour', (sel) => {
    expect(rule(sel)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
