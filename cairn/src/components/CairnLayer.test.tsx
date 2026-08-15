import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CairnLayer, type PositionedCairn } from './CairnLayer'

/* Same stubbing strategy as TrackLayer.test.tsx — AdvancedMarker renders its
   children directly into a positioned div so assertions read the DOM rather
   than trusting the mock library actually mounted a marker. */
let currentZoom = 10

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => ({
    getZoom: () => currentZoom,
  }),
  AdvancedMarker: ({
    position,
    onClick,
    draggable,
    onDragStart,
    onDrag,
    onDragEnd,
    children,
  }: {
    position: { lat: number; lng: number }
    onClick?: () => void
    draggable?: boolean
    onDragStart?: () => void
    onDrag?: () => void
    onDragEnd?: (e: google.maps.MapMouseEvent) => void
    children?: React.ReactNode
  }) => (
    <div
      data-testid="advanced-marker"
      data-lat={position.lat}
      data-lng={position.lng}
      data-draggable={draggable}
      onClick={onClick}
      // Real drag events are DOM CustomEvents this mock can't reproduce —
      // tests instead call these directly, the way `CairnLayer.tsx` itself
      // does through `useDraggableCairn`'s returned handlers.
      ref={(node) => {
        if (node) Object.assign(node, { __onDragStart: onDragStart, __onDrag: onDrag, __onDragEnd: onDragEnd })
      }}
    >
      {children}
    </div>
  ),
}))

/** Drives a marker's drag lifecycle straight through the handlers the mock
    above stashed on its DOM node — `element` is the `[data-testid="advanced-
    marker"]` div itself. */
function fireDrag(element: Element, lat: number, lng: number) {
  const node = element as unknown as {
    __onDragStart?: () => void
    __onDragEnd?: (e: google.maps.MapMouseEvent) => void
  }
  node.__onDragStart?.()
  node.__onDragEnd?.({ latLng: { lat: () => lat, lng: () => lng } } as unknown as google.maps.MapMouseEvent)
}

;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: () => {
        // No test here drives a live zoom change through the global, so a
        // no-op listener registration is enough — `currentZoom` is set
        // directly by tests instead.
        return { remove: () => {} }
      },
      addListenerOnce: () => {},
    },
    LatLngBounds: class {
      private points: { lat: number; lng: number }[] = []
      extend(point: { lat: number; lng: number }) {
        this.points.push(point)
      }
      getNorthEast() {
        return { equals: (other: { lat: number; lng: number }) => this.points.every((p) => p.lat === other.lat && p.lng === other.lng) }
      }
      getSouthWest() {
        return this.points[0]
      }
    },
  },
}

vi.mock('../photo/imageCache', () => ({
  photoImageCache: {
    acquire: vi.fn().mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() }),
  },
}))

function positionedCairn(overrides: Partial<PositionedCairn> = {}): PositionedCairn {
  return {
    id: 'p1',
    name: 'a.jpg',
    thumbnailDriveFileId: 'thumb-1',
    icon: null,
    latitude: 10,
    longitude: 20,
    source: 'exif',
    ...overrides,
  }
}

