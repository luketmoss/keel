import { useMemo } from 'react'
import type { Track } from '../kml/parse'
import { computeElevationProfile, type TrackStats } from '../kml/stats'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatElevationGain,
  formatElevationLoss,
} from '../format/units'
import { StatGrid } from './StatGrid'
import { TrackElevationProfile } from './TrackElevationProfile'

/** #219's opened track detail — the profile, then the same six-cell grid
    shape #218's trip totals use, with duration in the cell that holds
    `Tracks` at trip level (the per-track number with no sensible
    trip-level sum). Only ever mounted for a single-track file; a
    multi-track file's row does not open (see `TrackList`). */
export function TrackRowDetail({ track, stats, color }: { track: Track; stats: TrackStats; color: string }) {
  const profile = useMemo(() => computeElevationProfile(track.points), [track])

  return (
    <>
      {/* No profile rather than an empty frame when elevation is
          unavailable — a flat line across the box would assert a flat
          walk. */}
      {profile && <TrackElevationProfile points={profile} color={color} distanceMeters={stats.distanceMeters} />}
      <StatGrid
        items={[
          { label: 'Distance', value: formatDistance(stats.distanceMeters) },
          { label: 'Ascent', value: formatElevationGain(stats.elevationGainMeters) },
          { label: 'Descent', value: formatElevationLoss(stats.elevationLossMeters) },
          { label: 'High point', value: formatElevation(stats.highPointMeters) },
          { label: 'Low point', value: formatElevation(stats.lowPointMeters) },
          { label: 'Duration', value: formatDuration(stats.durationSeconds) },
        ]}
      />
    </>
  )
}
