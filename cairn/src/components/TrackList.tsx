import { useState, type DragEvent } from 'react'
import type { ImportedFile } from '../import/types'
import { TRACK_COLOR_NAMES, TRACK_COLORS, trackColor } from '../map/palette'
import { formatStatsLine } from '../format/units'
import './TrackList.css'

interface TrackListProps {
  files: ImportedFile[]
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
  /** Reports which file's row the pointer is over (#49) — drives the
      map's hover glow. Omitted entirely on `TripDetail`'s reuse of this
      component, which has no glow-capable map beside it. */
  onHoverFile?: (id: string | null) => void
  /** #46: rename/reorder/recolour are trip-scoped — omitted on v1's
      non-trip list (`App.tsx`), which hides the corresponding controls
      entirely rather than rendering them disabled. */
  onRename?: (id: string, displayName: string) => boolean
  onRecolor?: (id: string, color: number) => boolean
  /** Called with every row's `id` in its new order once a drag completes. */
  onReorder?: (orderedIds: string[]) => boolean
  /** Drag handles render disabled while the trip is still gaining rows
      during #35's Partially loaded state — reordering a list that's still
      settling underneath the cursor produces a result nobody intended.
      Ignored when `onReorder` is omitted. */
  canReorder?: boolean
}

interface DragState {
  draggedId: string
  overId: string | null
  before: boolean
}

export function TrackList({
  files,
  onToggleVisibility,
  onRemove,
  onHoverFile,
  onRename,
  onRecolor,
  onReorder,
  canReorder = true,
}: TrackListProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  function handleDragStart(id: string) {
    if (!onReorder || !canReorder) return
    setDragState({ draggedId: id, overId: null, before: true })
  }

  function handleDragOverRow(event: DragEvent<HTMLLIElement>, id: string) {
    if (!dragState) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    setDragState((prev) => (prev ? { ...prev, overId: id, before } : prev))
  }

  function handleDrop() {
    const state = dragState
    setDragState(null)
    if (!state || !onReorder || !state.overId || state.overId === state.draggedId) return

    const ids = files.map((f) => f.id)
    const withoutDragged = ids.filter((id) => id !== state.draggedId)
    const overIndex = withoutDragged.indexOf(state.overId)
    const insertAt = state.before ? overIndex : overIndex + 1
    const next = [...withoutDragged.slice(0, insertAt), state.draggedId, ...withoutDragged.slice(insertAt)]

    if (!onReorder(next)) setError("Couldn't save order — reverted.")
    else setError(null)
  }

  return (
    <>
      <ul className="track-list">
        {files.map((file) => {
          let dropIndicator: 'before' | 'after' | null = null
          if (dragState && dragState.overId === file.id && dragState.draggedId !== file.id) {
            dropIndicator = dragState.before ? 'before' : 'after'
          }
          return (
            <TrackRow
              key={file.id}
              file={file}
              onToggleVisibility={onToggleVisibility}
              onRemove={onRemove}
              onHoverFile={onHoverFile}
              onRename={onRename}
              onRecolor={onRecolor}
              onSaveError={setError}
              showHandle={Boolean(onReorder)}
              draggable={Boolean(onReorder) && canReorder}
              dragging={dragState?.draggedId === file.id}
              dropIndicator={dropIndicator}
              onDragStart={() => handleDragStart(file.id)}
              onDragOverRow={(event) => handleDragOverRow(event, file.id)}
              onDrop={handleDrop}
              onDragEnd={() => setDragState(null)}
            />
          )
        })}
      </ul>
      {error && <p className="track-list__error">{error}</p>}
    </>
  )
}

