import { useCallback, useEffect, useRef, useState } from 'react'
import { googleClientId } from '../env'
import { requestDriveFileToken } from './googleIdentity'
import { DriveAuthError, findOrCreateCairnFolder, getDriveAccount } from '../drive/cairnFolder'
import { onDriveAuthError } from '../drive/authEvents'
import { clearStoredSession, readStoredSession, writeStoredSession } from './driveSession'

export type AccountState =
  | { status: 'unavailable' }
  | { status: 'signed-out'; error?: 'sign-in-failed' | 'popup-blocked' }
  | { status: 'signing-in' }
  /** Reading a stored session and re-resolving the `/Cairn/` folder before
      first paint — #72's addition. Distinct from `setting-up-folder` even
      though it drives the same `setUpAccount` call: the copy is different
      because the user didn't just do anything, the app is catching up. See
      cairn/docs/design/72-drive-session-lifecycle.md, "Restoring". */
  | { status: 'restoring' }
  | { status: 'setting-up-folder' }
  | {
      status: 'signed-in'
      email: string
      accessToken: string
      folderId: string
      name?: string
      pictureUrl?: string
    }
  | { status: 'folder-error'; email?: string; accessToken: string }
  /** `reconnecting` is set while the `Reconnect` popup is open — the row
      keeps showing the expiry message and a disabled, relabelled button
      rather than switching to the generic `signing-in` treatment (design
      doc's "Expired, reconnecting" state). */
  | { status: 'token-expired'; email: string; reconnecting?: boolean }

export interface GoogleAccount {
  state: AccountState
  signIn: () => Promise<void>
  signOut: () => void
  retryFolderSetup: () => Promise<void>
  reconnect: () => Promise<void>
}

/** Runs the post-token setup shared by a fresh sign-in, a folder retry, a
    reconnect, and a restore: look up the account's email, then
    find-or-create the `/Cairn/` folder. Both calls run under the same
    token, so a single try/catch classifies the outcome for any of them. */
async function setUpAccount(accessToken: string): Promise<AccountState> {
  try {
    const [account, folderId] = await Promise.all([
      getDriveAccount(accessToken),
      findOrCreateCairnFolder(accessToken),
    ])
    return {
      status: 'signed-in',
      email: account.email,
      accessToken,
      folderId,
      name: account.name,
      pictureUrl: account.pictureUrl,
    }
  } catch (error) {
    if (error instanceof DriveAuthError) {
      // A token that expires before setup even finishes has no email to
      // show yet; the reconnect flow re-requests a token and tries again.
      throw error
    }
    return { status: 'folder-error', accessToken }
  }
}

/** The initial render's state, computed synchronously (a lazy `useState`
    initializer) rather than in an effect — the design doc calls for the
    stored session to be read "before the first paint of the account row",
    and an effect only runs after paint. A session whose expiry has already
    passed is cleared here and never shown as `restoring` at all (design
    doc's "The stored session has already expired on load" edge case: loads
    signed-out, silently, no popup, no message). */
function initialAccountState(): AccountState {
  if (!googleClientId) return { status: 'unavailable' }

  const stored = readStoredSession()
  if (!stored) return { status: 'signed-out' }
  if (stored.expiresAt <= Date.now()) {
    clearStoredSession()
    return { status: 'signed-out' }
  }
  return { status: 'restoring' }
}

