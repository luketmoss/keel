import { useEffect, useRef, useState } from 'react'
import type { TripIndexEntry } from '../store/tripStore'
import './AddToTripPicker.css'

export interface TripChoice {
  entry: TripIndexEntry
  /** A trip's contents are what make it the right or wrong destination, so
      the picker counts them rather than listing names alone. */
  trackCount: number
  /** `null` when nobody has counted this trip's photos yet (#121) — a
      different fact from `0`, and the picker says so by showing no photo
      count at all rather than a confident zero. */
  photoCount: number | null
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

/** What the counts say out loud. `4T · 128P` is decorative shorthand whose
    meaning is not recoverable when read aloud, so each option's accessible
    name spells it out instead. */
export function tripChoiceLabel(choice: TripChoice): string {
  const parts = [choice.entry.name, plural(choice.trackCount, 'track')]
  if (choice.photoCount !== null) {
    parts.push(choice.photoCount === 0 ? 'no photos' : plural(choice.photoCount, 'photo'))
  }
  return parts.join(', ')
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
          {trips.map((choice) => (
            <li key={choice.entry.id}>
              <button
                type="button"
                className="add-to-trip__option"
                disabled={busy}
                aria-label={tripChoiceLabel(choice)}
                onClick={() => onChoose(choice.entry.id)}
              >
                <span
                  className={`add-to-trip__dot add-to-trip__dot--${choice.entry.status}`}
                  aria-hidden="true"
                />
                <span className="add-to-trip__name">{choice.entry.name}</span>
                {/* The photo half is omitted, not filled with a placeholder.
                    `0P` is the bug; `—P` and `?P` both spend a glyph telling
                    the user about the app's bookkeeping, which is neither
                    something they asked about nor something they can act on.
                    It stops being shorter the first time the trip is opened. */}
                <span className="add-to-trip__counts">
                  {choice.trackCount}T
                  {choice.photoCount !== null && ` · ${choice.photoCount}P`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
