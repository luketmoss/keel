import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AuthUser } from '@keel/auth';

export interface AuthState {
  /** The Google access token the Forage API checks. Held here; nothing else reads Google with it. */
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  /** The signed-out user the device remembers, for "Continue as <email>". */
  rememberedUser: AuthUser | null;
  /** The GIS token client exists, so a sign-in tap will do something. */
  ready: boolean;
  /** A Continue renewal or a sign-in is in flight. */
  renewing: boolean;
  /** Words for the last failed sign-in or renewal, or null. */
  renewError: string | null;
  continueAs: () => void;
}

export const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  rememberedUser: null,
  ready: false,
  renewing: false,
  renewError: null,
  continueAs: () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
