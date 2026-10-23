import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/preact';
import { attemptReauth, ReauthFailedError, _resetForTesting } from '@keel/auth';
import { AuthProvider } from './auth-provider';
import { useAuth, type AuthState } from './auth-context';

vi.mock('../demo/is-demo-mode', () => ({ isDemoMode: () => false }));

/**
 * GIS is stubbed so the test drives the token callbacks itself. The userinfo
 * fetch is held open so the window between "token arrived" and "user arrived"
 * is observable. The sign-in behaviour itself is @keel/auth's, and tested there;
 * these are Hive's side of it: its keys, its migration, its name edit.
 */
let gis: { callback: (r: any) => Promise<void>; error_callback: (e: any) => void } | null = null;
let requestAccessToken: ReturnType<typeof vi.fn>;
let resolveUserinfo: ((info: any) => void) | null = null;

const LUKE = { email: 'luke@example.com', name: 'Luke', picture: '' };

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  gis = null;
  requestAccessToken = vi.fn();
  (globalThis as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: any) => {
          gis = config;
          return { requestAccessToken };
        },
      },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((resolve) => {
          resolveUserinfo = (info) => resolve({ ok: true, json: () => Promise.resolve(info) });
        }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as any).google;
  localStorage.clear();
});

function renderAuth() {
  const snapshots: AuthState[] = [];
  function Recorder() {
    snapshots.push(useAuth());
    return null;
  }
  render(
    <AuthProvider>
      <Recorder />
    </AuthProvider>,
  );
  const last = () => snapshots[snapshots.length - 1];
  return { snapshots, last };
}

function signedInStorage(expiryMs = 3_600_000) {
  localStorage.setItem('hive_token', 'cached-token');
  localStorage.setItem('hive_user', JSON.stringify(LUKE));
  localStorage.setItem('hive_token_expiry', String(Date.now() + expiryMs));
}

describe('AuthProvider sign-in ordering (Issue #285)', () => {
  it('never reports authenticated before the user is known on an interactive sign-in', async () => {
    const { snapshots, last } = renderAuth();
    expect(gis).not.toBeNull();

    let pending!: Promise<void>;
    await act(async () => {
      pending = gis!.callback({ access_token: 'new-token', expires_in: 3600 });
    });
    expect(snapshots.filter((s) => s.isAuthenticated && !s.user?.email)).toEqual([]);

    await act(async () => {
      resolveUserinfo!({ email: 'luke@example.com', name: 'Luke', picture: '' });
      await pending;
    });

    expect(last().token).toBe('new-token');
    expect(last().user?.email).toBe('luke@example.com');
    expect(last().isAuthenticated).toBe(true);
    expect(snapshots.filter((s) => s.isAuthenticated && !s.user?.email)).toEqual([]);
    expect(localStorage.getItem('hive_token')).toBe('new-token');
  });

  // #289: every kind of failed userinfo call fails the sign-in visibly, on the screen
  const failures: Array<[string, () => any]> = [
    ['a non-2xx response', () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    ['a response with no email', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'Luke' }) })],
    ['a network error', () => Promise.reject(new Error('network'))],
  ];
  for (const [label, impl] of failures) {
    it(`fails the sign-in on ${label}: no token, the failure line, no board`, async () => {
      vi.stubGlobal('fetch', vi.fn(impl));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { snapshots, last } = renderAuth();

      await act(async () => {
        await gis!.callback({ access_token: 'new-token', expires_in: 3600 });
      });

      expect(snapshots.filter((s) => s.token || s.isAuthenticated)).toEqual([]);
      expect(localStorage.getItem('hive_token')).toBeNull();
      expect(last().renewError).toBe('Could not sign you in. Try again, or use a different account.');
      errSpy.mockRestore();
    });
  }

  it('starts authenticated with the cached user on reload', () => {
    signedInStorage();
    const { snapshots } = renderAuth();
    expect(snapshots[0].token).toBe('cached-token');
    expect(snapshots[0].user?.email).toBe('luke@example.com');
    expect(snapshots[0].isAuthenticated).toBe(true);
  });

  it('exposes none of the old loading state', () => {
    const { last } = renderAuth();
    expect('isAuthLoading' in last()).toBe(false);
  });
});

