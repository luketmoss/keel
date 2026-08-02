import type { TrackPoint } from '../kml/parse'

export interface LatLng {
  lat: number
  lng: number
}

/** Corrupt exports carry the occasional out-of-range point; the rest of the
    track still draws rather than the whole thing being discarded over one
    bad row. */
export function dropInvalidLatitudes(points: TrackPoint[]): LatLng[] {
  return points
    .filter((point) => point.lat >= -90 && point.lat <= 90)
    .map((point) => ({ lat: point.lat, lng: point.lon }))
}

/* Walks consecutive points; when a pair's longitude jumps by more than 180°,
   the remainder of the path is offset by ±360° so a Pacific-crossing track
   draws as a short segment across the date line instead of the long way
   around the globe. */
export function normalizeAntimeridian(points: LatLng[]): LatLng[] {
  if (points.length === 0) return []

  const result: LatLng[] = [points[0]]
  let offset = 0

  for (let i = 1; i < points.length; i++) {
    const delta = points[i].lng - points[i - 1].lng
    if (delta > 180) {
      offset -= 360
    } else if (delta < -180) {
      offset += 360
    }
    result.push({ lat: points[i].lat, lng: points[i].lng + offset })
  }

  return result
}
