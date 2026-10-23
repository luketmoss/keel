import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/preact';
import { RENEW_AHEAD_MS, _resetForTesting, attemptReauth } from '@keel/auth';
import { AuthProvider } from './auth-provider';
import { useAuth, type AuthState } from './auth-context';

// The stored keys, read directly: the provider is a mirror of the @keel/auth session.
function loadRememberedUser() {
  const user = localStorage.getItem('gw_user');
  return user ? JSON.parse(user) : null;
}

const USER = { email: 'me@example.com', name: 'Me', picture: '' };

function seed(expiryFromNow: number | null) {
  localStorage.setItem('gw_user', JSON.stringify(USER));
  if (expiryFromNow !== null) {
    localStorage.setItem('gw_token', 'tok');
    localStorage.setItem('gw_token_expiry', String(Date.now() + expiryFromNow));
  }
}

let request: ReturnType<typeof vi.fn>;
let gisConfig: any;
let auth: AuthState;

function Probe() {
  auth = useAuth();
  return null;
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  request = vi.fn();
  (globalThis as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: any) => {
          gisConfig = cfg;
          return { requestAccessToken: request };
        },
      },
    },
  };
});

afterEach(() => {
  cleanup();
  delete (globalThis as any).google;
});

describe('cached auth (#353 AC1)', () => {
  it('an expired token is dropped but the user is kept', () => {
    seed(-1000);
    mount();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('gw_token')).toBeNull();
    expect(loadRememberedUser()).toEqual(USER);
  });

  it('a first-ever launch has no remembered user', () => {
    expect(loadRememberedUser()).toBeNull();
  });
});

describe('AuthProvider (#353)', () => {
  it('AC1: an expired token leaves the user remembered, not signed in', () => {
    seed(-1000);
    mount();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.rememberedUser).toEqual(USER);
  });

  it('AC1: Sign out forgets the user too', () => {
    seed(60 * 60 * 1000);
    mount();
    act(() => auth.logout());
    expect(loadRememberedUser()).toBeNull();
    expect(auth.rememberedUser).toBeNull();
  });

  it('AC2: continueAs requests a token for the remembered user with no chooser', () => {
    seed(-1000);
    mount();
    expect(auth.ready).toBe(true);
    act(() => auth.continueAs!());
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '', hint: USER.email, login_hint: USER.email }),
    );
    expect(auth.renewing).toBe(true);
  });

  it('AC2: a failed renewal says so and stops waiting', () => {
    seed(-1000);
    mount();
    act(() => auth.continueAs!());
    act(() => gisConfig.error_callback({ type: 'popup_failed_to_open' }));
    expect(auth.renewing).toBe(false);
    expect(auth.renewError).toMatch(/could not sign you in/i);
    expect(auth.isAuthenticated).toBe(false);
  });

  it('AC2: a successful Continue signs in', async () => {
    seed(-1000);
    mount();
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => USER })) as any;
    act(() => auth.continueAs!());
    await act(async () => {
      await gisConfig.callback({ access_token: 'fresh', expires_in: 3600 });
    });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.rememberedUser).toBeNull();
  });

  it('AC3: a token near expiry is renewed by the next tap, once', () => {
    seed(RENEW_AHEAD_MS - 1000);
    mount();
    expect(request).not.toHaveBeenCalled();
    fireEvent.pointerUp(document.body);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ prompt: '', hint: USER.email }));
    fireEvent.pointerUp(document.body);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('AC3: a token with plenty of life is not renewed by a tap', () => {
    seed(60 * 60 * 1000);
    mount();
    fireEvent.pointerUp(document.body);
    expect(request).not.toHaveBeenCalled();
  });

  it('AC3: returning to the foreground arms the renewal for the next tap', () => {
    seed(RENEW_AHEAD_MS + 60 * 1000);
    mount();
    fireEvent.pointerUp(document.body);
    expect(request).not.toHaveBeenCalled();
    // time passes while the page is backgrounded
    localStorage.setItem('gw_token_expiry', String(Date.now() + 1000));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      fireEvent.pointerUp(document.body);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC3: a token renewed after the stored one expired is saved', async () => {
    seed(-1000);
    mount();
    const renewal = attemptReauth({ quiet: true });
    await act(async () => {
      await gisConfig.callback({ access_token: 'fresh', expires_in: 3600 });
      await renewal;
    });
    expect(localStorage.getItem('gw_token')).toBe('fresh');
    expect(Number(localStorage.getItem('gw_token_expiry'))).toBeGreaterThan(Date.now());
  });

  it('AC4: a failed 401 renewal drops the token, keeps the user, shows Continue', async () => {
    seed(60 * 60 * 1000);
    mount();
    expect(auth.isAuthenticated).toBe(true);
    const renewal = attemptReauth().catch(() => {});
    await act(async () => {
      gisConfig.error_callback({ type: 'popup_failed_to_open' });
      await renewal;
    });
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.rememberedUser).toEqual(USER);
    expect(auth.renewError).toBeNull();
    expect(localStorage.getItem('gw_token')).toBeNull();
    expect(loadRememberedUser()).toEqual(USER);
  });

  it('AC3: nothing is requested without a tap', () => {
    seed(RENEW_AHEAD_MS - 1000);
    mount();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).not.toHaveBeenCalled();
  });
});

describe('AuthProvider on @keel/auth (#608)', () => {
  it('a phone signed in before the move is still signed in', () => {
    seed(60 * 60 * 1000);
    mount();
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.token).toBe('tok');
    expect(auth.user).toEqual(USER);
  });

  it('a fresh sign-in whose userinfo fails never shows signed in and says so', async () => {
    mount();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as any;
    const seen: boolean[] = [];
    await act(async () => {
      await gisConfig.callback({ access_token: 'fresh', expires_in: 3600 });
    });
    seen.push(auth.isAuthenticated);
    expect(seen).toEqual([false]);
    expect(auth.renewError).toMatch(/could not sign you in/i);
    expect(auth.rememberedUser).toBeNull();
    expect(localStorage.getItem('gw_token')).toBeNull();
  });
});
