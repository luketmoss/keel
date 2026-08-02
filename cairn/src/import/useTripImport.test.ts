import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTripImport } from './useTripImport'
import type { ParseResult } from '../kml/parse'
import { DriveAuthError } from '../drive/cairnFolder'

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('../drive/tripFolder', () => ({ findOrCreateTripFolder }))

const { listTrackFiles, downloadTrackFile, startResumableUpload, uploadFileContent } = vi.hoisted(
  () => ({
    listTrackFiles: vi.fn(),
    downloadTrackFile: vi.fn(),
    startResumableUpload: vi.fn(),
    uploadFileContent: vi.fn(),
  }),
)
vi.mock('../drive/trackFiles', () => ({
  listTrackFiles,
  downloadTrackFile,
  startResumableUpload,
  uploadFileContent,
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
vi.mock('../kml/stats', () => ({ computeTrackStats }))

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
  parseKmlOrKmz.mockReset()
  computeTrackStats.mockClear()
})

describe('useTripImport', () => {
  it('reads previously attached tracks back from Drive on mount', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'drive-1', name: 'day-1.kml' }])
    downloadTrackFile.mockResolvedValue(file('day-1.kml'))
    parseKmlOrKmz.mockResolvedValueOnce(track('Day 1'))

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id'))

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].name).toBe('day-1.kml')
    expect(findOrCreateTripFolder).toHaveBeenCalledWith('token', 'cairn-folder-id', 'trip-1')
  })

  it('is not loading and does not attempt a read when signed out', async () => {
    const { result } = renderHook(() => useTripImport('trip-1', null, null))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(listTrackFiles).not.toHaveBeenCalled()
    expect(result.current.tracks).toEqual([])
  })

  it('uploads then parses an imported file, adding it to the track list', async () => {
    parseKmlOrKmz.mockResolvedValueOnce(track('Ridge Trail'))
    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id'))
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

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id'))
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

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id'))
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

    const { result } = renderHook(() => useTripImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe(
      'signed out before this finished uploading, tap to reconnect',
    )
    expect(result.current.failures[0].reconnect).toBe(true)
  })

  it('is a no-op when signed out', async () => {
    const { result } = renderHook(() => useTripImport('trip-1', null, null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.kml')]))

    expect(startResumableUpload).not.toHaveBeenCalled()
    expect(result.current.tracks).toHaveLength(0)
  })
})
