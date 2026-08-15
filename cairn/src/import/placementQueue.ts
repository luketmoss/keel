/* The placement queue's pure state — `cairns.md`'s "The placement queue"
   and `155-cairns-replace-photos.md`'s "The placement face". No React, no
   DOM, no Drive I/O: a batch's total size, how many of it are already
   placed (auto-resolved or placed by hand), and the files still waiting.

   `totalCount === placedCount + items.length` is the invariant every
   function here preserves — it's what lets the summary line read the batch
   as a whole ("5 photos · 3 placed · 2 need a location") rather than just
   the queue, so a drop of forty with two stragglers doesn't read as a
   two-item task. */

import type { Track } from '../kml/parse'
import type { LatLng } from '../map/geo'

export interface PlacementQueueItem {
  id: string
  name: string
  file: File
  /** Already formatted for the note line under the filename — EXIF and a
      bare dropped file resolve "date" differently, and this module has no
      opinion on either. `null` when nothing readable was found. */
  captureLabel: string | null
  /** The resolved capture instant, for the suggestion ring's nearest-by-time
      lookup (`interpolate.ts`'s `nearestPointByTime`). `undefined` when no
      capture time could be resolved at all — in which case there is nothing
      to suggest against, trip open or not. */
  captureInstantMs: number | undefined
  /** The open trip's tracks at drop time, or `[]` if none was open —
      snapshotted here rather than read live, so the suggestion stays
      consistent through the item's life in the queue regardless of
      navigation. */
  tracks: Track[]
  /** Saves the file once a position is chosen — the Drive upload and all.
      Resolves the new cairn's id on success (so the caller can open its
      detail once the queue empties) or `false` on failure, in which case
      the caller leaves the item at the front of the queue rather than
      dropping it silently. */
  save: (position: LatLng) => Promise<string | false>
}

export interface PlacementQueueState {
  totalCount: number
  placedCount: number
  items: PlacementQueueItem[]
}

export const EMPTY_PLACEMENT_QUEUE: PlacementQueueState = { totalCount: 0, placedCount: 0, items: [] }

/** Adds one drop's worth of files to the queue: `resolvedCount` files that
    already saved themselves (EXIF or interpolation) count toward the total
    and the placed count immediately; `unresolved` join the queue itself.
    The "rapid repeat drops" edge case (`155-cairns-replace-photos.md`) is
    exactly this function called again on a queue that already has items —
    the new batch's total folds into the existing one rather than replacing
    it. */
export function enqueuePlacement(
  state: PlacementQueueState,
  resolvedCount: number,
  unresolved: PlacementQueueItem[],
): PlacementQueueState {
  if (resolvedCount === 0 && unresolved.length === 0) return state
  return {
    totalCount: state.totalCount + resolvedCount + unresolved.length,
    placedCount: state.placedCount + resolvedCount,
    items: [...state.items, ...unresolved],
  }
}

/** The current file has been placed — advances the queue and moves it into
    the placed count. A no-op on an empty queue rather than throwing, since
    a stray click after the queue has already emptied should do nothing
    rather than crash. */
export function placeCurrent(state: PlacementQueueState): PlacementQueueState {
  if (state.items.length === 0) return state
  return { ...state, placedCount: state.placedCount + 1, items: state.items.slice(1) }
}

/** Sends the current file to the back of the queue — it discards nothing,
    so the counts are untouched. A one-item queue has no "back" to send it
    to and is left alone. */
export function skipCurrent(state: PlacementQueueState): PlacementQueueState {
  if (state.items.length <= 1) return state
  const [first, ...rest] = state.items
  return { ...state, items: [...rest, first] }
}

/** Drops only what is still unplaced — everything already placed or
    auto-resolved stays counted in `placedCount` and `totalCount`, which is
    what lets a caller still say "3 placed" after discarding the other 2. */
export function discardRemaining(state: PlacementQueueState): PlacementQueueState {
  if (state.items.length === 0) return state
  return { ...state, items: [] }
}

/** `155-cairns-replace-photos.md`'s summary line, exactly:
    `5 photos · 3 placed · 2 need a location` / `5 photos · 4 placed · 1
    needs a location`. */
export function placementQueueSummary(state: PlacementQueueState): string {
  const remaining = state.items.length
  const photoWord = state.totalCount === 1 ? 'photo' : 'photos'
  const needWord = remaining === 1 ? 'needs a location' : 'need a location'
  return `${state.totalCount} ${photoWord} · ${state.placedCount} placed · ${remaining} ${needWord}`
}

/** `Discard 2` / `Discard 1` — the button's own label, singular where the
    summary line's is plural-or-singular by clause. */
export function discardLabel(state: PlacementQueueState): string {
  return `Discard ${state.items.length}`
}
