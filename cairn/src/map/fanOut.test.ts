import { describe, expect, it } from 'vitest'
import { clusterSeparatesAtZoom, fanOutPositions } from './fanOut'
import { project } from './cluster'

const FOOTPRINT = 28
const CAP = 20

describe('clusterSeparatesAtZoom', () => {
  it('says yes for members a zoom-to-fit can still pull apart', () => {
    // ~110m apart — hundreds of pixels at the cap.
    const members = [
      { lat: 10, lng: 20 },
      { lat: 10.001, lng: 20.001 },
    ]
    expect(clusterSeparatesAtZoom(members, CAP, FOOTPRINT)).toBe(true)
  })

  it('says no for members a few metres apart — the case that used to do nothing', () => {
    // ~1.5m apart: under one marker footprint even at the cap.
    const members = [
      { lat: 10, lng: 20 },
      { lat: 10.00001, lng: 20.00001 },
    ]
    expect(clusterSeparatesAtZoom(members, CAP, FOOTPRINT)).toBe(false)
  })

  it('says no for byte-identical coordinates, at any zoom', () => {
    const members = [
      { lat: 10, lng: 20 },
      { lat: 10, lng: 20 },
      { lat: 10, lng: 20 },
    ]
    expect(clusterSeparatesAtZoom(members, CAP, FOOTPRINT)).toBe(false)
    expect(clusterSeparatesAtZoom(members, 30, FOOTPRINT)).toBe(false)
  })
})

describe('fanOutPositions', () => {
  const anchor = { lat: 10, lng: 20 }

  it('places every member at the fan radius from the anchor, in pixels', () => {
    const placements = fanOutPositions(anchor, 5, 18, FOOTPRINT)
    const origin = project(anchor.lat, anchor.lng, 18)

    expect(placements).toHaveLength(5)
    for (const placement of placements) {
      const point = project(placement.lat, placement.lng, 18)
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y)
      expect(distance).toBeCloseTo(placement.radiusPx, 3)
    }
  })

  it('separates every member by more than a marker footprint', () => {
    const placements = fanOutPositions(anchor, 8, 18, FOOTPRINT)
    const points = placements.map((placement) => project(placement.lat, placement.lng, 18))

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThan(FOOTPRINT)
      }
    }
  })

  it('grows its radius with the member count so a large cluster still fits', () => {
    const small = fanOutPositions(anchor, 2, 18, FOOTPRINT)[0].radiusPx
    const large = fanOutPositions(anchor, 20, 18, FOOTPRINT)[0].radiusPx
    expect(large).toBeGreaterThan(small)
  })

  it('starts at the top and sweeps clockwise', () => {
    const placements = fanOutPositions(anchor, 4, 18, FOOTPRINT)
    const origin = project(anchor.lat, anchor.lng, 18)
    const points = placements.map((placement) => project(placement.lat, placement.lng, 18))

    expect(placements.map((placement) => placement.angleDeg)).toEqual([0, 90, 180, 270])
    // Projected y grows downward, so "up" is a smaller y than the anchor's.
    expect(points[0].y).toBeLessThan(origin.y)
    expect(points[1].x).toBeGreaterThan(origin.x)
    expect(points[2].y).toBeGreaterThan(origin.y)
    expect(points[3].x).toBeLessThan(origin.x)
  })

  it('returns nothing for an empty cluster rather than dividing by zero', () => {
    expect(fanOutPositions(anchor, 0, 18, FOOTPRINT)).toEqual([])
  })
})
