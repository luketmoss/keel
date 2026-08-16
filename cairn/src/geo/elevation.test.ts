import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGoogleElevationSampler,
  MAX_SAMPLES,
  sampleTrackElevation,
  trackKey,
  type ElevationSampler,
  type RawElevationSample,
} from './elevation'
import type { TrackPoint } from '../kml/parse'

function points(count: number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({ lat: 37 + i * 0.001, lon: -122 }))
}

function fakeSampler(result: RawElevationSample[] | null): ElevationSampler {
  return { sampleAlongPath: vi.fn().mockResolvedValue(result) }
}

describe('sampleTrackElevation', () => {
  it('is undefined for fewer than two points — nothing to sample along', async () => {
    const sampler = fakeSampler([])
    expect(await sampleTrackElevation([{ lat: 37, lon: -122 }], sampler)).toBeUndefined()
    expect(sampler.sampleAlongPath).not.toHaveBeenCalled()
  })

  it('is undefined when the API call fails', async () => {
    const sampler = fakeSampler(null)
    expect(await sampleTrackElevation(points(5), sampler)).toBeUndefined()
  })

  it('is undefined when the call returns fewer than two samples', async () => {
    const sampler = fakeSampler([{ lat: 37, lng: -122, elevationMeters: 100 }])
    expect(await sampleTrackElevation(points(5), sampler)).toBeUndefined()
  })

  it('is undefined when every sampled elevation is identical — the same unavailable rule computeElevationStats applies', async () => {
    const sampler = fakeSampler(
      Array.from({ length: 5 }, (_, i) => ({ lat: 37 + i * 0.001, lng: -122, elevationMeters: 1500 })),
    )
    expect(await sampleTrackElevation(points(5), sampler)).toBeUndefined()
  })

  it('caps the requested sample count at MAX_SAMPLES', async () => {
    const sampler = fakeSampler(null)
    await sampleTrackElevation(points(1000), sampler)
    expect(sampler.sampleAlongPath).toHaveBeenCalledWith(expect.anything(), MAX_SAMPLES)
  })

  it('requests one sample per point when the track is shorter than the cap', async () => {
    const sampler = fakeSampler(null)
    await sampleTrackElevation(points(10), sampler)
    expect(sampler.sampleAlongPath).toHaveBeenCalledWith(expect.anything(), 10)
  })

  it('reduces a real climb to the four stats and a distance-aligned profile', async () => {
    const raw: RawElevationSample[] = [
      1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000, 1000, 1000,
    ].map((elevationMeters, i) => ({ lat: 37 + i * 0.001, lng: -122, elevationMeters }))
    const sampler = fakeSampler(raw)

    const result = await sampleTrackElevation(points(raw.length), sampler)

    expect(result).toBeDefined()
    expect(result!.elevationGainMeters).toBeGreaterThan(0)
    expect(result!.elevationLossMeters).toBeGreaterThan(0)
    expect(result!.highPointMeters).toBeGreaterThan(result!.lowPointMeters)
    expect(result!.profile.length).toBeGreaterThan(1)
    // Cumulative distance is non-decreasing along the profile.
    for (let i = 1; i < result!.profile.length; i++) {
      expect(result!.profile[i].distanceMeters).toBeGreaterThanOrEqual(result!.profile[i - 1].distanceMeters)
    }
  })
})

describe('trackKey', () => {
  it('is just the driveFileId for a single-track file', () => {
    expect(trackKey('drive-1', 0, 1)).toBe('drive-1')
  })

  it('suffixes the index for a multi-track file, so two placemarks never collide', () => {
    expect(trackKey('drive-1', 0, 2)).toBe('drive-1#0')
    expect(trackKey('drive-1', 1, 2)).toBe('drive-1#1')
  })
})

describe('createGoogleElevationSampler', () => {
  const originalGoogle = (globalThis as { google?: unknown }).google

  afterEach(() => {
    ;(globalThis as { google?: unknown }).google = originalGoogle
  })

  it('is null when the Maps script has not loaded — offline, no key, or not yet mounted', () => {
    delete (globalThis as { google?: unknown }).google
    expect(createGoogleElevationSampler()).toBeNull()
  })

  it('wraps a successful callback into a resolved promise', async () => {
    const getElevationAlongPath = vi.fn((_request, callback) => {
      callback(
        [{ location: { lat: () => 37, lng: () => -122 }, elevation: 1500 }],
        'OK',
      )
    })
    ;(globalThis as { google: unknown }).google = {
      maps: {
        ElevationService: vi.fn().mockImplementation(() => ({ getElevationAlongPath })),
        ElevationStatus: { OK: 'OK' },
      },
    }

    const sampler = createGoogleElevationSampler()
    expect(sampler).not.toBeNull()
    const result = await sampler!.sampleAlongPath([{ lat: 37, lng: -122 }], 1)
    expect(result).toEqual([{ lat: 37, lng: -122, elevationMeters: 1500 }])
  })

  it('resolves null on a non-OK status, rather than throwing', async () => {
    const getElevationAlongPath = vi.fn((_request, callback) => {
      callback(null, 'OVER_QUERY_LIMIT')
    })
    ;(globalThis as { google: unknown }).google = {
      maps: {
        ElevationService: vi.fn().mockImplementation(() => ({ getElevationAlongPath })),
        ElevationStatus: { OK: 'OK' },
      },
    }

    const sampler = createGoogleElevationSampler()
    const result = await sampler!.sampleAlongPath([{ lat: 37, lng: -122 }], 1)
    expect(result).toBeNull()
  })
})
