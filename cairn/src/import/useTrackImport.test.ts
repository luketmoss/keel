import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackImport } from './useTrackImport'
import { InMemoryTrackStore } from '../store/trackStore'
import type { ParseResult } from '../kml/parse'

const { parseKmlOrKmz } = vi.hoisted(() => ({ parseKmlOrKmz: vi.fn() }))
vi.mock('../kml/parse', () => ({ parseKmlOrKmz }))

const { computeTrackStats } = vi.hoisted(() => ({
  computeTrackStats: vi.fn(() => ({
    distanceMeters: 0,
    durationSeconds: undefined,
    elevationGainMeters: undefined,
  })),
}))
vi.mock('../kml/stats', () => ({ computeTrackStats }))

beforeEach(() => {
  parseKmlOrKmz.mockReset()
  computeTrackStats.mockClear()
})

function track(name: string): ParseResult {
  return { ok: true, tracks: [{ name, points: [{ lat: 0, lon: 0 }] }] }
}

function file(name: string): File {
  return new File(['content'], name)
}

describe('useTrackImport', () => {
  it('imports a valid file and adds it to the store', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('Ridge Trail'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(store.getFiles()).toHaveLength(1)
    expect(store.getFiles()[0].name).toBe('a.kml')
    expect(store.getFiles()[0].tracks[0].name).toBe('Ridge Trail')
    expect(result.current.failures).toHaveLength(0)
  })

  it('rejects a file with an unsupported extension, naming the accepted types', async () => {
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('a.gpx')]))

    expect(parseKmlOrKmz).not.toHaveBeenCalled()
    expect(store.getFiles()).toHaveLength(0)
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('a.gpx')
    expect(result.current.failures[0].message).toContain('.kml')
    expect(result.current.failures[0].message).toContain('.kmz')
  })

  it('rejects a photo dropped where no trip is open, naming that a trip must be open first', async () => {
    // #51 edge case: this v1 shell (`/`, `/trips`) has no open trip to
    // attach a photo to, so a dropped photo gets a more specific rejection
    // than the generic "unsupported type" one every other extension gets.
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('IMG_1.jpg'), file('IMG_2.heic')]))

    expect(parseKmlOrKmz).not.toHaveBeenCalled()
    expect(result.current.failures).toHaveLength(2)
    expect(result.current.failures[0].message).toBe('Photos belong to a trip — open one first.')
    expect(result.current.failures[1].message).toBe('Photos belong to a trip — open one first.')
  })

  it('reports a parse failure against its own file and continues the batch', async () => {
    parseKmlOrKmz
      .mockResolvedValueOnce({ ok: false, error: 'File is not well-formed XML' })
      .mockResolvedValueOnce(track('Day 2'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('broken.kml'), file('good.kml')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('broken.kml')
    expect(store.getFiles()).toHaveLength(1)
    expect(store.getFiles()[0].name).toBe('good.kml')
  })

  it('imports every file when selecting several at once', async () => {
    parseKmlOrKmz
      .mockResolvedValueOnce(track('Day 1'))
      .mockResolvedValueOnce(track('Day 2'))
      .mockResolvedValueOnce(track('Day 3'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() =>
      result.current.importFiles([file('a.kml'), file('b.kml'), file('c.kml')]),
    )

    expect(store.getFiles().map((f) => f.name)).toEqual(['a.kml', 'b.kml', 'c.kml'])
  })

  it('assigns each file a distinct, monotonically increasing colour index', async () => {
    parseKmlOrKmz
      .mockResolvedValueOnce(track('Day 1'))
      .mockResolvedValueOnce({ ok: false, error: 'broken' })
      .mockResolvedValueOnce(track('Day 3'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() =>
      result.current.importFiles([file('a.kml'), file('bad.kml'), file('c.kml')]),
    )

    expect(store.getFiles()).toHaveLength(2)
    expect(store.getFiles()[1].colorIndex).toBeGreaterThan(store.getFiles()[0].colorIndex)
  })

  it('imports a file whose name matches one already loaded, keeping both distinguishable', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('First')).mockResolvedValueOnce(track('Second'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('trip.kml')]))
    await act(() => result.current.importFiles([file('trip.kml')]))

    expect(store.getFiles()).toHaveLength(2)
    expect(store.getFiles()[0].id).not.toBe(store.getFiles()[1].id)
    expect(store.getFiles().map((f) => f.name)).toEqual(['trip.kml', 'trip.kml'])
  })

  it('shows a busy state naming the current file and its position while a batch parses', async () => {
    let resolveFirst!: (value: ParseResult) => void
    parseKmlOrKmz.mockReturnValueOnce(
      new Promise<ParseResult>((resolve) => {
        resolveFirst = resolve
      }),
    )
    parseKmlOrKmz.mockResolvedValueOnce(track('Day 2'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    let importDone: Promise<void>
    act(() => {
      importDone = result.current.importFiles([file('a.kml'), file('b.kml')])
    })

    await waitFor(() =>
      expect(result.current.progress).toEqual({ name: 'a.kml', index: 1, total: 2 }),
    )

    resolveFirst(track('Day 1'))
    await act(() => importDone)

    expect(result.current.progress).toBeNull()
  })

  it('clears failures at the start of a new import and dismissFailures clears them on demand', async () => {
    parseKmlOrKmz.mockResolvedValueOnce({ ok: false, error: 'nope' })
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('bad.kml')]))
    expect(result.current.failures).toHaveLength(1)

    act(() => result.current.dismissFailures())
    expect(result.current.failures).toHaveLength(0)

    parseKmlOrKmz.mockResolvedValueOnce(track('Fine'))
    await act(() => result.current.importFiles([file('fine.kml')]))
    expect(result.current.failures).toHaveLength(0)
  })

  it('imports a file as visible and toggles its visibility without affecting others', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('A')).mockResolvedValueOnce(track('B'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))
    await act(() => result.current.importFiles([file('a.kml'), file('b.kml')]))

    expect(store.getFiles().every((f) => f.visible)).toBe(true)
    const targetId = store.getFiles()[0].id

    act(() => result.current.toggleVisibility(targetId))
    expect(store.getFiles().find((f) => f.id === targetId)?.visible).toBe(false)
    expect(store.getFiles().find((f) => f.id !== targetId)?.visible).toBe(true)

    act(() => result.current.toggleVisibility(targetId))
    expect(store.getFiles().find((f) => f.id === targetId)?.visible).toBe(true)
  })

  it('removes a file by id, leaving the others in place', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('A')).mockResolvedValueOnce(track('B'))
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))
    await act(() => result.current.importFiles([file('a.kml'), file('b.kml')]))
    const [first, second] = store.getFiles()

    act(() => result.current.removeFile(first.id))

    expect(store.getFiles()).toHaveLength(1)
    expect(store.getFiles()[0].id).toBe(second.id)
  })

  it('computes statistics once at import, not again on a later re-render', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('A'))
    const store = new InMemoryTrackStore()
    const { result, rerender } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([file('a.kml')]))
    expect(computeTrackStats).toHaveBeenCalledTimes(1)

    rerender()
    rerender()
    act(() => result.current.toggleVisibility(store.getFiles()[0].id))
    rerender()

    expect(computeTrackStats).toHaveBeenCalledTimes(1)
  })
})
