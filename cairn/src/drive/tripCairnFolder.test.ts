import { afterEach, describe, expect, it, vi } from 'vitest'
import { findOrCreateTripCairnItemFolder, findOrCreateTripCairnsFolder } from './tripCairnFolder'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('findOrCreateTripCairnsFolder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates trip, then cairns, when neither exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // trip lookup
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      // trip create
      .mockResolvedValueOnce(jsonResponse({ id: 'trip-id', createdTime: '2026-01-01' }))
      // cairns lookup
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      // cairns create
      .mockResolvedValueOnce(jsonResponse({ id: 'cairns-id', createdTime: '2026-01-01' }))

    const folderId = await findOrCreateTripCairnsFolder('token', 'cairn-folder-id', 'trip-abc')

    expect(folderId).toBe('cairns-id')
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    const [, createInit] = fetchSpy.mock.calls[3]
    expect(JSON.parse(String(createInit?.body))).toEqual({
      name: 'cairns',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['trip-id'],
    })
  })

  it('reuses existing folders at both levels', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'trip-id', createdTime: '2025-01-01' }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'cairns-id', createdTime: '2025-01-01' }] }))

    const folderId = await findOrCreateTripCairnsFolder('token', 'cairn-folder-id', 'trip-abc')

    expect(folderId).toBe('cairns-id')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('findOrCreateTripCairnItemFolder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('finds or creates trip/cairns/<cairn-id> at every level', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'trip-id', createdTime: '2025-01-01' }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'cairns-id', createdTime: '2025-01-01' }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'cairn-item-id', createdTime: '2026-01-01' }))

    const folderId = await findOrCreateTripCairnItemFolder(
      'token',
      'cairn-folder-id',
      'trip-abc',
      'cairn-123',
    )

    expect(folderId).toBe('cairn-item-id')
  })
})
