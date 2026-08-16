import { summarizeElevation, type TrackStats } from '../kml/stats'
import { formatDistance, formatElevation, formatElevationGain, formatElevationLoss, markSampled } from '../format/units'
import { StatGrid } from './StatGrid'
import './TripStats.css'

export interface TripStatsProps {
  /** One entry per track the trip holds, independent of a track's own
      visibility (#218: hiding a track is a map control, not a filter — a
      total that moved when you toggled an eye would read as filtered, which
      would then be wrong for every other panel in the app). */
  trackStats: TrackStats[]
}

interface Totals {
  distanceMeters: number
  elevationGainMeters: number | undefined
  elevationLossMeters: number | undefined
  highPointMeters: number | undefined
  lowPointMeters: number | undefined
  elevationTrackCount: number
  sampledTrackCount: number
}

/* Distance sums over every track. Ascent and descent sum, and high and low
   take the max and min, over only the tracks carrying elevation — a total
   silently computed over a subset is the failure the footnote exists to
   prevent, so the count travels alongside the numbers. #224 folds in how
   many of those tracks are sampled rather than recorded, via the same
   `summarizeElevation` the persisted trip totals (`geo/tripTotals.ts`) use,
   so the block and the row can't disagree about what counts as "carries
   elevation" or which of it is a `~`. */
function computeTotals(trackStats: TrackStats[]): Totals {
  const distanceMeters = trackStats.reduce((sum, stats) => sum + stats.distanceMeters, 0)
  const summary = summarizeElevation(trackStats)
  const sampledTrackCount = trackStats.filter((stats) => stats.elevationSource === 'sampled').length

  return { distanceMeters, ...summary, sampledTrackCount }
}

/* No footnote when coverage is complete and nothing was sampled — a line
   saying "elevation from 4 of 4 tracks" is noise on the common path, and
   its absence is the signal that nothing is missing, which is only legible
   if it's genuinely absent most of the time. "them all" rather than "all N"
   because "all 2" reads badly and a parameterised string shouldn't have a
   number that only works above three. #224 adds the two sampled rows to
   #218's three-row table — "estimated from terrain data" language takes
   over the footnote whenever any track was sampled, even one that also has
   recorded-elevation siblings, since the note has to explain the `~` on the
   total, not just name a coverage gap. */
function footnote(trackCount: number, elevationTrackCount: number, sampledTrackCount: number): string | null {
  if (trackCount === 0) return 'Add a track to see totals.'
  if (elevationTrackCount === 0) return 'No track in this trip carries elevation.'
  if (sampledTrackCount === 0) {
    return elevationTrackCount === trackCount
      ? null
      : `Elevation from ${elevationTrackCount} of ${trackCount} tracks. Distance covers them all.`
  }
  return sampledTrackCount === trackCount
    ? 'Elevation estimated from terrain data.'
    : `Elevation estimated from terrain data for ${sampledTrackCount} of ${trackCount} tracks.`
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
  const note = footnote(trackCount, totals.elevationTrackCount, totals.sampledTrackCount)
  // #224: a total mixing recorded and sampled tracks is itself sampled —
  // the weaker claim governs, same as `summarizeElevation`'s own rule.
  const sampled = totals.sampledTrackCount > 0

  return (
    <div className="trip-stats">
      <StatGrid
        items={[
          { label: 'Distance', value: trackCount === 0 ? undefined : formatDistance(totals.distanceMeters) },
          { label: 'Ascent', value: markSampled(formatElevationGain(totals.elevationGainMeters), sampled) },
          { label: 'Descent', value: markSampled(formatElevationLoss(totals.elevationLossMeters), sampled) },
          { label: 'High point', value: markSampled(formatElevation(totals.highPointMeters), sampled) },
          { label: 'Low point', value: markSampled(formatElevation(totals.lowPointMeters), sampled) },
          { label: 'Tracks', value: String(trackCount) },
        ]}
      />
      {note && <p className="trip-stats__note">{note}</p>}
    </div>
  )
}
