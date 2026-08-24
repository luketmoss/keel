import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLooseImport } from './useLooseImport'
import { LocalLooseStore } from '../store/looseStore'
import type { CairnRecord } from '../photo/useCairnImport'

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
    const { rejections } = await importer().importFiles([kmlFixture('linestring.kml', 'day1.kml')])

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

  it('imports a dropped GPX as one loose track, with elevation and duration', async () => {
    const { rejections } = await importer().importFiles([kmlFixture('track.gpx')])

    expect(rejections).toEqual([])
    const items = store.getItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'track', sourceName: 'track.gpx' })
    const track = items[0] as { ascentMeters: number | null; durationSeconds: number | null }
    expect(track.ascentMeters).not.toBeNull()
    expect(track.durationSeconds).not.toBeNull()
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

  it('imports a photo with GPS as a cairn with positionSource exif', async () => {
    await importer().importFiles([photoFixture('gps-and-timestamps.jpg')])

    const items = store.getItems()
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('cairn')
    expect(items[0].position).not.toBeNull()
    expect((items[0] as { positionSource: string }).positionSource).toBe('exif')
  })

  // `cairns.md`: a cairn always has a position, and there is no unplaced
  // state — a loose drop (no trip open, so nothing to interpolate against)
  // that resolves by neither route waits in the placement queue (#168)
  // rather than being written half-done or rejected outright.
  it('queues a photo with no GPS for placement, rather than creating an unplaced record', async () => {
    const { rejections, needsPlacement, resolvedCount } = await importer().importFiles([
      photoFixture('gps-stripped.jpg'),
    ])

    expect(store.getItems()).toHaveLength(0)
    expect(rejections).toEqual([])
    expect(resolvedCount).toBe(0)
    expect(needsPlacement).toHaveLength(1)
    expect(needsPlacement[0].name).toBe('gps-stripped.jpg')
    // No trip was open on this loose drop, so there is nothing to suggest
    // against — the item carries no tracks for the suggestion ring to read.
    expect(needsPlacement[0].tracks).toEqual([])
  })

  it("a queued item's save() writes the cairn once a position is supplied by hand", async () => {
    const { needsPlacement } = await importer().importFiles([photoFixture('gps-stripped.jpg')])

    const result = await needsPlacement[0].save({ lat: 12, lng: 34 })

    expect(result).not.toBe(false)
    const items = store.getItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'cairn',
      position: { lat: 12, lng: 34 },
      positionSource: 'placed',
    })
  })

  it('rejects a file it cannot identify, by name, importing nothing for it', async () => {
    const { rejections } = await importer().importFiles([new File(['x'], 'notes.txt')])

    expect(rejections).toHaveLength(1)
    expect(rejections[0].message).toContain('notes.txt')
    expect(store.getItems()).toHaveLength(0)
  })

  it('rejects a KML with no track without blocking the rest of the drop', async () => {
    const { rejections } = await importer().importFiles([
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

  /* #176: `Remove from trip` passes the track's effective in-trip colour,
     override or auto-assigned. Unlike name, it always wins — there is no
     "derive it again" to fall back to for a track leaving a trip. */
  describe('a colour carried across a move (#176)', () => {
    const tracks = [{ name: 'Day one', points: [{ lat: 1, lon: 2 }] }]

    it('uses the given colour verbatim instead of the auto-cycle', () => {
      importer().addParsedTracks('day1.kml', tracks, { colorIndex: 4 })

      expect((store.getItems()[0] as { colorIndex: number }).colorIndex).toBe(4)
    })

    it('still auto-cycles the palette when no colour is given', () => {
      importer().addParsedTracks('a.kml', tracks)
      importer().addParsedTracks('b.kml', tracks)

      const colours = store.getItems().map((item) => (item as { colorIndex: number }).colorIndex)
      expect(new Set(colours).size).toBe(2)
    })
  })

  describe('addCairnFromTrip (#132)', () => {
    function tripCairn(overrides: Partial<CairnRecord> = {}): CairnRecord {
      return {
        id: 'trip-cairn-1',
        name: 'sapporo.jpg',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'trip-orig-1', thumbnailDriveFileId: 'trip-thumb-1' },
        description: '',
        date: '2024-11-03T00:00:00.000Z',
        gpsTimestamp: '2024-11-03T00:00:00.000Z',
        dateTimeOriginal: '2024-11-03T09:00:00',
        ...overrides,
      }
    }

    it("carries a trip cairn's id, image and position into a loose record, for Remove from trip", () => {
      const record = importer().addCairnFromTrip(tripCairn())

      expect(record).toMatchObject({
        kind: 'cairn',
        id: 'trip-cairn-1',
        name: 'sapporo.jpg',
        image: { originalDriveFileId: 'trip-orig-1', thumbnailDriveFileId: 'trip-thumb-1' },
        // #50's two timestamps survive the move rather than being
        // collapsed, exactly as they do going the other direction.
        gpsTimestamp: '2024-11-03T00:00:00.000Z',
        dateTimeOriginal: '2024-11-03T09:00:00',
        position: { lat: 43, lng: 141 },
      })
      expect(store.getItems()).toHaveLength(1)
    })

    // Unlike the old per-trip photo index, a cairn's position is never lost
    // by leaving a trip — it is stored on the record itself, whatever its
    // source, and `claimFromTrip` relocates the folder without touching it.
    it('carries an interpolated position across unchanged, as itself', () => {
      const record = importer().addCairnFromTrip(tripCairn({ positionSource: 'interpolated' }))

      expect(record.position).toEqual({ lat: 43, lng: 141 })
      expect(record.positionSource).toBe('interpolated')
    })

    it('preserves the trip-side id, which is what makes claimFromTrip find the folder by name', () => {
      const record = importer().addCairnFromTrip(tripCairn({ id: 'a-specific-cairn-id' }))

      expect(record.id).toBe('a-specific-cairn-id')
    })

    /* #196: leaving a trip must change neither the name nor the
       description. The other direction is a Drive folder move — the
       `cairn.json` relocates whole, so nothing can be dropped there — but
       this direction rebuilds the record field by field, which is exactly
       where a field gets forgotten. */
    it('carries the name and description out of a trip untouched', () => {
      const description = ['Loose slab.', 'Crossed high on the left.'].join('\n')
      const record = importer().addCairnFromTrip(
        tripCairn({ name: 'Notch Mountain hazard', description }),
      )

      expect(record.name).toBe('Notch Mountain hazard')
      expect(record).toMatchObject({ description })
    })
  })
})
