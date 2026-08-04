import { useEffect } from 'react'
import './ToastStack.css'

export interface ToastMessage {
  id: string
  text: string
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
    const timeout = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id])

  return (
    <div className="toast" role="alert">
      <span className="toast__text">{toast.text}</span>
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
