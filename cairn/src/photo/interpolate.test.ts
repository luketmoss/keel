import { describe, expect, it } from 'vitest'
import type { Track } from '../kml/parse'
import {
  MAX_INTERPOLATION_GAP_MS,
  interpolatePosition,
  nearestPointByTime,
  needsInterpolation,
  positionPhoto,
  resolvePhotoInstant,
  tripUtcOffsetHours,
} from './interpolate'

/* A trip near 105°E (roughly UTC+7) — chosen away from the prime meridian so a bug that used
   UTC+0, or the test runner's own local timezone, would produce a visibly different offset and
   fail these tests rather than passing by coincidence. */
const trackNearIndochina: Track = {
  name: 'Day 1',
  points: [
    { lat: 10, lon: 105, time: '2021-06-15T10:00:00.000Z' },
    { lat: 10.1, lon: 105.1, time: '2021-06-15T10:10:00.000Z' },
    { lat: 10.4, lon: 105.4, time: '2021-06-15T10:40:00.000Z' },
  ],
}

describe('tripUtcOffsetHours', () => {
  it('derives the offset from the mean longitude of the trip\'s tracks, not the browser timezone', () => {
    expect(tripUtcOffsetHours([trackNearIndochina])).toBe(7)
  })

  it('defaults to UTC+0 for a trip with no track points', () => {
    expect(tripUtcOffsetHours([{ name: 'Empty', points: [] }])).toBe(0)
  })

  it('handles a western-hemisphere trip (negative offset)', () => {
    const westCoastUsTrack: Track = {
      name: 'Coastal',
      points: [
        { lat: 37, lon: -122, time: '2021-06-15T10:00:00.000Z' },
        { lat: 37.1, lon: -122.1, time: '2021-06-15T10:10:00.000Z' },
      ],
    }
    // -122 / 15 = -8.13 → rounds to -8
    expect(tripUtcOffsetHours([westCoastUsTrack])).toBe(-8)
  })
})

describe('needsInterpolation', () => {
  it('is true when a photo carries no latitude/longitude', () => {
    expect(needsInterpolation({})).toBe(true)
  })

  it('is false when a photo already carries a recorded position', () => {
    expect(needsInterpolation({ latitude: 10, longitude: 105 })).toBe(false)
  })
})

describe('resolvePhotoInstant', () => {
  it('uses gpsTimestamp directly, applying no trip offset (criterion 4)', () => {
    const instant = resolvePhotoInstant(
      { gpsTimestamp: '2021-06-15T21:45:10.000Z' },
      /* tripOffsetHours */ 7,
    )
    expect(instant).toBe(Date.parse('2021-06-15T21:45:10.000Z'))
  })

  it('applies the trip offset to dateTimeOriginal when gpsTimestamp is absent (criterion 5)', () => {
    // Wall clock 14:30 at UTC+7 is 07:30 UTC.
    const instant = resolvePhotoInstant({ dateTimeOriginal: '2021-06-15T14:30:00' }, 7)
    expect(instant).toBe(Date.parse('2021-06-15T07:30:00.000Z'))
  })

  it('prefers gpsTimestamp over dateTimeOriginal when both are present', () => {
    const instant = resolvePhotoInstant(
      { gpsTimestamp: '2021-06-15T21:45:10.000Z', dateTimeOriginal: '2021-06-15T14:30:00' },
      7,
    )
    expect(instant).toBe(Date.parse('2021-06-15T21:45:10.000Z'))
  })

  it('returns undefined when neither field is present', () => {
    expect(resolvePhotoInstant({}, 7)).toBeUndefined()
  })
})

describe('interpolatePosition', () => {
  it('positions a photo whose time falls between two track points, between them (criterion 1)', () => {
    const instant = Date.parse('2021-06-15T10:05:00.000Z') // midpoint of the first two points
    const result = interpolatePosition(instant, [trackNearIndochina])
    expect(result).toBeDefined()
    expect(result!.latitude).toBeGreaterThan(10)
    expect(result!.latitude).toBeLessThan(10.1)
    expect(result!.longitude).toBeGreaterThan(105)
    expect(result!.longitude).toBeLessThan(105.1)
  })

  it('is proportional to elapsed time, not the midpoint, for an asymmetric split (criterion 2)', () => {
    // Points 10 minutes apart; instant is 1 minute (10%) past the first point.
    const instant = Date.parse('2021-06-15T10:01:00.000Z')
    const result = interpolatePosition(instant, [trackNearIndochina])
    expect(result).toBeDefined()

    const expectedLat = 10 + (10.1 - 10) * 0.1
    const expectedLon = 105 + (105.1 - 105) * 0.1
    expect(result!.latitude).toBeCloseTo(expectedLat, 6)
    expect(result!.longitude).toBeCloseTo(expectedLon, 6)

    // Explicitly not the midpoint.
    const midLat = (10 + 10.1) / 2
    expect(result!.latitude).not.toBeCloseTo(midLat, 3)
  })

  it('marks the result as interpolated (criterion 9)', () => {
    const instant = Date.parse('2021-06-15T10:05:00.000Z')
    const result = interpolatePosition(instant, [trackNearIndochina])
    expect(result?.source).toBe('interpolated')
  })

  it('does not position a photo in a gap wider than 10 minutes (criterion 7)', () => {
    // The second and third points in trackNearIndochina are 30 minutes apart.
    const instant = Date.parse('2021-06-15T10:25:00.000Z')
    const result = interpolatePosition(instant, [trackNearIndochina])
    expect(result).toBeUndefined()
  })

  it('positions a photo exactly at the 10-minute boundary gap as ungapped', () => {
    // The first and second points are exactly 10 minutes apart — not "more than" 10 minutes.
    const instant = Date.parse('2021-06-15T10:05:00.000Z')
    const result = interpolatePosition(instant, [trackNearIndochina])
    expect(result).toBeDefined()
  })

  it('does not position a photo before the first track point (criterion 8)', () => {
    const instant = Date.parse('2021-06-15T09:00:00.000Z')
    expect(interpolatePosition(instant, [trackNearIndochina])).toBeUndefined()
  })

  it('does not position a photo after the last track point (criterion 8)', () => {
    const instant = Date.parse('2021-06-15T11:00:00.000Z')
    expect(interpolatePosition(instant, [trackNearIndochina])).toBeUndefined()
  })

  it('interpolates nothing and does not error when tracks carry no timestamps (criterion 10)', () => {
    const untimedTrack: Track = {
      name: 'No times',
      points: [
        { lat: 10, lon: 105 },
        { lat: 10.1, lon: 105.1 },
      ],
    }
    expect(() => interpolatePosition(Date.parse('2021-06-15T10:05:00.000Z'), [untimedTrack])).not.toThrow()
    expect(interpolatePosition(Date.parse('2021-06-15T10:05:00.000Z'), [untimedTrack])).toBeUndefined()
  })

  it('interpolates across multiple tracks treated as one pooled timeline', () => {
    const secondDay: Track = {
      name: 'Day 2',
      points: [
        { lat: 20, lon: 105, time: '2021-06-16T10:00:00.000Z' },
        { lat: 20.1, lon: 105.1, time: '2021-06-16T10:05:00.000Z' },
      ],
    }
    const instant = Date.parse('2021-06-16T10:02:30.000Z')
    const result = interpolatePosition(instant, [trackNearIndochina, secondDay])
    expect(result).toBeDefined()
    expect(result!.latitude).toBeCloseTo(20.05, 3)
  })
})

