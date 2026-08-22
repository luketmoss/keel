import { useEffect, useRef, useState } from 'react'
import { GestureHandling, Map3D as GoogleMap3D, MapMode, useMap, type Map3DRef } from '@vis.gl/react-google-maps'
import { MAP3D_ID } from '../map/track3D'
import { zoomToRange, rangeToZoom } from '../map/camera3D'
import { prefersReducedMotion } from '../map/motion'
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
}

/** Mounted once, on the first `on`, and never unmounted again for the rest
    of the session — the design note's "Neither surface is destroyed and
    remounted per flip". Sits above the 2D `<Map>` in the DOM and fades its
    own opacity in and out; the 2D map underneath needs no styling of its
    own; an opaque 3D surface fading to full opacity over an opaque 2D one
    reads as the same dissolve a true crossfade would. */
export function Map3DSurface({ on, mode }: Map3DSurfaceProps) {
  const map2d = useMap()
  const map3dRef = useRef<Map3DRef>(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const wasOn = useRef(false)

  useEffect(() => {
    if (on && !mounted) setMounted(true)
  }, [on, mounted])

  useEffect(() => {
    if (!mounted || !map2d) return
    if (on === wasOn.current) return
    wasOn.current = on

    const map3d = map3dRef.current?.map3d
    if (!map3d) return

    const reduced = prefersReducedMotion()
    const viewportHeight = map2d.getDiv().clientHeight || window.innerHeight

    if (on) {
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
        setVisible(true)
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

    // Turning off: the 2D map lands where 3D got to, not where 3D started —
    // read live off the element rather than anything cached, since the
    // user may have navigated the whole time it was on.
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
  }, [on, mounted, map2d])

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
