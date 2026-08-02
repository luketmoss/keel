import { useEffect, useRef, useState } from 'react'
import type { TripRecord, TripStatus, TripUpdate } from '../store/tripStore'
import './TripMetadataHeader.css'

type Field = 'name' | 'status' | 'dates' | 'notes'

interface TripMetadataHeaderProps {
  trip: TripRecord
  onUpdate: (patch: TripUpdate) => TripRecord | null
}

function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return 'Planned — no dates set'
  const start = startDate ? formatDate(startDate) : '?'
  const end = endDate ? formatDate(endDate) : '?'
  return `${start} – ${end}`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** The editable trip header above the file list — name, status, dates, and
    notes, each independently click-to-edit. Local-only for now: `onUpdate`
    writes through the `TripStore` interface, whatever backs it — see
    cairn's `CLAUDE.md` on storage sitting behind one interface even while
    the only implementation is local. */
export function TripMetadataHeader({ trip, onUpdate }: TripMetadataHeaderProps) {
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

  function commit(field: Field, patch: TripUpdate) {
    setEditing(null)
    const result = onUpdate(patch)
    if (result === null) {
      setError(`Couldn't save — ${field} reverted.`)
      return
    }
    setError(null)
    flashSaved(field)
  }

  function startEditing(field: Field) {
    // Starting a second edit commits/discards the first rather than
    // stacking two inputs open at once.
    setEditing(field)
  }

  return (
    <div className="trip-metadata">
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
        {editing === 'status' ? (
          <StatusEditor
            initial={trip.status}
            onCommit={(status) => commit('status', { status })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button
            type="button"
            className={`trip-metadata__status trip-metadata__status--${trip.status}${
              savedField === 'status' ? ' trip-metadata__field--saved' : ''
            }`}
            onClick={() => startEditing('status')}
          >
            {trip.status}
          </button>
        )}

        {editing === 'dates' ? (
          <DatesEditor
            initialStart={trip.startDate}
            initialEnd={trip.endDate}
            onCommit={(startDate, endDate) => commit('dates', { startDate, endDate })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <span
            className={`trip-metadata__dates${
              savedField === 'dates' ? ' trip-metadata__field--saved' : ''
            }`}
            onClick={() => startEditing('dates')}
          >
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
        )}
      </div>

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

function StatusEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: TripStatus
  onCommit: (value: TripStatus) => void
  onCancel: () => void
}) {
  return (
    <select
      autoFocus
      className="trip-metadata__status-input"
      defaultValue={initial}
      onChange={(event) => onCommit(event.target.value as TripStatus)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <option value="planned">planned</option>
      <option value="completed">completed</option>
    </select>
  )
}

function DatesEditor({
  initialStart,
  initialEnd,
  onCommit,
  onCancel,
}: {
  initialStart: string | null
  initialEnd: string | null
  onCommit: (startDate: string | null, endDate: string | null) => void
  onCancel: () => void
}) {
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState(initialEnd ?? '')

  function commit() {
    onCommit(start || null, end || null)
  }

  return (
    <span className="trip-metadata__dates-input">
      <input
        autoFocus
        type="date"
        value={start}
        onChange={(event) => setStart(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') onCancel()
        }}
      />
      <input
        type="date"
        value={end}
        onChange={(event) => setEnd(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') onCancel()
        }}
      />
    </span>
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
    <textarea
      autoFocus
      className="trip-metadata__notes-input"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        // Enter is a real newline in notes — only Escape has a shortcut
        // meaning here.
        if (event.key === 'Escape') onCancel()
      }}
    />
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
  if (trimmed.length === 0) {
    return <p className="trip-metadata__notes trip-metadata__notes--empty" onClick={onClick} />
  }
  return (
    <div className="trip-metadata__notes-wrap">
      <p
        className={`trip-metadata__notes${expanded ? '' : ' trip-metadata__notes--clamped'}${
          saved ? ' trip-metadata__field--saved' : ''
        }`}
        onClick={onClick}
      >
        {trimmed}
      </p>
      {!expanded && trimmed.length > 0 && (
        <button
          type="button"
          className="trip-metadata__show-more"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded(true)
          }}
        >
          Show more
        </button>
      )}
    </div>
  )
}
