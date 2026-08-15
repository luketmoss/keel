import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { deriveTripStatus, type TripIndexEntry } from '../store/tripStore'
import { matchesTripFilters, type TripFilters } from '../store/tripFilters'
import { formatTripMetaLine, tripRowAccessibleName } from '../format/dates'
import { canChangeOwner, looseMetaLine, showExport, type LooseRecord } from '../store/looseStore'
import { LIST_HEADINGS, type KindFilter } from './FilterChips'
import { RowMenu } from './RowMenu'
import { NameInput } from './NameInput'
import { ColorPopover } from './ColorPopover'
import { trackColor, TRACK_COLORS } from '../map/palette'
import './TripsPanel.css'

function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

interface TripsPanelProps {
  trips: TripIndexEntry[]
  /** #131: a trip's track count, keyed by id — the same number the "Add to
      a trip" picker already reads off `tripStore.getOverview`, computed
      once in `App` rather than per row. */
  trackCounts: ReadonlyMap<string, number>
  /** Tracks and photos that no trip owns. Owned ones are not here — they
      appear when their trip is open. */
  looseItems: LooseRecord[]
  kind: KindFilter
  filters: TripFilters
  onFiltersChange: (filters: TripFilters) => void
  dateSpan: { min: number; max: number } | null
  hoveredId: string | null
  onHover: (id: string | null) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onDeleteLoose: (id: string) => void
  onAddLooseToTrip: (id: string) => void
  /** #133: renames or recolours a loose item. Resolves `false` on a save
      failure, which the row reverts from — never touches the file itself. */
  onRenameLoose: (id: string, name: string) => Promise<boolean>
  onRecolorLoose: (id: string, color: number) => Promise<boolean>
  /** #140: downloads a loose item's source file. Failure is a toast, owned
      by `App`, not this panel. */
  onExportLoose: (id: string) => void
  /** #140: ids with an export currently in flight — `Export` goes to the
      Disabled treatment for those rows rather than starting a second
      download. */
  exportingIds: ReadonlySet<string>
  /** #73: no usable token — creating, moving or deleting go to the
      language's Disabled treatment. Reading is unaffected. */
  disabled: boolean
}

/** The panel's list face: trips, loose tracks and loose photos in one list,
    narrowed by the chip row above it. */
