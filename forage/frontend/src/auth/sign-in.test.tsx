// #704: sign-in through @keel/auth with `forage_` storage keys. GIS is faked:
// its token client hands back a token, and userinfo answers with the user.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import App from '../App';
import { GIS_SRC } from './gis-script';

const USER = { email: 'luke@example.com', name: 'Luke', picture: '' };

let callback: ((r: { access_token: string; expires_in: number }) => void) | null = null;
const requestAccessToken = vi.fn(() => callback?.({ access_token: 'tok-1', expires_in: 3600 }));
const initTokenClient = vi.fn((opts: { callback: typeof callback; scope: string }) => {
  callback = opts.callback;
  return { requestAccessToken };
});

function rememberUser() {
  localStorage.setItem('forage_user', JSON.stringify(USER));
}

function signedIn() {
  rememberUser();
  localStorage.setItem('forage_token', 'tok-0');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

beforeEach(() => {
  localStorage.clear();
  (globalThis as { google?: unknown }).google = { accounts: { oauth2: { initTokenClient } } };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(USER), { status: 200 }));
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  delete (globalThis as { google?: unknown }).google;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  callback = null;
  vi.restoreAllMocks();
  requestAccessToken.mockClear();
  initTokenClient.mockClear();
});

describe('signed out', () => {
  it('shows only the sign-in screen: no tab or tab bar', () => {
    render(<App />);
    expect(screen.getByText('Sign in with Google')).toBeDefined();
    expect(screen.getByText('Plan meals. Shop once. Log what you eat.')).toBeDefined();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Plan' })).toBeNull();
  });

  it('loads the GIS script and asks only for identity scopes', () => {
    render(<App />);
    expect(document.querySelector(`script[src="${GIS_SRC}"]`)).not.toBeNull();
    expect(initTokenClient).toHaveBeenCalledTimes(1);
    expect(initTokenClient.mock.calls[0][0].scope).toBe('openid email profile');
  });

  it('the error line is in the DOM before any error', () => {
    render(<App />);
    const status = screen.getByRole('status');
    expect(status.classList.contains('login-error')).toBe(true);
    expect(status.textContent).toBe('');
  });
});

describe('signing in', () => {
  it('stores forage_ keys and opens the shell', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Sign in with Google'));
    expect(await screen.findByTestId('tab-bar')).toBeDefined();
    expect(localStorage.getItem('forage_token')).toBe('tok-1');
    expect(JSON.parse(localStorage.getItem('forage_user')!).email).toBe(USER.email);
    expect(localStorage.getItem('forage_token_expiry')).not.toBeNull();
    expect(Object.keys(localStorage).every((k) => k.startsWith('forage_'))).toBe(true);
  });

  it('a stored token opens straight to the shell', () => {
    signedIn();
    render(<App />);
    expect(screen.getByTestId('tab-bar')).toBeDefined();
  });
});

describe('a remembered user', () => {
  it('sees "Continue as <email>", focused, and "Use a different account"', () => {
    rememberUser();
    render(<App />);
    const cont = screen.getByText(`Continue as ${USER.email}`);
    expect(document.activeElement).toBe(cont);
    expect(screen.getByText('Welcome back, Luke.')).toBeDefined();
    expect(screen.getByText('Use a different account')).toBeDefined();
  });

  it('Continue signs back in', async () => {
    rememberUser();
    render(<App />);
    fireEvent.click(screen.getByText(`Continue as ${USER.email}`));
    expect(await screen.findByTestId('tab-bar')).toBeDefined();
  });
});

describe('signing out', () => {
  it('returns to the sign-in screen and clears the forage_ keys', () => {
    signedIn();
    render(<App />);
    fireEvent.click(screen.getByTestId('account-btn'));
    expect(screen.getByTestId('account-menu').textContent).toContain(USER.email);
    fireEvent.click(screen.getByText('Sign out'));
    expect(screen.getByText('Sign in with Google')).toBeDefined();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    expect(localStorage.getItem('forage_token')).toBeNull();
  });
});
