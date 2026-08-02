import { useRef, type ChangeEvent } from 'react'
import type { UseTrackImport } from '../import/useTrackImport'
import './ImportPanel.css'

type ImportPanelProps = UseTrackImport

export function ImportPanel({ files, failures, progress, importFiles, dismissFailures }: ImportPanelProps) {
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

      {files.length > 0 && (
        <ul className="import-panel__files">
          {files.map((imported) => (
            <li key={imported.id} className="import-panel__file">
              {imported.name}
              {imported.tracks.length > 1 && (
                <span className="import-panel__file-count"> ({imported.tracks.length})</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
