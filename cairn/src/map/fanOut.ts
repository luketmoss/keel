/* #194 — the second way into a cluster, for the clusters zoom-to-fit cannot
   open. `zoomToFitCluster` works by moving the camera until the members'
   circles stop overlapping, which stops being possible at the zoom cap: two
   cairns at identical coordinates never separate at any zoom, and two a few
   metres apart still overlap at zoom 20. Both cases leave a badge that does
   nothing when clicked.

   Whether zoom-to-fit works is computable rather than guessed —
   `clusterSeparatesAtZoom` re-runs the same `clusterMarkers` over the
   cluster's own members at the cap and reports whether they come apart.
   Where they do not, `fanOutPositions` spreads them around their anchor at
   a fixed on-screen radius so each becomes an ordinary, clickable marker.

   Pure geometry, like `cluster.ts` — no React and no Google Maps runtime,
   only the projection that file already owns. */

import { clusterMarkers, project, unproject, type ClusterableMarker } from './cluster'

/** Far enough that two fanned markers plus their rings clear each other and
    the anchor badge underneath them, close enough that the fan still reads
    as one group. Grows with the member count below. */
const FAN_MIN_RADIUS_PX = 46

/** Arc length each member is given on the fan's circle. A bare footprint
    would leave them touching; 1.5× leaves a gap the eye reads as separate
    markers rather than a ring. */
const FAN_SPACING_FACTOR = 1.5

/** True when moving the camera to `zoom` would break `members` into more
    than one cluster — i.e. when zoom-to-fit still has somewhere to go.
    False means the members overlap even there, and no camera move will
    ever separate them. */
export function clusterSeparatesAtZoom<T extends ClusterableMarker>(
  members: T[],
  zoom: number,
  footprintPx: number,
): boolean {
  return clusterMarkers(members, zoom, footprintPx).length > 1
}

export interface FannedPlacement {
  lat: number
  lng: number
  /** Degrees clockwise from straight up, as the member sits relative to the
      anchor. The leader line back to the anchor is drawn from this. */
  angleDeg: number
  /** On-screen distance from the anchor, in pixels at the zoom this was
      computed for — the leader line's length. */
  radiusPx: number
}

/** Places `count` members evenly around `anchor`, starting at the top and
    going clockwise. Positions are real coordinates rather than a CSS offset
    so each member is a genuine `AdvancedMarker` with its own hit target,
    and so the leader line's geometry and the marker's agree exactly.

    They are only correct at `zoom`, which is why an expansion collapses on
    any camera move rather than trying to follow one. */
export function fanOutPositions(
  anchor: ClusterableMarker,
  count: number,
  zoom: number,
  footprintPx: number,
): FannedPlacement[] {
  if (count === 0) return []

  const circumference = count * footprintPx * FAN_SPACING_FACTOR
  const radiusPx = Math.max(FAN_MIN_RADIUS_PX, circumference / (2 * Math.PI))
  const origin = project(anchor.lat, anchor.lng, zoom)

  return Array.from({ length: count }, (_, index) => {
    const angleDeg = (index * 360) / count
    // -90° puts index 0 at the top; projected y grows downward, which is
    // what makes a positive sine reach *down* the screen and the sweep
    // therefore read clockwise.
    const radians = ((angleDeg - 90) * Math.PI) / 180
    const { lat, lng } = unproject(
      origin.x + radiusPx * Math.cos(radians),
      origin.y + radiusPx * Math.sin(radians),
      zoom,
    )
    return { lat, lng, angleDeg, radiusPx }
  })
}