export function TripsPanel({
  trips,
  trackCounts,
  looseItems,
  kind,
  filters,
  onFiltersChange,
  dateSpan,
  hoveredId,
  onHover,
  onCreate,
  onDelete,
  onDeleteLoose,
  onAddLooseToTrip,
  onRenameLoose,
  onRecolorLoose,
  onExportLoose,
  exportingIds,
  disabled,
}: TripsPanelProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  // #133 — one shared line for a failed rename or recolour, the same shape
  // TrackList's own list-level error already takes, rather than a second
  // line per row that would have to fight the row's flex layout for space.
  const [editError, setEditError] = useState<string | null>(null)
  const confirmingRowRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (confirmingId === null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setConfirmingId(null)
    }

    function handlePointerDown(event: PointerEvent) {
      if (confirmingRowRef.current && !confirmingRowRef.current.contains(event.target as Node)) {
        setConfirmingId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [confirmingId])

  const search = filters.name.trim().toLowerCase()
  const visibleTrips =
    kind === 'all' || kind === 'trips'
      ? trips.filter((trip) => matchesTripFilters(trip, filters))
      : []
  const visibleLoose = looseItems.filter((item) => {
    if (kind === 'trips') return false
    if (kind === 'tracks' && item.kind !== 'track') return false
    if (kind === 'photos' && item.kind !== 'cairn') return false
    return search.length === 0 || item.name.toLowerCase().includes(search)
  })

  const total = visibleTrips.length + visibleLoose.length
  const nothingAtAll = trips.length === 0 && looseItems.length === 0
  const filteredEmpty = !nothingAtAll && total === 0

  function clearFilters() {
    onFiltersChange({ ...filters, status: 'all', name: '', range: null })
  }

  return (
    <div className="trips-panel">
      <div className="trips-panel__header">
        <div className="trips-panel__title-row">
          <h2 className="trips-panel__heading">{LIST_HEADINGS[kind]}</h2>
          <span className="trips-panel__count">{total}</span>
          <button
            type="button"
            className="trips-panel__new"
            disabled={disabled}
            onClick={() => setCreating(true)}
          >
            New trip
          </button>
        </div>
        {creating && (
          <NewTripField
            onCancel={() => setCreating(false)}
            onCreate={(name) => {
              onCreate(name)
              setCreating(false)
            }}
          />
        )}
        {disabled && <p className="trips-panel__hint">Sign in to add or remove trips.</p>}
        {dateSpan && dateSpan.min !== dateSpan.max && filters.range && (
          <YearRange
            min={dateSpan.min}
            max={dateSpan.max}
            value={filters.range}
            onChange={(range) => onFiltersChange({ ...filters, range })}
          />
        )}
      </div>

      {nothingAtAll ? (
        <div className="trips-panel__empty">
          {disabled ? (
            <p className="trips-panel__empty-title">Sign in to see your map.</p>
          ) : (
            <>
              <p className="trips-panel__empty-title">Nothing here yet</p>
              <p className="trips-panel__empty-detail">Drop a KML or a photo anywhere to start.</p>
            </>
          )}
        </div>
      ) : filteredEmpty ? (
        <div className="trips-panel__empty">
          <p className="trips-panel__empty-title">Nothing in this range</p>
          <button type="button" className="trips-panel__clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="trips-panel__list">
          {visibleTrips.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
              trackCount={trackCounts.get(trip.id) ?? 0}
              disabled={disabled}
              emphasized={hoveredId === trip.id}
              onHover={onHover}
              confirming={confirmingId === trip.id}
              confirmingRowRef={confirmingId === trip.id ? confirmingRowRef : undefined}
              onStartConfirm={() => setConfirmingId(trip.id)}
              onCancelConfirm={() => setConfirmingId(null)}
              onDelete={() => {
                setConfirmingId(null)
                onDelete(trip.id)
              }}
            />
          ))}
          {visibleLoose.map((item) => (
            <LooseRow
              key={item.id}
              item={item}
              disabled={disabled}
              emphasized={hoveredId === item.id}
              onHover={onHover}
              confirming={confirmingId === item.id}
              confirmingRowRef={confirmingId === item.id ? confirmingRowRef : undefined}
              onStartConfirm={() => setConfirmingId(item.id)}
              onCancelConfirm={() => setConfirmingId(null)}
              onAddToTrip={() => onAddLooseToTrip(item.id)}
              onDelete={() => {
                setConfirmingId(null)
                onDeleteLoose(item.id)
              }}
              onRename={onRenameLoose}
              onRecolor={onRecolorLoose}
              onSaveError={setEditError}
              onExport={() => onExportLoose(item.id)}
              exporting={exportingIds.has(item.id)}
            />
          ))}
        </ul>
      )}
      {editError && <p className="trips-panel__edit-error">{editError}</p>}
    </div>
  )
}

function NewTripField({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit() {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('A trip needs a name.')
      return
    }
    onCreate(trimmed)
  }

  return (
    <div className="trips-panel__create">
      <input
        ref={inputRef}
        type="text"
        className={`trips-panel__create-input${error ? ' trips-panel__create-input--invalid' : ''}`}
        placeholder="Trip name"
        aria-label="Trip name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          if (error !== null && event.target.value.trim().length > 0) setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') onCancel()
        }}
      />
      <button type="button" className="trips-panel__create-submit" onClick={submit}>
        Create
      </button>
      {error && <p className="trips-panel__create-error">{error}</p>}
    </div>
  )
}

function yearOf(day: number): number {
  return new Date(day * 86_400_000).getFullYear()
}

