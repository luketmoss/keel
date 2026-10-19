// luketmoss/keel#443 — the install must work from any base path, so the
// manifest's start_url and scope stay relative and every icon is reached
// through %BASE_URL% or a path relative to the manifest.
import { describe, it, expect } from 'vitest';
// @ts-ignore -- Node builtins available at test runtime
import { readFileSync } from 'fs';
// @ts-ignore
import { resolve } from 'path';

// @ts-ignore -- __dirname available in vitest CJS context
const m = JSON.parse(readFileSync(resolve(__dirname, '../public/manifest.webmanifest'), 'utf-8'));
// @ts-ignore
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8');

describe('manifest.webmanifest (#443)', () => {
  it('has a relative start_url and scope', () => {
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
  });
  it('lists three icons, none with an absolute path', () => {
    expect(m.icons).toHaveLength(3);
    for (const i of m.icons) expect(i.src).not.toMatch(/^\//);
  });
  it('index.html reaches the manifest and every icon through %BASE_URL%', () => {
    const hrefs = [...html.matchAll(/<link\s+[^>]*href="([^"]*)"/g)].map((x) => x[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h).toMatch(/^%BASE_URL%/);
  });
});
