import { IDBFactory } from 'fake-indexeddb'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTripImport } from './useTripImport'
import { TrackFileCache } from '../drive/trackFileCache'
import { LocalTrackOverridesStore } from '../store/trackOverridesStore'
import type { ParseResult } from '../kml/parse'
import type { TripStore } from '../store/tripStore'

/* #244 — the track-bytes cache, end to end against a mocked `fetch`, with
   `../drive/trackFiles` and `../drive/tripFolder` left real (only the HTTP
   layer underneath them is mocked below). This is its own file for the
   same reason `useCairnImport.cache.test.ts` is: a criterion about *not
   issuing a network request* can only be asserted where the requests are
   real, and the main `useTripImport` suite mocks `../drive/trackFiles`
   away entirely. */

const sharedFakeTripStore: TripStore = { getOverview: () => null } as unknown as TripStore
function fakeTripStore(): TripStore {
  return sharedFakeTripStore
}

/** In-memory `Storage`, isolating each test's overrides from the default
    store's real `localStorage` and from each other — matches
    `useTripImport.test.ts`'s own helper. */
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

const { parseTrack } = vi.hoisted(() => ({ parseTrack: vi.fn() }))
vi.mock('../kml/parse', () => ({ parseTrack }))

function track(name: string): ParseResult {
  return { ok: true, tracks: [{ name, points: [{ lat: 0, lon: 0 }] }] }
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

function blobResponse(body: string): Response {
  return { ok: true, status: 200, blob: async () => new Blob([body]) } as unknown as Response
}

/** A trip folder holding one track file, whose bytes come from `body`. */
function driveHolding(fileId: string, name: string, modifiedTime: string, body: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = decodeURIComponent(String(input))
    if (url.includes("name='trip-1'")) {
      return jsonResponse({ files: [{ id: 'trip-folder-id', createdTime: '2024-01-01T00:00:00Z' }] })
    }
    if (url.includes('fields=files(id,name,modifiedTime)')) {
      return jsonResponse({ files: [{ id: fileId, name, modifiedTime }] })
    }
    if (url.includes('alt=media')) {
      return blobResponse(body)
    }
    return jsonResponse({}, 500)
  })
}

function driveThatNeverAnswersMedia(fileId: string, name: string, modifiedTime: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = decodeURIComponent(String(input))
    if (url.includes("name='trip-1'")) {
      return jsonResponse({ files: [{ id: 'trip-folder-id', createdTime: '2024-01-01T00:00:00Z' }] })
    }
    if (url.includes('fields=files(id,name,modifiedTime)')) {
      return jsonResponse({ files: [{ id: fileId, name, modifiedTime }] })
    }
    if (url.includes('alt=media')) {
      return new Promise<Response>(() => {})
    }
    return jsonResponse({}, 500)
  })
}

beforeEach(() => {
  parseTrack.mockResolvedValue(track('Day'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTripImport — cached track files (#244)', () => {
  it('opens a trip with unchanged cached tracks without an alt=media request', async () => {
    const db = new IDBFactory()
    const cache = new TrackFileCache({ indexedDBFactory: db })
    // A stable instance per mount, hoisted out of `renderHook`'s callback —
    // `useTripImport.test.ts`'s `sharedFakeTripStore` comment explains why a
    // fresh object inline there would fire the overrides-read effect (which
    // depends on this store's identity) on every render, forever.
    const overridesStoreA = new LocalTrackOverridesStore(fakeStorage())
    const overridesStoreB = new LocalTrackOverridesStore(fakeStorage())

    driveHolding('file-1', 'day-1.kml', 'rev-1', 'kml bytes')
    const first = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), overridesStoreA, cache),
    )
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.tracks).toHaveLength(1)
    first.unmount()

    const fetchSpy = driveThatNeverAnswersMedia('file-1', 'day-1.kml', 'rev-1')
    const second = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), overridesStoreB, cache),
    )
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.tracks).toHaveLength(1)
    expect(second.result.current.missingFiles).toEqual([])
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes('alt=media'))).toBe(false)
  })

  it('re-downloads a track file whose modifiedTime has changed', async () => {
    const db = new IDBFactory()
    const cache = new TrackFileCache({ indexedDBFactory: db })
    const overridesStoreA = new LocalTrackOverridesStore(fakeStorage())
    const overridesStoreB = new LocalTrackOverridesStore(fakeStorage())

    driveHolding('file-1', 'day-1.kml', 'rev-1', 'first bytes')
    const first = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), overridesStoreA, cache),
    )
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    const fetchSpy = driveHolding('file-1', 'day-1.kml', 'rev-2', 'second bytes')
    const second = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), overridesStoreB, cache),
    )
    await waitFor(() => expect(second.result.current.loading).toBe(false))

    expect(second.result.current.tracks).toHaveLength(1)
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes('alt=media'))).toBe(true)
  })
})
