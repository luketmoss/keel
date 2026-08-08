import { deriveTripStatus } from '../store/tripStore'

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

/** A trip row's meta line (#131): date range, track count, then photo count
    if it's known. The photo half — and its separator — is omitted rather
    than shown as `0 photos`, the same rule #121 already applies to the
    picker: a trip whose photos have never been counted says nothing about
    them rather than showing a zero it can't stand behind. */
export function formatTripMetaLine(
  startDate: string | null,
  endDate: string | null,
  trackCount: number,
  photoCount: number | null,
): string {
  const parts = [formatTripDateRange(startDate, endDate), pluralize(trackCount, 'track')]
  if (photoCount !== null) parts.push(pluralize(photoCount, 'photo'))
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
  photoCount: number | null,
): string {
  const parts = [
    name,
    deriveTripStatus(startDate, endDate),
    lowercaseFirst(formatTripDateRange(startDate, endDate)),
    pluralize(trackCount, 'track'),
  ]
  if (photoCount !== null) {
    parts.push(photoCount === 0 ? 'no photos' : pluralize(photoCount, 'photo'))
  }
  return parts.join(', ')
}