describe('CairnLayer', () => {
  it('renders a marker for a positioned cairn at its position (criterion 1)', () => {
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ latitude: 12.5, longitude: -3.2 })]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]')
    expect(marker).not.toBeNull()
    expect(marker?.getAttribute('data-lat')).toBe('12.5')
    expect(marker?.getAttribute('data-lng')).toBe('-3.2')
  })

  it('renders nothing for an empty cairn list, and does not error', () => {
    const { container } = render(
      <CairnLayer cairns={[]} accessToken="token" selectedCairnId={null} onSelectCairn={() => {}} />,
    )

    expect(container.querySelectorAll('[data-testid="advanced-marker"]')).toHaveLength(0)
  })

  it('a cairn with an image and no icon draws as a thumbnail (criterion 1)', () => {
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ icon: null, thumbnailDriveFileId: 'thumb-1' })]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )
    expect(container.querySelector('.cairn-marker--thumb')).not.toBeNull()
    expect(container.querySelector('.cairn-marker--pin')).toBeNull()
  })

  it('a cairn with an icon draws as a pin, whether or not it also has an image (criterion 2, 3)', () => {
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ icon: 'campsite', thumbnailDriveFileId: 'thumb-1' })]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )
    expect(container.querySelector('.cairn-marker--pin')).not.toBeNull()
    expect(container.querySelector('.cairn-marker__badge')).not.toBeNull()
  })

  it('gives a recorded and a derived thumbnail cairn different ring styling', () => {
    const { container } = render(
      <CairnLayer
        cairns={[
          positionedCairn({ id: 'recorded', source: 'exif', latitude: 1, longitude: 1 }),
          positionedCairn({ id: 'derived', source: 'interpolated', latitude: 40, longitude: 40 }),
        ]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )

    const recorded = container.querySelector('[data-cairn-id="recorded"]') as HTMLElement
    const derived = container.querySelector('[data-cairn-id="derived"]') as HTMLElement
    const recordedRing = recorded.querySelector('.cairn-marker--thumb') as HTMLElement
    const derivedRing = derived.querySelector('.cairn-marker--thumb') as HTMLElement

    expect(recordedRing.style.borderStyle).toBe('solid')
    expect(derivedRing.style.borderStyle).toBe('dashed')
    expect(recordedRing.style.borderColor).not.toBe(derivedRing.style.borderColor)
  })

  it('marks the selected cairn distinctly and calls onSelectCairn when clicked (criteria 6, 7)', () => {
    const onSelectCairn = vi.fn()
    const { container } = render(
      <CairnLayer
        cairns={[
          positionedCairn({ id: 'a', latitude: 1, longitude: 1 }),
          positionedCairn({ id: 'b', latitude: 40, longitude: 40 }),
        ]}
        accessToken="token"
        selectedCairnId="b"
        onSelectCairn={onSelectCairn}
      />,
    )

    const a = container.querySelector('[data-cairn-id="a"]') as HTMLElement
    const b = container.querySelector('[data-cairn-id="b"]') as HTMLElement
    expect(a.getAttribute('data-selected')).toBe('false')
    expect(b.getAttribute('data-selected')).toBe('true')

    a.querySelector('[data-testid="advanced-marker"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelectCairn).toHaveBeenCalledWith('a')
  })

  it('clusters two overlapping cairns into one marker showing their count (criterion 4)', () => {
    currentZoom = 3
    const { container } = render(
      <CairnLayer
        cairns={[
          positionedCairn({ id: 'a', latitude: 10, longitude: 20 }),
          positionedCairn({ id: 'b', latitude: 10.0001, longitude: 20.0001 }),
        ]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )

    expect(container.querySelectorAll('[data-testid="cairn-marker"]')).toHaveLength(0)
    const cluster = container.querySelector('[data-testid="cairn-cluster"]')
    expect(cluster).not.toBeNull()
    expect(cluster?.getAttribute('data-count')).toBe('2')
  })

  it('a cluster mixing recorded and derived cairns takes the dashed ring (weaker claim wins)', () => {
    currentZoom = 3
    const { container } = render(
      <CairnLayer
        cairns={[
          positionedCairn({ id: 'a', latitude: 10, longitude: 20, source: 'exif' }),
          positionedCairn({ id: 'b', latitude: 10.0001, longitude: 20.0001, source: 'interpolated' }),
        ]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )

    const cluster = container.querySelector('[data-testid="cairn-cluster"]')
    expect(cluster?.getAttribute('data-source')).toBe('interpolated')
    const ring = cluster?.querySelector('.cairn-layer__cluster') as HTMLElement
    expect(ring.style.borderStyle).toBe('dashed')
  })

  it('separates a cluster into individual markers once zoomed in far enough (criterion 5)', () => {
    const cairns = [
      positionedCairn({ id: 'a', latitude: 10, longitude: 20 }),
      positionedCairn({ id: 'b', latitude: 10.0001, longitude: 20.0001 }),
    ]

    currentZoom = 3
    const { container, rerender } = render(
      <CairnLayer cairns={cairns} accessToken="token" selectedCairnId={null} onSelectCairn={() => {}} />,
    )
    expect(container.querySelectorAll('[data-testid="cairn-cluster"]')).toHaveLength(1)

    currentZoom = 21
    rerender(
      <CairnLayer cairns={cairns} accessToken="token" selectedCairnId={null} onSelectCairn={() => {}} />,
    )
    expect(container.querySelectorAll('[data-testid="cairn-cluster"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="cairn-marker"]')).toHaveLength(2)
  })

  it('clicking an already-selected marker opens the lightbox instead of reselecting (#55 wiring)', () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ id: 'a' })]}
        accessToken="token"
        selectedCairnId="a"
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
      />,
    )

    container
      .querySelector('[data-testid="advanced-marker"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onOpenCairn).toHaveBeenCalledWith('a')
    expect(onSelectCairn).not.toHaveBeenCalled()
  })

  it('clicking a not-yet-selected marker only selects it, never opens (#55 wiring)', () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ id: 'a' })]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
      />,
    )

    container
      .querySelector('[data-testid="advanced-marker"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelectCairn).toHaveBeenCalledWith('a')
    expect(onOpenCairn).not.toHaveBeenCalled()
  })

  it('resolves a thumbnail through the image cache and renders it once ready', async () => {
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn()]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:fake-thumb')
    })
  })
})

