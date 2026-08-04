import type { GoogleAccount } from './useGoogleAccount'
import './AccountRow.css'

/** Sits directly under the sidebar header, above the Import button — see
    cairn/docs/design/32-google-sign-in.md. Renders nothing at all when
    `VITE_GOOGLE_CLIENT_ID` is unset: no disabled button, no reserved space,
    nothing that reads as a bug on a fresh clone. */
export function AccountRow({ account }: { account: GoogleAccount }) {
  const { state, signIn, signOut, retryFolderSetup, reconnect } = account

  if (state.status === 'unavailable') return null

  if (state.status === 'signed-out') {
    return (
      <div className="account-row">
        <button type="button" className="account-row__signin" onClick={() => void signIn()}>
          Sign in with Google
        </button>
        {state.error && (
          <p className="account-row__error">
            {state.error === 'popup-blocked'
              ? 'Sign-in popup was blocked — allow popups for this site and try again'
              : "Couldn't sign in — try again"}
          </p>
        )}
      </div>
    )
  }

  if (state.status === 'signing-in') {
    return (
      <div className="account-row">
        <button type="button" className="account-row__signin" disabled>
          Signing in…
        </button>
      </div>
    )
  }

  if (state.status === 'restoring') {
    return (
      <div className="account-row">
        <p className="account-row__status">Reconnecting…</p>
      </div>
    )
  }

  if (state.status === 'setting-up-folder') {
    return (
      <div className="account-row">
        <p className="account-row__status">Setting up your Cairn folder…</p>
      </div>
    )
  }

  if (state.status === 'signed-in') {
    return (
      <div className="account-row">
        <div className="account-row__line">
          <span className="account-row__email">{state.email}</span>
          <button type="button" className="account-row__link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'folder-error') {
    return (
      <div className="account-row">
        <div className="account-row__line">
          <span className="account-row__email">{state.email ?? ''}</span>
          <span className="account-row__actions">
            <button
              type="button"
              className="account-row__link"
              onClick={() => void retryFolderSetup()}
            >
              Retry
            </button>
            <button
              type="button"
              className="account-row__link account-row__close"
              onClick={signOut}
              aria-label="Sign out"
            >
              ×
            </button>
          </span>
        </div>
        <p className="account-row__error">Couldn't set up the Cairn folder — try again</p>
      </div>
    )
  }

  // token-expired
  return (
    <div className="account-row">
      <div className="account-row__line">
        <span className="account-row__email">{state.email}</span>
        <button
          type="button"
          className="account-row__link"
          onClick={() => void reconnect()}
          disabled={state.reconnecting}
        >
          {state.reconnecting ? 'Reconnecting…' : 'Reconnect'}
        </button>
      </div>
      <p className="account-row__error">
        Your Drive session expired — reconnect to keep using Drive
      </p>
    </div>
  )
}
