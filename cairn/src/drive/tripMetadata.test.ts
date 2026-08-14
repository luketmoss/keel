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

  it('returns the file id and head revision when a file with that name exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ files: [{ id: 'file-1', headRevisionId: 'rev-3' }] }),
    )

    const ref = await findJsonFile('token', 'folder-1', 'trip.json')

    expect(ref).toEqual({ fileId: 'file-1', headRevisionId: 'rev-3' })
  })

  it('returns a null head revision when Drive reports none', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ files: [{ id: 'file-1' }] }))

    expect(await findJsonFile('token', 'folder-1', 'trip.json')).toEqual({
      fileId: 'file-1',
      headRevisionId: null,
    })
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

  it('reads content and current head revision together', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('alt=media')) return jsonResponse({ name: 'Hokkaido' })
      return jsonResponse({ headRevisionId: 'rev-5' })
    })

    const result = await readJsonFile<{ name: string }>('token', 'file-1')

    expect(result).toEqual({ data: { name: 'Hokkaido' }, headRevisionId: 'rev-5' })
  })
})

describe('writeJsonFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a new file via multipart upload when nothing exists yet', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 'new-file', headRevisionId: 'rev-1' }))

    const ref = await writeJsonFile('token', 'folder-1', 'trip.json', { name: 'Hokkaido' }, null)

    expect(ref).toEqual({ fileId: 'new-file', headRevisionId: 'rev-1' })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('uploadType=multipart')
    expect(init?.method).toBe('POST')
  })

  it('overwrites in place when the head revision matches what was last read', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // staleness check
      .mockResolvedValueOnce(jsonResponse({ headRevisionId: 'rev-1' }))
      // overwrite
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', headRevisionId: 'rev-2' }))

    const ref = await writeJsonFile(
      'token',
      'folder-1',
      'trip.json',
      { name: 'Iceland' },
      { fileId: 'file-1', headRevisionId: 'rev-1' },
    )

    expect(ref).toEqual({ fileId: 'file-1', headRevisionId: 'rev-2' })
    const [url, init] = fetchSpy.mock.calls[1]
    expect(String(url)).toContain('uploadType=media')
    expect(init?.method).toBe('PATCH')
  })

  /* #149 — the bug this file's concurrency token exists to have stopped
     causing. `version` moves for changes cairn never made, so a second
     consecutive edit was rejected against a file nobody else touched. The
     ref returned by one write has to be enough for the next one. */
  it('accepts a second consecutive write using the ref the first one returned', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ headRevisionId: 'rev-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', headRevisionId: 'rev-2' }))
      // The file's `version` has moved on twice by now — irrelevant, because
      // nothing uploaded new content, so the revision is still `rev-2`.
      .mockResolvedValueOnce(jsonResponse({ headRevisionId: 'rev-2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', headRevisionId: 'rev-3' }))

    const first = await writeJsonFile(
      'token',
      'folder-1',
      'trip.json',
      { name: 'Iceland' },
      { fileId: 'file-1', headRevisionId: 'rev-1' },
    )
    const second = await writeJsonFile('token', 'folder-1', 'trip.json', { name: 'Norway' }, first)

    expect(second).toEqual({ fileId: 'file-1', headRevisionId: 'rev-3' })
  })

  it('throws DriveConflictError when the head revision has moved on since it was last read', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ headRevisionId: 'rev-2' }))

    await expect(
      writeJsonFile(
        'token',
        'folder-1',
        'trip.json',
        { name: 'Iceland' },
        { fileId: 'file-1', headRevisionId: 'rev-1' },
      ),
    ).rejects.toBeInstanceOf(DriveConflictError)
  })

  // A missing id is no information, not evidence of a change — refusing on
  // it would block every edit of a file Drive reports no revision for.
  it('writes anyway when the ref carries no head revision', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ headRevisionId: 'rev-9' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1', headRevisionId: 'rev-10' }))

    const ref = await writeJsonFile(
      'token',
      'folder-1',
      'trip.json',
      { name: 'Iceland' },
      { fileId: 'file-1', headRevisionId: null },
    )

    expect(ref).toEqual({ fileId: 'file-1', headRevisionId: 'rev-10' })
    expect(String(fetchSpy.mock.calls[1][0])).toContain('uploadType=media')
  })

  it('writes anyway when Drive reports no head revision for the file', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ id: 'file-1' }))

    const ref = await writeJsonFile(
      'token',
      'folder-1',
      'trip.json',
      { name: 'Iceland' },
      { fileId: 'file-1', headRevisionId: 'rev-1' },
    )

    expect(ref).toEqual({ fileId: 'file-1', headRevisionId: null })
    expect(String(fetchSpy.mock.calls[1][0])).toContain('uploadType=media')
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
