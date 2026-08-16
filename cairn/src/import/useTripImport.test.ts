import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTripImport } from './useTripImport'
import type { ParseResult } from '../kml/parse'
import { DriveAuthError } from '../drive/rootFolder'
import { LocalTrackOverridesStore, type TrackOverridesStore } from '../store/trackOverridesStore'
import type { TripStore } from '../store/tripStore'

/** A minimal in-memory `Storage`, same helper `tripStore.test.ts` and
    `trackOverridesStore.test.ts` use — isolates each test's overrides from
    the default store's real `localStorage` and from each other. */
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

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('../drive/tripFolder', () => ({ findOrCreateTripFolder }))

const { listTrackFiles, downloadTrackFile, startResumableUpload, uploadFileContent, trashFile } =
  vi.hoisted(() => ({
    listTrackFiles: vi.fn(),
    downloadTrackFile: vi.fn(),
    startResumableUpload: vi.fn(),
    uploadFileContent: vi.fn(),
    trashFile: vi.fn(),
  }))
vi.mock('../drive/trackFiles', () => ({
  listTrackFiles,
  downloadTrackFile,
  startResumableUpload,
  uploadFileContent,
  trashFile,
}))

const { parseKmlOrKmz } = vi.hoisted(() => ({ parseKmlOrKmz: vi.fn() }))
vi.mock('../kml/parse', () => ({ parseKmlOrKmz }))

const { computeTrackStats } = vi.hoisted(() => ({
  computeTrackStats: vi.fn(() => ({
    distanceMeters: 0,
    durationSeconds: undefined,
    elevationGainMeters: undefined,
  })),
}))
vi.mock('../kml/stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../kml/stats')>()
  // #224's `overlaySampledElevation`/`hasUsableElevation` are left real —
  // pure functions with nothing to fake — only `computeTrackStats` is
  // stubbed, matching every test fixture's minimal single-point tracks.
  return { ...actual, computeTrackStats }
})

/** #224: `useTripImport` reads a trip's sampled-elevation cache back
    through `TripStore.getOverview` on mount — the rest of the interface is
    never called from inside the hook (`saveOverview` is `TripDetail`'s
    job), so a fake only needs `getOverview` to return something readable
    for every test that doesn't care about sampling.
 *
 * A single shared instance, not a fresh object per call: `renderHook`'s
    callback re-invokes `useTripImport(...)` on every render, so a
    `fakeTripStore()` call inline in that callback would hand the hook a
    new object identity each render — which its cache-read effect
    (dependent on `tripStore`) would read as "the store changed", firing
    forever. */
const sharedFakeTripStore: TripStore = { getOverview: () => null } as unknown as TripStore
function fakeTripStore(): TripStore {
  return sharedFakeTripStore
}

function track(name: string): ParseResult {
  return { ok: true, tracks: [{ name, points: [{ lat: 0, lon: 0 }] }] }
}

function file(name: string): File {
  return new File(['content'], name)
}

beforeEach(() => {
  findOrCreateTripFolder.mockReset().mockResolvedValue('folder-id')
  listTrackFiles.mockReset().mockResolvedValue([])
  downloadTrackFile.mockReset()
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-id' })
  trashFile.mockReset().mockResolvedValue(undefined)
  parseKmlOrKmz.mockReset()
  computeTrackStats.mockClear()
})

