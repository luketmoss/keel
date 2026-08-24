import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGroundAltitudeCache } from './groundAltitude'
import type { ElevationSampler } from '../geo/elevation'

/* #303 — the one helper #288's reveal and #292's arrival fit both call.
   Exercised directly, the same way `groundAltitude.test.ts` and
   `flyover.test.ts` prove their own piece without a component: a fake
   `Map3DElement` and a fake `ElevationSampler` are the whole surface it
   touches. */
const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { current: false } }))
vi.mock('./motion', () => ({ prefersReducedMotion: () => reducedMotion.current }))

import { flyToFramedGround } from './flyToFramedGround'

function fakeMap3d() {
  return {
    heading: 12,
    tilt: 47,
    center: null as unknown,
    range: null as unknown,
    flyCameraTo: vi.fn(),
  }
}

function sampler(elevations: number[] | null): ElevationSampler {
  return {
    sampleAlongPath: async () =>
      elevations === null
        ? { ok: false as const, reason: 'UNKNOWN_ERROR' }
        : {
            ok: true as const,
            samples: elevations.map((elevationMeters) => ({ lat: 0, lng: 0, elevationMeters })),
          },
  }
}

const TRACK = [
  { lat: 10, lng: 20 },
  { lat: 10.02, lng: 20.02 },
]

beforeEach(() => {
  reducedMotion.current = false
  clearGroundAltitudeCache()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('flyToFramedGround (#303)', () => {
  it('flies to the framed subject with the ground as the look-at altitude, heading and tilt unchanged', async () => {
    const map3d = fakeMap3d()
    await flyToFramedGround(map3d as unknown as google.maps.maps3d.Map3DElement, TRACK, 280, sampler([2400]))

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
    const call = map3d.flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.heading).toBe(12)
    expect(call.endCamera.tilt).toBe(47)
    expect(call.endCamera.center.altitude).toBe(2400)
    expect(call.endCamera.center.lat).toBeCloseTo(10.01)
    expect(call.durationMillis).toBe(280)
  })

  it('does nothing for a subject with no usable geometry', async () => {
    const map3d = fakeMap3d()
    await flyToFramedGround(map3d as unknown as google.maps.maps3d.Map3DElement, [], 280, sampler([2400]))

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('flattens to tilt 0 and sea level when the ground cannot be resolved', async () => {
    const map3d = fakeMap3d()
    await flyToFramedGround(map3d as unknown as google.maps.maps3d.Map3DElement, TRACK, 280, sampler(null))

    const call = map3d.flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.tilt).toBe(0)
    expect(call.endCamera.center.altitude).toBe(0)
    // Heading stays live even when the ground could not be resolved.
    expect(call.endCamera.heading).toBe(12)
  })

  it('flattens to tilt 0 with no sampler at all', async () => {
    const map3d = fakeMap3d()
    await flyToFramedGround(map3d as unknown as google.maps.maps3d.Map3DElement, TRACK, 280, null)

    expect(map3d.flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(0)
  })

  it('under reduced motion, assigns the camera directly instead of flying', async () => {
    reducedMotion.current = true
    const map3d = fakeMap3d()
    await flyToFramedGround(map3d as unknown as google.maps.maps3d.Map3DElement, TRACK, 280, sampler([2400]))

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
    const center = map3d.center as { lat: number; altitude: number }
    expect(center.altitude).toBe(2400)
    expect(map3d.tilt).toBe(47)
    expect(map3d.range).toBeGreaterThan(0)
  })

  it('does not apply the flight once `shouldApply` says the move is stale', async () => {
    const map3d = fakeMap3d()
    await flyToFramedGround(
      map3d as unknown as google.maps.maps3d.Map3DElement,
      TRACK,
      280,
      sampler([2400]),
      () => false,
    )

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('a sea-level subject resolves the ground to approximately zero and pushes nothing away', async () => {
    const map3d = fakeMap3d()
    await flyToFramedGround(map3d as unknown as google.maps.maps3d.Map3DElement, TRACK, 280, sampler([0]))

    const call = map3d.flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.center.altitude).toBe(0)
    expect(call.endCamera.tilt).toBe(47)
  })
})
