import { useMemo } from 'preact/hooks';
import { useAuth } from '../auth/auth-context';
import { createDemoApi } from '../demo/demo-api';
import { isDemoMode } from '../demo/is-demo-mode';
import { createLiveApi, type ForageApi } from './client';

// One demo store per load, so a saved demo recipe survives a tab change.
let demoApi: ForageApi | null = null;

/** The API for the signed-in user: the live client, or the in-memory demo layer. */
export function useApi(): ForageApi {
  const { token } = useAuth();
  return useMemo(() => {
    if (isDemoMode()) return (demoApi ??= createDemoApi());
    return createLiveApi(token ?? '');
  }, [token]);
}

/** Forget the demo store (tests only). */
export function _resetDemoApi(): void {
  demoApi = null;
}
