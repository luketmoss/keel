import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAuthSession,
  attemptReauth,
  ReauthFailedError,
  RENEW_AHEAD_MS,
  RENEW_FAILED,
  _resetForTesting,
  type AuthSession,
} from './index';

const USER = { email: 'me@example.com', name: 'Me', picture: '' };
const HOUR = 60 * 60 * 1000;
const P = 'test_';

function seed(expiryFromNow: number | null, prefix = P) {
  localStorage.setItem(`${prefix}user`, JSON.stringify(USER));
  if (expiryFromNow !== null) {
    localStorage.setItem(`${prefix}token`, 'tok');
    localStorage.setItem(`${prefix}token_expiry`, String(Date.now() + expiryFromNow));
  }
}

let request: ReturnType<typeof vi.fn>;
let gis: any;
let stops: Array<() => void> = [];

function open(prefix = P): AuthSession {
  const session = createAuthSession({ clientId: 'cid', scopes: 'a b', storagePrefix: prefix });
  stops.push(session.start());
  return session;
}

function userinfo(res: { ok?: boolean; status?: number; body?: unknown; throws?: boolean }) {
  globalThis.fetch = vi.fn(async () => {
    if (res.throws) throw new Error('network');
    return { ok: res.ok ?? true, status: res.status ?? 200, json: async () => res.body ?? USER };
  }) as any;
}

beforeEach(() => {
  localStorage.clear();
  _resetForTesting();
  request = vi.fn();
  (globalThis as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: any) => {
          gis = cfg;
          return { requestAccessToken: request };
        },
      },
    },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as any).google;
});

describe('storage', () => {
  it('a fresh sign-in stores the token, user and expiry with the 60 s shave', async () => {
    const session = open();
    userinfo({});
    const before = Date.now();
    await gis.callback({ access_token: 'fresh', expires_in: 3600 });
    expect(localStorage.getItem('test_token')).toBe('fresh');
    expect(JSON.parse(localStorage.getItem('test_user')!)).toEqual(USER);
    const expiry = Number(localStorage.getItem('test_token_expiry'));
    expect(expiry).toBeGreaterThanOrEqual(before + 3540 * 1000);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 3540 * 1000);
    expect(session.getState().token).toBe('fresh');
  });

  it('an expired stored token is dropped and the user kept as rememberedUser', () => {
    seed(-1000);
    const session = open();
    expect(localStorage.getItem('test_token')).toBeNull();
    expect(localStorage.getItem('test_token_expiry')).toBeNull();
    expect(JSON.parse(localStorage.getItem('test_user')!)).toEqual(USER);
    expect(session.getState().token).toBeNull();
    expect(session.getState().rememberedUser).toEqual(USER);
  });

  it('a stored, unexpired token is signed in with no remembered user', () => {
    seed(HOUR);
    const state = open().getState();
    expect(state.token).toBe('tok');
    expect(state.user).toEqual(USER);
    expect(state.rememberedUser).toBeNull();
  });

  it('a first-ever launch has no remembered user', () => {
    expect(open().getState().rememberedUser).toBeNull();
  });

  it('logout clears all three keys and forgets the user', () => {
    seed(HOUR);
    const session = open();
    session.logout();
    expect(localStorage.getItem('test_token')).toBeNull();
    expect(localStorage.getItem('test_user')).toBeNull();
    expect(localStorage.getItem('test_token_expiry')).toBeNull();
    expect(session.getState().rememberedUser).toBeNull();
    expect(session.getState().user).toBeNull();
  });

  it('two sessions with different prefixes do not read or clear each other', () => {
    seed(HOUR, 'a_');
    localStorage.setItem('b_user', JSON.stringify({ email: 'b@example.com', name: 'B', picture: '' }));
    const a = createAuthSession({ clientId: 'c', scopes: 's', storagePrefix: 'a_' });
    const b = createAuthSession({ clientId: 'c', scopes: 's', storagePrefix: 'b_' });
    expect(a.getState().token).toBe('tok');
    expect(b.getState().token).toBeNull();
    expect(b.getState().rememberedUser?.email).toBe('b@example.com');
    b.logout();
    expect(localStorage.getItem('a_token')).toBe('tok');
    expect(localStorage.getItem('a_user')).not.toBeNull();
    a.logout();
    expect(localStorage.getItem('b_user')).toBeNull();
  });

  it('reads a key set written under the prefix before this library existed', () => {
    localStorage.setItem('gw_token', 'old-phone-token');
    localStorage.setItem('gw_user', JSON.stringify(USER));
    localStorage.setItem('gw_token_expiry', String(Date.now() + HOUR));
    const state = createAuthSession({ clientId: 'c', scopes: 's', storagePrefix: 'gw_' }).getState();
    expect(state.token).toBe('old-phone-token');
    expect(state.user).toEqual(USER);
  });
});

