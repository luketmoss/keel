/* Small-JSON Drive files inside a trip folder — `trip.json`,
   `overview.geojson`, `overrides.json` — as opposed to `trackFiles.ts`'s
   resumable protocol for the (larger, user-picked) KML/KMZ files
   themselves. A simple `uploadType=media` upload is the right size for a
   few kilobytes of JSON. Plain `fetch`, same reasoning as every other
   `src/drive/*` module. */

import { DriveAuthError, DriveRequestError } from './cairnFolder'

export { DriveAuthError, DriveRequestError }

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

/** A write was rejected because the file changed in Drive since this store
    last read it — another tab or device wrote first. Drive API v3 has no
    `If-Match`/conditional-write support on `files.update` (that's a v2
    concept the REST API never carried forward), so this is an
    application-level check rather than a server-guaranteed one: read the
    file's current `version` immediately before writing and compare it to
    the version this store last saw. It closes the common case — a stale
    write from a session that hasn't refreshed — without claiming true
    atomicity; a write landing in the gap between the check and the PUT
    would still win. Acceptable for cairn's actual concurrency (one person,
    rarely two tabs at once), not for a multi-writer system. */
export class DriveConflictError extends DriveRequestError {
  constructor() {
    super('Drive file changed since it was last read')
    this.name = 'DriveConflictError'
  }
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }
  if (response.status === 401) throw new DriveAuthError()
  return response
}

export interface DriveFileRef {
  fileId: string
  /** Drive's `version` field — a monotonically increasing per-file counter,
      not a hash. Used only as a staleness check, see `DriveConflictError`. */
  version: string
}

/** Looks up a file by exact name within one folder — Drive addresses files
    by id, not path, so every read/write of a known JSON file starts here.
    `null` when no such file exists yet (nothing has been written there). */
export async function findJsonFile(
  accessToken: string,
  folderId: string,
  fileName: string,
): Promise<DriveFileRef | null> {
  const query = [`name='${fileName}'`, `'${folderId}' in parents`, 'trashed=false'].join(' and ')
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,version)`
  const response = await driveFetch(url, accessToken)
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const body = (await response.json()) as { files?: { id: string; version: string }[] }
  const file = body.files?.[0]
  return file ? { fileId: file.id, version: file.version } : null
}

async function currentVersion(accessToken: string, fileId: string): Promise<string> {
  const response = await driveFetch(`${DRIVE_FILES_URL}/${fileId}?fields=version`, accessToken)
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const body = (await response.json()) as { version: string }
  return body.version
}

/** Reads a JSON file's content and current `version` together — two
    requests (content has no metadata fields alongside `alt=media`), but
    these files are read rarely (hydration, or after losing a conflict)
    next to how often they're written. */
export async function readJsonFile<T>(accessToken: string, fileId: string): Promise<{ data: T; version: string }> {
  const [contentResponse, version] = await Promise.all([
    driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, accessToken),
    currentVersion(accessToken, fileId),
  ])
  if (!contentResponse.ok) {
    throw new DriveRequestError(`Drive request failed with status ${contentResponse.status}`)
  }
  const data = (await contentResponse.json()) as T
  return { data, version }
}

/** Creates `fileName` fresh in `folderId` — the multipart body is Drive's
    way of setting both metadata (name, parent) and content in one request,
    which the plain `uploadType=media` used by `overwrite` below can't do
    since it has nowhere to carry the file's name. */
async function create(
  accessToken: string,
  folderId: string,
  fileName: string,
  data: unknown,
): Promise<DriveFileRef> {
  const boundary = 'cairn-metadata-boundary'
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] })
  const content = JSON.stringify(data)
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`

  const response = await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,version`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!response.ok) {
    throw new DriveRequestError(`Drive upload failed with status ${response.status}`)
  }
  const file = (await response.json()) as { id: string; version: string }
  return { fileId: file.id, version: file.version }
}

/** Replaces `fileId`'s content in place, after confirming its `version`
    still matches `expectedVersion` — see `DriveConflictError`. */
async function overwrite(
  accessToken: string,
  fileId: string,
  expectedVersion: string,
  data: unknown,
): Promise<DriveFileRef> {
  const latest = await currentVersion(accessToken, fileId)
  if (latest !== expectedVersion) throw new DriveConflictError()

  const response = await driveFetch(
    `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media&fields=id,version`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  )
  if (!response.ok) {
    throw new DriveRequestError(`Drive upload failed with status ${response.status}`)
  }
  const file = (await response.json()) as { id: string; version: string }
  return { fileId: file.id, version: file.version }
}

/** Writes `data` as `fileName` in `folderId`: creates it if `existing` is
    `null`, otherwise overwrites in place after the staleness check above.
    The one entry point every store's flush goes through. */
export async function writeJsonFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  data: unknown,
  existing: DriveFileRef | null,
): Promise<DriveFileRef> {
  return existing
    ? overwrite(accessToken, existing.fileId, existing.version, data)
    : create(accessToken, folderId, fileName, data)
}

/** Every direct child folder of `parentFolderId` — used to enumerate trip
    folders under `/Cairn/` without knowing their trip ids up front, which
    is what lets the trip index be derived from Drive rather than kept as
    its own file (see #59's design note). */
export async function listSubfolders(
  accessToken: string,
  parentFolderId: string,
): Promise<{ id: string; name: string }[]> {
  const query = [
    "mimeType='application/vnd.google-apps.folder'",
    `'${parentFolderId}' in parents`,
    'trashed=false',
  ].join(' and ')
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`
  const response = await driveFetch(url, accessToken)
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const body = (await response.json()) as { files?: { id: string; name: string }[] }
  return body.files ?? []
}

/** Trashes a folder (and everything in it) — used to remove a deleted
    trip's Drive-side data. Trash rather than permanent delete: recoverable
    from Drive's own trash if a delete was a mistake, same safety margin a
    user gets deleting any other file by hand. */
export async function trashFolder(accessToken: string, folderId: string): Promise<void> {
  const response = await driveFetch(`${DRIVE_FILES_URL}/${folderId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
}
