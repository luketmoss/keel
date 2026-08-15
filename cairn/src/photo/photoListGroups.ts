/* Builds the sidebar cairn list's rows and grouping/ordering from #55's
   design doc — pure, no React, no DOM, mirroring `provenance.ts`'s "logic
   lives outside the component" convention so the ordering/grouping rules
   are testable without mounting anything.

   A cairn always has a position now (`cairns.md`) — there is no more
   "unlocated" group; every cairn draws on the map and lists here. What's
   left of the old three-way split is dated vs. undated, since a cairn's
   `date` is still optional. */

import { resolvePhotoInstant, tripUtcOffsetHours } from './interpolate'
import type { CairnRecord } from './useCairnImport'
import type { Track } from '../kml/parse'
import type { PositionSource } from '../store/looseStore'

export interface PhotoListRow {
  id: string
  name: string
  thumbnailDriveFileId: string
  originalDriveFileId: string
  /** Epoch ms in UTC, from `resolvePhotoInstant` — `undefined` is the "no
      capture time" case (criterion 3, design doc's "No date" divider). */
  captureInstantMs?: number
  source: PositionSource
}

export type PhotoListDivider = 'no-date'

export type PhotoListItem = { type: 'row'; row: PhotoListRow } | { type: 'divider'; divider: PhotoListDivider }

/** One row per cairn carrying an image, in no particular order yet —
    `orderPhotoListItems` below does the grouping/ordering. A cairn with no
    image has nothing for this list (the photo sidebar) to show; #169's
    unified cairn list is what will fold icon-only cairns in. */
export function buildPhotoListRows(cairns: CairnRecord[], tracks: Track[]): PhotoListRow[] {
  const offsetHours = tripUtcOffsetHours(tracks)

  return cairns
    .filter((cairn): cairn is CairnRecord & { image: NonNullable<CairnRecord['image']> } => cairn.image !== null)
    .map((cairn) => ({
      id: cairn.id,
      name: cairn.name,
      thumbnailDriveFileId: cairn.image.thumbnailDriveFileId,
      originalDriveFileId: cairn.image.originalDriveFileId,
      captureInstantMs: resolvePhotoInstant(
        { gpsTimestamp: cairn.gpsTimestamp, dateTimeOriginal: cairn.dateTimeOriginal },
        offsetHours,
      ),
      source: cairn.positionSource,
    }))
}

function byName(a: PhotoListRow, b: PhotoListRow): number {
  return a.name.localeCompare(b.name)
}

/** Dated-first-then-filename ordering (design doc: "No date" group by
    filename). */
export function orderPhotoListItems(rows: PhotoListRow[]): PhotoListItem[] {
  const dated = rows.filter((row) => row.captureInstantMs !== undefined)
  dated.sort((a, b) => (a.captureInstantMs as number) - (b.captureInstantMs as number))

  const undated = rows.filter((row) => row.captureInstantMs === undefined)
  undated.sort(byName)

  const items: PhotoListItem[] = dated.map((row) => ({ type: 'row', row }))

  if (undated.length > 0) {
    items.push({ type: 'divider', divider: 'no-date' })
    for (const row of undated) items.push({ type: 'row', row })
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
