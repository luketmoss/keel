import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import type { TripIndexEntry } from '../store/tripStore'
import './TripList.css'

interface TripListProps {
  trips: TripIndexEntry[]
  onCreate: (name: string) => void
  onDelete: (id: string) => void
}

export function TripList({ trips, onCreate, onDelete }: TripListProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Only one row's delete confirmation is open at a time.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmingRowRef = useRef<HTMLLIElement | null>(null)

  // Escape or a click anywhere outside the confirming row reverts it
  // without deleting.
  useEffect(() => {
    if (confirmingId === null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setConfirmingId(null)
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        confirmingRowRef.current &&
        !confirmingRowRef.current.contains(event.target as Node)
      ) {
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
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('A trip needs a name.')
      return
    }
    onCreate(trimmed)
    setName('')
    setError(null)
  }

  return (
    <div className="trip-list-view">
      <h2 className="trip-list-view__heading">Trips</h2>
      <form className="trip-create" onSubmit={handleSubmit}>
        <div className="trip-create__row">
          <input
            type="text"
            className={`trip-create__input${error ? ' trip-create__input--invalid' : ''}`}
            placeholder="Trip name"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
          />
          <button
            type="submit"
            className="trip-create__submit"
            disabled={name.trim().length === 0}
          >
            Create
          </button>
        </div>
        {error && <p className="trip-create__error">{error}</p>}
      </form>

      {trips.length === 0 ? (
        <div className="trip-list--empty">
          <p className="trip-list__empty-title">No trips yet</p>
          <p className="trip-list__empty-detail">
            Create one above to start organizing your tracks.
          </p>
        </div>
      ) : (
        <ul className="trip-list">
          {trips.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
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

function TripRow({
  trip,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  onDelete,
}: {
  trip: TripIndexEntry
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLLIElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  onDelete: () => void
}) {
  if (confirming) {
    return (
      <li className="trip-row" ref={confirmingRowRef}>
        <div className="trip-row__confirm">
          <span className="trip-row__confirm-text">Delete &quot;{trip.name}&quot;?</span>
          <div className="trip-row__confirm-actions">
            <button type="button" className="trip-row__confirm-delete" onClick={onDelete}>
              Delete
            </button>
            <button type="button" className="trip-row__confirm-cancel" onClick={onCancelConfirm}>
              Cancel
            </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="trip-row">
      <Link to={`/trips/${trip.id}`} className="trip-row__link">
        <div className="trip-row__main">
          <span className="trip-row__name" title={trip.name}>
            {trip.name}
          </span>
          <span className={`trip-row__status trip-row__status--${trip.status}`}>
            {trip.status}
          </span>
        </div>
        <span className="trip-row__dates">No dates set</span>
      </Link>
      <button
        type="button"
        className="trip-row__remove"
        aria-label={`Delete ${trip.name}`}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          onStartConfirm()
        }}
      >
        ×
      </button>
    </li>
  )
}
