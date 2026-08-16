import { describe, expect, it } from 'vitest'
import { computeTripTotals, readTripTotals, SIDECAR_VERSION, type StoredOverview } from './tripTotals'
import { buildOverviewGeoJSON } from './overview'
import type { Track } from '../kml/parse'

function track(points: { lat: number; lon: number; elevation?: number }[]): Track {
  return { name: 't', points }
}

const flat: Track = track([
  { lat: 37, lon: -122 },
  { lat: 37.01, lon: -122 },
  { lat: 37.02, lon: -122 },
])

const climbing: Track = track(
  Array.from({ length: 10 }, (_, i) => ({ lat: 38 + i * 0.01, lon: -121, elevation: 100 + i * 50 })),
)

describe('computeTripTotals', () => {
  it('returns null for a trip with no tracks', () => {
    expect(computeTripTotals([])).toBeNull()
  })

  it('sums distance over every track and ascent over only the tracks that carry elevation', () => {
    const totals = computeTripTotals([flat, climbing])
    expect(totals).not.toBeNull()
    expect(totals!.distanceMeters).toBeGreaterThan(0)
    expect(totals!.elevationGainMeters).toBeGreaterThan(0)
  })

  it('leaves ascent undefined, not zero, when no track carries elevation', () => {
    const totals = computeTripTotals([flat])
    expect(totals).toEqual({ distanceMeters: expect.any(Number), elevationGainMeters: undefined })
  })
})

describe('readTripTotals', () => {
  it('returns null when there is no overview at all', () => {
    expect(readTripTotals(null)).toBeNull()
  })

  it('returns null when the sidecar carries no version stamp', () => {
    const overview = buildOverviewGeoJSON([climbing])
    expect(readTripTotals(overview)).toBeNull()
  })

  it('returns null when the sidecar was written under an older version', () => {
    const stale: StoredOverview = {
      ...buildOverviewGeoJSON([climbing]),
      version: SIDECAR_VERSION - 1,
      totals: { distanceMeters: 500, elevationGainMeters: 50 },
    }
    expect(readTripTotals(stale)).toBeNull()
  })

  it('returns the stored totals when the version matches', () => {
    const totals = computeTripTotals([climbing])
    const current: StoredOverview = { ...buildOverviewGeoJSON([climbing]), version: SIDECAR_VERSION, totals }
    expect(readTripTotals(current)).toEqual(totals)
  })

  it('returns null when the trip had no tracks at save time', () => {
    const current: StoredOverview = { ...buildOverviewGeoJSON([]), version: SIDECAR_VERSION, totals: null }
    expect(readTripTotals(current)).toBeNull()
  })
})
