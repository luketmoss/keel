/* cairn/docs/design/270-selecting-reveals-it-on-the-map.md — "The reveal
   rule": selecting something moves the camera by the least it can, and only
   when it has to. Shared by both call sites that have a selection —
   `TripDetail`'s map (tracks and cairns) and the world map's loose items
   (`LooseLayer`) — so the three-step rule and the visible area it reads
   against can't drift between them.

   Pixel math goes through `containerPoint.ts`'s pair — `latLngFromContainerPoint`
   and its inverse, `containerPointFromLatLng` — the same linear
   approximation `CairnCreateGesture`'s long-press already reads a coordinate
   through, rather than a second, exact projection that could disagree with
   it about where something sits on screen. */

import { containerPointFromLatLng, latLngFromContainerPoint, type ViewportBounds } from './containerPoint'
import { CLUSTER_MAX_ZOOM, FIT_PADDING, fitTracksToBounds } from './fitBounds'
import { prefersReducedMotion } from './motion'
import type { LatLng } from './geo'

/** The margin an inset leaves on every edge, in the same units as
    `--panel-width`/`--space-4`/`--sheet-current` — pixels. */
export interface Inset {
  left: number
  right: number
  top: number
  bottom: number
}

const NO_INSET: Inset = { left: 0, right: 0, top: 0, bottom: 0 }

/** The desktop column (`--space-4` + `--panel-width` + `--space-4`, left
    edge only) or the phone sheet (its height at the detent it has *already*
    settled at, bottom edge only) — design note's "The visible area" table.
    Read fresh at reveal time, never cached: the column can collapse and the
    sheet can move between one selection and the next, and `--sheet-current`
    is exactly the settled-detent height `BottomSheet` already publishes. */
export function columnInset(isPhone: boolean): Inset {
  const root = getComputedStyle(document.documentElement)
  if (isPhone) {
    const sheet = parseFloat(root.getPropertyValue('--sheet-current')) || 0
    /* #312 — the search card floats over the map at the same edge a reveal
       already has to avoid; without this the top of the visible band was
       simply the viewport's own top, and the "dead space" the issue reports
       was every camera move never having been told the card was there. */
    const space2 = parseFloat(root.getPropertyValue('--space-2')) || 0
    const searchHeight = parseFloat(root.getPropertyValue('--search-height')) || 0
    return { ...NO_INSET, top: space2 + searchHeight, bottom: sheet }
  }
  const space4 = parseFloat(root.getPropertyValue('--space-4')) || 0
  const panelWidth = parseFloat(root.getPropertyValue('--panel-width')) || 0
  return { ...NO_INSET, left: space4 * 2 + panelWidth }
}

function viewportBounds(map: google.maps.Map): ViewportBounds | null {
  const bounds = map.getBounds()
  if (!bounds) return null
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  return { north: ne.lat(), south: sw.lat(), west: sw.lng(), east: ne.lng() }
}

/** The three-step rule itself. `points` is whatever "What gets revealed, per
    kind" names — a cairn's one coordinate, a track's full geometry, a loose
    item's overview line strings — already normalised (antimeridian included)
    by the caller, the same points the layer itself draws.

    Never call this from an effect keyed on the camera — only on the
    selection changing — or the panning it does becomes a leash on itself
    (design note's "Reveal is a response to the selection changing, never to
    the camera changing", the note's own words for the failure mode this is
    one line away from). */
