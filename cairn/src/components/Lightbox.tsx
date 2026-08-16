import { useEffect, useRef, useState } from 'react'
import { cairnRowMetaLine, type CairnListRow } from '../photo/cairnListGroups'
import {
  ADD_DESCRIPTION_PLACEHOLDER,
  SIGNED_OUT_MOVE_MESSAGE,
  positionSourceSentence,
  type CairnIcon,
} from '../store/looseStore'
import { usePhotoImage } from '../photo/usePhotoImage'
import { IconPicker } from './IconPicker'
import { NameInput } from './NameInput'
import { DescriptionInput } from './DescriptionInput'
import { useEditableCairnText } from './useEditableCairnText'
import './Lightbox.css'

/** #196: true for an event aimed at a text field, which is what the
    dialog's document-level shortcuts have to stand down for — `←`/`→` must
    move the caret, and Escape must revert the field rather than close the
    whole dialog. The one real hazard in the issue, and the reason the
    design note writes it down rather than leaving it to the
    implementation. */
function isTextFieldTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  const tag = element?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

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
  /** #196: commits an edited name or description. Resolves `false` on a
      failed write, which this face turns into the revert and the failure
      line beneath the field. `undefined` while disconnected — both fields
      then take the Disabled treatment and clicking does not start an edit,
      the same gate `onSetIcon` above already applies to the grid. */
  onSaveText?: (patch: { name?: string; description?: string }) => Promise<boolean>
  /** #157: true while a dropped photo is uploading onto this cairn. */
  attaching?: boolean
  /** #157: the image slot's failure line, or `null`. */
  attachError?: string | null
  /** #158: a drag's write failure, or `null`. The marker has already
      reverted by the time this shows — the line explains what happened
      rather than offering a retry the gesture (drag it again) already is. */
  moveError?: string | null
  /** #158: true while disconnected — shows the one-sentence-per-surface
      copy #73 already establishes elsewhere, rather than a tooltip on
      every marker on the map. */
  signedOut?: boolean
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
  onSaveText,
  attaching,
  attachError,
  moveError,
  signedOut,
  returnFocusRef,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const text = useEditableCairnText(onSaveText)

  /* #197 — full bleed is a mode of this component, not a fourth surface: it
     shows the same cairn, keeps the same arrow navigation, and returns to
     the face it came from. Keeping it a class on the same dialog is also
     what makes the `<img>` the same node in both, so entering the mode
     never re-fetches the original or reflows around it. */
  const [fullBleed, setFullBleed] = useState(false)

  /* Only a cairn with an image has the mode. An icon-only cairn's slot is
     not a button and cannot be entered by any means. */
  const hasImage = row.originalDriveFileId !== null

  /* Two ways the mode becomes unreachable while it is open, both of them
     states rather than events, so they are reconciled here rather than
     patched into each caller:

     - arrowing to a cairn with no image — a mode whose whole content is
       absent is not a state to sit in, and the list mixes photo cairns
       with icon-only ones, so this is reachable rather than theoretical;
     - a photo dropped onto this cairn — the upload's progress belongs on
       the detail face, where #157 put it. */
  useEffect(() => {
    if (fullBleed && (!hasImage || attaching)) setFullBleed(false)
  }, [fullBleed, hasImage, attaching])

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
      /* #196: while a field is being edited, these keys belong to it —
         the arrows move the caret and Escape reverts the edit. Standing
         down entirely (rather than only for the arrows) is what makes
         "one Escape, one effect, innermost first" true. */
      if (isTextFieldTarget(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        /* #197 — innermost first. In full bleed Escape returns to the
           detail face; on the detail face it closes. Two Escapes from full
           bleed close everything, and neither one skips a level. */
        if (fullBleed) setFullBleed(false)
        else onClose()
      } else if (event.key === 'ArrowLeft') {
        if (prevRow) onNavigate(prevRow.id)
      } else if (event.key === 'ArrowRight') {
        if (nextRow) onNavigate(nextRow.id)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onNavigate, prevRow, nextRow, fullBleed])

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
    // #196: the name input and the description textarea join the trap's
    // set. Without them, Tab out of a field mid-edit escapes the dialog.
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input, textarea',
    )
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
        className={`lightbox__dialog${fullBleed ? ' lightbox__dialog--full-bleed' : ''}`}
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
        {/* #197 — the image column. Absent entirely for an icon-only cairn,
            which leaves the detail column taking the dialog at
            `--panel-width`; still present while a photo uploads onto a
            cairn that has none yet, since #157's slot is what shows the
            progress. */}
        {(hasImage || attaching) && (
          <div className="lightbox__media">
            {/* The photo is a button only when there is a photo: it is what
                enters and leaves full bleed. `cursor: zoom-in`/`zoom-out`
                is the affordance — a `View full size` button beside a
                photograph is a caption by another name. */}
            <button
              type="button"
              className="lightbox__frame"
              aria-label={fullBleed ? 'Exit full size' : 'View full size'}
              disabled={!hasImage || attaching}
              onClick={() => setFullBleed((wasFullBleed) => !wasFullBleed)}
            >
              {attaching ? (
                <div className="lightbox__uploading" aria-busy="true">
                  {(original.url ?? thumbnail.url) && (
                    <img
                      className="lightbox__image lightbox__image--replacing"
                      src={(original.url ?? thumbnail.url) as string}
                      alt={row.name}
                    />
                  )}
                  <span className="lightbox__uploading-label">uploading…</span>
                </div>
              ) : original.url ? (
                <img className="lightbox__image" src={original.url} alt={row.name} />
              ) : (
                <>
                  {thumbnail.url && (
                    <img className="lightbox__placeholder" src={thumbnail.url} alt="" />
                  )}
                  {original.failed && <p className="lightbox__error">Couldn't load this photo.</p>}
                </>
              )}
            </button>
          </div>
        )}
        {/* #197 — everything that is not the photograph. In full bleed this
            is hidden: no name, no meta, no description. They are one Escape
            away, and a caption over a photograph is the thing that mode
            exists to get rid of. The dialog's `aria-label` still carries the
            cairn's name, so the mode is not anonymous to a screen reader. */}
        <div className="lightbox__detail">
          {/* #157 — the failure line for a photo dropped onto this cairn.
              `aria-live="polite"` is the only announcement a drop's outcome
              gets: no toast, per the design note's "the marker changes, and
              that is the confirmation" stance. */}
          {attachError && (
            <p className="lightbox__attach-error" aria-live="polite">
              {attachError}
            </p>
          )}
          {/* #196 — the name and the description become click-to-edit,
              copying `TripMetadataHeader`'s pattern rather than inventing a
              second one. The meta line between them stays static: it is
              derived, and each part of it has its own owner — the icon grid
              below, the image by dropping a photo, the date by nothing yet. */}
          {text.editing === 'name' ? (
            <NameInput
              initial={row.name}
              className="lightbox__name-input"
              ariaLabel="Cairn name"
              selectOnFocus
              onCommit={(name) => {
                // An empty commit is an aborted edit — a cairn always has a
                // name, so there is no state for an empty one to mean.
                if (name.trim().length === 0) {
                  text.cancelEditing()
                  return
                }
                void text.commit('name', { name })
              }}
              onCancel={text.cancelEditing}
            />
          ) : (
            <h2
              className={`lightbox__name${text.editable ? ' lightbox__name--editable' : ''}${
                text.savedField === 'name' ? ' lightbox__field--saved' : ''
              }`}
              title={row.name}
              onClick={() => text.startEditing('name')}
            >
              {row.name}
            </h2>
          )}
          {text.errorFor('name') && <p className="lightbox__field-error">{text.errorFor('name')}</p>}
          <p className="lightbox__meta">{cairnRowMetaLine(row)}</p>
          {text.editing === 'description' ? (
            <DescriptionInput
              initial={description}
              className="description-input lightbox__description-input"
              onCommit={(value) => void text.commit('description', { description: value })}
              onCancel={text.cancelEditing}
            />
          ) : (
            <p
              className={`lightbox__description${description ? '' : ' lightbox__description--empty'}${
                text.editable ? ' lightbox__description--editable' : ''
              }${text.savedField === 'description' ? ' lightbox__field--saved' : ''}`}
              onClick={() => text.startEditing('description')}
            >
              {description || ADD_DESCRIPTION_PLACEHOLDER}
            </p>
          )}
          {text.errorFor('description') && (
            <p className="lightbox__field-error">{text.errorFor('description')}</p>
          )}
          <p className="lightbox__position">{positionSourceSentence(row.source)}</p>
          {/* #158 — the drag's failure line, `aria-live="polite"` for the same
              reason #157's attach failure already is: a drop's outcome is
              otherwise announced by nothing. */}
          {moveError && (
            <p className="lightbox__move-error" aria-live="polite">
              {moveError}
            </p>
          )}
          {signedOut && <p className="lightbox__signed-out">{SIGNED_OUT_MOVE_MESSAGE}</p>}
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
    </div>
  )
}