describe('CairnLayer dragging (#158)', () => {
  it('marks the marker draggable when the layer is, and not otherwise (default)', () => {
    const { container } = render(
      <CairnLayer cairns={[positionedCairn()]} accessToken="token" selectedCairnId={null} onSelectCairn={() => {}} />,
    )
    expect(container.querySelector('[data-testid="advanced-marker"]')?.getAttribute('data-draggable')).toBe('false')
  })

  it('a real move calls onMoveCairn with the cairn id and the dropped coordinate', async () => {
    const onMoveCairn = vi.fn().mockResolvedValue(true)
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ id: 'a' })]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={() => {}}
        draggable={true}
        onMoveCairn={onMoveCairn}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]') as Element
    expect(marker.getAttribute('data-draggable')).toBe('true')
    fireDrag(marker, 9, 10)

    expect(onMoveCairn).toHaveBeenCalledWith('a', { lat: 9, lng: 10 })
  })

  it('a real drag does not open or select — the click that follows is swallowed', async () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    const onMoveCairn = vi.fn().mockResolvedValue(true)
    const { container } = render(
      <CairnLayer
        cairns={[positionedCairn({ id: 'a' })]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
        draggable={true}
        onMoveCairn={onMoveCairn}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]') as Element
    fireDrag(marker, 9, 10)
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelectCairn).not.toHaveBeenCalled()
    expect(onOpenCairn).not.toHaveBeenCalled()
  })

  it('a zero-distance drag still selects on the click that follows (criterion 3)', () => {
    const onSelectCairn = vi.fn()
    const onMoveCairn = vi.fn().mockResolvedValue(true)
    const cairn = positionedCairn({ id: 'a', latitude: 10, longitude: 20 })
    const { container } = render(
      <CairnLayer
        cairns={[cairn]}
        accessToken="token"
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        draggable={true}
        onMoveCairn={onMoveCairn}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]') as Element
    fireDrag(marker, cairn.latitude, cairn.longitude)
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onMoveCairn).not.toHaveBeenCalled()
    expect(onSelectCairn).toHaveBeenCalledWith('a')
  })
})
