import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { createAuthSession, type AuthSessionState } from '@keel/auth';
import { AuthContext, type AuthState } from './auth-context';
import type { UserInfo } from '../api/types';
import { isDemoMode } from '../demo/is-demo-mode';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets openid email profile';

const USER_KEY = 'hive_user';
/** Left by the sign-in before @keel/auth, which remembered the user here after the token lapsed. */
const PRIOR_USER_KEY = 'hive_prior_user';

/** Mock user injected in demo mode. */
const DEMO_USER: UserInfo = {
  name: 'Demo User',
  email: 'demo@hive.local',
  picture: '',
};

interface Props {
  children: ComponentChildren;
}

/**
 * Carry an old `hive_prior_user` over once: it becomes `hive_user` (which is
 * what the session remembers) unless one is already there, and is removed.
 */
function migratePriorUser() {
  try {
    const prior = localStorage.getItem(PRIOR_USER_KEY);
    if (prior === null) return;
    if (!localStorage.getItem(USER_KEY)) localStorage.setItem(USER_KEY, prior);
    localStorage.removeItem(PRIOR_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: Props) {
  if (isDemoMode()) return <DemoAuthProvider>{children}</DemoAuthProvider>;
  return <LiveAuthProvider>{children}</LiveAuthProvider>;
}

/** Demo mode: skip GIS entirely, provide fake auth context. */
function DemoAuthProvider({ children }: Props) {
  const [user, setUser] = useState<UserInfo>(DEMO_USER);
  const updateUserName = useCallback((name: string) => setUser((prev) => ({ ...prev, name })), []);
  // Leaving demo means loading the app without ?demo.
  const logout = useCallback(() => {
    window.location.search = '';
  }, []);

  const value: AuthState = {
    token: 'demo-token',
    user,
    isAuthenticated: true,
    login: () => {},
    logout,
    updateUserName,
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
  const [session] = useState(() => {
    migratePriorUser();
    return createAuthSession({ clientId: CLIENT_ID, scopes: SCOPES, storagePrefix: 'hive_' });
  });
  const [state, setState] = useState<AuthSessionState>(session.getState);
  // A name edited in Hive. The session only knows the name Google gave it, and
  // writes that back to storage on every renewal, so this wins over it.
  const editedName = useRef<{ email: string; name: string } | null>(null);

  /** Put the edited name back in `hive_user` after the session rewrites it. */
  const storeEditedName = useCallback((s: AuthSessionState) => {
    const edit = editedName.current;
    if (!edit || !s.token || s.user?.email !== edit.email) return;
    try {
      localStorage.setItem(USER_KEY, JSON.stringify({ ...s.user, name: edit.name }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const unsubscribe = session.subscribe((s) => {
      storeEditedName(s);
      setState(s);
    });
    const stop = session.start();
    setState(session.getState());
    return () => {
      unsubscribe();
      stop();
    };
  }, [session, storeEditedName]);

  const withEdit = (u: UserInfo | null): UserInfo | null => {
    const edit = editedName.current;
    return u && edit && edit.email === u.email ? { ...u, name: edit.name } : u;
  };

  const updateUserName = useCallback(
    (name: string) => {
      const current = session.getState().user;
      if (!current) return;
      editedName.current = { email: current.email, name };
      storeEditedName(session.getState());
      // Re-render with the edit applied; the session's own state is unchanged.
      setState({ ...session.getState() });
    },
    [session, storeEditedName],
  );

  const logout = useCallback(() => {
    editedName.current = null;
    session.logout();
    try {
      localStorage.removeItem(PRIOR_USER_KEY);
    } catch {
      /* ignore */
    }
  }, [session]);

  const value: AuthState = {
    token: state.token,
    user: withEdit(state.user),
    isAuthenticated: !!state.token,
    login: session.login,
    logout,
    updateUserName,
    rememberedUser: withEdit(state.rememberedUser),
    ready: state.ready,
    renewing: state.renewing,
    renewError: state.renewError,
    continueAs: session.continueAs,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
