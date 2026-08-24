import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LooseLayer } from './LooseLayer'
import type { LooseRecord, LooseStore } from '../store/looseStore'

/* Same stubbing strategy as CairnLayer.test.tsx — AdvancedMarker renders
   its children directly so assertions read the DOM. LooseLayer also draws
   a Polyline for a hovered/selected track's route, which none of these
   tests trigger, so a no-op stub is enough. */
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => ({}),
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
      ref={(node) => {
        if (node) Object.assign(node, { __onDragStart: onDragStart, __onDrag: onDrag, __onDragEnd: onDragEnd })
      }}
    >
      {children}
    </div>
  ),
  Polyline: () => null,
}))

/* #312 — the settle re-frame's `dragstart` listener (registered whenever
   `map` is truthy, which the mock above always is) needs `google.maps.event`
   to exist, the same minimal stub `CairnLayer.test.tsx` already carries for
   its own always-on `zoom_changed` listener. Nothing here drives a drag
   through it; the tests exercising `cameraDisownedRef` live in
   `reveal.test.ts` and this file's own #270 suite reads `revealPoints`/
   `revealPoint` at the module boundary instead. */
;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: () => ({ remove: () => {} }),
      addListenerOnce: () => {},
    },
  },
}

/** Drives a marker's drag lifecycle straight through the handlers the mock
    above stashed on its DOM node, the same as `CairnLayer.test.tsx`'s. */
function fireDrag(element: Element, lat: number, lng: number) {
  const node = element as unknown as {
    __onDragStart?: () => void
    __onDragEnd?: (e: google.maps.MapMouseEvent) => void
  }
  node.__onDragStart?.()
  node.__onDragEnd?.({ latLng: { lat: () => lat, lng: () => lng } } as unknown as google.maps.MapMouseEvent)
}

/* #134 — the photo marker's thumbnail resolves through #53's caching
   loader, mocked at the module boundary exactly as `CairnLayer.test.tsx`
   and `LooseFace.test.tsx` both do. */
const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire },
}))

/* #270 — `revealPoints`/`columnInset` are mocked so the reveal effect's own
   camera geometry (`reveal.test.ts`'s job) stays out of these assertions;
   what's proven here is only that `LooseLayer` calls it with the right
   points for the right item. */
const { revealPoints, revealPoint, columnInset } = vi.hoisted(() => ({
  revealPoints: vi.fn(),
  revealPoint: vi.fn(),
  columnInset: vi.fn(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
}))
vi.mock('../map/reveal', () => ({ revealPoints, revealPoint, columnInset }))

beforeEach(() => {
  acquire.mockReset()
  revealPoints.mockClear()
  revealPoint.mockClear()
  columnInset.mockClear()
})

function looseCairn(overrides: Partial<Extract<LooseRecord, { kind: 'cairn' }>> = {}): LooseRecord {
  return {
    kind: 'cairn',
    id: 'cairn-1',
    name: 'sapporo.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    date: '2024-11-03T00:00:00.000Z',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    uploadState: 'ok',
    ...overrides,
  }
}

/* LooseLayer never calls any of these for a still-loose item — every path
   that would (moveIntoTrip, claimFromTrip, saveOverview, update) needs a
   trip id or a patch none of these tests supply. A minimal stub satisfies
   the type without asserting on it. */
const noopStore = {} as LooseStore

function renderLayer(items: LooseRecord[], accessToken: string | null = 'token') {
  return render(
    <LooseLayer
      items={items}
      store={noopStore}
      accessToken={accessToken}
      hoveredId={null}
      onHover={vi.fn()}
      onSelect={vi.fn()}
      selectedId={null}
    />,
  )
}

describe('LooseLayer — #134 the photo marker', () => {
  it("draws the photo's thumbnail once the caching loader resolves it", async () => {
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
    const { container } = renderLayer([looseCairn()])

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'thumb-1'))
    await waitFor(() => expect(container.querySelector('.loose-marker__photo img')).not.toBeNull())

    expect(container.querySelector('.loose-marker__photo img')?.getAttribute('src')).toBe(
      'blob:fake-thumb',
    )
  })

  it('keeps drawing the plain circle marker when the thumbnail fails to load', async () => {
    acquire.mockRejectedValue(new Error('network error'))
    const { container } = renderLayer([looseCairn()])

    await waitFor(() => expect(acquire).toHaveBeenCalled())

    expect(container.querySelector('.loose-marker__photo img')).toBeNull()
    // The marker itself is still drawn — nothing disappears from the map.
    expect(container.querySelector('.loose-marker__photo')).not.toBeNull()
  })

  it('#169: draws an icon-only cairn as a pin carrying its icon, not the thumbnail circle', () => {
    const { container } = renderLayer([looseCairn({ image: null, icon: 'campsite' })])

    expect(acquire).not.toHaveBeenCalled()
    expect(container.querySelector('.loose-marker__photo img')).toBeNull()
    expect(container.querySelector('.cairn-marker--pin')).not.toBeNull()
    expect(container.querySelector('.cairn-marker--thumb')).toBeNull()
  })

  it('fetches nothing while signed out', () => {
    renderLayer([looseCairn()], null)

    expect(acquire).not.toHaveBeenCalled()
  })

  it("does not touch the image loader for a track's tile", () => {
    renderLayer([
      {
        kind: 'track',
        id: 'track-1',
        name: 'Mount Rosea',
        createdAt: '2026-01-01T00:00:00.000Z',
        date: '2024-03-09T00:00:00.000Z',
        distanceMeters: 14200,
        ascentMeters: 690,
        elevationLossMeters: 620,
        highPointMeters: 2100,
        lowPointMeters: 1500,
        durationSeconds: 19_200,
        elevationProfile: null,
        pointCount: 512,
        sourceName: 'rosea.kml',
        colorIndex: 0,
        position: { lat: -37, lng: 142 },
        driveFileId: null,
        uploadState: 'ok',
      },
    ])

    expect(acquire).not.toHaveBeenCalled()
  })
})

