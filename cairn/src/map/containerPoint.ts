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

/** The exact inverse of `latLngFromContainerPoint` — where `point` falls
    inside an element `width` × `height` showing `bounds`, in pixels from its
    top-left corner. #270's reveal rule uses this to find a selected item's
    own position on screen, against the same linear, sub-pixel-at-any-
    reasonable-zoom approximation the note above already accepts for the
    other direction — one projection, read both ways, rather than two that
    could disagree. `null` for a zero-sized element, same as the pixel-to-
    coordinate direction. */
export function containerPointFromLatLng(
  point: LatLng,
  width: number,
  height: number,
  bounds: ViewportBounds,
): { x: number; y: number } | null {
  if (width <= 0 || height <= 0) return null

  const lngSpan = bounds.east >= bounds.west ? bounds.east - bounds.west : bounds.east - bounds.west + 360
  let lng = point.lng
  if (lng < bounds.west) lng += 360

  return {
    x: ((lng - bounds.west) / lngSpan) * width,
    y: ((bounds.north - point.lat) / (bounds.north - bounds.south)) * height,
  }
}

/** `bounds`, shrunk or grown by `factor` around its own centre — the span a
    viewport at a different zoom would show over the same spot, since a
    Mercator viewport's span halves for every zoom level gained (`factor =
    2 ** (fromZoom - toZoom)`). Used to answer "where on screen would this
    point fall at the zoom the camera is about to reach", the same linear
    approximation `latLngFromContainerPoint`/`containerPointFromLatLng`
    already accept for a single viewport, applied once more so a reveal that
    changes zoom doesn't measure its correction against the zoom it's
    leaving (cairn/docs/design/329 — the bug this exists to fix). */
export function scaleBounds(bounds: ViewportBounds, factor: number): ViewportBounds {
  const lngSpan = bounds.east >= bounds.west ? bounds.east - bounds.west : bounds.east - bounds.west + 360
  const centerLng = wrapLongitude(bounds.west + lngSpan / 2)
  const newLngSpan = lngSpan * factor
  const centerLat = (bounds.north + bounds.south) / 2
  const newLatSpan = (bounds.north - bounds.south) * factor

  return {
    north: centerLat + newLatSpan / 2,
    south: centerLat - newLatSpan / 2,
    west: wrapLongitude(centerLng - newLngSpan / 2),
    east: wrapLongitude(centerLng + newLngSpan / 2),
  }
}
