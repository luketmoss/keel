import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from '../map/motion'
import { usePhotoImage } from '../photo/usePhotoImage'
import { formatCaptureTime, type PhotoListItem, type PhotoListRow } from '../photo/photoListGroups'
import './PhotoList.css'

interface PhotoListProps {
  items: PhotoListItem[]
  totalCount: number
  selectedPhotoId: string | null
  accessToken: string | null
  tripOffsetHours: number
  /** Clicking a row selects it *and* opens the lightbox in one action
      (design doc's Selection and "The lightbox" sections both name this
      the same click). */
  onOpenRow: (photoId: string) => void
  /** #77: performs the actual removal (trash originals + rewrite the index)
      once the row's confirm has been accepted — the `×` control itself
      only starts the confirm, via `onStartConfirm` below. */
  onRemove: (id: string) => void
  /** #132: the reversible exit, beside `onRemove`'s destructive one — no
      confirm, since it's undone by adding the photo back. `undefined` when
      the caller has nowhere to put a detached photo (there always is one
      today; the type stays optional to match `TrackList.onRemoveFromTrip`'s
      shape). */
  onRemoveFromTrip?: (id: string) => void
  /** #77 — the single confirm slot, shared with `TrackList` by the parent
      (design doc: "tracks and photos sharing one slot"). `null` when no row
      anywhere in the trip is confirming. */
  confirmingId: string | null
  onStartConfirm: (id: string) => void
  onCancelConfirm: () => void
  /** Attached to whichever row is currently confirming, so the shared
      pointerdown-outside listener (owned by the parent) knows what counts
      as "inside". */
  confirmingRowRef: RefObject<HTMLElement | null>
  /** Photo ids whose removal is in flight — row renders muted and inert. */
  removingIds: Set<string>
  /** Photo id -> failure copy to show beneath that row. */
  removeErrors: Record<string, string>
  /** True while there's no Drive connection to remove against — same
      `signedIn` gate `TripImportPanel` already applies to import. */
  disableRemove?: boolean
}

/** The trip sidebar's photo section (#55) — beneath `TrackList`, sourced
    from every imported photo (`photoImport.photos` via `TripDetail`'s
    `buildPhotoListRows`/`orderPhotoListItems`), not just the positioned
    subset the map draws. Follows `TrackList`'s row-anatomy and empty-state
    conventions (BEM-ish class names, colocated CSS) without extending it —
    a photo row's shape doesn't overlap a track row's. */
