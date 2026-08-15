import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CairnCreateGesture } from './CairnCreateGesture'

/* The gesture is listeners on the shared map, so the map is faked the same
   way `PlacementClickCatcher.test.tsx` fakes it — the component under test
   is the wiring, not Google's event system. */

const mapDiv = document.createElement('div')
const fakeMap = {
  getDiv: () => mapDiv,
  getBounds: () => ({
    getNorthEast: () => ({ lat: () => 40, lng: () => 140 }),
    getSouthWest: () => ({ lat: () => 20, lng: () => 100 }),
  }),
}

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => fakeMap,
}))

let contextMenuHandler:
  | ((event: { latLng: { lat: () => number; lng: () => number } | null; domEvent?: Event }) => void)
  | undefined
const removeListener = vi.fn()

;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: (
        _map: unknown,
        _event: string,
        handler: (event: { latLng: { lat: () => number; lng: () => number } | null }) => void,
      ) => {
        contextMenuHandler = handler
        return { remove: removeListener }
      },
    },
  },
}

const LAT_LNG = { latLng: { lat: () => 12.5, lng: () => -3.2 } }

/** jsdom lays nothing out, so the map's box has to be stated for the
    long-press conversion to have anything to divide by. */
function giveMapDivASize() {
  mapDiv.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 200 }) as DOMRect
}

/** jsdom implements no `PointerEvent`, so one is assembled from the
    `MouseEvent` it does implement plus the `pointerType` the gesture reads.
    The component only ever touches `pointerType`, `clientX` and `clientY`,
    which is exactly what this carries. */
function pointerEvent(
  type: string,
  init: { pointerType: string; clientX?: number; clientY?: number },
): Event {
  const event = new MouseEvent(type, {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    bubbles: true,
  })
  Object.defineProperty(event, 'pointerType', { value: init.pointerType })
  return event
}

function longPress(clientX = 200, clientY = 100) {
  mapDiv.dispatchEvent(pointerEvent('pointerdown', { pointerType: 'touch', clientX, clientY }))
}

beforeEach(() => {
  vi.useFakeTimers()
  contextMenuHandler = undefined
  removeListener.mockClear()
  giveMapDivASize()
})

describe('CairnCreateGesture — right-click', () => {
  it('places a cairn at the clicked coordinate', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    contextMenuHandler?.(LAT_LNG)

    expect(onPlace).toHaveBeenCalledWith({ lat: 12.5, lng: -3.2 })
  })

  it('attaches nothing while inactive — the placement queue owns the map', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={false} onPlace={onPlace} />)

    expect(contextMenuHandler).toBeUndefined()
  })

  it('ignores a right-click that landed on an existing marker', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    const marker = document.createElement('button')
    document.body.appendChild(marker)
    const domEvent = new MouseEvent('contextmenu')
    Object.defineProperty(domEvent, 'target', { value: marker })

    contextMenuHandler?.({ ...LAT_LNG, domEvent })

    expect(onPlace).not.toHaveBeenCalled()
    marker.remove()
  })

  it('ignores a click with no coordinate', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    contextMenuHandler?.({ latLng: null })

    expect(onPlace).not.toHaveBeenCalled()
  })

  it('removes its listener on cleanup', () => {
    const { unmount } = render(<CairnCreateGesture active={true} onPlace={vi.fn()} />)

    unmount()

    expect(removeListener).toHaveBeenCalled()
  })
})

describe('CairnCreateGesture — long-press', () => {
  it('places a cairn at the pressed point after 480ms', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    longPress(100, 50)
    vi.advanceTimersByTime(480)

    // A quarter across and a quarter down a viewport of 20–40N, 100–140E.
    expect(onPlace).toHaveBeenCalledWith({ lat: 35, lng: 110 })
  })

  it('does not fire before the hold is long enough', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    longPress()
    vi.advanceTimersByTime(479)

    expect(onPlace).not.toHaveBeenCalled()
  })

  it('is cancelled by movement — a press that turns into a pan is a pan', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    longPress(200, 100)
    mapDiv.dispatchEvent(
      pointerEvent('pointermove', { pointerType: 'touch', clientX: 260, clientY: 100 }),
    )
    vi.advanceTimersByTime(480)

    expect(onPlace).not.toHaveBeenCalled()
  })

  it('survives the couple of pixels a thumb moves while holding still', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    longPress(200, 100)
    mapDiv.dispatchEvent(
      pointerEvent('pointermove', { pointerType: 'touch', clientX: 203, clientY: 102 }),
    )
    vi.advanceTimersByTime(480)

    expect(onPlace).toHaveBeenCalled()
  })

  it('is cancelled by lifting the finger', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    longPress()
    mapDiv.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch' }))
    vi.advanceTimersByTime(480)

    expect(onPlace).not.toHaveBeenCalled()
  })

  it('ignores a mouse press — right-click is the desktop gesture', () => {
    const onPlace = vi.fn()
    render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    mapDiv.dispatchEvent(
      pointerEvent('pointerdown', { pointerType: 'mouse', clientX: 200, clientY: 100 }),
    )
    vi.advanceTimersByTime(480)

    expect(onPlace).not.toHaveBeenCalled()
  })

  it('does not fire after unmount', () => {
    const onPlace = vi.fn()
    const { unmount } = render(<CairnCreateGesture active={true} onPlace={onPlace} />)

    longPress()
    unmount()
    vi.advanceTimersByTime(480)

    expect(onPlace).not.toHaveBeenCalled()
  })
})