describe('useTripImport', () => {
  it('reads previously attached tracks back from Drive on mount', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValueOnce(track('Day 1'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].name).toBe('day-1.kml')
    expect(findOrCreateTripFolder).toHaveBeenCalledWith('token', 'cairn-folder-id', 'trip-1')
  })

  it('renders a missing-file entry when a track file 404s, without blocking the rest', async () => {
    listTrackFiles.mockResolvedValue([
      { id: 'drive-1', name: 'deleted.kml' },
      { id: 'drive-2', name: 'day-2.kml' },
    ])
    downloadTrackFile
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(file('day-2.kml'))
    parseKmlOrKmz.mockResolvedValueOnce(track('Day 2'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].name).toBe('day-2.kml')
    expect(result.current.missingFiles).toHaveLength(1)
    expect(result.current.missingFiles[0].name).toBe('deleted.kml')
  })

  it('renders each file as its own read settles rather than waiting for the whole trip', async () => {
    let resolveSecond: (() => void) | undefined
    listTrackFiles.mockResolvedValue([
      { id: 'drive-1', name: 'day-1.kml' },
      { id: 'drive-2', name: 'day-2.kml' },
    ])
    downloadTrackFile.mockResolvedValueOnce(file('day-1.kml')).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = () => resolve(file('day-2.kml'))
        }),
    )
    parseKmlOrKmz.mockResolvedValue(track('Day'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))

    // The first file lands while the second is still in flight — the trip
    // is not waiting for the whole batch before showing anything.
    await waitFor(() => expect(result.current.tracks).toHaveLength(1))
    expect(result.current.loading).toBe(true)

    await act(async () => {
      resolveSecond?.()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tracks).toHaveLength(2)
  })

  it('downloads tracks concurrently, bounded to 4 at once', async () => {
    listTrackFiles.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `drive-${i}`, name: `f${i}.kml` })),
    )
    let active = 0
    let maxActive = 0
    downloadTrackFile.mockImplementation(async (_token: string, _id: string, name: string) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return file(name)
    })
    parseKmlOrKmz.mockResolvedValue(track('Day'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tracks).toHaveLength(8)
    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
  })

  it('is not loading and does not attempt a read when signed out', async () => {
    const { result } = renderHook(() => useTripImport('trip-1', null, null, fakeTripStore()))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(listTrackFiles).not.toHaveBeenCalled()
    expect(result.current.tracks).toEqual([])
  })

  it('uploads then parses an imported file, adding it to the track list', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('Ridge Trail'))
    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(startResumableUpload).toHaveBeenCalledWith('token', 'folder-id', 'a.kml')
    expect(uploadFileContent).toHaveBeenCalledWith('session-uri', expect.anything(), 'token')
    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].name).toBe('a.kml')
    expect(result.current.failures).toHaveLength(0)
  })

  it('never runs more than 3 uploads at once', async () => {
    parseKmlOrKmz.mockResolvedValue(track('Day'))
    let active = 0
    let maxActive = 0
    uploadFileContent.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return { id: 'drive-file-id' }
    })

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const files = Array.from({ length: 8 }, (_, i) => file(`f${i}.kml`))
    await act(() => result.current.importFiles(files))

    expect(maxActive).toBeLessThanOrEqual(3)
    expect(result.current.tracks).toHaveLength(8)
  })

  it("one file's upload failure does not block the rest of the batch", async () => {
    parseKmlOrKmz.mockResolvedValue(track('Day'))
    uploadFileContent
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ id: 'ok-1' })
      .mockResolvedValueOnce({ id: 'ok-2' })

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() =>
      result.current.importFiles([file('bad.kml'), file('good-1.kml'), file('good-2.kml')]),
    )

    expect(result.current.tracks).toHaveLength(2)
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('bad.kml')
    expect(result.current.failures[0].message).toBe('could not be uploaded, tap to retry')
    expect(result.current.failures[0].retryFile).toBeInstanceOf(File)
  })

  it('reports a signed-out failure with a reconnect flag when the token expires mid-upload', async () => {
    parseKmlOrKmz.mockResolvedValue(track('Day'))
    uploadFileContent.mockRejectedValueOnce(new DriveAuthError())

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe(
      'signed out before this finished uploading, tap to reconnect',
    )
    expect(result.current.failures[0].reconnect).toBe(true)
  })

  it('is a no-op when signed out', async () => {
    const { result } = renderHook(() => useTripImport('trip-1', null, null, fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(startResumableUpload).not.toHaveBeenCalled()
    expect(result.current.tracks).toHaveLength(0)
  })
})

