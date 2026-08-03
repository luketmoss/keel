import { useEffect, useRef } from 'react'
import { formatCaptureTime, type PhotoListRow } from '../photo/photoListGroups'
import { usePhotoImage } from '../photo/usePhotoImage'
import './Lightbox.css'

interface LightboxProps {
  row: PhotoListRow
  /** The list's full displayed order (design doc: "← and → move through
      the list in its displayed order") — used to find prev/next and
      whether either end is a boundary. */
  rows: PhotoListRow[]
  tripOffsetHours: number
  accessToken: string | null
  onClose: () => void
  /** Selects and opens `photoId` in one step — arrow keys are the only way
      to change photo while the lightbox is open (design doc edge case:
      "Selecting a row while the lightbox is open" can't happen from the
      list because the lightbox traps focus). */
  onNavigate: (photoId: string) => void
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
    "The lightbox" section). */
export function Lightbox({ row, rows, tripOffsetHours, accessToken, onClose, onNavigate, returnFocusRef }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const index = rows.findIndex((candidate) => candidate.id === row.id)
  const prevRow = index > 0 ? rows[index - 1] : undefined
  const nextRow = index >= 0 && index < rows.length - 1 ? rows[index + 1] : undefined

  // The thumbnail is already cached from the list (design doc's Loading
  // section) — shown scaled up and blurred as the frame's immediate
  // content, so the frame never resizes once the original lands.
  const thumbnail = usePhotoImage(accessToken, row.thumbnailDriveFileId)
  const original = usePhotoImage(accessToken, row.originalDriveFileId)

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

  const captionParts: string[] = []
  if (row.captureInstantMs !== undefined) captionParts.push(formatCaptureTime(row.captureInstantMs, tripOffsetHours))
  if (row.source === 'interpolated') captionParts.push('Position estimated from track')

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
        {captionParts.length > 0 && <p className="lightbox__caption">{captionParts.join(' · ')}</p>}
      </div>
    </div>
  )
}
