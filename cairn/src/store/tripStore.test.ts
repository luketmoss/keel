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
})
