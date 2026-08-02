import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrackLayer } from './TrackLayer'
import type { ImportedFile } from '../import/types'

/** jsdom has no `matchMedia` at all — every case that doesn't care about
    reduced motion must leave it absent, which is what "no stub installed"
    means here (see map/motion.ts's own guard for the `undefined` case). */
function stubReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia
}

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
    visible: true,
    tracks: [{ name: 'Track', points: [{ lat: 37, lon: -122 }, { lat: 37.1, lon: -122.1 }] }],
    trackStats: [{ distanceMeters: 0, durationSeconds: undefined, elevationGainMeters: undefined }],
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

  it('excludes a hidden file from both the map and the bounds fit', () => {
    fitTracksToBounds.mockClear()
    const { container } = render(
      <TrackLayer
        files={[
          importedFile({ id: 'a', visible: true }),
          importedFile({
            id: 'b',
            colorIndex: 1,
            visible: false,
            tracks: [{ name: 'Hidden', points: [{ lat: 50, lon: 50 }, { lat: 51, lon: 51 }] }],
          }),
        ]}
      />,
    )

    const colors = Array.from(container.querySelectorAll('[data-testid="polyline"]'))
      .map((el) => el.getAttribute('data-color'))
      .filter((color) => color !== '#00000059')
    expect(colors).toEqual(['#FF3B30'])
    expect(fitTracksToBounds).toHaveBeenCalledWith(
      fakeMap,
      expect.not.arrayContaining([{ lat: 50, lng: 50 }]),
    )
  })

  it('re-fits when a file is toggled visible again, without the file count changing', () => {
    fitTracksToBounds.mockClear()
    const { rerender } = render(
      <TrackLayer
        files={[importedFile({ id: 'a', visible: false }), importedFile({ id: 'b', colorIndex: 1 })]}
      />,
    )
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)

    rerender(
      <TrackLayer
        files={[importedFile({ id: 'a', visible: true }), importedFile({ id: 'b', colorIndex: 1 })]}
      />,
    )

    expect(fitTracksToBounds).toHaveBeenCalledTimes(2)
  })

  describe('draw-on (#49)', () => {
    afterEach(() => {
      vi.useRealTimers()
      // @ts-expect-error -- removing the stub installed per-test, not a real API
      delete window.matchMedia
    })

    it('reveals a newly imported track a point at a time, reaching the full path', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })
      const points = Array.from({ length: 10 }, (_, i) => ({ lat: i, lon: i }))
      const { container } = render(
        <TrackLayer files={[importedFile({ tracks: [{ name: 'Track', points }] })]} />,
      )

      const colored = () =>
        Array.from(container.querySelectorAll('[data-testid="polyline"]')).find(
          (el) => el.getAttribute('data-color') === '#FF3B30',
        )!

      const firstFrame = Number(colored().getAttribute('data-points'))
      expect(firstFrame).toBeLessThan(10)

      act(() => {
        vi.advanceTimersByTime(320)
      })

      expect(Number(colored().getAttribute('data-points'))).toBe(10)
    })

    it('shows the complete track immediately under prefers-reduced-motion, with no partial frame', () => {
      stubReducedMotion(true)
      const points = Array.from({ length: 10 }, (_, i) => ({ lat: i, lon: i }))
      const { container } = render(
        <TrackLayer files={[importedFile({ tracks: [{ name: 'Track', points }] })]} />,
      )

      const colored = Array.from(container.querySelectorAll('[data-testid="polyline"]')).find(
        (el) => el.getAttribute('data-color') === '#FF3B30',
      )!
      expect(Number(colored.getAttribute('data-points'))).toBe(10)
    })

    it('does not replay the animation when a track is hidden and shown again', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })
      const points = Array.from({ length: 10 }, (_, i) => ({ lat: i, lon: i }))
      const file = importedFile({ tracks: [{ name: 'Track', points }] })
      const { container, rerender } = render(<TrackLayer files={[file]} />)

      act(() => {
        vi.advanceTimersByTime(320)
      })

      rerender(<TrackLayer files={[{ ...file, visible: false }]} />)
      rerender(<TrackLayer files={[file]} />)

      const colored = Array.from(container.querySelectorAll('[data-testid="polyline"]')).find(
        (el) => el.getAttribute('data-color') === '#FF3B30',
      )!
      expect(Number(colored.getAttribute('data-points'))).toBe(10)
    })
  })

  describe('hover glow (#49)', () => {
    it('renders an extra low-opacity polyline for the hovered file, and none when nothing is hovered', () => {
      const { container, rerender } = render(
        <TrackLayer files={[importedFile({ id: 'a' })]} hoveredFileId={null} />,
      )
      expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(2)

      rerender(<TrackLayer files={[importedFile({ id: 'a' })]} hoveredFileId="a" />)
      expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(3)
    })

    it('does not glow a file other than the one hovered', () => {
      const { container } = render(
        <TrackLayer
          files={[importedFile({ id: 'a' }), importedFile({ id: 'b', colorIndex: 1 })]}
          hoveredFileId="b"
        />,
      )
      // 2 tracks × 2 polylines each, plus exactly one glow polyline for 'b'.
      expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(5)
    })
  })
})
