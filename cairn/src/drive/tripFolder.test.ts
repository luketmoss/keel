import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveAuthError, findOrCreateTripFolder } from './tripFolder'

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
})
