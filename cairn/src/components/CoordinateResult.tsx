import { useMapUnavailable } from './MapCanvas'
import { formatCoordinate } from '../map/parseCoordinates'
import type { LatLng } from '../map/geo'
import './CoordinateResult.css'

interface CoordinateResultProps {
  point: LatLng
  onChoose: () => void
}

/** cairn/docs/design/337-pasting-a-coordinate.md — the row a parsed
    coordinate offers, at the top of the list face.
 *
 * **A result, not a jump.** Every prefix of a coordinate is a coordinate —
 * typing `47.6205` passes through `4` and `47` and `47.6` — so a field that
 * flew the camera as the query parsed would fly to three unrelated places
 * before the user finished. Choosing the row is what moves the map, which
 * for a paste is one keystroke.
 *
 * It also keeps #156's rule intact: there is no armed placement mode. The
 * row carries its own coordinate, exactly as the right-click gesture
 * carries its own.
 *
 * The title is the *normalised* point, never the raw query. `N 47.6205
 * W 122.3493` shown back as `47.62050, -122.34930` is what tells the user
 * the letters were understood — and, where the pair was ambiguous, which
 * way round it was read. */
export function CoordinateResult({ point, onChoose }: CoordinateResultProps) {
  const unavailable = useMapUnavailable()
  const label = formatCoordinate(point)

  // No map, no row: there is nowhere to go, and the map's own unavailable
  // state (#2) already says so.
  if (unavailable) return null

  return (
    <ul className="coordinate-result">
      <li className="coordinate-result__row">
        <span className="coordinate-result__glyph" aria-hidden="true">
          ✛
        </span>
        <button
          type="button"
          className="coordinate-result__link"
          aria-label={`Go to ${label} and place a cairn`}
          onClick={onChoose}
        >
          <span className="coordinate-result__point">{label}</span>
          <span className="coordinate-result__detail">go here and place a cairn</span>
        </button>
      </li>
    </ul>
  )
}
