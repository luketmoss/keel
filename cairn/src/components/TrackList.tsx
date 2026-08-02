import type { ImportedFile } from '../import/types'
import { trackColor } from '../map/palette'
import './TrackList.css'

interface TrackListProps {
  files: ImportedFile[]
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
}

export function TrackList({ files, onToggleVisibility, onRemove }: TrackListProps) {
  if (files.length === 0) {
    return (
      <div className="track-list track-list--empty">
        <p className="track-list__empty-title">No tracks yet</p>
        <p className="track-list__empty-detail">
          Drop a KML or KMZ file anywhere, or use Import tracks above.
        </p>
      </div>
    )
  }

  return (
    <ul className="track-list">
      {files.map((file) => (
        <TrackRow
          key={file.id}
          file={file}
          onToggleVisibility={onToggleVisibility}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}

function TrackRow({
  file,
  onToggleVisibility,
  onRemove,
}: {
  file: ImportedFile
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
}) {
  const color = trackColor(file.colorIndex)

  return (
    <li className={`track-row${file.visible ? '' : ' track-row--hidden'}`}>
      <span className="track-row__swatch" style={{ backgroundColor: color }} />
      <span className="track-row__name" title={file.name}>
        {file.name}
        {file.tracks.length > 1 && (
          <span className="track-row__count"> {file.tracks.length} tracks</span>
        )}
      </span>
      <button
        type="button"
        className="track-row__visibility"
        aria-label={file.visible ? `Hide ${file.name}` : `Show ${file.name}`}
        onClick={() => onToggleVisibility(file.id)}
      >
        {file.visible ? '👁' : '🚫'}
      </button>
      <button
        type="button"
        className="track-row__remove"
        aria-label={`Remove ${file.name}`}
        onClick={() => onRemove(file.id)}
      >
        ×
      </button>
    </li>
  )
}
