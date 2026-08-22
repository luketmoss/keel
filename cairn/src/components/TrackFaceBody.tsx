import type { TrackStats, ElevationProfilePoint } from '../kml/stats'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatElevationGain,
  formatElevationLoss,
  markSampled,
} from '../format/units'
import { StatGrid } from './StatGrid'
import { TrackElevationProfile } from './TrackElevationProfile'
import { FlyoverButton } from './FlyoverButton'
import type { LatLng } from '../map/geo'
import './TrackFaceBody.css'

/** #226 — the track detail face's body: the profile, then the same
    six-cell grid shape #218's trip totals use, with duration in the cell
    that holds `Tracks` at trip level (the per-track number with no
    sensible trip-level sum). This is #219's `TrackRowDetail`, moved here
    from the row's disclosure (now deleted) and reused by both halves of
    the unified face — `TrackFace` (a trip-owned track, reading its `Track`
    and `TrackStats` directly) and `LooseFace` (a loose one, reading the
    precomputed numbers `kml/stats.ts`'s aggregate helpers left on the
    record, since the loose store keeps no raw points around to recompute
    from). Neither caller passes raw points — the profile is computed once,
    by whichever caller has the geometry to compute it from, and handed
    down already filtered. */
export function TrackFaceBody({
  stats,
  profile,
  pointCount,
  sourceName,
  color,
  name,
  flyoverPoints,
}: {
  stats: TrackStats
  /** The median-filtered, distance-aligned series, or `undefined` when
      nothing in the track has usable elevation — the caller decides
      that, this component only decides whether to draw it. */
  profile: ElevationProfilePoint[] | undefined
  pointCount: number
  sourceName: string
  color: string
  /** #274 — the track's own name, for `FlyoverButton`'s accessible name. */
  name: string
  /** #274 — the track's own geometry, flattened. A trip-owned track already
      holds its full points in memory; a loose one has none but its own
      precomputed `overview.geojson` — either caller flattens whichever it
      has, since neither passes raw points for anything else here. */
  flyoverPoints: LatLng[]
}) {
  const sampled = stats.elevationSource === 'sampled'

  return (
    <>
      {/* No profile rather than an empty frame when elevation is
          unavailable — a flat line across the box would assert a flat
          walk. */}
      {profile && (
        <TrackElevationProfile
          points={profile}
          color={color}
          distanceMeters={stats.distanceMeters}
          sampled={sampled}
        />
      )}
      <StatGrid
        items={[
          { label: 'Distance', value: formatDistance(stats.distanceMeters) },
          { label: 'Ascent', value: markSampled(formatElevationGain(stats.elevationGainMeters), sampled) },
          { label: 'Descent', value: markSampled(formatElevationLoss(stats.elevationLossMeters), sampled) },
          { label: 'High point', value: markSampled(formatElevation(stats.highPointMeters), sampled) },
          { label: 'Low point', value: markSampled(formatElevation(stats.lowPointMeters), sampled) },
          { label: 'Duration', value: formatDuration(stats.durationSeconds) },
        ]}
      />
      {/* #224: its own line above the points/source footnote — provenance
          of the numbers themselves, not of the file they came from. */}
      {sampled && <p className="track-face-body__footnote">Elevation estimated from terrain data.</p>}
      {/* Points and source file share the footnote line — provenance
          rather than measurement, so they sit beneath the `--border` rule
          rather than in stat cells that would imply they are comparable
          between tracks the way the six above are. */}
      <p className="track-face-body__footnote">
        {pointCount.toLocaleString()} points · {sourceName}
      </p>
      <FlyoverButton label={name} points={flyoverPoints} />
    </>
  )
}
