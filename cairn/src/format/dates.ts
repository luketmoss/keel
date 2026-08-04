/* Hair space + en dash + hair space, matching the header's existing range
   separator. A plain hyphen ("Aug 1 - 5") reads as a subtraction in the
   tabular numerals the design language mandates. */
const RANGE_DASH = ' – '

/** Splits `YYYY-MM-DD` into its fields and builds a local calendar date —
    never hands the string to the `Date` constructor, which parses it as UTC
    midnight and renders a day early at every negative UTC offset. Returns
    `null` for anything that isn't a real calendar date, so a hand-edited
    `trip.json` degrades to "show the raw string" rather than throwing. */
function parseLocalDate(iso: string): Date | null {
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