describe('positionPhoto (end-to-end)', () => {
  it('uses the photo\'s own recorded position and never interpolates when GPS is present (criterion 3)', () => {
    const photo = {
      latitude: 55,
      longitude: 55,
      dateTimeOriginal: '2021-06-15T10:05:00',
    }
    const result = positionPhoto(photo, [trackNearIndochina])
    expect(result).toEqual({ latitude: 55, longitude: 55, source: 'exif' })
  })

  it('interpolates using gpsTimestamp directly with no trip offset applied (criteria 4, 9)', () => {
    const photo = { gpsTimestamp: '2021-06-15T10:05:00.000Z' }
    const result = positionPhoto(photo, [trackNearIndochina])
    expect(result).toBeDefined()
    expect(result!.source).toBe('interpolated')
  })

  it('interpolates using dateTimeOriginal plus the trip offset when gpsTimestamp is absent (criterion 5)', () => {
    // Wall clock 17:05 at the trip's UTC+7 offset is 10:05 UTC — inside the first bracket.
    const photo = { dateTimeOriginal: '2021-06-15T17:05:00' }
    const result = positionPhoto(photo, [trackNearIndochina])
    expect(result).toBeDefined()
    expect(result!.source).toBe('interpolated')
    expect(result!.latitude).toBeGreaterThan(10)
    expect(result!.latitude).toBeLessThan(10.1)
  })

  it('does not position a photo with no usable time field and no recorded GPS', () => {
    expect(positionPhoto({}, [trackNearIndochina])).toBeUndefined()
  })
})

describe('MAX_INTERPOLATION_GAP_MS', () => {
  it('is exactly 10 minutes', () => {
    expect(MAX_INTERPOLATION_GAP_MS).toBe(10 * 60 * 1000)
  })
})

describe('nearestPointByTime — the suggestion ring (#168)', () => {
  it('finds the single nearest point by time, not the bracketing pair', () => {
    const instantMs = Date.parse('2021-06-15T10:09:00.000Z')

    const nearest = nearestPointByTime(instantMs, [trackNearIndochina])

    expect(nearest).toEqual({ lat: 10.1, lng: 105.1 })
  })

  it('crosses a gap wider than MAX_INTERPOLATION_GAP_MS — good enough to offer, not to apply', () => {
    const farApart: Track = {
      name: 'Day 1',
      points: [
        { lat: 1, lon: 1, time: '2021-06-15T10:00:00.000Z' },
        { lat: 2, lon: 2, time: '2021-06-15T12:00:00.000Z' },
      ],
    }
    // 10 minutes after the first point, 1h50 before the second — well past
    // the 10-minute gap `interpolatePosition` refuses to cross.
    const instantMs = Date.parse('2021-06-15T10:10:00.000Z')

    expect(interpolatePosition(instantMs, [farApart])).toBeUndefined()
    expect(nearestPointByTime(instantMs, [farApart])).toEqual({ lat: 1, lng: 1 })
  })

  it('returns undefined when the trip has no timed points at all', () => {
    const untimed: Track = { name: 'Day 1', points: [{ lat: 1, lon: 1 }] }

    expect(nearestPointByTime(Date.now(), [untimed])).toBeUndefined()
  })

  it('picks the nearest point across multiple tracks, not per-track', () => {
    const trackA: Track = { name: 'A', points: [{ lat: 1, lon: 1, time: '2021-06-15T10:00:00.000Z' }] }
    const trackB: Track = { name: 'B', points: [{ lat: 2, lon: 2, time: '2021-06-15T10:00:05.000Z' }] }
    const instantMs = Date.parse('2021-06-15T10:00:04.000Z')

    expect(nearestPointByTime(instantMs, [trackA, trackB])).toEqual({ lat: 2, lng: 2 })
  })
})
