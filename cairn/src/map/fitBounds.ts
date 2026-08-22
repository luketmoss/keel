import type { LatLng } from './geo'

/** Without a cap, a 200m walk fills the screen at building level and the
    satellite context is lost. */
const MAX_FIT_ZOOM = 16
/** #270 exports this and reuses it as the reveal margin, rather than a
    second number meaning the same thing — see `reveal.ts`. */
export const FIT_PADDING = 48

export function fitTracksToBounds(
  map: google.maps.Map,
  points: LatLng[],
  padding: number | google.maps.Padding = FIT_PADDING,
): void {
  if (points.length === 0) return

  const bounds = new google.maps.LatLngBounds()
  for (const point of points) bounds.extend(point)

  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    /* fitBounds does not change zoom for a degenerate (single-point) box —
       it only centers — so the cap has to be set explicitly here. */
    map.setCenter(bounds.getCenter())
    map.setZoom(MAX_FIT_ZOOM)
    return
  }

  google.maps.event.addListenerOnce(map, 'idle', () => {
    if ((map.getZoom() ?? 0) > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM)
  })
  map.fitBounds(bounds, padding)
}

/** Higher cap than `fitTracksToBounds` — a cluster is photos at one
    viewpoint, not a whole track, so zooming in close is the point (design
    doc, Selection section: "Clicking a cluster zooms to fit its members"). */
export const CLUSTER_MAX_ZOOM = 20

/** Clicking a cluster zooms to fit its members rather than selecting one —
    design doc's Selection section. Two photos at identical coordinates (the
    doc's own edge case) produce a degenerate, zero-size bounds that
    `fitBounds` cannot zoom into further, so that case stays a deliberate
    no-op here rather than an arbitrary max-zoom jump: this function does
    not pretend to separate what cannot separate.

    #194: the caller no longer *reaches* this function for a cluster that
    cannot separate. `clusterSeparatesAtZoom` asks that question first and
    expands the cluster in place instead, so the no-op above is now a
    guard rather than the user's experience. */
export function zoomToFitCluster(map: google.maps.Map, points: LatLng[]): void {
  if (points.length === 0) return

  const bounds = new google.maps.LatLngBounds()
  for (const point of points) bounds.extend(point)

  if (bounds.getNorthEast().equals(bounds.getSouthWest())) return

  google.maps.event.addListenerOnce(map, 'idle', () => {
    if ((map.getZoom() ?? 0) > CLUSTER_MAX_ZOOM) map.setZoom(CLUSTER_MAX_ZOOM)
  })
  map.fitBounds(bounds, FIT_PADDING)
}
