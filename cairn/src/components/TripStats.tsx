import type { TrackStats } from '../kml/stats'
import { formatDistance, formatElevation, formatElevationGain, formatElevationLoss } from '../format/units'
import './TripStats.css'

export interface TripStatsProps {
  /** One entry per track the trip holds, independent of a track's own
      visibility (#218: hiding a track is a map control, not a filter — a
      total that moved when you toggled an eye would read as filtered, which
      would then be wrong for every other panel in the app). */
  trackStats: TrackStats[]
}

const EM_DASH = '—'

interface Totals {
  distanceMeters: number
  elevationGainMeters: number | undefined
  elevationLossMeters: number | undefined
  highPointMeters: number | undefined
  lowPointMeters: number | undefined
  elevationTrackCount: number
}

/* Distance sums over every track. Ascent and descent sum, and high and low
   take the max and min, over only the tracks carrying elevation — a total
   silently computed over a subset is the failure the footnote exists to
   prevent, so the count travels alongside the numbers. */
function computeTotals(trackStats: TrackStats[]): Totals {
  const distanceMeters = trackStats.reduce((sum, stats) => sum + stats.distanceMeters, 0)
  const withElevation = trackStats.filter((stats) => stats.elevationGainMeters !== undefined)

  if (withElevation.length === 0) {
    return {
      distanceMeters,
      elevationGainMeters: undefined,
      elevationLossMeters: undefined,
      highPointMeters: undefined,
      lowPointMeters: undefined,
      elevationTrackCount: 0,
    }
  }

  return {
    distanceMeters,
    elevationGainMeters: withElevation.reduce((sum, stats) => sum + (stats.elevationGainMeters ?? 0), 0),
    elevationLossMeters: withElevation.reduce((sum, stats) => sum + (stats.elevationLossMeters ?? 0), 0),
    highPointMeters: Math.max(...withElevation.map((stats) => stats.highPointMeters ?? -Infinity)),
    lowPointMeters: Math.min(...withElevation.map((stats) => stats.lowPointMeters ?? Infinity)),
    elevationTrackCount: withElevation.length,
  }
}

/* No footnote when coverage is complete — a line saying "elevation from 4 of
   4 tracks" is noise on the common path, and its absence is the signal that
   nothing is missing, which is only legible if it's genuinely absent most
   of the time. "them all" rather than "all N" because "all 2" reads badly
   and a parameterised string shouldn't have a number that only works above
   three. */
function footnote(trackCount: number, elevationTrackCount: number): string | null {
  if (trackCount === 0) return 'Add a track to see totals.'
  if (elevationTrackCount === trackCount) return null
  if (elevationTrackCount === 0) return 'No track in this trip carries elevation.'
  return `Elevation from ${elevationTrackCount} of ${trackCount} tracks. Distance covers them all.`
}

/** The trip's totals block — six values under the trip header, above the
    track list. Renders for every trip, including one with no tracks: a stat
    absent because there is no data looks identical to a stat absent because
    the surface was never built, and only one of those is true (#7's
    unavailable-versus-zero rule, applied to the container as well as the
    value). */
export function TripStats({ trackStats }: TripStatsProps) {
  const trackCount = trackStats.length
  const totals = computeTotals(trackStats)
  const note = footnote(trackCount, totals.elevationTrackCount)

  return (
    <div className="trip-stats">
      <div className="stat-grid">
        <Stat label="Distance" value={trackCount === 0 ? undefined : formatDistance(totals.distanceMeters)} />
        <Stat label="Ascent" value={formatElevationGain(totals.elevationGainMeters)} />
        <Stat label="Descent" value={formatElevationLoss(totals.elevationLossMeters)} />
        <Stat label="High point" value={formatElevation(totals.highPointMeters)} />
        <Stat label="Low point" value={formatElevation(totals.lowPointMeters)} />
        <Stat label="Tracks" value={String(trackCount)} />
      </div>
      {note && <p className="trip-stats__note">{note}</p>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value${value === undefined ? ' stat__value--muted' : ''}`}>
        {value ?? EM_DASH}
      </span>
    </div>
  )
}
