import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import type { TripIndexEntry } from '../store/tripStore'
import { matchesTripFilters, type TripFilters } from '../store/tripFilters'
import { formatTripDateRange } from '../format/dates'
import { RowMenu } from './RowMenu'
import './TripsPanel.css'

interface TripsPanelProps {
  trips: TripIndexEntry[]
  filters: TripFilters
  onFiltersChange: (filters: TripFilters) => void
  /** The span every trip falls inside, or `null` when there is nothing to
      range over. Computed by the shell rather than here so the filter stays
      coherent while a detail face is showing and this component is not
      mounted at all. */
  dateSpan: { min: number; max: number } | null
  hoveredTripId: string | null
  onHoverTrip: (tripId: string | null) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onSetStatus: (id: string, status: TripIndexEntry['status']) => void
  /** #73: no usable token — creating or deleting a trip goes to the
      language's Disabled treatment. Reading (opening a trip) is
      unaffected. */
  disabled: boolean
}

/** The panel's list face. Scroll position and filters survive opening a trip
    because this component is swapped for the trip face inside one mounted
    panel — `/trips/:id` is no longer a top-level route that unmounts
    everything above it, so #80's module-level scroll snapshot is gone. */
export function TripsPanel({
  trips,
  filters,
  onFiltersChange,
  dateSpan,
  hoveredTripId,
  onHoverTrip,
  onCreate,
  onDelete,
  onSetStatus,
  disabled,
}: TripsPanelProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
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

  const visibleTrips = trips.filter((trip) => matchesTripFilters(trip, filters))
  const filteredEmpty = trips.length > 0 && visibleTrips.length === 0

  // Resets name, status and date at once (design doc: "the alternative is
  // hunting three controls to find which one did it"). `range: null` asks
  // the shell to refill it back to the full span.
  function clearFilters() {
    onFiltersChange({ ...filters, status: 'all', name: '', range: null })
  }

  return (
    <div className="trips-panel">
      <div className="trips-panel__header">
        <div className="trips-panel__title-row">
          {/* The header always names what you are looking at — one title
              today, one per chip once #110 gives the chips kinds. */}
          <h2 className="trips-panel__heading">Everything</h2>
          <span className="trips-panel__count">{visibleTrips.length}</span>
          <button
            type="button"
            className="trips-panel__new"
            disabled={disabled}
            onClick={() => setRenamingId('new')}
          >
            New trip
          </button>
        </div>
        {renamingId === 'new' && (
          <NewTripField
            onCancel={() => setRenamingId(null)}
            onCreate={(name) => {
              onCreate(name)
              setRenamingId(null)
            }}
          />
        )}
        {disabled && <p className="trips-panel__hint">Sign in to add or remove trips.</p>}
        {/* The year range lives here now, under the header: it is a property
            of the list, not of the map. #79's floating bottom-centre bar is
            gone. */}
        {dateSpan && dateSpan.min !== dateSpan.max && filters.range && (
          <YearRange
            min={dateSpan.min}
            max={dateSpan.max}
            value={filters.range}
            onChange={(range) => onFiltersChange({ ...filters, range })}
          />
        )}
      </div>

      {trips.length === 0 ? (
        <div className="trips-panel__empty">
          {disabled ? (
            // #95: `trips` is always empty while disconnected (App.tsx
            // withholds it, not just this panel) — "Nothing here yet" would
            // be a lie for an account that actually has some, just hidden
            // until sign-in. The wording is "your map" rather than "your
            // trips" because the panel stops being only trips in #110, and
            // changing the string twice is worse than changing it once.
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
              emphasized={hoveredTripId === trip.id}
              onHover={onHoverTrip}
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

/** #79's two-thumb range, moved out of the floating bottom-centre bar and
    into the list header where it belongs. Same inputs, same semantics; only
    its home and its label changed. */
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
  onHover: (tripId: string | null) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLLIElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  onSetStatus: (status: TripIndexEntry['status']) => void
  onDelete: () => void
}) {
  if (confirming) {
    return (
      <li className="trips-panel__row" ref={confirmingRowRef}>
        <div className="trips-panel__row-confirm">
          <span className="trips-panel__row-confirm-text">Delete &quot;{trip.name}&quot;?</span>
          <div className="trips-panel__row-confirm-actions">
            <button type="button" className="trips-panel__row-confirm-delete" onClick={onDelete}>
              Delete
            </button>
            <button type="button" className="trips-panel__row-confirm-cancel" onClick={onCancelConfirm}>
              Cancel
            </button>
          </div>
        </div>
      </li>
    )
  }

  const nextStatus = trip.status === 'completed' ? 'planned' : 'completed'

  return (
    <li
      className={`trips-panel__row${emphasized ? ' trips-panel__row--emphasized' : ''}`}
      onMouseEnter={() => onHover(trip.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* The row's glyph is the marker, drawn smaller — a thing spotted on
          the map and the same thing in the list have to read as one object. */}
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
