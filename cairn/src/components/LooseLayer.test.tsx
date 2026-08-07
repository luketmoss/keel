import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LooseLayer } from './LooseLayer'
import type { LooseRecord, LooseStore } from '../store/looseStore'

/* Same stubbing strategy as PhotoLayer.test.tsx — AdvancedMarker renders
   its children directly so assertions read the DOM. LooseLayer also draws
   a Polyline for a hovered/selected track's route, which none of these
   tests trigger, so a no-op stub is enough. */
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => ({}),
  AdvancedMarker: ({
    position,
    onClick,
    children,
  }: {
    position: { lat: number; lng: number }
    onClick?: () => void
    children?: React.ReactNode
  }) => (
    <div data-testid="advanced-marker" data-lat={position.lat} data-lng={position.lng} onClick={onClick}>
      {children}
    </div>
  ),
  Polyline: () => null,
}))

/* #134 — the photo marker's thumbnail resolves through #53's caching
   loader, mocked at the module boundary exactly as `PhotoLayer.test.tsx`
   and `LooseFace.test.tsx` both do. */
const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire },
}))

beforeEach(() => {
  acquire.mockReset()
})

function loosePhoto(overrides: Partial<Extract<LooseRecord, { kind: 'photo' }>> = {}): LooseRecord {
  return {
    kind: 'photo',
    id: 'photo-1',
    name: 'sapporo.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    takenAt: '2024-11-03T00:00:00.000Z',
    position: { lat: 43, lng: 141 },
    originalDriveFileId: 'orig-1',
    thumbnailDriveFileId: 'thumb-1',
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
    const { container } = renderLayer([loosePhoto()])

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'thumb-1'))
    await waitFor(() => expect(container.querySelector('.loose-marker__photo img')).not.toBeNull())

    expect(container.querySelector('.loose-marker__photo img')?.getAttribute('src')).toBe(
      'blob:fake-thumb',
    )
  })

  it('keeps drawing the plain circle marker when the thumbnail fails to load', async () => {
    acquire.mockRejectedValue(new Error('network error'))
    const { container } = renderLayer([loosePhoto()])

    await waitFor(() => expect(acquire).toHaveBeenCalled())

    expect(container.querySelector('.loose-marker__photo img')).toBeNull()
    // The marker itself is still drawn — nothing disappears from the map.
    expect(container.querySelector('.loose-marker__photo')).not.toBeNull()
  })

  it('keeps drawing the plain circle marker for a photo with no thumbnail id', () => {
    const { container } = renderLayer([loosePhoto({ thumbnailDriveFileId: null })])

    expect(acquire).not.toHaveBeenCalled()
    expect(container.querySelector('.loose-marker__photo img')).toBeNull()
    expect(container.querySelector('.loose-marker__photo')).not.toBeNull()
  })

  it('fetches nothing while signed out', () => {
    renderLayer([loosePhoto()], null)

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
