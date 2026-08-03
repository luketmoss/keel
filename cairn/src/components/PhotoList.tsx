import { useEffect, useRef } from 'react'
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
}

/** The trip sidebar's photo section (#55) — beneath `TrackList`, sourced
    from every imported photo (`photoImport.photos` via `TripDetail`'s
    `buildPhotoListRows`/`orderPhotoListItems`), not just the positioned
    subset the map draws. Follows `TrackList`'s row-anatomy and empty-state
    conventions (BEM-ish class names, colocated CSS) without extending it —
    a photo row's shape doesn't overlap a track row's. */
export function PhotoList({ items, totalCount, selectedPhotoId, accessToken, tripOffsetHours, onOpenRow }: PhotoListProps) {
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
  registerRef,
}: {
  row: PhotoListRow
  selected: boolean
  accessToken: string | null
  tripOffsetHours: number
  onOpen: (photoId: string) => void
  registerRef: (el: HTMLLIElement | null) => void
}) {
  // Loading and thumbnail-failed both render the same `--surface-lift`
  // fallback fill (design doc's "Photos loading" / "Thumbnail failed to
  // load" states) — `usePhotoImage` already collapses those two into one
  // `undefined` for exactly this reason.
  const thumbnailUrl = usePhotoImage(accessToken, row.thumbnailDriveFileId).url
  const timeLabel = row.captureInstantMs !== undefined ? formatCaptureTime(row.captureInstantMs, tripOffsetHours) : '—'

  return (
    <li ref={registerRef} className={`photo-row${selected ? ' photo-row--selected' : ''}`}>
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
    </li>
  )
}
