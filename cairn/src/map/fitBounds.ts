import type { LatLng } from './geo'

/** Without a cap, a 200m walk fills the screen at building level and the
    satellite context is lost. */
const MAX_FIT_ZOOM = 16
const FIT_PADDING = 48

export function fitTracksToBounds(map: google.maps.Map, points: LatLng[]): void {
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
  map.fitBounds(bounds, FIT_PADDING)
}
