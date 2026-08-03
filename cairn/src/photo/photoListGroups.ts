/* Builds the sidebar photo list's rows and grouping/ordering from #55's
   design doc — pure, no React, no DOM, mirroring `positionPhotos.ts` and
   `provenance.ts`'s "logic lives outside the component" convention so the
   ordering/grouping rules are testable without mounting anything.

   `photoImport.photos` (every imported photo, located or not) is the data
   source; `positionedPhotos` (already computed by `positionPhotos()`,
   unlocated ones filtered out) is cross-referenced only to know which
   photos have a marker and their `source`. Capture time is resolved with
   `resolvePhotoInstant`/`tripUtcOffsetHours` (interpolate.ts) directly —
   never reimplemented here. */

import type { Track } from '../kml/parse'
import { resolvePhotoInstant, tripUtcOffsetHours, type PhotoPositionSource } from './interpolate'
import type { PhotoRecord } from './photoIndex'
import type { PositionedPhoto } from './positionPhotos'

export interface PhotoListRow {
  id: string
  name: string
  thumbnailDriveFileId: string
  originalDriveFileId: string
  /** Epoch ms in UTC, from `resolvePhotoInstant` — `undefined` is the "no
      capture time" case (criterion 3, design doc's "No date" divider). */
  captureInstantMs?: number
  /** `undefined` for an unlocated photo — it never reached `positionPhotos`
      (design doc's Marker form section). */
  source?: PhotoPositionSource
  located: boolean
}

export type PhotoListDivider = 'no-date' | 'no-location'

export type PhotoListItem = { type: 'row'; row: PhotoListRow } | { type: 'divider'; divider: PhotoListDivider }

/** One row per photo in the trip, in no particular order yet —
    `orderPhotoListItems` below does the grouping/ordering. */
export function buildPhotoListRows(
  photos: PhotoRecord[],
  positioned: PositionedPhoto[],
  tracks: Track[],
): PhotoListRow[] {
  const offsetHours = tripUtcOffsetHours(tracks)
  const positionedById = new Map(positioned.map((photo) => [photo.id, photo]))

  return photos.map((photo) => {
    const position = positionedById.get(photo.id)
    return {
      id: photo.id,
      name: photo.name,
      thumbnailDriveFileId: photo.thumbnailDriveFileId,
      originalDriveFileId: photo.originalDriveFileId,
      captureInstantMs: resolvePhotoInstant(photo, offsetHours),
      source: position?.source,
      located: position !== undefined,
    }
  })
}

function byName(a: PhotoListRow, b: PhotoListRow): number {
  return a.name.localeCompare(b.name)
}

/** Dated-first-then-filename ordering, shared by the main chronological
    group and the "No location" group (design doc: a photo can be both
    undated and unlocated, and "No location" wins as the outer grouping —
    but within that group, dated photos still read chronologically rather
    than being scattered by filename). */
function byTimeThenName(a: PhotoListRow, b: PhotoListRow): number {
  if (a.captureInstantMs !== undefined && b.captureInstantMs !== undefined) {
    return a.captureInstantMs - b.captureInstantMs
  }
  if (a.captureInstantMs !== undefined) return -1
  if (b.captureInstantMs !== undefined) return 1
  return byName(a, b)
}

/** Groups and orders rows per the design doc's "The list" section:
    1. Located, dated photos — capture time ascending.
    2. Located, undated photos — under "No date", by filename.
    3. Unlocated photos (dated or not) — under "No location", at the end,
       dated-then-filename internally.
    A divider is only emitted when its group is non-empty. */
export function orderPhotoListItems(rows: PhotoListRow[]): PhotoListItem[] {
  const located = rows.filter((row) => row.located)
  const unlocated = rows.filter((row) => !row.located)

  const dated = located.filter((row) => row.captureInstantMs !== undefined)
  dated.sort((a, b) => (a.captureInstantMs as number) - (b.captureInstantMs as number))

  const undated = located.filter((row) => row.captureInstantMs === undefined)
  undated.sort(byName)

  const unlocatedSorted = [...unlocated].sort(byTimeThenName)

  const items: PhotoListItem[] = dated.map((row) => ({ type: 'row', row }))

  if (undated.length > 0) {
    items.push({ type: 'divider', divider: 'no-date' })
    for (const row of undated) items.push({ type: 'row', row })
  }

  if (unlocatedSorted.length > 0) {
    items.push({ type: 'divider', divider: 'no-location' })
    for (const row of unlocatedSorted) items.push({ type: 'row', row })
  }

  return items
}

/** Flattens `orderPhotoListItems`'s output back to just the rows, in the
    same displayed order — what the lightbox's arrow-key navigation walks
    (design doc: "← and → move through the list in its displayed order"). */
export function flattenPhotoListRows(items: PhotoListItem[]): PhotoListRow[] {
  return items.filter((item): item is { type: 'row'; row: PhotoListRow } => item.type === 'row').map((item) => item.row)
}

/** `HH:MM` in the trip's own local time (see `interpolate.ts`'s module
    comment on why that's `tripUtcOffsetHours`, not the browser's
    timezone) — `captureInstantMs` is a UTC instant, so the trip's offset
    is added back to recover the wall-clock digits it started from. */
export function formatCaptureTime(captureInstantMs: number, tripOffsetHours: number): string {
  const localMs = captureInstantMs + tripOffsetHours * 60 * 60 * 1000
  const date = new Date(localMs)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
