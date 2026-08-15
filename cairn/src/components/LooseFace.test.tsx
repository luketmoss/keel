import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LooseFace } from './LooseFace'
import type { LooseRecord } from '../store/looseStore'

/* #134 — the detail face's image resolves through #53's caching loader,
   mocked here the same way `PhotoList.test.tsx` mocks it: at the module
   boundary, not the hook, since `usePhotoImage` (the hook in between) is
   already exhaustively covered by its own test file. */
const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire },
}))

beforeEach(() => {
  acquire.mockReset()
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

function renderFace(item: LooseRecord, accessToken: string | null = 'token') {
  return render(
    <LooseFace
      item={item}
      trips={[]}
      accessToken={accessToken}
      onAddToTrip={vi.fn()}
      onCreateTripWith={vi.fn()}
      onDelete={vi.fn()}
      onRename={vi.fn().mockResolvedValue(true)}
      onRecolor={vi.fn().mockResolvedValue(true)}
      onExport={vi.fn()}
      disabled={false}
    />,
  )
}

describe('LooseFace — #134 the cairn image', () => {
  it("shows the image once the caching loader resolves the thumbnail's url", async () => {
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
    const { container } = renderFace(looseCairn())

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'thumb-1'))
    await waitFor(() =>
      expect(container.querySelector('.loose-face__image img')).not.toBeNull(),
    )

    const img = container.querySelector('.loose-face__image img')
    expect(img?.getAttribute('src')).toBe('blob:fake-thumb')
  })

  it('shows only the fallback fill — no broken-image glyph — while loading', () => {
    acquire.mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = renderFace(looseCairn())

    expect(container.querySelector('.loose-face__image img')).toBeNull()
    expect(container.querySelector('.loose-face__image')).not.toBeNull()
  })

  it('shows only the fallback fill when the load fails', async () => {
    acquire.mockRejectedValue(new Error('network error'))
    const { container } = renderFace(looseCairn())

    await waitFor(() => expect(acquire).toHaveBeenCalled())
    expect(container.querySelector('.loose-face__image img')).toBeNull()
  })

  it('shows no image box at all for an icon-only cairn, and never calls acquire', () => {
    const { container } = renderFace(looseCairn({ image: null, icon: 'campsite' }))

    expect(acquire).not.toHaveBeenCalled()
    expect(container.querySelector('.loose-face__image')).toBeNull()
  })

  it('fetches nothing while signed out', () => {
    renderFace(looseCairn(), null)

    expect(acquire).not.toHaveBeenCalled()
  })

  it("does not touch the image loader for a track's face", () => {
    renderFace({
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
    })

    expect(acquire).not.toHaveBeenCalled()
  })
})
