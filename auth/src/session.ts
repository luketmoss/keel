import { attemptReauth, onReauthFailed, registerReauthCallback } from './reauth';

/** Renew from the next tap once the token is this close to expiring. */
export const RENEW_AHEAD_MS = 10 * 60 * 1000;

/** The words for a sign-in or renewal that did not work. */
export const RENEW_FAILED = 'Could not sign you in. Try again, or use a different account.';

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
/** GIS tokens last ~3600s; shave this much to avoid edge-case expiry. */
const EXPIRY_SHAVE_S = 60;

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

export interface AuthSessionOptions {
  clientId: string;
  scopes: string;
  /** Prefix for the three localStorage keys: `<prefix>token`, `<prefix>user`, `<prefix>token_expiry`. */
  storagePrefix: string;
}

export interface AuthSessionState {
  token: string | null;
  user: AuthUser | null;
  /** The signed-out user the device remembers, for "Continue as <email>". Null while signed in. */
  rememberedUser: AuthUser | null;
  /** The GIS token client exists, so a sign-in tap will do something. */
  ready: boolean;
  /** A Continue renewal or a sign-in is in flight. */
  renewing: boolean;
  /** Words for the last failed sign-in or renewal, or null. */
  renewError: string | null;
}

export interface AuthSession {
  getState(): AuthSessionState;
  /** Call `listener` with the new state on every change. Returns an unsubscribe. */
  subscribe(listener: (state: AuthSessionState) => void): () => void;
  /** Wait for GIS, register the renewal and arm tap-renewal. Returns a stop function. */
  start(): () => void;
  /** Open the Google account chooser. Call from a tap. */
  login(): void;
  /** Renew for the remembered user with no chooser. Call from a tap. */
  continueAs(): void;
  /** Clear the token and the remembered user. The grant is not revoked. */
  logout(): void;
}

/** `hint` is GIS's current name for the account hint; `login_hint` its older one. */
function hintFor(user: AuthUser | null): { hint?: string; login_hint?: string } {
  return user?.email ? { hint: user.email, login_hint: user.email } : {};
}

// Google Identity Services is a global script with no types here.
type Gis = any;

