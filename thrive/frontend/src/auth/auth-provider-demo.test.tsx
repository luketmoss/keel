import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

vi.mock('../api/demo-data', () => ({ isDemo: () => true }));

const { AuthProvider } = await import('./auth-provider');
const { useAuth } = await import('./auth-context');

afterEach(() => {
  cleanup();
  delete (globalThis as any).google;
});

describe('demo mode (#608)', () => {
  it('is signed in as the demo user and never initializes GIS', () => {
    const initTokenClient = vi.fn();
    (globalThis as any).google = { accounts: { oauth2: { initTokenClient } } };
    let seen: any;
    function Probe() {
      seen = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(seen.isAuthenticated).toBe(true);
    expect(seen.user.email).toBe('demo@thrive.app');
    expect(initTokenClient).not.toHaveBeenCalled();
  });
});
