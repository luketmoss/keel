// #272 AC1 — the page must stay pinch-zoomable (WCAG 1.4.4, 1.4.10).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8');

describe('index.html viewport meta (#272)', () => {
  it('does not disable zooming', () => {
    const m = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/width=device-width/);
    expect(m![1]).not.toMatch(/user-scalable/i);
    expect(m![1]).not.toMatch(/maximum-scale/i);
  });
});

// #397 — Thrive's cobalt identity: icons, theme colour and manifest.
const pub = (f: string) => resolve(__dirname, '../public', f);
const links = [...html.matchAll(/<link\s+([^>]*)>/g)].map((m) => m[1]);
const linkFor = (rel: string, extra = '') =>
  links.find((l) => new RegExp(`rel="${rel}"`).test(l) && l.includes(extra));
const href = (l: string | undefined) => l?.match(/href="([^"]*)"/)?.[1];
const sha = (f: string) =>
  createHash('sha256').update(readFileSync(pub(f), 'utf-8').replace(/\r\n/g, '\n')).digest('hex');

describe('index.html icons and chrome (#397)', () => {
  it('declares the ICO and the mark as icons, through %BASE_URL%', () => {
    expect(href(linkFor('icon', 'sizes="32x32"'))).toBe('%BASE_URL%favicon.ico');
    expect(href(linkFor('icon', 'image/svg+xml'))).toBe('%BASE_URL%thrive-mark.svg');
  });
  it('apple-touch-icon is the 180 PNG, not an SVG', () => {
    expect(href(linkFor('apple-touch-icon'))).toBe('%BASE_URL%thrive-app-icon-180.png');
  });
  it('links the manifest through %BASE_URL%', () => {
    expect(href(linkFor('manifest'))).toBe('%BASE_URL%manifest.json');
  });
  it('has one theme-color, the tile navy', () => {
    expect([...html.matchAll(/name="theme-color"/g)]).toHaveLength(1);
    expect(html).toContain('<meta name="theme-color" content="#0f2a7a" />');
  });
  it('keeps the title', () => {
    expect(html).toContain('<title>Thrive — Workout Tracker</title>');
  });
});

describe('manifest.json (#397)', () => {
  const m = JSON.parse(readFileSync(pub('manifest.json'), 'utf-8'));
  it('lists the 192 and 512 PNGs as "any" only, no maskable', () => {
    expect(m.icons).toEqual([
      { src: 'thrive-app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'thrive-app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
  });
  it('theme and background are the tile navy; identity fields are unchanged', () => {
    expect(m.theme_color).toBe('#0f2a7a');
    expect(m.background_color).toBe('#0f2a7a');
    expect(m.name).toBe('Thrive — Workout Tracker');
    expect(m.short_name).toBe('Thrive');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
  });
});

describe('public/ icon files (#397)', () => {
  it('the artwork SVGs are byte-identical to the issue (sha256, line endings normalised)', () => {
    expect(sha('thrive-mark.svg')).toBe('1977a6341000a258f0b729b6f6fc34dbbfa75685387a2149895411d71783b7a9');
    expect(sha('thrive-app-icon.svg')).toBe('76ec80a859a4461e4dba1b9fe4099a03485d902891c9e4128bef9ca7b214cdd1');
  });
  it.each([180, 192, 512])('thrive-app-icon-%i.png is exactly that size', (n) => {
    const b = readFileSync(pub(`thrive-app-icon-${n}.png`));
    expect(b.subarray(1, 4).toString()).toBe('PNG');
    expect(b.readUInt32BE(16)).toBe(n);
    expect(b.readUInt32BE(20)).toBe(n);
  });
  it('favicon.ico holds 16, 32 and 48 px images', () => {
    const b = readFileSync(pub('favicon.ico'));
    expect(b.readUInt16LE(2)).toBe(1); // ICO type
    const count = b.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
    expect(sizes).toEqual([16, 32, 48]);
  });
  it.each([
    'thrive-favicon.svg', 'thrive-icon-192.svg', 'thrive-icon-192-maskable.svg', 'thrive-icon-512.svg',
    'thrive-icon-512-maskable.svg', 'thrive-icon-compact.svg', 'thrive-icon-minimal.svg', 'thrive-icon-primary.svg',
  ])('%s is gone and nothing references it', (f) => {
    expect(existsSync(pub(f))).toBe(false);
    expect(html).not.toContain(f);
    expect(readFileSync(pub('manifest.json'), 'utf-8')).not.toContain(f);
  });
});
