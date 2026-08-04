import { afterEach, describe, expect, it } from 'vitest'
import { formatTripDateRange } from './dates'

const currentYear = new Date().getFullYear()
const pastYear = currentYear - 2

describe('formatTripDateRange', () => {
  const originalTZ = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTZ
  })

  // The whole of the reported bug: new Date("YYYY-MM-DD") parses as UTC
  // midnight, which renders a day early at every negative offset. Sweeping
  // -10 through +12 covers the full range the acceptance criteria names.
  it('renders the stored calendar date at every UTC offset from -10 to +12, not a day early', () => {
    const offsetZones = ['Etc/GMT+10', 'Etc/GMT+5', 'UTC', 'Etc/GMT-5', 'Etc/GMT-12']

    for (const zone of offsetZones) {
      process.env.TZ = zone
      expect(formatTripDateRange('2026-08-01', null)).toBe('From Aug 1')
      expect(formatTripDateRange('2026-08-01', '2026-08-05')).toBe('Aug 1 – 5')
    }
  })

  it('renders no dates set when neither date is present, independent of any status', () => {
    expect(formatTripDateRange(null, null)).toBe('No dates set')
  })

  it('renders a same-month range compactly', () => {
    expect(formatTripDateRange(`${currentYear}-08-01`, `${currentYear}-08-05`)).toBe('Aug 1 – 5')
  })

  it('renders a same-year, different-month range with both months named', () => {
    expect(formatTripDateRange(`${currentYear}-08-01`, `${currentYear}-09-03`)).toBe('Aug 1 – Sep 3')
  })

  it('renders both years when the range crosses a year boundary', () => {
    expect(formatTripDateRange(`${currentYear}-12-28`, `${currentYear + 1}-01-02`)).toBe(
      `Dec 28, ${currentYear} – Jan 2, ${currentYear + 1}`,
    )
  })

  it('appends the year once when neither end is in the current year', () => {
    expect(formatTripDateRange(`${pastYear}-08-01`, `${pastYear}-08-05`)).toBe(`Aug 1 – 5, ${pastYear}`)
  })

  it('marks a start-only range with "From" and no end', () => {
    expect(formatTripDateRange(`${currentYear}-08-01`, null)).toBe('From Aug 1')
  })

  it('marks an end-only range with "Until" and no start', () => {
    expect(formatTripDateRange(null, `${currentYear}-08-05`)).toBe('Until Aug 5')
  })

  it('renders an end preceding its start exactly as stored, without reordering', () => {
    expect(formatTripDateRange(`${currentYear}-08-05`, `${currentYear}-08-01`)).toBe('Aug 5 – 1')
  })

  it('renders an unparseable single date verbatim instead of throwing', () => {
    expect(() => formatTripDateRange('not-a-date', null)).not.toThrow()
    expect(formatTripDateRange('not-a-date', null)).toBe('not-a-date')
  })

  it('renders an unparseable date range verbatim instead of throwing', () => {
    expect(() => formatTripDateRange('not-a-date', 'also-not-a-date')).not.toThrow()
    expect(formatTripDateRange('not-a-date', 'also-not-a-date')).toBe('not-a-date – also-not-a-date')
  })

  it('rejects a calendar date that rolls over instead of silently normalizing it', () => {
    expect(formatTripDateRange('2026-02-30', null)).toBe('2026-02-30')
  })
})
