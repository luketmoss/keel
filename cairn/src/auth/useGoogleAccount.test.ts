import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDriveFileToken } from './googleIdentity'
import { DriveAuthError, findOrCreateRootFolder, getDriveAccount } from '../drive/rootFolder'
import { readStoredSession, writeStoredSession } from './driveSession'

vi.mock('./googleIdentity', () => ({
  requestDriveFileToken: vi.fn(),
}))

vi.mock('../drive/rootFolder', async () => {
  const actual = await vi.importActual<typeof import('../drive/rootFolder')>(
    '../drive/rootFolder',
  )
  return {
    ...actual,
    getDriveAccount: vi.fn(),
    findOrCreateRootFolder: vi.fn(),
  }
})

/* `vi.resetModules()` gives `useGoogleAccount` a fresh copy of every module
   it imports, including `../drive/authEvents` — whose pub/sub is
   module-level state. A statically-imported `reportDriveAuthError` would
   talk to a stale instance the hook never subscribed to, so tests that need
   to fire a 401 re-import `authEvents` here, after the reset, alongside the
   hook itself. `driveSession` doesn't need the same treatment — it holds no
   state of its own, only reads/writes the real (module-independent)
   `window.sessionStorage`. */
async function loadHook() {
  vi.resetModules()
  const { useGoogleAccount } = await import('./useGoogleAccount')
  const { reportDriveAuthError } = await import('../drive/authEvents')
  return { useGoogleAccount, reportDriveAuthError }
}

