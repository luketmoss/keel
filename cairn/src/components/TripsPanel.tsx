import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import type { TripIndexEntry } from '../store/tripStore'
import { matchesTripFilters, type TripFilters } from '../store/tripFilters'
import { formatTripDateRange } from '../format/dates'
import { looseMetaLine, type LooseRecord } from '../store/looseStore'
import { LIST_HEADINGS, type KindFilter } from './FilterChips'
import { RowMenu } from './RowMenu'
import { trackColor } from '../map/palette'
import './TripsPanel.css'

function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

interface TripsPanelProps {
  trips: TripIndexEntry[]
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
  onSetStatus: (id: string, status: TripIndexEntry['status']) => void
  onDeleteLoose: (id: string) => void
  onAddLooseToTrip: (id: string) => void
  /** #73: no usable token — creating, moving or deleting go to the
      language's Disabled treatment. Reading is unaffected. */
  disabled: boolean
}

/** The panel's list face: trips, loose tracks and loose photos in one list,
    narrowed by the chip row above it. */
export function TripsPanel({
  trips,
  looseItems,
  kind,
  filters,
  onFiltersChange,
  dateSpan,
  hoveredId,
  onHover,
  onCreate,
  onDelete,
  onSetStatus,
  onDeleteLoose,
  onAddLooseToTrip,
  disabled,
}: TripsPanelProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
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
    if (kind === 'photos' && item.kind !== 'photo') return false
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
              disabled={disabled}
              emphasized={hoveredId === trip.id}
              onHover={onHover}
              confirming={confirmingId === trip.id}
              confirmingRowRef={confirmingId === trip.id ? confirmingRowRef : undefined}
              onStartConfirm={() => setConfirmingId(trip.id)}
              onCancelConfirm={() => setConfirmingId(null)}
              onSetStatus={(status) => onSetStatus(trip.id, status)}
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
            />
          ))}
        </ul>
      )}
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
  disabled,
  emphasized,
  onHover,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  onSetStatus,
  onDelete,
}: {
  trip: TripIndexEntry
  disabled: boolean
  emphasized: boolean
  onHover: (id: string | null) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLLIElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  onSetStatus: (status: TripIndexEntry['status']) => void
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

  const nextStatus = trip.status === 'completed' ? 'planned' : 'completed'

  return (
    <li
      className={`trips-panel__row${emphasized ? ' trips-panel__row--emphasized' : ''}`}
      onMouseEnter={() => onHover(trip.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className={`trips-panel__row-dot trips-panel__row-dot--${trip.status}`} aria-hidden="true" />
      <Link
        to={`/trips/${trip.id}`}
        className="trips-panel__row-link"
        onFocus={() => onHover(trip.id)}
        onBlur={() => onHover(null)}
      >
        <span className="trips-panel__row-name" title={trip.name}>
          {trip.name}
        </span>
        <span className="trips-panel__row-detail">
          {formatTripDateRange(trip.startDate, trip.endDate)} · {trip.status}
        </span>
      </Link>
      <RowMenu
        label={`Actions for ${trip.name}`}
        actions={[
          {
            label: nextStatus === 'completed' ? 'Mark as completed' : 'Mark as planned',
            disabled,
            onSelect: () => onSetStatus(nextStatus),
          },
          { label: 'Delete trip…', danger: true, disabled, onSelect: onStartConfirm },
        ]}
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
}) {
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

  const unplaced = item.position === null
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
      <RowMenu
        label={`Actions for ${item.name}`}
        actions={[
          { label: 'Add to a trip…', disabled, onSelect: onAddToTrip },
          { label: 'Delete…', danger: true, disabled, onSelect: onStartConfirm },
        ]}
      />
    </li>
  )
}
