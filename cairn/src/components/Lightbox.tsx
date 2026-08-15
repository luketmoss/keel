import { useEffect, useRef } from 'react'
import { cairnRowMetaLine, type CairnListRow } from '../photo/cairnListGroups'
import { positionSourceSentence, type CairnIcon } from '../store/looseStore'
import { usePhotoImage } from '../photo/usePhotoImage'
import { IconPicker } from './IconPicker'
import './Lightbox.css'

interface LightboxProps {
  row: CairnListRow
  /** The list's full displayed order (design doc: "← and → move through
      the list in its displayed order") — used to find prev/next and
      whether either end is a boundary. */
  rows: CairnListRow[]
  /** Free text, and the sentence explaining where its position came from
      (`cairns.md`'s "positionSource" table) — the parts of the detail
      face (`155-cairns-replace-photos.md`) this issue folds into the
      lightbox rather than a separate non-modal surface, since a trip's
      panel body has nowhere else to put one. */
  description: string
  accessToken: string | null
  onClose: () => void
  /** Selects and opens `cairnId` in one step — arrow keys are the only way
      to change cairn while the lightbox is open (design doc edge case:
      "Selecting a row while the lightbox is open" can't happen from the
      list because the lightbox traps focus). */
  onNavigate: (cairnId: string) => void
  /** #132's `Remove from trip`, the detail face's primary action when the
      cairn is owned (`cairns.md`'s detail-face table). `undefined` when
      the caller has nowhere to put a detached cairn. */
  onRemoveFromTrip?: () => void
  /** #156's retype, on the surface #169 made this cairn's detail face.
      Writes `icon` and nothing else. `undefined` while there is no
      connection to write through, which takes the grid to Disabled rather
      than hiding it. */
  onSetIcon?: (icon: CairnIcon | null) => void
  /** The element focus returns to on close — the row's button or the
      marker's hit-target div, whichever opened this (criterion 9). Read
      once on mount; TripDetail captures it at open time via
      `document.activeElement`. */
  returnFocusRef: React.RefObject<HTMLElement | null>
}

/** Full-size photo viewer (#55) — elevation L2 exactly as #49 reclassified
    it (`--surface`, `--radius-md`, `backdrop-filter: blur(var(--blur))`,
    `--shadow-lifted`, no border) over a `--scrim` backdrop, following
    `DropOverlay`'s precedent for this app's other full-viewport overlay.
    Not full-bleed — the map stays visible at the margins (design doc's
    "The lightbox" section).

    #169 extends this into the trip-scoped cairn's detail face — its meta
    line, description and position-source sentence, alongside the image it
    already showed — rather than building a second, non-modal surface a
    trip's panel body has no slot for. A loose cairn's detail face stays
    `LooseFace`'s, unchanged. */
export function Lightbox({
  row,
  rows,
  description,
  accessToken,
  onClose,
  onNavigate,
  onRemoveFromTrip,
  onSetIcon,
  returnFocusRef,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const index = rows.findIndex((candidate) => candidate.id === row.id)
  const prevRow = index > 0 ? rows[index - 1] : undefined
  const nextRow = index >= 0 && index < rows.length - 1 ? rows[index + 1] : undefined

  // The thumbnail is already cached from the list (design doc's Loading
  // section) — shown scaled up and blurred as the frame's immediate
  // content, so the frame never resizes once the original lands.
  const thumbnail = usePhotoImage(accessToken, row.thumbnailDriveFileId ?? undefined)
  const original = usePhotoImage(accessToken, row.originalDriveFileId ?? undefined)

  // Criterion 10 / focus trap: Escape closes regardless of load state
  // (edge case: "Esc while the original is still loading closes
  // immediately"), arrows navigate without wrapping (design doc: "Arrows
  // do not wrap"). A document-level listener rather than relying on focus
  // staying put is what keeps Escape working even if a click landed
  // somewhere unexpected inside the dialog.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft') {
        if (prevRow) onNavigate(prevRow.id)
      } else if (event.key === 'ArrowRight') {
        if (nextRow) onNavigate(nextRow.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onNavigate, prevRow, nextRow])

  // Move focus in on open (criterion 9's other half) — the close button,
  // per the design doc's focus-management note.
  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  // Return focus to whatever opened this on unmount — never on a
  // navigate, since the component stays mounted across arrow presses and
  // only the `row` prop changes.
  useEffect(() => {
    return () => {
      returnFocusRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Manual focus trap (criterion 10) — cycles between the dialog's own few
  // focusable controls. Disabled boundary arrows are native `disabled`
  // buttons, so they're already out of the tab order without extra work
  // here.
  function handleTabTrap(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="lightbox" data-testid="lightbox">
      <div
        ref={dialogRef}
        className="lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={row.name}
        onKeyDown={handleTabTrap}
      >
        <button ref={closeButtonRef} type="button" className="lightbox__control lightbox__close" aria-label="Close photo" onClick={onClose}>
          ×
        </button>
        <button
          type="button"
          className="lightbox__control lightbox__prev"
          aria-label="Previous photo"
          disabled={!prevRow}
          onClick={() => prevRow && onNavigate(prevRow.id)}
        >
          ‹
        </button>
        <button
          type="button"
          className="lightbox__control lightbox__next"
          aria-label="Next photo"
          disabled={!nextRow}
          onClick={() => nextRow && onNavigate(nextRow.id)}
        >
          ›
        </button>
        <div className="lightbox__frame">
          {original.url ? (
            <img className="lightbox__image" src={original.url} alt={row.name} />
          ) : (
            <>
              {thumbnail.url && <img className="lightbox__placeholder" src={thumbnail.url} alt="" />}
              {original.failed && <p className="lightbox__error">Couldn't load this photo.</p>}
            </>
          )}
        </div>
        <h2 className="lightbox__name" title={row.name}>
          {row.name}
        </h2>
        <p className="lightbox__meta">{cairnRowMetaLine(row)}</p>
        <p className="lightbox__description">{description || 'No description.'}</p>
        <p className="lightbox__position">{positionSourceSentence(row.source)}</p>
        {/* #156 — the same grid the loose face and the create face show,
            under the same label. Retyping a photo as a campsite is the case
            this exists for: the marker stops being a thumbnail and becomes
            a pin with a camera badge, and the row's glyph follows it. */}
        <span className="lightbox__field-label">What is this place</span>
        <IconPicker
          label="What is this place"
          value={row.icon}
          onChange={(icon) => onSetIcon?.(icon)}
          disabled={!onSetIcon}
        />
        {onRemoveFromTrip && (
          <button type="button" className="lightbox__remove-from-trip" onClick={onRemoveFromTrip}>
            Remove from trip
          </button>
        )}
      </div>
    </div>
  )
}
