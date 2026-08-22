import { useCallback, useEffect, useRef, useState } from 'react'
import { GestureHandling, Map3D as GoogleMap3D, MapMode, useMap, type Map3DRef } from '@vis.gl/react-google-maps'
import { MAP3D_ID } from '../map/track3D'
import { zoomToRange, rangeToZoom } from '../map/camera3D'
import { prefersReducedMotion } from '../map/motion'
import {
  FLYOVER_COMPOSITOR_BUFFER_MS,
  FLYOVER_FLY_IN_MS,
  FLYOVER_ORBIT_MS,
  FLYOVER_ORBIT_ROUNDS,
  FLYOVER_TILT_DEGREES,
  frameGeometry,
} from '../map/flyover'
import type { FlyoverRequest } from '../map/Map3DControl'
import './Map3D.css'

/* #271's camera choreography: "The camera tilts from 0° to 55° over
   --motion-slow, north-up" and the cross-fade over --motion-base. The
   cross-fade itself is CSS (see Map3D.css) and collapses for free under
   `prefers-reduced-motion` via the design language's global block; the
   tilt is driven by `flyCameraTo`, which is not CSS, so it is gated by
   hand below. */
const TILT_ON = 55
const TILT_ANIMATION_MS = 280

interface Map3DSurfaceProps {
  /** The switch's own state — the source of truth. The surface never
      decides this for itself. */
  on: boolean
  /** Satellite with labels on is `HYBRID`; off is `SATELLITE`. There is no
      3D form of Map or Terrain, so this is the only choice the surface
      ever renders. */
  mode: MapMode
  /** #274 — non-null while a flyover has been requested (or restarted).
      When this is what turned `on` true, #271's own tilt-in is skipped in
      favour of the flyover's fly-in — "running both means tilting to 55°
      and then immediately to 65°". `undefined`/`null` behaves exactly as
      #271 always has. */
  flyover?: FlyoverRequest | null
}

/** Mounted once, on the first `on`, and never unmounted again for the rest
    of the session — the design note's "Neither surface is destroyed and
    remounted per flip". Sits above the 2D `<Map>` in the DOM and fades its
    own opacity in and out; the 2D map underneath needs no styling of its
    own; an opaque 3D surface fading to full opacity over an opaque 2D one
    reads as the same dissolve a true crossfade would. */
