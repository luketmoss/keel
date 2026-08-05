/* Stubs Google Identity Services' token client so `Sign in` in fake-Drive
   mode drives the app's real `useGoogleAccount` state machine without a
   real popup or a real Google account. Installed before the app mounts —
   `googleIdentity.ts#loadScript` checks `window.google?.accounts?.oauth2`
   first and only injects the real GIS `<script>` tag if that's absent, so
   this pre-empts the network call entirely rather than racing it. */

const FAKE_TOKEN_PREFIX = 'fake-drive-token-'
let nextTokenCounter = 0

interface TokenClientConfig {
  callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void
}

export function installFakeIdentity(): void {
  const withGoogle = window as unknown as { google?: { accounts?: unknown } }
  const google = withGoogle.google ?? {}

  google.accounts = {
    oauth2: {
      initTokenClient: (config: TokenClientConfig) => ({
        requestAccessToken: () => {
          nextTokenCounter += 1
          // A real popup takes a beat — resolving on a short delay rather
          // than synchronously keeps `signing-in` visible for a moment,
          // exercising that state instead of skipping straight past it.
          setTimeout(() => {
            config.callback({
              access_token: `${FAKE_TOKEN_PREFIX}${nextTokenCounter}`,
              expires_in: 3600,
            })
          }, 150)
        },
      }),
    },
  }

  withGoogle.google = google
}
