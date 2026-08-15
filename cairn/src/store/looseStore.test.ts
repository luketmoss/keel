import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAIRN_ICON_LABEL,
  cairnDefaultName,
  canChangeOwner,
  LocalLooseStore,
  looseMetaLine,
  moveLooseIntoTrip,
  showExport,
  type CairnIcon,
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

  it('keeps a cairn with its EXIF position', () => {
    const cairn = store.addCairn({
      name: 'sapporo.jpg',
      date: '2024-11-03T00:00:00.000Z',
      position: { lat: 43, lng: 141 },
      positionSource: 'exif',
    })

    expect(store.getItem(cairn.id)).toMatchObject({ kind: 'cairn', position: { lat: 43, lng: 141 } })
  })

  it('a cairn always carries a position — there is no unplaced state', () => {
    const cairn = store.addCairn({
      name: 'placed.jpg',
      date: null,
      position: { lat: 1, lng: 2 },
      positionSource: 'placed',
    })

    expect(store.getItem(cairn.id)?.position).toEqual({ lat: 1, lng: 2 })
  })

  it('image is both Drive ids, or neither, never one of the two', () => {
    const withImage = store.addCairn({
      name: 'a.jpg',
      date: null,
      position: { lat: 1, lng: 2 },
      positionSource: 'exif',
      image: { originalDriveFileId: 'orig', thumbnailDriveFileId: 'thumb' },
    })
    const iconOnly = store.addCairn({
      name: 'campsite',
      date: null,
      position: { lat: 1, lng: 2 },
      positionSource: 'placed',
      icon: 'campsite',
    })

    const readImage = store.getItem(withImage.id)
    expect(readImage?.kind === 'cairn' ? readImage.image : undefined).toEqual({
      originalDriveFileId: 'orig',
      thumbnailDriveFileId: 'thumb',
    })
    const readIconOnly = store.getItem(iconOnly.id)
    expect(readIconOnly?.kind === 'cairn' ? readIconOnly.image : undefined).toBeNull()
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

  it('carries every cairn field through a reload, unchanged', () => {
    const storage = fakeStorage()
    const first = new LocalLooseStore(storage)
    const record = first.addCairn({
      name: 'sapporo.jpg',
      date: '2024-11-03T00:00:00.000Z',
      position: { lat: 43, lng: 141 },
      positionSource: 'placed',
      icon: 'campsite',
      image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
      description: 'A good spot.',
    })

    const reloaded = new LocalLooseStore(storage).getItem(record.id)

    expect(reloaded).toMatchObject({
      id: record.id,
      name: 'sapporo.jpg',
      position: { lat: 43, lng: 141 },
      positionSource: 'placed',
      icon: 'campsite',
      image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
      description: 'A good spot.',
      date: '2024-11-03T00:00:00.000Z',
    })
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

    it('renames a cairn', async () => {
      const cairn = store.addCairn({ name: 'a.jpg', date: null, position: { lat: 1, lng: 2 }, positionSource: 'exif' })

      expect(await store.update(cairn.id, { name: 'sapporo.jpg' })).toBe(true)

      expect(store.getItem(cairn.id)?.name).toBe('sapporo.jpg')
    })

    // A cairn has no colour to change — the field is simply ignored rather
    // than producing an error, since the UI never offers the control for
    // one in the first place.
    it('ignores a colour patch sent for a cairn', async () => {
      const cairn = store.addCairn({ name: 'a.jpg', date: null, position: { lat: 1, lng: 2 }, positionSource: 'exif' })

      expect(await store.update(cairn.id, { colorIndex: 3 })).toBe(true)

      expect(store.getItem(cairn.id)).not.toHaveProperty('colorIndex')
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

  /* #156's retype. The guarantee under test is not that `icon` changes —
     that much is obvious — but that nothing else does: the whole point of
     retyping a photo as a campsite is that it keeps its image, its
     position and its date while doing so. */
  describe('update — retyping a cairn (#156)', () => {
    function photoCairn() {
      return store.addCairn({
        name: 'sapporo.jpg',
        date: '2024-11-03T00:00:00.000Z',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
      })
    }

    it('sets a cairn’s icon', async () => {
      const cairn = photoCairn()

      expect(await store.update(cairn.id, { icon: 'campsite' })).toBe(true)

      expect((store.getItem(cairn.id) as { icon: string | null }).icon).toBe('campsite')
    })

    it('changes only the icon — image, position, source and date survive', async () => {
      const cairn = photoCairn()

      await store.update(cairn.id, { icon: 'campsite' })

      expect(store.getItem(cairn.id)).toEqual({ ...cairn, icon: 'campsite' })
    })

    it('clears an icon back to none, which is a change and not an absent field', async () => {
      const cairn = store.addCairn({
        name: 'camp',
        date: null,
        position: { lat: 1, lng: 2 },
        positionSource: 'placed',
        icon: 'campsite',
      })

      expect(await store.update(cairn.id, { icon: null })).toBe(true)

      expect((store.getItem(cairn.id) as { icon: string | null }).icon).toBeNull()
    })

    it('ignores an icon patch sent for a track', async () => {
      const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

      expect(await store.update(record.id, { icon: 'campsite' })).toBe(true)

      expect(store.getItem(record.id)).not.toHaveProperty('icon')
    })
  })
})

/* `cairns.md`: "An empty name commits the icon's label (`Campsite`), or
   `Cairn` with no icon". */
describe('cairnDefaultName (#156)', () => {
  it('names an icon-less cairn Cairn', () => {
    expect(cairnDefaultName(null)).toBe('Cairn')
  })

  it('names a cairn after its icon, capitalised', () => {
    expect(cairnDefaultName('campsite')).toBe('Campsite')
    expect(cairnDefaultName('water')).toBe('Water')
    expect(cairnDefaultName('junction')).toBe('Junction')
  })

  it('has a name for every icon in the set', () => {
    for (const icon of Object.keys(CAIRN_ICON_LABEL) as CairnIcon[]) {
      expect(cairnDefaultName(icon)).toMatch(/^[A-Z]/)
    }
  })
})

describe('moveLooseIntoTrip', () => {
  /* #150: the trip-overrides side of the move. The real one writes a
     display-name override onto the destination trip; here it only records
     what it was asked to carry, which is what these tests are about. */
  let carried: { tripId: string; driveFileId: string; name: string }[]
  const carryName = async (tripId: string, driveFileId: string, name: string) => {
    carried.push({ tripId, driveFileId, name })
  }

  beforeEach(() => {
    carried = []
  })

  it('takes the item out of the loose store and its geometry into the trip', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const record = store.addTrack(NEW_TRACK, [
      track([
        [10, 20],
        [11, 21],
      ]),
    ])

    const moved = await moveLooseIntoTrip(store, trips, record.id, trip.id, carryName)

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
    await moveLooseIntoTrip(store, trips, record.id, trip.id, carryName)

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
    await moveLooseIntoTrip(store, trips, record.id, trip.id, carryName)

    expect(trips.getTrip(trip.id)?.origin).toEqual({ lat: 10, lng: 20 })
  })

  function looseCairn(overrides: Partial<Parameters<LocalLooseStore['addCairn']>[0]> = {}) {
    return store.addCairn({
      name: 'a.jpg',
      date: null,
      position: { lat: 1, lng: 2 },
      positionSource: 'exif',
      ...overrides,
    })
  }

  it('moves a cairn without touching the trip geometry', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const cairn = looseCairn()

    expect(await moveLooseIntoTrip(store, trips, cairn.id, trip.id, carryName)).toBe(true)
    expect(store.getItems()).toHaveLength(0)
    expect(trips.getOverview(trip.id)).toBeNull()
  })

  it('leaves everything alone when the id names nothing', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    store.addTrack(NEW_TRACK, [track([[1, 2]])])

    expect(await moveLooseIntoTrip(store, trips, 'no-such-id', trip.id, carryName)).toBe(false)
    expect(store.getItems()).toHaveLength(1)
  })

  // #130: a cairn moved into a trip that is not open has nothing else
  // listing `trips/<id>/cairns/` to notice the count changed.
  it('raises the destination trip cairn count by one when it is already known', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.saveCairnCount(trip.id, 4)
    const cairn = looseCairn()

    await moveLooseIntoTrip(store, trips, cairn.id, trip.id, carryName)

    expect(trips.getTrip(trip.id)?.cairnCount).toBe(5)
    // The index entry, not just the full record — this is what App's
    // `tripChoices` reads to build the picker's `TripChoice[]`, so this is
    // what actually makes the picker show the raised count.
    expect(trips.getTrips().find((entry) => entry.id === trip.id)?.cairnCount).toBe(5)
  })

  it('leaves an uncounted trip uncounted rather than treating null as zero', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    expect(trips.getTrip(trip.id)?.cairnCount).toBeNull()
    const cairn = looseCairn()

    await moveLooseIntoTrip(store, trips, cairn.id, trip.id, carryName)

    expect(trips.getTrip(trip.id)?.cairnCount).toBeNull()
  })

  it('leaves the cairn count untouched when a track moves', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.saveCairnCount(trip.id, 4)
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

    await moveLooseIntoTrip(store, trips, record.id, trip.id, carryName)

    expect(trips.getTrip(trip.id)?.cairnCount).toBe(4)
  })

  it('leaves the destination cairn count untouched when the move fails', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    trips.saveCairnCount(trip.id, 4)
    const cairn = looseCairn()
    const failing = { ...store, moveIntoTrip: async () => false }

    expect(await moveLooseIntoTrip(failing, trips, cairn.id, trip.id, carryName)).toBe(false)
    expect(trips.getTrip(trip.id)?.cairnCount).toBe(4)
  })

  // #150: a track's name is stored by whichever trip owns it, so the move
  // has to hand it over or the track arrives showing its filename.
  it('carries the track name into the destination trip', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const record = store.addTrack(
      { ...NEW_TRACK, name: 'Snowdon ridge', driveFileId: 'drive-1' },
      [track([[1, 2]])],
    )

    await moveLooseIntoTrip(store, trips, record.id, trip.id, carryName)

    expect(carried).toEqual([
      { tripId: trip.id, driveFileId: 'drive-1', name: 'Snowdon ridge' },
    ])
  })

  it('carries nothing for a track whose source was never kept', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    // No `driveFileId`: there is no file in the trip's folder to key a name
    // against, and the geometry still arrives through the overview merge.
    const record = store.addTrack(NEW_TRACK, [track([[1, 2]])])

    await moveLooseIntoTrip(store, trips, record.id, trip.id, carryName)

    expect(carried).toEqual([])
  })

  it('carries nothing for a cairn, whose name travels inside its own folder', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const cairn = looseCairn()

    await moveLooseIntoTrip(store, trips, cairn.id, trip.id, carryName)

    expect(carried).toEqual([])
  })

  it('carries nothing when the move itself failed', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const record = store.addTrack({ ...NEW_TRACK, driveFileId: 'drive-1' }, [track([[1, 2]])])
    const failing = { ...store, moveIntoTrip: async () => false }

    expect(await moveLooseIntoTrip(failing, trips, record.id, trip.id, carryName)).toBe(false)

    expect(carried).toEqual([])
  })

  // The file has already moved by the time the name is written, so a failure
  // here cannot un-move it. Reporting the move as failed would describe a
  // move that plainly did happen.
  it('still reports the move as done when carrying the name fails', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const record = store.addTrack({ ...NEW_TRACK, driveFileId: 'drive-1' }, [track([[1, 2]])])

    const moved = await moveLooseIntoTrip(store, trips, record.id, trip.id, async () => {
      throw new Error('Drive said no')
    })

    expect(moved).toBe(true)
    expect(store.getItems()).toHaveLength(0)
  })

  it('leaves a different trip cairn count untouched', async () => {
    const trips = new LocalTripStore(fakeStorage())
    const trip = trips.createTrip('Larapinta')
    const other = trips.createTrip('Overland Track')
    trips.saveCairnCount(trip.id, 4)
    trips.saveCairnCount(other.id, 9)
    const cairn = looseCairn()

    await moveLooseIntoTrip(store, trips, cairn.id, trip.id, carryName)

    expect(trips.getTrip(other.id)?.cairnCount).toBe(9)
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

  it('names a photo-only cairn by "photo", and an icon one by its label', () => {
    const photo = store.addCairn({
      name: 'a.jpg',
      date: '2024-11-03T00:00:00.000Z',
      position: { lat: 1, lng: 2 },
      positionSource: 'exif',
      image: { originalDriveFileId: 'o', thumbnailDriveFileId: 't' },
    })
    const campsite = store.addCairn({
      name: 'Camp',
      date: '2023-06-13T00:00:00.000Z',
      position: { lat: 1, lng: 2 },
      positionSource: 'placed',
      icon: 'campsite',
    })
    const both = store.addCairn({
      name: 'Camp with a view',
      date: '2023-06-13T00:00:00.000Z',
      position: { lat: 1, lng: 2 },
      positionSource: 'placed',
      icon: 'campsite',
      image: { originalDriveFileId: 'o', thumbnailDriveFileId: 't' },
    })
    const neither = store.addCairn({
      name: 'Junction',
      date: null,
      position: { lat: 1, lng: 2 },
      positionSource: 'placed',
    })

    expect(looseMetaLine(photo, asIs)).toBe('2024-11-03 · photo')
    expect(looseMetaLine(campsite, asIs)).toBe('2023-06-13 · campsite')
    expect(looseMetaLine(both, asIs)).toBe('2023-06-13 · campsite · photo')
    expect(looseMetaLine(neither, asIs)).toBe('undated · cairn')
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

  it('gates a cairn on its image, and omits it for an icon-only cairn', () => {
    const record = store.addCairn({
      name: 'sapporo.jpg',
      date: '2024-11-03T00:00:00.000Z',
      position: { lat: 43, lng: 141 },
      positionSource: 'exif',
    })

    expect(
      showExport({
        ...record,
        uploadState: 'ok',
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
      }),
    ).toBe(true)
    expect(showExport({ ...record, uploadState: 'ok', image: null })).toBe(false)
  })
})