export function createAuthSession({ clientId, scopes, storagePrefix }: AuthSessionOptions): AuthSession {
  const TOKEN_KEY = `${storagePrefix}token`;
  const USER_KEY = `${storagePrefix}user`;
  const EXPIRY_KEY = `${storagePrefix}token_expiry`;

  function readUser(): AuthUser | null {
    try {
      const user = localStorage.getItem(USER_KEY);
      return user ? (JSON.parse(user) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  /** Drop the token and its expiry; the remembered user stays. */
  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRY_KEY);
    } catch {
      /* ignore */
    }
  }

  function clearAll() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(EXPIRY_KEY);
    } catch {
      /* ignore */
    }
  }

  function save(token: string, user: AuthUser, expiresIn: number) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(EXPIRY_KEY, String(Date.now() + (expiresIn - EXPIRY_SHAVE_S) * 1000));
    } catch {
      /* ignore */
    }
  }

  function loadCached(): { token: string; user: AuthUser; expiry: number } | null {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const user = localStorage.getItem(USER_KEY);
      const expiry = localStorage.getItem(EXPIRY_KEY);
      if (token && user && expiry && Date.now() < Number(expiry)) {
        return { token, user: JSON.parse(user), expiry: Number(expiry) };
      }
      // Expired or missing: drop the token but keep the user, so the sign-in
      // screen can offer "Continue as <email>" instead of a bare sign-in.
      clearToken();
    } catch {
      /* ignore */
    }
    return null;
  }

  const cached = loadCached();
  // The user a renewal is for. Read from storage rather than from `loadCached`,
  // which returns null once the stored token has expired, and that is exactly
  // when a renewal arrives.
  let knownUser: AuthUser | null = cached?.user ?? readUser();
  // Token expiry (ms epoch) as last cached; drives the tap-armed renewal.
  let expiry: number | null = cached?.expiry ?? null;

  let state: AuthSessionState = {
    token: cached?.token ?? null,
    user: cached?.user ?? null,
    rememberedUser: cached ? null : knownUser,
    ready: false,
    renewing: false,
    renewError: null,
  };
  const listeners = new Set<(s: AuthSessionState) => void>();

  function setState(patch: Partial<AuthSessionState>) {
    const next = { ...state, ...patch };
    // A signed-in session remembers no one: the field is for the sign-in screen.
    if (next.token) next.rememberedUser = null;
    state = next;
    for (const l of [...listeners]) l(state);
  }

  let tokenClient: Gis = null;
  let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;
  let rearm: () => void = () => {};

  function rejectPending(message: string) {
    if (!pending) return;
    pending.reject(new Error(message));
    pending = null;
  }

  async function onTokenResponse(response: Gis) {
    if (response.error) {
      console.error('OAuth error:', response.error);
      setState({ renewing: false, renewError: RENEW_FAILED });
      rejectPending(`OAuth error: ${response.error}`);
      return;
    }

    const newToken: string = response.access_token;
    const expiresIn: number = response.expires_in || 3600;

    if (pending) {
      // A renewal for a user we already know: no userinfo call.
      const { resolve } = pending;
      pending = null;
      expiry = Date.now() + (expiresIn - EXPIRY_SHAVE_S) * 1000;
      if (knownUser) save(newToken, knownUser, expiresIn);
      setState({ token: newToken, renewing: false, renewError: null });
      rearm();
      resolve(newToken);
      return;
    }

    // A fresh sign-in. Signed in means the user is known: the token is neither
    // kept nor the app shown until userinfo has answered with an email.
    try {
      const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${newToken}` } });
      if (!res.ok) throw new Error(`userinfo returned ${res.status}`);
      const info = await res.json();
      if (!info || typeof info.email !== 'string' || !info.email) throw new Error('userinfo has no email');
      const user: AuthUser = { email: info.email, name: info.name, picture: info.picture };
      knownUser = user;
      expiry = Date.now() + (expiresIn - EXPIRY_SHAVE_S) * 1000;
      save(newToken, user, expiresIn);
      setState({ token: newToken, user, renewing: false, renewError: null });
      rearm();
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      setState({ renewing: false, renewError: RENEW_FAILED });
    }
  }

  function onTokenError(error: Gis) {
    console.error('Token client error:', error);
    // popup_failed_to_open / popup_closed from a Continue tap
    setState({ renewing: false, renewError: RENEW_FAILED });
    rejectPending(`Token client error: ${error?.type || error?.message || 'unknown'}`);
  }

  function start(): () => void {
    let stopped = false;
    let initTimer: ReturnType<typeof setTimeout> | undefined;

    // Wait for the GIS script to load.
    const init = () => {
      if (stopped) return;
      const google = (globalThis as Gis).google;
      if (!google?.accounts?.oauth2) {
        initTimer = setTimeout(init, 100);
        return;
      }
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scopes,
        prompt: '',
        callback: onTokenResponse,
        error_callback: onTokenError,
      });
      setState({ ready: true });
    };
    init();

    // Lets the API layer trigger a silent renewal on a 401.
    const unregisterReauth = registerReauthCallback(
      () =>
        new Promise<string>((resolve, reject) => {
          if (!tokenClient) {
            reject(new Error('GIS token client not initialized'));
            return;
          }
          pending = { resolve, reject };
          // prompt: '' skips the consent screen
          tokenClient.requestAccessToken({ prompt: '', ...hintFor(knownUser) });
        }),
    );

    // A failed 401 renewal drops the token and shows the Continue screen; the
    // user is kept so one tap gets back in.
    const unregisterFailed = onReauthFailed(() => {
      clearToken();
      expiry = null;
      setState({ token: null, rememberedUser: knownUser, renewError: null });
    });

    // GIS renews through a popup the browser only allows from a real tap (touch
    // grants popup activation on release, not press), so an expiring token is
    // renewed by the next `pointerup`, never by a timer or a 401. Armed when the
    // token nears expiry and when the page returns to the foreground; one-shot;
    // a failure here leaves the old token alone.
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const needsRenewal = () => expiry !== null && Date.now() >= expiry - RENEW_AHEAD_MS;
    const onTouch = () => {
      armed = false;
      if (!needsRenewal() || !tokenClient) return;
      attemptReauth({ quiet: true })
        .then(() => rearm())
        .catch(() => {
          /* old token still works; the next foreground or 401 deals with it */
        });
    };
    const armTouchRenewal = () => {
      if (armed || !needsRenewal()) return;
      armed = true;
      document.addEventListener('pointerup', onTouch, { once: true, capture: true });
    };
    rearm = () => {
      clearTimeout(timer);
      if (expiry === null) return;
      timer = setTimeout(armTouchRenewal, Math.max(0, expiry - RENEW_AHEAD_MS - Date.now()));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') armTouchRenewal();
    };
    document.addEventListener('visibilitychange', onVisibility);
    rearm();
    armTouchRenewal();

    return () => {
      stopped = true;
      clearTimeout(initTimer);
      clearTimeout(timer);
      unregisterReauth();
      unregisterFailed();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerup', onTouch, { capture: true });
      rearm = () => {};
    };
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    login() {
      tokenClient?.requestAccessToken();
    },
    // Runs from a tap on "Continue as <email>", so the popup is allowed.
    continueAs() {
      if (!tokenClient) return;
      setState({ renewError: null, renewing: true });
      tokenClient.requestAccessToken({ prompt: '', ...hintFor(knownUser) });
    },
    logout() {
      // Don't revoke the token: that removes the consent grant and forces the
      // full consent flow on next login. Just clear local state.
      clearAll();
      expiry = null;
      knownUser = null;
      setState({ token: null, user: null, rememberedUser: null });
    },
  };
}
