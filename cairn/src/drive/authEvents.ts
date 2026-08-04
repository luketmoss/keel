/* The missing piece #72's design note calls out: every `driveFetch` in
   `src/drive/*` and `src/photo/imageCache.ts` already throws `DriveAuthError`
   on a 401, but nothing outside that one call ever heard about it. This is a
   small pub/sub so the lowest-level place that detects a 401 (where the
   access token that failed is already in scope) can report it, and
   `useGoogleAccount` — the only place that owns account state — can listen
   without every intermediate hook/store needing to be threaded with a
   callback.

   Reported by *token*, not just "a 401 happened": a request that started
   before a successful reconnect can still land after it, carrying the old
   (now-replaced) token. `useGoogleAccount` only acts on a report that names
   the token it's currently holding, so a late failure from a superseded
   token can't knock a fresh session back down (design doc's "A 401 arrives
   from a call that started before a successful reconnect" edge case). */

type Listener = (accessToken: string) => void

const listeners = new Set<Listener>()

export function onDriveAuthError(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportDriveAuthError(accessToken: string): void {
  for (const listener of listeners) listener(accessToken)
}
