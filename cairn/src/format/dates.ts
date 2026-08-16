import { deriveTripStatus } from '../store/tripStore'
import { formatDistance, formatElevationGain } from './units'
import type { TripTotals } from '../geo/tripTotals'

/* Hair space + en dash + hair space, matching the header's existing range
   separator. A plain hyphen ("Aug 1 - 5") reads as a subtraction in the
   tabular numerals the design language mandates. */
const RANGE_DASH = ' – '

/** Splits `YYYY-MM-DD` into its fields and builds a local calendar date —
    never hands the string to the `Date` constructor, which parses it as UTC
    midnight and renders a day early at every negative UTC offset. Returns
    `null` for anything that isn't a real calendar date, so a hand-edited
    `trip.json` degrades to "show the raw string" rather than throwing. */
export function parseLocalDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  // Date rolls invalid fields over (e.g. day 32) rather than rejecting them —
  // reading the fields back is what catches that.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }

  return date
}

/** The inverse of `parseLocalDate` — a local calendar date back to
    `YYYY-MM-DD`. Built from the local fields rather than `toISOString()`,
    which converts to UTC first and lands on the previous day for anything
    east of Greenwich. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** `17 Jun 2023` — any ISO instant or date string, day-month-year, always
    with the year (unlike `formatTripDateRange`'s current-year omission,
    which doesn't apply to a single date standing alone). A string that
    doesn't parse is returned unchanged rather than thrown — the same
    "hand-edited data degrades to itself" stance `parseLocalDate` takes. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function monthDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function monthDayYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function dayOnly(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric' })
}

function singleDate(date: Date): string {
  return date.getFullYear() === new Date().getFullYear() ? monthDay(date) : monthDayYear(date)
}

/** `4 tracks`, `1 track`. Exported so the trips list row and the "Add to a
    trip" picker (`AddToTripPicker.tripChoiceLabel`) count the same way
    instead of carrying two copies of the same rule. */
export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** Exported for `TripsPanel.test.tsx`, which builds the expected accessible
    name from the same pieces `tripRowAccessibleName` composes it from,
    rather than duplicating the lowercasing rule as a second literal. */
export function lowercaseFirst(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1)
}

/** Formats a trip's date range for display. The one place both the trip
    header and the trips-list row read from, so the two can no longer
    disagree about what a stored date means. */
export function formatTripDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return 'No dates set'

  if (startDate && !endDate) {
    const start = parseLocalDate(startDate)
    return start ? `From ${singleDate(start)}` : startDate
  }

  if (!startDate && endDate) {
    const end = parseLocalDate(endDate)
    return end ? `Until ${singleDate(end)}` : endDate
  }

  const start = parseLocalDate(startDate as string)
  const end = parseLocalDate(endDate as string)

  if (!start || !end) {
    const startText = start ? monthDay(start) : (startDate as string)
    const endText = end ? monthDay(end) : (endDate as string)
    return `${startText}${RANGE_DASH}${endText}`
  }

  const currentYear = new Date().getFullYear()
  const sameYear = start.getFullYear() === end.getFullYear()

  if (!sameYear) {
    return `${monthDayYear(start)}${RANGE_DASH}${monthDayYear(end)}`
  }

  const sameMonth = start.getMonth() === end.getMonth()
  const base = sameMonth
    ? `${monthDay(start)}${RANGE_DASH}${dayOnly(end)}`
    : `${monthDay(start)}${RANGE_DASH}${monthDay(end)}`

  return start.getFullYear() === currentYear ? base : `${base}, ${start.getFullYear()}`
}

/** A trip row's meta line (#131, extended by #225): date range, track
    count, cairn count if it's known, then the trip's distance and ascent if
    they're known. The cairn half — and its separator — is omitted rather
    than shown as `0 photos`, the same rule #121 already applies to the
    picker: a trip whose cairns have never been counted says nothing about
    them rather than showing a zero it can't stand behind. Distance and
    ascent are appended the same way: present when `totals` is non-`null`,
    absent (both, together) otherwise — a missing, unreadable or stale
    sidecar reads exactly like a trip whose totals were never computed.
    Ascent alone drops further, per #7's unavailable rule, when the trip's
    tracks carry no elevation.
 *
 * The visible word stays `photos` for now — cairns replace photos at the
    model and storage layer here; the copy itself is the map/list/detail
    issue's to redo (`cairn: cairn markers, list and detail replace photo
    UI`). */
export function formatTripMetaLine(
  startDate: string | null,
  endDate: string | null,
  trackCount: number,
  cairnCount: number | null,
  totals: TripTotals | null,
): string {
  const parts = [formatTripDateRange(startDate, endDate), pluralize(trackCount, 'track')]
  if (cairnCount !== null) parts.push(pluralize(cairnCount, 'photo'))
  if (totals) {
    parts.push(formatDistance(totals.distanceMeters))
    const ascent = formatElevationGain(totals.elevationGainMeters)
    if (ascent !== undefined) parts.push(ascent)
  }
  return parts.join(' · ')
}

/** The trip row's accessible name (#131). The row's dot carries status
    visually and is `aria-hidden`, so dropping the word `planned`/`completed`
    from the visible meta line would drop it for a screen reader entirely —
    this restates it in words, the same way `AddToTripPicker.tripChoiceLabel`
    spells out `4T · 128P` for the picker. Commas rather than the meta
    line's middots, since a middot read aloud is noise.
    Status is derived from the same `startDate`/`endDate` this already takes
    (#147) rather than passed in separately, so there is no way for this and
    the row's dot to compute it from different inputs. */
export function tripRowAccessibleName(
  name: string,
  startDate: string | null,
  endDate: string | null,
  trackCount: number,
  cairnCount: number | null,
): string {
  const parts = [
    name,
    deriveTripStatus(startDate, endDate),
    lowercaseFirst(formatTripDateRange(startDate, endDate)),
    pluralize(trackCount, 'track'),
  ]
  if (cairnCount !== null) {
    parts.push(cairnCount === 0 ? 'no photos' : pluralize(cairnCount, 'photo'))
  }
  return parts.join(', ')
}
