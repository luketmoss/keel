// Test-only: Hive's stylesheet as the build sees it (#446).
//
// global.css imports the suite token file (ui/tokens/suite.css), and the build
// inlines it. The CSS tests read the stylesheet as text, and many of them take
// the first `[data-theme="light"]` block as the theme, so they read it through
// readGlobalCss(): the suite's token blocks merged into the start of Hive's
// blocks with the same selectors. That resolves exactly as the cascade does,
// because the import comes first and the selectors are identical, so Hive's
// own declarations still win on any clash. Nothing outside the tests imports
// this file.
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore -- Node builtins available at test runtime
import { dirname, resolve } from 'path';
// @ts-ignore -- Node builtins available at test runtime
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export const GLOBAL_CSS_PATH = resolve(here, 'global.css');
export const SUITE_CSS_PATH = resolve(here, '../../../ui/tokens/suite.css');

/** The three blocks a token stylesheet defines its tokens in. */
export const TOKEN_SELECTORS = [':root', '[data-theme="light"]', '[data-theme="dark"]'] as const;
export type TokenSelector = (typeof TOKEN_SELECTORS)[number];

const IMPORT_RE = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The body of the first top-level block whose selector is exactly `selector`. */
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

export function readSuiteCss(): string {
  return readFileSync(SUITE_CSS_PATH, 'utf-8');
}

/** global.css exactly as it is on disk, with its import unresolved. */
export function readGlobalCssRaw(): string {
  return readFileSync(GLOBAL_CSS_PATH, 'utf-8');
}

/** global.css with the suite file's token blocks resolved into it. */
export function readGlobalCss(): string {
  const raw = readGlobalCssRaw();
  const imp = IMPORT_RE.exec(raw);
  if (!imp) throw new Error('global.css does not import the suite token file');
  if (resolve(here, imp[1]) !== SUITE_CSS_PATH) {
    throw new Error(`global.css imports ${imp[1]}, not ui/tokens/suite.css`);
  }
  const suite = readSuiteCss();
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
