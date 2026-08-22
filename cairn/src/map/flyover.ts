import type { LatLng } from './geo'

/** 274-a-flyover-of-a-trip.md's three phases and their numbers. Not design
    tokens — "parameters of a view of data," the same reasoning #271 gives
    its own 55° and its zoom-to-range conversion — so they live here rather
    than beside `--motion-fast`. */
export const FLYOVER_MARGIN_PERCENT = 20
export const FLYOVER_TILT_DEGREES = 65
export const FLYOVER_FLY_IN_MS = 2000
export const FLYOVER_ORBIT_MS = 12000
export const FLYOVER_ORBIT_ROUNDS = 1

/** The compositor gotcha: `flyCameraTo`/`flyCameraAround` are driven by the
    compositor, so a backgrounded tab never advances them. This is how long
    past a phase's own duration the camera is landed unconditionally — the
    prototype's own buffer, "a known property of the API, not a defensive
    guess." */
export const FLYOVER_COMPOSITOR_BUFFER_MS = 400

/* Metres per degree of latitude, the constant the prototype's own `frame`
   used — plenty accurate for a bounding box that only has to keep the whole
   subject on screen, never a distance a user reads. */
const METERS_PER_DEGREE_LAT = 111_320

/** Floors the range so a subject at a single point (or a track whose points
    are nearly coincident) does not put the camera inside the terrain. */
const MINIMUM_RANGE_METERS = 400

export interface FramedCamera {
  center: LatLng
  range: number
}

/** The prototype's `frame(points, marginPct)`, carried over unchanged — see
    the design note's "Framing". A bounding box over every point, its centre
    as the target, and a range from the larger of its two spans with the
    given margin. `null` for no points at all, which is what makes "a subject
    with no usable geometry" a case the caller can render nothing for. */
export function frameGeometry(points: LatLng[], marginPct: number = FLYOVER_MARGIN_PERCENT): FramedCamera | null {
  if (points.length === 0) return null

  let north = -90
  let south = 90
  let east = -180
  let west = 180
  for (const point of points) {
    north = Math.max(north, point.lat)
    south = Math.min(south, point.lat)
    east = Math.max(east, point.lng)
    west = Math.min(west, point.lng)
  }

  const center: LatLng = { lat: (north + south) / 2, lng: (east + west) / 2 }
  const latSpanMeters = (north - south) * METERS_PER_DEGREE_LAT
  const lngSpanMeters = (east - west) * METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180)
  const span = Math.max(latSpanMeters, lngSpanMeters, 1)
  const range = Math.max(MINIMUM_RANGE_METERS, span * (1 + marginPct / 100) * 1.4)

  return { center, range }
}
