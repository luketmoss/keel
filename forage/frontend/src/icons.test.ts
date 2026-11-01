// #704: the app icon, favicon and manifest from #702 are linked through %BASE_URL%.
import { describe, expect, it } from 'vitest';
// @ts-ignore -- Node builtins available at test runtime
import { existsSync, readFileSync } from 'fs';
// @ts-ignore -- Node builtins available at test runtime
import { dirname, resolve } from 'path';
// @ts-ignore -- Node builtins available at test runtime
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf-8');

function hrefs(rel: string): string[] {
  return [...html.matchAll(new RegExp(`<link rel="${rel}"[^>]*href="([^"]+)"`, 'g'))].map((m) => m[1]);
}

describe('index.html', () => {
  it.each([
    ['manifest', 'manifest.webmanifest'],
    ['icon', 'favicon.ico'],
    ['icon', 'forage-mark.svg'],
    ['apple-touch-icon', 'forage-app-icon-180.png'],
  ])('links %s %s through %BASE_URL%, and the file exists', (rel, file) => {
    expect(hrefs(rel)).toContain(`%BASE_URL%${file}`);
    expect(existsSync(resolve(root, 'public', file))).toBe(true);
  });

  it('every link is under %BASE_URL%, none absolute', () => {
    for (const m of html.matchAll(/<link[^>]*href="([^"]+)"/g)) expect(m[1]).toMatch(/^%BASE_URL%/);
  });

  it('loads no Google script itself', () => {
    expect(html).not.toContain('accounts.google.com');
  });
});

describe('the manifest', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf-8'));

  it('icons are relative, so they follow the base', () => {
    for (const icon of manifest.icons) {
      expect(icon.src).not.toMatch(/^\//);
      expect(existsSync(resolve(root, 'public', icon.src))).toBe(true);
    }
  });
});

describe('the sign-in mark', () => {
  it('uses BASE_URL', () => {
    const src = readFileSync(resolve(root, 'src/shell/forage-mark.tsx'), 'utf-8');
    expect(src).toContain('import.meta.env.BASE_URL}forage-mark.svg');
  });
});
