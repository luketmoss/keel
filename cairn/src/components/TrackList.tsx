import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type RefObject } from 'react'
import type { ImportedFile } from '../import/types'
import { TRACK_COLOR_NAMES, TRACK_COLORS, trackColor } from '../map/palette'
import { formatStatsLine } from '../format/units'
import { effectiveElevationProfile, type StoredTrackElevation } from '../kml/stats'
import { prefersReducedMotion } from '../map/motion'
import { iconLabel } from './iconLabel'
import { RowMenu } from './RowMenu'
import { TrackFaceBody } from './TrackFaceBody'
import { VisibilityIcon } from './VisibilityIcon'
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
      away from everywhere it appears. Absent outside a trip. #193 moved
      both items into the row's `⋮`. */
  onRemoveFromTrip?: (id: string) => void
  /** #77 — the single confirm slot, shared with `CairnList` by the parent
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
  /** #270 — the map-to-row direction #251 named and left open for tracks:
      the id `TripDetail`'s `hoveredFileId` names, so a route's hit line on
      the map can drive the identical row highlight a pointer over the row
      itself already does — the same `--hovered` class `CairnList`'s own row
      already takes for the same reason. `null`/omitted means nothing on the
      map is hovered. */
  hoveredFileId?: string | null
  /** #46: rename/reorder/recolour are trip-scoped — omitted on v1's
      non-trip list (`App.tsx`), which hides the corresponding controls
      entirely rather than rendering them disabled. */
  onRename?: (id: string, displayName: string) => Promise<boolean>
  onRecolor?: (id: string, color: number) => Promise<boolean>
  /** Called with every row's `id` in its new order once a drag completes. */
  onReorder?: (orderedIds: string[]) => Promise<boolean>
  /** #268 — the one row expanded in place, or `null`. Lives in `TripDetail`
      beside `expandedCairnId` rather than as state here: it is not derived
      from anything, and #270 will need to move it without collapsing the
      row (design note's "One at a time"). Defaults to `null` so a caller
      that never wires expansion (most of this file's tests) keeps working
      unchanged. */
  expandedTrackId?: string | null
  /** #268 — toggles `expandedTrackId`: this file's own id if some other row
      (or none) is expanded, `null` if this file is already the one
      expanded. The header button and the row's own non-interactive area
      both call this with the same file id. */
  onToggleExpand?: (id: string) => void
  /** #269 — the one row selected, or `null`. Held apart from
      `expandedTrackId` in `TripDetail` for the reason #250 gives for the
      cairn pair: collapsing a row must not be able to lose the map's
      highlight. Defaults to `null` so a caller that never wires selection
      keeps working unchanged. */
  selectedTrackId?: string | null
  /** #269 — a row's click (name, meta line, or its whitespace) reports its
      own file id here, whether or not the row can also expand — a
      multi-track file's click has no expansion to toggle but still
      selects. */
  onSelectTrack?: (id: string) => void
  /** #268: the trip's current sampled-elevation cache (#224), keyed by
      `Track.key` — threaded through so the expanded row's profile can fall
      back to a sampled series exactly as `TrackFace`'s does. Empty object
      when nothing has been sampled, matching `useTripImport`'s own rest
      value. */
  sampledElevation?: Record<string, StoredTrackElevation>
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
  hoveredFileId = null,
  onRename,
  onRecolor,
  onReorder,
  expandedTrackId = null,
  onToggleExpand = () => {},
  selectedTrackId = null,
  onSelectTrack = () => {},
  sampledElevation = {},
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
    // #268: dragging the expanded row collapses it first — reordering a
    // row three times its normal height past its neighbours makes the drop
    // indicator unreadable.
    if (expandedTrackId === id) onToggleExpand(id)
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
              onStartConfirm={() => {
                if (onStartConfirm) onStartConfirm(file.id)
                else onRemove(file.id)
              }}
              onCancelConfirm={onCancelConfirm}
              expanded={expandedTrackId === file.id}
              onToggleExpand={() => onToggleExpand(file.id)}
              selected={selectedTrackId === file.id}
              onSelectTrack={() => onSelectTrack(file.id)}
              sampledElevation={sampledElevation}
              removing={removingIds.has(file.id)}
              removeError={removeErrors[file.id]}
              disableRemove={disableRemove}
              onHoverFile={onHoverFile}
              hovered={hoveredFileId === file.id}
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
  hovered,
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
  expanded,
  onToggleExpand,
  selected,
  onSelectTrack,
  sampledElevation,
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
  /** #270 — whether this row is the one `TrackLayer`'s hit-line hover names,
      driving the same pixels a pointer-over-the-row already does (mirrors
      `CairnList`'s own `hovered`/`cairn-row--hovered`). */
  hovered: boolean
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
  /** #268 — whether *this* row is the one `TripDetail.expandedTrackId`
      names. Meaningless for a multi-track file, which never opens
      (`canOpenDetail` below). */
  expanded: boolean
  onToggleExpand: () => void
  /** #269 — whether this row is the one `TripDetail.selectedTrackId`
      names. Unlike `expanded`, meaningful for a multi-track file too. */
  selected: boolean
  onSelectTrack: () => void
  sampledElevation: Record<string, StoredTrackElevation>
}) {
  const [editingName, setEditingName] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [savedField, setSavedField] = useState<'name' | 'color' | null>(null)
  const liRef = useRef<HTMLLIElement | null>(null)

  const color = trackColor(file.colorIndex)
  /* Aggregating statistics across a multi-track file is out of scope (v2,
     with trips) — the line only appears when there is exactly one track to
     describe unambiguously. */
  const statsLine = file.tracks.length === 1 ? formatStatsLine(file.trackStats[0]) : null
  /* #268 (was #226's, was #219's `canOpen`) — a multi-track file has no
     unambiguous single set of numbers (#6, #7), so there is nothing for a
     detail to show: no expand affordance, no `aria-expanded`. Its `⋮` still
     carries Rename. */
  const canOpenDetail = file.tracks.length === 1
  const detailId = `track-row-detail-${file.id}`
  // #268: inert while removing — the row is already about to be destroyed,
  // matching `CairnList`'s own `previewOpen` guard.
  const expandedOpen = canOpenDetail && expanded && !removing
  // #219's mechanism needs the wrapper mounted through a collapse's own
  // transition, so it can't unmount the moment `expandedOpen` goes false —
  // but mounting `TrackFaceBody` for every never-opened row would put its
  // stats labels and its "N points · <source>" footnote into a list that
  // has never been touched (and, concretely, collide with `getByText`
  // lookups on the file's own name). Once opened, its content stays
  // mounted so a later collapse still has something to animate shut.
  const [hasOpened, setHasOpened] = useState(expanded)
  useEffect(() => {
    if (expanded) setHasOpened(true)
  }, [expanded])
  // The median-filtered, distance-aligned series, or the sampled fallback
  // (#224) — `TrackFace`'s own computation, reused here so the row and the
  // face never disagree on what a track's profile is. Only computed once
  // the row has actually opened, for the same reason its content mounts
  // lazily above.
  const profile =
    canOpenDetail && hasOpened
      ? effectiveElevationProfile(file.tracks[0], file.tracks[0].key ? sampledElevation[file.tracks[0].key] : undefined)
      : undefined

  // #268 — the row's remaining non-interactive area also toggles, for
  // pointer users who aim at the whitespace around the header rather than
  // the name/meta button itself — implemented by ignoring any click whose
  // target sits inside an interactive descendant, in one place, rather than
  // `stopPropagation` in five handlers (#219's mechanism, restored).
  //
  // #269 — the same click also selects, whether or not the row can expand:
  // a multi-track file's whitespace has no expansion to toggle but still
  // has a row to select, since it's the click's other meaning from here on.
  function handleRowClick(event: MouseEvent<HTMLDivElement>) {
    if (editingName) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, [draggable="true"]')) return
    onSelectTrack()
    if (canOpenDetail) onToggleExpand()
  }

  // #268: scrolls the row into view once the expanded block has laid out —
  // `block: 'nearest'` on the `<li>` itself rather than the header, since a
  // track row (unlike #250's cairn row) has no selection to hang the scroll
  // on. One frame's delay lets the grid-template-rows transition start from
  // its own layout rather than the collapsed one.
  useEffect(() => {
    if (!expandedOpen) return
    const raf = requestAnimationFrame(() => {
      liRef.current?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [expandedOpen])

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
    hovered ? 'track-row--hovered' : '',
    selected ? 'track-row--selected' : '',
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
      ref={liRef}
      className={rowClassName}
      onMouseEnter={() => onHoverFile?.(file.id)}
      onMouseLeave={() => onHoverFile?.(null)}
      onDragOver={onDragOverRow}
      onDrop={onDrop}
    >
      {/* #268 — restores #219's click, revised by #226 to do nothing: the
          header's own whitespace toggles the row now that it has a detail
          to toggle again. `⠿`, the swatch, `👁` and `⋮` are their own
          controls and are excluded by `handleRowClick`'s interactive-
          descendant check rather than by `stopPropagation` in each of
          them. */}
      <div className="track-row__main" onClick={handleRowClick}>
        {showHandle ? (
          <span
            className={`track-row__handle${draggable ? '' : ' track-row__handle--disabled'}`}
            draggable={draggable}
            onDragStart={draggable ? onDragStart : undefined}
            onDragEnd={onDragEnd}
            {...iconLabel(`Reorder ${file.name}`)}
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
              {...iconLabel(`Change colour for ${file.name}`)}
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

        {/* #193 — the name on its own line with the stats line beneath it,
            the anatomy `shell-and-content-model.md` specifies and the two
            lists inside a trip were the last surfaces not to use. The
            controls that flanked the name cost it all but ~68px of a
            380px column; the meta line now gets the row's own width.

            #268 — while it can open a detail, this becomes the header
            button again (#219's, restored): it carries `aria-expanded`/
            `aria-controls` and wraps the name and the meta line and
            nothing else, so a control added to the row later never ends up
            nested inside it. Renaming replaces it with a plain div, since
            an `<input>` cannot sit inside a `<button>`. */}
        {editingName ? (
          <div className="track-row__text">
            <NameInput initial={file.name} onCommit={commitName} onCancel={() => setEditingName(false)} />
            {statsLine && <p className="track-row__stats">{statsLine}</p>}
          </div>
        ) : canOpenDetail ? (
          <button
            type="button"
            className="track-row__text track-row__text--button"
            aria-expanded={expandedOpen}
            aria-controls={detailId}
            onClick={() => {
              onSelectTrack()
              onToggleExpand()
            }}
          >
            <span className={`track-row__name${savedField === 'name' ? ' track-row__field--saved' : ''}`} title={file.name}>
              {file.name}
            </span>
            {/* A multi-track file has no unambiguous stats line, and no
                empty second line is drawn to keep row heights equal — moot
                here since a multi-track file never reaches this branch. */}
            {statsLine && <p className="track-row__stats">{statsLine}</p>}
          </button>
        ) : (
          <div className="track-row__text">
            <span className={`track-row__name${savedField === 'name' ? ' track-row__field--saved' : ''}`} title={file.name}>
              {file.name}
              <span className="track-row__count"> {file.tracks.length} tracks</span>
            </span>
          </div>
        )}
        <button
          type="button"
          className="track-row__visibility"
          {...iconLabel(file.visible ? `Hide ${file.name}` : `Show ${file.name}`)}
          disabled={removing}
          onClick={() => onToggleVisibility(file.id)}
        >
          <VisibilityIcon visible={file.visible} />
        </button>
        {removing ? (
          <span className="track-row__removing">Removing…</span>
        ) : (
          /* #193 — the `⤴` and `×` become named items behind the one `⋮`.
             `Remove from trip` is reversible by adding it back, which is
             what makes it the other exit; `Delete permanently…` keeps
             #77's inline confirm, and the ellipsis is what says so. */
          <RowMenu
            label={`Row actions for ${file.name}`}
            actions={[
              ...(onRename
                ? [
                    {
                      label: 'Rename',
                      disabled,
                      onSelect: () => setEditingName(true),
                    },
                  ]
                : []),
              ...(onRemoveFromTrip
                ? [
                    {
                      label: 'Remove from trip',
                      disabled: disableRemove,
                      onSelect: () => onRemoveFromTrip(file.id),
                    },
                  ]
                : []),
              {
                label: 'Delete permanently…',
                danger: true,
                disabled: disableRemove,
                onSelect: onStartConfirm,
              },
            ]}
          />
        )}
      </div>
      {removeError && <p className="track-row__error">{removeError}</p>}
      {/* #268 — beneath the header, flush at the row's own content width
          rather than indented into the text column (#226's lesson, applied
          with #250's measurement): a sibling of `.track-row__main` inside
          this `<li>`, so it inherits the row's own padding instead of the
          narrower text column's. Always mounted for a row that can open at
          all — `grid-template-rows: 0fr -> 1fr` animates open/closed
          without a `display` toggle, #219's mechanism, restored. Absent
          entirely for a multi-track file, which has no `aria-controls`
          pointing at it to begin with. */}
      {canOpenDetail && (
        <div
          id={detailId}
          className={`track-row__detail-wrapper${expandedOpen ? ' track-row__detail-wrapper--open' : ''}`}
        >
          <div className="track-row__detail-inner">
            {hasOpened && (
              <TrackFaceBody
                stats={file.trackStats[0]}
                profile={profile}
                pointCount={file.tracks[0].points.length}
                sourceName={file.sourceName}
                color={color}
                name={file.name}
                flyoverPoints={file.tracks[0].points.map((point) => ({ lat: point.lat, lng: point.lon }))}
              />
            )}
          </div>
        </div>
      )}
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
          listener — a full-viewport layer beneath the popover itself.
          Stops propagation: it's a DOM descendant of the row despite
          covering the whole viewport, and #268 gave the row's own click a
          meaning again — without this, closing the popover from anywhere
          on screen would also toggle the row's expansion. */}
      <div
        className="track-row__color-backdrop"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
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
