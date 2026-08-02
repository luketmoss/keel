import { useRef, type ChangeEvent } from 'react'
import type { TripImportFailure, TripImportProgress } from '../import/useTripImport'
import './TripImportPanel.css'

interface TripImportPanelProps {
  signedIn: boolean
  progress: TripImportProgress[]
  failures: TripImportFailure[]
  importFiles: (incoming: File[]) => Promise<void>
  retryFailure: (id: string) => Promise<void>
  dismissFailures: () => void
  /** Routes a "signed out mid-upload" failure through re-authentication
      rather than a bare retry (design doc: retrying without a fresh token
      fails identically). Absent, those rows just retry directly. */
  onReconnect?: () => void
}

/* A dedicated panel rather than reusing v1's `ImportPanel` — the progress
   region here renders up to 3 concurrent lines instead of one, and
   failures carry a retry action that `ImportPanel`'s don't. */
export function TripImportPanel({
  signedIn,
  progress,
  failures,
  importFiles,
  retryFailure,
  dismissFailures,
  onReconnect,
}: TripImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = progress.length > 0

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selected.length > 0) void importFiles(selected)
  }

  function handleFailureAction(failure: TripImportFailure) {
    if (!failure.retryFile) return
    if (failure.reconnect) {
      onReconnect?.()
      return
    }
    void retryFailure(failure.id)
  }

  return (
    <div className="trip-import-panel">
      <button
        type="button"
        className="trip-import-panel__button"
        disabled={busy || !signedIn}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import tracks'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".kml,.kmz"
        multiple
        className="trip-import-panel__input"
        onChange={handleChange}
      />

      {!signedIn && (
        <p className="trip-import-panel__signed-out">
          Sign in to attach tracks to this trip.
        </p>
      )}

      {progress.map((entry) => (
        <p key={`${entry.index}-${entry.name}`} className="trip-import-panel__progress">
          {entry.name} — {entry.phase}, {entry.index} of {entry.total}
        </p>
      ))}

      {failures.length > 0 && (
        <div className="trip-import-panel__failures">
          {failures.map((failure) =>
            failure.retryFile ? (
              <button
                key={failure.id}
                type="button"
                className="trip-import-panel__failure trip-import-panel__failure--retryable"
                onClick={() => handleFailureAction(failure)}
              >
                <strong>{failure.name}</strong> — {failure.message}
              </button>
            ) : (
              <p key={failure.id} className="trip-import-panel__failure">
                <strong>{failure.name}</strong> — {failure.message}
              </p>
            ),
          )}
          <button type="button" className="trip-import-panel__dismiss" onClick={dismissFailures}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
