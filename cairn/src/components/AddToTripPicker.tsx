import { useEffect, useRef, useState } from 'react'
import type { TripIndexEntry } from '../store/tripStore'
import './AddToTripPicker.css'

export interface TripChoice {
  entry: TripIndexEntry
  /** A trip's contents are what make it the right or wrong destination, so
      the picker counts them rather than listing names alone. */
  trackCount: number
  photoCount: number
}

/** Choose an existing trip, or make one.
 *
 * Opens **inside the panel**, bounded by its width — never a floating menu
 * that can leave the column. Creating a trip and putting nothing in it is
 * not a state the user passes through: `New trip…` takes a name and moves
 * the item in one step. */
export function AddToTripPicker({
  trips,
  onChoose,
  onCreate,
  onCancel,
  busy,
  error,
}: {
  trips: TripChoice[]
  onChoose: (tripId: string) => void
  onCreate: (name: string) => void
  onCancel: () => void
  busy?: boolean
  error?: string | null
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (naming) inputRef.current?.focus()
  }, [naming])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  function create() {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameError('A trip needs a name.')
      return
    }
    onCreate(trimmed)
  }

  return (
    <div className="add-to-trip" ref={rootRef}>
      <div className="add-to-trip__head">
        <h3 className="add-to-trip__heading">Add to a trip</h3>
        <button type="button" className="add-to-trip__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {error && <p className="add-to-trip__error">{error}</p>}

      {naming ? (
        <div className="add-to-trip__create">
          <input
            ref={inputRef}
            type="text"
            className={`add-to-trip__input${nameError ? ' add-to-trip__input--invalid' : ''}`}
            placeholder="Name the new trip"
            aria-label="Name the new trip"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (nameError && event.target.value.trim()) setNameError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
              if (event.key === 'Escape') setNaming(false)
            }}
          />
          <button type="button" className="add-to-trip__confirm" disabled={busy} onClick={create}>
            Create
          </button>
          {nameError && <p className="add-to-trip__error">{nameError}</p>}
        </div>
      ) : (
        <ul className="add-to-trip__list">
          <li>
            <button
              type="button"
              className="add-to-trip__new"
              disabled={busy}
              onClick={() => setNaming(true)}
            >
              <span aria-hidden="true">＋</span> New trip…
            </button>
          </li>
          {trips.map(({ entry, trackCount, photoCount }) => (
            <li key={entry.id}>
              <button
                type="button"
                className="add-to-trip__option"
                disabled={busy}
                onClick={() => onChoose(entry.id)}
              >
                <span
                  className={`add-to-trip__dot add-to-trip__dot--${entry.status}`}
                  aria-hidden="true"
                />
                <span className="add-to-trip__name">{entry.name}</span>
                <span className="add-to-trip__counts">
                  {trackCount}T · {photoCount}P
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
