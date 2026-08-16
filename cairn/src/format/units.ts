import type { TrackStats } from '../kml/stats'

/* A guess about the reader, not a conclusion — flip this one constant to
   switch every formatted value to metric. Nothing else has to move. */
type UnitSystem = 'imperial' | 'metric'
const SYSTEM: UnitSystem = 'imperial'

const METERS_PER_MILE = 1609.344
const METERS_PER_FOOT = 0.3048

export function formatDistance(meters: number): string {
  if (SYSTEM === 'imperial') {
    const miles = meters / METERS_PER_MILE
    if (miles >= 0.1) return `${miles.toFixed(1)} mi`
    return `${Math.round(meters / METERS_PER_FOOT)} ft`
  }

  const km = meters / 1000
  if (km >= 0.1) return `${km.toFixed(1)} km`
  return `${Math.round(meters)} m`
}

export function formatDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined
  if (seconds < 60) return '<1m'

  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

/* The trailing ↑ marks gain specifically — without it, a bare distance value
   next to a foot value reads as altitude, which is a different number
   entirely. */
export function formatElevationGain(meters: number | undefined): string | undefined {
  if (meters === undefined) return undefined

  if (SYSTEM === 'imperial') {
    const feet = Math.round(meters / METERS_PER_FOOT)
    return `${feet.toLocaleString('en-US')} ft ↑`
  }

  return `${Math.round(meters).toLocaleString('en-US')} m ↑`
}

/* The trailing ↓ marks loss specifically, the mirror of gain's ↑. */
export function formatElevationLoss(meters: number | undefined): string | undefined {
  if (meters === undefined) return undefined

  if (SYSTEM === 'imperial') {
    const feet = Math.round(meters / METERS_PER_FOOT)
    return `${feet.toLocaleString('en-US')} ft ↓`
  }

  return `${Math.round(meters).toLocaleString('en-US')} m ↓`
}

/* No arrow — this is a bare elevation, not a change. #218: the arrow on
   gain and loss exists because a bare foot value beside a distance
   otherwise reads as altitude; here it *is* altitude, so the arrow would be
   the lie instead of the fix. Unlike the other formatters, a negative value
   (below sea level) is legitimate and renders as computed, per #7's rule
   that a wrong number the user can see is debuggable and a silently
   clamped one is not. */
export function formatElevation(meters: number | undefined): string | undefined {
  if (meters === undefined) return undefined

  if (SYSTEM === 'imperial') {
    const feet = Math.round(meters / METERS_PER_FOOT)
    return `${feet.toLocaleString('en-US')} ft`
  }

  return `${Math.round(meters).toLocaleString('en-US')} m`
}

/** #224 — the `~` every sampled figure carries, applied at the one point
    every formatted elevation value passes through before it reaches a
    screen, rather than duplicated at each call site. `undefined` stays
    `undefined` — a sampled track that still has nothing to show (sampling
    failed) is unavailable, not a mark on a dash. */
export function markSampled(value: string | undefined, sampled: boolean): string | undefined {
  if (value === undefined || !sampled) return value
  return `~${value}`
}

/* Two unavailable values carry no information the user can act on and make
   the row look broken, so only distance shows. One dash among present
   values is informative — it says this track came from a file that did not
   record it — so the mixed case keeps it. */
export function formatStatsLine(
  stats: Pick<TrackStats, 'distanceMeters' | 'durationSeconds' | 'elevationGainMeters' | 'elevationSource'>,
): string {
  const distance = formatDistance(stats.distanceMeters)
  const duration = formatDuration(stats.durationSeconds)
  const elevationGain = markSampled(
    formatElevationGain(stats.elevationGainMeters),
    stats.elevationSource === 'sampled',
  )

  if (duration === undefined && elevationGain === undefined) {
    return distance
  }

  return `${distance} · ${duration ?? '—'} · ${elevationGain ?? '—'}`
}
