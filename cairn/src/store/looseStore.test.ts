import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalLooseStore, looseMetaLine, moveLooseIntoTrip } from './looseStore'
import { LocalTripStore } from './tripStore'
import type { Track } from '../kml/parse'
import { formatDistance, formatElevationGain } from '../format/units'

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

function track(points: [number, number][]): Track {
  return { name: 'day', points: points.map(([lat, lon]) => ({ lat, lon })) }
}

const NEW_TRACK = {
  name: 'Mount Rosea',
  date: '2024-03-09T00:00:00.000Z',
  distanceMeters: 14200,
  ascentMeters: 690,
  pointCount: 512,
  sourceName: 'rosea.kml',
  colorIndex: 0,
  position: { lat: -37, lng: 142 },
}

let store: LocalLooseStore

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) })
  store = new LocalLooseStore(fakeStorage())
})

describe('LocalLooseStore', () => {
  it('keeps a track that belongs to no trip, newest first', () => {
    store.addTrack({ ...NEW_TRACK, name: 'First' }, [track([[1, 2]])])
    store.addTrack({ ...NEW_TRACK, name: 'Second' }, [track([[3, 4]])])

    expect(store.getItems().map((item) => item.name)).toEqual(['Second', 'First'])
    expect(store.getItems().every((item) => item.kind === 'track')).toBe(true)
  })

  it('keeps a photo with its EXIF position', () => {
    const photo = store.addPhoto({
      name: 'sapporo.jpg',
      takenAt: '2024-11-03T00:00:00.000Z',
      position: { lat: 43, lng: 141 },
    })

    expect(store.getItem(photo.id)).toMatchObject({ kind: 'photo', position: { lat: 43, lng: 141 } })
  })

  it('keeps a photo that has no GPS, without a position', () => {
    const photo = store.addPhoto({ name: 'no-gps.jpg', takenAt: null, position: null })

    // It lists, it just does not draw. Losing it would be worse than not
    // placing it.
    expect(store.getItems()).toHaveLength(1)
    expect(store.getItem(photo.id)?.position).toBeNull()
  })

  it('writes a loose track its own overview, so the map never reads a source KML', () => {
    const record = store.addTrack(NEW_TRACK, [
      track([
        [1, 2],
        [3, 4],
      ]),
    ])

    const overview = store.getOverview(record.id)
    expect(overview?.type).toBe('FeatureCollection')
    expect(overview?.features.length).toBeGreaterThan(0)
  })

  it('derives the track position from its geometry rather than trusting the caller', () => {
    const record = store.addTrack(
      { ...NEW_TRACK, position: { lat: 999, lng: 999 } },
      [
        track([
          [10, 20],
          [30, 40],
        ]),
      ],
    )

    expect(store.getItem(record.id)?.position).toEqual({ lat: 10, lng: 20 })
  })

  it('deleting removes the record and its overview', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])
    store.remove(record.id)

    expect(store.getItems()).toHaveLength(0)
    expect(store.getOverview(record.id)).toBeNull()
  })

  it('notifies subscribers on every mutation', () => {
    const listener = vi.fn()
    store.subscribe(listener)

    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])
    store.remove(record.id)

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('survives a reload through storage', () => {
    const storage = fakeStorage()
    const first = new LocalLooseStore(storage)
    first.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(new LocalLooseStore(storage).getItems()).toHaveLength(1)
  })

  it('treats a corrupted index as empty rather than throwing', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.loose.index', 'not json')

    expect(new LocalLooseStore(storage).getItems()).toEqual([])
  })
})

describe('moveLooseIntoTrip', () => {
  it('takes the item out of the loose store and its geometry into the trip', () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const record = store.addTrack(NEW_TRACK, [
      track([
        [10, 20],
        [11, 21],
      ]),
    ])

    const moved = moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(moved).toBe(true)
    // It leaves the top-level list and map...
    expect(store.getItems()).toHaveLength(0)
    // ...and turns up inside the trip.
    expect(trips.getOverview(trip.id)?.features.length).toBeGreaterThan(0)
  })

  it('adds to what the trip already has rather than replacing it', () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.saveOverview(trip.id, [
      track([
        [1, 1],
        [2, 2],
      ]),
    ])
    const before = trips.getOverview(trip.id)?.features.length ?? 0

    const record = store.addTrack(NEW_TRACK, [
      track([
        [10, 20],
        [11, 21],
      ]),
    ])
    moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(trips.getOverview(trip.id)?.features.length).toBe(before + 1)
  })

  it('gives the trip a dot once it holds geometry', () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    expect(trips.getTrip(trip.id)?.origin).toBeNull()

    const record = store.addTrack(NEW_TRACK, [
      track([
        [10, 20],
        [11, 21],
      ]),
    ])
    moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(trips.getTrip(trip.id)?.origin).toEqual({ lat: 10, lng: 20 })
  })

  it('moves a photo without touching the trip geometry', () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: { lat: 1, lng: 2 } })

    expect(moveLooseIntoTrip(store, trips, photo.id, trip.id)).toBe(true)
    expect(store.getItems()).toHaveLength(0)
    expect(trips.getOverview(trip.id)).toBeNull()
  })

  it('leaves everything alone when the id names nothing', () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    store.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(moveLooseIntoTrip(store, trips, 'no-such-id', trip.id)).toBe(false)
    expect(store.getItems()).toHaveLength(1)
  })
})

describe('looseMetaLine', () => {
  const asIs = (iso: string) => iso.slice(0, 10)

  it('gives a track its date, distance and ascent', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])
    expect(looseMetaLine(store.getItem(record.id)!, asIs)).toBe(
      `2024-03-09 · ${formatDistance(14200)} · ${formatElevationGain(690)}`,
    )
  })

  it('omits ascent when the source has no elevation at all', () => {
    const record = store.addTrack({ ...NEW_TRACK, ascentMeters: null }, [track([[1, 2]])])
    expect(looseMetaLine(store.getItem(record.id)!, asIs)).toBe(
      `2024-03-09 · ${formatDistance(14200)}`,
    )
  })

  it('names a placed photo by kind and an unplaced one by what it lacks', () => {
    const placed = store.addPhoto({
      name: 'a.jpg',
      takenAt: '2024-11-03T00:00:00.000Z',
      position: { lat: 1, lng: 2 },
    })
    const unplaced = store.addPhoto({ name: 'b.jpg', takenAt: '1998-01-01T00:00:00.000Z', position: null })

    expect(looseMetaLine(placed, asIs)).toBe('2024-11-03 · photo')
    expect(looseMetaLine(unplaced, asIs)).toBe('1998-01-01 · no location')
  })

  it('says so rather than inventing a date for an undated item', () => {
    const record = store.addTrack({ ...NEW_TRACK, date: null }, [track([[1, 2]])])
    expect(looseMetaLine(store.getItem(record.id)!, asIs)).toContain('undated')
  })
})
