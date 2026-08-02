/* Positions photos that carry no GPS by interpolating against a trip's track time (#52).
   Pure module — no React, no DOM, no Drive I/O.

   The hard part is timezone, not arithmetic. `PhotoExif.gpsTimestamp` (when present) is
   already an absolute UTC instant and needs no help. `PhotoExif.dateTimeOriginal` is wall-clock
   local time with no zone recorded, so it needs an offset from somewhere — and that somewhere is
   explicitly NOT the browser's timezone (`Intl.DateTimeFormat`, `getTimezoneOffset`, etc.), which
   reports where whoever is running this code happens to be sitting *right now*, not where the
   trip happened. The offset instead defaults from the longitude of the trip's own tracks:
   offsetHours ≈ round(longitude / 15). Nothing fancier — no timezone-database lookup. */

import type { PhotoExif } from './exif'
import type { Track, TrackPoint } from '../kml/parse'

/** A track point bracketing search treats every track's points as one flat, time-sorted pool —
    points with no `time` are excluded outright, since there is nothing to bracket against. */
type TimedTrackPoint = TrackPoint & { time: string }

export type PhotoPositionSource = 'exif' | 'interpolated'

export interface PhotoPosition {
  latitude: number
  longitude: number
  source: PhotoPositionSource
}

/** A photo whose capture time falls in a gap this wide or wider between two consecutive track
    points is not positioned — see acceptance criterion 7. */
export const MAX_INTERPOLATION_GAP_MS = 10 * 60 * 1000

/** The subset of `PhotoExif` this module reads. Accepts `PhotoExif` itself, or any smaller shape
    a caller has already narrowed to. */
export type InterpolatablePhoto = Pick<
  PhotoExif,
  'latitude' | 'longitude' | 'gpsTimestamp' | 'dateTimeOriginal'
>

/** Whether a photo needs interpolation at all — false when it already carries its own recorded
    position, in which case that position wins outright (acceptance criterion 3). `latitude` and
    `longitude` are only ever both present or both absent (see `PhotoExif`), so checking one is
    equivalent to checking both, but both are checked for clarity. */
export function needsInterpolation(photo: InterpolatablePhoto): boolean {
  return photo.latitude === undefined || photo.longitude === undefined
}

/** Parses an ISO 8601 instant that already carries an explicit UTC marker (a `Z` suffix, as every
    `gpsTimestamp` and track `time` in this codebase does) into epoch milliseconds. Deliberately
    not used for wall-clock strings with no zone — `Date.parse`/`new Date(...)` on those falls
    back to interpreting them in the host's local timezone, which is exactly the browser-timezone
    dependency this module must avoid. Returns `undefined` for anything unparseable rather than
    producing `NaN` for callers to trip over. */
function parseUtcInstant(iso: string): number | undefined {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? undefined : ms
}

/** Parses a wall-clock ISO string with no timezone (`YYYY-MM-DDTHH:MM:SS`, the shape
    `PhotoExif.dateTimeOriginal` is always in) into the epoch milliseconds those calendar/clock
    fields would be *if read as UTC* — i.e. `Date.UTC` on the literal digits, not `Date.parse`,
    which would otherwise interpret the string in the host's local timezone. This is a caller's
    building block, not an instant on its own; the trip's UTC offset still has to be applied
    (subtracted) on top to get the real UTC instant. */
function wallClockAsUtcMs(iso: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(iso)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second] = match
  const ms = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  return Number.isNaN(ms) ? undefined : ms
}

/** The trip's default UTC offset in whole hours, derived from the mean longitude of every point
    across every track — never from the browser's timezone (see module doc comment). Roughly 15
    degrees of longitude per hour of solar time. A trip with no track points at all (or none
    carrying a longitude, which cannot happen per `TrackPoint`'s shape but is guarded regardless)
    defaults to UTC+0 — there is nothing to derive an offset from, and `dateTimeOriginal` alone is
    unresolvable without one; see acceptance criterion 10, where the absence of track *times*
    (not points) is what actually starves interpolation. */
export function tripUtcOffsetHours(tracks: Track[]): number {
  const longitudes = tracks.flatMap((track) => track.points.map((point) => point.lon))
  if (longitudes.length === 0) return 0
  const mean = longitudes.reduce((sum, lon) => sum + lon, 0) / longitudes.length
  return Math.round(mean / 15)
}

