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

/* Two unavailable values carry no information the user can act on and make
   the row look broken, so only distance shows. One dash among present
   values is informative — it says this track came from a file that did not
   record it — so the mixed case keeps it. */
export function formatStatsLine(stats: TrackStats): string {
  const distance = formatDistance(stats.distanceMeters)
  const duration = formatDuration(stats.durationSeconds)
  const elevationGain = formatElevationGain(stats.elevationGainMeters)

  if (duration === undefined && elevationGain === undefined) {
    return distance
  }

  return `${distance} · ${duration ?? '—'} · ${elevationGain ?? '—'}`
}
