import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlacementClickCatcher } from './PlacementClickCatcher'

const fakeMap = { setOptions: vi.fn() }
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => fakeMap,
}))

let clickHandler: ((event: { latLng: { lat: () => number; lng: () => number } | null }) => void) | undefined
const removeListener = vi.fn()

;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: (
        _map: unknown,
        _event: string,
        handler: (event: { latLng: { lat: () => number; lng: () => number } | null }) => void,
      ) => {
        clickHandler = handler
        return { remove: removeListener }
      },
    },
  },
}

describe('PlacementClickCatcher', () => {
  it('sets the crosshair cursor and attaches a click listener while active', () => {
    render(<PlacementClickCatcher active={true} onPlace={vi.fn()} />)

    expect(fakeMap.setOptions).toHaveBeenCalledWith({ draggableCursor: 'crosshair' })
    expect(clickHandler).toBeDefined()
  })

  it('calls onPlace with the clicked coordinate', () => {
    const onPlace = vi.fn()
    render(<PlacementClickCatcher active={true} onPlace={onPlace} />)

    clickHandler?.({ latLng: { lat: () => 12.5, lng: () => -3.2 } })

    expect(onPlace).toHaveBeenCalledWith({ lat: 12.5, lng: -3.2 })
  })

  it('ignores a click with no coordinate', () => {
    const onPlace = vi.fn()
    render(<PlacementClickCatcher active={true} onPlace={onPlace} />)

    clickHandler?.({ latLng: null })

    expect(onPlace).not.toHaveBeenCalled()
  })

  it('does nothing while inactive — no listener, no cursor change', () => {
    fakeMap.setOptions.mockClear()
    render(<PlacementClickCatcher active={false} onPlace={vi.fn()} />)

    expect(fakeMap.setOptions).not.toHaveBeenCalled()
  })

  it('removes the listener and restores the cursor on cleanup', () => {
    fakeMap.setOptions.mockClear()
    removeListener.mockClear()
    const { unmount } = render(<PlacementClickCatcher active={true} onPlace={vi.fn()} />)

    unmount()

    expect(removeListener).toHaveBeenCalled()
    expect(fakeMap.setOptions).toHaveBeenCalledWith({ draggableCursor: null })
  })
})
