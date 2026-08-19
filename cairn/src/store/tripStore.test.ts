import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveTripStatus, LocalTripStore } from './tripStore'
import { SIDECAR_VERSION, type StoredOverview } from '../geo/tripTotals'
import { cairnCacheKey } from './cairnCache'

/** A minimal in-memory `Storage` so tests don't depend on jsdom's
    `localStorage` persisting (or not) across test files. */
function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

describe('deriveTripStatus (#147)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 8)) // 8 Aug 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads completed when the last day is strictly before today', () => {
    expect(deriveTripStatus('2026-08-03', '2026-08-07')).toBe('completed')
  })

  it('reads planned when the range ends today', () => {
    expect(deriveTripStatus('2026-08-03', '2026-08-08')).toBe('planned')
  })

  it('reads planned when the range spans today', () => {
    expect(deriveTripStatus('2026-08-05', '2026-08-12')).toBe('planned')
  })

  it('reads planned when the range is entirely in the future', () => {
    expect(deriveTripStatus('2026-08-14', '2026-08-16')).toBe('planned')
  })

  it('reads planned when there are no dates at all', () => {
    expect(deriveTripStatus(null, null)).toBe('planned')
  })

  it('uses startDate as the last day when there is no endDate', () => {
    expect(deriveTripStatus('2026-08-01', null)).toBe('completed')
    expect(deriveTripStatus('2026-08-14', null)).toBe('planned')
  })

  it('uses endDate as the last day when there is no startDate (not reachable through the picker, but possible in storage)', () => {
    expect(deriveTripStatus(null, '2026-08-01')).toBe('completed')
    expect(deriveTripStatus(null, '2026-08-14')).toBe('planned')
  })
})

