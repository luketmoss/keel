import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { map3dResult, maps3dLibResult, PolylineCtor, removeSpy } = vi.hoisted(() => {
  const removeSpy = vi.fn()

  class FakePolyline3DElement {
    path: unknown
    strokeColor: unknown
    strokeWidth: unknown
    altitudeMode: unknown
    drawsOccludedSegments: unknown
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options)
    }
    remove() {
      removeSpy(this)
    }
  }

  const appended: FakePolyline3DElement[] = []
  const map3dResult = {
    current: {
      append: (line: FakePolyline3DElement) => appended.push(line),
      appended,
    } as unknown,
  }
  const maps3dLibResult = {
    current: {
      Polyline3DElement: FakePolyline3DElement,
      AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
    } as unknown,
  }

  return { map3dResult, maps3dLibResult, PolylineCtor: FakePolyline3DElement, removeSpy }
})

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap3D: () => map3dResult.current,
  useMapsLibrary: () => maps3dLibResult.current,
}))

import { Track3DLayer } from './Track3DLayer'
import type { Track3D } from '../map/track3D'

function appended() {
  return (map3dResult.current as { appended: InstanceType<typeof PolylineCtor>[] }).appended
}

describe('Track3DLayer (#271)', () => {
  beforeEach(() => {
    appended().length = 0
    removeSpy.mockClear()
  })

  it('draws one Polyline3DElement per track, clamped to the ground, in its own colour', () => {
    const tracks: Track3D[] = [
      { key: 'a', color: '#FF3B30', points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] },
    ]
    render(<Track3DLayer tracks={tracks} />)

    expect(appended()).toHaveLength(1)
    const line = appended()[0]
    expect(line.strokeColor).toBe('#FF3B30')
    expect(line.altitudeMode).toBe('CLAMP_TO_GROUND')
    expect(line.path).toEqual([
      { lat: 1, lng: 2, altitude: 0 },
      { lat: 3, lng: 4, altitude: 0 },
    ])
  })

  it('skips a track with fewer than two points', () => {
    const tracks: Track3D[] = [{ key: 'a', color: '#fff', points: [{ lat: 1, lng: 2 }] }]
    render(<Track3DLayer tracks={tracks} />)

    expect(appended()).toHaveLength(0)
  })

  it('removes a line whose track is no longer in the list', () => {
    const tracks: Track3D[] = [
      { key: 'a', color: '#fff', points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] },
    ]
    const { rerender } = render(<Track3DLayer tracks={tracks} />)
    expect(appended()).toHaveLength(1)

    rerender(<Track3DLayer tracks={[]} />)

    expect(removeSpy).toHaveBeenCalled()
  })
})
