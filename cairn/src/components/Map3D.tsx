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
import { sampleGroundAltitude } from '../map/groundAltitude'
import { createGoogleElevationSampler, type ElevationSampler } from '../geo/elevation'
import type { LatLng } from '../map/geo'
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

  /* Built once, lazily — `google.maps.ElevationService` only exists after
     the Maps script has resolved, which is later than this component's
     first render. */
  const samplerRef = useRef<ElevationSampler | null | undefined>(undefined)
  const elevationSampler = useCallback((): ElevationSampler | null => {
    if (samplerRef.current === undefined) samplerRef.current = createGoogleElevationSampler()
    return samplerRef.current
  }, [])

  /** Puts the camera at `range`/`tilt` around `center`, with the look-at
      resolved onto the terrain first.

      Two things here are load-bearing and both were measured against the
      live API rather than assumed:

      1. **The look-at has to be on the ground.** See
         `sampleGroundAltitude`'s own comment — a sea-level look-at returned
         `range: 0`, which renders as a flat view indistinguishable from the
         2D map. That was #282's "3D does nothing" and #274's "blue screen".

      2. **`flyCameraTo` does not land on the range it is given.** Asked for
         1315 m it settled at 457 (and at 0 with a sea-level look-at), while
         a direct assignment of the same camera holds it exactly. So the
         flight is the animation, and the camera is *asserted* when it ends
         rather than trusted to have arrived — which also subsumes the
         backgrounded-tab case the compositor buffer already existed for,
         since a flight that never advanced and a flight that landed short
         now get the same correction. */
  const arriveAt = useCallback(
    async (
      center: LatLng,
      range: number,
      tilt: number,
      durationMillis: number,
      path: LatLng[],
      onArrived?: (camera: { center: LatLng & { altitude: number }; range: number; tilt: number }) => void,
    ) => {
      const altitude = await sampleGroundAltitude(path, elevationSampler())
      const map3d = map3dRef.current?.map3d
      if (!map3d) return

      const target = {
        center: { ...center, altitude },
        range,
        tilt,
        heading: 0,
        roll: 0,
      }

      if (prefersReducedMotion()) {
        Object.assign(map3d, target)
        onArrived?.(target)
        return
      }

      // Flat and overhead on the *ground* look-at before the tilt begins —
      // at tilt 0 the camera sits a full `range` above it, so this is the
      // one attitude that cannot collide with terrain.
      map3d.center = target.center
      map3d.range = range
      map3d.tilt = 0
      map3d.heading = 0

      map3dRef.current?.flyCameraTo({ endCamera: target, durationMillis })

      const settle = window.setTimeout(() => {
        const live = map3dRef.current?.map3d
        if (!live) return
        Object.assign(live, target)
        onArrived?.(target)
      }, durationMillis + FLYOVER_COMPOSITOR_BUFFER_MS)
      flightTimers.current.push(settle)
    },
    [elevationSampler],
  )

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
      if (!map3dRef.current?.map3d) return

      flying.current = true

      /* The fly-in, then the orbit from wherever it actually landed. The
         ground altitude is sampled from the subject's own route rather
         than its centre alone — a flyover of a valley walk is framed from
         above the ridge beside it, not from inside it. */
      void arriveAt(
        framed.center,
        framed.range,
        FLYOVER_TILT_DEGREES,
        FLYOVER_FLY_IN_MS,
        request.points,
        (camera) => {
          if (handledFlyoverToken.current !== request.token) return
          const map3d = map3dRef.current?.map3d
          if (!map3d) return

          if (prefersReducedMotion()) {
            flying.current = false
            return
          }

          map3dRef.current?.flyCameraAround({
            camera: {
              center: camera.center,
              range: camera.range,
              tilt: camera.tilt,
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
        },
      )
    },
    [stopFlight, arriveAt],
  )

  useEffect(() => {
    if (!mounted || !map2d) return
    if (on === wasOn.current) return
    // Narrowed once, here — `run` below closes over it, and TypeScript
    // does not carry the guard above's narrowing across a function
    // boundary.
    const map2dInstance = map2d

    /* `<gmp-map-3d>` is a custom element — `mounted` flipping true only
       means React has rendered the tag, not that the browser has finished
       upgrading it, so `map3dRef.current?.map3d` can still be `undefined`
       for a frame or two after. Committing `wasOn.current` before that is
       ready would mark this transition "handled" with nothing actually
       done, and since none of this effect's own dependencies change again
       on their own, it would never retry — the switch would show on with
       the surface silently never framed. Retry via `requestAnimationFrame`
       until the element has actually upgraded. */
    let cancelled = false

    function run() {
      const map3d = map3dRef.current?.map3d
      if (!map3d) return

      const reduced = prefersReducedMotion()
      const viewportHeight = map2dInstance.getDiv().clientHeight || window.innerHeight

      if (on) {
        // #274 — a flyover is what turned 3D on: its own fly-in is the
        // arrival, and #271's tilt-in does not also run.
        const flyoverPending = flyover !== null && flyover.token !== handledFlyoverToken.current

        const center2d = map2dInstance.getCenter()
        const zoom = map2dInstance.getZoom()
        if (!center2d || zoom === undefined) return
        const range = zoomToRange(zoom, center2d.lat(), viewportHeight)
        const center: LatLng = { lat: center2d.lat(), lng: center2d.lng() }

        // Framed on the same place, flat and invisible, before anything
        // fades in — "the same centre, a comparable extent, north-up".
        // Sea level is safe *here* and only here: at tilt 0 the camera sits
        // a full `range` above the look-at, so it clears the ground even
        // where the look-at is buried in it. The tilt-in below is what
        // needs the real altitude, and resolves it first.
        map3d.center = { ...center, altitude: 0 }
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
            void arriveAt(center, range, TILT_ON, 0, [center])
            return
          }
          void arriveAt(center, range, TILT_ON, TILT_ANIMATION_MS, [center])
        })
        return
      }

      // Turning off cancels any flight first, so what's read below is
      // wherever the flight (or the user) actually left the camera.
      stopFlight()

      // The 2D map lands where 3D got to, not where 3D started — read live
      // off the element rather than anything cached, since the user may
      // have navigated the whole time it was on.
      const center3d = map3d.center
      const range = map3d.range ?? zoomToRange(map2dInstance.getZoom() ?? 2, center3d?.lat ?? 0, viewportHeight)
      if (center3d) {
        const zoom = rangeToZoom(range, center3d.lat, viewportHeight)
        map2dInstance.setCenter({ lat: center3d.lat, lng: center3d.lng })
        map2dInstance.setZoom(zoom)
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
    }

    function whenReady() {
      if (cancelled) return
      if (!map3dRef.current?.map3d) {
        requestAnimationFrame(whenReady)
        return
      }
      if (cancelled || on === wasOn.current) return
      wasOn.current = on
      run()
    }
    whenReady()

    return () => {
      cancelled = true
    }
  }, [on, mounted, map2d, flyover, runFlyover, stopFlight, arriveAt])

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
    /* `stopCameraAnimation` is only for an actual flight — calling it on
       every input would kill Google's *own* camera animations, which is
       what keyboard panning is, and pans would die a fraction of the way
       through. The pending end-of-flight assert is cleared either way
       though: once the user has taken the camera, snapping it back to a
       frame they have already moved away from is the same broken gesture,
       and it applies to #271's tilt-in as much as to a flyover. */
    function cancel() {
      if (flying.current) stopFlight()
      else clearFlightTimers()
    }
    surface.addEventListener('pointerdown', cancel)
    surface.addEventListener('wheel', cancel)
    surface.addEventListener('keydown', cancel)
    return () => {
      surface.removeEventListener('pointerdown', cancel)
      surface.removeEventListener('wheel', cancel)
      surface.removeEventListener('keydown', cancel)
    }
  }, [mounted, stopFlight, clearFlightTimers])

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
