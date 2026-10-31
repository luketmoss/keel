import { useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { createAuthSession } from '@keel/auth';
import { AuthContext, type AuthState } from './auth-context';
import type { UserInfo } from '../api/types';
import { isDemo } from '../api/demo-data';
import { clearSimilarIndex } from '../state/similar-routes';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets openid email profile';

const DEMO_USER: UserInfo = { email: 'demo@thrive.app', name: 'Demo User', picture: '' };

// Demo mode: skip GIS entirely, provide fake auth context.
const DEMO_STATE: AuthState = {
  token: 'demo',
  user: DEMO_USER,
  isAuthenticated: true,
  login: () => {},
  logout: () => {},
  rememberedUser: null,
  ready: true,
  renewing: false,
  renewError: null,
  continueAs: () => {},
};

interface Props {
  children: ComponentChildren;
}

export function AuthProvider({ children }: Props) {
  if (isDemo()) {
    return <AuthContext.Provider value={DEMO_STATE}>{children}</AuthContext.Provider>;
  }
  return <LiveAuthProvider>{children}</LiveAuthProvider>;
}

/** Mirrors an `@keel/auth` session into context. The sign-in behaviour lives in the session. */
function LiveAuthProvider({ children }: Props) {
  // gw_ keeps a phone that signed in before @keel/auth signed in after it.
  const [session] = useState(() => createAuthSession({ clientId: CLIENT_ID, scopes: SCOPES, storagePrefix: 'gw_' }));
  const [state, setState] = useState(session.getState);

  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    const stop = session.start();
    setState(session.getState());
    return () => {
      unsubscribe();
      stop();
    };
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        token: state.token,
        user: state.user,
        isAuthenticated: !!state.token,
        login: session.login,
        logout: () => {
          // #692: the saved map cells go with the session.
          clearSimilarIndex();
          session.logout();
        },
        rememberedUser: state.rememberedUser,
        ready: state.ready,
        renewing: state.renewing,
        renewError: state.renewError,
        continueAs: session.continueAs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
