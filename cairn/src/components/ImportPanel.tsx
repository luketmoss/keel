import { useRef, type ChangeEvent } from 'react'
import type { ImportFailure, ImportProgress } from '../import/types'
import './ImportPanel.css'

interface ImportPanelProps {
  failures: ImportFailure[]
  progress: ImportProgress | null
  importFiles: (incoming: File[]) => Promise<void>
  dismissFailures: () => void
}

export function ImportPanel({ failures, progress, importFiles, dismissFailures }: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = progress !== null

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selected.length > 0) void importFiles(selected)
  }

  return (
    <div className="import-panel">
      <button
        type="button"
        className="import-panel__button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import tracks'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".kml,.kmz"
        multiple
        className="import-panel__input"
        onChange={handleChange}
      />

      {progress && (
        <p className="import-panel__progress">
          {progress.name} — {progress.index} of {progress.total}
        </p>
      )}

      {failures.length > 0 && (
        <div className="import-panel__failures">
          {failures.map((failure) => (
            <p key={failure.id} className="import-panel__failure">
              <strong>{failure.name}</strong> — {failure.message}
            </p>
          ))}
          <button type="button" className="import-panel__dismiss" onClick={dismissFailures}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