describe('tap-armed renewal', () => {
  const tap = () => document.dispatchEvent(new Event('pointerup'));

  it('requests nothing before the token is within 10 min of expiry', () => {
    seed(HOUR);
    open();
    tap();
    expect(request).not.toHaveBeenCalled();
  });

  it('requests nothing without a tap, even inside the window', () => {
    seed(RENEW_AHEAD_MS - 1000);
    open();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).not.toHaveBeenCalled();
  });

  it('inside the window the next pointerup requests one renewal with the hint, and a second none', () => {
    seed(RENEW_AHEAD_MS - 1000);
    open();
    expect(request).not.toHaveBeenCalled();
    tap();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ prompt: '', hint: USER.email, login_hint: USER.email });
    tap();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a return to the foreground inside the window arms the renewal the same way', () => {
    seed(RENEW_AHEAD_MS + 60 * 1000);
    open();
    tap();
    expect(request).not.toHaveBeenCalled();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    tap();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('the timer arms the renewal when the window opens', () => {
    vi.useFakeTimers();
    seed(RENEW_AHEAD_MS + 5000);
    open();
    tap();
    expect(request).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    tap();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('a quiet renewal that fails leaves the token in place and the user signed in', async () => {
    seed(RENEW_AHEAD_MS - 1000);
    const session = open();
    tap();
    gis.error_callback({ type: 'popup_failed_to_open' });
    await Promise.resolve();
    await Promise.resolve();
    expect(session.getState().token).toBe('tok');
    expect(localStorage.getItem('test_token')).toBe('tok');
    expect(session.getState().user).toEqual(USER);
  });

  it('a token renewed after the stored one expired is saved', async () => {
    seed(-1000);
    open();
    const renewal = attemptReauth({ quiet: true });
    await gis.callback({ access_token: 'fresh', expires_in: 3600 });
    await renewal;
    expect(localStorage.getItem('test_token')).toBe('fresh');
    expect(Number(localStorage.getItem('test_token_expiry'))).toBeGreaterThan(Date.now());
  });
});

describe('attemptReauth', () => {
  it('concurrent calls share one request', async () => {
    seed(HOUR);
    open();
    const a = attemptReauth();
    const b = attemptReauth({ quiet: true });
    expect(request).toHaveBeenCalledTimes(1);
    await gis.callback({ access_token: 'fresh', expires_in: 3600 });
    await expect(Promise.all([a, b])).resolves.toEqual(['fresh', 'fresh']);
  });

  it('a non-quiet failure drops the token, keeps the user and reports signed-out with rememberedUser', async () => {
    seed(HOUR);
    const session = open();
    expect(session.getState().token).toBe('tok');
    const renewal = attemptReauth();
    gis.error_callback({ type: 'popup_failed_to_open' });
    await expect(renewal).rejects.toBeInstanceOf(ReauthFailedError);
    const state = session.getState();
    expect(state.token).toBeNull();
    expect(state.rememberedUser).toEqual(USER);
    expect(state.renewError).toBeNull();
    expect(localStorage.getItem('test_token')).toBeNull();
    expect(JSON.parse(localStorage.getItem('test_user')!)).toEqual(USER);
  });

  it('a quiet failure does not sign out, but a 401 piggybacking on it does', async () => {
    seed(HOUR);
    const session = open();
    const quiet = attemptReauth({ quiet: true }).catch(() => {});
    const loud = attemptReauth();
    gis.error_callback({ type: 'popup_closed' });
    await expect(loud).rejects.toBeInstanceOf(ReauthFailedError);
    await quiet;
    expect(session.getState().token).toBeNull();
  });

  it('throws when no session is started', async () => {
    await expect(attemptReauth()).rejects.toThrow(/No reauth callback/);
  });
});

describe('Continue', () => {
  it('requests a token for the remembered user with no chooser and shows renewing', () => {
    seed(-1000);
    const session = open();
    expect(session.getState().ready).toBe(true);
    session.continueAs();
    expect(request).toHaveBeenCalledWith({ prompt: '', hint: USER.email, login_hint: USER.email });
    expect(session.getState().renewing).toBe(true);
  });

  it('a failed renewal says so and stops waiting', () => {
    seed(-1000);
    const session = open();
    session.continueAs();
    gis.error_callback({ type: 'popup_failed_to_open' });
    expect(session.getState().renewing).toBe(false);
    expect(session.getState().renewError).toBe(RENEW_FAILED);
    expect(session.getState().token).toBeNull();
  });
});

describe('a fresh sign-in is signed in only once the user is known (hive#287, hive#289)', () => {
  for (const [name, res] of [
    ['returns non-2xx', { ok: false, status: 401, body: { error: 'bad' } }],
    ['throws', { throws: true }],
    ['has no email', { body: { name: 'Me' } }],
  ] as const) {
    it(`userinfo that ${name} leaves no token and sets renewError`, async () => {
      const session = open();
      userinfo(res);
      const seen: Array<string | null> = [];
      session.subscribe((s) => seen.push(s.token));
      await gis.callback({ access_token: 'fresh', expires_in: 3600 });
      const state = session.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.renewError).toBe(RENEW_FAILED);
      expect(state.renewing).toBe(false);
      expect(localStorage.getItem('test_token')).toBeNull();
      expect(seen.every((t) => t === null)).toBe(true);
    });
  }

  it('success sets token and user in the same state update', async () => {
    const session = open();
    userinfo({});
    const seen: Array<{ token: string | null; user: unknown }> = [];
    session.subscribe((s) => seen.push({ token: s.token, user: s.user }));
    await gis.callback({ access_token: 'fresh', expires_in: 3600 });
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(!!s.token).toBe(!!s.user);
    expect(seen[seen.length - 1]).toEqual({ token: 'fresh', user: USER });
  });

  it('an OAuth error response is a failed sign-in', async () => {
    const session = open();
    await gis.callback({ error: 'access_denied' });
    expect(session.getState().token).toBeNull();
    expect(session.getState().renewError).toBe(RENEW_FAILED);
  });

  it('a successful Continue signs in and clears the remembered user', async () => {
    seed(-1000);
    const session = open();
    userinfo({});
    session.continueAs();
    await gis.callback({ access_token: 'fresh', expires_in: 3600 });
    expect(session.getState().token).toBe('fresh');
    expect(session.getState().rememberedUser).toBeNull();
    expect(session.getState().renewing).toBe(false);
  });
});

describe('library boundary', () => {
  it('subscribe returns an unsubscribe', () => {
    const session = open();
    const listener = vi.fn();
    const off = session.subscribe(listener);
    session.logout();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    session.logout();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
