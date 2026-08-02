import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDriveFileToken } from './googleIdentity'
import { DriveAuthError, findOrCreateCairnFolder, getDriveAccount } from '../drive/cairnFolder'

vi.mock('./googleIdentity', () => ({
  requestDriveFileToken: vi.fn(),
}))

vi.mock('../drive/cairnFolder', async () => {
  const actual = await vi.importActual<typeof import('../drive/cairnFolder')>(
    '../drive/cairnFolder',
  )
  return {
    ...actual,
    getDriveAccount: vi.fn(),
    findOrCreateCairnFolder: vi.fn(),
  }
})

async function loadHook() {
  vi.resetModules()
  const { useGoogleAccount } = await import('./useGoogleAccount')
  return useGoogleAccount
}

describe('useGoogleAccount', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('starts unavailable when no client id is configured', async () => {
    vi.unstubAllEnvs()
    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())
    expect(result.current.state).toEqual({ status: 'unavailable' })
  })

  it('starts signed-out when a client id is configured', async () => {
    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())
    expect(result.current.state).toEqual({ status: 'signed-out' })
  })

  it('signs in, fetches the account, and finds/creates the folder', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'success', accessToken: 'tok' })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateCairnFolder).mockResolvedValue('folder-1')

    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({
      status: 'signed-in',
      email: 'jane@gmail.com',
      accessToken: 'tok',
      folderId: 'folder-1',
    })
  })

  it('returns to signed-out silently when the user cancels the popup', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'cancelled' })

    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({ status: 'signed-out' })
  })

  it('shows a popup-blocked error distinct from a generic sign-in failure', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'popup-blocked' })

    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({ status: 'signed-out', error: 'popup-blocked' })
  })

  it('moves to folder-error, keeping the user signed in, on a non-auth folder failure', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'success', accessToken: 'tok' })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateCairnFolder).mockRejectedValue(new Error('network error'))

    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())

    expect(result.current.state).toEqual({ status: 'folder-error', accessToken: 'tok' })
  })

  it('retryFolderSetup re-runs setup and reaches signed-in without a new token request', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'success', accessToken: 'tok' })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateCairnFolder)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce('folder-1')

    const useGoogleAccount = await loadHook()
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
  })

  it('signOut clears the session back to signed-out', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'success', accessToken: 'tok' })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateCairnFolder).mockResolvedValue('folder-1')

    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())
    expect(result.current.state.status).toBe('signed-in')

    act(() => result.current.signOut())

    expect(result.current.state).toEqual({ status: 'signed-out' })
  })

  it('surfaces a re-authenticate state when a Drive call reports an expired token during retry', async () => {
    vi.mocked(requestDriveFileToken).mockResolvedValue({ kind: 'success', accessToken: 'tok' })
    vi.mocked(getDriveAccount).mockResolvedValue({ email: 'jane@gmail.com' })
    vi.mocked(findOrCreateCairnFolder)
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new DriveAuthError())

    const useGoogleAccount = await loadHook()
    const { result } = renderHook(() => useGoogleAccount())

    await act(() => result.current.signIn())
    expect(result.current.state.status).toBe('folder-error')

    await act(() => result.current.retryFolderSetup())

    expect(result.current.state.status).toBe('token-expired')
  })
})