describe('useGoogleAccount', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('starts unavailable when no client id is configured', async () => {
    vi.unstubAllEnvs()
    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())
    expect(result.current.state).toEqual({ status: 'unavailable' })
  })

  it('starts signed-out when a client id is configured and nothing is stored', async () => {
    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())
    expect(result.current.state).toEqual({ status: 'signed-out' })
  })

  it('signs in, fetches the account, finds/creates the folder, and persists the session', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({
      kind: 'success',
      accessToken: 'tok',
      expiresAt: 1_700_003_600_000,
    })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({
      status: 'signed-in',
      email: 'jane@gmail.com',
      accessToken: 'tok',
      folderId: 'folder-1',
    })
    expect(readStoredSession()).toEqual({ accessToken: 'tok', expiresAt: 1_700_003_600_000 })
  })

  it('returns to signed-out silently when the user cancels the popup', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'cancelled' })

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({ status: 'signed-out' })
  })

  it('shows a popup-blocked error distinct from a generic sign-in failure', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'popup-blocked' })

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({ status: 'signed-out', error: 'popup-blocked' })
  })

  it('moves to folder-error, keeping the user signed in, on a non-auth folder failure', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({
      kind: 'success',
      accessToken: 'tok',
      expiresAt: 1_700_003_600_000,
    })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateRootFolder).mockRejectedValue(new Error('network error'))

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({ status: 'folder-error', accessToken: 'tok' })
    // Never reached signed-in, so nothing should have been persisted.
    expect(readStoredSession()).toBeNull()
  })

  it('retryFolderSetup re-runs setup, reaches signed-in without a new token request, and persists', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({
      kind: 'success',
      accessToken: 'tok',
      expiresAt: 1_700_003_600_000,
    })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateRootFolder)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce('folder-1')

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())
    expect(result.current.state.status).toBe('folder-error')

    await act(() => result.current.retryFolderSetup())

    expect(result.current.state).toEqual({
      status: 'signed-in',
      email: 'jane@gmail.com',
      accessToken: 'tok',
      folderId: 'folder-1',
    })
    expect(requestDriveFileToken).toHaveBeenCalledTimes(1)
    expect(readStoredSession()).toEqual({ accessToken: 'tok', expiresAt: 1_700_003_600_000 })
  })

  it('signOut clears the session back to signed-out and drops the persisted session', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({
      kind: 'success',
      accessToken: 'tok',
      expiresAt: 1_700_003_600_000,
    })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())
    expect(result.current.state.status).toBe('signed-in')
    expect(readStoredSession()).not.toBeNull()

    act(() => result.current.signOut())

    expect(result.current.state).toEqual({ status: 'signed-out' })
    expect(readStoredSession()).toBeNull()
  })

  it('surfaces a re-authenticate state when a Drive call reports an expired token during retry', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({
      kind: 'success',
      accessToken: 'tok',
      expiresAt: 1_700_003_600_000,
    })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateRootFolder)
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new DriveAuthError())

    const { useGoogleAccount } = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())
    expect(result.current.state.status).toBe('folder-error')

    await act(() => result.current.retryFolderSetup())

    expect(result.current.state.status).toBe('token-expired')
  })

  describe('restoring a session on mount (#72)', () => {
    it('restores into setting-up-folder/signed-in without a popup when a valid session is stored', async () => {
      writeStoredSession({ accessToken: 'stored-tok', expiresAt: Date.now() + 60_000 })
      vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
      vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

      const { useGoogleAccount } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      // Before first paint / on the very first render, restoring — not
      // signed-out — is what's on screen.
      expect(result.current.state).toEqual({ status: 'restoring' })

      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.state).toEqual({
        status: 'signed-in',
        email: 'jane@gmail.com',
        accessToken: 'stored-tok',
        folderId: 'folder-1',
      })
      expect(requestDriveFileToken).not.toHaveBeenCalled()
    })

    it('does not restore an already-expired session, and clears it', async () => {
      writeStoredSession({ accessToken: 'stale-tok', expiresAt: Date.now() - 1000 })

      const { useGoogleAccount } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      expect(result.current.state).toEqual({ status: 'signed-out' })
      expect(readStoredSession()).toBeNull()
      expect(getDriveAccount).not.toHaveBeenCalled()
    })

    it('falls into folder-error on a restore whose folder lookup fails for a non-auth reason', async () => {
      writeStoredSession({ accessToken: 'stored-tok', expiresAt: Date.now() + 60_000 })
      vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
      vi.mocked(findOrCreateRootFolder).mockRejectedValue(new Error('network error'))

      const { useGoogleAccount } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.state).toEqual({ status: 'folder-error', accessToken: 'stored-tok' })
    })

    it('drops to signed-out, silently, when the stored token is rejected outright', async () => {
      writeStoredSession({ accessToken: 'stored-tok', expiresAt: Date.now() + 60_000 })
      vi.mocked(getDriveAccount).mockRejectedValue(new DriveAuthError())
      vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

      const { useGoogleAccount } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      await act(async () => {
        await Promise.resolve()
      })

      expect(result.current.state).toEqual({ status: 'signed-out' })
      expect(readStoredSession()).toBeNull()
    })
  })

  describe('a Drive 401 reported during normal use (#72)', () => {
    it('moves a signed-in account to token-expired, keeping its email', async () => {
      vi.mocked(requestDriveFileToken).mockResolvedValue({
        kind: 'success',
        accessToken: 'tok',
        expiresAt: 1_700_003_600_000,
      })
      vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
      vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

      const { useGoogleAccount, reportDriveAuthError } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      await act(() => result.current.signIn())
      expect(result.current.state.status).toBe('signed-in')

      act(() => reportDriveAuthError('tok'))

      expect(result.current.state).toEqual({ status: 'token-expired', email: 'jane@gmail.com' })
      expect(readStoredSession()).toBeNull()
    })

    it('ignores a report for a token that is no longer the one held (a late failure from before a reconnect)', async () => {
      vi.mocked(requestDriveFileToken).mockResolvedValue({
        kind: 'success',
        accessToken: 'tok',
        expiresAt: 1_700_003_600_000,
      })
      vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
      vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

      const { useGoogleAccount, reportDriveAuthError } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      await act(() => result.current.signIn())
      expect(result.current.state.status).toBe('signed-in')

      act(() => reportDriveAuthError('some-other-stale-token'))

      expect(result.current.state.status).toBe('signed-in')
    })

    it('does nothing when the account is not signed-in', async () => {
      const { useGoogleAccount, reportDriveAuthError } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      act(() => reportDriveAuthError('tok'))

      expect(result.current.state).toEqual({ status: 'signed-out' })
    })
  })

  describe('reconnect (#72)', () => {
    function tokenExpiredState() {
      return { status: 'token-expired' as const, email: 'jane@gmail.com' }
    }

    it('does nothing unless the account is token-expired', async () => {
      const { useGoogleAccount } = await loadHook()
      const { result } = renderHook(() => useGoogleAccount())

      await act(() => result.current.reconnect())

      expect(requestDriveFileToken).not.toHaveBeenCalled()
      expect(result.current.state).toEqual({ status: 'signed-out' })
    })

    it('reconnects: launches the popup and returns to signed-in on success', async () => {
      vi.mocked(requestDriveFileToken).mockResolvedValue({
        kind: 'success',
        accessToken: 'new-tok',
        expiresAt: 1_700_003_600_000,
      })
      vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
      vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

      const { useGoogleAccount, reportDriveAuthError } = await loadHook()
      const { result, rerender } = renderHook(() => useGoogleAccount())

      // Get to token-expired via the same 401 path a real session would.
      vi.mocked(requestDriveFileToken).mockResolvedValueOnce({
        kind: 'success',
        accessToken: 'old-tok',
        expiresAt: 1_700_000_000_000,
      })
      await act(() => result.current.signIn())
      act(() => reportDriveAuthError('old-tok'))
      rerender()
      expect(result.current.state).toEqual(tokenExpiredState())

      await act(() => result.current.reconnect())

      expect(result.current.state).toEqual({
        status: 'signed-in',
        email: 'jane@gmail.com',
        accessToken: 'new-tok',
        folderId: 'folder-1',
      })
      expect(readStoredSession()).toEqual({ accessToken: 'new-tok', expiresAt: 1_700_003_600_000 })
    })

    it('returns to token-expired silently when the reconnect popup is cancelled', async () => {
      vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
      vi.mocked(findOrCreateRootFolder).mockResolvedValue('folder-1')

      const { useGoogleAccount, reportDriveAuthError } = await loadHook()
      const { result, rerender } = renderHook(() => useGoogleAccount())

      vi.mocked(requestDriveFileToken).mockResolvedValueOnce({
        kind: 'success',
        accessToken: 'old-tok',
        expiresAt: 1_700_000_000_000,
      })
      await act(() => result.current.signIn())
      act(() => reportDriveAuthError('old-tok'))
      rerender()
      expect(result.current.state).toEqual(tokenExpiredState())

      vi.mocked(requestDriveFileToken).mockResolvedValueOnce({ kind: 'cancelled' })
      await act(() => result.current.reconnect())

      expect(result.current.state).toEqual(tokenExpiredState())
    })
  })
})
