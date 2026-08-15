import type { LatLng } from './geo'

/* Turning a pixel inside the map's own element into a coordinate.
 *
 * The map's `click` and `contextmenu` events already carry a `latLng`, so
 * nothing here is needed for either of them. A long-press does not: it is a
 * timer over raw pointer events on the map's div, and by the time it fires
 * there is no Maps event to read a coordinate off. This is the conversion
 * that gap needs, kept as a pure function of numbers so it can be tested
 * without a map — `CairnCreateGesture` reads the three inputs off the live
 * one and calls in.
 *
 * The arithmetic is Maps' own documented recipe, restated: a viewport's
 * corners give the span, the element's size gives the scale, and the two
 * together turn a pixel offset into a fraction of that span. Working in
 * fractions rather than through `fromLatLngToPoint` keeps this independent
 * of the projection object, which only exists once the map has drawn. */

export interface ViewportBounds {
  north: number
  south: number
  west: number
  east: number
}

/** The pixel at (`offsetX`, `offsetY`) inside an element `width` × `height`
    showing `bounds`.
 *
 * Longitude is interpolated across the *visible* span rather than the raw
 * `east - west` difference, so a viewport straddling the antimeridian —
 * where `east` is numerically smaller than `west` — spans the short way
 * across it rather than the long way around the globe, and the result is
 * normalised back into [-180, 180].
 *
 * Latitude is interpolated linearly, which Mercator is not. The error is
 * the projection's own curvature across one viewport and is well under a
 * pixel at every zoom a person places a cairn at; a person pressing their
 * thumb on a phone screen is not delivering sub-pixel intent, and the
 * correction would cost the map projection this function exists to avoid
 * needing. Returns `null` for a zero-sized element rather than dividing by
 * it. */
export function latLngFromContainerPoint(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  bounds: ViewportBounds,
): LatLng | null {
  if (width <= 0 || height <= 0) return null

  const lngSpan = bounds.east >= bounds.west ? bounds.east - bounds.west : bounds.east - bounds.west + 360
  const lat = bounds.north - (offsetY / height) * (bounds.north - bounds.south)
  const lng = bounds.west + (offsetX / width) * lngSpan

  return { lat, lng: wrapLongitude(lng) }
}

/** Back into [-180, 180]. A viewport crossing the antimeridian produces a
    longitude past 180 above, and a coordinate Maps will not accept is worse
    than no gesture at all. */
function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}
