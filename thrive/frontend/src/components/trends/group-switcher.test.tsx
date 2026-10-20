// #243 AC4 — the group switcher, against a 3-group and a 6-group registry.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/preact';
import { h } from 'preact';
import { GroupSwitcher } from './group-switcher';
import type { TrendGroup } from './metrics';
import { groupPref, readPref, writePref } from './prefs';
import { readGlobalCss } from '../../test-css';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

const fixture = (n: number): TrendGroup[] =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, label: `Group ${i}`, metrics: [] }));

const mount = (n: number, value = 'g0', onChange = vi.fn()) => ({
  onChange,
  ...render(h(GroupSwitcher, { groups: fixture(n), value, onChange })),
});

describe('renders', () => {
  it.each([3, 6])('with %i groups: one labelled row, one button per group in order', (n) => {
    const { container } = mount(n, 'g1');
    const region = container.querySelector('[role="region"]')!;
    expect(region.getAttribute('aria-label')).toBe('Metric group');
    expect(region.getAttribute('tabindex')).toBe('0');
    const row = region.querySelector('[role="group"]')!;
    expect(row.getAttribute('aria-label')).toBe('Metric group');
    const buttons = [...row.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(fixture(n).map((g) => g.label));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(
      buttons.map((_, i) => (i === 1 ? 'true' : 'false')),
    );
    expect(buttons.every((b) => b.classList.contains('trends-group-btn'))).toBe(true);
  });

  it('renders nothing with fewer than two groups', () => {
    expect(mount(1).container.innerHTML).toBe('');
    expect(mount(0).container.innerHTML).toBe('');
  });

  it('reports the clicked group', () => {
    const { container, onChange } = mount(6);
    fireEvent.click(container.querySelectorAll('button')[4]);
    expect(onChange).toHaveBeenCalledWith('g4');
  });
});

describe('layout contract (css)', () => {
  // jsdom has no layout; prove the rules that keep six groups inside the wrapper.
  it('the row never wraps and the wrapper scrolls sideways', () => {
    const css = readGlobalCss();
    expect(css).toMatch(/\.trends-group-scroll\s*{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.trends-group-scroll\s*{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/\.trends-group-row\s*{[^}]*flex-wrap:\s*nowrap/);
    expect(css).toMatch(/\.trends-group-btn\s*{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.trends-group-btn\s*{[^}]*min-height:\s*44px/);
  });
});

describe('underlined tabs (#503)', () => {
  const rule = (sel: string) => {
    const css = readGlobalCss();
    const at = css.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };

  it('are text on the page: no box, a 2px underline slot, a rule under the row', () => {
    const tab = rule('.trends-group-btn');
    expect(tab).toMatch(/border:\s*none/);
    expect(tab).toMatch(/border-bottom:\s*2px solid transparent/);
    expect(tab).toMatch(/background:\s*transparent/);
    expect(rule('.trends-group-row')).toMatch(/border-bottom:\s*1px solid var\(--color-border\)/);
  });

  it('the selected one is underlined and bold as well as coloured', () => {
    const on = rule('.trends-group-btn.active');
    expect(on).toMatch(/border-bottom-color:\s*var\(--color-primary-text\)/);
    expect(on).toMatch(/font-weight:\s*700/);
    expect(on).toMatch(/color:\s*var\(--color-primary-text\)/);
  });
});

describe('the selected tab is scrolled fully into view (#503)', () => {
  /** A 300px scroller over a row of 100px tabs, tab i at x = i * 100 - scrollLeft. */
  function layout(scroller: HTMLElement) {
    const tabs = [...scroller.querySelectorAll('button')];
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 300 } as DOMRect);
    tabs.forEach((t, i) =>
      vi
        .spyOn(t, 'getBoundingClientRect')
        .mockImplementation(
          () => ({ left: i * 100 - scroller.scrollLeft, right: i * 100 + 100 - scroller.scrollLeft }) as DOMRect,
        ),
    );
  }

  it('on arrival, brings an off-screen selected tab in at the right edge', () => {
    const { container, rerender } = mount(7, 'g0');
    const scroller = container.querySelector<HTMLElement>('.trends-group-scroll')!;
    layout(scroller);
    expect(scroller.scrollLeft).toBe(0);
    rerender(h(GroupSwitcher, { groups: fixture(7), value: 'g6', onChange: vi.fn() }));
    // Tab 6 spans 600-700; the scroller shows 300 wide, so it ends at 700.
    expect(scroller.scrollLeft).toBe(400);
  });

  it('brings one hidden on the left back, and leaves a visible one alone', () => {
    const { container, rerender } = mount(7, 'g0');
    const scroller = container.querySelector<HTMLElement>('.trends-group-scroll')!;
    layout(scroller);
    scroller.scrollLeft = 400;
    rerender(h(GroupSwitcher, { groups: fixture(7), value: 'g5', onChange: vi.fn() }));
    expect(scroller.scrollLeft).toBe(400); // 500-600 is within 400-700
    rerender(h(GroupSwitcher, { groups: fixture(7), value: 'g1', onChange: vi.fn() }));
    expect(scroller.scrollLeft).toBe(100);
  });
});

describe('the group pref', () => {
  const groups = fixture(6);
  it('defaults to the first group when missing, unknown or unreadable', () => {
    const p = groupPref(groups);
    expect(p.key).toBe('thrive-trends-group');
    expect(readPref(p)).toBe('g0');
    localStorage.setItem(p.key, 'nope');
    expect(readPref(p)).toBe('g0');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('x');
    });
    expect(readPref(p)).toBe('g0');
  });
  it('restores a stored group', () => {
    const p = groupPref(groups);
    writePref(p, 'g5');
    expect(readPref(p)).toBe('g5');
  });
});
