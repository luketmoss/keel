import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { deriveTripStatus, type TripRecord, type TripUpdate } from '../store/tripStore'
import { formatTripDateRange } from '../format/dates'
import { DateRangeCalendar } from './DateRangeCalendar'
import './TripMetadataHeader.css'

type Field = 'name' | 'dates' | 'notes'

interface TripMetadataHeaderProps {
  trip: TripRecord
  onUpdate: (patch: TripUpdate) => Promise<TripRecord | null>
  /** #73: true while the store holds no usable token — never signed in
      this session, signed out, or #72's token-expired, all treated
      identically. Every field goes to the language's Disabled treatment
      (`opacity: 0.4`, no hover response) instead of staying editable and
      either failing against a dead token or silently "succeeding" locally
      with nothing to sync it once a connection exists. */
  disabled?: boolean
}

/** The editable trip header above the file list — name, dates, and notes,
    each independently click-to-edit, plus a status pill that isn't (#147:
    derived from the dates, not stored). Local-only for now: `onUpdate`
    writes through the `TripStore` interface, whatever backs it — see
    cairn's `CLAUDE.md` on storage sitting behind one interface even while
    the only implementation is local. */
export function TripMetadataHeader({ trip, onUpdate, disabled = false }: TripMetadataHeaderProps) {
  const [editing, setEditing] = useState<Field | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedField, setSavedField] = useState<Field | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => clearTimeout(savedTimeoutRef.current)
  }, [])

  function flashSaved(field: Field) {
    setSavedField(field)
    clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSavedField(null), 300)
  }

  async function commit(field: Field, patch: TripUpdate) {
    setEditing(null)
    const result = await onUpdate(patch)
    if (result === null) {
      setError(`Couldn't save — ${field} reverted.`)
      return
    }
    setError(null)
    flashSaved(field)
  }

  function startEditing(field: Field) {
    // #73: disconnected is read-only — editing doesn't even start, rather
    // than opening an input over a store that will refuse the write. Same
    // "control that would fail if used" rule as the import button.
    if (disabled) return
    // Starting a second edit commits/discards the first rather than
    // stacking two inputs open at once.
    setEditing(field)
  }

  const status = deriveTripStatus(trip.startDate, trip.endDate)

  return (
    <div className="trip-metadata">
      {/* #73: the Disabled treatment (opacity/pointer-events) lives on this
          inner wrapper rather than the outer container, so the hint below
          — the explanation the user actually needs to read while
          disabled — isn't dimmed along with the fields it explains. */}
      <div className={`trip-metadata__fields${disabled ? ' trip-metadata__fields--disabled' : ''}`}>
        {editing === 'name' ? (
          <NameEditor
            initial={trip.name}
            onCommit={(name) => {
              if (name.trim().length === 0) {
                setEditing(null)
                return
              }
              commit('name', { name })
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <h1
            className="trip-metadata__name"
            title={trip.name}
            onClick={() => startEditing('name')}
          >
            {trip.name}
          </h1>
        )}

        <div className="trip-metadata__row">
          {/* #147: derived from the dates, not editable — see
              `deriveTripStatus`. A label, not a control: no click handler,
              no hover or pressed state. */}
          <span className={`trip-metadata__status trip-metadata__status--${status}`} title="Set by the trip's dates">
            {status}
          </span>

          <span
            className={`trip-metadata__dates${
              savedField === 'dates' ? ' trip-metadata__field--saved' : ''
            }${!trip.startDate && !trip.endDate ? ' trip-metadata__dates--empty' : ''}`}
            onClick={() => startEditing('dates')}
          >
            {/* A trip with no dates gets a control that says what it is
                for. The shared range formatter is what the list rows read,
                and "No dates set" is right there — but on a line whose only
                job is to be clicked, it describes rather than invites. */}
            {trip.startDate || trip.endDate
              ? formatTripDateRange(trip.startDate, trip.endDate)
              : 'Add dates'}
          </span>
        </div>

        {/* Below the row rather than inside it: the calendar is as wide as
            the panel, and a row that also holds the status pill has nowhere
            to put it. */}
        {editing === 'dates' && (
          <DateRangeCalendar
            start={trip.startDate}
            end={trip.endDate}
            onCommit={(startDate, endDate) => commit('dates', { startDate, endDate })}
            onCancel={() => setEditing(null)}
          />
        )}

        {editing === 'notes' ? (
          <NotesEditor
            initial={trip.notes}
            onCommit={(notes) => commit('notes', { notes })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <NotesDisplay
            notes={trip.notes}
            saved={savedField === 'notes'}
            onClick={() => startEditing('notes')}
          />
        )}

        {error && <p className="trip-metadata__error">{error}</p>}
      </div>
      {/* #73: one explanation for the whole surface, not a tooltip per
          disabled field (design doc: "The language's Disabled treatment is
          the signal; one sentence per surface is the explanation"). */}
      {disabled && <p className="trip-metadata__disabled-hint">Sign in to edit this trip.</p>}
    </div>
  )
}

function NameEditor({
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
      className="trip-metadata__name-input"
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

function NotesEditor({
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
    <div className="trip-metadata__notes-editor">
      <textarea
        autoFocus
        className="trip-metadata__notes-input"
        placeholder="Add notes"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          // Enter is a real newline in notes (#35), so it can't be the
          // commit key it is in the name field. Ctrl/Cmd+Enter is the one
          // that saves without leaving the keyboard — and the hint below
          // is what tells anyone that, since a textarea whose only exits
          // are "click away" (saves) and Escape (discards) reads as a
          // field that doesn't save at all when you take the wrong one.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onCommit(value)
            return
          }
          if (event.key === 'Escape') onCancel()
        }}
      />
      <p className="trip-metadata__notes-hint">Click away or Ctrl/⌘ + Enter to save · Esc to discard</p>
    </div>
  )
}

function NotesDisplay({
  notes,
  saved,
  onClick,
}: {
  notes: string
  saved: boolean
  onClick: () => void
}) {
  const trimmed = notes.trim()
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const paragraphRef = useRef<HTMLParagraphElement>(null)

  // A committed edit may be a different length entirely, so the note goes
  // back to its clamped state and re-measures against the new text rather
  // than staying expanded against content the user hasn't seen clamped.
  useEffect(() => {
    setExpanded(false)
  }, [notes])

  // "Show more" reflects actual overflow, not a guess from length — measured
  // against the clamped paragraph and re-measured on resize, since the
  // sidebar's width isn't fixed. While expanded there's no clamp applied, so
  // measuring would only ever say "not clamped"; the collapse path
  // re-measures instead.
  useLayoutEffect(() => {
    const element = paragraphRef.current
    if (!element || trimmed.length === 0 || expanded) return

    function measure() {
      if (!element) return
      setClamped(element.scrollHeight > element.clientHeight)
    }

    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [trimmed, expanded])

  if (trimmed.length === 0) {
    // A trip with no notes used to render an empty paragraph with nothing
    // but a min-height in it — the field existed, but the only way to find
    // it was to click the blank gap under the dates. It now says what it
    // is for, exactly the way the empty date line does a few lines up.
    return (
      <p className="trip-metadata__notes trip-metadata__notes--empty" onClick={onClick}>
        Add notes
      </p>
    )
  }
  return (
    <div className="trip-metadata__notes-wrap">
      <p
        ref={paragraphRef}
        className={`trip-metadata__notes${expanded ? '' : ' trip-metadata__notes--clamped'}${
          saved ? ' trip-metadata__field--saved' : ''
        }`}
        onClick={onClick}
      >
        {trimmed}
      </p>
      {clamped && (
        <button
          type="button"
          className="trip-metadata__show-more"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((value) => !value)
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
