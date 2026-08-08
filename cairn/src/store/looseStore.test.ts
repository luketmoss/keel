import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canChangeOwner,
  LocalLooseStore,
  looseMetaLine,
  moveLooseIntoTrip,
  showExport,
} from './looseStore'
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

  describe('update (#133)', () => {
    it('renames a track', async () => {
      const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

      expect(await store.update(record.id, { name: 'Mount Rosea East' })).toBe(true)

      expect(store.getItem(record.id)?.name).toBe('Mount Rosea East')
    })

    it('recolours a track', async () => {
      const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

      expect(await store.update(record.id, { colorIndex: 3 })).toBe(true)

      expect((store.getItem(record.id) as { colorIndex: number }).colorIndex).toBe(3)
    })

    it('renames a photo', async () => {
      const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: null })

      expect(await store.update(photo.id, { name: 'sapporo.jpg' })).toBe(true)

      expect(store.getItem(photo.id)?.name).toBe('sapporo.jpg')
    })

    // A photo has no colour to change — the field is simply ignored rather
    // than producing an error, since the UI never offers the control for
    // one in the first place.
    it('ignores a colour patch sent for a photo', async () => {
      const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: null })

      expect(await store.update(photo.id, { colorIndex: 3 })).toBe(true)

      expect(store.getItem(photo.id)).not.toHaveProperty('colorIndex')
    })

    it('cancels an empty or whitespace-only rename rather than saving it', async () => {
      const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

      expect(await store.update(record.id, { name: '   ' })).toBe(true)

      expect(store.getItem(record.id)?.name).toBe(NEW_TRACK.name)
    })

    it('trims a rename', async () => {
      const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

      await store.update(record.id, { name: '  Rosea  ' })

      expect(store.getItem(record.id)?.name).toBe('Rosea')
    })

    it('resolves false when the id names nothing', async () => {
      expect(await store.update('no-such-id', { name: 'x' })).toBe(false)
    })

    it('leaves every other item untouched', async () => {
      const a = store.addTrack({ ...NEW_TRACK, name: 'A' }, [track([[1, 2]])])
      const b = store.addTrack({ ...NEW_TRACK, name: 'B' }, [track([[3, 4]])])

      await store.update(a.id, { name: 'A renamed' })

      expect(store.getItem(b.id)?.name).toBe('B')
    })

    it('notifies subscribers', async () => {
      const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])
      const listener = vi.fn()
      store.subscribe(listener)

      await store.update(record.id, { name: 'Renamed' })

      expect(listener).toHaveBeenCalled()
    })
  })
})

