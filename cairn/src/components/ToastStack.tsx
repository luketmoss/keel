import { useEffect } from 'react'
import './ToastStack.css'

export interface ToastMessage {
  id: string
  text: string
  /** #327 — skips the auto-dismiss timer, for a toast that announces a
      state rather than a one-off event: it stays until the user acts on
      it or dismisses it by hand, same as the account bubble's own expiry
      row never disappearing on its own. */
  persistent?: boolean
  /** #327 — `default` (`--text`) for a toast reporting something expected
      rather than a failure. Omitted (or `'danger'`) keeps every existing
      call site's own `--danger` unchanged. */
  tone?: 'danger' | 'default'
  /** #327 — an inline action beside the dismiss control, e.g. `Sign in`.
      `pending` disables it and swaps its label while the action is in
      flight, mirroring the account bubble's own `Reconnecting…`. */
  action?: { label: string; pendingLabel?: string; pending?: boolean; onClick: () => void }
}

const AUTO_DISMISS_MS = 6000

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

/** Bottom-centre, dismissible, auto-clearing after 6s (#81's "Rejected
    file" state) — a dropped file the app can't use, reported without
    opening a draft. Several can stack (design doc: "one bad file does not
    discard the batch"), each on its own timer. */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.persistent) return
    const timeout = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id])

  return (
    <div className={`toast${toast.tone === 'default' ? ' toast--default' : ''}`} role="alert">
      <span className="toast__text">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          disabled={toast.action.pending}
          onClick={toast.action.onClick}
        >
          {toast.action.pending ? (toast.action.pendingLabel ?? toast.action.label) : toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast__dismiss"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}
