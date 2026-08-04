/* Drive operations on files inside a trip folder: list what's already
   there, download for re-parsing on load, and upload freshly-imported files
   via a resumable session so a dropped connection mid-upload doesn't force
   starting over. Plain `fetch` throughout, same reasoning as
   `cairnFolder.ts` — every call is a request a test can mock. */

import { DriveAuthError, DriveRequestError } from './cairnFolder'
import { reportDriveAuthError } from './authEvents'

export { DriveAuthError, DriveRequestError }

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable'
const MAX_UPLOAD_ATTEMPTS = 3

/** A `DriveRequestError` specifically for a full Drive — `storageQuotaExceeded`
    in the API's error body. A subclass rather than a sibling of
    `DriveRequestError` so existing `instanceof DriveRequestError` checks
    (track import's generic failure handling) keep working unchanged; only a
    caller that wants the friendlier "Drive is out of space" copy (#51's
    photo import) needs to check for this specifically. */
export class DriveQuotaError extends DriveRequestError {
  constructor() {
    super('Drive storage quota exceeded')
    this.name = 'DriveQuotaError'
  }
}

/** Best-effort read of a failed response's error reason, used only to tell
    a full Drive apart from any other rejected upload. Never throws — a
    body that isn't JSON, or doesn't have the shape expected, just means
    "not detectably a quota error". */
async function isQuotaExceeded(response: Response): Promise<boolean> {
  try {
    const body = (await response.json()) as {
      error?: { errors?: { reason?: string }[]; status?: string }
    }
    const reasons = body.error?.errors?.map((e) => e.reason) ?? []
    return reasons.includes('storageQuotaExceeded') || body.error?.status === 'RESOURCE_EXHAUSTED'
  } catch {
    return false
  }
}

async function uploadRequestError(response: Response, message: string): Promise<DriveRequestError> {
  return (await isQuotaExceeded(response)) ? new DriveQuotaError() : new DriveRequestError(message)
}

export interface DriveTrackFile {
  id: string
  name: string
}

export async function listTrackFiles(
  accessToken: string,
  folderId: string,
): Promise<DriveTrackFile[]> {
  const query = [`'${folderId}' in parents`, 'trashed=false'].join(' and ')
  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`

  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const body = (await response.json()) as { files?: DriveTrackFile[] }
  return body.files ?? []
}

/** `alt=media` returns raw bytes with no filename in the body, so the
    caller (which already has the name from `listTrackFiles`) supplies it —
    simpler than a second request for metadata just to learn what
    `listTrackFiles` already told us. */
export async function downloadTrackFile(
  accessToken: string,
  fileId: string,
  name: string,
): Promise<File> {
  const url = `${DRIVE_FILES_URL}/${fileId}?alt=media`

  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  const blob = await response.blob()
  return new File([blob], name)
}

/** Trashes a single file in place — the file-level sibling of
    `tripMetadata.ts`'s `trashFolder`, used by #77's track/photo removal
    instead of that one because a track or photo is one file inside a trip
    folder, not the folder itself. Trash rather than permanent delete, same
    reasoning as `trashFolder`: recoverable from Drive's own trash. Trashing
    an already-trashed file succeeds idempotently, which is what lets a
    retry after a partial failure (original trashed, thumbnail not) re-run
    both without treating the first as an error. */
export async function trashFile(accessToken: string, fileId: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${DRIVE_FILES_URL}/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) throw new DriveAuthError()
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
}

/** Opens a resumable upload session and returns its session URI (the
    `Location` response header) — the target for the following
    `uploadFileContent` call(s), possibly more than one if the transfer
    needs to resume. */
export async function startResumableUpload(
  accessToken: string,
  folderId: string,
  fileName: string,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(DRIVE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (!response.ok) {
    throw await uploadRequestError(response, `Drive upload session failed with status ${response.status}`)
  }

  const location = response.headers.get('Location')
  if (!location) {
    throw new DriveRequestError('Drive did not return an upload session URI')
  }
  return location
}

/** Asks Drive how many bytes of the session it has actually received, per
    the resumable-upload protocol's status-check request (an empty PUT with
    a wildcard `Content-Range`). A `308` with no `Range` header means
    nothing has arrived yet; a success status means the prior attempt
    actually landed and there's nothing left to resume. */
async function queryReceivedBytes(
  sessionUri: string,
  accessToken: string,
  total: number,
): Promise<number> {
  let response: Response
  try {
    response = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Range': `bytes */${total}`,
      },
    })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (response.status === 308) {
    const range = response.headers.get('Range')
    const match = range ? /bytes=0-(\d+)/.exec(range) : null
    return match ? Number(match[1]) + 1 : 0
  }
  if (response.ok) return total
  throw new DriveRequestError(`Drive upload status check failed with status ${response.status}`)
}

/** Uploads the file's raw bytes to an already-opened resumable session.
    A network failure mid-transfer queries how much Drive actually received
    and resumes from that byte offset rather than restarting the whole file —
    invisible to the caller unless retries run out, at which point this
    throws and the batch's failure list is the caller's job, not this
    module's. Capped at `MAX_UPLOAD_ATTEMPTS` so a persistently broken
    connection fails rather than retrying forever. */
export async function uploadFileContent(
  sessionUri: string,
  file: File,
  accessToken: string,
  onRetryFromByte?: (byte: number) => void,
): Promise<{ id: string }> {
  const total = file.size
  let offset = 0

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      const chunk = offset === 0 ? file : file.slice(offset)
      const response = await fetch(sessionUri, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Range': `bytes ${offset}-${Math.max(total - 1, 0)}/${total}`,
        },
        body: chunk,
      })

      if (response.status === 401) {
        reportDriveAuthError(accessToken)
        throw new DriveAuthError()
      }
      if (response.ok) {
        return (await response.json()) as { id: string }
      }
      throw await uploadRequestError(response, `Drive upload failed with status ${response.status}`)
    } catch (error) {
      // Neither is worth retrying: a fresh token is needed before an auth
      // error can succeed, and a full Drive won't free space between
      // attempts — retrying either just burns the attempt budget on a
      // failure that's already fully diagnosed.
      if (error instanceof DriveAuthError || error instanceof DriveQuotaError) throw error
      if (attempt >= MAX_UPLOAD_ATTEMPTS) {
        throw error instanceof DriveRequestError
          ? error
          : new DriveRequestError(error instanceof Error ? error.message : 'Upload failed')
      }
      // Transient failure — find out what Drive actually has and resume
      // from there rather than restarting the whole file.
      offset = await queryReceivedBytes(sessionUri, accessToken, total)
      onRetryFromByte?.(offset)
    }
  }

  // Unreachable — the loop above always returns or throws — but keeps the
  // function's return type honest without a non-null assertion.
  throw new DriveRequestError('Drive upload failed')
}
