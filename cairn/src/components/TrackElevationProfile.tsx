import { formatDistance, formatElevation } from '../format/units'
import type { ElevationProfilePoint } from '../kml/stats'
import './TrackElevationProfile.css'

/* Arbitrary user-space units — the path is stretched to the row's actual
   width and `--profile-height` by the surrounding box, and
   `vector-effect: non-scaling-stroke` is what keeps the line and baseline a
   constant 1-1.5px through that stretch rather than thickening or thinning
   with the geometry. */
const VIEW_WIDTH = 400
const VIEW_HEIGHT = 100

export interface TrackElevationProfileProps {
  /** The median-filtered, distance-aligned series (#219 —
      `computeElevationProfile`). At least two points, not all one value;
      the caller decides when to render this component at all. */
  points: ElevationProfilePoint[]
  /** Drawn in the track's own colour, not `--accent` — track polyline
      colours are data, not chrome, and this line *is* that track. */
  color: string
  /** The track's total distance, for the aria-label — not necessarily the
      last point's cumulative distance, which only covers the elevation-
      bearing points. */
  distanceMeters: number
  /** #224: true when `points` came from the Elevation API rather than the
      track's own points. A sighted reader gets the `~` on the grid figures
      directly beneath this; a screen reader user meets the profile itself
      only here, so the `aria-label` is the one place that has to name the
      source in words. */
  sampled?: boolean
}

/** #219's inline elevation profile: an SVG line and fill for sighted users,
    a text alternative naming the two endpoints and the distance for
    everyone else. The x axis is cumulative distance, not point index, and
    the y axis spans the track's own low and high rather than sea level. */
export function TrackElevationProfile({ points, color, distanceMeters, sampled }: TrackElevationProfileProps) {
  const low = points.reduce((min, point) => (point.elevationMeters < min.elevationMeters ? point : min))
  const high = points.reduce((max, point) => (point.elevationMeters > max.elevationMeters ? point : max))
  const span = high.elevationMeters - low.elevationMeters || 1
  const totalDistance = points[points.length - 1].distanceMeters || 1

  const toX = (d: number) => (d / totalDistance) * VIEW_WIDTH
  const toY = (e: number) => VIEW_HEIGHT - ((e - low.elevationMeters) / span) * VIEW_HEIGHT

  const linePath = points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${toX(point.distanceMeters)},${toY(point.elevationMeters)}`)
    .join(' ')
  const fillPath = `${linePath} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`

  const label = sampled
    ? `Elevation profile, estimated from terrain data: ${formatElevation(low.elevationMeters)} to ${formatElevation(
        high.elevationMeters,
      )} over ${formatDistance(distanceMeters)}`
    : `Elevation profile: ${formatElevation(low.elevationMeters)} to ${formatElevation(
        high.elevationMeters,
      )} over ${formatDistance(distanceMeters)}`

  return (
    <div className="track-elevation-profile" role="img" aria-label={label}>
      <svg
        className="track-elevation-profile__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          className="track-elevation-profile__baseline"
          x1={0}
          y1={VIEW_HEIGHT}
          x2={VIEW_WIDTH}
          y2={VIEW_HEIGHT}
        />
        <path
          className="track-elevation-profile__fill"
          d={fillPath}
          style={{ fill: `color-mix(in srgb, ${color} 16%, transparent)` }}
        />
        <path className="track-elevation-profile__line" d={linePath} style={{ stroke: color }} />
      </svg>
      {/* Drawn as ordinary elements rather than SVG circles: the viewBox
          above is stretched non-uniformly to fill the row's width and
          `--profile-height`, so a circle in that coordinate space would
          render as an ellipse. */}
      <span
        className="track-elevation-profile__mark"
        style={{ left: `${(toX(low.distanceMeters) / VIEW_WIDTH) * 100}%`, top: `${(toY(low.elevationMeters) / VIEW_HEIGHT) * 100}%` }}
      />
      <span
        className="track-elevation-profile__mark"
        style={{ left: `${(toX(high.distanceMeters) / VIEW_WIDTH) * 100}%`, top: `${(toY(high.elevationMeters) / VIEW_HEIGHT) * 100}%` }}
      />
    </div>
  )
}
