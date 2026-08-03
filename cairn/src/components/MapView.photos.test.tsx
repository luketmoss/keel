import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PositionedPhoto } from '../photo/positionPhotos'

/* Isolated from MapView.test.tsx because this file needs a Map ID stubbed
   (PhotoLayer only mounts when one is configured) and a PhotoLayer mock
   that surfaces its received props — narrowly checking the #55 wiring
   that "clicking an already-selected marker opens the lightbox" reaches
   PhotoLayer through MapView, without re-testing PhotoLayer's own
   click-handling logic (PhotoLayer.test.tsx's job). */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

vi.mock('./PhotoLayer', () => ({
  PhotoLayer: (props: { onOpenPhoto?: (id: string) => void }) => (
    <div
      data-testid="photo-layer-stub"
      data-has-open-photo={typeof props.onOpenPhoto === 'function'}
    />
  ),
}))

async function renderMapView(photos: PositionedPhoto[], onOpenPhoto: (id: string) => void) {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'a-map-id')
  vi.resetModules()
  const { MapView } = await import('./MapView')
  return render(
    <MapView files={[]} photos={photos} accessToken="token" selectedPhotoId={null} onOpenPhoto={onOpenPhoto} />,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('MapView — #55 onOpenPhoto wiring', () => {
  it('threads onOpenPhoto through to PhotoLayer', async () => {
    const onOpenPhoto = vi.fn()
    const photo: PositionedPhoto = {
      id: 'p1',
      name: 'a.jpg',
      thumbnailDriveFileId: 'thumb-1',
      latitude: 1,
      longitude: 1,
      source: 'exif',
    }

    const { getByTestId } = await renderMapView([photo], onOpenPhoto)

    expect(getByTestId('photo-layer-stub').getAttribute('data-has-open-photo')).toBe('true')
  })
})