describe('useTripImport — #75 refuses a file already in the trip', () => {
  it('reports "already in this trip" and uploads nothing for a name that matches an existing track, case-insensitively', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'Holy Cross Day 1.kml' }])
    downloadTrackFile.mockResolvedValue(file('Holy Cross Day 1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tracks).toHaveLength(1)

    await act(() => result.current.importFiles([file('holy cross day 1.KML')]))

    expect(startResumableUpload).not.toHaveBeenCalled()
    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe('already in this trip')
    expect(result.current.failures[0].retryFile).toBeUndefined()
  })

  it('imports normally a name that only matches a file which previously failed to upload', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('Day'))
    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('retry-me.kml')]))

    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].name).toBe('retry-me.kml')
  })

  it('lets a second file with a different name import normally alongside a duplicate rejection', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('day-1.kml'), file('day-2.kml')]))

    expect(result.current.tracks.map((t) => t.name).sort()).toEqual(['day-1.kml', 'day-2.kml'])
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('day-1.kml')
    expect(result.current.failures[0].message).toBe('already in this trip')
  })
})

describe('useTripImport — #46 track overrides', () => {
  it('renames a track without touching its Drive-listing name on reload', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    const autoColorIndex = result.current.tracks[0].colorIndex
    let ok = false
    await act(async () => {
      ok = await result.current.renameTrack(result.current.tracks[0].id, 'Ridge day')
    })
    expect(ok).toBe(true)
    expect(result.current.tracks[0].name).toBe('Ridge day')
    // Renaming sets only the name override — colour still falls back to its
    // auto-assigned default, per-field rather than per-file (design doc).
    expect(result.current.tracks[0].colorIndex).toBe(autoColorIndex)

    // A fresh mount for the same trip (simulating a reload) reads the
    // override back rather than starting over from the raw Drive filename.
    const { result: reloaded } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(reloaded.current.loading).toBe(false))
    expect(reloaded.current.tracks[0].name).toBe('Ridge day')
  })

  /* #150: `Remove from trip` has to tell a name the user typed from the
     filename the track would otherwise be showing, and `name` alone cannot
     say which it is. */
  it('marks a renamed track with the display name behind it, and an untouched one with none', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([
      { id: 'drive-1', name: 'day-1.kml' },
      { id: 'drive-2', name: 'day-2.kml' },
    ])
    downloadTrackFile.mockImplementation(async (_token: string, _id: string, name: string) =>
      file(name),
    )
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.tracks).toHaveLength(2))

    const renamed = result.current.tracks.find((t) => t.driveFileId === 'drive-1')
    await act(async () => {
      await result.current.renameTrack(renamed!.id, 'Ridge day')
    })

    const byDriveId = Object.fromEntries(result.current.tracks.map((t) => [t.driveFileId, t]))
    expect(byDriveId['drive-1'].displayName).toBe('Ridge day')
    // Never renamed: its name is the filename, and nothing claims the user
    // chose it.
    expect(byDriveId['drive-2'].name).toBe('day-2.kml')
    expect(byDriveId['drive-2'].displayName).toBeUndefined()
  })

  it('claims no display name for a track carrying only a colour override', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.recolorTrack(result.current.tracks[0].id, 4)
    })

    expect(result.current.tracks[0].colorIndex).toBe(4)
    expect(result.current.tracks[0].name).toBe('day-1.kml')
    expect(result.current.tracks[0].displayName).toBeUndefined()
  })

  it("reflects a rename immediately, without waiting for the store's Drive flush to settle", async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    // A store whose local write is synchronous (like the real
    // `DriveTrackOverridesStore`) but whose returned promise only settles
    // once `resolveFlush` is called — standing in for a slow Drive round
    // trip, the ~5s the real bug was.
    const overridesById = new Map<string, { displayName?: string }>()
    let resolveFlush: (() => void) | undefined
    const slowStore: TrackOverridesStore = {
      getOverrides: () => Object.fromEntries(overridesById),
      setOverride: (_tripId, driveFileId, patch) => {
        overridesById.set(driveFileId, { ...overridesById.get(driveFileId), ...patch })
        return new Promise((resolve) => {
          resolveFlush = () => resolve(true)
        })
      },
      setOrder: async () => true,
    }

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), slowStore),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let renamePromise: Promise<boolean> = Promise.resolve(false)
    act(() => {
      renamePromise = result.current.renameTrack(result.current.tracks[0].id, 'Ridge day')
    })

    // The Drive flush hasn't resolved yet — but the rename is already
    // visible, rather than waiting on the network round trip.
    expect(result.current.tracks[0].name).toBe('Ridge day')

    await act(async () => {
      resolveFlush?.()
      await renamePromise
    })
    expect(result.current.tracks[0].name).toBe('Ridge day')
  })

  it('reverts the optimistic rename once the Drive flush rejects it', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    // Mirrors `DriveTrackOverridesStore.flush`'s real failure path: the
    // optimistic local write lands immediately, then a later-failing flush
    // rolls the local copy back to what it held before the edit.
    const overridesById = new Map<string, { displayName?: string }>()
    let rejectFlush: (() => void) | undefined
    const flakyStore: TrackOverridesStore = {
      getOverrides: () => Object.fromEntries(overridesById),
      setOverride: (_tripId, driveFileId, patch) => {
        const previous = overridesById.get(driveFileId)
        overridesById.set(driveFileId, { ...previous, ...patch })
        return new Promise((resolve) => {
          rejectFlush = () => {
            if (previous) overridesById.set(driveFileId, previous)
            else overridesById.delete(driveFileId)
            resolve(false)
          }
        })
      },
      setOrder: async () => true,
    }

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), flakyStore),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let renamePromise: Promise<boolean> = Promise.resolve(true)
    let ok = true
    act(() => {
      renamePromise = result.current.renameTrack(result.current.tracks[0].id, 'Ridge day')
    })
    expect(result.current.tracks[0].name).toBe('Ridge day')

    await act(async () => {
      rejectFlush?.()
      ok = await renamePromise
    })

    expect(ok).toBe(false)
    expect(result.current.tracks[0].name).toBe('day-1.kml')
  })

  it('recolours a track, overriding its auto-assigned colour index', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const autoColorIndex = result.current.tracks[0].colorIndex

    await act(async () => {
      await result.current.recolorTrack(result.current.tracks[0].id, autoColorIndex + 1)
    })

    expect(result.current.tracks[0].colorIndex).toBe(autoColorIndex + 1)
  })

  it('reorders tracks and persists the new order across a reload', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([
      { id: 'drive-1', name: 'a.kml' },
      { id: 'drive-2', name: 'b.kml' },
    ])
    downloadTrackFile.mockResolvedValueOnce(file('a.kml')).mockResolvedValueOnce(file('b.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tracks.map((t) => t.name)).toEqual(['a.kml', 'b.kml'])

    const [first, second] = result.current.tracks
    await act(async () => {
      await result.current.reorderTracks([second.id, first.id])
    })
    expect(result.current.tracks.map((t) => t.name)).toEqual(['b.kml', 'a.kml'])

    const { result: reloaded } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(reloaded.current.loading).toBe(false))
    expect(reloaded.current.tracks.map((t) => t.name)).toEqual(['b.kml', 'a.kml'])
  })

  it('falls back to defaults for a track with no stored override', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'untouched.kml' }])
    downloadTrackFile.mockResolvedValue(file('untouched.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Untouched'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tracks[0].name).toBe('untouched.kml')
  })

  it('ignores a stored override for a track no longer in the Drive listing, rather than erroring', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    // Pre-seed an override for a file id the trip's current listing will
    // never mention — as if it were removed independently after the
    // override was written.
    store.setOverride('trip-1', 'drive-gone', { displayName: 'Ghost' }, ['drive-gone'])
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )

    await expect(waitFor(() => expect(result.current.loading).toBe(false))).resolves.not.toThrow()
    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].name).toBe('day-1.kml')
  })

  it('returns false and leaves state unchanged when the id has no matching track', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok = true
    await act(async () => {
      ok = await result.current.renameTrack('no-such-id', 'New name')
    })
    expect(ok).toBe(false)
  })
})

