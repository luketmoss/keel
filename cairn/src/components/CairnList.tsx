import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from '../map/motion'
import { usePhotoImage } from '../photo/usePhotoImage'
import { cairnRowMetaLine, type CairnListItem, type CairnListRow } from '../photo/cairnListGroups'
import { CairnMarker } from './CairnMarker'
import './CairnList.css'

interface CairnListProps {
  items: CairnListItem[]
  totalCount: number
  selectedCairnId: string | null
  accessToken: string | null
  /** Clicking a row selects it *and*, when the cairn has an image, opens
      the lightbox in one action (design doc's Selection and "The
      lightbox" sections both name this the same click). An icon-only
      cairn has nothing for the lightbox to show, so its row only
      selects. */
  onOpenRow: (cairnId: string) => void
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
  /** Cairn ids whose removal is in flight — row renders muted and inert. */
  removingIds: Set<string>
  /** Cairn id -> failure copy to show beneath that row. */
  removeErrors: Record<string, string>
  /** True while there's no Drive connection to remove against — same
      `signedIn` gate `TripImportPanel` already applies to import. */
  disableRemove?: boolean
}

/** The trip sidebar's cairn list (#55, unified to every cairn in the trip
    by #169) — beneath `TrackList`, sourced from every cairn the trip owns,
    not just the ones carrying an image. Follows `TrackList`'s row-anatomy
    and empty-state conventions (BEM-ish class names, colocated CSS)
    without extending it — a cairn row's shape doesn't overlap a track
    row's. */
export function CairnList({
  items,
  totalCount,
  selectedCairnId,
  accessToken,
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
}: CairnListProps) {
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
    if (!selectedCairnId) return
    const el = rowRefs.current.get(selectedCairnId)
    if (!el) return
    // jsdom (this suite's test environment) doesn't implement
    // `scrollIntoView` at all — same defensive-optional-call pattern as
    // `prefersReducedMotion`'s own `matchMedia` guard.
    el.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [selectedCairnId])

  return (
    <div className="cairn-list">
      <div className="cairn-list__header">
        <span>Cairns</span>
        {totalCount > 0 && <span className="cairn-list__count">{totalCount}</span>}
      </div>
      {totalCount === 0 ? (
        <div className="cairn-list cairn-list--empty">
          <p className="cairn-list__empty-title">No cairns yet</p>
          <p className="cairn-list__empty-detail">Drop photos onto this trip to see them here.</p>
        </div>
      ) : (
        <ul className="cairn-list__rows">
          {items.map((item, index) =>
            item.type === 'divider' ? (
              <li key={`divider-${index}`} className="cairn-list__divider">
                No date
              </li>
            ) : (
              <CairnRow
                key={item.row.id}
                row={item.row}
                selected={item.row.id === selectedCairnId}
                accessToken={accessToken}
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

function CairnRow({
  row,
  selected,
  accessToken,
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
  row: CairnListRow
  selected: boolean
  accessToken: string | null
  onOpen: (cairnId: string) => void
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
  const thumbnailUrl = usePhotoImage(accessToken, row.thumbnailDriveFileId ?? undefined).url

  // #77 — the confirm replaces the row's contents in place, same shape as
  // TrackList's and the trips list's.
  if (confirming) {
    return (
      <li
        ref={(el) => {
          registerRef(el)
          if (confirmingRowRef) confirmingRowRef.current = el
        }}
        className={`cairn-row${selected ? ' cairn-row--selected' : ''}`}
      >
        <div className="cairn-row__confirm">
          <span className="cairn-row__confirm-text">Remove &quot;{row.name}&quot;?</span>
          <div className="cairn-row__confirm-actions">
            <button
              type="button"
              className="cairn-row__confirm-remove"
              onClick={() => {
                onCancelConfirm()
                onRemove(row.id)
              }}
            >
              Remove
            </button>
            <button type="button" className="cairn-row__confirm-cancel" onClick={onCancelConfirm}>
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
      className={`cairn-row${selected ? ' cairn-row--selected' : ''}${removing ? ' cairn-row--removing' : ''}`}
    >
      <div className="cairn-row__main">
        <button type="button" className="cairn-row__button" onClick={() => onOpen(row.id)}>
          <span className="cairn-row__glyph">
            <CairnMarker
              icon={row.icon}
              thumbnailUrl={thumbnailUrl}
              hasImage={row.thumbnailDriveFileId !== null}
              source={row.source}
              selected={selected}
              small
            />
          </span>
          <span className="cairn-row__meta">{cairnRowMetaLine(row)}</span>
          <span className="cairn-row__name" title={row.name}>
            {row.name}
          </span>
        </button>
        {removing ? (
          <span className="cairn-row__removing">Removing…</span>
        ) : (
          <>
            {onRemoveFromTrip && (
              /* #132: no ellipsis and no confirm — reversible by adding it
                 back, which is exactly what makes it the other exit. */
              <button
                type="button"
                className="cairn-row__unlink"
                aria-label={`Remove ${row.name} from trip`}
                disabled={disableRemove}
                onClick={() => onRemoveFromTrip(row.id)}
              >
                ⤴
              </button>
            )}
            <button
              type="button"
              className="cairn-row__remove"
              aria-label={`Delete ${row.name} permanently`}
              disabled={disableRemove}
              onClick={onStartConfirm}
            >
              ×
            </button>
          </>
        )}
      </div>
      {removeError && <p className="cairn-row__error">{removeError}</p>}
    </li>
  )
}
