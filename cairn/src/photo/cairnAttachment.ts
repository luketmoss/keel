/* #198 — which cairns a track file covers, and which cairns are therefore
   showing on the map. Pure module: no React, no DOM, no Drive I/O, the
   same convention `interpolate.ts` and `cairnListGroups.ts` already keep,
   so the rule is testable without mounting anything.

   The rule, one sentence: **a cairn's visibility follows the tracks of the
   day it happened on.** A track file covers the calendar days its timed
   points fall on; a cairn is attached to every file covering its own day;
   an attached cairn shows while any file it is attached to is showing.

   Local, always, in the trip's own offset — `tripUtcOffsetHours`, the same
   longitude-derived offset interpolation uses, and never the browser's
   timezone. A trip walked in Nepal and reviewed in Sydney has to group by
   the days it was walked on, not by where the reader is sitting.

   Attachment is computed per *file* rather than per `Track`, because a file
   is what carries the eye control — its coverage is the union of the days
   its own tracks cover. A file whose tracks carry no timestamps covers no
   days and so attaches nothing, which is what makes hiding it affect no
   cairn at all. */

import { tripUtcOffsetHours } from './interpolate'
import type { Track } from '../kml/parse'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** The subset of `ImportedFile` this module reads — accepting the narrow
    shape rather than the whole record keeps the rule testable from a
    literal, and keeps `import/types` out of the pure layer. */
export interface AttachableTrackFile {
  id: string
  tracks: Track[]
  visible: boolean
}

/** The subset of `CairnRecord` this module reads. `date` is the field the
    row already displays — `gpsTimestamp ?? dateTimeOriginal ?? null` as
    `useCairnImport` writes it, so it arrives in one of the three shapes
    `localDay` below knows how to read. */
export interface AttachableCairn {
  id: string
  date: string | null
}

/** True for an ISO string that pins its own instant — a `Z` suffix (every
    `gpsTimestamp` and track `time` in this codebase) or an explicit
    `±HH:MM`. Everything else is wall-clock digits with no zone, which is
    what `dateTimeOriginal` and a hand-entered date both are. */
function isAbsolute(iso: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso)
}

/** `YYYY-MM-DD` for an epoch instant read in a UTC offset of
    `offsetHours` — the offset is added onto the instant and the *UTC*
    calendar fields are then read off, which is the same trick
    `formatCaptureTime` uses to recover local wall-clock digits. */
function dayKeyFromInstant(instantMs: number, offsetHours: number): string {
  return new Date(instantMs + offsetHours * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** The local calendar day a cairn's or a point's timestamp falls on, in the
    trip's offset. An absolute instant is shifted into that offset first; a
    wall-clock string is already local, so its leading `YYYY-MM-DD` is the
    answer untouched — shifting it would move a photo taken at 23:30 onto
    the wrong day for no reason. `null` for a missing or unreadable date. */
export function localDay(date: string | null, offsetHours: number): string | null {
  if (date === null) return null
  if (isAbsolute(date)) {
    const ms = Date.parse(date)
    return Number.isNaN(ms) ? null : dayKeyFromInstant(ms, offsetHours)
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(date)
  return match ? match[1] : null
}

/** Every local day a file's tracks cover, first to last **inclusive** —
    the days between the first and last timed point, not only the two ends,
    so an overnight leg with no points at midday still covers the day it
    crossed. Empty for a file whose tracks carry no timed points at all,
    which is the whole of "attaches nothing". */
export function fileDayCoverage(tracks: Track[], offsetHours: number): Set<string> {
  const instants: number[] = []
  for (const track of tracks) {
    for (const point of track.points) {
      if (point.time === undefined) continue
      const ms = Date.parse(point.time)
      if (Number.isNaN(ms)) continue
      instants.push(ms)
    }
  }
  if (instants.length === 0) return new Set()

  const shift = offsetHours * 60 * 60 * 1000
  const first = Math.min(...instants) + shift
  const last = Math.max(...instants) + shift
  // Walk whole days from the first local midnight, so the span is filled
  // rather than only its endpoints.
  const startDay = Math.floor(first / MS_PER_DAY) * MS_PER_DAY
  const days = new Set<string>()
  for (let dayMs = startDay; dayMs <= last; dayMs += MS_PER_DAY) {
    days.add(new Date(dayMs).toISOString().slice(0, 10))
  }
  return days
}

/** Cairn id -> the ids of every track file covering its day, in `files`
    order. An empty array means **unattached**: no file's days match, or the
    cairn has no date at all, or the trip's tracks carry no times. Every
    cairn gets an entry, so a caller never has to distinguish "unattached"
    from "not looked at". */
export function cairnAttachments(
  cairns: AttachableCairn[],
  files: AttachableTrackFile[],
): Map<string, string[]> {
  const offsetHours = tripUtcOffsetHours(files.flatMap((file) => file.tracks))
  const coverage = files.map((file) => ({ id: file.id, days: fileDayCoverage(file.tracks, offsetHours) }))

  const attachments = new Map<string, string[]>()
  for (const cairn of cairns) {
    const day = localDay(cairn.date, offsetHours)
    attachments.set(
      cairn.id,
      day === null ? [] : coverage.filter((file) => file.days.has(day)).map((file) => file.id),
    )
  }
  return attachments
}

/** The ids of every cairn currently showing on the map. An attached cairn
    shows while **any** file it is attached to is showing — `some`, not
    `every`, which is what makes a cairn on a day two tracks both cover
    survive one of them being hidden. An unattached one answers to
    `unattachedVisible` alone, its own control and nothing else, so the rule
    can never make something unreachable. */
export function visibleCairnIds(
  cairns: AttachableCairn[],
  files: AttachableTrackFile[],
  unattachedVisible: boolean,
): Set<string> {
  const attachments = cairnAttachments(cairns, files)
  const visibleFileIds = new Set(files.filter((file) => file.visible).map((file) => file.id))

  const showing = new Set<string>()
  for (const cairn of cairns) {
    const attachedTo = attachments.get(cairn.id) ?? []
    const showed =
      attachedTo.length === 0 ? unattachedVisible : attachedTo.some((id) => visibleFileIds.has(id))
    if (showed) showing.add(cairn.id)
  }
  return showing
}

/** The ids of every cairn attached to no track — the group that gets its
    own heading and its own eye in the list. */
export function unattachedCairnIds(
  cairns: AttachableCairn[],
  files: AttachableTrackFile[],
): Set<string> {
  const attachments = cairnAttachments(cairns, files)
  return new Set(cairns.filter((cairn) => (attachments.get(cairn.id) ?? []).length === 0).map((c) => c.id))
}
