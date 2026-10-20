// #405 — emoji replaced by drawn icons. One block per acceptance criterion.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { h, type ComponentType } from 'preact';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as icons from './components/shared/icons';
import { BottomNav } from './components/shared/bottom-nav';
import { TypeSelector } from './components/workout/type-selector';
import { IntentSelector } from './components/workout/intent-selector';
import { currentRoute } from './router/router';
import { blockBody, readGlobalCss, tokens } from './test-css';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));
const css = readGlobalCss();
const noop = () => {};

/** The markup an icon component draws, for comparing against what a control rendered. */
const drawn = (Icon: ComponentType) => {
  const { container } = render(h(Icon, {}));
  const html = container.querySelector('svg')!.outerHTML;
  cleanup();
  return html;
};

const NAV: [string, ComponentType][] = [
  ['Day', icons.SunIcon],
  ['Activities', icons.ClipboardIcon],
  ['Trends', icons.TrendIcon],
  ['Library', icons.BooksIcon],
  ['Settings', icons.GearIcon],
];
const PICKER: [string, ComponentType][] = [
  ['Weight', icons.DumbbellIcon],
  ['Stretch', icons.StretchIcon],
  ['Bike', icons.BikeIcon],
  ['Hike', icons.MountainIcon],
  ['Run', icons.RunIcon],
  ['Walk', icons.FootprintsIcon],
  ['Track Now', icons.StopwatchIcon],
  ['Plan for Later', icons.CalendarPlusIcon],
];

function renderPickers() {
  const a = render(h(TypeSelector, { onSelect: noop }));
  const b = render(h(IntentSelector, { onTrackNow: noop, onPlanForLater: noop, onBack: noop }));
  return [...a.container.querySelectorAll('.type-card'), ...b.container.querySelectorAll('.type-card')];
}

function renderNav() {
  currentRoute.value = { name: 'day', params: {}, hash: '/' };
  const { container } = render(h(BottomNav, {}));
  return [...container.querySelectorAll('button')];
}

describe('AC1: no emoji in non-test source', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  }
  const sources = walk(here).filter(
    (p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !/[\\/]test-[\w-]+\.ts$/.test(p),
  );
  const ALLOWED = new Set(['←', '✕', '✓', '↑', '↓']); // ← ✕ ✓ ↑ ↓
  // Emoji-block characters, and the variation selector that asks for emoji form.
  const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|️/gu;

  it('scans the source tree', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('finds none outside the allowed text symbols', () => {
    const found = sources.flatMap((p) =>
      [...readFileSync(p, 'utf-8').matchAll(EMOJI)]
        .map((m) => m[0])
        .filter((c) => !ALLOWED.has(c))
        .map((c) => `${p}: U+${c.codePointAt(0)!.toString(16)}`),
    );
    expect(found).toEqual([]);
  });
});

describe('AC2: each control renders its assigned icon, hidden from assistive tech', () => {
  it('the five nav tabs', () => {
    const tabs = renderNav();
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(NAV.map(([l]) => l));
    NAV.forEach(([, Icon], i) => {
      const svg = tabs[i].querySelector('.bottom-nav-icon svg');
      expect(svg?.outerHTML).toBe(drawn(Icon));
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('focusable')).toBe('false');
    });
  });

  it('the eight picker cards', () => {
    const cards = renderPickers();
    expect(cards.map((c) => c.querySelector('.type-card-label')?.textContent)).toEqual(PICKER.map(([l]) => l));
    PICKER.forEach(([, Icon], i) => {
      const svg = cards[i].querySelector('.type-card-icon svg');
      expect(svg?.outerHTML).toBe(drawn(Icon));
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('focusable')).toBe('false');
    });
  });

  it('thirteen distinct drawings', () => {
    expect(new Set([...NAV, ...PICKER].map(([, I]) => drawn(I))).size).toBe(13);
  });
});

