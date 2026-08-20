import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from '../map/motion'
import { usePhotoImage } from '../photo/usePhotoImage'
import { cairnRowMetaLine, type CairnListItem, type CairnListRow } from '../photo/cairnListGroups'
import { CairnMarker } from './CairnMarker'
import { CairnFacetChips } from './CairnFacetChips'
import type { CairnFacet } from '../store/cairnRules'
import { iconLabel } from './iconLabel'
import { RowMenu } from './RowMenu'
import { VisibilityIcon } from './VisibilityIcon'
import './CairnList.css'

/** #192's matched-nothing detail line. Naming the total answers *is
    anything here at all* in the same breath as offering the way back —
    which is the whole difference between this state and a trip that holds
    no cairns. One reads `all 17`, one `the 1`. */
export function clearFilterDetail(totalCount: number): string {
  return totalCount === 1 ? 'Clear the filter to see the 1.' : `Clear the filter to see all ${totalCount}.`
}

/** #251: the rest value of `hoveredCairnIds`, and its default — one shared
    empty set rather than a fresh one per render, the same reasoning
    `CairnLayer`'s own `EMPTY_HOVERED_CAIRN_IDS` gives. Never mutated. */
const EMPTY_HOVERED_CAIRN_IDS: ReadonlySet<string> = new Set()

interface CairnListProps {
  /** Already filtered by `facet` — one filter drives this list and the
      map together (`cairns.md`), so the narrowing happens once in the
      parent rather than here and again in `CairnLayer`. */
  items: CairnListItem[]
  /** Every cairn the trip holds, facet or no facet. Distinguishes *nothing
      here* from *nothing like that here*, and feeds the way back. */
  totalCount: number
  /** #192: the facet row now sits inside this section, between its header
      and its rows — a filter belongs to the list it filters, and the
      section header is already the thing that says *these are the cairns*. */
  facet: CairnFacet
  onFacetChange: (facet: CairnFacet) => void
  selectedCairnId: string | null
  /** #250 — the one row expanded in place, or `null`. Its own state,
      separate from `selectedCairnId` (design note's "Only one row is
      expanded at a time" — deriving it from selection would make the
      header's second click deselect in order to collapse). */
  expandedCairnId: string | null
  /** #251: `TripDetail`'s one hovered-cairn set — read here to decide which
      row(s) take the `cairn-row--hovered` class. Usually holds at most this
      list's own written id, but a hovered cluster marker on the map can
      hold several at once (251-linked-hover.md's "Clusters" — "every row it
      holds"), which is why this list only ever tests membership rather than
      equality against a single id. Defaults to an empty set so every call
      site written before this issue keeps working unchanged. */
  hoveredCairnIds?: ReadonlySet<string>
  /** #251: writes `hoveredCairnIds` on a row's mouseenter/mouseleave and its
      button's focus/blur — `cairnId` on enter/focus, `null` on leave/blur,
      the same shape `TripsPanel.onHover` already uses (widened to a set one
      level up, in `TripDetail`, for the cluster case above). */
  onHoverCairn?: (cairnId: string | null) => void
  accessToken: string | null
  /** #250 revises this: a click on a row whose cairn carries an image now
      selects it and expands the row in place, toggling closed on a second
      click — the lightbox does not open. An icon-only cairn has nothing to
      preview, so its row keeps the old single click straight to the
      lightbox. `TripDetail.selectCairn` is the one function this and
      `CairnLayer.onOpenCairn` both call, so the row and the marker cannot
      disagree on which. */
  onOpenRow: (cairnId: string) => void
  /** #250 — the expanded row's own preview button, which is what actually
      opens the lightbox now. Separate from `onOpenRow` because the two
      controls do different things: the header toggles expansion, the photo
      opens the detail face. */
  onOpenPreview: (cairnId: string) => void
  /** #77: performs the actual removal (trash originals + rewrite the index)
      once the row's confirm has been accepted — `Delete permanently…` in
      the row's `⋮` only starts the confirm, via `onStartConfirm` below. */
  onRemove: (id: string) => void
  /** #132: the reversible exit, beside `onRemove`'s destructive one — no
      confirm, since it's undone by adding the photo back. `undefined` when
      the caller has nowhere to put a detached photo (there always is one
      today; the type stays optional to match `TrackList.onRemoveFromTrip`'s
      shape). #193 moved both items into the row's `⋮`. */
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
  /** #198: the cairns currently hidden from the map, because every track
      covering their day is hidden. Their rows **stay** — rendered in the
      hidden treatment and still clickable, exactly as a hidden track's row
      stays in `TrackList`. An eye has never removed anything from a list,
      and making cairns the exception would reintroduce #194's problem from
      the other direction. Empty when nothing is hidden. */
  hiddenCairnIds?: ReadonlySet<string>
  /** #198: the unattached group's own eye. `onToggleUnattached` is omitted
      on surfaces with no track visibility to derive from, in which case the
      group heading renders without a control. */
  unattachedVisible?: boolean
  onToggleUnattached?: () => void
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
  facet,
  onFacetChange,
  selectedCairnId,
  expandedCairnId,
  hoveredCairnIds = EMPTY_HOVERED_CAIRN_IDS,
  onHoverCairn = () => {},
  accessToken,
  onOpenRow,
  onOpenPreview,
  onRemove,
  onRemoveFromTrip,
  confirmingId,
  onStartConfirm,
  onCancelConfirm,
  confirmingRowRef,
  removingIds,
  removeErrors,
  disableRemove = false,
  hiddenCairnIds = new Set<string>(),
  unattachedVisible = true,
  onToggleUnattached,
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

