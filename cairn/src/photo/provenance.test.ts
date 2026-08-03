import { describe, expect, it } from 'vitest'
import { clusterAriaLabel, clusterProvenance, markerAriaLabel, ringStyleForPhoto } from './provenance'

describe('ringStyleForPhoto', () => {
  it('gives a recorded (exif) photo a solid --text ring', () => {
    const ring = ringStyleForPhoto('exif', false)
    expect(ring).toEqual({
      borderStyle: 'solid',
      colorVar: '--text',
      widthVar: '--marker-ring',
      glow: false,
    })
  })

  it('gives a derived (interpolated) photo a dashed --text-muted ring, visually distinct from recorded (criterion 2)', () => {
    const ring = ringStyleForPhoto('interpolated', false)
    expect(ring).toEqual({
      borderStyle: 'dashed',
      colorVar: '--text-muted',
      widthVar: '--marker-ring',
      glow: false,
    })
    expect(ring).not.toEqual(ringStyleForPhoto('exif', false))
  })

  it('a selected marker gets the accent ring and glow regardless of provenance (criterion 7)', () => {
    expect(ringStyleForPhoto('exif', true)).toEqual({
      borderStyle: 'solid',
      colorVar: '--accent',
      widthVar: '--marker-ring-selected',
      glow: true,
    })
    expect(ringStyleForPhoto('interpolated', true)).toEqual({
      borderStyle: 'solid',
      colorVar: '--accent',
      widthVar: '--marker-ring-selected',
      glow: true,
    })
  })

  it('selection is visually distinct from either unselected state', () => {
    const selected = ringStyleForPhoto('exif', true)
    const unselectedRecorded = ringStyleForPhoto('exif', false)
    const unselectedDerived = ringStyleForPhoto('interpolated', false)
    expect(selected).not.toEqual(unselectedRecorded)
    expect(selected).not.toEqual(unselectedDerived)
  })
})

describe('clusterProvenance', () => {
  it('an all-recorded cluster reports exif', () => {
    expect(clusterProvenance([{ source: 'exif' }, { source: 'exif' }])).toBe('exif')
  })

  it('an all-derived cluster reports interpolated', () => {
    expect(clusterProvenance([{ source: 'interpolated' }, { source: 'interpolated' }])).toBe(
      'interpolated',
    )
  })

  it('a mixed cluster takes the weaker (interpolated) claim', () => {
    expect(clusterProvenance([{ source: 'exif' }, { source: 'interpolated' }])).toBe('interpolated')
  })

  it('order does not matter for the mixed case', () => {
    expect(clusterProvenance([{ source: 'interpolated' }, { source: 'exif' }])).toBe('interpolated')
  })
})

describe('markerAriaLabel', () => {
  it('recorded copy names the capture time when available', () => {
    expect(markerAriaLabel('exif', 'yesterday at 4pm')).toBe('Photo taken yesterday at 4pm')
  })

  it('recorded copy degrades gracefully with no capture time', () => {
    expect(markerAriaLabel('exif', undefined)).toBe('Photo taken')
  })

  it('derived copy says "estimated", never "interpolated"', () => {
    const label = markerAriaLabel('interpolated', 'yesterday at 4pm')
    expect(label).toBe('Photo, position estimated from track')
    expect(label).not.toMatch(/interpolat/i)
  })
})

describe('clusterAriaLabel', () => {
  it('names the count', () => {
    expect(clusterAriaLabel(2)).toBe('2 photos')
    expect(clusterAriaLabel(37)).toBe('37 photos')
  })
})