/** #79's two-thumb range, in the list header where it belongs. */
function YearRange({
  min,
  max,
  value,
  onChange,
}: {
  min: number
  max: number
  value: [number, number]
  onChange: (value: [number, number]) => void
}) {
  return (
    <div className="trips-panel__years">
      <span className="trips-panel__years-label">Years</span>
      <span className="trips-panel__years-year">{yearOf(value[0])}</span>
      <div className="trips-panel__years-track">
        <input
          type="range"
          className="trips-panel__years-input"
          aria-label="Range start"
          min={min}
          max={max}
          value={value[0]}
          onChange={(event) => onChange([Math.min(Number(event.target.value), value[1]), value[1]])}
        />
        <input
          type="range"
          className="trips-panel__years-input"
          aria-label="Range end"
          min={min}
          max={max}
          value={value[1]}
          onChange={(event) => onChange([value[0], Math.max(Number(event.target.value), value[0])])}
        />
      </div>
      <span className="trips-panel__years-year">{yearOf(value[1])}</span>
    </div>
  )
}

function RowConfirm({
  name,
  rowRef,
  onDelete,
  onCancel,
}: {
  name: string
  rowRef?: RefObject<HTMLLIElement | null>
  onDelete: () => void
  onCancel: () => void
}) {
  return (
    <li className="trips-panel__row" ref={rowRef}>
      <div className="trips-panel__row-confirm">
        <span className="trips-panel__row-confirm-text">Delete &quot;{name}&quot;?</span>
        <div className="trips-panel__row-confirm-actions">
          <button type="button" className="trips-panel__row-confirm-delete" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="trips-panel__row-confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </li>
  )
}

