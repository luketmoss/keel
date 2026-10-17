import { describe, expect, it } from 'vitest'
import {
  computeElevationProfile,
  computeTrackStats,
  effectiveElevationProfile,
  effectiveTrackStats,
  hasUsableElevation,
  overlaySampledElevation,
  summarizeElevation,
  type StoredTrackElevation,
  type TrackStats,
} from './stats'
import type { Track } from './parse'

/* Flat padding at both ends keeps the median filter's clamped boundary
   windows equal to the padded value, so the filtered series' first and
   last points match the raw ones exactly — which is what makes the
   closed-loop test below checkable by hand rather than asserted blind. */
function trackFromElevations(elevations: number[]): Track {
  return {
    name: 'Fixture',
    points: elevations.map((elevation, i) => ({
      lat: 37 + i * 0.001,
      lon: -122 + i * 0.001,
      elevation,
    })),
  }
}

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

  it('leaves duration undefined for a single timestamped point — one point has no span', () => {
    const track: Track = {
      name: 'One timestamp',
      points: [
        { lat: 37, lon: -122, time: '2020-01-01T08:00:00Z' },
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

  it('reads zero distance for a single-point track and does not throw', () => {
    const track: Track = { name: 'Point', points: [{ lat: 37, lon: -122 }] }

    expect(() => computeTrackStats(track)).not.toThrow()
    const stats = computeTrackStats(track)
    expect(stats.distanceMeters).toBe(0)
    expect(stats.durationSeconds).toBeUndefined()
    expect(stats.elevationGainMeters).toBeUndefined()
  })

  describe('elevation', () => {
    it('leaves ascent, descent, high and low point undefined for a track without elevation', () => {
      const track: Track = {
        name: 'Flatlander',
        points: [
          { lat: 37, lon: -122 },
          { lat: 37.1, lon: -122.1 },
        ],
      }

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBeUndefined()
      expect(stats.elevationLossMeters).toBeUndefined()
      expect(stats.highPointMeters).toBeUndefined()
      expect(stats.lowPointMeters).toBeUndefined()
    })

    it('leaves all four undefined for fewer than two points carrying elevation', () => {
      const track: Track = {
        name: 'One elevation',
        points: [
          { lat: 37, lon: -122, elevation: 1000 },
          { lat: 37.1, lon: -122.1 },
        ],
      }

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBeUndefined()
      expect(stats.elevationLossMeters).toBeUndefined()
      expect(stats.highPointMeters).toBeUndefined()
      expect(stats.lowPointMeters).toBeUndefined()
    })

    it('reports unavailable, not zero, for a track whose every altitude is 0 (clampToGround)', () => {
      const track = trackFromElevations([0, 0, 0, 0, 0])

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBeUndefined()
      expect(stats.elevationLossMeters).toBeUndefined()
      expect(stats.highPointMeters).toBeUndefined()
      expect(stats.lowPointMeters).toBeUndefined()
    })

    it('reports unavailable for a track whose every altitude is some other single identical value', () => {
      const track = trackFromElevations([1500, 1500, 1500, 1500])

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBeUndefined()
      expect(stats.elevationLossMeters).toBeUndefined()
      expect(stats.highPointMeters).toBeUndefined()
      expect(stats.lowPointMeters).toBeUndefined()
    })

    it('computes ascent, descent, high and low point from the median-filtered, hysteresis-thresholded series', () => {
      // Flat padding front and back, a climb from 1000 to 1060, then a
      // descent back to 1000 — a closed loop by construction.
      const track = trackFromElevations([
        1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000, 1000, 1000,
      ])

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBe(50)
      expect(stats.elevationLossMeters).toBe(50)
      expect(stats.highPointMeters).toBe(1050)
      expect(stats.lowPointMeters).toBe(1000)
    })

    it('closes a loop: ascent minus descent equals the last elevation minus the first, within 1m', () => {
      const track = trackFromElevations([
        1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000, 1000, 1000,
      ])

      const stats = computeTrackStats(track)
      const ascent = stats.elevationGainMeters ?? 0
      const descent = stats.elevationLossMeters ?? 0
      const firstElevation = track.points[0].elevation ?? 0
      const lastElevation = track.points[track.points.length - 1].elevation ?? 0

      expect(Math.abs(ascent - descent - (lastElevation - firstElevation))).toBeLessThan(1)
    })

    it('rejects a single-sample spike: the high point does not reflect it', () => {
      const track = trackFromElevations([1000, 1002, 1001, 1200, 1003, 1000, 1002, 1001, 1000])

      const stats = computeTrackStats(track)
      // The spike sits 200m above its neighbours — a real high point close
      // to it would be implausible for a track whose other samples hover
      // around 1000-1003.
      expect(stats.highPointMeters).toBeLessThan(1100)
    })

    it('reports zero ascent and descent — not unavailable — for a track that varies by less than the threshold', () => {
      const track = trackFromElevations([1000, 1001, 1000.5, 1001.5, 1000, 1001, 1000.8])

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBe(0)
      expect(stats.elevationLossMeters).toBe(0)
      expect(stats.highPointMeters).not.toBeUndefined()
      expect(stats.lowPointMeters).not.toBeUndefined()
    })

    it('reads zero ascent and real descent for a descent-only track', () => {
      const track = trackFromElevations([1000, 1000, 1000, 990, 980, 965, 950, 940, 940, 940])

      const stats = computeTrackStats(track)
      expect(stats.elevationGainMeters).toBe(0)
      expect(stats.elevationLossMeters).toBe(60)
    })

    it('skips points without elevation entirely, rather than treating a gap as zero', () => {
      const elevations = [
        1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000, 1000, 1000,
      ]
      const withoutGaps = trackFromElevations(elevations)
      const withGaps: Track = {
        name: 'Gappy',
        points: elevations.flatMap((elevation, i) => [
          { lat: 37 + i * 0.002, lon: -122, elevation },
          { lat: 37 + i * 0.002 + 0.0005, lon: -122 }, // no elevation
        ]),
      }

      const a = computeTrackStats(withoutGaps)
      const b = computeTrackStats(withGaps)
      expect(b.elevationGainMeters).toBe(a.elevationGainMeters)
      expect(b.elevationLossMeters).toBe(a.elevationLossMeters)
      expect(b.highPointMeters).toBe(a.highPointMeters)
      expect(b.lowPointMeters).toBe(a.lowPointMeters)
    })
  })
})

describe('computeElevationProfile', () => {
  it('is undefined under the same conditions computeTrackStats reports elevation as unavailable', () => {
    expect(computeElevationProfile(trackFromElevations([0, 0, 0, 0, 0]).points)).toBeUndefined()
    expect(computeElevationProfile(trackFromElevations([1500, 1500, 1500]).points)).toBeUndefined()
    expect(
      computeElevationProfile([
        { lat: 37, lon: -122, elevation: 1000 },
        { lat: 37.1, lon: -122.1 },
      ]),
    ).toBeUndefined()
  })

  it('carries one entry per elevation-bearing point, distance-aligned and median-filtered', () => {
    const elevations = [
      1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000, 1000, 1000,
    ]
    const track = trackFromElevations(elevations)

    const profile = computeElevationProfile(track.points)

    expect(profile).toBeDefined()
    expect(profile).toHaveLength(elevations.length)
    // Cumulative distance is non-decreasing along the series.
    for (let i = 1; i < profile!.length; i++) {
      expect(profile![i].distanceMeters).toBeGreaterThanOrEqual(profile![i - 1].distanceMeters)
    }
    // Agrees with computeTrackStats, which uses the same filtered series.
    const stats = computeTrackStats(track)
    expect(Math.max(...profile!.map((point) => point.elevationMeters))).toBe(stats.highPointMeters)
    expect(Math.min(...profile!.map((point) => point.elevationMeters))).toBe(stats.lowPointMeters)
  })

  it('rejects a single-sample spike, the same as computeTrackStats — the profile is drawn from the filtered series', () => {
    const track = trackFromElevations([1000, 1002, 1001, 1200, 1003, 1000, 1002, 1001, 1000])

    const profile = computeElevationProfile(track.points)

    expect(profile).toBeDefined()
    // The raw spike sits 200m above its neighbours; a filtered high point
    // that reflected it would be implausible for a series hovering
    // around 1000-1003.
    expect(Math.max(...profile!.map((point) => point.elevationMeters))).toBeLessThan(1100)
    // And it isn't just clamped — the raw value is still in the input.
    expect(track.points.some((point) => point.elevation === 1200)).toBe(true)
  })

  it('skips points without elevation but still aligns the remaining ones to their own cumulative distance', () => {
    const track: Track = {
      name: 'Gappy',
      points: [
        { lat: 37, lon: -122, elevation: 1000 },
        { lat: 37.001, lon: -122 }, // no elevation — a real gap in the path
        { lat: 37.002, lon: -122, elevation: 1010 },
      ],
    }

    const profile = computeElevationProfile(track.points)

    expect(profile).toBeDefined()
    expect(profile).toHaveLength(2)
    // The second point's distance covers both legs, not just the one to
    // the previous elevation-bearing point.
    expect(profile![1].distanceMeters).toBeGreaterThan(0)
  })
})

// #224
describe('hasUsableElevation', () => {
  it('agrees with computeTrackStats about what counts as unavailable', () => {
    expect(hasUsableElevation(trackFromElevations([0, 0, 0, 0, 0]).points)).toBe(false)
    expect(hasUsableElevation([{ lat: 37, lon: -122, elevation: 1000 }])).toBe(false)
    expect(
      hasUsableElevation(trackFromElevations([1000, 1000, 1000, 1010, 1020, 1035, 1050]).points),
    ).toBe(true)
  })
})

describe('overlaySampledElevation', () => {
  const sampled: StoredTrackElevation = {
    elevationGainMeters: 300,
    elevationLossMeters: 50,
    highPointMeters: 400,
    lowPointMeters: 100,
    profile: [],
  }

  const unavailable: TrackStats = {
    distanceMeters: 5000,
    durationSeconds: undefined,
    elevationGainMeters: undefined,
    elevationLossMeters: undefined,
    highPointMeters: undefined,
    lowPointMeters: undefined,
  }

  const recorded: TrackStats = {
    ...unavailable,
    elevationGainMeters: 900,
    elevationLossMeters: 800,
    highPointMeters: 2000,
    lowPointMeters: 1500,
  }

  it('folds sampled elevation into a track with none, marking the source', () => {
    const result = overlaySampledElevation(unavailable, sampled)
    expect(result.elevationGainMeters).toBe(300)
    expect(result.elevationLossMeters).toBe(50)
    expect(result.highPointMeters).toBe(400)
    expect(result.lowPointMeters).toBe(100)
    expect(result.elevationSource).toBe('sampled')
    // Distance and duration are untouched — sampling never infers either
    // (the issue's acceptance criterion: a track with no timestamps still
    // reports duration unavailable, even once its elevation is sampled).
    expect(result.distanceMeters).toBe(unavailable.distanceMeters)
    expect(result.durationSeconds).toBe(unavailable.durationSeconds)
  })

  it('never overwrites a track that already carries its own elevation', () => {
    expect(overlaySampledElevation(recorded, sampled)).toEqual(recorded)
  })

  it('leaves an unavailable track unavailable when nothing has been sampled for it', () => {
    expect(overlaySampledElevation(unavailable, undefined)).toEqual(unavailable)
  })
})

describe('effectiveTrackStats', () => {
  it('is overlaySampledElevation composed with computeTrackStats', () => {
    const track = trackFromElevations([0, 0, 0, 0, 0])
    const sampled: StoredTrackElevation = {
      elevationGainMeters: 300,
      elevationLossMeters: 50,
      highPointMeters: 400,
      lowPointMeters: 100,
      profile: [],
    }
    const result = effectiveTrackStats(track, sampled)
    expect(result.elevationGainMeters).toBe(300)
    expect(result.elevationSource).toBe('sampled')
    expect(result.distanceMeters).toBe(computeTrackStats(track).distanceMeters)
  })
})

describe('effectiveElevationProfile', () => {
  const sampledProfile = [
    { distanceMeters: 0, elevationMeters: 100 },
    { distanceMeters: 500, elevationMeters: 400 },
  ]
  const sampled: StoredTrackElevation = {
    elevationGainMeters: 300,
    elevationLossMeters: 0,
    highPointMeters: 400,
    lowPointMeters: 100,
    profile: sampledProfile,
  }

  it('draws the sampled profile when the track has none of its own', () => {
    const track = trackFromElevations([0, 0, 0, 0, 0])
    expect(effectiveElevationProfile(track, sampled)).toBe(sampledProfile)
  })

  it('never overwrites a track that already draws its own profile', () => {
    const track = trackFromElevations([1000, 1000, 1000, 1010, 1020, 1035, 1050])
    const own = computeElevationProfile(track.points)
    expect(effectiveElevationProfile(track, sampled)).toEqual(own)
  })

  it('is undefined when the track has no elevation and nothing was sampled', () => {
    const track = trackFromElevations([0, 0, 0, 0, 0])
    expect(effectiveElevationProfile(track, undefined)).toBeUndefined()
  })
})

describe('summarizeElevation', () => {
  it('sums only the stats that carry elevation, matching the trip totals block', () => {
    const withElevation: TrackStats = {
      distanceMeters: 1000,
      durationSeconds: undefined,
      elevationGainMeters: 300,
      elevationLossMeters: 100,
      highPointMeters: 900,
      lowPointMeters: 600,
    }
    const withoutElevation: TrackStats = { ...withElevation, elevationGainMeters: undefined, elevationLossMeters: undefined, highPointMeters: undefined, lowPointMeters: undefined }

    const summary = summarizeElevation([withElevation, withoutElevation])
    expect(summary.elevationGainMeters).toBe(300)
    expect(summary.elevationTrackCount).toBe(1)
    expect(summary.elevationSource).toBeUndefined()
  })

  it('marks the summary sampled when any contributing track is sampled — the weaker claim governs', () => {
    const recorded: TrackStats = {
      distanceMeters: 1000,
      durationSeconds: undefined,
      elevationGainMeters: 300,
      elevationLossMeters: 100,
      highPointMeters: 900,
      lowPointMeters: 600,
    }
    const sampled: TrackStats = { ...recorded, elevationSource: 'sampled' }

    expect(summarizeElevation([recorded, sampled]).elevationSource).toBe('sampled')
    expect(summarizeElevation([recorded]).elevationSource).toBeUndefined()
  })

  it('leaves everything undefined when no track carries elevation', () => {
    const none: TrackStats = {
      distanceMeters: 1000,
      durationSeconds: undefined,
      elevationGainMeters: undefined,
      elevationLossMeters: undefined,
      highPointMeters: undefined,
      lowPointMeters: undefined,
    }
    const summary = summarizeElevation([none])
    expect(summary.elevationGainMeters).toBeUndefined()
    expect(summary.elevationTrackCount).toBe(0)
  })
})