describe('AC3: every icon is drawn in the house style', () => {
  const all = Object.entries(icons) as [string, ComponentType][];

  it('exports exactly the seventeen icons', () => {
    expect(all).toHaveLength(17);
  });

  it.each(all)('%s', (_name, Icon) => {
    const { container } = render(h(Icon, {}));
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
    // Outline only: nothing inside overrides the fill or the stroke.
    expect(svg.querySelector('[fill]:not([fill="none"]), [stroke], [stroke-width]')).toBeNull();
  });
});

describe('AC4: sizes come from --icon-md and --icon-lg', () => {
  it('defines the two tokens', () => {
    const root = tokens(css, ':root');
    expect(root['--icon-md']).toBe('24px');
    expect(root['--icon-lg']).toBe('40px');
  });

  it('sizes the nav icon and the picker icon from them', () => {
    expect(blockBody(css, '.bottom-nav-icon svg')).toMatch(/width:\s*var\(--icon-md\);\s*height:\s*var\(--icon-md\)/);
    expect(blockBody(css, '.type-card-icon svg')).toMatch(/width:\s*var\(--icon-lg\);\s*height:\s*var\(--icon-lg\)/);
  });

  it('leaves the nav at --nav-height, which the tab still fits', () => {
    expect(blockBody(css, '.bottom-nav')).toMatch(/height:\s*var\(--nav-height\)/);
    expect(blockBody(css, '.bottom-nav-tab')).toMatch(/padding:\s*var\(--space-xs\)/);
    // 4px top and bottom + 24px icon + 2px gap + an 18px label line.
    const nav = parseInt(
      tokens(readFileSync(resolve(here, '../../../ui/tokens/suite.css'), 'utf-8'), ':root')['--nav-height'],
      10,
    );
    expect(4 * 2 + 24 + 2 + 18).toBeLessThanOrEqual(nav);
  });
});

describe('AC5: accessible names', () => {
  it('picker cards are named exactly by their label', () => {
    const cards = renderPickers();
    expect(cards).toHaveLength(8);
    for (const [i, [label]] of PICKER.entries()) {
      expect(cards[i].textContent).toBe(label);
      expect(cards[i].hasAttribute('aria-label')).toBe(false);
    }
  });

  it('nav tabs keep their aria-label', () => {
    expect(renderNav().map((b) => b.getAttribute('aria-label'))).toEqual(NAV.map(([l]) => l));
  });
});

describe('AC6 and AC7: colour', () => {
  it('the tab takes muted at rest and primary text active, and its icon follows', () => {
    expect(blockBody(css, '.bottom-nav-tab')).toMatch(/color:\s*var\(--color-text-muted\)/);
    expect(blockBody(css, '.bottom-nav-tab.active')).toMatch(/color:\s*var\(--color-primary-text\)/);
    // The icon sets no colour of its own, so currentColor is the tab's.
    expect(blockBody(css, '.bottom-nav-icon')).not.toMatch(/color:/);
    expect(blockBody(css, '.bottom-nav-icon svg')).not.toMatch(/color:/);
  });

  it('the active tab keeps its top bar and bold label, and the comment no longer says emoji ignore colour', () => {
    expect(blockBody(css, '.bottom-nav-tab.active')).toMatch(/box-shadow:\s*inset 0 2px 0 var\(--color-primary\)/);
    expect(blockBody(css, '.bottom-nav-tab.active .bottom-nav-label')).toMatch(/font-weight:\s*700/);
    expect(css).not.toMatch(/icons are\s+emoji/);
  });

  it('picker icons are drawn in --color-primary-text', () => {
    expect(blockBody(css, '.type-card-icon')).toMatch(/color:\s*var\(--color-primary-text\)/);
  });
});

describe('AC8: no icon package', () => {
  it('adds no dependency that is an icon set', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf-8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /icon|lucide|feather|heroicons|fontawesome|phosphor|tabler/i.test(d))).toEqual([]);
  });
});
