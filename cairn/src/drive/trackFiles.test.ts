import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DriveAuthError,
  DriveQuotaError,
  DriveRequestError,
  startResumableUpload,
  uploadFileContent,
} from './trackFiles'

function response(
  body: unknown,
  { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key] ?? null } as Headers,
    json: async () => body,
    blob: async () => new Blob([]),
  } as unknown as Response
}

function file(content: string, name = 'track.kml'): File {
  return new File([content], name)
}

describe('startResumableUpload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the session URI from the Location header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({}, { headers: { Location: 'https://upload.example/session-1' } }),
    )

    const sessionUri = await startResumableUpload('token', 'folder-id', 'track.kml')

    expect(sessionUri).toBe('https://upload.example/session-1')
  })

  it('throws DriveRequestError when no Location header is returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({}))

    await expect(
      startResumableUpload('token', 'folder-id', 'track.kml'),
    ).rejects.toBeInstanceOf(DriveRequestError)
  })

  it('throws DriveAuthError on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({}, { status: 401 }))

    await expect(
      startResumableUpload('expired', 'folder-id', 'track.kml'),
    ).rejects.toBeInstanceOf(DriveAuthError)
  })
})

describe('uploadFileContent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads the whole file in one PUT when nothing goes wrong', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ id: 'file-1' }))

    const result = await uploadFileContent('https://upload.example/session-1', file('hello'), 'token')

    expect(result).toEqual({ id: 'file-1' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('resumes from the byte offset Drive reports after a dropped connection', async () => {
    const body = '0123456789'
    const onRetryFromByte = vi.fn()

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // first attempt drops mid-transfer
      .mockRejectedValueOnce(new TypeError('network drop'))
      // Drive reports it received bytes 0-4 (5 bytes)
      .mockResolvedValueOnce(response(undefined, { status: 308, headers: { Range: 'bytes=0-4' } }))
      // resumed PUT completes
      .mockResolvedValueOnce(response({ id: 'file-2' }))

    const result = await uploadFileContent(
      'https://upload.example/session-1',
      file(body),
      'token',
      onRetryFromByte,
    )

    expect(result).toEqual({ id: 'file-2' })
    expect(onRetryFromByte).toHaveBeenCalledWith(5)
    const [, resumeInit] = fetchSpy.mock.calls[2]
    expect((resumeInit?.headers as Record<string, string>)['Content-Range']).toBe(
      `bytes 5-${body.length - 1}/${body.length}`,
    )
  })

  it('throws DriveRequestError once retries are exhausted', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({}, { status: 500 }))
      .mockResolvedValueOnce(response(undefined, { status: 308 }))
      .mockResolvedValueOnce(response({}, { status: 500 }))
      .mockResolvedValueOnce(response(undefined, { status: 308 }))
      .mockResolvedValueOnce(response({}, { status: 500 }))

    await expect(
      uploadFileContent('https://upload.example/session-1', file('hello'), 'token'),
    ).rejects.toBeInstanceOf(DriveRequestError)
  })

  it('throws DriveAuthError if a 401 turns up while checking resume progress', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network drop'))
      .mockResolvedValueOnce(response({}, { status: 401 }))

    await expect(
      uploadFileContent('https://upload.example/session-1', file('hello'), 'token'),
    ).rejects.toBeInstanceOf(DriveAuthError)
  })

  it('throws DriveQuotaError, a DriveRequestError subclass, when Drive reports the account is full', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(
        { error: { status: 'RESOURCE_EXHAUSTED', errors: [{ reason: 'storageQuotaExceeded' }] } },
        { status: 403 },
      ),
    )

    const failure = uploadFileContent('https://upload.example/session-1', file('hello'), 'token')
    await expect(failure).rejects.toBeInstanceOf(DriveQuotaError)
    await expect(failure).rejects.toBeInstanceOf(DriveRequestError)
  })

  it('throws the plain DriveRequestError for a rejected upload that is not a quota failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, { status: 500 }))

    const failure = uploadFileContent('https://upload.example/session-1', file('hello'), 'token')
    await expect(failure).rejects.toBeInstanceOf(DriveRequestError)
    await expect(failure).rejects.not.toBeInstanceOf(DriveQuotaError)
  })
})