function TripRow({
  trip,
  trackCount,
  disabled,
  emphasized,
  onHover,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  onDelete,
}: {
  trip: TripIndexEntry
  trackCount: number
  disabled: boolean
  emphasized: boolean
  onHover: (id: string | null) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLLIElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  onDelete: () => void
}) {
  if (confirming) {
    return (
      <RowConfirm
        name={trip.name}
        rowRef={confirmingRowRef}
        onDelete={onDelete}
        onCancel={onCancelConfirm}
      />
    )
  }

  // #147: derived from the dates, not stored — see `deriveTripStatus`.
  const status = deriveTripStatus(trip.startDate, trip.endDate)

  return (
    <li
      className={`trips-panel__row${emphasized ? ' trips-panel__row--emphasized' : ''}`}
      onMouseEnter={() => onHover(trip.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* The dot's fill/hollow treatment carries status visually, so the
          meta line below no longer spells it out — see #131. */}
      <span className={`trips-panel__row-dot trips-panel__row-dot--${status}`} aria-hidden="true" />
      <Link
        to={`/trips/${trip.id}`}
        className="trips-panel__row-link"
        aria-label={tripRowAccessibleName(trip.name, trip.startDate, trip.endDate, trackCount, trip.cairnCount)}
        onFocus={() => onHover(trip.id)}
        onBlur={() => onHover(null)}
      >
        <span className="trips-panel__row-name" title={trip.name}>
          {trip.name}
        </span>
        <span className="trips-panel__row-detail">
          {formatTripMetaLine(trip.startDate, trip.endDate, trackCount, trip.cairnCount)}
        </span>
      </Link>
      <RowMenu
        label={`Actions for ${trip.name}`}
        actions={[{ label: 'Delete trip…', danger: true, disabled, onSelect: onStartConfirm }]}
      />
    </li>
  )
}

function LooseRow({
  item,
  disabled,
  emphasized,
  onHover,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  onAddToTrip,
  onDelete,
  onRename,
  onRecolor,
  onSaveError,
  onExport,
  exporting,
}: {
  item: LooseRecord
  disabled: boolean
  emphasized: boolean
  onHover: (id: string | null) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLLIElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  onAddToTrip: () => void
  onDelete: () => void
  onRename: (id: string, name: string) => Promise<boolean>
  onRecolor: (id: string, color: number) => Promise<boolean>
  onSaveError: (message: string | null) => void
  onExport: () => void
  exporting: boolean
}) {
  const [editingName, setEditingName] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  async function commitName(value: string) {
    setEditingName(false)
    const trimmed = value.trim()
    // Empty commit is an aborted edit, not a saved one.
    if (trimmed.length === 0) return
    if (await onRename(item.id, trimmed)) onSaveError(null)
    else onSaveError(`Couldn't rename ${item.name} — try again.`)
  }

  async function selectColor(index: number) {
    setColorPickerOpen(false)
    if (await onRecolor(item.id, index)) onSaveError(null)
    else onSaveError("Couldn't save the colour — try again.")
  }

  if (confirming) {
    return (
      <RowConfirm
        name={item.name}
        rowRef={confirmingRowRef}
        onDelete={onDelete}
        onCancel={onCancelConfirm}
      />
    )
  }

  const canEdit = canChangeOwner(item)

  // #133 — replaces the row's contents in place, the same shape the
  // confirm above already takes: no dialog, no second surface.
  if (editingName) {
    return (
      <li className="trips-panel__row">
        {item.kind === 'track' ? (
          <span
            className="trips-panel__row-tile"
            style={{ background: trackColor(item.colorIndex) }}
            aria-hidden="true"
          />
        ) : (
          <span className="trips-panel__row-photo" aria-hidden="true" />
        )}
        <NameInput initial={item.name} onCommit={commitName} onCancel={() => setEditingName(false)} />
      </li>
    )
  }

  /* The meta line takes `--danger` for the two things it can be alarming
     about: a photo that cannot be placed (#110), and a file that is not on
     Drive (#120). An item still uploading is neither — it says so plainly
     and in `--text-muted`, because nothing has gone wrong yet. */
  const uploading = item.uploadState === 'uploading'
  const unplaced = !uploading && (item.uploadState === 'failed' || item.position === null)
  const href = item.kind === 'track' ? `/tracks/${item.id}` : `/photos/${item.id}`

  return (
    <li
      className={`trips-panel__row${emphasized ? ' trips-panel__row--emphasized' : ''}`}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* The row's glyph is the marker, drawn smaller — a thing spotted on
          the map and the same thing in the list have to read as one
          object, so the shape and colour match exactly. */}
      {item.kind === 'track' ? (
        <span
          className="trips-panel__row-tile"
          style={{ background: trackColor(item.colorIndex) }}
          aria-hidden="true"
        />
      ) : (
        <span className="trips-panel__row-photo" aria-hidden="true" />
      )}
      <Link
        to={href}
        className="trips-panel__row-link"
        onFocus={() => onHover(item.id)}
        onBlur={() => onHover(null)}
      >
        <span className="trips-panel__row-name" title={item.name}>
          {item.name}
        </span>
        <span
          className={`trips-panel__row-detail${unplaced ? ' trips-panel__row-detail--unplaced' : ''}`}
        >
          {looseMetaLine(item, shortDate)}
        </span>
      </Link>
      {/* #133 — its own positioned wrapper so the colour popover can anchor
          under the `⋮`, the way `AddToTripPicker` anchors inside the panel
          rather than floating free. */}
      <span className="trips-panel__row-actions">
        <RowMenu
          label={`Actions for ${item.name}`}
          actions={[
            {
              // #120: nothing to move until the file is on Drive.
              label: 'Add to a trip…',
              disabled: disabled || !canEdit,
              onSelect: onAddToTrip,
            },
            {
              label: 'Rename',
              disabled: disabled || !canEdit,
              onSelect: () => setEditingName(true),
            },
            ...(item.kind === 'track'
              ? [
                  {
                    label: 'Change colour',
                    disabled: disabled || !canEdit,
                    onSelect: () => setColorPickerOpen(true),
                  },
                ]
              : []),
            ...(showExport(item)
              ? [
                  {
                    label: 'Export',
                    disabled: disabled || !canEdit || exporting,
                    onSelect: onExport,
                  },
                ]
              : []),
            { label: 'Delete…', danger: true, disabled, onSelect: onStartConfirm },
          ]}
        />
        {colorPickerOpen && item.kind === 'track' && (
          <ColorPopover
            name={item.name}
            currentColorIndex={item.colorIndex % TRACK_COLORS.length}
            align="right"
            onSelect={selectColor}
            onClose={() => setColorPickerOpen(false)}
          />
        )}
      </span>
    </li>
  )
}
