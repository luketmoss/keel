import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { GoogleAccount } from './useGoogleAccount'
import './AccountBubble.css'

function initialFrom(label: string): string {
  const trimmed = label.trim()
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '?'
}

/** Top-right L2 bubble replacing `AccountRow` (#78). Signed out, it is a
    text button; signed in, it is an avatar that opens a popover holding
    identity and sign-out. Renders nothing when `VITE_GOOGLE_CLIENT_ID` is
    unset — same either-is-missing rule `env.ts` already applies. */
export function AccountBubble({ account }: { account: GoogleAccount }) {
  const { state, signIn, signOut, retryFolderSetup, reconnect } = account
  const [open, setOpen] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // A menu describing the account should not outlive the view it was
  // opened over.
  useEffect(() => {
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab' || !popoverRef.current) return
      const focusable = popoverRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  useEffect(() => {
    if (open) popoverRef.current?.querySelector<HTMLElement>('button, [href]')?.focus()
  }, [open])

  if (state.status === 'unavailable') return null

  if (state.status === 'signed-out') {
    return (
      <div className="account-bubble">
        <button type="button" className="account-bubble__signin" onClick={() => void signIn()}>
          Sign in
        </button>
        {state.error && (
          <p className="account-bubble__error">
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
      <div className="account-bubble">
        <button type="button" className="account-bubble__signin" disabled>
          Signing in…
        </button>
      </div>
    )
  }

  // Restoring a stored session before first paint (#72) — same status-pill
  // treatment as folder setup, distinct copy: the user didn't just do
  // anything, the app is catching up.
  if (state.status === 'restoring') {
    return (
      <div className="account-bubble">
        <p className="account-bubble__status">Reconnecting…</p>
      </div>
    )
  }

  if (state.status === 'setting-up-folder') {
    return (
      <div className="account-bubble">
        <p className="account-bubble__status">Setting up your Cairn folder…</p>
      </div>
    )
  }

  const email = state.email ?? ''
  const name = state.status === 'signed-in' ? state.name : undefined
  const pictureUrl = state.status === 'signed-in' ? state.pictureUrl : undefined
  const label = name ?? email ?? 'Account'

  return (
    <div className="account-bubble">
      <button
        type="button"
        ref={triggerRef}
        className="account-bubble__trigger"
        aria-expanded={open}
        aria-label={`Account: ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        {pictureUrl && !imgFailed ? (
          <img
            src={pictureUrl}
            alt=""
            className="account-bubble__avatar"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="account-bubble__avatar account-bubble__avatar--fallback">
            {initialFrom(label)}
          </span>
        )}
      </button>
      {open && (
        <div className="account-bubble__popover" ref={popoverRef} role="menu">
          <p className="account-bubble__name">{name ?? email}</p>
          {name && <p className="account-bubble__email">{email}</p>}
          {state.status === 'folder-error' && (
            <>
              <p className="account-bubble__error">Couldn't set up the Cairn folder — try again</p>
              <button
                type="button"
                className="account-bubble__action"
                onClick={() => void retryFolderSetup()}
              >
                Retry
              </button>
            </>
          )}
          {state.status === 'token-expired' && (
            <>
              <p className="account-bubble__error">
                Your Drive session expired — reconnect to keep using Drive
              </p>
              <button
                type="button"
                className="account-bubble__action"
                disabled={state.reconnecting}
                onClick={() => void reconnect()}
              >
                {state.reconnecting ? 'Reconnecting…' : 'Reconnect'}
              </button>
            </>
          )}
          {state.status !== 'token-expired' && (
            <>
              <div className="account-bubble__divider" />
              <button
                type="button"
                className="account-bubble__signout"
                onClick={() => {
                  signOut()
                  setOpen(false)
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
