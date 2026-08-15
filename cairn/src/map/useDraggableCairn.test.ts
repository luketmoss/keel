import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraggableCairn } from './useDraggableCairn'

/* #158 — the shared drag hook. `prefersReducedMotion` reads `false` by
   default in jsdom (no `matchMedia`), so every test that doesn't care about
   the revert tween stubs it `true` first — collapsing the revert straight to
   its final value, the same way `motion.test.ts` already does for
   `TrackLayer`'s draw-on. */
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

function mapMouseEvent(lat: number, lng: number): google.maps.MapMouseEvent {
  return { latLng: { lat: () => lat, lng: () => lng } } as unknown as google.maps.MapMouseEvent
}

beforeEach(() => {
  stubReducedMotion(true)
})

afterEach(() => {
  // @ts-expect-error -- undoing the per-test stub, not a real API
  delete window.matchMedia
  vi.restoreAllMocks()
})

describe('useDraggableCairn', () => {
  it('a drop with no movement never calls onMove, and leaves position alone', async () => {
    const onMove = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useDraggableCairn({ position: { lat: 1, lng: 2 }, draggable: true, onMove }),
    )

    act(() => {
      result.current.onDragStart()
      result.current.onDragEnd(mapMouseEvent(1, 2))
    })

    expect(onMove).not.toHaveBeenCalled()
    expect(result.current.position).toEqual({ lat: 1, lng: 2 })
    expect(result.current.consumeDragClick()).toBe(false)
  })

  it('a real move calls onMove once, with the dropped coordinate', async () => {
    const onMove = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useDraggableCairn({ position: { lat: 1, lng: 2 }, draggable: true, onMove }),
    )

    act(() => {
      result.current.onDragStart()
      result.current.onDragEnd(mapMouseEvent(9, 10))
    })

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith({ lat: 9, lng: 10 })
  })

  it('a real move suppresses the click that follows, once', async () => {
    const onMove = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useDraggableCairn({ position: { lat: 1, lng: 2 }, draggable: true, onMove }),
    )

    act(() => {
      result.current.onDragStart()
      result.current.onDragEnd(mapMouseEvent(9, 10))
    })

    expect(result.current.consumeDragClick()).toBe(true)
    // Consumed — a second click right after is a real click again.
    expect(result.current.consumeDragClick()).toBe(false)
  })

  it('holds the dropped position locally while the write is in flight, then defers back to the caller once it lands', async () => {
    let resolveMove: (ok: boolean) => void = () => {}
    const onMove = vi.fn(() => new Promise<boolean>((resolve) => (resolveMove = resolve)))
    const { result, rerender } = renderHook(
      ({ position }) => useDraggableCairn({ position, draggable: true, onMove }),
      { initialProps: { position: { lat: 1, lng: 2 } } },
    )

    act(() => {
      result.current.onDragStart()
      result.current.onDragEnd(mapMouseEvent(9, 10))
    })
    // Held locally — the store hasn't confirmed the write yet, so the
    // caller's own `position` prop is still `{1, 2}` at this point.
    expect(result.current.position).toEqual({ lat: 9, lng: 10 })

    await act(async () => {
      resolveMove(true)
    })
    // The override clears on success; the store's own record (simulated
    // here by rerendering with its new prop) is what the marker follows
    // from here on, seamlessly since it already matches.
    rerender({ position: { lat: 9, lng: 10 } })
    expect(result.current.position).toEqual({ lat: 9, lng: 10 })
  })

  it('reverts to the pre-drag position when the write fails', async () => {
    let resolveMove: (ok: boolean) => void = () => {}
    const onMove = vi.fn(() => new Promise<boolean>((resolve) => (resolveMove = resolve)))
    const { result, rerender } = renderHook(
      ({ position }) => useDraggableCairn({ position, draggable: true, onMove }),
      { initialProps: { position: { lat: 1, lng: 2 } } },
    )

    act(() => {
      result.current.onDragStart()
      result.current.onDragEnd(mapMouseEvent(9, 10))
    })
    expect(result.current.position).toEqual({ lat: 9, lng: 10 })

    await act(async () => {
      resolveMove(false)
    })

    // Reduced motion collapses the revert straight to its final value —
    // the pre-drag position, read from the hook's own captured start.
    expect(result.current.position).toEqual({ lat: 1, lng: 2 })
    rerender({ position: { lat: 1, lng: 2 } })
  })

  it('a zero-distance drop still lets a genuine subsequent click through', async () => {
    const onMove = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useDraggableCairn({ position: { lat: 1, lng: 2 }, draggable: true, onMove }),
    )

    // No drag at all this time — a plain click never touches the hook.
    expect(result.current.consumeDragClick()).toBe(false)
  })

  it('animates the revert over several frames when motion is not reduced', async () => {
    stubReducedMotion(false)
    let resolveMove: (ok: boolean) => void = () => {}
    const onMove = vi.fn(() => new Promise<boolean>((resolve) => (resolveMove = resolve)))
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const { result } = renderHook(() =>
      useDraggableCairn({ position: { lat: 0, lng: 0 }, draggable: true, onMove }),
    )

    act(() => {
      result.current.onDragStart()
      result.current.onDragEnd(mapMouseEvent(10, 10))
    })

    await act(async () => {
      resolveMove(false)
    })

    // Midway through the revert, the position is between the dropped point
    // and the pre-drag one — not snapped straight back.
    now = 90 // half of REVERT_DURATION_MS (180ms)
    act(() => {
      const frame = frames.shift()
      frame?.(now)
    })
    expect(result.current.position.lat).toBeGreaterThan(0)
    expect(result.current.position.lat).toBeLessThan(10)

    now = 180
    act(() => {
      const frame = frames.shift()
      frame?.(now)
    })
    await waitFor(() => expect(result.current.position).toEqual({ lat: 0, lng: 0 }))
  })
})
