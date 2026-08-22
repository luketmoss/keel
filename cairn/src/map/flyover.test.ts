import { describe, expect, it } from 'vitest'
import { frameGeometry, FLYOVER_MARGIN_PERCENT } from './flyover'

describe('frameGeometry (#274)', () => {
  it('returns null for no points — "no usable geometry"', () => {
    expect(frameGeometry([])).toBeNull()
  })

  it('centres on the bounding box of every point', () => {
    const framed = frameGeometry([
      { lat: 10, lng: 20 },
      { lat: 12, lng: 24 },
    ])
    expect(framed).not.toBeNull()
    expect(framed!.center).toEqual({ lat: 11, lng: 22 })
  })

  it('a larger span produces a larger range', () => {
    const small = frameGeometry([{ lat: 0, lng: 0 }, { lat: 0.01, lng: 0.01 }])!
    const large = frameGeometry([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])!
    expect(large.range).toBeGreaterThan(small.range)
  })

  it('a larger margin produces a larger range for the same points', () => {
    const points = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]
    const tighter = frameGeometry(points, 0)!
    const wider = frameGeometry(points, 40)!
    expect(wider.range).toBeGreaterThan(tighter.range)
  })

  it('floors the range for a single point so the camera cannot end up inside the terrain', () => {
    const framed = frameGeometry([{ lat: 45, lng: 9 }])!
    expect(framed.center).toEqual({ lat: 45, lng: 9 })
    expect(framed.range).toBeGreaterThanOrEqual(400)
  })

  it('floors the range for nearly-coincident points the same way', () => {
    const framed = frameGeometry([
      { lat: 45, lng: 9 },
      { lat: 45.00001, lng: 9.00001 },
    ])!
    expect(framed.range).toBeGreaterThanOrEqual(400)
  })

  it('defaults its margin to the shipped 20%', () => {
    const points = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]
    expect(frameGeometry(points)).toEqual(frameGeometry(points, FLYOVER_MARGIN_PERCENT))
  })

  it('frames a trip whose tracks are far apart as one box over all of them', () => {
    const points = [
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0.001 },
      { lat: 5, lng: 5 },
      { lat: 5.001, lng: 5.001 },
    ]
    const framed = frameGeometry(points)!
    // The centre sits between the two clusters, not on either one alone.
    expect(framed.center.lat).toBeGreaterThan(1)
    expect(framed.center.lat).toBeLessThan(4)
  })
})
