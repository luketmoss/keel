import { describe, expect, it } from 'vitest'
import { buildOverviewGeoJSON, computeTripOrigin, simplifyTrack } from './overview'
import type { Track, TrackPoint } from '../kml/parse'

/* A gentle curve with small zig-zag noise added to every interior point —
   enough points that most of them fall within tolerance of the chord between
   their neighbours and get dropped, but a real bend survives. */
function wobblyCurve(pointCount: number): TrackPoint[] {
  const points: TrackPoint[] = []
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1)
    const noise = i % 2 === 0 ? 0 : 0.00002
    points.push({ lat: 37 + t * 0.5 + noise, lon: -122 + t * 0.2 })
  }
  return points
}

describe('simplifyTrack', () => {
  it('passes a track with fewer than 3 points through unchanged', () => {
    const zero: TrackPoint[] = []
    const one: TrackPoint[] = [{ lat: 37, lon: -122 }]
    const two: TrackPoint[] = [
      { lat: 37, lon: -122 },
      { lat: 38, lon: -121 },
    ]

    expect(simplifyTrack(zero, 50)).toEqual(zero)
    expect(simplifyTrack(one, 50)).toEqual(one)
    expect(simplifyTrack(two, 50)).toEqual(two)
  })

  it('materially reduces point count on a wobbly fixture while preserving endpoints', () => {
    const points = wobblyCurve(200)

    const simplified = simplifyTrack(points, 50)

    expect(simplified.length).toBeLessThan(points.length * 0.5)
    expect(simplified[0]).toEqual(points[0])
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1])
  })

  it('keeps a real corner that exceeds tolerance', () => {
    /* A sharp turn roughly 11km off the chord between the endpoints — far
       past any reasonable tolerance, so it must survive simplification. */
    const points: TrackPoint[] = [
      { lat: 37, lon: -122 },
      { lat: 37.1, lon: -122 },
      { lat: 37, lon: -121.9 },
    ]

    const simplified = simplifyTrack(points, 50)

    expect(simplified).toHaveLength(3)
    expect(simplified[1]).toEqual(points[1])
  })

  it('drops a nearly-straight interior point within tolerance', () => {
    const points: TrackPoint[] = [
      { lat: 37, lon: -122 },
      { lat: 37.00001, lon: -121.95 },
      { lat: 37, lon: -121.9 },
    ]

    const simplified = simplifyTrack(points, 50)

    expect(simplified).toEqual([points[0], points[2]])
  })
})

describe('buildOverviewGeoJSON', () => {
  it('produces one LineString feature per non-empty track, in [lon, lat] order', () => {
    const tracks: Track[] = [
      {
        name: 'Day 1',
        points: [
          { lat: 37, lon: -122 },
          { lat: 37.1, lon: -122.1 },
        ],
      },
      {
        name: 'Empty',
        points: [],
      },
    ]

    const geojson = buildOverviewGeoJSON(tracks)

    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(1)
    const feature = geojson.features[0]
    expect(feature.geometry.type).toBe('LineString')
    expect(feature.geometry.coordinates[0]).toEqual([-122, 37])
    expect(feature.geometry.coordinates[1]).toEqual([-122.1, 37.1])
  })

  it('returns an empty FeatureCollection, not an error or null, for a trip with zero tracks', () => {
    const geojson = buildOverviewGeoJSON([])

    expect(geojson).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('leaves a track with fewer than 3 points unsimplified inside the collection', () => {
    const tracks: Track[] = [
      {
        name: 'Short',
        points: [
          { lat: 37, lon: -122 },
          { lat: 37.1, lon: -122.1 },
        ],
      },
    ]

    const geojson = buildOverviewGeoJSON(tracks, 50)

    expect(geojson.features[0].geometry.coordinates).toEqual([
      [-122, 37],
      [-122.1, 37.1],
    ])
  })

  it('is deterministic: identical input produces byte-identical JSON output', () => {
    const tracks: Track[] = [{ name: 'Loop', points: wobblyCurve(50) }]

    const first = JSON.stringify(buildOverviewGeoJSON(tracks))
    const second = JSON.stringify(buildOverviewGeoJSON(tracks))

    expect(first).toBe(second)
  })

  it('defaults to a 50 meter tolerance, and a smaller tolerance is a caller-visible parameter', () => {
    const tracks: Track[] = [{ name: 'Wobble', points: wobblyCurve(200) }]

    const atDefault = buildOverviewGeoJSON(tracks)
    const atZero = buildOverviewGeoJSON(tracks, 0)

    expect(atDefault.features[0].geometry.coordinates.length).toBeLessThan(
      atZero.features[0].geometry.coordinates.length,
    )
  })
})

describe('computeTripOrigin', () => {
  it('returns the first coordinate of the first track, converting lon/lat to lng/lat', () => {
    const tracks: Track[] = [
      { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
      { name: 'Day 2', points: [{ lat: 10, lon: 10 }] },
    ]

    expect(computeTripOrigin(tracks)).toEqual({ lat: 37, lng: -122 })
  })

  it('skips a leading empty track and uses the first point of the next non-empty one', () => {
    const tracks: Track[] = [
      { name: 'Flight (no points recorded)', points: [] },
      { name: 'Day 1', points: [{ lat: 37, lon: -122 }] },
    ]

    expect(computeTripOrigin(tracks)).toEqual({ lat: 37, lng: -122 })
  })

  it('returns null when there are no tracks, or every track is empty', () => {
    expect(computeTripOrigin([])).toBeNull()
    expect(computeTripOrigin([{ name: 'Empty', points: [] }])).toBeNull()
  })

  it('moves with reordering — the caller passes tracks in trip order, so a new first track wins', () => {
    const tracks: Track[] = [
      { name: 'Day 1', points: [{ lat: 37, lon: -122 }] },
      { name: 'Day 2', points: [{ lat: 51, lon: 0 }] },
    ]

    expect(computeTripOrigin(tracks)).toEqual({ lat: 37, lng: -122 })
    expect(computeTripOrigin([...tracks].reverse())).toEqual({ lat: 51, lng: 0 })
  })
})
