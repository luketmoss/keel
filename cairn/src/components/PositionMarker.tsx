import { useEffect, useState } from 'react'
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { formatDistance } from '../format/units'
import { formatTimeAgo } from '../format/dates'
import { STALE_FIX_MS, type PositionFix } from '../map/useGeolocation'
import './PositionMarker.css'

/** `--position`'s own value, for the frame before the stylesheet has been
    parsed and for jsdom, which reports custom properties as empty. The one
    place in the app a hex literal is allowed to appear twice, and it is a
    fallback rather than a second source of truth. */
const POSITION_FALLBACK = '#4c9bff'

/** The design language's `*-soft` mix is 16%; the Maps API wants that as a
    separate opacity — see the circle effect below. */
const ACCURACY_FILL_OPACITY = 0.16

/** Half the dot's `--marker-size`. Below this the circle is entirely behind
    the dot and says nothing. */
const MIN_ACCURACY_RADIUS_PX = 14

/* Web Mercator, at zoom 0, one tile of 256px spanning the world. The same
   approximation `camera3D.ts` works in — accurate enough to decide whether a
   circle is bigger than a 28px dot, which is all it is asked. */
const EQUATOR_METERS_PER_PIXEL = 156_543.03392

/** The accuracy circle's on-screen radius, in CSS pixels, at a given zoom. */
export function accuracyRadiusPixels(fix: PositionFix, zoom: number): number {
  const metersPerPixel =
    (EQUATOR_METERS_PER_PIXEL * Math.cos((fix.position.lat * Math.PI) / 180)) / 2 ** zoom
  if (!(metersPerPixel > 0)) return Infinity
  return fix.accuracyMeters / metersPerPixel
}

interface PositionMarkerProps {
  fix: PositionFix
  /** Absent while an import draft or the placement queue owns the map —
      #156's edge case, unchanged: the queue already owns the map's click and
      two placement intents at once has no sensible reading. Absent rather
      than disabled; a control that cannot be used has nothing to say. */
  canCreate: boolean
  onCreate: () => void
}

/** How the fix's accuracy reads. Through `formatDistance` rather than a
    metre literal, so it obeys the app's one unit switch like every other
    distance — the design note was written in metres and the app is
    imperial. Always "about": a reported accuracy is a radius of
    probability, and `±39 ft` reads like a tolerance. */
export function accuracyLabel(fix: PositionFix): string {
  return `Accurate to about ${formatDistance(fix.accuracyMeters)}`
}

/** The blue dot, its accuracy circle, and the callout that turns a fix into
    a cairn — cairn/docs/design/335-my-location-on-the-map.md.
 *
 * The create action lives here rather than in the map's control stack: a
 * button that appears in the stack only once a fix exists shifts every
 * control below it the moment it arrives, and it would sit a screen-width
 * away from the coordinate it acts on. On the marker, the action is attached
 * to the thing it is about. */
export function PositionMarker({ fix, canCreate, onCreate }: PositionMarkerProps) {
  const map = useMap()
  const [open, setOpen] = useState(false)

  /* A fresh fix is a different place — a callout still open over the old one
     would be describing a coordinate that has moved out from under it. */
  useEffect(() => {
    setOpen(false)
  }, [fix])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  /* Tapping the map closes the callout, the same way it deselects. Bound to
     the map instance rather than the document, so a click on the panel
     beside the map leaves it alone. */
  useEffect(() => {
    if (!map || !open) return
    const listener = google.maps.event.addListener(map, 'click', () => setOpen(false))
    return () => listener.remove()
  }, [map, open])

  /* The accuracy circle is a geographic circle, not a pixel radius: drawn in
     metres it grows and shrinks correctly as the user zooms, which is the
     entire point of showing it. `google.maps.Circle` is the only thing here
     that can do that — an `AdvancedMarker`'s content is in CSS pixels and
     would stay one size at every zoom, which would make it decoration.

     The fill is `--position` at `ACCURACY_FILL_OPACITY`, not a
     `--position-soft` token: the Maps API takes a colour and an opacity as
     two separate options and cannot parse `color-mix()`, so the mixed form
     the design language uses for `--accent-soft` has nowhere to go here.
     Same resulting colour, expressed the way this API accepts it.

     Hidden while its on-screen radius would be smaller than the dot — a halo
     behind the thing it qualifies is noise — which is a function of zoom, so
     it is re-evaluated on every camera change. */
  useEffect(() => {
    if (!map || !(fix.accuracyMeters > 0)) return
    const stroke = getComputedStyle(document.documentElement).getPropertyValue('--position').trim()

    const circle = new google.maps.Circle({
      center: fix.position,
      radius: fix.accuracyMeters,
      strokeColor: stroke || POSITION_FALLBACK,
      strokeOpacity: 0.9,
      strokeWeight: 1,
      fillColor: stroke || POSITION_FALLBACK,
      fillOpacity: ACCURACY_FILL_OPACITY,
      clickable: false,
      zIndex: 1,
    })

    function syncVisibility() {
      if (!map) return
      const zoom = map.getZoom()
      if (zoom === undefined) return
      circle.setMap(accuracyRadiusPixels(fix, zoom) >= MIN_ACCURACY_RADIUS_PX ? map : null)
    }
    syncVisibility()
    const listener = google.maps.event.addListener(map, 'zoom_changed', syncVisibility)

    return () => {
      listener.remove()
      circle.setMap(null)
    }
  }, [map, fix])

  const stale = Date.now() - fix.at > STALE_FIX_MS
  const accuracy = accuracyLabel(fix)

  return (
    <AdvancedMarker position={fix.position} zIndex={3} onClick={() => setOpen((was) => !was)}>
      <button
        type="button"
        className="position-marker"
        aria-label={`Your location, ${accuracy.toLowerCase()}`}
        aria-expanded={open}
      >
        <span className="position-marker__dot" aria-hidden="true" />
      </button>
      {open && (
        <div className="position-callout" role="dialog" aria-label="Your location">
          <p className="position-callout__title">You are here</p>
          <p className="position-callout__meta">{accuracy}</p>
          {stale && <p className="position-callout__meta">Located {formatTimeAgo(fix.at)}</p>}
          {canCreate && (
            <button type="button" className="position-callout__action" onClick={onCreate}>
              Drop a cairn here
            </button>
          )}
        </div>
      )}
    </AdvancedMarker>
  )
}
