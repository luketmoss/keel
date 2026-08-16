import { describe, expect, it } from 'vitest'
import { computeTripTotals, readSampledElevation, readTripTotals, SIDECAR_VERSION, type StoredOverview } from './tripTotals'
import { buildOverviewGeoJSON } from './overview'
import type { Track } from '../kml/parse'
import type { StoredTrackElevation } from '../kml/stats'

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

  // #225's acceptance criteria: reordering a track (an `overrides.json`
  // concern, per the design note) must not change the displayed totals —
  // only the track *set* changing is a real edit. `formatDistance` and
  // `formatElevationGain` round to one decimal mile / whole feet, so this
  // compares at that resolution rather than the raw float, the same
  // precision a reader would actually notice a change at.
  it('is order-invariant, so a reorder produces the same displayed total', () => {
    const forward = computeTripTotals([flat, climbing])!
    const reversed = computeTripTotals([climbing, flat])!
    expect(Math.round(forward.distanceMeters)).toBe(Math.round(reversed.distanceMeters))
    expect(Math.round(forward.elevationGainMeters!)).toBe(Math.round(reversed.elevationGainMeters!))
  })

  // #224
  describe('with sampled elevation', () => {
    const sample: StoredTrackElevation = {
      elevationGainMeters: 300,
      elevationLossMeters: 50,
      highPointMeters: 400,
      lowPointMeters: 100,
      profile: [
        { distanceMeters: 0, elevationMeters: 100 },
        { distanceMeters: 1000, elevationMeters: 400 },
      ],
    }

    it('folds a sampled track into the total and marks it sampled', () => {
      const keyed: Track = { ...flat, key: 'flat-key' }
      const totals = computeTripTotals([keyed], { 'flat-key': sample })!
      expect(totals.elevationGainMeters).toBe(300)
      expect(totals.elevationSource).toBe('sampled')
    })

    it('never overwrites a track that already carries its own elevation', () => {
      const keyed: Track = { ...climbing, key: 'climbing-key' }
      const totals = computeTripTotals([keyed], { 'climbing-key': sample })!
      expect(totals.elevationGainMeters).not.toBe(300)
      expect(totals.elevationSource).toBeUndefined()
    })

    it('marks a mixed recorded/sampled total sampled — the weaker claim governs', () => {
      const keyedFlat: Track = { ...flat, key: 'flat-key' }
      const totals = computeTripTotals([keyedFlat, climbing], { 'flat-key': sample })!
      expect(totals.elevationSource).toBe('sampled')
    })

    it('ignores the cache entirely for a track with no key', () => {
      const totals = computeTripTotals([flat], { 'flat-key': sample })!
      expect(totals.elevationGainMeters).toBeUndefined()
    })
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

// #224
describe('readSampledElevation', () => {
  const sample: StoredTrackElevation = {
    elevationGainMeters: 300,
    elevationLossMeters: 50,
    highPointMeters: 400,
    lowPointMeters: 100,
    profile: [],
  }

  it('returns an empty map when there is no overview at all', () => {
    expect(readSampledElevation(null)).toEqual({})
  })

  it('returns an empty map when the sidecar carries no version stamp', () => {
    const overview = buildOverviewGeoJSON([climbing])
    expect(readSampledElevation(overview)).toEqual({})
  })

  it('returns an empty map when the sidecar was written under an older version', () => {
    const stale: StoredOverview = {
      ...buildOverviewGeoJSON([climbing]),
      version: SIDECAR_VERSION - 1,
      sampledElevation: { 'a-key': sample },
    }
    expect(readSampledElevation(stale)).toEqual({})
  })

  it('returns the stored cache when the version matches', () => {
    const current: StoredOverview = {
      ...buildOverviewGeoJSON([climbing]),
      version: SIDECAR_VERSION,
      sampledElevation: { 'a-key': sample },
    }
    expect(readSampledElevation(current)).toEqual({ 'a-key': sample })
  })
})
