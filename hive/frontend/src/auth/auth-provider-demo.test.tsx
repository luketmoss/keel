import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/preact';

vi.mock('../demo/is-demo-mode', () => ({ isDemoMode: () => true }));

const { AuthProvider } = await import('./auth-provider');
const { useAuth } = await import('./auth-context');

afterEach(() => {
  cleanup();
  delete (globalThis as any).google;
});

function renderProbe() {
  const ref: { current: any } = { current: null };
  function Probe() {
    ref.current = useAuth();
    return null;
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return ref;
}

describe('demo mode (#609)', () => {
  it('is signed in as the demo user and never initializes GIS', () => {
    const initTokenClient = vi.fn();
    (globalThis as any).google = { accounts: { oauth2: { initTokenClient } } };
    const seen = renderProbe();
    expect(seen.current.isAuthenticated).toBe(true);
    expect(seen.current.user.email).toBe('demo@hive.local');
    expect(initTokenClient).not.toHaveBeenCalled();
  });

  it('lets the demo user edit their name', () => {
    const seen = renderProbe();
    act(() => seen.current.updateUserName('Someone'));
    expect(seen.current.user.name).toBe('Someone');
  });

  it('sign out leaves demo mode by clearing the query string', () => {
    const seen = renderProbe();
    const search = vi.fn();
    const loc = { ...window.location } as any;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(loc, {
        set(_t, prop, val) {
          if (prop === 'search') search(val);
          return true;
        },
      }),
    });
    seen.current.logout();
    expect(search).toHaveBeenCalledWith('');
  });
});
