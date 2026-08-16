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

/** #198 replaced the old `no-date` divider with this one. Undated cairns
    are unattached by definition — no date matches no track's days — so the
    group they used to have on their own is a strict subset of this one,
    and two headings would have split the same idea in half. Unlike the old
    divider, this one carries a control: the group's own eye. */
export type CairnListDivider = 'unattached'

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

/** Dated-first-then-filename ordering — dated by `date`, the field the row
    itself displays, not by the finer-grained `captureInstantMs` the old
    photo-only list sorted on. */
function orderWithinGroup(rows: CairnListRow[]): CairnListRow[] {
  const dated = rows.filter((row) => row.date !== null)
  dated.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime() || byName(a, b))

  const undated = rows.filter((row) => row.date === null)
  undated.sort(byName)

  return [...dated, ...undated]
}

/** The list's two groups: everything attached to a track, then #198's
    unattached group under its own heading.

    `unattachedIds` comes from `cairnAttachment.ts` and is the only thing
    that decides the split — the list does not re-derive the rule, so the
    heading, the map and the group's eye can never disagree about which
    cairns the eye owns. Passing an empty set gives one flat, ordered list,
    which is what a trip whose tracks cover every cairn's day looks like. */
export function orderCairnListItems(
  rows: CairnListRow[],
  unattachedIds: ReadonlySet<string> = new Set(),
): CairnListItem[] {
  const attached = orderWithinGroup(rows.filter((row) => !unattachedIds.has(row.id)))
  const unattached = orderWithinGroup(rows.filter((row) => unattachedIds.has(row.id)))

  const items: CairnListItem[] = attached.map((row) => ({ type: 'row', row }))

  if (unattached.length > 0) {
    items.push({ type: 'divider', divider: 'unattached' })
    for (const row of unattached) items.push({ type: 'row', row })
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
