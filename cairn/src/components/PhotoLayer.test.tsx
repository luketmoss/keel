import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PhotoLayer, type PositionedPhoto } from './PhotoLayer'

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
    children,
  }: {
    position: { lat: number; lng: number }
    onClick?: () => void
    children?: React.ReactNode
  }) => (
    <div
      data-testid="advanced-marker"
      data-lat={position.lat}
      data-lng={position.lng}
      onClick={onClick}
    >
      {children}
    </div>
  ),
}))

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

function positionedPhoto(overrides: Partial<PositionedPhoto> = {}): PositionedPhoto {
  return {
    id: 'p1',
    name: 'a.jpg',
    thumbnailDriveFileId: 'thumb-1',
    latitude: 10,
    longitude: 20,
    source: 'exif',
    ...overrides,
  }
}

describe('PhotoLayer', () => {
  it('renders a marker for a positioned photo at its position (criterion 1)', () => {
    const { container } = render(
      <PhotoLayer
        photos={[positionedPhoto({ latitude: 12.5, longitude: -3.2 })]}
        accessToken="token"
        selectedPhotoId={null}
        onSelectPhoto={() => {}}
      />,
    )

    const marker = container.querySelector('[data-testid="advanced-marker"]')
    expect(marker).not.toBeNull()
    expect(marker?.getAttribute('data-lat')).toBe('12.5')
    expect(marker?.getAttribute('data-lng')).toBe('-3.2')
  })

  it('renders nothing for an empty photo list, and does not error (criterion 9 / no-photos state)', () => {
    const { container } = render(
      <PhotoLayer photos={[]} accessToken="token" selectedPhotoId={null} onSelectPhoto={() => {}} />,
    )

    expect(container.querySelectorAll('[data-testid="advanced-marker"]')).toHaveLength(0)
  })

  it('gives a recorded and a derived photo different ring styling (criterion 2)', () => {
    const { container } = render(
      <PhotoLayer
        photos={[
          positionedPhoto({ id: 'recorded', source: 'exif', latitude: 1, longitude: 1 }),
          positionedPhoto({ id: 'derived', source: 'interpolated', latitude: 40, longitude: 40 }),
        ]}
        accessToken="token"
        selectedPhotoId={null}
        onSelectPhoto={() => {}}
      />,
    )

    const recorded = container.querySelector('[data-photo-id="recorded"]') as HTMLElement
    const derived = container.querySelector('[data-photo-id="derived"]') as HTMLElement
    const recordedRing = recorded.querySelector('.photo-marker') as HTMLElement
    const derivedRing = derived.querySelector('.photo-marker') as HTMLElement

    expect(recordedRing.style.borderStyle).toBe('solid')
    expect(derivedRing.style.borderStyle).toBe('dashed')
    expect(recordedRing.style.borderColor).not.toBe(derivedRing.style.borderColor)
  })

  it('marks the selected photo distinctly and calls onSelectPhoto when clicked (criteria 6, 7)', () => {
    const onSelectPhoto = vi.fn()
    const { container } = render(
      <PhotoLayer
        photos={[
          positionedPhoto({ id: 'a', latitude: 1, longitude: 1 }),
          positionedPhoto({ id: 'b', latitude: 40, longitude: 40 }),
        ]}
        accessToken="token"
        selectedPhotoId="b"
        onSelectPhoto={onSelectPhoto}
      />,
    )

    const a = container.querySelector('[data-photo-id="a"]') as HTMLElement
    const b = container.querySelector('[data-photo-id="b"]') as HTMLElement
    expect(a.getAttribute('data-selected')).toBe('false')
    expect(b.getAttribute('data-selected')).toBe('true')

    const aRing = a.querySelector('.photo-marker') as HTMLElement
    const bRing = b.querySelector('.photo-marker') as HTMLElement
    expect(aRing.style.borderColor).not.toBe(bRing.style.borderColor)

    a.querySelector('[data-testid="advanced-marker"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelectPhoto).toHaveBeenCalledWith('a')
  })

  it('clusters two overlapping photos into one marker showing their count (criterion 4)', () => {
    currentZoom = 3
    const { container } = render(
      <PhotoLayer
        photos={[
          positionedPhoto({ id: 'a', latitude: 10, longitude: 20 }),
          positionedPhoto({ id: 'b', latitude: 10.0001, longitude: 20.0001 }),
        ]}
        accessToken="token"
        selectedPhotoId={null}
        onSelectPhoto={() => {}}
      />,
    )

    expect(container.querySelectorAll('[data-testid="photo-marker"]')).toHaveLength(0)
    const cluster = container.querySelector('[data-testid="photo-cluster"]')
    expect(cluster).not.toBeNull()
    expect(cluster?.getAttribute('data-count')).toBe('2')
  })

  it('a cluster mixing recorded and derived photos takes the dashed ring (weaker claim wins)', () => {
    currentZoom = 3
    const { container } = render(
      <PhotoLayer
        photos={[
          positionedPhoto({ id: 'a', latitude: 10, longitude: 20, source: 'exif' }),
          positionedPhoto({ id: 'b', latitude: 10.0001, longitude: 20.0001, source: 'interpolated' }),
        ]}
        accessToken="token"
        selectedPhotoId={null}
        onSelectPhoto={() => {}}
      />,
    )

    const cluster = container.querySelector('[data-testid="photo-cluster"]')
    expect(cluster?.getAttribute('data-source')).toBe('interpolated')
    const ring = cluster?.querySelector('.photo-marker') as HTMLElement
    expect(ring.style.borderStyle).toBe('dashed')
  })

  it('separates a cluster into individual markers once zoomed in far enough (criterion 5)', () => {
    const photos = [
      positionedPhoto({ id: 'a', latitude: 10, longitude: 20 }),
      positionedPhoto({ id: 'b', latitude: 10.0001, longitude: 20.0001 }),
    ]

    currentZoom = 3
    const { container, rerender } = render(
      <PhotoLayer photos={photos} accessToken="token" selectedPhotoId={null} onSelectPhoto={() => {}} />,
    )
    expect(container.querySelectorAll('[data-testid="photo-cluster"]')).toHaveLength(1)

    currentZoom = 21
    rerender(
      <PhotoLayer photos={photos} accessToken="token" selectedPhotoId={null} onSelectPhoto={() => {}} />,
    )
    expect(container.querySelectorAll('[data-testid="photo-cluster"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="photo-marker"]')).toHaveLength(2)
  })

  it('clicking an already-selected marker opens the lightbox instead of reselecting (#55 wiring)', () => {
    const onSelectPhoto = vi.fn()
    const onOpenPhoto = vi.fn()
    const { container } = render(
      <PhotoLayer
        photos={[positionedPhoto({ id: 'a' })]}
        accessToken="token"
        selectedPhotoId="a"
        onSelectPhoto={onSelectPhoto}
        onOpenPhoto={onOpenPhoto}
      />,
    )

    container
      .querySelector('[data-testid="advanced-marker"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onOpenPhoto).toHaveBeenCalledWith('a')
    expect(onSelectPhoto).not.toHaveBeenCalled()
  })

  it('clicking a not-yet-selected marker only selects it, never opens (#55 wiring)', () => {
    const onSelectPhoto = vi.fn()
    const onOpenPhoto = vi.fn()
    const { container } = render(
      <PhotoLayer
        photos={[positionedPhoto({ id: 'a' })]}
        accessToken="token"
        selectedPhotoId={null}
        onSelectPhoto={onSelectPhoto}
        onOpenPhoto={onOpenPhoto}
      />,
    )

    container
      .querySelector('[data-testid="advanced-marker"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelectPhoto).toHaveBeenCalledWith('a')
    expect(onOpenPhoto).not.toHaveBeenCalled()
  })

  it('resolves a thumbnail through the image cache and renders it once ready', async () => {
    const { container } = render(
      <PhotoLayer
        photos={[positionedPhoto()]}
        accessToken="token"
        selectedPhotoId={null}
        onSelectPhoto={() => {}}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:fake-thumb')
    })
  })
})
