import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { map3dResult, maps3dLibResult, PolylineCtor, removeSpy } = vi.hoisted(() => {
  const removeSpy = vi.fn()

  class FakePolyline3DInteractiveElement {
    path: unknown
    strokeColor: unknown
    strokeWidth: unknown
    outerColor: unknown
    outerWidth: unknown
    zIndex: unknown
    altitudeMode: unknown
    drawsOccludedSegments: unknown
    listeners = new Map<string, () => void>()
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options)
    }
    addEventListener(type: string, listener: () => void) {
      this.listeners.set(type, listener)
    }
    dispatch(type: string) {
      this.listeners.get(type)?.()
    }
    remove() {
      removeSpy(this)
    }
  }

  const appended: FakePolyline3DInteractiveElement[] = []
  const map3dResult = {
    current: {
      append: (line: FakePolyline3DInteractiveElement) => appended.push(line),
      appended,
    } as unknown,
  }
  const maps3dLibResult = {
    current: {
      Polyline3DInteractiveElement: FakePolyline3DInteractiveElement,
      AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
    } as unknown,
  }

  return { map3dResult, maps3dLibResult, PolylineCtor: FakePolyline3DInteractiveElement, removeSpy }
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

  it('draws one interactive polyline per track, clamped to the ground, in its own colour', () => {
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

describe('Track3DLayer selection (#288)', () => {
  beforeEach(() => {
    appended().length = 0
    removeSpy.mockClear()
  })

  const tracks: Track3D[] = [
    { key: 'a', fileId: 'file-a', index: 0, color: '#FF3B30', points: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] },
    { key: 'b', fileId: 'file-b', index: 1, color: '#0000FF', points: [{ lat: 5, lng: 6 }, { lat: 7, lng: 8 }] },
  ]

  it('draws every track at rest, with no outer edge, when nothing is selected', () => {
    render(<Track3DLayer tracks={tracks} />)

    for (const line of appended()) {
      expect(line.strokeWidth).toBe(4)
      expect(line.outerColor).toBeNull()
      expect(line.outerWidth).toBeNull()
      expect(line.zIndex).toBe(line === appended()[0] ? 0 : 1)
    }
  })

  it('gives the selected file heavier stroke, an outer edge, and the selected band', () => {
    render(<Track3DLayer tracks={tracks} selectedFileId="file-b" />)

    const [rest, selected] = appended()
    expect(rest.strokeWidth).toBe(4)
    expect(rest.outerColor).toBeNull()

    expect(selected.strokeWidth).toBe(8)
    expect(selected.outerColor).toBe('#00000059')
    expect(selected.outerWidth).toBe(0.3)
    expect(selected.zIndex).toBe(20001)
  })

  it('restyles an existing line in place when the selection changes, rather than recreating it', () => {
    const { rerender } = render(<Track3DLayer tracks={tracks} selectedFileId={null} />)
    expect(appended()).toHaveLength(2)

    rerender(<Track3DLayer tracks={tracks} selectedFileId="file-a" />)

    expect(appended()).toHaveLength(2)
    expect(appended()[0].strokeWidth).toBe(8)
  })

  it('fires onSelectRoute with the fileId when a route is clicked', () => {
    const onSelectRoute = vi.fn()
    render(<Track3DLayer tracks={tracks} onSelectRoute={onSelectRoute} />)

    appended()[1].dispatch('gmp-click')

    expect(onSelectRoute).toHaveBeenCalledWith('file-b')
  })

  it('does not fire a click while hitLinesEnabled is false', () => {
    const onSelectRoute = vi.fn()
    render(<Track3DLayer tracks={tracks} onSelectRoute={onSelectRoute} hitLinesEnabled={false} />)

    appended()[0].dispatch('gmp-click')

    expect(onSelectRoute).not.toHaveBeenCalled()
  })

  it('picks up hitLinesEnabled turning back on without recreating the line', () => {
    const onSelectRoute = vi.fn()
    const { rerender } = render(
      <Track3DLayer tracks={tracks} onSelectRoute={onSelectRoute} hitLinesEnabled={false} />,
    )
    rerender(<Track3DLayer tracks={tracks} onSelectRoute={onSelectRoute} hitLinesEnabled={true} />)

    appended()[0].dispatch('gmp-click')

    expect(onSelectRoute).toHaveBeenCalledWith('file-a')
  })

  it('does nothing on click when no onSelectRoute is wired (the world view)', () => {
    render(<Track3DLayer tracks={tracks} />)

    expect(() => appended()[0].dispatch('gmp-click')).not.toThrow()
  })
})
