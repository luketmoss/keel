import type { TripIndexEntry, TripStatus } from './tripStore'

/* #80: the one predicate the world map's dots and the trips panel's rows
   both apply — the guarantee that they can never disagree is that they
   call this function, not that they're driven by the same UI. Extending
   it (a tag, a KML metadata field) means adding a clause here, not a
   second filtering system. */

export type StatusFilter = 'all' | TripStatus

export interface TripFilters {
  status: StatusFilter
  /** Case-insensitive substring match against the trip name. Empty string
      disables it. */
  name: string
  /** Inclusive day-index range (`Math.floor(ms / MS_PER_DAY)`), `null`
      when there's nothing to restrict — no dated trips yet, or the range
      hasn't been computed. */
  range: [number, number] | null
}

export const DEFAULT_TRIP_FILTERS: TripFilters = { status: 'all', name: '', range: null }

export const MS_PER_DAY = 86_400_000

/** `startDate` if the trip has one, `createdAt` otherwise — the "date a
    trip never chose" #79's design note describes. */
export function tripDayIndex(trip: Pick<TripIndexEntry, 'startDate' | 'createdAt'>): number {
  return Math.floor(new Date(trip.startDate ?? trip.createdAt).getTime() / MS_PER_DAY)
}

/** Whether the trip has a real, user-set `startDate` — `false` means it's
    exempt from date-range filtering (#79's "undated trips stay visible"
    rule), even though `tripDayIndex` above still gives it a fallback date
    for span computation. */
export function tripIsDated(trip: Pick<TripIndexEntry, 'startDate'>): boolean {
  return trip.startDate !== null
}

export function matchesTripFilters(trip: TripIndexEntry, filters: TripFilters): boolean {
  if (filters.status !== 'all' && trip.status !== filters.status) return false

  const name = filters.name.trim().toLowerCase()
  if (name && !trip.name.toLowerCase().includes(name)) return false

  if (filters.range && tripIsDated(trip)) {
    const day = tripDayIndex(trip)
    if (day < filters.range[0] || day > filters.range[1]) return false
  }

  return true
}
