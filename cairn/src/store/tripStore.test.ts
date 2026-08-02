import { describe, expect, it, vi } from 'vitest'
import { LocalTripStore } from './tripStore'

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

describe('LocalTripStore', () => {
  it('starts empty', () => {
    const store = new LocalTripStore(fakeStorage())
    expect(store.getTrips()).toEqual([])
  })

  it('creates a trip, starting it in planned status, and notifies subscribers', () => {
    const store = new LocalTripStore(fakeStorage())
    const listener = vi.fn()
    store.subscribe(listener)

    const trip = store.createTrip('Hokkaido')

    expect(trip.name).toBe('Hokkaido')
    expect(trip.status).toBe('planned')
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
      status: 'planned',
      notes: '',
    })
  })

  it('applies a partial edit, notifies subscribers, and reflects it in both the record and the index', () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')
    const listener = vi.fn()
    store.subscribe(listener)

    const updated = store.updateTrip(trip.id, { status: 'completed', notes: 'Great trip' })

    expect(updated).toMatchObject({ status: 'completed', notes: 'Great trip', name: 'Hokkaido' })
    expect(store.getTrip(trip.id)).toMatchObject({ status: 'completed', notes: 'Great trip' })
    expect(store.getTrips()[0]).toMatchObject({ status: 'completed' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('returns null from updateTrip for a trip that does not exist', () => {
    const store = new LocalTripStore(fakeStorage())

    expect(store.updateTrip('no-such-id', { notes: 'x' })).toBeNull()
  })

  it('discards an edit that would save an empty name, leaving the prior name in place', () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')

    const updated = store.updateTrip(trip.id, { name: '   ' })

    expect(updated?.name).toBe('Hokkaido')
  })

  it('persists an update across a reload of a new store over the same storage', () => {
    const storage = fakeStorage()
    const first = new LocalTripStore(storage)
    const trip = first.createTrip('Hokkaido')
    first.updateTrip(trip.id, { notes: 'Great trip' })

    const second = new LocalTripStore(storage)

    expect(second.getTrip(trip.id)?.notes).toBe('Great trip')
  })

  it('returns the same record reference across calls until the next mutation', () => {
    const store = new LocalTripStore(fakeStorage())
    const trip = store.createTrip('Hokkaido')

    expect(store.getTrip(trip.id)).toBe(store.getTrip(trip.id))
  })
})