function TrackRow({
  file,
  onToggleVisibility,
  onRemove,
  onHoverFile,
  onRename,
  onRecolor,
  onSaveError,
  showHandle,
  draggable,
  dragging,
  dropIndicator,
  onDragStart,
  onDragOverRow,
  onDrop,
  onDragEnd,
}: {
  file: ImportedFile
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
  onHoverFile?: (id: string | null) => void
  onRename?: (id: string, displayName: string) => boolean
  onRecolor?: (id: string, color: number) => boolean
  onSaveError: (message: string | null) => void
  showHandle: boolean
  draggable: boolean
  dragging: boolean
  dropIndicator: 'before' | 'after' | null
  onDragStart: () => void
  onDragOverRow: (event: DragEvent<HTMLLIElement>) => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [savedField, setSavedField] = useState<'name' | 'color' | null>(null)

  const color = trackColor(file.colorIndex)
  /* Aggregating statistics across a multi-track file is out of scope (v2,
     with trips) — the line only appears when there is exactly one track to
     describe unambiguously. */
  const statsLine = file.tracks.length === 1 ? formatStatsLine(file.trackStats[0]) : null

  function flashSaved(field: 'name' | 'color') {
    setSavedField(field)
    setTimeout(() => setSavedField(null), 180)
  }

  function commitName(value: string) {
    setEditingName(false)
    const trimmed = value.trim()
    // Empty commit is an aborted edit, not a saved one — same rule as the
    // trip header's name field.
    if (trimmed.length === 0) return
    if (!onRename) return
    if (onRename(file.id, trimmed)) {
      onSaveError(null)
      flashSaved('name')
    } else {
      onSaveError("Couldn't save name — reverted.")
    }
  }

  function selectColor(index: number) {
    setColorPickerOpen(false)
    if (!onRecolor) return
    if (onRecolor(file.id, index)) {
      onSaveError(null)
      flashSaved('color')
    } else {
      onSaveError("Couldn't save colour — reverted.")
    }
  }

  const rowClassName = [
    'track-row',
    file.visible ? '' : 'track-row--hidden',
    dragging ? 'track-row--dragging' : '',
    dropIndicator ? `track-row--drop-${dropIndicator}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      className={rowClassName}
      onMouseEnter={() => onHoverFile?.(file.id)}
      onMouseLeave={() => onHoverFile?.(null)}
      onDragOver={onDragOverRow}
      onDrop={onDrop}
    >
      <div className="track-row__main">
        {showHandle ? (
          <span
            className={`track-row__handle${draggable ? '' : ' track-row__handle--disabled'}`}
            draggable={draggable}
            onDragStart={draggable ? onDragStart : undefined}
            onDragEnd={onDragEnd}
            aria-label={`Reorder ${file.name}`}
          >
            ⠿
          </span>
        ) : null}

        {onRecolor ? (
          <span className="track-row__swatch-wrap">
            <button
              type="button"
              className={`track-row__swatch-button${savedField === 'color' ? ' track-row__field--saved' : ''}`}
              aria-label={`Change colour for ${file.name}`}
              onClick={() => setColorPickerOpen((open) => !open)}
            >
              <span className="track-row__swatch" style={{ backgroundColor: color }} />
            </button>
            {colorPickerOpen && (
              <ColorPopover
                name={file.name}
                currentColorIndex={file.colorIndex % TRACK_COLORS.length}
                onSelect={selectColor}
                onClose={() => setColorPickerOpen(false)}
              />
            )}
          </span>
        ) : (
          <span className="track-row__swatch" style={{ backgroundColor: color }} />
        )}

        {editingName ? (
          <NameInput initial={file.name} onCommit={commitName} onCancel={() => setEditingName(false)} />
        ) : (
          <span
            className={`track-row__name${onRename ? ' track-row__name--editable' : ''}${
              savedField === 'name' ? ' track-row__field--saved' : ''
            }`}
            title={file.name}
            onClick={onRename ? () => setEditingName(true) : undefined}
          >
            {file.name}
            {file.tracks.length > 1 && (
              <span className="track-row__count"> {file.tracks.length} tracks</span>
            )}
          </span>
        )}
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
      </div>
      {statsLine && <p className="track-row__stats">{statsLine}</p>}
    </li>
  )
}

function NameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      className="track-row__name-input"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(value)
        if (event.key === 'Escape') onCancel()
      }}
    />
  )
}

function ColorPopover({
  name,
  currentColorIndex,
  onSelect,
  onClose,
}: {
  name: string
  currentColorIndex: number
  onSelect: (index: number) => void
  onClose: () => void
}) {
  return (
    <>
      {/* Closes the popover on an outside click without a document-level
          listener — a full-viewport layer beneath the popover itself. */}
      <div className="track-row__color-backdrop" onClick={onClose} />
      <div
        className="track-row__color-popover"
        role="group"
        aria-label={`Colours for ${name}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {TRACK_COLORS.map((swatchColor, index) => (
          <button
            key={swatchColor}
            type="button"
            className="track-row__color-option"
            aria-label={TRACK_COLOR_NAMES[index]}
            onClick={() => onSelect(index)}
          >
            <span
              className={`track-row__color-swatch${
                index === currentColorIndex ? ' track-row__color-swatch--selected' : ''
              }`}
              style={{ backgroundColor: swatchColor }}
            />
          </button>
        ))}
      </div>
    </>
  )
}
