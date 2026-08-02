import { describe, expect, it } from 'vitest'
import { formatDistance, formatDuration, formatElevationGain, formatStatsLine } from './units'

describe('formatDistance', () => {
  it('shows one decimal of miles at or above a tenth of a mile', () => {
    expect(formatDistance(12.4 * 1609.344)).toBe('12.4 mi')
  })

  it('shows whole feet below a tenth of a mile', () => {
    expect(formatDistance(340 * 0.3048)).toBe('340 ft')
  })
})

describe('formatDuration', () => {
  it('is undefined when there is no duration', () => {
    expect(formatDuration(undefined)).toBeUndefined()
  })

  it('shows hours and minutes at or above one hour', () => {
    expect(formatDuration(3 * 3600 + 42 * 60)).toBe('3h 42m')
  })

  it('shows minutes alone under one hour', () => {
    expect(formatDuration(47 * 60)).toBe('47m')
  })

  it('shows <1m under one minute, distinct from a literal zero', () => {
    expect(formatDuration(30)).toBe('<1m')
  })
})

describe('formatElevationGain', () => {
  it('is undefined when there is no gain', () => {
    expect(formatElevationGain(undefined)).toBeUndefined()
  })

  it('shows whole feet with a thousands separator and a trailing arrow', () => {
    expect(formatElevationGain(1850 * 0.3048)).toBe('1,850 ft ↑')
  })

  it('shows zero explicitly, distinct from unavailable', () => {
    expect(formatElevationGain(0)).toBe('0 ft ↑')
  })
})

describe('formatStatsLine', () => {
  it('joins all three values when duration and gain are both present', () => {
    const line = formatStatsLine({
      distanceMeters: 8.1 * 1609.344,
      durationSeconds: 47 * 60,
      elevationGainMeters: 0,
    })
    expect(line).toBe('8.1 mi · 47m · 0 ft ↑')
  })

  it('shows a dash for one unavailable value when the other is present', () => {
    const line = formatStatsLine({
      distanceMeters: 8.1 * 1609.344,
      durationSeconds: 47 * 60,
      elevationGainMeters: undefined,
    })
    expect(line).toBe('8.1 mi · 47m · —')
  })

  it('shows distance alone, not two trailing dashes, when both are unavailable', () => {
    const line = formatStatsLine({
      distanceMeters: 8.1 * 1609.344,
      durationSeconds: undefined,
      elevationGainMeters: undefined,
    })
    expect(line).toBe('8.1 mi')
    expect(line).not.toContain('—')
  })
})