describe('AuthProvider with an expired token (#609)', () => {
  it('opens on Continue as the remembered user and asks GIS for nothing', () => {
    localStorage.setItem('hive_token', 'old');
    localStorage.setItem('hive_user', JSON.stringify(LUKE));
    localStorage.setItem('hive_token_expiry', String(Date.now() - 1000));
    const { snapshots, last } = renderAuth();
    expect(snapshots[0].isAuthenticated).toBe(false);
    expect(snapshots[0].rememberedUser?.email).toBe('luke@example.com');
    expect(requestAccessToken).not.toHaveBeenCalled();
    expect(last().isAuthenticated).toBe(false);
  });

  it('continueAs renews with the account hint and no chooser', () => {
    localStorage.setItem('hive_user', JSON.stringify(LUKE));
    const { last } = renderAuth();
    act(() => last().continueAs());
    expect(requestAccessToken).toHaveBeenCalledWith(expect.objectContaining({ prompt: '', hint: 'luke@example.com' }));
    expect(last().renewing).toBe(true);
  });

  it('migrates hive_prior_user once: it becomes the remembered user and is removed', () => {
    localStorage.setItem('hive_prior_user', JSON.stringify(LUKE));
    const { snapshots } = renderAuth();
    expect(snapshots[0].rememberedUser?.email).toBe('luke@example.com');
    expect(localStorage.getItem('hive_prior_user')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hive_user')!).email).toBe('luke@example.com');
  });

  it('does not let hive_prior_user override a hive_user that is there', () => {
    localStorage.setItem('hive_user', JSON.stringify({ ...LUKE, email: 'new@example.com' }));
    localStorage.setItem('hive_prior_user', JSON.stringify(LUKE));
    const { snapshots } = renderAuth();
    expect(snapshots[0].rememberedUser?.email).toBe('new@example.com');
    expect(localStorage.getItem('hive_prior_user')).toBeNull();
  });

  it('a valid token from before the deploy is still signed in, and hive_prior_user is dropped', () => {
    signedInStorage();
    localStorage.setItem('hive_prior_user', JSON.stringify(LUKE));
    const { snapshots } = renderAuth();
    expect(snapshots[0].isAuthenticated).toBe(true);
    expect(snapshots[0].user?.email).toBe('luke@example.com');
    expect(localStorage.getItem('hive_prior_user')).toBeNull();
  });
});

describe('AuthProvider renewal (#609)', () => {
  it('requests no token from a timer or on load; the next tap does, once the token is near expiry', async () => {
    vi.useFakeTimers();
    signedInStorage(5 * 60 * 1000);
    renderAuth();
    // Armed on load because the token is within 10 minutes, but nothing fires without a tap.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(requestAccessToken).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('a 401 whose reauth fails lands on Continue with no error line', async () => {
    signedInStorage();
    const { last } = renderAuth();
    expect(last().isAuthenticated).toBe(true);

    let outcome: unknown;
    await act(async () => {
      const p = attemptReauth().catch((e) => (outcome = e));
      gis!.error_callback({ type: 'popup_closed' });
      await p;
    });

    expect(outcome).toBeInstanceOf(ReauthFailedError);
    expect(last().isAuthenticated).toBe(false);
    expect(last().rememberedUser?.email).toBe('luke@example.com');
    expect(last().renewError).toBeNull();
  });
});

describe('AuthProvider sign-out (#609)', () => {
  it('clears the token, user, expiry and prior user, and shows the plain screen', () => {
    signedInStorage();
    const { last } = renderAuth();
    localStorage.setItem('hive_prior_user', JSON.stringify(LUKE));
    act(() => last().logout());
    for (const k of ['hive_token', 'hive_user', 'hive_token_expiry', 'hive_prior_user']) {
      expect(localStorage.getItem(k), k).toBeNull();
    }
    expect(last().isAuthenticated).toBe(false);
    expect(last().rememberedUser).toBeNull();
  });

  it("leaves Thrive's keys alone when Hive signs in and out", async () => {
    localStorage.setItem('gw_token', 'thrive-token');
    localStorage.setItem('gw_user', JSON.stringify({ ...LUKE, email: 'thrive@example.com' }));
    localStorage.setItem('gw_token_expiry', '123');
    const { last } = renderAuth();

    await act(async () => {
      const p = gis!.callback({ access_token: 'new-token', expires_in: 3600 });
      resolveUserinfo!(LUKE);
      await p;
    });
    act(() => last().logout());

    expect(localStorage.getItem('gw_token')).toBe('thrive-token');
    expect(JSON.parse(localStorage.getItem('gw_user')!).email).toBe('thrive@example.com');
    expect(localStorage.getItem('gw_token_expiry')).toBe('123');
  });
});

describe('AuthProvider updateUserName (#609)', () => {
  it('updates the user at once, in storage, without touching the token', () => {
    signedInStorage();
    const { last } = renderAuth();
    act(() => last().updateUserName('Lucas'));
    expect(last().user?.name).toBe('Lucas');
    expect(last().token).toBe('cached-token');
    expect(JSON.parse(localStorage.getItem('hive_user')!).name).toBe('Lucas');
    expect(localStorage.getItem('hive_token')).toBe('cached-token');
  });

  it('survives a reload', () => {
    signedInStorage();
    const first = renderAuth();
    act(() => first.last().updateUserName('Lucas'));
    cleanup();
    const second = renderAuth();
    expect(second.snapshots[0].user?.name).toBe('Lucas');
  });

  it('survives a token renewal, in context and in storage', async () => {
    signedInStorage();
    const { last } = renderAuth();
    act(() => last().updateUserName('Lucas'));

    await act(async () => {
      const p = attemptReauth({ quiet: true });
      await gis!.callback({ access_token: 'renewed', expires_in: 3600 });
      await p;
    });

    expect(last().token).toBe('renewed');
    expect(last().user?.name).toBe('Lucas');
    expect(JSON.parse(localStorage.getItem('hive_user')!).name).toBe('Lucas');
  });

  it('shows on the Continue screen after a 401 sign-out', async () => {
    signedInStorage();
    const { last } = renderAuth();
    act(() => last().updateUserName('Lucas'));
    await act(async () => {
      const p = attemptReauth().catch(() => {});
      gis!.error_callback({ type: 'popup_closed' });
      await p;
    });
    expect(last().rememberedUser?.name).toBe('Lucas');
  });
});
