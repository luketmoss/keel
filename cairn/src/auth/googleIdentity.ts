/* A thin, promise-based wrapper around Google Identity Services' token
   client. GIS is callback-based and injects itself onto `window.google`, so
   this module owns the one script tag and turns its callbacks into a single
   awaitable outcome — nothing else in the app talks to `window.google`
   directly, which is what makes it mockable in tests. */

export type TokenOutcome =
  | { kind: 'success'; accessToken: string }
  /** The user closed Google's popup without completing consent. Not an
      error — the caller returns to the signed-out state silently. */
  | { kind: 'cancelled' }
  | { kind: 'popup-blocked' }
  | { kind: 'error' }

interface TokenResponse {
  access_token?: string
  error?: string
}

interface TokenClientErrorDetail {
  type?: string
  message?: string
}

interface TokenClient {
  requestAccessToken(): void
}

interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback: (error: TokenClientErrorDetail) => void
}

/* `@types/google.maps` already augments `window.google` with a `maps`
   namespace required by the Maps loader elsewhere in the app; declaring a
   second, incompatible shape for the same global merges the two and makes
   every real assignment fail to typecheck. Read it through a local cast
   instead of a `declare global` augmentation. */
interface GoogleIdentityGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient
    }
  }
}

function getGoogleIdentity(): GoogleIdentityGlobal | undefined {
  return (window as unknown as { google?: GoogleIdentityGlobal }).google
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
/* The only scope this app ever requests — see cairn#32. Broader scopes
   (`drive`, `drive.readonly`) require a paid CASA assessment to publish. */
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (getGoogleIdentity()?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Google Identity Services'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Launches the GIS token popup requesting the `drive.file` scope only, and
    resolves once the flow reaches a terminal state — success, a user
    cancellation, a blocked popup, or any other failure. */
export async function requestDriveFileToken(clientId: string): Promise<TokenOutcome> {
  await loadScript()

  return new Promise((resolve) => {
    const client = getGoogleIdentity()!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          resolve({ kind: 'error' })
          return
        }
        resolve({ kind: 'success', accessToken: response.access_token })
      },
      error_callback: (error) => {
        if (error.type === 'popup_closed') {
          resolve({ kind: 'cancelled' })
        } else if (error.type === 'popup_failed_to_open') {
          resolve({ kind: 'popup-blocked' })
        } else {
          resolve({ kind: 'error' })
        }
      },
    })
    client.requestAccessToken()
  })
}
