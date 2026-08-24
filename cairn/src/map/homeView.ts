import type { LatLng } from './geo'
import { frameGeometry } from './flyover'

/** cairn/docs/design/304-the-home-view.md — the extent the map opens on and
    `Reset view` returns to. Bounds rather than a centre and a zoom: a zoom
    level that fills a 1440px desktop shows a third of the state on a phone,
    so fitting an extent is what "the Colorado zoom level" actually means on
    any window. */
export const HOME_BOUNDS: google.maps.LatLngBoundsLiteral = {
  north: 41.0,
  south: 37.0,
  east: -102.04,
  west: -109.05,
}

/** The four corners, as points — what both `fitTracksToBounds` (the 2D form)
    and `frameGeometry` (the 3D form, below) already take, rather than a
    second bounds type either of them would need to learn. */
export const HOME_CORNERS: LatLng[] = [
  { lat: HOME_BOUNDS.north, lng: HOME_BOUNDS.west },
  { lat: HOME_BOUNDS.north, lng: HOME_BOUNDS.east },
  { lat: HOME_BOUNDS.south, lng: HOME_BOUNDS.east },
  { lat: HOME_BOUNDS.south, lng: HOME_BOUNDS.west },
]

/* `frameGeometry` only returns `null` for zero points — `HOME_CORNERS` is a
   fixed four, so this always resolves. Computed once: the extent is fixed,
   so its centre and covering range are too. */
const HOME_FRAMED = frameGeometry(HOME_CORNERS)!

/** The home extent's centre — what the 3D reset flies its look-at to. */
export const HOME_CENTER: LatLng = HOME_FRAMED.center

/** A range that covers the whole extent — what the 3D reset flies its camera
    back to, the design note's "a range covering it". */
export const HOME_RANGE: number = HOME_FRAMED.range
