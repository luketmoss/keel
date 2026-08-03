import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DriveAuthError,
  DriveConflictError,
  findJsonFile,
  listSubfolders,
  readJsonFile,
  trashFolder,
  writeJsonFile,
} from './tripMetadata'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('findJsonFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the file id and version when a file with that name exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ files: [{ id: 'file-1', version: '3' }] }),
    )

    const ref = await findJsonFile('token', 'folder-1', 'trip.json')

    expect(ref).toEqual({ fileId: 'file-1', version: '3' })
  })

  it('returns null when no file with that name exists yet', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ files: [] }))

    expect(await findJsonFile('token', 'folder-1', 'trip.json')).toBeNull()
  })

  it('throws DriveAuthError on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}, 401))

    await expect(findJsonFile('expired', 'folder-1', 'trip.json')).rejects.toBeInstanceOf(
      DriveAuthError,
    )
  })
})

describe('readJsonFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads content and current version together', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('alt=media')) return jsonResponse({ name: 'Hokkaido' })
      return jsonResponse({ version: '5' })
    })

    const result = await readJsonFile<{ name: string }>('token', 'file-1')

    expect(result).toEqual({ data: { name: 'Hokkaido' }, version: '5' })
  })
})

describe('writeJsonFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a new file via multipart upload when nothing exists yet', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'new-file', version: '1' }))

    const ref = await writeJsonFile('token', 'folder-1', 'trip.json', { name: 'Hokkaido' }, null)

    expect(ref).toEqual({ fileId: 'new-file', version: '1' })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('uploadType=multipart')
    expect(init?.method).toBe('POST')
  })

  it('overwrites in place when the current version matches what was last read', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // version check
      .mockResolvedValueOnce(jsonResponse({ version: '1' }))
      // overwrite
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', version: '2' }))

    const ref = await writeJsonFile(
      'token',
      'folder-1',
      'trip.json',
      { name: 'Iceland' },
      { fileId: 'file-1', version: '1' },
    )

    expect(ref).toEqual({ fileId: 'file-1', version: '2' })
    const [url, init] = fetchSpy.mock.calls[1]
    expect(String(url)).toContain('uploadType=media')
    expect(init?.method).toBe('PATCH')
  })

  it('throws DriveConflictError when the current version has moved on since it was last read', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ version: '2' }))

    await expect(
      writeJsonFile(
        'token',
        'folder-1',
        'trip.json',
        { name: 'Iceland' },
        { fileId: 'file-1', version: '1' },
      ),
    ).rejects.toBeInstanceOf(DriveConflictError)
  })
})

describe('listSubfolders', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns every direct child folder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ files: [{ id: 'a', name: 'trip-a' }, { id: 'b', name: 'trip-b' }] }),
    )

    const folders = await listSubfolders('token', 'cairn-folder-id')

    expect(folders).toEqual([{ id: 'a', name: 'trip-a' }, { id: 'b', name: 'trip-b' }])
  })
})

describe('trashFolder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('PATCHes trashed: true rather than permanently deleting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({}))

    await trashFolder('token', 'folder-1')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('folder-1')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ trashed: true })
  })
})
