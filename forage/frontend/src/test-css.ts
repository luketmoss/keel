// Test-only: Forage's stylesheet as the build sees it.
//
// global.css imports the suite token file (ui/tokens/suite.css), and the build
// inlines it. readGlobalCss() merges the suite's token blocks into the start of
// Forage's blocks with the same selectors, which resolves exactly as the
// cascade does: the import comes first and the selectors match, so Forage's
// own declarations still win any clash. Modelled on Hive's test-css.ts.
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore -- Node builtins available at test runtime
import { dirname, resolve } from 'path';
// @ts-ignore -- Node builtins available at test runtime
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export const GLOBAL_CSS_PATH = resolve(here, 'global.css');
export const SUITE_CSS_PATH = resolve(here, '../../../ui/tokens/suite.css');
export const REGISTRY_PATH = resolve(here, '../../../ui/docs/design/keel-wide-rules.md');

/** The three blocks a token stylesheet defines its tokens in. Quotes are normalised to double. */
export const TOKEN_SELECTORS = [':root', '[data-theme="light"]', '[data-theme="dark"]'] as const;

const IMPORT_RE = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Prettier writes `[data-theme='light']`, the suite file `"light"`; compare them as one. */
function normalise(css: string): string {
  return css.replace(/\[data-theme='(\w+)'\]/g, '[data-theme="$1"]');
}

function blockRange(css: string, selector: string): { open: number; close: number } | null {
  const m = new RegExp(`(?:^|\\n)${escape(selector)}\\s*\\{`).exec(css);
  if (!m) return null;
  const open = m.index + m[0].length;
  const close = css.indexOf('}', open);
  return close === -1 ? null : { open, close };
}

export function blockBody(css: string, selector: string): string {
  const r = blockRange(css, selector);
  return r ? css.slice(r.open, r.close) : '';
}

/** The custom properties a block declares, comments removed and whitespace collapsed. */
export function tokens(css: string, selector: string): Record<string, string> {
  const body = blockBody(css.replace(/\/\*[\s\S]*?\*\//g, ''), selector);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return out;
}

/** Every token in force under one theme: `:root`, then the theme's block. */
export function themeTokens(css: string, theme: 'light' | 'dark'): Record<string, string> {
  return { ...tokens(css, ':root'), ...tokens(css, `[data-theme="${theme}"]`) };
}

export function readGlobalCssRaw(): string {
  return normalise(readFileSync(GLOBAL_CSS_PATH, 'utf-8'));
}

/** global.css with the suite file's token blocks resolved into it. */
export function readGlobalCss(): string {
  const raw = readGlobalCssRaw();
  const imp = IMPORT_RE.exec(raw);
  if (!imp) throw new Error('global.css does not import the suite token file');
  if (resolve(here, imp[1]) !== SUITE_CSS_PATH) {
    throw new Error(`global.css imports ${imp[1]}, not ui/tokens/suite.css`);
  }
  const suite = normalise(readFileSync(SUITE_CSS_PATH, 'utf-8'));
  let css = raw.slice(0, imp.index) + raw.slice(imp.index + imp[0].length);
  let unmatched = '';
  for (const selector of TOKEN_SELECTORS) {
    const body = blockBody(suite, selector);
    if (!body) continue;
    const r = blockRange(css, selector);
    if (r) css = css.slice(0, r.open) + body + css.slice(r.open);
    else unmatched += `${selector} {${body}}\n`;
  }
  return unmatched ? css.slice(0, imp.index) + unmatched + css.slice(imp.index) : css;
}

/** The first rule whose whole selector list is exactly `selector` (so `body`, not `html, body`). */
export function rule(css: string, selector: string): string {
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].trim() === selector) return m[2];
  }
  return '';
}

export function readRegistry(): string {
  return readFileSync(REGISTRY_PATH, 'utf-8');
}
