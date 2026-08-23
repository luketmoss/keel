import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCairnOcclusion } from './useCairnOcclusion'
import { clearCairnOcclusionCache } from './cairnOcclusion'
import type { ElevationSampler } from '../geo/elevation'

/* A fake `Map3DElement` — only what the hook touches: `cameraPosition` and
   the `gmp-steadychange` listener pair. Firing `steady()` is how a test
   simulates the camera coming to rest. */
function fakeMap3d(camera: { lat: number; lng: number; altitude: number }) {
  let handler: ((event: Event) => void) | null = null
  let position = camera
  return {
    get cameraPosition() {
      return position
    },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (type === 'gmp-steadychange') handler = listener
    },
    removeEventListener: (type: string) => {
      if (type === 'gmp-steadychange') handler = null
    },
    moveTo(next: { lat: number; lng: number; altitude: number }) {
      position = next
    },
    steady() {
      handler?.({ isSteady: true } as unknown as Event)
    },
    moving() {
      handler?.({ isSteady: false } as unknown as Event)
    },
  } as unknown as google.maps.maps3d.Map3DElement & {
    steady(): void
    moving(): void
    moveTo(next: { lat: number; lng: number; altitude: number }): void
  }
}

function samplerAlwaysOccluding(): ElevationSampler {
  return {
    sampleAlongPath: async () => ({
      ok: true as const,
      samples: [
        { lat: 0, lng: 0, elevationMeters: 0 },
        { lat: 0, lng: 0, elevationMeters: 9000 },
        { lat: 0, lng: 0, elevationMeters: 0 },
      ],
    }),
  }
}

const CAIRNS = [
  { id: 'near', latitude: 1, longitude: 1 },
  { id: 'far', latitude: 2, longitude: 2 },
]

describe('useCairnOcclusion (#285)', () => {
  beforeEach(() => {
    clearCairnOcclusionCache()
  })

  it('hides nothing before the camera has ever settled', () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const { result } = renderHook(() => useCairnOcclusion(map3d, CAIRNS, null, () => samplerAlwaysOccluding()))
    expect(result.current.size).toBe(0)
  })

  it('marks a cairn occluded once the camera settles with terrain in the way', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const { result } = renderHook(() => useCairnOcclusion(map3d, CAIRNS, null, () => samplerAlwaysOccluding()))

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.has('near')).toBe(true)
    expect(result.current.has('far')).toBe(true)
  })

  it('does not test occlusion on a moving camera', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const sampler = vi.fn(samplerAlwaysOccluding().sampleAlongPath)
    const { result } = renderHook(() =>
      useCairnOcclusion(map3d, CAIRNS, null, () => ({ sampleAlongPath: sampler })),
    )

    await act(async () => {
      map3d.moving()
      await Promise.resolve()
    })

    expect(sampler).not.toHaveBeenCalled()
    expect(result.current.size).toBe(0)
  })

  it('the selected cairn never appears in the result, even if terrain occludes it', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const { result } = renderHook(() =>
      useCairnOcclusion(map3d, CAIRNS, 'near', () => samplerAlwaysOccluding()),
    )

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.has('near')).toBe(false)
    expect(result.current.has('far')).toBe(true)
  })

  it('reveals a hidden cairn once the camera moves and settles somewhere with a clear line of sight', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    let occluding = true
    const sampler: ElevationSampler = {
      sampleAlongPath: async () => ({
        ok: true as const,
        samples: [
          { lat: 0, lng: 0, elevationMeters: 0 },
          { lat: 0, lng: 0, elevationMeters: occluding ? 9000 : 0 },
          { lat: 0, lng: 0, elevationMeters: 0 },
        ],
      }),
    }
    const { result } = renderHook(() => useCairnOcclusion(map3d, CAIRNS, null, () => sampler))

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.has('near')).toBe(true)

    occluding = false
    await act(async () => {
      map3d.moveTo({ lat: 10, lng: 10, altitude: 3000 })
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.has('near')).toBe(false)
  })

  it('hides a cairn once the camera moves and settles somewhere terrain now blocks', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    let occluding = false
    const sampler: ElevationSampler = {
      sampleAlongPath: async () => ({
        ok: true as const,
        samples: [
          { lat: 0, lng: 0, elevationMeters: 0 },
          { lat: 0, lng: 0, elevationMeters: occluding ? 9000 : 0 },
          { lat: 0, lng: 0, elevationMeters: 0 },
        ],
      }),
    }
    const { result } = renderHook(() => useCairnOcclusion(map3d, CAIRNS, null, () => sampler))

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.has('near')).toBe(false)

    occluding = true
    await act(async () => {
      map3d.moveTo({ lat: 10, lng: 10, altitude: 3000 })
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.has('near')).toBe(true)
  })

  it('unhides a cairn immediately when it becomes selected, even with a stale occluded verdict', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const { result, rerender } = renderHook(
      ({ selectedCairnId }: { selectedCairnId: string | null }) =>
        useCairnOcclusion(map3d, CAIRNS, selectedCairnId, () => samplerAlwaysOccluding()),
      { initialProps: { selectedCairnId: null as string | null } },
    )

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.has('near')).toBe(true)

    // 'near' is selected without a new settle — the stale verdict from
    // before selection must not survive the switch.
    rerender({ selectedCairnId: 'near' })

    expect(result.current.has('near')).toBe(false)
  })

  it('issues no new requests when the camera returns to an already-evaluated position', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const sampleAlongPath = vi.fn(samplerAlwaysOccluding().sampleAlongPath)
    const { result } = renderHook(() =>
      useCairnOcclusion(map3d, CAIRNS, null, () => ({ sampleAlongPath })),
    )

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.size).toBe(2)
    expect(sampleAlongPath).toHaveBeenCalledTimes(2)

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sampleAlongPath).toHaveBeenCalledTimes(2)
  })

  it('draws everything with no elevation sampler', async () => {
    const map3d = fakeMap3d({ lat: 0, lng: 0, altitude: 3000 })
    const { result } = renderHook(() => useCairnOcclusion(map3d, CAIRNS, null, () => null))

    await act(async () => {
      map3d.steady()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.size).toBe(0)
  })
})
