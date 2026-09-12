import { describe, expect, it } from 'vitest'
import { LOCATE_MAX_ZOOM, accuracyCorners } from './locateCamera'
import type { PositionFix } from './useGeolocation'

function fix(lat: number, lng: number, accuracyMeters: number): PositionFix {
  return { position: { lat, lng }, accuracyMeters, at: 0 }
}

describe('accuracyCorners', () => {
  it('boxes the accuracy circle, centred on the fix', () => {
    const corners = accuracyCorners(fix(0, 0, 111_320))

    const lats = corners.map((c) => c.lat)
    const lngs = corners.map((c) => c.lng)
    expect(Math.max(...lats)).toBeCloseTo(1, 5)
    expect(Math.min(...lats)).toBeCloseTo(-1, 5)
    expect(Math.max(...lngs)).toBeCloseTo(1, 5)
    expect(Math.min(...lngs)).toBeCloseTo(-1, 5)
  })

  it('widens the longitude span towards the poles, where a degree is shorter', () => {
    const equator = accuracyCorners(fix(0, 0, 1_000))
    const north = accuracyCorners(fix(60, 0, 1_000))

    const span = (corners: { lng: number }[]) =>
      Math.max(...corners.map((c) => c.lng)) - Math.min(...corners.map((c) => c.lng))

    // cos(60°) is 0.5, so a metre buys twice the longitude there.
    expect(span(north)).toBeCloseTo(span(equator) * 2, 4)
  })

  it('grows the box with the accuracy — a coarse fix frames a wider area', () => {
    const tight = accuracyCorners(fix(40, -105, 10))
    const coarse = accuracyCorners(fix(40, -105, 3_000))

    const latSpan = (corners: { lat: number }[]) =>
      Math.max(...corners.map((c) => c.lat)) - Math.min(...corners.map((c) => c.lat))

    expect(latSpan(coarse)).toBeGreaterThan(latSpan(tight))
  })

  it('degenerates to the fix itself for a zero or missing accuracy', () => {
    expect(accuracyCorners(fix(5, 6, 0))).toEqual([{ lat: 5, lng: 6 }])
    expect(accuracyCorners(fix(5, 6, -1))).toEqual([{ lat: 5, lng: 6 }])
    expect(accuracyCorners(fix(5, 6, Number.NaN))).toEqual([{ lat: 5, lng: 6 }])
  })

  it('does not produce an infinitely wide box at the pole', () => {
    const corners = accuracyCorners(fix(90, 0, 1_000))

    for (const corner of corners) {
      expect(Number.isFinite(corner.lng)).toBe(true)
      expect(corner.lng).toBe(0)
    }
  })

  it('stops one step closer in than a track fit', () => {
    expect(LOCATE_MAX_ZOOM).toBe(17)
  })
})
