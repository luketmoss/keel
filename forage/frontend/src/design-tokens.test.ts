// #704: light and dark follow the system, and every token the app uses
// resolves in both themes. As in Hive's design-tokens.test.ts, read against
// global.css with the suite file resolved into it.
import { afterEach, describe, expect, it } from 'vitest';
import { readGlobalCss, readGlobalCssRaw, themeTokens } from './test-css';
import { applySystemTheme, followSystemTheme } from './theme';

const css = readGlobalCss();

/** The tokens a value refers to, through `var(--x)` and `var(--x, fallback)`. */
function refs(text: string): string[] {
  return [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
}

/** Follow `var()` chains to the end; null when something on the way is undefined. */
function resolveToken(name: string, set: Record<string, string>, seen = new Set<string>()): string | null {
  if (seen.has(name)) return null;
  seen.add(name);
  const value = set[name];
  if (value === undefined) return null;
  for (const ref of refs(value)) if (resolveToken(ref, set, seen) === null) return null;
  return value;
}

/** Every token global.css draws with, outside the token blocks themselves. */
function usedTokens(): string[] {
  const raw = readGlobalCssRaw().replace(/\/\*[\s\S]*?\*\//g, '');
  const used = new Set<string>();
  for (const m of raw.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    for (const decl of m[2].split(';')) {
      if (/^\s*--/.test(decl)) continue;
      for (const r of refs(decl)) used.add(r);
    }
  }
  return [...used].sort();
}

describe('every token the app uses resolves in both themes', () => {
  const used = usedTokens();

  it('the stylesheet uses tokens at all', () => {
    expect(used.length).toBeGreaterThan(20);
  });

  for (const theme of ['light', 'dark'] as const) {
    const set = themeTokens(css, theme);
    it.each(used)(`${theme}: %s`, (name) => {
      expect(resolveToken(name, set)).not.toBeNull();
    });
  }

  it('the accent family is defined per theme, not borrowed', () => {
    for (const theme of ['light', 'dark'] as const) {
      const set = themeTokens(css, theme);
      for (const t of [
        '--color-accent',
        '--color-primary',
        '--color-primary-hover',
        '--color-primary-light',
        '--color-on-primary',
      ]) {
        expect(set[t], `${theme} ${t}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('the two themes differ, so the attribute matters', () => {
    expect(themeTokens(css, 'light')['--color-bg']).not.toBe(themeTokens(css, 'dark')['--color-bg']);
  });
});

describe('the theme follows the system setting', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
    document.documentElement.removeAttribute('data-theme');
  });

  function fakeSystem(dark: boolean) {
    const listeners = new Set<() => void>();
    const state = { dark };
    window.matchMedia = ((query: string) => ({
      get matches() {
        return query.includes('dark') && state.dark;
      },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    })) as unknown as typeof window.matchMedia;
    return {
      set(next: boolean) {
        state.dark = next;
        listeners.forEach((l) => l());
      },
      listeners,
    };
  }

  it('light system, light theme', () => {
    fakeSystem(false);
    applySystemTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('dark system, dark theme', () => {
    fakeSystem(true);
    applySystemTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a system change while open switches the theme, until stopped', () => {
    const sys = fakeSystem(false);
    const stop = followSystemTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    sys.set(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    stop();
    expect(sys.listeners.size).toBe(0);
  });
});
