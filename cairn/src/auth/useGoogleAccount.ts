import { useCallback, useState } from 'react'
import { googleClientId } from '../env'
import { requestDriveFileToken } from './googleIdentity'
import { DriveAuthError, findOrCreateCairnFolder, getDriveAccount } from '../drive/cairnFolder'

export type AccountState =
  | { status: 'unavailable' }
  | { status: 'signed-out'; error?: 'sign-in-failed' | 'popup-blocked' }
  | { status: 'signing-in' }
  | { status: 'setting-up-folder' }
  | { status: 'signed-in'; email: string; accessToken: string; folderId: string }
  | { status: 'folder-error'; email?: string; accessToken: string }
  | { status: 'token-expired'; email: string }

export interface GoogleAccount {
  state: AccountState
  signIn: () => Promise<void>
  signOut: () => void
  retryFolderSetup: () => Promise<void>
  reconnect: () => Promise<void>
}

/** Runs the post-token setup shared by a fresh sign-in and a folder retry:
    look up the account's email, then find-or-create the `/Cairn/` folder.
    Both calls run under the same token, so a single try/catch classifies the
    outcome for either. */
async function setUpAccount(accessToken: string): Promise<AccountState> {
  try {
    const [account, folderId] = await Promise.all([
      getDriveAccount(accessToken),
      findOrCreateCairnFolder(accessToken),
    ])
    return { status: 'signed-in', email: account.email, accessToken, folderId }
  } catch (error) {
    if (error instanceof DriveAuthError) {
      // A token that expires before setup even finishes has no email to
      // show yet; the reconnect flow re-requests a token and tries again.
      throw error
    }
    return { status: 'folder-error', accessToken }
  }
}

export function useGoogleAccount(): GoogleAccount {
  const [state, setState] = useState<AccountState>(
    googleClientId ? { status: 'signed-out' } : { status: 'unavailable' },
  )

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

    setState({ status: 'setting-up-folder' })
    try {
      setState(await setUpAccount(outcome.accessToken))
    } catch {
      // The token expired between issuance and the first Drive call —
      // reconnect re-runs the whole flow, so there's no signed-in email to
      // carry forward here.
      setState({ status: 'signed-out', error: 'sign-in-failed' })
    }
  }, [])

  const signOut = useCallback(() => {
    setState(googleClientId ? { status: 'signed-out' } : { status: 'unavailable' })
  }, [])

  const retryFolderSetup = useCallback(async () => {
    if (state.status !== 'folder-error') return
    const { accessToken, email: priorEmail } = state
    setState({ status: 'setting-up-folder' })
    try {
      setState(await setUpAccount(accessToken))
    } catch {
      // Only reachable if the retry itself hits an expired token; fall back
      // to a generic label rather than an empty one since a prior email may
      // not be known.
      setState({ status: 'token-expired', email: priorEmail ?? 'your Google account' })
    }
  }, [state])

  const reconnect = useCallback(async () => {
    if (state.status !== 'token-expired') return
    await signIn()
  }, [state, signIn])

  return { state, signIn, signOut, retryFolderSetup, reconnect }
}
