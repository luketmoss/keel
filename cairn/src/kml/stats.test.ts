import { describe, expect, it } from 'vitest'
import { computeTrackStats } from './stats'
import type { Track } from './parse'

describe('computeTrackStats', () => {
  it('computes distance within 0.5% of a fixture of known length', () => {
    /* One arc-minute of latitude is, by definition, one nautical mile —
       1852m exactly — independent of this module's own haversine math. */
    const oneArcMinute = 1 / 60
    const track: Track = {
      name: 'Meridian arc',
      points: [
        { lat: 37, lon: -122 },
        { lat: 37 + oneArcMinute, lon: -122 },
      ],
    }

    const stats = computeTrackStats(track)

    const nauticalMileMeters = 1852
    const errorRatio = Math.abs(stats.distanceMeters - nauticalMileMeters) / nauticalMileMeters
    expect(errorRatio).toBeLessThan(0.005)
  })

  it('shows duration for a track carrying per-point timestamps', () => {
    const track: Track = {
      name: 'Timed',
      points: [
        { lat: 37, lon: -122, time: '2020-01-01T08:00:00Z' },
        { lat: 37.1, lon: -122.1, time: '2020-01-01T08:47:00Z' },
      ],
    }

    expect(computeTrackStats(track).durationSeconds).toBe(47 * 60)
  })

  it('leaves duration undefined, not zero, for a track without timestamps', () => {
    const track: Track = {
      name: 'Untimed',
      points: [
        { lat: 37, lon: -122 },
        { lat: 37.1, lon: -122.1 },
      ],
    }

    expect(computeTrackStats(track).durationSeconds).toBeUndefined()
  })

  it('takes the span as max minus min, not last minus first, for out-of-order timestamps', () => {
    const track: Track = {
      name: 'Scrambled',
      points: [
        { lat: 37, lon: -122, time: '2020-01-01T08:30:00Z' },
        { lat: 37.05, lon: -122.05, time: '2020-01-01T08:00:00Z' },
        { lat: 37.1, lon: -122.1, time: '2020-01-01T08:15:00Z' },
      ],
    }

    expect(computeTrackStats(track).durationSeconds).toBe(30 * 60)
  })

  it('shows elevation gain for a track carrying per-point elevations', () => {
    const track: Track = {
      name: 'Climbing',
      points: [
        { lat: 37, lon: -122, elevation: 100 },
        { lat: 37.01, lon: -122.01, elevation: 150 },
        { lat: 37.02, lon: -122.02, elevation: 200 },
      ],
    }

    expect(computeTrackStats(track).elevationGainMeters).toBe(100)
  })

  it('leaves elevation gain undefined, not zero, for a track without elevations', () => {
    const track: Track = {
      name: 'Flatlander',
      points: [
        { lat: 37, lon: -122 },
        { lat: 37.1, lon: -122.1 },
      ],
    }

    expect(computeTrackStats(track).elevationGainMeters).toBeUndefined()
  })

  it('sums only positive deltas, so a descent-only track reads zero gain', () => {
    const track: Track = {
      name: 'Descent',
      points: [
        { lat: 37, lon: -122, elevation: 300 },
        { lat: 37.01, lon: -122.01, elevation: 200 },
        { lat: 37.02, lon: -122.02, elevation: 100 },
      ],
    }

    expect(computeTrackStats(track).elevationGainMeters).toBe(0)
  })

  it('skips gaps rather than treating a missing elevation as zero', () => {
    const track: Track = {
      name: 'Gappy',
      points: [
        { lat: 37, lon: -122, elevation: 100 },
        { lat: 37.01, lon: -122.01 }, // no elevation
        { lat: 37.02, lon: -122.02, elevation: 150 },
      ],
    }

    // Gain is measured between the two elevation-bearing points (100 -> 150 = 50),
    // not treated as a cliff down to 0 and back up.
    expect(computeTrackStats(track).elevationGainMeters).toBe(50)
  })

  it('reads zero distance for a single-point track and does not throw', () => {
    const track: Track = { name: 'Point', points: [{ lat: 37, lon: -122 }] }

    expect(() => computeTrackStats(track)).not.toThrow()
    const stats = computeTrackStats(track)
    expect(stats.distanceMeters).toBe(0)
    expect(stats.durationSeconds).toBeUndefined()
    expect(stats.elevationGainMeters).toBeUndefined()
  })
})