/** Resolves a photo's capture instant to epoch milliseconds, per the resolution order in the
    issue: `gpsTimestamp` first (already absolute UTC, used directly, no offset applied — see
    acceptance criteria 4), falling back to `dateTimeOriginal` plus the trip's UTC offset
    (acceptance criterion 5). `undefined` when neither field is present or parseable. */
export function resolvePhotoInstant(photo: InterpolatablePhoto, tripOffsetHours: number): number | undefined {
  if (photo.gpsTimestamp !== undefined) {
    return parseUtcInstant(photo.gpsTimestamp)
  }
  if (photo.dateTimeOriginal !== undefined) {
    const wallClockMs = wallClockAsUtcMs(photo.dateTimeOriginal)
    if (wallClockMs === undefined) return undefined
    return wallClockMs - tripOffsetHours * 60 * 60 * 1000
  }
  return undefined
}

function hasTime(point: TrackPoint): point is TimedTrackPoint {
  return point.time !== undefined
}

/** A timed track point with its `time` pre-parsed to epoch milliseconds, so the bracket search
    below never re-parses a timestamp it's already looked at. */
interface ResolvedTrackPoint extends TimedTrackPoint {
  timeMs: number
}

/** Every timed point across every track in the trip, flattened into one time-sorted pool. Points
    from different tracks are not kept separate — the issue interpolates against "a trip's
    tracks" as a whole, not track-by-track. Points with no `time` (or an unparseable one) are
    dropped: a trip whose tracks carry no timestamps at all yields an empty pool here, which is
    what makes acceptance criterion 10 (no timestamps anywhere → interpolates nothing, no error)
    fall out for free. */
function timedPointPool(tracks: Track[]): ResolvedTrackPoint[] {
  const resolved: ResolvedTrackPoint[] = []
  for (const track of tracks) {
    for (const point of track.points) {
      if (!hasTime(point)) continue
      const timeMs = parseUtcInstant(point.time)
      if (timeMs === undefined) continue
      resolved.push({ ...point, timeMs })
    }
  }
  return resolved.sort((a, b) => a.timeMs - b.timeMs)
}

/** Interpolates a position for capture instant `instantMs` against `tracks`. Finds the two
    consecutive timed track points bracketing the instant and interpolates proportionally to
    elapsed time between them (acceptance criteria 1 and 2) — never the midpoint. Returns
    `undefined` (never a snapped-to-nearest-endpoint guess) when:
      - there are no timed track points at all (acceptance criterion 10)
      - the instant falls before the first point or after the last (acceptance criterion 8)
      - the bracketing points are more than `MAX_INTERPOLATION_GAP_MS` apart (acceptance criterion 7) */
export function interpolatePosition(instantMs: number, tracks: Track[]): PhotoPosition | undefined {
  const points = timedPointPool(tracks)
  if (points.length === 0) return undefined

  for (let i = 0; i < points.length - 1; i += 1) {
    const before = points[i]
    const after = points[i + 1]
    const beforeMs = before.timeMs
    const afterMs = after.timeMs

    if (instantMs < beforeMs || instantMs > afterMs) continue

    const gapMs = afterMs - beforeMs
    if (gapMs > MAX_INTERPOLATION_GAP_MS) return undefined

    if (gapMs === 0) {
      return { latitude: before.lat, longitude: before.lon, source: 'interpolated' }
    }

    const fraction = (instantMs - beforeMs) / gapMs
    return {
      latitude: before.lat + (after.lat - before.lat) * fraction,
      longitude: before.lon + (after.lon - before.lon) * fraction,
      source: 'interpolated',
    }
  }

  return undefined
}

/** The end-to-end entry point: given a photo and its trip's tracks, decides whether the photo
    needs interpolation at all, and if so resolves its capture instant and interpolates a
    position. A photo with its own recorded position always wins outright (acceptance criterion
    3) with `source: 'exif'`; everything else goes through the offset-and-interpolate path above
    and comes back `source: 'interpolated'`, or `undefined` when it can't be positioned. */
export function positionPhoto(photo: InterpolatablePhoto, tracks: Track[]): PhotoPosition | undefined {
  if (!needsInterpolation(photo)) {
    return { latitude: photo.latitude as number, longitude: photo.longitude as number, source: 'exif' }
  }

  const tripOffsetHours = tripUtcOffsetHours(tracks)
  const instantMs = resolvePhotoInstant(photo, tripOffsetHours)
  if (instantMs === undefined) return undefined

  return interpolatePosition(instantMs, tracks)
}