  // What is showing, never `12 of 17` — a fraction implies the list is
  // truncated; it is filtered, and the chip already says by what. `0` is
  // shown rather than hidden, because that is precisely the number the
  // user needs to see when a facet matched nothing.
  const matchedCount = items.reduce((count, item) => (item.type === 'row' ? count + 1 : count), 0)

  /* #198's group heading carries its own count, the way the section header
     above carries the list's. Counted from the items after the divider
     rather than passed in, so it can only ever describe the rows actually
     rendered beneath it. */
  const dividerIndex = items.findIndex((item) => item.type === 'divider')
  const unattachedCount = dividerIndex === -1 ? 0 : items.length - dividerIndex - 1

  return (
    <div className="cairn-list">
      <div className="cairn-list__header">
        <span>Cairns</span>
        {totalCount > 0 && <span className="cairn-list__count">{matchedCount}</span>}
      </div>
      {/* Hidden only when the trip holds no cairns at all. It stays up in
          the matched-nothing state on purpose: hiding the control that
          caused an empty list is the one thing that makes it
          unrecoverable. */}
      {totalCount > 0 && (
        <div className="cairn-list__facets">
          <CairnFacetChips facet={facet} onChange={onFacetChange} />
        </div>
      )}
      {totalCount === 0 ? (
        <div className="cairn-list cairn-list--empty">
          <p className="cairn-list__empty-title">No cairns yet</p>
          <p className="cairn-list__empty-detail">Drop photos onto this trip to see them here.</p>
        </div>
      ) : matchedCount === 0 ? (
        <div className="cairn-list cairn-list--empty">
          <p className="cairn-list__empty-title">No cairns like that</p>
          <p className="cairn-list__empty-detail">{clearFilterDetail(totalCount)}</p>
        </div>
      ) : (
        <ul className="cairn-list__rows">
          {items.map((item, index) =>
            item.type === 'divider' ? (
              /* #198 — the one heading that carries a control. Everything
                 beneath it belongs to no track, so no track's eye can
                 reach it; this is the eye that can, and it owns exactly
                 this group. */
              <li key={`divider-${index}`} className="cairn-list__divider">
                {/* `Not on a track`, never `Unattached` or `Other` (design
                    note's Copy table). It says the thing that is true and,
                    by saying it, explains why the track toggles do nothing
                    to the rows beneath it — which a jargon word cannot. */}
                <span className="cairn-list__divider-label">Not on a track</span>
                <span className="cairn-list__divider-count">{unattachedCount}</span>
                {onToggleUnattached && (
                  <button
                    type="button"
                    className="cairn-list__divider-visibility"
                    {...iconLabel(
                      unattachedVisible ? 'Hide cairns not on a track' : 'Show cairns not on a track',
                    )}
                    onClick={onToggleUnattached}
                  >
                    <VisibilityIcon visible={unattachedVisible} />
                  </button>
                )}
              </li>
            ) : (
              <CairnRow
                key={item.row.id}
                row={item.row}
                selected={item.row.id === selectedCairnId}
                expanded={item.row.id === expandedCairnId}
                hovered={hoveredCairnIds.has(item.row.id)}
                onHoverChange={(hovered) => onHoverCairn(hovered ? item.row.id : null)}
                accessToken={accessToken}
                onOpen={onOpenRow}
                onOpenPreview={onOpenPreview}
                onRemove={onRemove}
                onRemoveFromTrip={onRemoveFromTrip}
                confirming={confirmingId === item.row.id}
                confirmingRowRef={confirmingId === item.row.id ? confirmingRowRef : undefined}
                onStartConfirm={() => onStartConfirm(item.row.id)}
                onCancelConfirm={onCancelConfirm}
                removing={removingIds.has(item.row.id)}
                removeError={removeErrors[item.row.id]}
                disableRemove={disableRemove}
                hidden={hiddenCairnIds.has(item.row.id)}
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
  expanded,
  hovered,
  onHoverChange,
  accessToken,
  onOpen,
  onOpenPreview,
  onRemove,
  onRemoveFromTrip,
  confirming,
  confirmingRowRef,
  onStartConfirm,
  onCancelConfirm,
  removing,
  removeError,
  disableRemove,
  hidden,
  registerRef,
}: {
  row: CairnListRow
  selected: boolean
  /** #250 — whether *this* row is the one `TripDetail.expandedCairnId`
      names. Ignored below while `removing` or `confirming`: an inert or a
      about-to-be-destroyed row has no preview to show (design doc's States
      table). */
  expanded: boolean
  /** #251 — whether this row's id is in `hoveredCairnIds`. Applied as a
      class rather than read through `:hover`, because a marker-hover event
      on the map has to produce the identical row treatment programmatically
      — the design note's "the same pixels" requirement. Still lit while
      `hidden` (below): the row stays fully hoverable in the hidden
      treatment, in both directions. */
  hovered: boolean
  /** #251 — writes `hoveredCairnIds` on mouseenter/mouseleave (the `<li>`)
      and focus/blur (the header button), mirroring `TripsPanel`'s row. */
  onHoverChange: (hovered: boolean) => void
  accessToken: string | null
  onOpen: (cairnId: string) => void
  onOpenPreview: (cairnId: string) => void
  onRemove: (id: string) => void
  onRemoveFromTrip?: (id: string) => void
  confirming: boolean
  confirmingRowRef?: RefObject<HTMLElement | null>
  onStartConfirm: () => void
  onCancelConfirm: () => void
  removing: boolean
  removeError?: string
  disableRemove: boolean
  /** #198: hidden from the map. Changes the row's treatment and nothing
      else — it stays, and it stays clickable. */
  hidden: boolean
  registerRef: (el: HTMLLIElement | null) => void
}) {
  // Loading and thumbnail-failed both render the same `--surface-lift`
  // fallback fill (design doc's "Photos loading" / "Thumbnail failed to
  // load" states) — `usePhotoImage` already collapses those two into one
  // `undefined` for exactly this reason. #250's preview reuses this same
  // acquire — it's the glyph's own thumbnail, already in hand, not a
  // second fetch — and also reads `.failed` for its own "thumbnail failed
  // too" state, which the glyph never needed to tell apart from loading.
  const thumbnail = usePhotoImage(accessToken, row.thumbnailDriveFileId ?? undefined)
  const hasImage = row.thumbnailDriveFileId !== null
  // #250: removing is inert already (design doc) and cannot be expanded;
  // confirming never reaches this render at all (its branch returns below),
  // so this only has removing left to guard against.
  const previewOpen = expanded && hasImage && !removing

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
      className={`cairn-row${selected ? ' cairn-row--selected' : ''}${removing ? ' cairn-row--removing' : ''}${hidden ? ' cairn-row--hidden' : ''}${hovered ? ' cairn-row--hovered' : ''}`}
      data-hidden={hidden}
      // #251: the row's half of the write — the same `mouseenter`/
      // `mouseleave` pair `TripsPanel`'s own row already uses.
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <div className="cairn-row__main">
        <button
          type="button"
          className="cairn-row__button"
          onClick={() => onOpen(row.id)}
          // #251: focus/blur drive the identical write mouseenter/leave
          // does — "not a mouse-only feature" (design note).
          onFocus={() => onHoverChange(true)}
          onBlur={() => onHoverChange(false)}
          // #250: only a cairn with an image is an expandable thing — the
          // design doc is explicit that an icon-only cairn's row must not
          // claim to be one, so the attribute is omitted entirely rather
          // than fixed at `false`.
          {...(hasImage ? { 'aria-expanded': previewOpen } : {})}
        >
          <span className="cairn-row__glyph">
            <CairnMarker
              icon={row.icon}
              thumbnailUrl={thumbnail.url}
              hasImage={hasImage}
              source={row.source}
              selected={selected}
              small
            />
          </span>
          {/* #193 — the name first and in full contrast, the meta line
              beneath it. It used to render inline *before* the name, so the
              eye reached the date before a name already cut off at eight
              characters. `cairnRowMetaLine` is unchanged: `cairns.md` pins
              its clauses and this issue only moves where it draws. */}
          <span className="cairn-row__text">
            <span className="cairn-row__name" title={row.name}>
              {row.name}
            </span>
            <span className="cairn-row__meta">{cairnRowMetaLine(row)}</span>
          </span>
        </button>
        {removing ? (
          <span className="cairn-row__removing">Removing…</span>
        ) : (
          /* #193 — the `⤴` and `×` become named items behind the one `⋮`.
             `Remove from trip` is reversible by adding it back, which is
             what makes it the other exit; `Delete permanently…` keeps
             #77's inline confirm, and the ellipsis is what says so. */
          <RowMenu
            label={`Row actions for ${row.name}`}
            actions={[
              ...(onRemoveFromTrip
                ? [
                    {
                      label: 'Remove from trip',
                      disabled: disableRemove,
                      onSelect: () => onRemoveFromTrip(row.id),
                    },
                  ]
                : []),
              {
                label: 'Delete permanently…',
                danger: true,
                disabled: disableRemove,
                onSelect: onStartConfirm,
              },
            ]}
          />
        )}
      </div>
      {removeError && <p className="cairn-row__error">{removeError}</p>}
      {/* #250 — the second block inside the same `<li>`, so the row grows
          rather than the list gaining an element. Mounted only while
          actually expanded: `CairnRowPreview` acquires the display-size
          original through `usePhotoImage`, and fetching that for every row
          up front is exactly what #55's placeholder-then-original pattern
          exists to avoid — collapsing releases it again. */}
      {previewOpen && (
        <div className="cairn-row__preview-wrap">
          <CairnRowPreview row={row} accessToken={accessToken} thumbnail={thumbnail} onOpen={onOpenPreview} />
        </div>
      )}
    </li>
  )
}

/** #250 — the inline preview itself, mounted only inside the expanded
    row's wrapper. Its own component (rather than a branch inside
    `CairnRow`) so `usePhotoImage` for the display-size original is only
    ever acquired while a row is actually expanded — fetching every row's
    original up front is the thing #55's placeholder-then-original pattern
    exists to avoid. */
function CairnRowPreview({
  row,
  accessToken,
  thumbnail,
  onOpen,
}: {
  row: CairnListRow
  accessToken: string | null
  thumbnail: { url?: string; failed: boolean }
  onOpen: (cairnId: string) => void
}) {
  // The thumbnail is already in hand from the glyph — drawn immediately,
  // no spinner. The original swaps in, in place, once it lands; there is
  // no cross-fade between the two (design doc's Motion section) because a
  // cross-fade between two versions of one photograph reads as a
  // rendering fault, not a decision.
  const original = usePhotoImage(accessToken, row.originalDriveFileId ?? undefined)
  const imageUrl = original.url ?? thumbnail.url

  return (
    <button
      type="button"
      className="cairn-row__preview"
      aria-label={`View ${row.name} larger`}
      onClick={() => onOpen(row.id)}
    >
      {imageUrl ? (
        <img className="cairn-row__preview-image" src={imageUrl} alt="" />
      ) : thumbnail.failed ? (
        <span className="cairn-row__preview-failed">Couldn&apos;t load this photo.</span>
      ) : (
        <span className="cairn-row__preview-loading" aria-hidden="true" />
      )}
    </button>
  )
}
