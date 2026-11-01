import { useState, useEffect, useCallback } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { createAuthSession, type AuthSessionState } from '@keel/auth';
import { AuthContext, type AuthState } from './auth-context';
import { loadGisScript } from './gis-script';
import { isDemoMode } from '../demo/is-demo-mode';
import { DEMO_USER } from '../demo/demo-data';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Identity only: the app reads and writes through the Forage API with this
// token (#703), never the Sheet directly.
const SCOPES = 'openid email profile';

interface Props {
  children: ComponentChildren;
}

export function AuthProvider({ children }: Props) {
  if (isDemoMode()) return <DemoAuthProvider>{children}</DemoAuthProvider>;
  return <LiveAuthProvider>{children}</LiveAuthProvider>;
}

/** Demo mode: no GIS, signed in as the demo user. */
function DemoAuthProvider({ children }: Props) {
  // Leaving demo means loading the app without ?demo; the tab hash stays.
  const logout = useCallback(() => {
    window.location.search = '';
  }, []);

  const value: AuthState = {
    token: 'demo-token',
    user: DEMO_USER,
    isAuthenticated: true,
    login: () => {},
    logout,
    rememberedUser: null,
    ready: true,
    renewing: false,
    renewError: null,
    continueAs: () => {},
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Mirrors an `@keel/auth` session into context. The sign-in behaviour lives in the session. */
function LiveAuthProvider({ children }: Props) {
  const [session] = useState(() =>
    createAuthSession({ clientId: CLIENT_ID, scopes: SCOPES, storagePrefix: 'forage_' }),
  );
  const [state, setState] = useState<AuthSessionState>(session.getState);

  useEffect(() => {
    loadGisScript();
    const unsubscribe = session.subscribe(setState);
    const stop = session.start();
    setState(session.getState());
    return () => {
      unsubscribe();
      stop();
    };
  }, [session]);

  const value: AuthState = {
    token: state.token,
    user: state.user,
    isAuthenticated: !!state.token,
    login: session.login,
    logout: session.logout,
    rememberedUser: state.rememberedUser,
    ready: state.ready,
    renewing: state.renewing,
    renewError: state.renewError,
    continueAs: session.continueAs,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