describe('LocalTripStore', () => {
  it('starts empty', () => {
    const store = new LocalTripStore(fakeStorage())
    expect(store.getTrips()).toEqual([])
  })

  it('creates a trip, with no dates, and notifies subscribers', () => {
    const store = new LocalTripStore(fakeStorage())
    const listener = vi.fn()
    store.subscribe(listener)

    const trip = store.createTrip('Hokkaido')

    expect(trip.name).toBe('Hokkaido')
    expect(trip.startDate).toBeNull()
    expect(trip.endDate).toBeNull()
    expect(store.getTrips()).toHaveLength(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('puts the newest-created trip at the top of the list', () => {
    const store = new LocalTripStore(fakeStorage())

    store.createTrip('Hokkaido')
    store.createTrip('Iceland ring road')

    expect(store.getTrips().map((t) => t.name)).toEqual(['Iceland ring road', 'Hokkaido'])
  })

  it('deletes a trip by id, leaving the others in place', () => {
    const store = new LocalTripStore(fakeStorage())
    const a = store.createTrip('Hokkaido')
    store.createTrip('Iceland ring road')

    store.deleteTrip(a.id)

    expect(store.getTrips().map((t) => t.name)).toEqual(['Iceland ring road'])
  })

  it('persists trips across a reload of a new store over the same storage', () => {
    const storage = fakeStorage()
    const first = new LocalTripStore(storage)
    first.createTrip('Hokkaido')

    const second = new LocalTripStore(storage)

    expect(second.getTrips().map((t) => t.name)).toEqual(['Hokkaido'])
  })

  it('keeps a deleted trip gone after a reload', () => {
    const storage = fakeStorage()
    const first = new LocalTripStore(storage)
    const trip = first.createTrip('Hokkaido')
    first.deleteTrip(trip.id)

    const second = new LocalTripStore(storage)

    expect(second.getTrips()).toEqual([])
  })

  it('removes the trip record itself from storage, not just the index', () => {
    const storage = fakeStorage()
    const store = new LocalTripStore(storage)
    const trip = store.createTrip('Hokkaido')
    expect(storage.getItem(`cairn.trips.trip.${trip.id}`)).not.toBeNull()

    store.deleteTrip(trip.id)

    expect(storage.getItem(`cairn.trips.trip.${trip.id}`)).toBeNull()
  })

  /* #243: the trip's cached cairns go with the trip, so a later trip
     reusing the id cannot inherit them. Both delete paths funnel through
     here — `DriveTripStore.deleteTrip` delegates. */
  it('drops the trip’s cached cairns along with it', () => {
    const storage = fakeStorage()
    const store = new LocalTripStore(storage)
    const trip = store.createTrip('Hokkaido')
    storage.setItem(cairnCacheKey(trip.id), JSON.stringify([]))

    store.deleteTrip(trip.id)

    expect(storage.getItem(cairnCacheKey(trip.id))).toBeNull()
  })

  it('lets a listener unsubscribe', () => {
    const store = new LocalTripStore(fakeStorage())
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.createTrip('Hokkaido')

    expect(listener).not.toHaveBeenCalled()
  })

  it('trims a name before storing it', () => {
    const store = new LocalTripStore(fakeStorage())

    const trip = store.createTrip('  Hokkaido  ')

    expect(trip.name).toBe('Hokkaido')
  })

  it('treats a corrupted index as empty rather than throwing', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.trips.index', 'not json')

    const store = new LocalTripStore(storage)

    expect(store.getTrips()).toEqual([])
  })

  it('treats a non-array index as empty rather than throwing', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.trips.index', JSON.stringify({ oops: true }))

    const store = new LocalTripStore(storage)

    expect(store.getTrips()).toEqual([])
  })

  it('returns null for a trip that does not exist', () => {
    const store = new LocalTripStore(fakeStorage())

    expect(store.getTrip('no-such-id')).toBeNull()
  })

  it('reads back the full record, including notes the index omits', () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')

    expect(store.getTrip(trip.id)).toMatchObject({
      id: trip.id,
      name: 'Hokkaido',
      notes: '',
    })
  })

  it('applies a partial edit, notifies subscribers, and reflects it in both the record and the index', async () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')
    const listener = vi.fn()
    store.subscribe(listener)

    const updated = await store.updateTrip(trip.id, { startDate: '2026-01-01', notes: 'Great trip' })

    expect(updated).toMatchObject({ startDate: '2026-01-01', notes: 'Great trip', name: 'Hokkaido' })
    expect(store.getTrip(trip.id)).toMatchObject({ startDate: '2026-01-01', notes: 'Great trip' })
    expect(store.getTrips()[0]).toMatchObject({ startDate: '2026-01-01' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('returns null from updateTrip for a trip that does not exist', async () => {
    const store = new LocalTripStore(fakeStorage())

    expect(await store.updateTrip('no-such-id', { notes: 'x' })).toBeNull()
  })

  it('discards an edit that would save an empty name, leaving the prior name in place', async () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')

    const updated = await store.updateTrip(trip.id, { name: '   ' })

    expect(updated?.name).toBe('Hokkaido')
  })

  it('persists an update across a reload of a new store over the same storage', async () => {
    const storage = fakeStorage()
    const first = new LocalTripStore(storage)
    const trip = first.createTrip('Hokkaido')
    await first.updateTrip(trip.id, { notes: 'Great trip' })

    const second = new LocalTripStore(storage)

    expect(second.getTrip(trip.id)?.notes).toBe('Great trip')
  })

  it('returns the same record reference across calls until the next mutation', () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')

    expect(store.getTrip(trip.id)).toBe(store.getTrip(trip.id))
  })

  it('#147: still loads a record written before status was derived, ignoring its stale stored value', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 8)) // 8 Aug 2026
    try {
      const storage = fakeStorage()
      const store = new LocalTripStore(storage)
      const trip = store.createTrip('Hokkaido')

      // A pre-#147 `trip.json`/index entry: `status: 'completed'`, sitting
      // next to dates that are now in the future.
      const legacyRecord = JSON.parse(storage.getItem(`cairn.trips.trip.${trip.id}`) as string)
      legacyRecord.status = 'completed'
      legacyRecord.startDate = '2026-08-14'
      legacyRecord.endDate = '2026-08-16'
      storage.setItem(`cairn.trips.trip.${trip.id}`, JSON.stringify(legacyRecord))
      const legacyIndex = JSON.parse(storage.getItem('cairn.trips.index') as string)
      legacyIndex[0].status = 'completed'
      legacyIndex[0].startDate = '2026-08-14'
      legacyIndex[0].endDate = '2026-08-16'
      storage.setItem('cairn.trips.index', JSON.stringify(legacyIndex))

      const reloaded = new LocalTripStore(storage)
      const record = reloaded.getTrip(trip.id)
      expect(record).not.toBeNull()
      expect(deriveTripStatus(record?.startDate ?? null, record?.endDate ?? null)).toBe('planned')
    } finally {
      vi.useRealTimers()
    }
  })

  describe('overview', () => {
    it('returns null for a trip whose overview has never been saved', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      expect(store.getOverview(trip.id)).toBeNull()
    })

    it('computes and persists a simplified LineString per track, notifying subscribers', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')
      const listener = vi.fn()
      store.subscribe(listener)

      store.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
      ])

      const overview = store.getOverview(trip.id)
      expect(overview?.type).toBe('FeatureCollection')
      expect(overview?.features).toHaveLength(1)
      expect(overview?.features[0].geometry.type).toBe('LineString')
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('saves an empty FeatureCollection for a trip with no tracks, not null', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [])

      const overview = store.getOverview(trip.id)
      expect(overview?.type).toBe('FeatureCollection')
      expect(overview?.features).toEqual([])
    })

    it('persists totals and the sidecar version stamp alongside the geometry (#225)', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121, elevation: 100 }] },
      ])

      const overview = store.getOverview(trip.id) as StoredOverview
      expect(overview.version).toBe(SIDECAR_VERSION)
      expect(overview.totals).not.toBeNull()
      expect(overview.totals?.distanceMeters).toBeGreaterThan(0)
    })

    it('persists null totals for a trip with no tracks, distinct from never having saved', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [])

      const overview = store.getOverview(trip.id) as StoredOverview
      expect(overview.version).toBe(SIDECAR_VERSION)
      expect(overview.totals).toBeNull()
    })

    it('overwrites a previously saved overview on a later save', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
      ])
      store.saveOverview(trip.id, [])

      expect(store.getOverview(trip.id)?.features).toHaveLength(0)
    })

    it('persists an overview across a reload of a new store over the same storage', () => {
      const storage = fakeStorage()
      const first = new LocalTripStore(storage)
      const trip = first.createTrip('Hokkaido')
      first.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
      ])

      const second = new LocalTripStore(storage)

      expect(second.getOverview(trip.id)?.features).toHaveLength(1)
    })

    it('removes the overview from storage when the trip is deleted', () => {
      const storage = fakeStorage()
      const store = new LocalTripStore(storage)
      const trip = store.createTrip('Hokkaido')
      store.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
      ])

      store.deleteTrip(trip.id)

      expect(storage.getItem(`cairn.trips.overview.${trip.id}`)).toBeNull()
      expect(store.getOverview(trip.id)).toBeNull()
    })

    it('treats a corrupted overview as missing rather than throwing', () => {
      const storage = fakeStorage()
      const store = new LocalTripStore(storage)
      const trip = store.createTrip('Hokkaido')
      storage.setItem(`cairn.trips.overview.${trip.id}`, 'not json')

      expect(store.getOverview(trip.id)).toBeNull()
    })

    it('treats a well-formed but non-FeatureCollection value as missing', () => {
      const storage = fakeStorage()
      const store = new LocalTripStore(storage)
      const trip = store.createTrip('Hokkaido')
      storage.setItem(`cairn.trips.overview.${trip.id}`, JSON.stringify({ oops: true }))

      expect(store.getOverview(trip.id)).toBeNull()
    })
  })

  describe('origin (#79)', () => {
    it('is null on a freshly created trip, before any overview is saved', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      expect(trip.origin).toBeNull()
      expect(store.getTrip(trip.id)?.origin).toBeNull()
    })

    it('saveOverview writes the first coordinate of the first track to both the record and the index', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
      ])

      expect(store.getTrip(trip.id)?.origin).toEqual({ lat: 37, lng: -122 })
      expect(store.getTrips().find((entry) => entry.id === trip.id)?.origin).toEqual({
        lat: 37,
        lng: -122,
      })
    })

    it('moves the origin to the new first track after a reorder', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }] },
        { name: 'Day 2', points: [{ lat: 51, lon: 0 }] },
      ])
      expect(store.getTrip(trip.id)?.origin).toEqual({ lat: 37, lng: -122 })

      // Reordering surfaces here as the flattened `tracks` argument arriving
      // in the new order — this store doesn't know about file order itself.
      store.saveOverview(trip.id, [
        { name: 'Day 2', points: [{ lat: 51, lon: 0 }] },
        { name: 'Day 1', points: [{ lat: 37, lon: -122 }] },
      ])
      expect(store.getTrip(trip.id)?.origin).toEqual({ lat: 51, lng: 0 })
    })

    it('clears the origin when a later save produces no geometry', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveOverview(trip.id, [{ name: 'Day 1', points: [{ lat: 37, lon: -122 }] }])
      expect(store.getTrip(trip.id)?.origin).not.toBeNull()

      store.saveOverview(trip.id, [])
      expect(store.getTrip(trip.id)?.origin).toBeNull()
    })

    it('persists the origin across a reload of a new store over the same storage', () => {
      const storage = fakeStorage()
      const first = new LocalTripStore(storage)
      const trip = first.createTrip('Hokkaido')
      first.saveOverview(trip.id, [{ name: 'Day 1', points: [{ lat: 37, lon: -122 }] }])

      const second = new LocalTripStore(storage)

      expect(second.getTrip(trip.id)?.origin).toEqual({ lat: 37, lng: -122 })
      expect(second.getTrips().find((entry) => entry.id === trip.id)?.origin).toEqual({
        lat: 37,
        lng: -122,
      })
    })
  })

  describe('cairnCount (#121)', () => {
    it('is null on a fresh trip — never counted, which is not zero', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      expect(trip.cairnCount).toBeNull()
      expect(store.getTrip(trip.id)?.cairnCount).toBeNull()
    })

    it('writes the count to both the record and the index', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveCairnCount(trip.id, 128)

      expect(store.getTrip(trip.id)?.cairnCount).toBe(128)
      expect(store.getTrips().find((entry) => entry.id === trip.id)?.cairnCount).toBe(128)
    })

    it('records a real zero, distinct from never having counted', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')

      store.saveCairnCount(trip.id, 0)

      expect(store.getTrip(trip.id)?.cairnCount).toBe(0)
    })

    it('notifies nobody when the count has not changed', () => {
      const store = new LocalTripStore(fakeStorage())
      const trip = store.createTrip('Hokkaido')
      store.saveCairnCount(trip.id, 4)
      const listener = vi.fn()
      store.subscribe(listener)

      // The caller is an effect on the trip face, handing over the same
      // number on every render — it must not churn the index.
      store.saveCairnCount(trip.id, 4)

      expect(listener).not.toHaveBeenCalled()
    })

    it('survives a reload, and a record written before the field reads as never counted', () => {
      const storage = fakeStorage()
      const store = new LocalTripStore(storage)
      const trip = store.createTrip('Hokkaido')
      store.saveCairnCount(trip.id, 12)

      expect(new LocalTripStore(storage).getTrip(trip.id)?.cairnCount).toBe(12)

      // A `trip.json`/index entry from before #121 carries no count at all.
      const legacy = JSON.parse(storage.getItem(`cairn.trips.trip.${trip.id}`) as string)
      delete legacy.cairnCount
      storage.setItem(`cairn.trips.trip.${trip.id}`, JSON.stringify(legacy))
      const index = JSON.parse(storage.getItem('cairn.trips.index') as string)
      delete index[0].cairnCount
      storage.setItem('cairn.trips.index', JSON.stringify(index))

      const reloaded = new LocalTripStore(storage)
      expect(reloaded.getTrip(trip.id)?.cairnCount).toBeNull()
      expect(reloaded.getTrips()[0].cairnCount).toBeNull()
    })
  })
})
