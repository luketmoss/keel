import { describe, expect, it } from 'vitest'
import { dropInvalidLatitudes, normalizeAntimeridian } from './geo'
import type { TrackPoint } from '../kml/parse'

describe('dropInvalidLatitudes', () => {
  it('converts points to lat/lng and drops nothing when all are valid', () => {
    const points: TrackPoint[] = [
      { lat: 37, lon: -122 },
      { lat: -33.9, lon: 151.2 },
    ]

    expect(dropInvalidLatitudes(points)).toEqual([
      { lat: 37, lng: -122 },
      { lat: -33.9, lng: 151.2 },
    ])
  })

  it('drops a point beyond ±90 latitude and keeps the rest of the track', () => {
    const points: TrackPoint[] = [
      { lat: 10, lon: 20 },
      { lat: 95, lon: 20 }, // corrupt row
      { lat: 12, lon: 20 },
    ]

    expect(dropInvalidLatitudes(points)).toEqual([
      { lat: 10, lng: 20 },
      { lat: 12, lng: 20 },
    ])
  })
})

describe('normalizeAntimeridian', () => {
  it('leaves a track that never crosses the date line unchanged', () => {
    const points = [
      { lat: 37, lng: -122 },
      { lat: 37.1, lng: -122.1 },
    ]

    expect(normalizeAntimeridian(points)).toEqual(points)
  })

  it('offsets longitudes after a westward crossing so the path stays continuous', () => {
    const points = [
      { lat: -18, lng: 179.5 }, // Fiji, just west of the line
      { lat: -18, lng: -179.5 }, // just east of it — a 359° jump raw
    ]

    const result = normalizeAntimeridian(points)

    expect(result[0]).toEqual({ lat: -18, lng: 179.5 })
    expect(result[1]).toEqual({ lat: -18, lng: 180.5 })
    // The normalized path spans half a degree, not the long way around.
    expect(Math.abs(result[1].lng - result[0].lng)).toBeCloseTo(1, 5)
  })

  it('offsets longitudes after an eastward crossing symmetrically', () => {
    const points = [
      { lat: 60, lng: -179.5 }, // Alaska, just east of the line
      { lat: 60, lng: 179.5 }, // just west of it
    ]

    const result = normalizeAntimeridian(points)

    expect(result[0]).toEqual({ lat: 60, lng: -179.5 })
    expect(result[1]).toEqual({ lat: 60, lng: -180.5 })
    expect(Math.abs(result[1].lng - result[0].lng)).toBeCloseTo(1, 5)
  })

  it('returns an empty array unchanged', () => {
    expect(normalizeAntimeridian([])).toEqual([])
  })
})
