import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap3D, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MAP3D_ID } from '../map/track3D'
import type { PositionFix } from '../map/useGeolocation'
import { accuracyLabel } from './PositionMarker'
import './PositionMarker.css'

/** The blue dot on the 3D surface — the 3D mirror of `PositionMarker`'s own
    dot, and nothing else: no accuracy circle and no callout.
 *
 * `CLAMP_TO_GROUND`, the same altitude mode every cairn already draws with,
 * so a fix on a valley floor is not left floating when the camera tilts.
 * `google.maps.maps3d.MarkerElement` hosts arbitrary HTML, so the dot is
 * portaled into it and is the same markup the 2D marker draws — one
 * stylesheet, one appearance, the shape `Cairn3DLayer` already established.
 *
 * **The circle and the callout stay in 2D.** `Map3DElement` has no documented
 * way to project a coordinate to a pixel, which is what anchoring a callout
 * to a marker needs, and a ground-projected accuracy circle is machinery this
 * issue does not need — the design note's "Decisions not taken" records the
 * circle. The dot alone is what "you are here" needs in 3D, and the accuracy
 * is still in the marker's own accessible name. */
export function Position3DMarker({ fix, mapId = MAP3D_ID }: { fix: PositionFix; mapId?: string }) {
  const map3d = useMap3D(mapId)
  const maps3d = useMapsLibrary('maps3d')
  const markerRef = useRef<google.maps.maps3d.MarkerElement | null>(null)
  /* The marker element is created imperatively, so the portal below has no
     target on the render that creates it. This is what brings React back for
     a second one — `Cairn3DLayer`'s own `setRenderTick`, for one marker. */
  const [, setRenderTick] = useState(0)

  useEffect(() => {
    if (!map3d || !maps3d) return
    const { MarkerElement, AltitudeMode } = maps3d

    const marker = new MarkerElement({
      position: { ...fix.position, altitude: 0 },
      altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
    })
    marker.title = 'Your location'
    map3d.append(marker)
    markerRef.current = marker
    setRenderTick((tick) => tick + 1)

    /* Rebuilt rather than moved when the fix changes: there is one of these,
       it is cheap, and a fresh element cannot carry stale clamped altitude
       from the coordinate it used to be at. */
    return () => {
      marker.remove()
      markerRef.current = null
    }
  }, [map3d, maps3d, fix])

  if (!markerRef.current) return null

  return createPortal(
    <span
      className="position-marker position-marker--3d"
      role="img"
      aria-label={`Your location, ${accuracyLabel(fix).toLowerCase()}`}
    >
      <span className="position-marker__dot" aria-hidden="true" />
    </span>,
    markerRef.current as unknown as Element,
  )
}