export function Map3DSurface({ on, mode, flyover = null }: Map3DSurfaceProps) {
  const map2d = useMap()
  const map3dRef = useRef<Map3DRef>(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const wasOn = useRef(false)
  /** The last flyover token actually acted on — what makes a repeat firing
      of an effect (a prop that changed for an unrelated reason) a no-op,
      and what a fresh `requestFlyover` press has to beat to run again. */
  const handledFlyoverToken = useRef<number | null>(null)
  const flightTimers = useRef<number[]>([])
  const flying = useRef(false)

  useEffect(() => {
    if (on && !mounted) setMounted(true)
  }, [on, mounted])

  const clearFlightTimers = useCallback(() => {
    for (const id of flightTimers.current) window.clearTimeout(id)
    flightTimers.current = []
  }, [])

  /** #274's "Cancelling": stops whatever flight is running, leaving the
      camera exactly where it was — `stopCameraAnimation` halts the native
      animation mid-flight rather than teleporting to its end. */
  const stopFlight = useCallback(() => {
    clearFlightTimers()
    if (flying.current) map3dRef.current?.stopCameraAnimation()
    flying.current = false
  }, [clearFlightTimers])

  /** The flight itself: frame, fly in tilting down, then orbit once — see
      the design note's "The flight". Cancels whatever was already running
      first, which is what makes a repeat press "restart, don't stack". */
  const runFlyover = useCallback(
    (request: FlyoverRequest) => {
      handledFlyoverToken.current = request.token
      stopFlight()

      const framed = frameGeometry(request.points)
      if (!framed) return
      const map3d = map3dRef.current?.map3d
      if (!map3d) return

      const target = {
        center: { ...framed.center, altitude: 0 },
        range: framed.range,
        tilt: FLYOVER_TILT_DEGREES,
        heading: 0,
        roll: 0,
      }

      // Reduced motion: assigned outright, exactly #271's own stance —
      // "the switch still works; it simply arrives."
      if (prefersReducedMotion()) {
        Object.assign(map3d, target)
        return
      }

      flying.current = true
      // Flat and overhead at the frame first — the tilt-down on arrival is
      // the whole point of the fly-in, not a move that follows it.
      map3d.center = target.center
      map3d.range = target.range
      map3d.tilt = 0
      map3d.heading = 0

      requestAnimationFrame(() => {
        if (handledFlyoverToken.current !== request.token) return
        map3dRef.current?.flyCameraTo({ endCamera: target, durationMillis: FLYOVER_FLY_IN_MS })

        const flyInTimer = window.setTimeout(() => {
          if (handledFlyoverToken.current !== request.token) return
          // The compositor gotcha: a backgrounded tab never advances
          // `flyCameraTo`, so the camera is landed unconditionally rather
          // than trusting the animation got there on its own.
          if (Math.abs((map3d.tilt ?? 0) - target.tilt) > 1) Object.assign(map3d, target)

          map3dRef.current?.flyCameraAround({
            camera: {
              center: target.center,
              range: target.range,
              tilt: target.tilt,
              heading: map3d.heading ?? 0,
              roll: 0,
            },
            durationMillis: FLYOVER_ORBIT_MS,
            rounds: FLYOVER_ORBIT_ROUNDS,
          })

          const orbitTimer = window.setTimeout(() => {
            if (handledFlyoverToken.current === request.token) flying.current = false
          }, FLYOVER_ORBIT_MS + FLYOVER_COMPOSITOR_BUFFER_MS)
          flightTimers.current.push(orbitTimer)
        }, FLYOVER_FLY_IN_MS + FLYOVER_COMPOSITOR_BUFFER_MS)
        flightTimers.current.push(flyInTimer)
      })
    },
    [stopFlight],
  )

  useEffect(() => {
    if (!mounted || !map2d) return
    if (on === wasOn.current) return
    wasOn.current = on

    const map3d = map3dRef.current?.map3d
    if (!map3d) return

    const reduced = prefersReducedMotion()
    const viewportHeight = map2d.getDiv().clientHeight || window.innerHeight

    if (on) {
      // #274 — a flyover is what turned 3D on: its own fly-in is the
      // arrival, and #271's tilt-in does not also run.
      const flyoverPending = flyover !== null && flyover.token !== handledFlyoverToken.current

      const center = map2d.getCenter()
      const zoom = map2d.getZoom()
      if (!center || zoom === undefined) return
      const range = zoomToRange(zoom, center.lat(), viewportHeight)

      // Framed on the same place, flat and invisible, before anything
      // fades in — "the same centre, a comparable extent, north-up".
      map3d.center = { lat: center.lat(), lng: center.lng(), altitude: 0 }
      map3d.range = range
      map3d.tilt = 0
      map3d.heading = 0

      requestAnimationFrame(() => {
        // A flip back to off before this frame landed makes this stale —
        // "the switch is the source of truth and the last flip wins", and
        // without this guard a fast on-then-off would resurrect the
        // surface the user just turned off.
        if (wasOn.current !== true) return
        setVisible(true)
        if (flyoverPending) {
          runFlyover(flyover)
          return
        }
        if (reduced) {
          map3d.tilt = TILT_ON
          return
        }
        map3dRef.current?.flyCameraTo({
          endCamera: {
            center: { lat: center.lat(), lng: center.lng(), altitude: 0 },
            range,
            tilt: TILT_ON,
            heading: 0,
            roll: 0,
          },
          durationMillis: TILT_ANIMATION_MS,
        })
      })
      return
    }

    // Turning off cancels any flight first, so what's read below is
    // wherever the flight (or the user) actually left the camera.
    stopFlight()

    // The 2D map lands where 3D got to, not where 3D started — read live
    // off the element rather than anything cached, since the user may have
    // navigated the whole time it was on.
    const center3d = map3d.center
    const range = map3d.range ?? zoomToRange(map2d.getZoom() ?? 2, center3d?.lat ?? 0, viewportHeight)
    if (center3d) {
      const zoom = rangeToZoom(range, center3d.lat, viewportHeight)
      map2d.setCenter({ lat: center3d.lat, lng: center3d.lng })
      map2d.setZoom(zoom)
    }

    setVisible(false)
    if (reduced) {
      map3d.tilt = 0
      map3d.heading = 0
      return
    }
    map3dRef.current?.flyCameraTo({
      endCamera: {
        center: center3d ?? undefined,
        range,
        tilt: 0,
        heading: 0,
        roll: 0,
      },
      durationMillis: TILT_ANIMATION_MS,
    })
  }, [on, mounted, map2d, flyover, runFlyover, stopFlight])

  // #274 — a flyover requested (or restarted, including while one is
  // already running) while the surface is already visible: `Fly over`
  // pressed a second time, or pressed with 3D already on.
  useEffect(() => {
    if (!mounted || !visible || flyover === null) return
    if (flyover.token === handledFlyoverToken.current) return
    runFlyover(flyover)
  }, [flyover, mounted, visible, runFlyover])

  // #274's "Cancelling": any deliberate input on the 3D surface itself —
  // not camera-change events, which `flyCameraTo` fires on its own and
  // would cancel the flight the instant it began.
  useEffect(() => {
    const surface = map3dRef.current?.map3d as unknown as HTMLElement | undefined
    if (!mounted || !surface) return
    function cancel() {
      if (flying.current) stopFlight()
    }
    surface.addEventListener('pointerdown', cancel)
    surface.addEventListener('wheel', cancel)
    surface.addEventListener('keydown', cancel)
    return () => {
      surface.removeEventListener('pointerdown', cancel)
      surface.removeEventListener('wheel', cancel)
      surface.removeEventListener('keydown', cancel)
    }
  }, [mounted, stopFlight])

  useEffect(() => clearFlightTimers, [clearFlightTimers])

  if (!mounted) return null

  return (
    <div className={`map3d-surface${visible ? ' map3d-surface--visible' : ''}`}>
      <GoogleMap3D
        id={MAP3D_ID}
        ref={map3dRef}
        mode={mode}
        gestureHandling={GestureHandling.GREEDY}
        defaultTilt={0}
        defaultHeading={0}
      />
    </div>
  )
}
