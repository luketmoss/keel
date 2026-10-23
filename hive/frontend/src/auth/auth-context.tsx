import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { UserInfo } from '../api/types';

export interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  updateUserName: (newName: string) => void;
  /** The signed-out user the device remembers, for "Continue as <email>". */
  rememberedUser: UserInfo | null;
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
  updateUserName: () => {},
  rememberedUser: null,
  ready: false,
  renewing: false,
  renewError: null,
  continueAs: () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
