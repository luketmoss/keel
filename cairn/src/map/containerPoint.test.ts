import { describe, expect, it } from 'vitest'
import { containerPointFromLatLng, latLngFromContainerPoint } from './containerPoint'

/* The long-press half of #156's gesture has no Maps event to read a
   coordinate off, so this conversion is the whole of it. Tested against the
   numbers rather than through a map, which is the point of it being pure. */

const VIEWPORT = { north: 40, south: 20, west: 100, east: 140 }

describe('latLngFromContainerPoint', () => {
  it('puts the centre of the element at the centre of the viewport', () => {
    expect(latLngFromContainerPoint(200, 100, 400, 200, VIEWPORT)).toEqual({ lat: 30, lng: 120 })
  })

  it('puts the top-left pixel at the north-west corner', () => {
    expect(latLngFromContainerPoint(0, 0, 400, 200, VIEWPORT)).toEqual({ lat: 40, lng: 100 })
  })

  it('puts the bottom-right pixel at the south-east corner', () => {
    expect(latLngFromContainerPoint(400, 200, 400, 200, VIEWPORT)).toEqual({ lat: 20, lng: 140 })
  })

  it('interpolates a quarter of the way across', () => {
    expect(latLngFromContainerPoint(100, 50, 400, 200, VIEWPORT)).toEqual({ lat: 35, lng: 110 })
  })

  /* A viewport straddling the antimeridian has `east` numerically smaller
     than `west`. Spanning `east - west` there would sweep the long way
     around the globe and put a press on the wrong side of the planet. */
  it('spans the short way across the antimeridian', () => {
    const straddling = { north: 10, south: -10, west: 170, east: -170 }

    // The centre is the antimeridian itself, which +180 and -180 both name.
    expect(Math.abs(latLngFromContainerPoint(50, 50, 100, 100, straddling)!.lng)).toBe(180)
    expect(latLngFromContainerPoint(50, 50, 100, 100, straddling)?.lat).toBe(0)
    expect(latLngFromContainerPoint(75, 50, 100, 100, straddling)?.lng).toBeCloseTo(-175, 10)
    expect(latLngFromContainerPoint(25, 50, 100, 100, straddling)?.lng).toBeCloseTo(175, 10)
  })

  it('wraps a longitude past the antimeridian back into range', () => {
    const straddling = { north: 10, south: -10, west: 170, east: -170 }
    const lng = latLngFromContainerPoint(100, 50, 100, 100, straddling)?.lng

    expect(lng).toBeGreaterThanOrEqual(-180)
    expect(lng).toBeLessThanOrEqual(180)
  })

  it('returns null for an element with no size rather than dividing by it', () => {
    expect(latLngFromContainerPoint(0, 0, 0, 0, VIEWPORT)).toBeNull()
    expect(latLngFromContainerPoint(10, 10, 400, 0, VIEWPORT)).toBeNull()
  })
})

describe('containerPointFromLatLng', () => {
  it('is the exact inverse of latLngFromContainerPoint', () => {
    for (const [x, y] of [[200, 100], [0, 0], [400, 200], [100, 50]]) {
      const latLng = latLngFromContainerPoint(x, y, 400, 200, VIEWPORT)!
      expect(containerPointFromLatLng(latLng, 400, 200, VIEWPORT)).toEqual({ x, y })
    }
  })

  it('spans the short way across the antimeridian', () => {
    const straddling = { north: 10, south: -10, west: 170, east: -170 }
    expect(containerPointFromLatLng({ lat: 0, lng: 180 }, 100, 100, straddling)).toEqual({ x: 50, y: 50 })
    expect(containerPointFromLatLng({ lat: 0, lng: -175 }, 100, 100, straddling)?.x).toBeCloseTo(75, 10)
  })

  it('returns null for an element with no size rather than dividing by it', () => {
    expect(containerPointFromLatLng({ lat: 30, lng: 120 }, 0, 0, VIEWPORT)).toBeNull()
  })
})
