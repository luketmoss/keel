import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DriveAuthError,
  DriveRequestError,
  findOrCreateCairnFolder,
  getDriveAccount,
} from './cairnFolder'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('getDriveAccount', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the email from about.get', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ user: { emailAddress: 'jane@gmail.com' } }),
    )

    const account = await getDriveAccount('token-123')

    expect(account).toEqual({ email: 'jane@gmail.com' })
  })

  it('sends the access token as a bearer header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ user: { emailAddress: 'jane@gmail.com' } }))

    await getDriveAccount('token-123')

    const [, init] = fetchSpy.mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  it('throws DriveAuthError on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401))

    await expect(getDriveAccount('expired')).rejects.toBeInstanceOf(DriveAuthError)
  })

  it('throws DriveRequestError on other failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 500))

    await expect(getDriveAccount('token')).rejects.toBeInstanceOf(DriveRequestError)
  })

  it('throws DriveRequestError on a network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'))

    await expect(getDriveAccount('token')).rejects.toBeInstanceOf(DriveRequestError)
  })
})

describe('findOrCreateCairnFolder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a folder when none exists', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'new-folder-id', createdTime: '2026-01-01' }))

    const folderId = await findOrCreateCairnFolder('token')

    expect(folderId).toBe('new-folder-id')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [createUrl, createInit] = fetchSpy.mock.calls[1]
    expect(createUrl).toContain('files')
    expect(createInit?.method).toBe('POST')
  })

  it('reuses an existing folder rather than creating a duplicate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ files: [{ id: 'existing-id', createdTime: '2025-06-01' }] }),
    )

    const folderId = await findOrCreateCairnFolder('token')

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

    const folderId = await findOrCreateCairnFolder('token')

    expect(folderId).toBe('older')
  })

  it('propagates DriveAuthError from the lookup call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401))

    await expect(findOrCreateCairnFolder('expired')).rejects.toBeInstanceOf(DriveAuthError)
  })

  // #73: the lookup used to require `'root' in parents`, so a `/Cairn/`
  // folder the user moved out of Drive root became invisible and the next
  // sign-in created a duplicate. Under `drive.file` the query already only
  // ever returns folders this app created, so the constraint never
  // distinguished anything — dropped here.
  it('#73: finds an existing folder without constraining the search to Drive root', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'moved-id', createdTime: '2025-06-01' }] }))

    const folderId = await findOrCreateCairnFolder('token')

    expect(folderId).toBe('moved-id')
    const [lookupUrl] = fetchSpy.mock.calls[0]
    expect(decodeURIComponent(String(lookupUrl))).not.toContain("'root' in parents")
  })
})
