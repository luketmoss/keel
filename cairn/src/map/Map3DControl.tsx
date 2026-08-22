import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { use3DSupport, type Maps3DSupport } from './use3DSupport'
import type { LatLng } from './geo'

/** One press of `Fly over`, or a restart of one already running — see
    274-a-flyover-of-a-trip.md's "Starting a flyover while one is running
    replaces it". `token` increments on every request so a second press with
    the *same* points still restarts the flight, rather than being mistaken
    for a no-op prop change. */
export interface FlyoverRequest {
  token: number
  points: LatLng[]
}

export interface Map3DControlValue {
  support: Maps3DSupport
  on: boolean
  setOn: (on: boolean) => void
  /** The flight currently requested, or `null`. `MapCanvas`/`Map3DSurface`
      read this to know whether an `on` transition is a flyover (and should
      skip #271's own tilt-in) or an ordinary flip of the switch. */
  flyover: FlyoverRequest | null
  /** Turns 3D on if it is off, and requests a flyover of `points` — a no-op
      for fewer than one point, which is what makes "a subject with no
      usable geometry" safe to call this with. */
  requestFlyover: (points: LatLng[]) => void
}

const FALLBACK_VALUE: Map3DControlValue = {
  support: 'unavailable',
  on: false,
  setOn: () => {},
  flyover: null,
  requestFlyover: () => {},
}

const Map3DControlContext = createContext<Map3DControlValue | null>(null)

/** Never throws. A caller reached before the provider mounts — no API key
    at all, see `MapCanvas.tsx`'s `MapProvider` — gets the same "3D doesn't
    exist here" answer `use3DSupport` would give it directly, rather than a
    crash for a button that renders on every trip and track face. */
export function useMap3DControl(): Map3DControlValue {
  return useContext(Map3DControlContext) ?? FALLBACK_VALUE
}

/** Owns whether 3D is on, and — when a flyover is what turned it on or
    restarted it — what to fly to. One piece of state shared between
    `MapCanvas` (which owns the switch and the actual `Map3DElement`) and
    every face's own `FlyoverButton`, both of which sit under this provider
    in `MapProvider`. Neither would otherwise be able to reach the other:
    `MapCanvas` and the column are siblings, not ancestor and descendant. */
export function Map3DControlProvider({ children }: { children: ReactNode }) {
  const { support } = use3DSupport()
  const [on, setOnState] = useState(false)
  const [flyover, setFlyover] = useState<FlyoverRequest | null>(null)
  const nextToken = useRef(0)

  /* #271's own guard, moved here from `MapCanvas`: support can only regress
     from `available` after the surface already mounted, and when it does,
     turning the switch off is exactly what a normal flip already does —
     including cancelling whatever flight was running, since its surface is
     going away. */
  useEffect(() => {
    if (support === 'unavailable' && on) {
      setOnState(false)
      setFlyover(null)
    }
  }, [support, on])

  const setOn = useCallback((next: boolean) => {
    setOnState(next)
    // Turning 3D off cancels a running flight and clears the request, so
    // turning it back on later (the plain switch, not `Fly over`) never
    // replays a stale one.
    if (!next) setFlyover(null)
  }, [])

  const requestFlyover = useCallback((points: LatLng[]) => {
    if (points.length === 0) return
    nextToken.current += 1
    setFlyover({ token: nextToken.current, points })
    setOnState(true)
  }, [])

  const value = useMemo<Map3DControlValue>(
    () => ({ support, on, setOn, flyover, requestFlyover }),
    [support, on, setOn, flyover, requestFlyover],
  )

  return <Map3DControlContext.Provider value={value}>{children}</Map3DControlContext.Provider>
}
