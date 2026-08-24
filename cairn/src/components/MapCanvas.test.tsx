import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { fitTracksToBounds } = vi.hoisted(() => ({ fitTracksToBounds: vi.fn() }))
vi.mock('../map/fitBounds', () => ({ fitTracksToBounds, zoomToFitCluster: vi.fn(), FIT_PADDING: 48 }))

const { setZoom, getZoom, fakeMap } = vi.hoisted(() => {
  const setZoom = vi.fn()
  const getZoom = vi.fn(() => 5)
  return { setZoom, getZoom, fakeMap: { setZoom, getZoom } }
})

/* `useMap` is what decides whether the corner controls can act at all, so
   it's the one thing worth swapping per test. #271's 3D surface stays
   unmounted in every test here — `use3DSupport` (mocked below) reports
   `'unavailable'` by default, same as a browser that can't draw 3D, which
   this file has no reason to exercise beyond MapCanvas's own coupling
   logic (covered directly, without the surface). */
const { useMapResult, mapProps } = vi.hoisted(() => ({
  useMapResult: { current: null as unknown },
  mapProps: vi.fn(),
}))
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: (props: unknown) => {
    mapProps(props)
    return <div data-testid="map" />
  },
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  useMap: () => useMapResult.current,
}))

const { use3DSupportResult } = vi.hoisted(() => ({
  use3DSupportResult: {
    current: { support: 'unavailable', library: null } as {
      support: 'checking' | 'available' | 'unavailable'
      library: null
    },
  },
}))
vi.mock('../map/use3DSupport', () => ({
  use3DSupport: () => use3DSupportResult.current,
  MAPS_3D_UNAVAILABLE_SENTENCE: "This browser can't draw 3D. Check that hardware acceleration is on.",
}))

vi.mock('./Map3D', () => ({
  Map3DSurface: () => null,
}))

import { MapCanvas } from './MapCanvas'
import { Map3DControlProvider } from '../map/Map3DControl'
import { HOME_BOUNDS, HOME_CORNERS } from '../map/homeView'

function renderCanvas(
  options: {
    canFit?: boolean
    points?: { lat: number; lng: number }[]
    mapReady?: boolean
    panelCollapsed?: boolean
  } = {},
) {
  const { canFit = true, points = [{ lat: 1, lng: 2 }], mapReady = true, panelCollapsed = false } =
    options
  useMapResult.current = mapReady ? fakeMap : null
  return render(
    <Map3DControlProvider>
      <MapCanvas panelCollapsed={panelCollapsed} canFit={canFit} getFitPoints={() => points} />
    </Map3DControlProvider>,
  )
}

afterEach(() => {
  setZoom.mockClear()
  getZoom.mockClear()
  fitTracksToBounds.mockClear()
  mapProps.mockClear()
  window.localStorage.clear()
})

describe('MapCanvas corner controls (#109)', () => {
  it('zoom in steps the camera up one level', () => {
    renderCanvas()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

    expect(setZoom).toHaveBeenCalledWith(6)
  })

  it('zoom out steps the camera down one level', () => {
    renderCanvas()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))

    expect(setZoom).toHaveBeenCalledWith(4)
  })

  it('fit-to-everything fits the camera to whatever is on the map right now', () => {
    const points = [
      { lat: 10, lng: 20 },
      { lat: -30, lng: 150 },
    ]
    renderCanvas({ points })

    fireEvent.click(screen.getByRole('button', { name: 'Fit to everything' }))

    expect(fitTracksToBounds).toHaveBeenCalledWith(fakeMap, points)
  })

  it('disables fit-to-everything when there is nothing to fit to', () => {
    renderCanvas({ canFit: false })

    expect(screen.getByRole('button', { name: 'Fit to everything' })).toHaveProperty(
      'disabled',
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fit to everything' }))
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('disables every control until the map instance exists', () => {
    renderCanvas({ mapReady: false })

    for (const label of ['Zoom in', 'Zoom out', 'Fit to everything']) {
      expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', true)
    }
  })

  it('clears the column while it is open and returns to the map edge when it collapses', () => {
    const open = renderCanvas({ panelCollapsed: false })
    expect(open.container.querySelector('.map-layers-cluster--clear')).toBeNull()
    open.unmount()

    const collapsed = renderCanvas({ panelCollapsed: true })
    expect(collapsed.container.querySelector('.map-layers-cluster--clear')).not.toBeNull()
  })
})

describe('the home view (#304)', () => {
  afterEach(() => {
    use3DSupportResult.current = { support: 'unavailable', library: null }
  })

  it('opens the map on the Colorado extent, inset-aware, rather than the whole world', () => {
    renderCanvas()

    const props = mapProps.mock.calls[0][0] as { defaultBounds: unknown }
    expect(props.defaultBounds).toEqual({
      ...HOME_BOUNDS,
      padding: { left: 48, right: 48, top: 48, bottom: 48 },
    })
  })

  it('Reset view is never disabled, unlike fit-to-everything', () => {
    renderCanvas({ canFit: false, mapReady: false })

    expect(screen.getByRole('button', { name: 'Reset view' })).not.toHaveProperty('disabled', true)
  })

  it('Reset view fits the 2D map to the home extent, inset-aware, with 3D off', () => {
    renderCanvas()

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))

    expect(fitTracksToBounds).toHaveBeenCalledWith(fakeMap, HOME_CORNERS, {
      left: 48,
      right: 48,
      top: 48,
      bottom: 48,
    })
  })

  it('Reset view leaves the 2D map alone when 3D is on', () => {
    use3DSupportResult.current = { support: 'available', library: null }
    renderCanvas()
    fireEvent.click(screen.getByRole('switch', { name: '3D' }))
    fitTracksToBounds.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))

    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })
})

describe('MapCanvas layers/3D cluster (#284)', () => {
  afterEach(() => {
    use3DSupportResult.current = { support: 'unavailable', library: null }
  })

  it('shows the 3D toggle only on Satellite, the default basemap', () => {
    renderCanvas()
    expect(screen.getByRole('switch', { name: '3D' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Layers:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))

    expect(screen.queryByRole('switch', { name: '3D' })).toBeNull()
  })
})

describe('MapCanvas 3D/basemap coupling (#271)', () => {
  afterEach(() => {
    use3DSupportResult.current = { support: 'unavailable', library: null }
  })

  it('disables the 3D switch when the browser cannot draw 3D', () => {
    renderCanvas()

    expect(screen.getByRole('switch', { name: '3D' }).hasAttribute('disabled')).toBe(true)
  })

  // #271's other direction — turning 3D on while Map or Terrain is selected
  // — is unreachable through the UI now that #284 renders the 3D toggle
  // only on Satellite, so it's dropped rather than kept as a case that can
  // no longer happen.

  it('selecting Map or Terrain while 3D is on turns 3D off', () => {
    use3DSupportResult.current = { support: 'available', library: null }
    renderCanvas()
    fireEvent.click(screen.getByRole('switch', { name: '3D' }))
    expect(screen.getByRole('switch', { name: '3D' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /Layers:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))

    expect(screen.queryByRole('switch', { name: '3D' })).toBeNull()
  })
})
