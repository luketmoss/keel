import { describe, expect, it } from 'vitest'
import { TRACK_COLORS, trackColor } from './palette'

describe('trackColor', () => {
  it('assigns the palette colours in order', () => {
    expect(trackColor(0)).toBe(TRACK_COLORS[0])
    expect(trackColor(1)).toBe(TRACK_COLORS[1])
    expect(trackColor(7)).toBe(TRACK_COLORS[7])
  })

  it('cycles once the palette is exhausted', () => {
    expect(trackColor(8)).toBe(TRACK_COLORS[0])
    expect(trackColor(9)).toBe(TRACK_COLORS[1])
  })
})
