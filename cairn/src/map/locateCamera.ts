import type { LatLng } from './geo'
import type { PositionFix } from './useGeolocation'

/** cairn/docs/design/335-my-location-on-the-map.md — "Capped at zoom 17". A
    fix accurate to two metres would otherwise fit to maximum zoom and land
    on an unreadable tile with no context around it. Higher than
    `fitTracksToBounds`'s own 16, which is framing a walk rather than a
    point. */
export const LOCATE_MAX_ZOOM = 17

/* The same constant `flyover.ts` uses for its own framing, and for the same
   reason: plenty accurate for a bounding box that only has to keep the
   subject on screen, never a distance the user reads. */
const METERS_PER_DEGREE_LAT = 111_320

/** The four corners of a box circumscribing the accuracy circle — what
    `fitTracksToBounds` and `frameGeometry` both already take, rather than a
    circle type either of them would have to learn.
 *
 * Fitting this rather than flying to a fixed zoom is what makes the arrival
 * honest: a five-metre fix lands close in, a three-kilometre fix lands
 * zoomed out over the area it actually describes, and the user is never
 * shown a confident building-level view of a coordinate that does not
 * support one.
 *
 * A zero or negative accuracy — which the spec permits no browser to report,
 * but which costs one comparison to survive — degenerates to the fix itself,
 * and `fitTracksToBounds` already handles a single-point box. */
export function accuracyCorners(fix: PositionFix): LatLng[] {
  const { position, accuracyMeters } = fix
  if (!(accuracyMeters > 0)) return [position]

  const latDelta = accuracyMeters / METERS_PER_DEGREE_LAT
  /* Longitude degrees shrink towards the poles. At a latitude where the
     cosine rounds to zero the box would be infinitely wide, so the latitude
     span carries it alone. */
  const cos = Math.cos((position.lat * Math.PI) / 180)
  const lngDelta = cos > 1e-6 ? accuracyMeters / (METERS_PER_DEGREE_LAT * cos) : 0

  return [
    { lat: position.lat + latDelta, lng: position.lng - lngDelta },
    { lat: position.lat + latDelta, lng: position.lng + lngDelta },
    { lat: position.lat - latDelta, lng: position.lng + lngDelta },
    { lat: position.lat - latDelta, lng: position.lng - lngDelta },
  ]
}
