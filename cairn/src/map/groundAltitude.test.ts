import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGroundAltitudeCache, sampleGroundAltitude } from './groundAltitude'
import type { ElevationSampler } from '../geo/elevation'

function sampler(elevations: number[]): ElevationSampler & { calls: number } {
  const stub = {
    calls: 0,
    sampleAlongPath: async (path: { lat: number; lng: number }[]) => {
      stub.calls += 1
      return {
        ok: true as const,
        samples: elevations.map((elevationMeters) => ({
          lat: path[0].lat,
          lng: path[0].lng,
          elevationMeters,
        })),
      }
    },
  }
  return stub
}

const PATH = [
  { lat: 46.54, lng: 12.13 },
  { lat: 46.42, lng: 11.87 },
]

describe('sampleGroundAltitude (#282)', () => {
  beforeEach(() => {
    clearGroundAltitudeCache()
  })

  it('returns the highest ground along the path, not the mean', async () => {
    expect(await sampleGroundAltitude(PATH, sampler([600, 2400, 900]))).toBe(2400)
  })

  it('falls back to sea level with no sampler at all', async () => {
    expect(await sampleGroundAltitude(PATH, null)).toBe(0)
  })

  it('falls back to sea level for an empty path', async () => {
    expect(await sampleGroundAltitude([], sampler([1000]))).toBe(0)
  })

  it('falls back to sea level when the call fails', async () => {
    const failing: ElevationSampler = {
      sampleAlongPath: async () => ({ ok: false as const, reason: 'OVER_QUERY_LIMIT' }),
    }
    expect(await sampleGroundAltitude(PATH, failing)).toBe(0)
  })

  it('falls back to sea level rather than hanging when the call never settles', async () => {
    vi.useFakeTimers()
    const hanging: ElevationSampler = { sampleAlongPath: () => new Promise(() => {}) }
    const pending = sampleGroundAltitude(PATH, hanging, 500)
    await vi.advanceTimersByTimeAsync(600)
    expect(await pending).toBe(0)
    vi.useRealTimers()
  })

  it('widens a single-point subject into a path, since the API needs one', async () => {
    const stub = sampler([1500])
    let seen: { lat: number; lng: number }[] = []
    const spy: ElevationSampler = {
      sampleAlongPath: async (path, samples) => {
        seen = path
        return stub.sampleAlongPath(path, samples)
      },
    }

    expect(await sampleGroundAltitude([{ lat: 1, lng: 2 }], spy)).toBe(1500)
    expect(seen.length).toBeGreaterThan(1)
  })

  it('caches by path, so a re-pressed flyover costs one call rather than two', async () => {
    const stub = sampler([800])

    expect(await sampleGroundAltitude(PATH, stub)).toBe(800)
    expect(await sampleGroundAltitude(PATH, stub)).toBe(800)

    expect(stub.calls).toBe(1)
  })

  it('does not cache a failure — a transient outage must not pin the camera at sea level', async () => {
    let ok = false
    const flaky: ElevationSampler = {
      sampleAlongPath: async () =>
        ok
          ? { ok: true as const, samples: [{ lat: 0, lng: 0, elevationMeters: 3000 }] }
          : { ok: false as const, reason: 'UNKNOWN_ERROR' },
    }

    expect(await sampleGroundAltitude(PATH, flaky)).toBe(0)
    ok = true
    expect(await sampleGroundAltitude(PATH, flaky)).toBe(3000)
  })
})
