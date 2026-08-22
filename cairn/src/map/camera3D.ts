/** #271 — converting between 2D's zoom levels and 3D's metres-from-target
    range. 2D thinks in zoom levels and 3D thinks in metres, so turning the
    switch is a conversion rather than a copy — see the design note's "The
    camera, in both directions".

    Not exact at high tilt (a tilted camera sees further than a flat one at
    the same range), and the design note says it does not need to be: the
    only guarantee is that nothing jumps somewhere else, and that flipping
    the switch twice roughly round-trips. */

/* Standard Web Mercator constant: metres per pixel at the equator, zoom 0. */
const EQUATOR_METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392

/* Clamped short of the poles so `cos` never reaches zero and the conversion
   never divides by it. cairn's tracks don't go there. */
const MAX_ABS_LATITUDE = 85

function metersPerPixel(latitude: number, zoom: number): number {
  const clampedLat = Math.max(-MAX_ABS_LATITUDE, Math.min(MAX_ABS_LATITUDE, latitude))
  return (EQUATOR_METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((clampedLat * Math.PI) / 180)) / Math.pow(2, zoom)
}

/** 2D's zoom → 3D's range, at the viewport's own height in metres per
    pixel — "a comparable extent", the design note's own words, not an
    exact one. */
export function zoomToRange(zoom: number, latitude: number, viewportHeightPx: number): number {
  return metersPerPixel(latitude, zoom) * Math.max(1, viewportHeightPx)
}

/** The inverse: 3D's range → the 2D zoom that produces a comparable
    extent at the same latitude and viewport height. */
export function rangeToZoom(range: number, latitude: number, viewportHeightPx: number): number {
  const clampedLat = Math.max(-MAX_ABS_LATITUDE, Math.min(MAX_ABS_LATITUDE, latitude))
  const metersPerPixelAtZoom1 = EQUATOR_METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos((clampedLat * Math.PI) / 180)
  const targetMetersPerPixel = range / Math.max(1, viewportHeightPx)
  return Math.log2(metersPerPixelAtZoom1 / targetMetersPerPixel)
}
