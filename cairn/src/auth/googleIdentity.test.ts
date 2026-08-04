import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDriveFileToken } from './googleIdentity'

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClientErrorDetail {
  type?: string
}
interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback: (error: TokenClientErrorDetail) => void
}

/* Each test stubs `window.google` directly rather than letting the module
   inject its script tag — jsdom has no real network, and the script's own
   behaviour isn't what this module is responsible for. Cast rather than a
   `declare global` augmentation, which would collide with the `maps`
   namespace `@types/google.maps` already puts on the same global. */
function stubGoogleIdentity(
  initTokenClient: (config: TokenClientConfig) => { requestAccessToken: () => void },
) {
  ;(window as unknown as { google?: unknown }).google = {
    accounts: { oauth2: { initTokenClient } },
  }
}

function clearGoogleIdentity() {
  delete (window as unknown as { google?: unknown }).google
}

describe('requestDriveFileToken', () => {
  beforeEach(() => {
    clearGoogleIdentity()
  })

  afterEach(() => {
    clearGoogleIdentity()
    vi.restoreAllMocks()
  })

  it('requests only the drive.file scope', async () => {
    let capturedScope = ''
    stubGoogleIdentity((config) => {
      capturedScope = config.scope
      config.callback({ access_token: 'tok' })
      return { requestAccessToken: () => {} }
    })

    await requestDriveFileToken('client-id')

    expect(capturedScope).toBe('https://www.googleapis.com/auth/drive.file')
  })

  it('resolves with the access token and its absolute expiry on success', async () => {
    vi.setSystemTime(1_700_000_000_000)
    stubGoogleIdentity((config) => ({
      requestAccessToken: () => config.callback({ access_token: 'abc-123', expires_in: 3599 }),
    }))

    const outcome = await requestDriveFileToken('client-id')

    expect(outcome).toEqual({
      kind: 'success',
      accessToken: 'abc-123',
      expiresAt: 1_700_000_000_000 + 3599 * 1000,
    })
    vi.useRealTimers()
  })

  it('defaults to a one-hour expiry when the response omits expires_in', async () => {
    vi.setSystemTime(1_700_000_000_000)
    stubGoogleIdentity((config) => ({
      requestAccessToken: () => config.callback({ access_token: 'abc-123' }),
    }))

    const outcome = await requestDriveFileToken('client-id')

    expect(outcome).toEqual({
      kind: 'success',
      accessToken: 'abc-123',
      expiresAt: 1_700_000_000_000 + 3600 * 1000,
    })
    vi.useRealTimers()
  })

  it('resolves cancelled when the user closes the popup', async () => {
    stubGoogleIdentity((config) => ({
      requestAccessToken: () => config.error_callback({ type: 'popup_closed' }),
    }))

    const outcome = await requestDriveFileToken('client-id')

    expect(outcome).toEqual({ kind: 'cancelled' })
  })

  it('resolves popup-blocked when the popup fails to open', async () => {
    stubGoogleIdentity((config) => ({
      requestAccessToken: () => config.error_callback({ type: 'popup_failed_to_open' }),
    }))

    const outcome = await requestDriveFileToken('client-id')

    expect(outcome).toEqual({ kind: 'popup-blocked' })
  })

  it('resolves error for any other failure', async () => {
    stubGoogleIdentity((config) => ({
      requestAccessToken: () => config.error_callback({ type: 'something_else' }),
    }))

    const outcome = await requestDriveFileToken('client-id')

    expect(outcome).toEqual({ kind: 'error' })
  })

  it('resolves error when the callback reports an error instead of a token', async () => {
    stubGoogleIdentity((config) => ({
      requestAccessToken: () => config.callback({ error: 'access_denied' }),
    }))

    const outcome = await requestDriveFileToken('client-id')

    expect(outcome).toEqual({ kind: 'error' })
  })
})