describe('moveLooseIntoTrip', () => {
  it('takes the item out of the loose store and its geometry into the trip', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const record = store.addTrack(NEW_TRACK, [
      track([
        [10, 20],
        [11, 21],
      ]),
    ])

    const moved = await moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(moved).toBe(true)
    // It leaves the top-level list and map...
    expect(store.getItems()).toHaveLength(0)
    // ...and turns up inside the trip.
    expect(trips.getOverview(trip.id)?.features.length).toBeGreaterThan(0)
  })

  it('adds to what the trip already has rather than replacing it', async () => {
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
    await moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(trips.getOverview(trip.id)?.features.length).toBe(before + 1)
  })

  it('gives the trip a dot once it holds geometry', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    expect(trips.getTrip(trip.id)?.origin).toBeNull()

    const record = store.addTrack(NEW_TRACK, [
      track([
        [10, 20],
        [11, 21],
      ]),
    ])
    await moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(trips.getTrip(trip.id)?.origin).toEqual({ lat: 10, lng: 20 })
  })

  it('moves a photo without touching the trip geometry', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: { lat: 1, lng: 2 } })

    expect(await moveLooseIntoTrip(store, trips, photo.id, trip.id)).toBe(true)
    expect(store.getItems()).toHaveLength(0)
    expect(trips.getOverview(trip.id)).toBeNull()
  })

  it('leaves everything alone when the id names nothing', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    store.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(await moveLooseIntoTrip(store, trips, 'no-such-id', trip.id)).toBe(false)
    expect(store.getItems()).toHaveLength(1)
  })

  // #130: a photo moved into a trip that is not open has nothing else
  // reading its photos.json to notice the count changed.
  it('raises the destination trip photo count by one when it is already known', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.savePhotoCount(trip.id, 4)
    const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: { lat: 1, lng: 2 } })

    await moveLooseIntoTrip(store, trips, photo.id, trip.id)

    expect(trips.getTrip(trip.id)?.photoCount).toBe(5)
    // The index entry, not just the full record — this is what App's
    // `tripChoices` reads to build the picker's `TripChoice[]`, so this is
    // what actually makes the picker show the raised count.
    expect(trips.getTrips().find((entry) => entry.id === trip.id)?.photoCount).toBe(5)
  })

  it('leaves an uncounted trip uncounted rather than treating null as zero', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    expect(trips.getTrip(trip.id)?.photoCount).toBeNull()
    const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: { lat: 1, lng: 2 } })

    await moveLooseIntoTrip(store, trips, photo.id, trip.id)

    expect(trips.getTrip(trip.id)?.photoCount).toBeNull()
  })

  it('leaves the photo count untouched when a track moves', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.savePhotoCount(trip.id, 4)
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

    await moveLooseIntoTrip(store, trips, record.id, trip.id)

    expect(trips.getTrip(trip.id)?.photoCount).toBe(4)
  })

  it('leaves the destination photo count untouched when the move fails', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.savePhotoCount(trip.id, 4)
    const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: { lat: 1, lng: 2 } })
    const failing = { ...store, moveIntoTrip: async () => false }

    expect(await moveLooseIntoTrip(failing, trips, photo.id, trip.id)).toBe(false)
    expect(trips.getTrip(trip.id)?.photoCount).toBe(4)
  })

  it('leaves a different trip photo count untouched', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const other = trips.createTrip('Overland Track')
    trips.savePhotoCount(trip.id, 4)
    trips.savePhotoCount(other.id, 9)
    const photo = store.addPhoto({ name: 'a.jpg', takenAt: null, position: { lat: 1, lng: 2 } })

    await moveLooseIntoTrip(store, trips, photo.id, trip.id)

    expect(trips.getTrip(other.id)?.photoCount).toBe(9)
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

  // #120 — the row is honest about where its file is, and those two states
  // replace the line rather than crowding into it. A track's distance does
  // not help a user whose track is not backed up.
  it('says it is uploading, and says when it never arrived', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])
    const item = store.getItem(record.id)!

    expect(looseMetaLine({ ...item, uploadState: 'uploading' }, asIs)).toBe('uploading…')
    expect(looseMetaLine({ ...item, uploadState: 'failed' }, asIs)).toBe('not on Drive')
    // Nothing has been attempted for a record written before this issue —
    // it is not uploading and has not failed, so it reads as itself.
    expect(looseMetaLine({ ...item, uploadState: 'pending' }, asIs)).toContain('2024-03-09')
  })
})

describe('canChangeOwner', () => {
  it('refuses a move while there is nothing in Drive to move', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])
    const item = store.getItem(record.id)!

    expect(canChangeOwner({ ...item, uploadState: 'uploading' })).toBe(false)
    expect(canChangeOwner({ ...item, uploadState: 'failed' })).toBe(false)
    expect(canChangeOwner({ ...item, uploadState: 'ok' })).toBe(true)
  })
})

describe('showExport (#140)', () => {
  it('shows Export, disabled, while uploading or failed — even with no file id yet', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(showExport({ ...record, uploadState: 'uploading', driveFileId: null })).toBe(true)
    expect(showExport({ ...record, uploadState: 'failed', driveFileId: null })).toBe(true)
  })

  it('omits Export for an ok track with no source file — the pre-#120 migration case', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(showExport({ ...record, uploadState: 'ok', driveFileId: null })).toBe(false)
  })

  it('shows Export for an ok track once its source file is on Drive', () => {
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(showExport({ ...record, uploadState: 'ok', driveFileId: 'file-1' })).toBe(true)
  })

  it('gates a photo on originalDriveFileId, not thumbnailDriveFileId', () => {
    const record = store.addPhoto({
      name: 'sapporo.jpg',
      takenAt: '2024-11-03T00:00:00.000Z',
      position: { lat: 43, lng: 141 },
    })

    expect(
      showExport({
        ...record,
        uploadState: 'ok',
        originalDriveFileId: null,
        thumbnailDriveFileId: 'thumb-1',
      }),
    ).toBe(false)
    expect(
      showExport({
        ...record,
        uploadState: 'ok',
        originalDriveFileId: 'orig-1',
        thumbnailDriveFileId: null,
      }),
    ).toBe(true)
  })
})
