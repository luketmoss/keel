import { describe, expect, it } from 'vitest'
import { matchesTripFilters, tripDayIndex, tripIsDated, type TripFilters } from './tripFilters'
import type { TripIndexEntry } from './tripStore'

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 't1',
    name: 'Kepler Track',
    startDate: null,
    endDate: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    origin: null,
    photoCount: null,
    ...overrides,
  }
}

function baseFilters(overrides: Partial<TripFilters> = {}): TripFilters {
  return { status: 'all', name: '', range: null, ...overrides }
}

describe('tripIsDated', () => {
  it('is true only when startDate is set', () => {
    expect(tripIsDated(tripEntry({ startDate: '2024-03-01' }))).toBe(true)
    expect(tripIsDated(tripEntry({ startDate: null }))).toBe(false)
  })
})

describe('tripDayIndex', () => {
  it('uses startDate when present, createdAt otherwise', () => {
    const dated = tripEntry({ startDate: '2024-03-01', createdAt: '2020-01-01T00:00:00.000Z' })
    const undated = tripEntry({ startDate: null, createdAt: '2024-03-01T00:00:00.000Z' })

    expect(tripDayIndex(dated)).toBe(tripDayIndex(undated))
  })
})

describe('matchesTripFilters', () => {
  it('matches everything under the default (no-op) filters', () => {
    expect(matchesTripFilters(tripEntry(), baseFilters())).toBe(true)
  })

  it('filters by status', () => {
    const completed = tripEntry({ startDate: '2020-01-01', endDate: '2020-01-05' })
    expect(matchesTripFilters(completed, baseFilters({ status: 'planned' }))).toBe(false)
    expect(matchesTripFilters(completed, baseFilters({ status: 'completed' }))).toBe(true)
    expect(matchesTripFilters(completed, baseFilters({ status: 'all' }))).toBe(true)
  })

  it('filters by name, case-insensitively on any part of it', () => {
    const trip = tripEntry({ name: 'Kepler Track Day 1' })
    expect(matchesTripFilters(trip, baseFilters({ name: 'kepler' }))).toBe(true)
    expect(matchesTripFilters(trip, baseFilters({ name: 'TRACK' }))).toBe(true)
    expect(matchesTripFilters(trip, baseFilters({ name: 'alta via' }))).toBe(false)
  })

  it('ignores leading/trailing whitespace in the name filter', () => {
    expect(matchesTripFilters(tripEntry({ name: 'Kepler' }), baseFilters({ name: '  kepler  ' }))).toBe(true)
  })

  it('excludes a dated trip outside the range', () => {
    const trip = tripEntry({ startDate: '2020-01-01' })
    const day = tripDayIndex(trip)
    expect(matchesTripFilters(trip, baseFilters({ range: [day - 5, day - 1] }))).toBe(false)
    expect(matchesTripFilters(trip, baseFilters({ range: [day - 1, day + 1] }))).toBe(true)
  })

  it('keeps an undated trip visible at every range setting', () => {
    const trip = tripEntry({ startDate: null, createdAt: '2024-01-01T00:00:00.000Z' })
    expect(matchesTripFilters(trip, baseFilters({ range: [0, 0] }))).toBe(true)
  })

  it('composes status, name and range — all must pass', () => {
    const trip = tripEntry({ name: 'Kepler Track', startDate: '2024-03-01' })
    const day = tripDayIndex(trip)
    const passingRange = baseFilters({ status: 'completed', name: 'kepler', range: [day, day] })
    expect(matchesTripFilters(trip, passingRange)).toBe(true)

    const failingOnStatus = { ...passingRange, status: 'planned' as const }
    expect(matchesTripFilters(trip, failingOnStatus)).toBe(false)

    const failingOnName = { ...passingRange, name: 'alta via' }
    expect(matchesTripFilters(trip, failingOnName)).toBe(false)

    const failingOnRange: TripFilters = { ...passingRange, range: [day - 10, day - 5] }
    expect(matchesTripFilters(trip, failingOnRange)).toBe(false)
  })
})
