import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GEOLOCATION_TIMEOUT_MS, useGeolocation } from './useGeolocation'

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const TIMEOUT = 3

function installGeolocation(impl: Partial<Geolocation> = {}) {
  const getCurrentPosition = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition, watchPosition: vi.fn(), clearWatch: vi.fn(), ...impl },
  })
  return getCurrentPosition
}

function removeGeolocation() {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
}

function fakePosition(lat: number, lng: number, accuracy: number, timestamp = 1_000) {
  return { coords: { latitude: lat, longitude: lng, accuracy }, timestamp }
}

function fakeError(code: number) {
  return { code, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT }
}

afterEach(() => {
  removeGeolocation()
  vi.restoreAllMocks()
})

describe('useGeolocation', () => {
  it('reports unsupported where there is no geolocation API, and request is a no-op', () => {
    removeGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    expect(result.current.supported).toBe(false)
    act(() => result.current.request())
    expect(result.current.status).toBe('idle')
    expect(result.current.fix).toBeNull()
  })

  it('goes pending on request and lands a fix with its accuracy and timestamp', () => {
    const getCurrentPosition = installGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    act(() => result.current.request())
    expect(result.current.status).toBe('pending')

    act(() => getCurrentPosition.mock.calls[0][0](fakePosition(39.5, -105.5, 12, 4_242)))

    expect(result.current.status).toBe('idle')
    expect(result.current.fix).toEqual({
      position: { lat: 39.5, lng: -105.5 },
      accuracyMeters: 12,
      at: 4_242,
    })
  })

  it('asks for a fresh, high-accuracy fix rather than a cached one', () => {
    const getCurrentPosition = installGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    act(() => result.current.request())

    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: 0,
    })
  })

  it('drops a second request made while one is in flight', () => {
    const getCurrentPosition = installGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    act(() => result.current.request())
    act(() => result.current.request())

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('separates a denial from an unavailable fix', () => {
    const getCurrentPosition = installGeolocation()
    const onFailure = vi.fn()
    const { result } = renderHook(() => useGeolocation(onFailure))

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[0][1](fakeError(PERMISSION_DENIED)))
    expect(onFailure).toHaveBeenLastCalledWith('denied')

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[1][1](fakeError(POSITION_UNAVAILABLE)))
    expect(onFailure).toHaveBeenLastCalledWith('unavailable')

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[2][1](fakeError(TIMEOUT)))
    expect(onFailure).toHaveBeenLastCalledWith('unavailable')
  })

  it('returns to idle after a failure so the next press can retry', () => {
    const getCurrentPosition = installGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[0][1](fakeError(PERMISSION_DENIED)))

    expect(result.current.status).toBe('idle')
    act(() => result.current.request())
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('keeps an existing fix when a later request is denied', () => {
    const getCurrentPosition = installGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[0][0](fakePosition(1, 2, 5)))
    const first = result.current.fix

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[1][1](fakeError(PERMISSION_DENIED)))

    expect(result.current.fix).toBe(first)
  })

  it('replaces the fix when a second request succeeds', () => {
    const getCurrentPosition = installGeolocation()
    const { result } = renderHook(() => useGeolocation(vi.fn()))

    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[0][0](fakePosition(1, 2, 5)))
    act(() => result.current.request())
    act(() => getCurrentPosition.mock.calls[1][0](fakePosition(3, 4, 9)))

    expect(result.current.fix?.position).toEqual({ lat: 3, lng: 4 })
    expect(result.current.fix?.accuracyMeters).toBe(9)
  })
})
