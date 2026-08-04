/* Persists the Drive access token and its absolute expiry in
   `sessionStorage` — deliberately not `localStorage`. `sessionStorage`
   survives a reload and an in-tab navigation (the reported complaint, #72)
   and dies with the tab; `localStorage` would also survive a browser
   restart, at the cost of leaving a live Drive token on disk for up to an
   hour. See cairn/docs/design/72-drive-session-lifecycle.md, "Why
   sessionStorage". */

const STORAGE_KEY = 'cairn:drive-session'

export interface StoredDriveSession {
  accessToken: string
  /** Absolute expiry, milliseconds since epoch — computed once at sign-in
      time from GIS's `expires_in` (seconds, relative), so a restore never
      has to reason about how long ago the token was issued. */
  expiresAt: number
}

function isStoredDriveSession(value: unknown): value is StoredDriveSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredDriveSession>
  return typeof candidate.accessToken === 'string' && typeof candidate.expiresAt === 'number'
}

/** `null` covers both "nothing stored" and "storage unavailable" (private
    browsing, quota) — neither is worth telling the caller apart from the
    other; both mean "start from signed-out". */
export function readStoredSession(storage: Storage = window.sessionStorage): StoredDriveSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isStoredDriveSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredSession(
  session: StoredDriveSession,
  storage: Storage = window.sessionStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage unavailable or full — the session just won't survive a
    // reload. Nothing else in the app depends on this call succeeding.
  }
}

export function clearStoredSession(storage: Storage = window.sessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Same as above — nothing to do if storage itself is unavailable.
  }
}
