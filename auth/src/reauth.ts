/**
 * Module-level reauth registry.
 *
 * An API module is plain code, not a component, so it cannot reach a session
 * through a view library's context. A session registers its renewal here when it
 * starts, and the API layer calls `attemptReauth` when it gets a 401.
 *
 * One session is active at a time: the one started last owns the registry.
 */

/**
 * Thrown when a renewal fails. Callers can check for it to avoid a duplicate
 * error toast: the session has already dropped the token and returned to the
 * sign-in screen.
 */
export class ReauthFailedError extends Error {
  declare cause?: Error;
  constructor(cause?: Error) {
    super('Silent re-auth failed');
    this.name = 'ReauthFailedError';
    this.cause = cause;
  }
}

type ReauthCallback = () => Promise<string>;
type ReauthFailedCallback = () => void;

let reauthCallback: ReauthCallback | null = null;
let reauthFailedCallback: ReauthFailedCallback | null = null;

/** The renewal in flight, so concurrent callers share one request. */
let inProgress: Promise<string> | null = null;

/** Register the renewal. Returns a cleanup that unregisters it if it is still the active one. */
export function registerReauthCallback(cb: ReauthCallback): () => void {
  reauthCallback = cb;
  return () => {
    if (reauthCallback === cb) reauthCallback = null;
  };
}

/**
 * Register what to do when a non-quiet renewal fails: drop the token and keep
 * the user, so the sign-in screen can offer Continue.
 */
export function onReauthFailed(cb: ReauthFailedCallback): () => void {
  reauthFailedCallback = cb;
  return () => {
    if (reauthFailedCallback === cb) reauthFailedCallback = null;
  };
}

/**
 * Renew the token. Called on a 401 and, quietly, by the tap-armed renewal.
 * Resolves with the new access token; throws `ReauthFailedError` on failure.
 *
 * Concurrent calls share one request.
 *
 * `quiet` renewals run ahead of expiry while the old token still works, so a
 * failure must not sign the user out. A non-quiet caller (the 401 path) always
 * does, and so does a non-quiet caller that piggybacked on a quiet request.
 */
export async function attemptReauth({ quiet = false }: { quiet?: boolean } = {}): Promise<string> {
  if (!reauthCallback) {
    throw new Error('No reauth callback registered');
  }

  if (!inProgress) {
    inProgress = reauthCallback()
      .catch((err) => {
        throw new ReauthFailedError(err instanceof Error ? err : undefined);
      })
      .finally(() => {
        inProgress = null;
      });
  }

  try {
    return await inProgress;
  } catch (err) {
    if (!quiet) reauthFailedCallback?.();
    throw err;
  }
}

/** Reset all registry state. For tests. */
export function _resetForTesting(): void {
  reauthCallback = null;
  reauthFailedCallback = null;
  inProgress = null;
}
