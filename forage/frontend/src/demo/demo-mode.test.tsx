// #704: with VITE_DEMO_MODE=true and ?demo=true the app opens signed in as the
// demo user, with a banner, and asks nothing of Google.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import App from '../App';
import { GIS_SRC } from '../auth/gis-script';
import { _resetDemoModeCache } from './is-demo-mode';

const env = import.meta.env as Record<string, string | undefined>;

beforeEach(() => {
  _resetDemoModeCache();
  env.VITE_DEMO_MODE = 'true';
  window.history.replaceState(null, '', '/?demo=true#/plan');
});

afterEach(() => {
  _resetDemoModeCache();
  delete env.VITE_DEMO_MODE;
  delete (globalThis as { google?: unknown }).google;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('demo mode', () => {
  it('opens signed in as the demo user with the banner', () => {
    render(<App />);
    expect(screen.getByTestId('tab-bar')).toBeDefined();
    expect(screen.getByTestId('demo-banner').textContent).toContain('Demo — sample data, nothing is saved');
    fireEvent.click(screen.getByTestId('account-btn'));
    expect(screen.getByTestId('account-menu').textContent).toContain('demo@forage.local');
  });

  it('makes no request to Google: no GIS script, no token client, no fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const initTokenClient = vi.fn();
    (globalThis as { google?: unknown }).google = { accounts: { oauth2: { initTokenClient } } };
    render(<App />);
    expect(document.querySelector(`script[src="${GIS_SRC}"]`)).toBeNull();
    expect(document.querySelector('script[src*="google"]')).toBeNull();
    expect(initTokenClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switching tabs keeps ?demo=true', () => {
    render(<App />);
    expect(screen.getByTestId('tab-shop').getAttribute('href')).toBe('#/shop');
    window.location.hash = '#/shop';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(window.location.search).toBe('?demo=true');
  });

  it('Exit demo and Sign out both drop the query', () => {
    render(<App />);
    const search = vi.fn();
    const loc = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(loc, {
        get: (t, p) => Reflect.get(t, p),
        set(_t, prop, val) {
          if (prop === 'search') search(val);
          return true;
        },
      }),
    });
    try {
      fireEvent.click(screen.getByText('Exit demo'));
      fireEvent.click(screen.getByTestId('account-btn'));
      fireEvent.click(screen.getByText('Sign out'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: loc });
    }
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledWith('');
  });
});

describe('a build without VITE_DEMO_MODE', () => {
  it('ignores ?demo=true and shows the sign-in screen', () => {
    delete env.VITE_DEMO_MODE;
    _resetDemoModeCache();
    render(<App />);
    expect(screen.getByText('Sign in with Google')).toBeDefined();
    expect(screen.queryByTestId('demo-banner')).toBeNull();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
  });
});