export function revealPoints(map: google.maps.Map, points: LatLng[], inset: Inset): void {
  if (points.length === 0) return

  const div = map.getDiv()
  const width = div.clientWidth
  const height = div.clientHeight
  const bounds = viewportBounds(map)
  // No viewport reported yet (the very first frame) — nothing to reveal
  // against, same as a track with no usable geometry.
  if (!bounds || width === 0 || height === 0) return

  const visibleLeft = inset.left + FIT_PADDING
  const visibleTop = inset.top + FIT_PADDING
  const visibleRight = width - inset.right - FIT_PADDING
  const visibleBottom = height - inset.bottom - FIT_PADDING
  const visibleWidth = visibleRight - visibleLeft
  const visibleHeight = visibleBottom - visibleTop
  // A very narrow window can leave nothing between the insets — the design
  // note's own edge case, "the rule still holds and the fit branch fires
  // more often". With no visible rect to reason about, fitting is the
  // closest available approximation to "as close as it can get".
  if (visibleWidth <= 0 || visibleHeight <= 0) {
    fitTracksToBounds(map, points, toPadding(inset))
    return
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    const pixel = containerPointFromLatLng(point, width, height, bounds)
    if (!pixel) return
    minX = Math.min(minX, pixel.x)
    maxX = Math.max(maxX, pixel.x)
    minY = Math.min(minY, pixel.y)
    maxY = Math.max(maxY, pixel.y)
  }

  const alreadyVisible =
    minX >= visibleLeft && maxX <= visibleRight && minY >= visibleTop && maxY <= visibleBottom
  if (alreadyVisible) return

  const itemWidth = maxX - minX
  const itemHeight = maxY - minY
  const fitsAtCurrentZoom = itemWidth <= visibleWidth && itemHeight <= visibleHeight

  if (!fitsAtCurrentZoom) {
    fitTracksToBounds(map, points, toPadding(inset))
    return
  }

  // Pan branch: shift the map's own centre by exactly the pixel delta that
  // puts the item's centre at the visible area's centre. A point (a cairn)
  // always lands here — its own bounds are zero-size, so it can never fail
  // `fitsAtCurrentZoom` — which is what makes "the zoom is never taken" for
  // a cairn fall out of the shared rule rather than needing a branch of its
  // own.
  const itemCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const visibleCenter = { x: (visibleLeft + visibleRight) / 2, y: (visibleTop + visibleBottom) / 2 }
  const mapCenterPixel = { x: width / 2, y: height / 2 }
  const targetCenter = latLngFromContainerPoint(
    mapCenterPixel.x + (itemCenter.x - visibleCenter.x),
    mapCenterPixel.y + (itemCenter.y - visibleCenter.y),
    width,
    height,
    bounds,
  )
  if (!targetCenter) return

  // `panTo` glides; reduced motion jumps straight there, same as every
  // other camera move in the app.
  if (prefersReducedMotion()) {
    map.setCenter(targetCenter)
  } else {
    map.panTo(targetCenter)
  }
}

/** cairn/docs/design/302-revealing-a-cairn-closes-in.md — a cairn's own
    reveal, not a case of `revealPoints` above. A point's bounds are always
    zero-size, so it can never fail `revealPoints`' "does it fit" test and its
    zoom is never touched — right for a track, whose extent the user already
    chose a zoom for, but wrong for a cairn, which has none: "as close as it
    can get" for a point has to mean a zoom or it means nothing.

    Always centres `point` in the visible area — unlike `revealPoints`, this
    does not skip the pan when the point is merely already on screen,
    because arrival *at* the cairn is the point (AC: selecting a cairn while
    already zoomed in past the close-up zoom still moves the camera to it).
    Zoom only ever closes in: `CLUSTER_MAX_ZOOM` (#194's cap for "zoomed to a
    cluster of photos at one viewpoint" — a cairn is that subject at a count
    of one, so this reuses the constant rather than inventing a second number
    meaning the same thing) unless the map is already closer, in which case
    the zoom the user chose is left alone. */
export function revealPoint(map: google.maps.Map, point: LatLng, inset: Inset): void {
  const div = map.getDiv()
  const width = div.clientWidth
  const height = div.clientHeight
  const bounds = viewportBounds(map)
  // No viewport yet, or the point doesn't project — nothing to reveal
  // against, same guard `revealPoints` keeps.
  if (!bounds || width === 0 || height === 0) return

  const pixel = containerPointFromLatLng(point, width, height, bounds)
  if (!pixel) return

  const visibleLeft = inset.left + FIT_PADDING
  const visibleTop = inset.top + FIT_PADDING
  const visibleRight = width - inset.right - FIT_PADDING
  const visibleBottom = height - inset.bottom - FIT_PADDING
  const visibleCenter = { x: (visibleLeft + visibleRight) / 2, y: (visibleTop + visibleBottom) / 2 }
  const mapCenterPixel = { x: width / 2, y: height / 2 }

  const targetCenter = latLngFromContainerPoint(
    mapCenterPixel.x + (pixel.x - visibleCenter.x),
    mapCenterPixel.y + (pixel.y - visibleCenter.y),
    width,
    height,
    bounds,
  )
  if (!targetCenter) return

  // Never zooms out: only raises the zoom to the close-up cap, never lowers
  // it toward one.
  const targetZoom = Math.max(map.getZoom() ?? 0, CLUSTER_MAX_ZOOM)

  if (prefersReducedMotion()) {
    map.setCenter(targetCenter)
    map.setZoom(targetZoom)
  } else {
    map.panTo(targetCenter)
    map.setZoom(targetZoom)
  }
}

/** #304 — exported so `MapCanvas`'s home-extent fit (the initial load and
    `Reset view`'s 2D form) can turn the same inset into the padding
    `fitTracksToBounds`/`defaultBounds` take, rather than a second copy of
    this arithmetic living beside them. */
export function toPadding(inset: Inset): google.maps.Padding {
  return {
    left: inset.left + FIT_PADDING,
    right: inset.right + FIT_PADDING,
    top: inset.top + FIT_PADDING,
    bottom: inset.bottom + FIT_PADDING,
  }
}
