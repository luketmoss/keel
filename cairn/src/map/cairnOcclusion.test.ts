import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCairnOcclusionCache,
  forgetCairnOcclusion,
  isCairnOccluded,
  OCCLUSION_CLEARANCE_METERS,
} from './cairnOcclusion'
import type { ElevationSampler } from '../geo/elevation'

const CAMERA = { lat: 46.54, lng: 12.13, altitude: 3000 }
const CAIRN = { lat: 46.42, lng: 11.87 }

/* 16 evenly-spaced samples along the ray — the shape `sampleAlongPath`
   actually returns, ending at the cairn's own ground altitude. */
function samplerReturning(elevations: number[]): ElevationSampler & { calls: number } {
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

function flatTerrain(cairnAltitude: number): ElevationSampler {
  return samplerReturning(Array.from({ length: 16 }, () => cairnAltitude))
}

function ridgeAbove(peak: number, cairnAltitude: number): ElevationSampler & { calls: number } {
  const samples = Array.from({ length: 16 }, () => 0)
  samples[8] = peak
  samples[15] = cairnAltitude
  return samplerReturning(samples)
}

/* Exactly three samples — camera end, one interior point, cairn end — so
   the interior point sits at exactly the midpoint (`i / n` = `1 / 2`) and
   the line-of-sight altitude at that point is an exact, easily-checked
   number rather than one that depends on how many samples the API
   happened to return. */
function midpointTerrain(interiorElevation: number, cairnAltitude: number): ElevationSampler {
  return samplerReturning([0, interiorElevation, cairnAltitude])
}

describe('isCairnOccluded (#285)', () => {
  beforeEach(() => {
    clearCairnOcclusionCache()
  })

  it('is not occluded when no terrain sample rises above the line of sight', async () => {
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, flatTerrain(0))).toBe(false)
  })

  it('is occluded when a ridge along the ray rises above the line of sight', async () => {
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, ridgeAbove(4000, 0))).toBe(true)
  })

  it('is not occluded by terrain that stays within the clearance tolerance', async () => {
    // The line of sight at the midpoint of a camera at 3000m and a cairn at
    // 0m is 1500m — terrain just under the clearance above that must not
    // flip the verdict.
    const terrain = midpointTerrain(1500 + OCCLUSION_CLEARANCE_METERS - 1, 0)
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, terrain)).toBe(false)
  })

  it('is occluded by terrain that clears the tolerance', async () => {
    const terrain = midpointTerrain(1500 + OCCLUSION_CLEARANCE_METERS + 1, 0)
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, terrain)).toBe(true)
  })

  it('draws (is not occluded) with no sampler at all', async () => {
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, null)).toBe(false)
  })

  it('draws when the call fails', async () => {
    const failing: ElevationSampler = {
      sampleAlongPath: async () => ({ ok: false as const, reason: 'OVER_QUERY_LIMIT' }),
    }
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, failing)).toBe(false)
  })

  it('draws rather than hanging when the call never settles', async () => {
    vi.useFakeTimers()
    const hanging: ElevationSampler = { sampleAlongPath: () => new Promise(() => {}) }
    const pending = isCairnOccluded(CAMERA, 'cairn-1', CAIRN, hanging, 500)
    await vi.advanceTimersByTimeAsync(600)
    expect(await pending).toBe(false)
    vi.useRealTimers()
  })

  it('does not cache a failure or a timeout — a transient outage must not pin a cairn hidden or drawn forever', async () => {
    let ok = false
    const flaky: ElevationSampler = {
      sampleAlongPath: async () =>
        ok
          ? {
              ok: true as const,
              samples: Array.from({ length: 16 }, (_, i) => ({
                lat: 0,
                lng: 0,
                elevationMeters: i === 8 ? 9000 : 0,
              })),
            }
          : { ok: false as const, reason: 'UNKNOWN_ERROR' },
    }

    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, flaky)).toBe(false)
    ok = true
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, flaky)).toBe(true)
  })

  it('caches a verdict by the quantised camera position and the cairn id', async () => {
    const stub = ridgeAbove(4000, 0)
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, stub)).toBe(true)
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, stub)).toBe(true)
    expect(stub.calls).toBe(1)
  })

  it('does not confuse two cairns at the quantised camera position', async () => {
    const flat = flatTerrain(0)
    const ridge = ridgeAbove(4000, 0)
    expect(await isCairnOccluded(CAMERA, 'cairn-flat', CAIRN, flat)).toBe(false)
    expect(await isCairnOccluded(CAMERA, 'cairn-ridge', CAIRN, ridge)).toBe(true)
  })

  it('re-tests after forgetCairnOcclusion, for a cairn that moved', async () => {
    const stub = ridgeAbove(4000, 0)
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, stub)).toBe(true)
    forgetCairnOcclusion('cairn-1')
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, flatTerrain(0))).toBe(false)
  })

  it('treats too few samples to judge as unknown, and draws', async () => {
    const tooFew: ElevationSampler = {
      sampleAlongPath: async () => ({
        ok: true as const,
        samples: [{ lat: 0, lng: 0, elevationMeters: 0 }],
      }),
    }
    expect(await isCairnOccluded(CAMERA, 'cairn-1', CAIRN, tooFew)).toBe(false)
  })

  it('widens a degenerate ray (camera directly over the cairn) instead of failing', async () => {
    let seen: { lat: number; lng: number }[] = []
    const spy: ElevationSampler = {
      sampleAlongPath: async (path) => {
        seen = path
        return { ok: true as const, samples: Array.from({ length: 16 }, () => ({ ...path[0], elevationMeters: 0 })) }
      },
    }
    const overhead = { lat: CAIRN.lat, lng: CAIRN.lng, altitude: 500 }
    await isCairnOccluded(overhead, 'cairn-1', CAIRN, spy)
    expect(seen.length).toBeGreaterThan(1)
  })
})
