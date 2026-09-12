import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PositionMarker, accuracyRadiusPixels } from './PositionMarker'
import { STALE_FIX_MS, type PositionFix } from '../map/useGeolocation'

const circleInstances: FakeCircle[] = []

class FakeCircle {
  options: Record<string, unknown>
  map: unknown = null
  constructor(options: Record<string, unknown>) {
    this.options = options
    this.map = options.map ?? null
    circleInstances.push(this)
  }
  setMap(map: unknown) {
    this.map = map
  }
}

const mapListeners: Record<string, (() => void)[]> = {}

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => fakeMap,
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

const getZoom = vi.fn(() => 17)
const fakeMap = { getZoom }

function fix(overrides: Partial<PositionFix> = {}): PositionFix {
  return { position: { lat: 39.5, lng: -105.5 }, accuracyMeters: 12, at: Date.now(), ...overrides }
}

beforeEach(() => {
  circleInstances.length = 0
  for (const key of Object.keys(mapListeners)) delete mapListeners[key]
  getZoom.mockReturnValue(17)
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      Circle: FakeCircle,
      event: {
        addListener: (_map: unknown, event: string, handler: () => void) => {
          ;(mapListeners[event] ??= []).push(handler)
          return { remove: () => {} }
        },
      },
    },
  }
})

afterEach(() => {
  delete (globalThis as unknown as { google?: unknown }).google
})

describe('PositionMarker', () => {
  it('draws at the fix and names the accuracy in the app’s own units', () => {
    const { container } = render(<PositionMarker fix={fix()} canCreate onCreate={vi.fn()} />)

    const marker = container.querySelector('[data-testid="advanced-marker"]')
    expect(marker?.getAttribute('data-lat')).toBe('39.5')
    expect(marker?.getAttribute('data-lng')).toBe('-105.5')
    // 12 m is 39 ft — imperial, per `formatDistance`'s one unit switch.
    expect(screen.getByRole('button', { name: 'Your location, accurate to about 39 ft' })).toBeDefined()
  })

  it('keeps the callout shut until the dot is tapped, and closes it on a second tap', () => {
    const { container } = render(<PositionMarker fix={fix()} canCreate onCreate={vi.fn()} />)
    const marker = container.querySelector('[data-testid="advanced-marker"]')!

    expect(screen.queryByText('You are here')).toBeNull()
    fireEvent.click(marker)
    expect(screen.getByText('You are here')).toBeDefined()
    fireEvent.click(marker)
    expect(screen.queryByText('You are here')).toBeNull()
  })

  it('offers the create action and hands it the fix', () => {
    const onCreate = vi.fn()
    const { container } = render(<PositionMarker fix={fix()} canCreate onCreate={onCreate} />)

    fireEvent.click(container.querySelector('[data-testid="advanced-marker"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Drop a cairn here' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('omits the create action entirely while a decision owns the map', () => {
    const { container } = render(
      <PositionMarker fix={fix()} canCreate={false} onCreate={vi.fn()} />,
    )

    fireEvent.click(container.querySelector('[data-testid="advanced-marker"]')!)

    expect(screen.getByText('You are here')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Drop a cairn here' })).toBeNull()
  })

  it('says how old a stale fix is, and says nothing about a current one', () => {
    const { container, rerender } = render(
      <PositionMarker fix={fix()} canCreate onCreate={vi.fn()} />,
    )
    fireEvent.click(container.querySelector('[data-testid="advanced-marker"]')!)
    expect(screen.queryByText(/Located/)).toBeNull()

    rerender(
      <PositionMarker
        fix={fix({ at: Date.now() - STALE_FIX_MS - 60_000 })}
        canCreate
        onCreate={vi.fn()}
      />,
    )
    fireEvent.click(container.querySelector('[data-testid="advanced-marker"]')!)
    expect(screen.getByText('Located 3 minutes ago')).toBeDefined()
  })

  it('closes the callout when a fresh fix replaces the one it described', () => {
    const { container, rerender } = render(
      <PositionMarker fix={fix()} canCreate onCreate={vi.fn()} />,
    )
    fireEvent.click(container.querySelector('[data-testid="advanced-marker"]')!)
    expect(screen.getByText('You are here')).toBeDefined()

    rerender(<PositionMarker fix={fix({ position: { lat: 1, lng: 2 } })} canCreate onCreate={vi.fn()} />)

    expect(screen.queryByText('You are here')).toBeNull()
  })

  it('closes the callout on Escape', () => {
    const { container } = render(<PositionMarker fix={fix()} canCreate onCreate={vi.fn()} />)
    fireEvent.click(container.querySelector('[data-testid="advanced-marker"]')!)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByText('You are here')).toBeNull()
  })

  it('draws the accuracy circle in metres, so it rescales with zoom', () => {
    render(<PositionMarker fix={fix({ accuracyMeters: 250 })} canCreate onCreate={vi.fn()} />)

    expect(circleInstances).toHaveLength(1)
    expect(circleInstances[0].options.radius).toBe(250)
    expect(circleInstances[0].options.center).toEqual({ lat: 39.5, lng: -105.5 })
    expect(circleInstances[0].map).toBe(fakeMap)
  })

  it('hides the accuracy circle once it would be smaller than the dot', () => {
    // 2 m at zoom 17 is under a pixel; at zoom 21 it clears the dot.
    render(<PositionMarker fix={fix({ accuracyMeters: 2 })} canCreate onCreate={vi.fn()} />)
    expect(circleInstances[0].map).toBeNull()

    getZoom.mockReturnValue(21)
    mapListeners['zoom_changed']?.forEach((handler) => handler())
    expect(circleInstances[0].map).toBe(fakeMap)
  })

  it('draws no circle at all for a fix with no reported accuracy', () => {
    render(<PositionMarker fix={fix({ accuracyMeters: 0 })} canCreate onCreate={vi.fn()} />)

    expect(circleInstances).toHaveLength(0)
  })
})

describe('accuracyRadiusPixels', () => {
  it('shrinks as the camera zooms out', () => {
    const f = fix({ accuracyMeters: 1_000 })

    expect(accuracyRadiusPixels(f, 16)).toBeGreaterThan(accuracyRadiusPixels(f, 12))
  })

  it('halves for each zoom level given up', () => {
    const f = fix({ accuracyMeters: 1_000 })

    expect(accuracyRadiusPixels(f, 15)).toBeCloseTo(accuracyRadiusPixels(f, 16) / 2, 6)
  })
})
