import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackLayer } from './TrackLayer'
import type { ImportedFile } from '../import/types'

const { fitTracksToBounds } = vi.hoisted(() => ({ fitTracksToBounds: vi.fn() }))
vi.mock('../map/fitBounds', () => ({ fitTracksToBounds }))

const fakeMap = { id: 'fake-map' }
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => fakeMap,
  Marker: (props: { position: { lat: number; lng: number }; icon: { fillColor: string } }) => (
    <div data-testid="marker" data-color={props.icon.fillColor} data-lat={props.position.lat} />
  ),
  Polyline: (props: { path: { lat: number; lng: number }[]; strokeColor: string }) => (
    <div data-testid="polyline" data-color={props.strokeColor} data-points={props.path.length} />
  ),
}))

;(globalThis as unknown as { google: unknown }).google = {
  maps: { SymbolPath: { CIRCLE: 0 } },
}

function importedFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  return {
    id: 'f1',
    name: 'trip.kml',
    colorIndex: 0,
    tracks: [{ name: 'Track', points: [{ lat: 37, lon: -122 }, { lat: 37.1, lon: -122.1 }] }],
    ...overrides,
  }
}

describe('TrackLayer', () => {
  it('draws a track as a casing polyline plus a coloured polyline on top', () => {
    const { container } = render(<TrackLayer files={[importedFile()]} />)

    const polylines = container.querySelectorAll('[data-testid="polyline"]')
    expect(polylines).toHaveLength(2)
    expect(polylines[0].getAttribute('data-color')).toBe('#00000059')
    expect(polylines[1].getAttribute('data-color')).toBe('#FF3B30')
  })

  it('draws a single-point track as a marker instead of a polyline', () => {
    const { container } = render(
      <TrackLayer
        files={[importedFile({ tracks: [{ name: 'Point', points: [{ lat: 10, lon: 20 }] }] })]}
      />,
    )

    expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(0)
    const marker = container.querySelector('[data-testid="marker"]')
    expect(marker?.getAttribute('data-color')).toBe('#FF3B30')
  })

  it('gives files different colours by colour index, not array position', () => {
    const { container } = render(
      <TrackLayer
        files={[importedFile({ id: 'a', colorIndex: 0 }), importedFile({ id: 'b', colorIndex: 3 })]}
      />,
    )

    const colors = Array.from(container.querySelectorAll('[data-testid="polyline"]'))
      .map((el) => el.getAttribute('data-color'))
      .filter((color) => color !== '#00000059')
    expect(colors).toEqual(['#FF3B30', '#FF00A8'])
  })

  it('fits bounds to all points when the file count grows', () => {
    fitTracksToBounds.mockClear()
    render(<TrackLayer files={[importedFile()]} />)

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).toHaveBeenCalledWith(
      fakeMap,
      expect.arrayContaining([{ lat: 37, lng: -122 }, { lat: 37.1, lng: -122.1 }]),
    )
  })

  it('re-fits when a second file is imported', () => {
    fitTracksToBounds.mockClear()
    const { rerender } = render(<TrackLayer files={[importedFile({ id: 'a' })]} />)
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)

    rerender(
      <TrackLayer files={[importedFile({ id: 'a' }), importedFile({ id: 'b', colorIndex: 1 })]} />,
    )

    expect(fitTracksToBounds).toHaveBeenCalledTimes(2)
  })

  it('does not re-fit when the file count shrinks', () => {
    fitTracksToBounds.mockClear()
    const { rerender } = render(
      <TrackLayer files={[importedFile({ id: 'a' }), importedFile({ id: 'b', colorIndex: 1 })]} />,
    )
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)

    rerender(<TrackLayer files={[importedFile({ id: 'a' })]} />)

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
  })
})
