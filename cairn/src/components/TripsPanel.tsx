import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { TripIndexEntry } from '../store/tripStore'
import { matchesTripFilters, type StatusFilter, type TripFilters } from '../store/tripFilters'
import { formatTripDateRange } from '../format/dates'
import './TripsPanel.css'

/** Scroll position survives a visit to a trip and back — `/trips/:id` is
    still its own top-level route (see `App.tsx`) and unmounts everything
    above it, including this panel, so a plain `ref` wouldn't survive the
    round trip. Module-level for the same reason `WorldMap`'s camera
    snapshot is. */
let lastScrollTop = 0

interface TripsPanelProps {
  trips: TripIndexEntry[]
  filters: TripFilters
  onFiltersChange: (filters: TripFilters) => void
  hoveredTripId: string | null
  onHoverTrip: (tripId: string | null) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  /** #73: no usable token — creating or deleting a trip goes to the
      language's Disabled treatment. Reading (opening a trip) is
      unaffected. */
  disabled: boolean
}

/** `/trips` (#80): a left-docked panel over the still-mounted, still-live
    world map — replaces the full-page list #33 built. Filters here and the
    map's dots are driven by the same `filters` state and the same
    `matchesTripFilters` predicate (`../store/tripFilters`), which is what
    guarantees the two can never disagree. */
export function TripsPanel({
  trips,
  filters,
  onFiltersChange,
  hoveredTripId,
  onHoverTrip,
  onCreate,
  onDelete,
  disabled,
}: TripsPanelProps) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmingRowRef = useRef<HTMLLIElement | null>(null)
  const scrollRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = lastScrollTop
  }, [])

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

  function handleNameChange(value: string) {
    setName(value)
    if (error !== null && value.trim().length > 0) setError(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('A trip needs a name.')
      return
    }
    onCreate(trimmed)
    setName('')
    setError(null)
  }

  const visibleTrips = trips.filter((trip) => matchesTripFilters(trip, filters))
  const filteredEmpty = trips.length > 0 && visibleTrips.length === 0

  // Resets name, status and date at once (design doc: "the alternative is
  // hunting three controls to find which one did it"). `range: null` asks
  // the map to refill it back to the full span — this panel doesn't know
  // what that span is.
  function clearFilters() {
    onFiltersChange({ ...filters, status: 'all', name: '', range: null })
  }

  return (
    <div className="trips-panel">
      <div className="trips-panel__header">
        <div className="trips-panel__title-row">
          <h2 className="trips-panel__heading">Trips</h2>
          <button
            type="button"
            className="trips-panel__close"
            aria-label="Close trips"
            onClick={() => navigate('/')}
          >
            ×
          </button>
        </div>
        <form className="trips-panel__create" onSubmit={handleSubmit}>
          <div className="trips-panel__create-row">
            <input
              type="text"
              className={`trips-panel__create-input${error ? ' trips-panel__create-input--invalid' : ''}`}
              placeholder="Trip name"
              value={name}
              disabled={disabled}
              onChange={(event) => handleNameChange(event.target.value)}
            />
            <button
              type="submit"
              className="trips-panel__create-submit"
              disabled={disabled || name.trim().length === 0}
            >
              Create
            </button>
          </div>
          {error && <p className="trips-panel__create-error">{error}</p>}
          {disabled && <p className="trips-panel__create-disabled-hint">Sign in to add or remove trips.</p>}
        </form>
        {trips.length > 0 && (
          <>
            <div className="trips-panel__filter-name">
              <span className="trips-panel__filter-name-glyph" aria-hidden="true">
                ⌕
              </span>
              <input
                type="text"
                className="trips-panel__filter-name-input"
                placeholder="Filter trips"
                aria-label="Filter trips"
                value={filters.name}
                onChange={(event) => onFiltersChange({ ...filters, name: event.target.value })}
              />
              {filters.name && (
                <button
                  type="button"
                  className="trips-panel__filter-name-clear"
                  aria-label="Clear name filter"
                  onClick={() => onFiltersChange({ ...filters, name: '' })}
                >
                  ✕
                </button>
              )}
            </div>
            <StatusPillRow
              status={filters.status}
              onChange={(status) => onFiltersChange({ ...filters, status })}
            />
          </>
        )}
      </div>

      {trips.length === 0 ? (
        <div className="trips-panel__empty">
          {disabled ? (
            // #95: `trips` is always empty while disconnected (App.tsx
            // withholds it, not just this panel) — "No trips yet" would be
            // a lie for an account that actually has some, just hidden
            // until sign-in.
            <p className="trips-panel__empty-title">Sign in to see your trips.</p>
          ) : (
            <>
              <p className="trips-panel__empty-title">No trips yet</p>
              <p className="trips-panel__empty-detail">Drop a KML anywhere to start one.</p>
            </>
          )}
        </div>
      ) : filteredEmpty ? (
        <div className="trips-panel__empty">
          <p className="trips-panel__empty-title">No trips match</p>
          <button type="button" className="trips-panel__clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul
          className="trips-panel__list"
          ref={scrollRef}
          onScroll={(event) => {
            lastScrollTop = event.currentTarget.scrollTop
          }}
        >
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

function StatusPillRow({
  status,
  onChange,
}: {
  status: StatusFilter
  onChange: (status: StatusFilter) => void
}) {
  const segments: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'planned', label: 'Planned' },
    { value: 'completed', label: 'Completed' },
  ]

  return (
    <div className="trips-panel__status-pills">
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          className={`trips-panel__status-pill${status === segment.value ? ' trips-panel__status-pill--active' : ''}`}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
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

  return (
    <li
      className={`trips-panel__row${emphasized ? ' trips-panel__row--emphasized' : ''}`}
      onMouseEnter={() => onHover(trip.id)}
      onMouseLeave={() => onHover(null)}
    >
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
      <button
        type="button"
        className="trips-panel__row-remove"
        aria-label={`Delete ${trip.name}`}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          if (disabled) return
          onStartConfirm()
        }}
      >
        ×
      </button>
    </li>
  )
}