describe('LooseLayer dragging a cairn (#158)', () => {
  beforeEach(() => {
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
  })

  it('marks a cairn draggable when the layer is and the item can change owner', () => {
    const { container } = render(
      <LooseLayer
        items={[looseCairn()]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
        draggable={true}
      />,
    )
    expect(container.querySelector('[data-testid="advanced-marker"]')?.getAttribute('data-draggable')).toBe('true')
  })

  it('refuses to drag a cairn still mid-upload, even when the layer allows it (canChangeOwner)', () => {
    const { container } = render(
      <LooseLayer
        items={[looseCairn({ uploadState: 'uploading' })]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
        draggable={true}
      />,
    )
    expect(container.querySelector('[data-testid="advanced-marker"]')?.getAttribute('data-draggable')).toBe('false')
  })

  it('a real move calls onMoveCairn with the item id and the dropped coordinate', () => {
    const onMoveCairn = vi.fn().mockResolvedValue(true)
    const { container } = render(
      <LooseLayer
        items={[looseCairn({ id: 'c-1' })]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
        selectedId={null}
        draggable={true}
        onMoveCairn={onMoveCairn}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]') as Element
    fireDrag(marker, 9, 10)

    expect(onMoveCairn).toHaveBeenCalledWith('c-1', { lat: 9, lng: 10 })
  })

  it('a real drag swallows the click that follows — no navigation', () => {
    const onSelect = vi.fn()
    const onMoveCairn = vi.fn().mockResolvedValue(true)
    const { container } = render(
      <LooseLayer
        items={[looseCairn({ id: 'c-1' })]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={onSelect}
        selectedId={null}
        draggable={true}
        onMoveCairn={onMoveCairn}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]') as Element
    fireDrag(marker, 9, 10)
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a zero-distance drag still selects on the click that follows', () => {
    const onSelect = vi.fn()
    const onMoveCairn = vi.fn().mockResolvedValue(true)
    const cairn = looseCairn({ id: 'c-1', position: { lat: 43, lng: 141 } })
    const { container } = render(
      <LooseLayer
        items={[cairn]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={onSelect}
        selectedId={null}
        draggable={true}
        onMoveCairn={onMoveCairn}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]') as Element
    fireDrag(marker, 43, 141)
    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onMoveCairn).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(cairn)
  })
})

describe('LooseLayer — #270 reveal', () => {
  const fakeMap = {}

  it('reveals a selected cairn at its own coordinate via #302s close-up reveal', () => {
    render(
      <LooseLayer
        items={[looseCairn({ id: 'c-1', position: { lat: 43, lng: 141 }, image: null, icon: 'campsite' })]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
        selectedId="c-1"
      />,
    )

    expect(revealPoint).toHaveBeenCalledWith(fakeMap, { lat: 43, lng: 141 }, {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    })
    expect(revealPoints).not.toHaveBeenCalled()
  })

  it("reveals a selected track's precomputed overview, never the source KML", () => {
    const overview = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: [[142, -37], [142.1, -37.1]] },
        },
      ],
    }
    const store = { getOverview: vi.fn(() => overview) } as unknown as LooseStore
    render(
      <LooseLayer
        items={[
          {
            kind: 'track',
            id: 't-1',
            name: 'Mount Rosea',
            createdAt: '2026-01-01T00:00:00.000Z',
            date: '2024-03-09T00:00:00.000Z',
            distanceMeters: 14200,
            ascentMeters: 690,
            elevationLossMeters: 620,
            highPointMeters: 2100,
            lowPointMeters: 1500,
            durationSeconds: 19_200,
            elevationProfile: null,
            pointCount: 512,
            sourceName: 'rosea.kml',
            colorIndex: 0,
            position: { lat: -37, lng: 142 },
            driveFileId: null,
            uploadState: 'ok',
          },
        ]}
        store={store}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
        selectedId="t-1"
      />,
    )

    expect(store.getOverview).toHaveBeenCalledWith('t-1')
    expect(revealPoints).toHaveBeenCalledWith(
      fakeMap,
      [{ lat: -37, lng: 142 }, { lat: -37.1, lng: 142.1 }],
      { left: 0, right: 0, top: 0, bottom: 0 },
    )
  })

  it('does not reveal while a decision owns the map', () => {
    render(
      <LooseLayer
        items={[looseCairn({ id: 'c-1', image: null, icon: 'campsite' })]}
        store={noopStore}
        accessToken="token"
        hoveredId={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
        selectedId="c-1"
        revealSuspended
      />,
    )

    expect(revealPoints).not.toHaveBeenCalled()
    expect(revealPoint).not.toHaveBeenCalled()
  })
})