describe('useTripImport — #77 removing a track', () => {
  it('trashes the Drive file and removes the row only once that succeeds', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tracks).toHaveLength(1)

    await act(() => result.current.removeFile(result.current.tracks[0].id))

    expect(trashFile).toHaveBeenCalledWith('token', 'drive-1')
    expect(result.current.tracks).toHaveLength(0)
    expect(result.current.removingTrackIds.size).toBe(0)
  })

  it('leaves the row in place and reports a failure when the Drive trash call fails', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))
    trashFile.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const id = result.current.tracks[0].id

    await act(() => result.current.removeFile(id))

    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.removingTrackIds.size).toBe(0)
    expect(result.current.trackRemoveErrors[id]).toBe("Couldn't remove day-1.kml — try again.")
  })

  it("prunes the removed track's override and keeps the remaining tracks' relative order", async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    listTrackFiles.mockResolvedValue([
      { id: 'drive-1', name: 'a.kml' },
      { id: 'drive-2', name: 'b.kml' },
      { id: 'drive-3', name: 'c.kml' },
    ])
    downloadTrackFile
      .mockResolvedValueOnce(file('a.kml'))
      .mockResolvedValueOnce(file('b.kml'))
      .mockResolvedValueOnce(file('c.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day'))

    const { result } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tracks.map((t) => t.name)).toEqual(['a.kml', 'b.kml', 'c.kml'])

    const middle = result.current.tracks[1]
    await act(() => result.current.removeFile(middle.id))

    // Removing the second of three keeps "a" before "c" — the first and
    // third don't swap or renumber out of order.
    expect(result.current.tracks.map((t) => t.name)).toEqual(['a.kml', 'c.kml'])
    expect(store.getOverrides('trip-1')['drive-2']).toBeUndefined()

    // The reload's `listTrackFiles` reflects what Drive actually has once
    // the trashed file drops out of its `trashed=false` listing — the mock's
    // job here, since `trashFile` itself is mocked and doesn't affect it.
    listTrackFiles.mockResolvedValue([
      { id: 'drive-1', name: 'a.kml' },
      { id: 'drive-3', name: 'c.kml' },
    ])
    downloadTrackFile.mockReset().mockResolvedValueOnce(file('a.kml')).mockResolvedValueOnce(file('c.kml'))
    const { result: reloaded } = renderHook(() =>
      useTripImport('trip-1', 'token', 'cairn-folder-id', fakeTripStore(), store),
    )
    await waitFor(() => expect(reloaded.current.loading).toBe(false))
    expect(reloaded.current.tracks.map((t) => t.name)).toEqual(['a.kml', 'c.kml'])
  })

  it('reports a failure and leaves the row in place when there is no Drive connection', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValue(track('Day 1'))

    const { result, rerender } = renderHook(
      ({ token }: { token: string | null }) => useTripImport('trip-1', token, 'cairn-folder-id', fakeTripStore()),
      { initialProps: { token: 'token' as string | null } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const id = result.current.tracks[0].id

    // Mirrors a token expiring after the trip already loaded — the row is
    // still on screen, but there's nothing left to trash against.
    rerender({ token: null })

    await act(() => result.current.removeFile(id))

    expect(trashFile).not.toHaveBeenCalled()
    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.trackRemoveErrors[id]).toBe("Couldn't remove day-1.kml — try again.")
  })
})