export function useGoogleAccount(): GoogleAccount {
  const [state, setState] = useState<AccountState>(initialAccountState)
  /* The most recent token's absolute expiry, tracked outside state because
     it isn't needed for rendering — only for the `sessionStorage` write
     when a flow (retryFolderSetup, reconnect) reaches signed-in without
     having just fetched a fresh token itself. Set whenever
     `requestDriveFileToken` succeeds. */
  const expiresAtRef = useRef<number | null>(null)

  const persistIfSignedIn = useCallback((result: AccountState) => {
    if (result.status === 'signed-in' && expiresAtRef.current !== null) {
      writeStoredSession({ accessToken: result.accessToken, expiresAt: expiresAtRef.current })
    }
  }, [])

  // Restoring on mount: re-resolve the folder under the stored token,
  // exactly like a fresh sign-in's post-token setup (the design doc's "into
  // the existing setting-up-folder path" — the folder id itself is never
  // persisted). A non-auth failure falls into the existing `folder-error`
  // state unchanged. A token Drive rejects outright (revoked, or expired
  // despite passing the client-side check above) has nothing worth
  // reconnecting *to* yet, so this drops to signed-out rather than
  // token-expired — same "quietly lapsed, no message" stance as an
  // already-expired session on load.
  useEffect(() => {
    if (state.status !== 'restoring') return
    const stored = readStoredSession()
    if (!stored || stored.expiresAt <= Date.now()) {
      clearStoredSession()
      setState({ status: 'signed-out' })
      return
    }

    let cancelled = false
    expiresAtRef.current = stored.expiresAt
    void setUpAccount(stored.accessToken)
      .then((result) => {
        if (cancelled) return
        setState(result)
      })
      .catch(() => {
        if (cancelled) return
        clearStoredSession()
        setState({ status: 'signed-out' })
      })
    return () => {
      cancelled = true
    }
  }, [state.status])

  // Routes every Drive 401 to the same place (#72's other half): any
  // driveFetch anywhere in the app reports through `authEvents`, and this
  // is the one listener that turns that into account state. Filtered to
  // the token this hook is currently holding — a late report from a
  // superseded token (one that failed before a reconnect already replaced
  // it) is ignored rather than knocking a fresh session back down.
  useEffect(() => {
    return onDriveAuthError((failedToken) => {
      setState((current) => {
        if (current.status !== 'signed-in' || current.accessToken !== failedToken) return current
        clearStoredSession()
        return { status: 'token-expired', email: current.email }
      })
    })
  }, [])

  const signIn = useCallback(async () => {
    if (!googleClientId) return
    setState({ status: 'signing-in' })

    const outcome = await requestDriveFileToken(googleClientId)
    if (outcome.kind === 'cancelled') {
      setState({ status: 'signed-out' })
      return
    }
    if (outcome.kind === 'popup-blocked') {
      setState({ status: 'signed-out', error: 'popup-blocked' })
      return
    }
    if (outcome.kind === 'error') {
      setState({ status: 'signed-out', error: 'sign-in-failed' })
      return
    }

    expiresAtRef.current = outcome.expiresAt
    setState({ status: 'setting-up-folder' })
    try {
      const result = await setUpAccount(outcome.accessToken)
      setState(result)
      persistIfSignedIn(result)
    } catch {
      // The token expired between issuance and the first Drive call —
      // reconnect re-runs the whole flow, so there's no signed-in email to
      // carry forward here.
      setState({ status: 'signed-out', error: 'sign-in-failed' })
    }
  }, [persistIfSignedIn])

  const signOut = useCallback(() => {
    clearStoredSession()
    expiresAtRef.current = null
    setState(googleClientId ? { status: 'signed-out' } : { status: 'unavailable' })
  }, [])

  const retryFolderSetup = useCallback(async () => {
    if (state.status !== 'folder-error') return
    const { accessToken, email: priorEmail } = state
    setState({ status: 'setting-up-folder' })
    try {
      const result = await setUpAccount(accessToken)
      setState(result)
      persistIfSignedIn(result)
    } catch {
      // Only reachable if the retry itself hits an expired token; fall back
      // to a generic label rather than an empty one since a prior email may
      // not be known.
      setState({ status: 'token-expired', email: priorEmail ?? 'your Google account' })
    }
  }, [state, persistIfSignedIn])

  // A bespoke flow rather than delegating to `signIn()`: the design doc
  // keeps the email and the expiry banner on screen through the whole
  // reconnect ("Expired, reconnecting"), which a call through `signIn()`
  // (its own `signing-in` state) would blow away.
  const reconnect = useCallback(async () => {
    if (state.status !== 'token-expired') return
    if (!googleClientId) return
    const { email } = state
    setState({ status: 'token-expired', email, reconnecting: true })

    const outcome = await requestDriveFileToken(googleClientId)
    if (outcome.kind !== 'success') {
      // Cancelled, blocked, or errored — no more information than "still
      // not reconnected". Returns to Expired silently, same stance #32
      // takes for a cancelled sign-in (design doc's "Expired, reconnect
      // dismissed").
      setState({ status: 'token-expired', email })
      return
    }

    expiresAtRef.current = outcome.expiresAt
    setState({ status: 'setting-up-folder' })
    try {
      const result = await setUpAccount(outcome.accessToken)
      setState(result)
      persistIfSignedIn(result)
    } catch {
      setState({ status: 'token-expired', email })
    }
  }, [state, persistIfSignedIn])

  return { state, signIn, signOut, retryFolderSetup, reconnect }
}
