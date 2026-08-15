/* Builds the sidebar cairn list's rows and grouping/ordering from
   `cairns.md`'s "Markers, rows and chips" — pure, no React, no DOM,
   mirroring `provenance.ts`'s "logic lives outside the component"
   convention so the ordering/grouping rules are testable without mounting
   anything.

   Every cairn in the trip is a row now (#169) — not just the ones carrying
   an image, which is what this list showed before the marker/list rework.
   An icon-only cairn has nothing for a lightbox to open, but it still has
   a name, a position and a meta line, so it belongs in the same list. */

import { resolvePhotoInstant, tripUtcOffsetHours } from './interpolate'
import type { CairnRecord } from './useCairnImport'
import type { Track } from '../kml/parse'
import { cairnMetaClauses, type CairnIcon, type PositionSource } from '../store/looseStore'
import { formatShortDate } from '../format/dates'

export interface CairnListRow {
  id: string
  name: string
  icon: CairnIcon | null
  thumbnailDriveFileId: string | null
  originalDriveFileId: string | null
  date: string | null
  /** Epoch ms in UTC, from `resolvePhotoInstant` — present only for a
      cairn with EXIF time fields, used for the lightbox's own caption.
      Ordering/grouping below reads `date`, not this. */
  captureInstantMs?: number
  source: PositionSource
}

export type CairnListDivider = 'no-date'

export type CairnListItem = { type: 'row'; row: CairnListRow } | { type: 'divider'; divider: CairnListDivider }

/** One row per cairn in the trip, in no particular order yet —
    `orderCairnListItems` below does the grouping/ordering. */
export function buildCairnListRows(cairns: CairnRecord[], tracks: Track[]): CairnListRow[] {
  const offsetHours = tripUtcOffsetHours(tracks)

  return cairns.map((cairn) => ({
    id: cairn.id,
    name: cairn.name,
    icon: cairn.icon,
    thumbnailDriveFileId: cairn.image?.thumbnailDriveFileId ?? null,
    originalDriveFileId: cairn.image?.originalDriveFileId ?? null,
    date: cairn.date,
    captureInstantMs: resolvePhotoInstant(
      { gpsTimestamp: cairn.gpsTimestamp, dateTimeOriginal: cairn.dateTimeOriginal },
      offsetHours,
    ),
    source: cairn.positionSource,
  }))
}

function byName(a: CairnListRow, b: CairnListRow): number {
  return a.name.localeCompare(b.name)
}

/** Dated-first-then-filename ordering (design doc: "No date" group by
    filename) — dated by `date`, the field the row itself displays, not by
    the finer-grained `captureInstantMs` the old photo-only list sorted on. */
export function orderCairnListItems(rows: CairnListRow[]): CairnListItem[] {
  const dated = rows.filter((row) => row.date !== null)
  dated.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime() || byName(a, b))

  const undated = rows.filter((row) => row.date === null)
  undated.sort(byName)

  const items: CairnListItem[] = dated.map((row) => ({ type: 'row', row }))

  if (undated.length > 0) {
    items.push({ type: 'divider', divider: 'no-date' })
    for (const row of undated) items.push({ type: 'row', row })
  }

  return items
}

/** Flattens `orderCairnListItems`'s output back to just the rows, in the
    same displayed order — what the lightbox's arrow-key navigation walks
    (design doc: "← and → move through the list in its displayed order"). */
export function flattenCairnListRows(items: CairnListItem[]): CairnListRow[] {
  return items.filter((item): item is { type: 'row'; row: CairnListRow } => item.type === 'row').map((item) => item.row)
}

/** The row's meta line (`cairns.md`'s "The row" table): a date clause,
    then the icon and photo clauses `cairnMetaClauses` already pins —
    `13 Jun 2023 · campsite · photo`, `14 Aug 2026 · cairn` for neither. */
export function cairnRowMetaLine(row: CairnListRow): string {
  const when = row.date ? formatShortDate(row.date) : 'undated'
  const image = row.thumbnailDriveFileId ? { originalDriveFileId: '', thumbnailDriveFileId: '' } : null
  return [when, ...cairnMetaClauses({ icon: row.icon, image })].join(' · ')
}

/** `HH:MM` in the trip's own local time (see `interpolate.ts`'s module
    comment on why that's `tripUtcOffsetHours`, not the browser's
    timezone) — `captureInstantMs` is a UTC instant, so the trip's offset
    is added back to recover the wall-clock digits it started from. Used
    only by the lightbox's caption now; the list row's own date comes from
    `cairnRowMetaLine` above. */
export function formatCaptureTime(captureInstantMs: number, tripOffsetHours: number): string {
  const localMs = captureInstantMs + tripOffsetHours * 60 * 60 * 1000
  const date = new Date(localMs)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}
