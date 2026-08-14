import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLooseImport } from './useLooseImport'
import { LocalLooseStore } from '../store/looseStore'
import type { PhotoRecord } from '../photo/photoIndex'

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

function kmlFixture(name: string, as = name): File {
  return new File([readFileSync(join(__dirname, '..', 'kml', 'fixtures', name))], as)
}

function photoFixture(name: string, as = name): File {
  return new File([readFileSync(join(__dirname, '..', 'photo', 'fixtures', name))], as)
}

let store: LocalLooseStore

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) })
  store = new LocalLooseStore(fakeStorage())
})

function importer() {
  return renderHook(() => useLooseImport(store)).result.current
}

describe('useLooseImport', () => {
  it('imports a dropped KML as one loose track, with its stats', async () => {
    const rejections = await importer().importFiles([kmlFixture('linestring.kml', 'day1.kml')])

    expect(rejections).toEqual([])
    const items = store.getItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'track', sourceName: 'day1.kml' })
    expect((items[0] as { distanceMeters: number }).distanceMeters).toBeGreaterThan(0)
  })

  it('treats a multi-placemark file as one thing, not several', async () => {
    await importer().importFiles([kmlFixture('multi-placemark.kml')])

    // One dropped file is one row — a KML with three placemarks is one day
    // out, not three things to keep apart.
    expect(store.getItems()).toHaveLength(1)
  })

  it('gives the loose track its own overview, so the map never reads the KML', async () => {
    await importer().importFiles([kmlFixture('linestring.kml')])

    const record = store.getItems()[0]
    expect(store.getOverview(record.id)?.features.length).toBeGreaterThan(0)
  })

  it('places a loose track at the first point of its geometry', async () => {
    await importer().importFiles([kmlFixture('linestring.kml')])

    expect(store.getItems()[0].position).not.toBeNull()
  })

  it('cycles the palette so two tracks dropped together differ in colour', async () => {
    await importer().importFiles([
      kmlFixture('linestring.kml', 'a.kml'),
      kmlFixture('linestring.kml', 'b.kml'),
    ])

    const colours = store.getItems().map((item) => (item as { colorIndex: number }).colorIndex)
    expect(new Set(colours).size).toBe(2)
  })

  it('imports a photo with GPS as a placed loose photo', async () => {
    await importer().importFiles([photoFixture('gps-and-timestamps.jpg')])

    const items = store.getItems()
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('photo')
    expect(items[0].position).not.toBeNull()
  })

  it('keeps a photo with no GPS, unplaced rather than rejected', async () => {
    await importer().importFiles([photoFixture('gps-stripped.jpg')])

    const items = store.getItems()
    expect(items).toHaveLength(1)
    // It lists, it does not draw. Losing it would be worse than not
    // placing it.
    expect(items[0].position).toBeNull()
  })

  it('rejects a file it cannot identify, by name, importing nothing for it', async () => {
    const rejections = await importer().importFiles([new File(['x'], 'notes.txt')])

    expect(rejections).toHaveLength(1)
    expect(rejections[0].message).toContain('notes.txt')
    expect(store.getItems()).toHaveLength(0)
  })

  it('rejects a KML with no track without blocking the rest of the drop', async () => {
    const rejections = await importer().importFiles([
      kmlFixture('no-track.kml'),
      kmlFixture('linestring.kml', 'good.kml'),
    ])

    expect(rejections).toHaveLength(1)
    expect(store.getItems()).toHaveLength(1)
    expect(store.getItems()[0].name).not.toContain('no-track')
  })

  it('adds already-parsed tracks without re-reading the file (the draft s Keep loose)', () => {
    importer().addParsedTracks('day1.kml', [
      {
        name: 'Day one',
        points: [
          { lat: 1, lon: 2 },
          { lat: 3, lon: 4 },
        ],
      },
    ])

    expect(store.getItems()).toMatchObject([
      { kind: 'track', name: 'Day one', sourceName: 'day1.kml' },
    ])
  })

  it('ignores a Keep loose with nothing parsed', () => {
    importer().addParsedTracks('empty.kml', [])
    expect(store.getItems()).toHaveLength(0)
  })

  /* #150: `Remove from trip` passes the name the user gave the track inside
     its trip. The KML's own track name is a derivation and loses to it —
     that derivation winning is what dropped the name on the way out. */
  describe('a name the user chose (#150)', () => {
    const tracks = [{ name: 'Day one', points: [{ lat: 1, lon: 2 }] }]

    it('takes the given name over the one in the KML', () => {
      importer().addParsedTracks('day1.kml', tracks, { name: 'Snowdon ridge' })

      expect(store.getItems()).toMatchObject([
        { kind: 'track', name: 'Snowdon ridge', sourceName: 'day1.kml' },
      ])
    })

    it('derives the name as before when none is given', () => {
      importer().addParsedTracks('day1.kml', tracks)

      expect(store.getItems()[0].name).toBe('Day one')
    })

    it('falls back to the filename when neither is available', () => {
      importer().addParsedTracks('day1.kml', [{ name: '', points: [{ lat: 1, lon: 2 }] }])

      expect(store.getItems()[0].name).toBe('day1')
    })

    // Same rule the stores apply to a rename: an empty value is an aborted
    // edit, not a saved one, so it must not become the track's name.
    it('ignores a blank name and derives instead', () => {
      importer().addParsedTracks('day1.kml', tracks, { name: '   ' })

      expect(store.getItems()[0].name).toBe('Day one')
    })
  })

  describe('addPhotoFromTrip (#132)', () => {
    function tripPhoto(overrides: Partial<PhotoRecord> = {}): PhotoRecord {
      return {
        id: 'ignored-on-the-way-in',
        name: 'sapporo.jpg',
        originalDriveFileId: 'trip-orig-1',
        thumbnailDriveFileId: 'trip-thumb-1',
        gpsTimestamp: '2024-11-03T00:00:00.000Z',
        dateTimeOriginal: '2024-11-03T09:00:00',
        latitude: 43,
        longitude: 141,
        ...overrides,
      }
    }

    it("carries a trip photo's ids and EXIF fields into a loose record, for Remove from trip", () => {
      const record = importer().addPhotoFromTrip(tripPhoto())

      expect(record).toMatchObject({
        kind: 'photo',
        name: 'sapporo.jpg',
        originalDriveFileId: 'trip-orig-1',
        thumbnailDriveFileId: 'trip-thumb-1',
        // #50's two timestamps survive the move rather than being
        // collapsed, exactly as they do going the other direction.
        gpsTimestamp: '2024-11-03T00:00:00.000Z',
        dateTimeOriginal: '2024-11-03T09:00:00',
        position: { lat: 43, lng: 141 },
      })
      expect(store.getItems()).toHaveLength(1)
    })

    // photos.json only ever stores EXIF GPS, so a photo positioned inside
    // the trip by #52's interpolation has no recorded coordinate to bring
    // with it — it lists as unplaced once it leaves.
    it('leaves a photo unplaced when its trip position came from interpolation rather than EXIF', () => {
      const record = importer().addPhotoFromTrip(
        tripPhoto({ latitude: undefined, longitude: undefined }),
      )

      expect(record.position).toBeNull()
    })
  })
})
