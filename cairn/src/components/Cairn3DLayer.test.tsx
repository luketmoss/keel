import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PositionedCairn } from './CairnLayer'

/* Same imperative-lifecycle stubbing strategy as Track3DLayer.test.tsx, with
   one addition: a `MarkerElement` hosts arbitrary HTML (unlike
   `Polyline3DElement`, which draws nothing React portals into), so the fake
   here is a real `<div>` wearing the extra properties the component sets on
   it — a constructor that returns an object override `this`, which is legal
   JS and lets `new MarkerElement(options)` yield an element `createPortal`
   can actually render into and tests can actually query. */
const { map3dResult, maps3dLibResult, readyLib, removeSpy } = vi.hoisted(() => {
  const removeSpy = vi.fn()

  class FakeMarkerElement {
    constructor(options: Record<string, unknown>) {
      const el = document.createElement('div')
      el.dataset.fakeMarker = 'true'
      Object.assign(el, options)
      const nativeRemove = el.remove.bind(el)
      el.remove = () => {
        removeSpy(el)
        nativeRemove()
      }
      return el as unknown as FakeMarkerElement
    }
  }

  const map3dResult = {
    current: {
      append: (marker: HTMLElement) => {
        document.body.appendChild(marker)
      },
    } as unknown,
  }
  const readyLib = {
    MarkerElement: FakeMarkerElement,
    AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
  }
  const maps3dLibResult = { current: readyLib as unknown }

  return { map3dResult, maps3dLibResult, readyLib, removeSpy }
})

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap3D: () => map3dResult.current,
  useMapsLibrary: () => maps3dLibResult.current,
}))

import { Cairn3DLayer } from './Cairn3DLayer'

const PIN: PositionedCairn = {
  id: 'cairn-1',
  name: 'Lookout',
  thumbnailDriveFileId: null,
  icon: null,
  latitude: 1,
  longitude: 2,
  source: 'placed',
}

const OTHER: PositionedCairn = {
  id: 'cairn-2',
  name: 'Camp',
  thumbnailDriveFileId: null,
  icon: null,
  latitude: 3,
  longitude: 4,
  source: 'placed',
}

describe('Cairn3DLayer (#273)', () => {
  beforeEach(() => {
    removeSpy.mockClear()
    document.body.innerHTML = ''
    maps3dLibResult.current = readyLib
  })

  it('draws one MarkerElement per cairn, clamped to the ground, carrying its name', () => {
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    const markers = document.body.querySelectorAll('[data-fake-marker]')
    expect(markers).toHaveLength(1)
    const marker = markers[0] as unknown as { altitudeMode: string; title: string }
    expect(marker.altitudeMode).toBe('CLAMP_TO_GROUND')
    expect(marker.title).toBe('Lookout')
  })

  it('removes a marker whose cairn is no longer in the list', () => {
    const { rerender } = render(
      <Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />,
    )
    expect(document.body.querySelectorAll('[data-fake-marker]')).toHaveLength(1)

    rerender(<Cairn3DLayer cairns={[]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    expect(removeSpy).toHaveBeenCalled()
    expect(document.body.querySelectorAll('[data-fake-marker]')).toHaveLength(0)
  })

  it('portals CairnMarker in, and a click selects then opens the cairn, in that order', () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    render(
      <Cairn3DLayer
        cairns={[PIN]}
        accessToken={null}
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
      />,
    )

    fireEvent.click(screen.getByTestId('cairn-marker-3d'))

    expect(onSelectCairn).toHaveBeenCalledWith('cairn-1')
    expect(onOpenCairn).toHaveBeenCalledWith('cairn-1')
    const selectOrder = onSelectCairn.mock.invocationCallOrder[0]
    const openOrder = onOpenCairn.mock.invocationCallOrder[0]
    expect(selectOrder).toBeLessThan(openOrder)
  })

  it('writes hoveredCairnIds on pointerenter/pointerleave', () => {
    const onHoverCairn = vi.fn()
    render(
      <Cairn3DLayer
        cairns={[PIN]}
        accessToken={null}
        selectedCairnId={null}
        onSelectCairn={vi.fn()}
        onHoverCairn={onHoverCairn}
      />,
    )

    const hit = screen.getByTestId('cairn-marker-3d')
    fireEvent.pointerEnter(hit)
    expect(onHoverCairn).toHaveBeenLastCalledWith(new Set(['cairn-1']))

    fireEvent.pointerLeave(hit)
    expect(onHoverCairn).toHaveBeenLastCalledWith(new Set())
  })

  it('re-appends the selected marker so it is last in the surface child order', () => {
    const { rerender } = render(
      <Cairn3DLayer cairns={[PIN, OTHER]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />,
    )
    function lastMarker() {
      const markers = document.body.querySelectorAll('[data-fake-marker]')
      return markers[markers.length - 1] as unknown as { title: string }
    }
    expect(lastMarker().title).toBe('Camp')

    rerender(
      <Cairn3DLayer cairns={[PIN, OTHER]} accessToken={null} selectedCairnId="cairn-1" onSelectCairn={vi.fn()} />,
    )

    expect(lastMarker().title).toBe('Lookout')
  })

  it('renders nothing until the maps3d library is ready', () => {
    maps3dLibResult.current = null
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)
    expect(document.body.querySelectorAll('[data-fake-marker]')).toHaveLength(0)
  })
})
