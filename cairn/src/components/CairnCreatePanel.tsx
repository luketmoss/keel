import { useEffect, useRef } from 'react'
import { IconPicker } from './IconPicker'
import type { CairnIcon } from '../store/looseStore'
import './CairnCreatePanel.css'

/** Everything the face holds that a re-place must not throw away.
 *
 * `156-creating-a-cairn.md`: "Right-click while the create face is open —
 * the existing draft is replaced by a pin at the new coordinate; typed
 * values are kept." That is why the position is *not* in here: the shell
 * owns it, and re-placing swaps it while this survives untouched. */
export interface CairnDraftFields {
  name: string
  icon: CairnIcon | null
  description: string
  date: string
}

interface CairnCreatePanelProps {
  fields: CairnDraftFields
  onChange: (fields: CairnDraftFields) => void
  /** The trip the gesture's context chose, or `null` for a loose cairn.
      The readout below states which before there is anything to undo. */
  tripId: string | null
  onCreate: () => void
  onCancel: () => void
  /** #73: `Create` takes the Disabled treatment with one sentence. The form
      still fills in — a draft that cannot be saved yet is not a draft that
      has to be retyped after signing in. */
  disabled?: boolean
  /** True while the save is in flight. */
  busy?: boolean
  error?: string | null
}

/** The create face — replaces the panel's list face while a cairn is being
    placed. The pin, the map gesture and the ownership decision all belong
    to the shell; this is the form over them. */
export function CairnCreatePanel({
  fields,
  onChange,
  tripId,
  onCreate,
  onCancel,
  disabled = false,
  busy = false,
  error,
}: CairnCreatePanelProps) {
  const nameRef = useRef<HTMLInputElement>(null)

  // "Just opened: … name empty and focused."
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Escape is equivalent to Cancel. On the document rather than the form,
  // so it still works when focus has landed on an icon cell or nowhere in
  // particular — the same reasoning `Lightbox` gives for its own listener.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  function set<K extends keyof CairnDraftFields>(key: K, value: CairnDraftFields[K]) {
    onChange({ ...fields, [key]: value })
  }

  return (
    <form
      className="cairn-create"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && !busy) onCreate()
      }}
    >
      <div className="cairn-create__body">
        <label className="cairn-create__label" htmlFor="cairn-create-name">
          Name
        </label>
        <input
          ref={nameRef}
          id="cairn-create-name"
          className="cairn-create__input"
          type="text"
          placeholder="Ellery Creek camp"
          value={fields.name}
          onChange={(event) => set('name', event.target.value)}
        />

        {/* A span, not a `<label>`: the control it names is a group of
            buttons rather than one form element, and `IconPicker` carries
            the same string as the group's own accessible name. */}
        <span className="cairn-create__label">What is this place</span>
        {/* Not disabled while disconnected, unlike the detail face's copy of
            this grid: "`Create` takes the Disabled treatment … The form
            still fills in." Nothing here has been written yet, so there is
            nothing for a missing connection to refuse — only the commit at
            the end of it. */}
        <IconPicker
          label="What is this place"
          value={fields.icon}
          onChange={(icon) => set('icon', icon)}
        />

        <label className="cairn-create__label" htmlFor="cairn-create-description">
          Description
        </label>
        <textarea
          id="cairn-create-description"
          className="cairn-create__input cairn-create__textarea"
          placeholder="Flat ground behind the ghost gums."
          rows={3}
          value={fields.description}
          onChange={(event) => set('description', event.target.value)}
        />

        <label className="cairn-create__label" htmlFor="cairn-create-date">
          Date
        </label>
        <input
          id="cairn-create-date"
          className="cairn-create__input"
          type="date"
          value={fields.date}
          onChange={(event) => set('date', event.target.value)}
        />

        {/* Not decoration. Ownership decided by context is the right
            default and a silent one is a trap, so the face says which it
            chose while there is still a Cancel button. */}
        <dl className="cairn-create__readout">
          <div className="cairn-create__readout-row">
            <dt>positionSource</dt>
            <dd>placed</dd>
          </div>
          <div className="cairn-create__readout-row">
            <dt>trip</dt>
            <dd>{tripId ?? 'null'}</dd>
          </div>
        </dl>
        <p className="cairn-create__ownership">
          {tripId ? '(a trip was open when you clicked)' : '(nothing was open — this will be loose)'}
        </p>

        {disabled && <p className="cairn-create__signed-out">Sign in to keep cairns.</p>}
        {error && <p className="cairn-create__error">{error}</p>}

        <div className="cairn-create__actions">
          <button type="submit" className="cairn-create__create" disabled={disabled || busy}>
            {busy ? 'Saving…' : 'Create'}
          </button>
          <button type="button" className="cairn-create__cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
