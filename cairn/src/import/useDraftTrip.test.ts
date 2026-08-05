import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftTrip } from './useDraftTrip'
import { LocalTripStore } from '../store/tripStore'

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('../drive/tripFolder', () => ({ findOrCreateTripFolder }))

const { startResumableUpload, uploadFileContent } = vi.hoisted(() => ({
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
}))
vi.mock('../drive/trackFiles', () => ({ startResumableUpload, uploadFileContent }))

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

function loadFixture(name: string, as = name): File {
  const buffer = readFileSync(join(__dirname, '../kml/fixtures', name))
  return new File([buffer], as)
}

beforeEach(() => {
  findOrCreateTripFolder.mockReset().mockResolvedValue('folder-1')
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-1' })
})

describe('useDraftTrip', () => {
  it('starts with no draft', () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))
    expect(result.current.draft).toBeNull()
  })

  it('opens a draft from a valid KML, seeding the name from the filename without its extension', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    let rejections: unknown[] = []
    await act(async () => {
      rejections = await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
    })

    expect(rejections).toEqual([])
    expect(result.current.draft).not.toBeNull()
    expect(result.current.draft?.name).toBe('day1')
    expect(result.current.draft?.status).toBe('completed')
    expect(result.current.draft?.files).toHaveLength(1)
  })

  it('rejects a file with the wrong extension, without opening a draft', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    let rejections: { name: string; message: string }[] = []
    await act(async () => {
      rejections = await result.current.addFiles([new File(['x'], 'notes.txt')])
    })

    expect(rejections).toEqual([
      { name: 'notes.txt', message: 'Only .kml and .kmz files can be imported.' },
    ])
    expect(result.current.draft).toBeNull()
  })

  it('gives a photo dropped outside a trip its own rejection copy', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    let rejections: { name: string; message: string }[] = []
    await act(async () => {
      rejections = await result.current.addFiles([new File(['x'], 'photo.jpg')])
    })

    expect(rejections).toEqual([{ name: 'photo.jpg', message: 'Photos belong to a trip — open one first.' }])
    expect(result.current.draft).toBeNull()
  })

  it('rejects an unparseable file, without opening a draft', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    let rejections: { name: string; message: string }[] = []
    await act(async () => {
      rejections = await result.current.addFiles([loadFixture('invalid.kml')])
    })

    expect(rejections).toEqual([{ name: 'invalid.kml', message: 'invalid.kml is not a valid KML file.' }])
    expect(result.current.draft).toBeNull()
  })

  it('rejects a KML with no tracks in it, without opening a draft', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    let rejections: { name: string; message: string }[] = []
    await act(async () => {
      rejections = await result.current.addFiles([loadFixture('no-track.kml')])
    })

    expect(rejections).toEqual([{ name: 'no-track.kml', message: 'no-track.kml has no tracks in it.' }])
    expect(result.current.draft).toBeNull()
  })

  it('adds further drops to the same open draft rather than starting a second one', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    await act(async () => {
      await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
    })
    const firstName = result.current.draft?.name

    await act(async () => {
      await result.current.addFiles([loadFixture('multi-placemark.kml', 'day2.kml')])
    })

    expect(result.current.draft?.files).toHaveLength(2)
    // The name, once seeded, is not re-seeded by a later drop.
    expect(result.current.draft?.name).toBe(firstName)
  })

  it('a mixed batch adds the valid file and reports only the invalid one', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    let rejections: { name: string; message: string }[] = []
    await act(async () => {
      rejections = await result.current.addFiles([
        loadFixture('linestring.kml', 'day1.kml'),
        new File(['x'], 'notes.txt'),
      ])
    })

    expect(rejections).toEqual([{ name: 'notes.txt', message: 'Only .kml and .kmz files can be imported.' }])
    expect(result.current.draft?.files).toHaveLength(1)
  })

  it('cancel discards the draft — nothing was created', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    await act(async () => {
      await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
    })
    expect(result.current.draft).not.toBeNull()

    act(() => result.current.cancel())

    expect(result.current.draft).toBeNull()
    expect(store.getTrips()).toHaveLength(0)
  })

  it('editing fields updates the draft without creating a trip', async () => {
    const store = new LocalTripStore(fakeStorage())
    const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

    await act(async () => {
      await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
    })

    act(() => result.current.updateName('Hokkaido'))
    act(() => result.current.updateStatus('planned'))
    act(() => result.current.updateDates('2024-03-01', '2024-03-05'))
    act(() => result.current.updateNotes('Great trip'))

    expect(result.current.draft).toMatchObject({
      name: 'Hokkaido',
      status: 'planned',
      startDate: '2024-03-01',
      endDate: '2024-03-05',
      notes: 'Great trip',
    })
    expect(store.getTrips()).toHaveLength(0)
  })

  describe('save', () => {
    it('creates the trip, writes its overview, and uploads the source file — clearing the draft', async () => {
      const store = new LocalTripStore(fakeStorage())
      const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

      await act(async () => {
        await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
      })
      act(() => result.current.updateName('Hokkaido'))

      let saved = false
      await act(async () => {
        saved = await result.current.save()
      })

      expect(saved).toBe(true)
      expect(result.current.draft).toBeNull()

      const trips = store.getTrips()
      expect(trips).toHaveLength(1)
      expect(trips[0].name).toBe('Hokkaido')
      expect(trips[0].status).toBe('completed')
      expect(trips[0].origin).not.toBeNull()
      expect(store.getOverview(trips[0].id)?.features).toHaveLength(1)
      expect(findOrCreateTripFolder).toHaveBeenCalledWith('token', 'cairn-folder', trips[0].id)
      expect(startResumableUpload).toHaveBeenCalledWith('token', 'folder-1', 'day1.kml')
    })

    it('leaves the draft open with its route intact and reports the failure when the upload fails', async () => {
      uploadFileContent.mockRejectedValue(new Error('network error'))
      const store = new LocalTripStore(fakeStorage())
      const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

      await act(async () => {
        await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
      })

      let saved = true
      await act(async () => {
        saved = await result.current.save()
      })

      expect(saved).toBe(false)
      expect(result.current.draft).not.toBeNull()
      expect(result.current.draft?.files).toHaveLength(1)
      expect(result.current.draft?.saving).toBe(false)
      expect(result.current.draft?.saveError).toBe(
        'Could not save. Your tracks are still here — try again.',
      )
    })

    // #96: the real cause used to vanish entirely into the generic banner
    // above, with nothing in the console — the only way anyone could ever
    // diagnose a save failure was an investigation like this issue's.
    it('logs the real error to the console on a failed save', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const failure = new Error('token expired mid-save')
      uploadFileContent.mockRejectedValue(failure)
      const store = new LocalTripStore(fakeStorage())
      const { result } = renderHook(() => useDraftTrip(store, 'token', 'cairn-folder'))

      await act(async () => {
        await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
      })
      await act(async () => {
        await result.current.save()
      })

      expect(consoleSpy).toHaveBeenCalledWith('cairn: trip save failed', failure)
      consoleSpy.mockRestore()
    })

    it('does nothing while signed out — the caller is responsible for not calling it then', async () => {
      const store = new LocalTripStore(fakeStorage())
      const { result } = renderHook(() => useDraftTrip(store, null, null))

      await act(async () => {
        await result.current.addFiles([loadFixture('linestring.kml', 'day1.kml')])
      })

      let saved = true
      await act(async () => {
        saved = await result.current.save()
      })

      expect(saved).toBe(false)
      expect(result.current.draft).not.toBeNull()
      expect(store.getTrips()).toHaveLength(0)
    })
  })
})
