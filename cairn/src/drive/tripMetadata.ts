/* Small-JSON Drive files inside a trip folder — `trip.json`,
   `overview.geojson`, `overrides.json` — as opposed to `trackFiles.ts`'s
   resumable protocol for the (larger, user-picked) KML/KMZ files
   themselves. A simple `uploadType=media` upload is the right size for a
   few kilobytes of JSON. Plain `fetch`, same reasoning as every other
   `src/drive/*` module. */

import { DriveAuthError, DriveRequestError } from './rootFolder'
import { reportDriveAuthError } from './authEvents'

export { DriveAuthError, DriveRequestError }

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

/** A write was rejected because the file changed in Drive since this store
    last read it — another tab or device wrote first. Drive API v3 has no
    `If-Match`/conditional-write support on `files.update` (that's a v2
    concept the REST API never carried forward), so this is an
    application-level check rather than a server-guaranteed one: read the
    file's current `headRevisionId` immediately before writing and compare
    it to the one this store last saw. It closes the common case — a stale
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
  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  return response
}

export interface DriveFileRef {
  fileId: string
  /** Drive's `headRevisionId` — the id of the file's current content
      revision. Used only as a staleness check, see `DriveConflictError`.
 *
 * **Not `version`, deliberately (#149).** `version` is a counter that, per
 * Drive's own documentation, "reflects every change made to the file on
 * the server, even those not visible to the user" — including changes
 * Drive makes to a file of its own accord just after an upload. That makes
 * the value echoed back by a write already stale by the time the next edit
 * checks it, so every second edit was rejected against a file nobody else
 * had touched. A revision id moves only when content is actually
 * uploaded, which is the question this field exists to answer.
 *
 * `null` when Drive reported none. Only files with binary content carry a
 * revision id, and while every file cairn writes through here is one, a
 * missing id means *no information* rather than *unchanged* — see
 * `overwrite` for what that does. */
  headRevisionId: string | null
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
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,headRevisionId)`
  const response = await driveFetch(url, accessToken)
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const body = (await response.json()) as { files?: { id: string; headRevisionId?: string }[] }
  const file = body.files?.[0]
  return file ? { fileId: file.id, headRevisionId: file.headRevisionId ?? null } : null
}

async function currentHeadRevisionId(accessToken: string, fileId: string): Promise<string | null> {
  const response = await driveFetch(`${DRIVE_FILES_URL}/${fileId}?fields=headRevisionId`, accessToken)
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const body = (await response.json()) as { headRevisionId?: string }
  return body.headRevisionId ?? null
}

/** Reads a JSON file's content and current `headRevisionId` together — two
    requests (content has no metadata fields alongside `alt=media`), but
    these files are read rarely (hydration, or after losing a conflict)
    next to how often they're written. */
export async function readJsonFile<T>(
  accessToken: string,
  fileId: string,
): Promise<{ data: T; headRevisionId: string | null }> {
  const [contentResponse, headRevisionId] = await Promise.all([
    driveFetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, accessToken),
    currentHeadRevisionId(accessToken, fileId),
  ])
  if (!contentResponse.ok) {
    throw new DriveRequestError(`Drive request failed with status ${contentResponse.status}`)
  }
  const data = (await contentResponse.json()) as T
  return { data, headRevisionId }
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

  const response = await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,headRevisionId`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!response.ok) {
    throw new DriveRequestError(`Drive upload failed with status ${response.status}`)
  }
  const file = (await response.json()) as { id: string; headRevisionId?: string }
  return { fileId: file.id, headRevisionId: file.headRevisionId ?? null }
}

/** Replaces `fileId`'s content in place, after confirming its
    `headRevisionId` still matches `expectedHeadRevisionId` — see
    `DriveConflictError`.

    The check refuses **only when both ids are present and differ**. A
    missing id on either side is no information, not evidence of a change,
    and failing closed on it would block every edit of a file Drive reports
    no revision for — which is #149's bug rewritten rather than fixed.
    Proceeding degrades to last-write-wins, the risk this module already
    documents accepting. */
async function overwrite(
  accessToken: string,
  fileId: string,
  expectedHeadRevisionId: string | null,
  data: unknown,
): Promise<DriveFileRef> {
  const latest = await currentHeadRevisionId(accessToken, fileId)
  if (expectedHeadRevisionId !== null && latest !== null && latest !== expectedHeadRevisionId) {
    throw new DriveConflictError()
  }

  const response = await driveFetch(
    `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media&fields=id,headRevisionId`,
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
  const file = (await response.json()) as { id: string; headRevisionId?: string }
  return { fileId: file.id, headRevisionId: file.headRevisionId ?? null }
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
    ? overwrite(accessToken, existing.fileId, existing.headRevisionId, data)
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