export function PhotoList({
  items,
  totalCount,
  selectedPhotoId,
  accessToken,
  tripOffsetHours,
  onOpenRow,
  onRemove,
  onRemoveFromTrip,
  confirmingId,
  onStartConfirm,
  onCancelConfirm,
  confirmingRowRef,
  removingIds,
  removeErrors,
  disableRemove = false,
}: PhotoListProps) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>())

  // #54 selects a marker on the map; this is the list's half of "one
  // selection, two views" (design doc's Selection section) — highlight
  // and scroll the corresponding row into view. `nearest` rather than
  // `center` so an already-visible row doesn't jump the list for no
  // reason. `prefersReducedMotion()` is checked explicitly because
  // `scrollIntoView({ behavior: 'smooth' })` is neither a CSS animation
  // nor transition, so index.css's global reduced-motion rule can't catch
  // it (design doc edge case).
  useEffect(() => {
    if (!selectedPhotoId) return
    const el = rowRefs.current.get(selectedPhotoId)
    if (!el) return
    // jsdom (this suite's test environment) doesn't implement
    // `scrollIntoView` at all — same defensive-optional-call pattern as
    // `prefersReducedMotion`'s own `matchMedia` guard.
    el.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [selectedPhotoId])

  return (
    <div className="photo-list">
      <div className="photo-list__header">
        <span>Photos</span>
        {totalCount > 0 && <span className="photo-list__count">{totalCount}</span>}
      </div>
      {totalCount === 0 ? (
        <div className="photo-list photo-list--empty">
          <p className="photo-list__empty-title">No photos yet</p>
          <p className="photo-list__empty-detail">Drop photos onto this trip to see them here.</p>
        </div>
      ) : (
        <ul className="photo-list__rows">
          {items.map((item, index) =>
            item.type === 'divider' ? (
              <li key={`divider-${index}`} className="photo-list__divider">
                {item.divider === 'no-date' ? 'No date' : 'No location'}
              </li>
            ) : (
              <PhotoRow
                key={item.row.id}
                row={item.row}
                selected={item.row.id === selectedPhotoId}
                accessToken={accessToken}
                tripOffsetHours={tripOffsetHours}
                onOpen={onOpenRow}
                onRemove={onRemove}
                onRemoveFromTrip={onRemoveFromTrip}
                confirming={confirmingId === item.row.id}
                confirmingRowRef={confirmingId === item.row.id ? confirmingRowRef : undefined}
                onStartConfirm={() => onStartConfirm(item.row.id)}
                onCancelConfirm={onCancelConfirm}
                removing={removingIds.has(item.row.id)}
                removeError={removeErrors[item.row.id]}
                disableRemove={disableRemove}
                registerRef={(el) => {
                  if (el) rowRefs.current.set(item.row.id, el)
                  else rowRefs.current.delete(item.row.id)
                }}
              />
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function PhotoRow({
  row,
  selected,
  accessToken,
  tripOffsetHours,
  onOpen,
  onRemove,
  onRemoveFromTrip,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  removing,
  removeError,
  disableRemove,
  registerRef,
}: {
  row: PhotoListRow
  selected: boolean
  accessToken: string | null
  tripOffsetHours: number
  onOpen: (photoId: string) => void
  onRemove: (id: string) => void
  onRemoveFromTrip?: (id: string) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  removing: boolean
  removeError?: string
  disableRemove: boolean
  registerRef: (el: HTMLLIElement | null) => void
}) {
  // Loading and thumbnail-failed both render the same `--surface-lift`
  // fallback fill (design doc's "Photos loading" / "Thumbnail failed to
  // load" states) — `usePhotoImage` already collapses those two into one
  // `undefined` for exactly this reason.
  const thumbnailUrl = usePhotoImage(accessToken, row.thumbnailDriveFileId).url
  const timeLabel = row.captureInstantMs !== undefined ? formatCaptureTime(row.captureInstantMs, tripOffsetHours) : '—'

  // #77 — the confirm replaces the row's contents in place, same shape as
  // TrackList's and the trips list's.
  if (confirming) {
    return (
      <li
        ref={(el) => {
          registerRef(el)
          if (confirmingRowRef) confirmingRowRef.current = el
        }}
        className={`photo-row${selected ? ' photo-row--selected' : ''}`}
      >
        <div className="photo-row__confirm">
          <span className="photo-row__confirm-text">Remove &quot;{row.name}&quot;?</span>
          <div className="photo-row__confirm-actions">
            <button
              type="button"
              className="photo-row__confirm-remove"
              onClick={() => {
                onCancelConfirm()
                onRemove(row.id)
              }}
            >
              Remove
            </button>
            <button type="button" className="photo-row__confirm-cancel" onClick={onCancelConfirm}>
              Cancel
            </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li
      ref={registerRef}
      className={`photo-row${selected ? ' photo-row--selected' : ''}${removing ? ' photo-row--removing' : ''}`}
    >
      <div className="photo-row__main">
        <button type="button" className="photo-row__button" onClick={() => onOpen(row.id)}>
          <span className="photo-row__thumb">{thumbnailUrl && <img src={thumbnailUrl} alt="" />}</span>
          <span className="photo-row__time">{timeLabel}</span>
          {/* Derived rows carry a small muted marker after the time; recorded
              rows carry nothing — absence of a caveat is the signal (design
              doc). */}
          {row.source === 'interpolated' && <span className="photo-row__derived">⟂ estimated</span>}
          <span className="photo-row__name" title={row.name}>
            {row.name}
          </span>
        </button>
        {removing ? (
          <span className="photo-row__removing">Removing…</span>
        ) : (
          <>
            {onRemoveFromTrip && (
              /* #132: no ellipsis and no confirm — reversible by adding it
                 back, which is exactly what makes it the other exit. */
              <button
                type="button"
                className="photo-row__unlink"
                aria-label={`Remove ${row.name} from trip`}
                disabled={disableRemove}
                onClick={() => onRemoveFromTrip(row.id)}
              >
                ⤴
              </button>
            )}
            <button
              type="button"
              className="photo-row__remove"
              aria-label={`Delete ${row.name} permanently`}
              disabled={disableRemove}
              onClick={onStartConfirm}
            >
              ×
            </button>
          </>
        )}
      </div>
      {removeError && <p className="photo-row__error">{removeError}</p>}
    </li>
  )
}
