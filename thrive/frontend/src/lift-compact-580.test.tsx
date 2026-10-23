// #580 — compact Lift Mode. The measurements (getBoundingClientRect at 412 x 480 and 360 x 440) are taken
// in a browser; this holds what jsdom can: the tab bar steps aside on the Lift Mode route, and the
// stylesheet carries the compact rules behind the 560px height query.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { readGlobalCss, tokens } from './test-css';

vi.mock('./auth/auth-provider', () => ({
  AuthProvider: ({ children }: { children: ComponentChildren }) => children,
}));
vi.mock('./auth/auth-context', () => ({
  useAuth: () => ({ token: 'tok', user: null, isAuthenticated: true, login: vi.fn(), logout: vi.fn() }),
}));
vi.mock('./components/workout/lift/lift-mode', () => ({
  LiftMode: () => <div class="lift" />,
}));
vi.mock('./state/actions', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadInitialData: vi.fn(),
}));

// The router reads the address once on load, so the hash is set before the app is imported.
window.location.hash = '#/workout/w1/lift';

const { App } = await import('./app');
const { loading } = await import('./state/store');

afterEach(() => cleanup());

describe('no tab bar in Lift Mode (#580)', () => {
  it('hides the bottom tab bar on the Lift Mode route and brings it back elsewhere', async () => {
    loading.value = false;
    const { container } = render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#/workout/w1/lift'));
    expect(container.querySelector('.bottom-nav')).toBeNull();

    window.location.hash = '#/exercises';
    await waitFor(() => expect(container.querySelector('.bottom-nav')).not.toBeNull());
  });

  it('does not leave room for it under the body while Lift Mode is open', () => {
    expect(readGlobalCss()).toMatch(/body:has\(\.lift\)\s*\{\s*padding-bottom:\s*0;/);
  });
});

describe('the compact rules (#580)', () => {
  const css = readGlobalCss();
  const start = css.indexOf('/* ===== Lift Mode, compact (#580)');
  const block = css.slice(start, css.indexOf('/* ===== Library keyboard access (#301)'));
  const compact = block.slice(block.indexOf('@media (max-height: 560px)'));

  it('is chosen by a height query alone', () => {
    expect(start).toBeGreaterThan(0);
    expect(compact).toContain('@media (max-height: 560px)');
    expect(block).not.toMatch(/min-width|max-width: \d+px\)/);
  });

  it('defines the compact ring as a token', () => {
    expect(tokens(css, ':root')['--lift-ring-size-compact']).toBe('84px');
  });

  it('applies the sizes the design note gives', () => {
    expect(compact).toMatch(/\.lift-tip\s*\{\s*display:\s*none;/);
    expect(compact).toMatch(/\.lift-clock\s*\{\s*font-size:\s*var\(--figure-xl\);/);
    expect(compact).toMatch(/\.lift-ring\s*\{[^}]*var\(--lift-ring-size-compact\)/);
    expect(compact).toMatch(/\.lift-btn\s*\{\s*min-height:\s*44px;/);
    expect(compact).toMatch(/\.lift-sheet\s*\{\s*max-height:\s*92vh;/);
  });

  it('puts Up next before the log card on the rest screen', () => {
    expect(compact).toMatch(/\.lift-hero\s*\{[^}]*order:\s*-2;/);
    expect(compact).toMatch(/\.lift-content > \.lift-next\s*\{\s*order:\s*-1;/);
  });
});
