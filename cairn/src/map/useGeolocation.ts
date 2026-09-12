import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from './geo'

/** cairn/docs/design/335-my-location-on-the-map.md — one fix per press.
    There is no `watchPosition` anywhere in this feature: a moving dot fights
    the thing the fix exists for, which is marking a fixed point. */
export const GEOLOCATION_TIMEOUT_MS = 10_000

/** A fix older than this is still shown, but the callout says how old it is.
    Two minutes: long enough that a fix taken while the panel was open is not
    nagged about, short enough that "you are here" stops being asserted for a
    coordinate the user has since walked away from. */
export const STALE_FIX_MS = 2 * 60 * 1000

export interface PositionFix {
  position: LatLng
  /** The browser's own reported accuracy, in metres — the radius of the
      circle the true position is probably inside. Drawn, and read out, as
      the number that decides whether the coordinate is worth saving. */
  accuracyMeters: number
  /** When the fix was taken, epoch milliseconds. */
  at: number
}

/** Why a request produced no fix. Two values and not one, because they need
    different things from the user: a denial is fixed in browser settings and
    retrying immediately will fail again; an unavailable fix is fixed by
    moving and retrying. */
export type GeolocationFailure = 'denied' | 'unavailable'

export type GeolocationStatus = 'idle' | 'pending'

export interface GeolocationState {
  /** False where there is no `navigator.geolocation` at all — no API, or a
      non-secure context. The control does not render at all then, rather
      than rendering disabled: a permanently dead button is worse than an
      absent one. */
  supported: boolean
  status: GeolocationStatus
  /** The most recent successful fix, or `null`. Survives a later failure —
      a denial does not erase a position the user already has. */
  fix: PositionFix | null
  request: () => void
}

/** The locate request, and the fix it produced.
 *
 * `onFailure` is held through a ref rather than being a dependency, the same
 * shape `CairnCreateGesture` uses for its own callback: the caller raises a
 * toast from it and would otherwise hand up a fresh closure every render,
 * re-creating `request` and invalidating everything memoized against it.
 *
 * A second press while a request is in flight is dropped rather than queued —
 * the control is disabled for the duration, so this is the belt to that
 * braces, and two overlapping fixes have no reading anyway. */
export function useGeolocation(onFailure: (failure: GeolocationFailure) => void): GeolocationState {
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const [fix, setFix] = useState<PositionFix | null>(null)
  const pending = useRef(false)
  /* A fix that lands after unmount must not set state. */
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const onFailureRef = useRef(onFailure)
  useEffect(() => {
    onFailureRef.current = onFailure
  }, [onFailure])

  const supported = typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

  const request = useCallback(() => {
    if (!supported || pending.current) return
    pending.current = true
    setStatus('pending')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        pending.current = false
        if (!alive.current) return
        setStatus('idle')
        setFix({
          position: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracyMeters: position.coords.accuracy,
          at: position.timestamp,
        })
      },
      (error) => {
        pending.current = false
        if (!alive.current) return
        setStatus('idle')
        /* The existing fix is deliberately left alone: a denial on the
           second press does not erase the position the first press found. */
        onFailureRef.current(
          error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        )
      },
      {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        /* A fresh fix every time. A cached one is exactly the thing that
           puts a cairn at the last place the app was opened. */
        maximumAge: 0,
      },
    )
  }, [supported])

  return { supported, status, fix, request }
}
