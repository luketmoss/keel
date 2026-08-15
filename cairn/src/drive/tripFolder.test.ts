import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveAuthError, findOrCreateTripFolder } from './tripFolder'
import { onDriveAuthError } from './authEvents'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('findOrCreateTripFolder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a folder scoped to the Cairn folder when none exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-folder-id', createdTime: '2026-01-01' }))

    const folderId = await findOrCreateTripFolder('token', 'cairn-folder-id', 'trip-abc')

    expect(folderId).toBe('trip-folder-id')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [listUrl] = fetchSpy.mock.calls[0]
    expect(decodeURIComponent(String(listUrl))).toContain("'cairn-folder-id' in parents")
    const [createUrl, createInit] = fetchSpy.mock.calls[1]
    expect(createUrl).toContain('files')
    expect(createInit?.method).toBe('POST')
    expect(JSON.parse(String(createInit?.body))).toEqual({
      name: 'trip-abc',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['cairn-folder-id'],
    })
  })

  it('reuses an existing trip folder rather than creating a duplicate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ files: [{ id: 'existing-id', createdTime: '2025-06-01' }] }),
    )

    const folderId = await findOrCreateTripFolder('token', 'cairn-folder-id', 'trip-abc')

    expect(folderId).toBe('existing-id')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('picks the oldest folder by createdTime when more than one exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        files: [
          { id: 'newer', createdTime: '2026-02-01' },
          { id: 'older', createdTime: '2024-01-01' },
        ],
      }),
    )

    const folderId = await findOrCreateTripFolder('token', 'cairn-folder-id', 'trip-abc')

    expect(folderId).toBe('older')
  })

  it('propagates DriveAuthError from the lookup call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401))

    await expect(
      findOrCreateTripFolder('expired', 'cairn-folder-id', 'trip-abc'),
    ).rejects.toBeInstanceOf(DriveAuthError)
  })

  // Regression: `useDraftTrip.save()` calls `findOrCreateTripFolder` directly
  // right after `createTrip()` fires `DriveTripStore.migrateTrip` (queued,
  // unawaited) for the same trip id — two independent callers resolving the
  // same folder in the same tick. Before the in-flight cache, both saw the
  // list come back empty and both created a folder, leaving two folders
  // with the same name and a track/photo split across them depending on
  // which caller's folder id each write happened to use.
  it('shares one lookup/create between concurrent calls for the same trip', async () => {
    let resolveList: (value: Response) => void
    const listPromise = new Promise<Response>((resolve) => {
      resolveList = resolve
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => listPromise)
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-folder-id', createdTime: '2026-01-01' }))

    const first = findOrCreateTripFolder('token', 'cairn-folder-id', 'trip-abc')
    const second = findOrCreateTripFolder('token', 'cairn-folder-id', 'trip-abc')

    resolveList!(jsonResponse({ files: [] }))
    const [firstId, secondId] = await Promise.all([first, second])

    expect(firstId).toBe('trip-folder-id')
    expect(secondId).toBe('trip-folder-id')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // #96: `driveFetch` threw `DriveAuthError` on a 401 already — what it
  // didn't do, unlike every sibling in `drive/*.ts`, was report the failed
  // token through `authEvents`, so `useGoogleAccount` never learned a save
  // had actually failed because the token expired and never offered
  // Reconnect. This is the behaviour the other three modules already have
  // and this module was missing.
  it('reports the expired token through authEvents on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401))
    const listener = vi.fn()
    const unsubscribe = onDriveAuthError(listener)

    try {
      await expect(
        findOrCreateTripFolder('expired-token', 'cairn-folder-id', 'trip-abc'),
      ).rejects.toBeInstanceOf(DriveAuthError)

      expect(listener).toHaveBeenCalledWith('expired-token')
    } finally {
      unsubscribe()
    }
  })
})
