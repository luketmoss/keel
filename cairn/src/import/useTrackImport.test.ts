import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackImport } from './useTrackImport'
import type { ParseResult } from '../kml/parse'

const { parseKmlOrKmz } = vi.hoisted(() => ({ parseKmlOrKmz: vi.fn() }))
vi.mock('../kml/parse', () => ({ parseKmlOrKmz }))

beforeEach(() => {
  parseKmlOrKmz.mockReset()
})

function track(name: string): ParseResult {
  return { ok: true, tracks: [{ name, points: [{ lat: 0, lon: 0 }] }] }
}

function file(name: string): File {
  return new File(['content'], name)
}

describe('useTrackImport', () => {
  it('imports a valid file and adds it to the file list', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('Ridge Trail'))
    const { result } = renderHook(() => useTrackImport())

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0].name).toBe('a.kml')
    expect(result.current.files[0].tracks[0].name).toBe('Ridge Trail')
    expect(result.current.failures).toHaveLength(0)
  })

  it('rejects a file with an unsupported extension, naming the accepted types', async () => {
    const { result } = renderHook(() => useTrackImport())

    await act(() => result.current.importFiles([file('a.gpx')]))

    expect(parseKmlOrKmz).not.toHaveBeenCalled()
    expect(result.current.files).toHaveLength(0)
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('a.gpx')
    expect(result.current.failures[0].message).toContain('.kml')
    expect(result.current.failures[0].message).toContain('.kmz')
  })

  it('reports a parse failure against its own file and continues the batch', async () => {
    parseKmlOrKmz
      .mockResolvedValueOnce({ ok: false, error: 'File is not well-formed XML' })
      .mockResolvedValueOnce(track('Day 2'))
    const { result } = renderHook(() => useTrackImport())

    await act(() => result.current.importFiles([file('broken.kml'), file('good.kml')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('broken.kml')
    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0].name).toBe('good.kml')
  })

  it('imports every file when selecting several at once', async () => {
    parseKmlOrKmz
      .mockResolvedValueOnce(track('Day 1'))
      .mockResolvedValueOnce(track('Day 2'))
      .mockResolvedValueOnce(track('Day 3'))
    const { result } = renderHook(() => useTrackImport())

    await act(() =>
      result.current.importFiles([file('a.kml'), file('b.kml'), file('c.kml')]),
    )

    expect(result.current.files.map((f) => f.name)).toEqual(['a.kml', 'b.kml', 'c.kml'])
  })

  it('assigns each file a distinct, monotonically increasing colour index', async () => {
    parseKmlOrKmz
      .mockResolvedValueOnce(track('Day 1'))
      .mockResolvedValueOnce({ ok: false, error: 'broken' })
      .mockResolvedValueOnce(track('Day 3'))
    const { result } = renderHook(() => useTrackImport())

    await act(() =>
      result.current.importFiles([file('a.kml'), file('bad.kml'), file('c.kml')]),
    )

    expect(result.current.files).toHaveLength(2)
    expect(result.current.files[1].colorIndex).toBeGreaterThan(
      result.current.files[0].colorIndex,
    )
  })

  it('imports a file whose name matches one already loaded, keeping both distinguishable', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('First')).mockResolvedValueOnce(track('Second'))
    const { result } = renderHook(() => useTrackImport())

    await act(() => result.current.importFiles([file('trip.kml')]))
    await act(() => result.current.importFiles([file('trip.kml')]))

    expect(result.current.files).toHaveLength(2)
    expect(result.current.files[0].id).not.toBe(result.current.files[1].id)
    expect(result.current.files.map((f) => f.name)).toEqual(['trip.kml', 'trip.kml'])
  })

  it('shows a busy state naming the current file and its position while a batch parses', async () => {
    let resolveFirst!: (value: ParseResult) => void
    parseKmlOrKmz.mockReturnValueOnce(
      new Promise<ParseResult>((resolve) => {
        resolveFirst = resolve
      }),
    )
    parseKmlOrKmz.mockResolvedValueOnce(track('Day 2'))
    const { result } = renderHook(() => useTrackImport())

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
    const { result } = renderHook(() => useTrackImport())

    await act(() => result.current.importFiles([file('bad.kml')]))
    expect(result.current.failures).toHaveLength(1)

    act(() => result.current.dismissFailures())
    expect(result.current.failures).toHaveLength(0)

    parseKmlOrKmz.mockResolvedValueOnce(track('Fine'))
    await act(() => result.current.importFiles([file('fine.kml')]))
    expect(result.current.failures).toHaveLength(0)
  })
})
