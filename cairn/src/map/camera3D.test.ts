import { describe, expect, it } from 'vitest'
import { rangeToZoom, zoomToRange } from './camera3D'

describe('camera3D (#271)', () => {
  it('round-trips zoom through range and back', () => {
    const viewportHeight = 800
    for (const zoom of [2, 8, 12, 16]) {
      const range = zoomToRange(zoom, 37.7, viewportHeight)
      expect(rangeToZoom(range, 37.7, viewportHeight)).toBeCloseTo(zoom, 5)
    }
  })

  it('gives a larger range at a lower zoom, at the same latitude', () => {
    const a = zoomToRange(5, 0, 800)
    const b = zoomToRange(10, 0, 800)
    expect(a).toBeGreaterThan(b)
  })

  it('gives a smaller range for a taller viewport at the same zoom', () => {
    const short = zoomToRange(10, 0, 400)
    const tall = zoomToRange(10, 0, 1200)
    expect(tall).toBeGreaterThan(short)
  })

  it('does not divide by zero near the poles', () => {
    expect(Number.isFinite(zoomToRange(4, 89.9, 800))).toBe(true)
    expect(Number.isFinite(rangeToZoom(100000, -89.9, 800))).toBe(true)
  })
})
