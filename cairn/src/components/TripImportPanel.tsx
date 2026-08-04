import { useRef, type ChangeEvent } from 'react'
import type { TripImportFailure, TripImportProgress } from '../import/useTripImport'
import type { PhotoImportFailure, PhotoImportProgress } from '../photo/usePhotoImport'
import './TripImportPanel.css'

/* Either pipeline's progress/failure row renders identically here — the
   panel doesn't care which pipeline a row came from, only that it has a
   name, a position, and (for failures) a message and optional retry. */
type AnyProgress = TripImportProgress | PhotoImportProgress
type AnyFailure = TripImportFailure | PhotoImportFailure

interface TripImportPanelProps {
  signedIn: boolean
  /** Track-import progress/failures and photo-import progress/failures,
      shown together beneath one control (design doc: "One import control,
      not two" — a dropped folder containing both tracks and photos imports
      both, each down its own path, under a single progress readout). */
  progress: AnyProgress[]
  failures: AnyFailure[]
  importFiles: (incoming: File[]) => Promise<void>
  retryFailure: (id: string) => Promise<void>
  dismissFailures: () => void
  /** Routes a "signed out mid-upload" failure through re-authentication
      rather than a bare retry (design doc: retrying without a fresh token
      fails identically). Absent, those rows just retry directly. */
  onReconnect?: () => void
}

/* A dedicated panel rather than reusing v1's `ImportPanel` — the progress
   region here renders up to 4 concurrent lines instead of one, and
   failures carry a retry action that `ImportPanel`'s don't.

   #51 widens this control from tracks-only to "Import files": the label,
   the `accept` list, and the files it's handed all cover both tracks and
   photos now. Partitioning an incoming batch by extension into the two
   pipelines is the caller's job (`TripDetail`) — this component just
   forwards whatever `importFiles` it's given to both. */
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

  function handleFailureAction(failure: AnyFailure) {
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
        {busy ? 'Importing…' : 'Import files'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".kml,.kmz,.jpg,.jpeg,.png,.webp"
        multiple
        className="trip-import-panel__input"
        onChange={handleChange}
      />

      {!signedIn && (
        <p className="trip-import-panel__signed-out">
          Sign in to add tracks and photos to this trip.
        </p>
      )}

      {progress.map((entry) => (
        <p key={entry.id} className="trip-import-panel__progress">
          {entry.name} — {entry.index} of {entry.total}
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
