import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react'
import type { ImportedFile } from '../import/types'
import { TRACK_COLOR_NAMES, TRACK_COLORS, trackColor } from '../map/palette'
import { formatStatsLine } from '../format/units'
import './TrackList.css'

interface TrackListProps {
  files: ImportedFile[]
  onToggleVisibility: (id: string) => void
  /** #77: performs the actual removal (trash + prune) once the row's
      confirm has been accepted — the `×` control itself only starts the
      confirm, via `onStartConfirm` below. */
  onRemove: (id: string) => void
  /** #110's second exit: returns the track to the top level with its data
      intact, rather than destroying it. Two named items, never one action
      with a second step — getting rid of something must stay one click
      away from everywhere it appears. Absent outside a trip. */
  onRemoveFromTrip?: (id: string) => void
  /** #77 — the single confirm slot, shared with `PhotoList` by the parent
      (design doc: "tracks and photos sharing one slot"). `null` when no row
      anywhere in the trip is confirming. Omitted entirely on v1's non-trip
      list (`App.tsx`), which has no Drive file behind a removal to confirm
      and keeps its old instant-remove behaviour — `onRemove` fires directly
      from the `×` control whenever `onStartConfirm` isn't supplied. */
  confirmingId?: string | null
  onStartConfirm?: (id: string) => void
  onCancelConfirm?: () => void
  /** Attached to whichever row is currently confirming, so the shared
      pointerdown-outside listener (owned by the parent) knows what counts
      as "inside". */
  confirmingRowRef?: RefObject<HTMLElement | null>
  /** Track ids whose removal is in flight — row renders muted and inert. */
  removingIds?: Set<string>
  /** Track id -> failure copy to show beneath that row. */
  removeErrors?: Record<string, string>
  /** True while there's no Drive connection to remove against — same
      `signedIn` gate `TripImportPanel` already applies to import. */
  disableRemove?: boolean
  /** Reports which file's row the pointer is over (#49) — drives the
      map's hover glow. Omitted entirely on `TripDetail`'s reuse of this
      component, which has no glow-capable map beside it. */
  onHoverFile?: (id: string | null) => void
  /** #46: rename/reorder/recolour are trip-scoped — omitted on v1's
      non-trip list (`App.tsx`), which hides the corresponding controls
      entirely rather than rendering them disabled. */
  onRename?: (id: string, displayName: string) => Promise<boolean>
  onRecolor?: (id: string, color: number) => Promise<boolean>
  /** Called with every row's `id` in its new order once a drag completes. */
  onReorder?: (orderedIds: string[]) => Promise<boolean>
  /** Drag handles render disabled while the trip is still gaining rows
      during #35's Partially loaded state — reordering a list that's still
      settling underneath the cursor produces a result nobody intended.
      Ignored when `onReorder` is omitted. */
  canReorder?: boolean
  /** #75: `TrackList` renders on two surfaces with two different import
      controls beside it, so the empty-state detail string belongs to the
      surface, not to this component. Defaults to `/`'s copy — the only
      surface where this component is reused unmodified; `TripDetail`
      passes its own, naming the widened "Import files" control and both
      file kinds it accepts. */
  emptyDetail?: string
  /** #72: true while the account is `token-expired`. Rename, recolour, and
      reorder go to the Disabled treatment — visibility toggling and remove
      stay live since neither touches Drive. */
  disabled?: boolean
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
  onRemoveFromTrip,
  confirmingId = null,
  onStartConfirm,
  onCancelConfirm = () => {},
  confirmingRowRef,
  removingIds = new Set<string>(),
  removeErrors = {},
  disableRemove = false,
  onHoverFile,
  onRename,
  onRecolor,
  onReorder,
  canReorder = true,
  emptyDetail = 'Drop a KML or KMZ file anywhere, or use Import tracks above.',
  disabled = false,
}: TrackListProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (files.length === 0) {
    return (
      <div className="track-list track-list--empty">
        <p className="track-list__empty-title">No tracks yet</p>
        <p className="track-list__empty-detail">{emptyDetail}</p>
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

  async function handleDrop() {
    const state = dragState
    setDragState(null)
    if (!state || !onReorder || !state.overId || state.overId === state.draggedId) return

    const ids = files.map((f) => f.id)
    const withoutDragged = ids.filter((id) => id !== state.draggedId)
    const overIndex = withoutDragged.indexOf(state.overId)
    const insertAt = state.before ? overIndex : overIndex + 1
    const next = [...withoutDragged.slice(0, insertAt), state.draggedId, ...withoutDragged.slice(insertAt)]

    if (!(await onReorder(next))) setError("Couldn't save order — reverted.")
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
              onRemoveFromTrip={onRemoveFromTrip}
              confirming={Boolean(onStartConfirm) && confirmingId === file.id}
              confirmingRowRef={confirmingId === file.id ? confirmingRowRef : undefined}
              onStartConfirm={() => (onStartConfirm ? onStartConfirm(file.id) : onRemove(file.id))}
              onCancelConfirm={onCancelConfirm}
              removing={removingIds.has(file.id)}
              removeError={removeErrors[file.id]}
              disableRemove={disableRemove}
              onHoverFile={onHoverFile}
              onRename={onRename}
              onRecolor={onRecolor}
              onSaveError={setError}
              disabled={disabled}
              showHandle={Boolean(onReorder)}
              draggable={Boolean(onReorder) && canReorder && !disabled}
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
  onRemoveFromTrip,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  removing,
  removeError,
  disableRemove,
  onHoverFile,
  onRename,
  onRecolor,
  onSaveError,
  disabled,
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
  onRemoveFromTrip?: (id: string) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  removing: boolean
  removeError?: string
  disableRemove: boolean
  onHoverFile?: (id: string | null) => void
  onRename?: (id: string, displayName: string) => Promise<boolean>
  onRecolor?: (id: string, color: number) => Promise<boolean>
  onSaveError: (message: string | null) => void
  disabled: boolean
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

  /* Held and cleared on unmount, the way `TripMetadataHeader` already does
     with its own saved flash. Left dangling, the timer fires against an
     unmounted row — harmless in a browser, and an unhandled
     "window is not defined" once the test environment has been torn down
     underneath it. */
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(savedTimeoutRef.current), [])

  function flashSaved(field: 'name' | 'color') {
    setSavedField(field)
    clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSavedField(null), 180)
  }

  async function commitName(value: string) {
    setEditingName(false)
    const trimmed = value.trim()
    // Empty commit is an aborted edit, not a saved one — same rule as the
    // trip header's name field.
    if (trimmed.length === 0) return
    if (!onRename) return
    if (await onRename(file.id, trimmed)) {
      onSaveError(null)
      flashSaved('name')
    } else {
      onSaveError("Couldn't save name — reverted.")
    }
  }

  async function selectColor(index: number) {
    setColorPickerOpen(false)
    if (!onRecolor) return
    if (await onRecolor(file.id, index)) {
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
    removing ? 'track-row--removing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // #77 — the confirm replaces the row's contents in place, same shape as
  // the trips list's (design doc: "no dialog, no overlay, no layout shift").
  if (confirming) {
    return (
      <li
        className={rowClassName}
        ref={(el) => {
          if (confirmingRowRef) confirmingRowRef.current = el
        }}
      >
        <div className="track-row__confirm">
          <span className="track-row__confirm-text">Delete &quot;{file.name}&quot;?</span>
          <div className="track-row__confirm-actions">
            <button
              type="button"
              className="track-row__confirm-remove"
              onClick={() => {
                onCancelConfirm()
                onRemove(file.id)
              }}
            >
              Delete
            </button>
            <button type="button" className="track-row__confirm-cancel" onClick={onCancelConfirm}>
              Cancel
            </button>
          </div>
        </div>
      </li>
    )
  }

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
          <span
            className={`track-row__swatch-wrap${disabled ? ' track-row__swatch-wrap--disabled' : ''}`}
          >
            <button
              type="button"
              className={`track-row__swatch-button${savedField === 'color' ? ' track-row__field--saved' : ''}`}
              aria-label={`Change colour for ${file.name}`}
              disabled={disabled}
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
            className={`track-row__name${onRename && !disabled ? ' track-row__name--editable' : ''}${
              savedField === 'name' ? ' track-row__field--saved' : ''
            }${disabled && onRename ? ' track-row__name--disabled' : ''}`}
            title={file.name}
            onClick={onRename && !disabled ? () => setEditingName(true) : undefined}
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
          disabled={removing}
          onClick={() => onToggleVisibility(file.id)}
        >
          {file.visible ? '👁' : '🚫'}
        </button>
        {removing ? (
          <span className="track-row__removing">Removing…</span>
        ) : (
          <>
            {onRemoveFromTrip && (
              /* No ellipsis and no confirm: it is reversible by adding it
                 back, which is exactly what makes it the other exit. */
              <button
                type="button"
                className="track-row__unlink"
                aria-label={`Remove ${file.name} from trip`}
                disabled={disableRemove}
                onClick={() => onRemoveFromTrip(file.id)}
              >
                ⤴
              </button>
            )}
            <button
              type="button"
              className="track-row__remove"
              aria-label={`Delete ${file.name} permanently`}
              disabled={disableRemove}
              onClick={onStartConfirm}
            >
              ×
            </button>
          </>
        )}
      </div>
      {statsLine && <p className="track-row__stats">{statsLine}</p>}
      {removeError && <p className="track-row__error">{removeError}</p>}
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
