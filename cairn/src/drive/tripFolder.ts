/* One subfolder per trip, nested under the account's `/Cairn/` folder,
   found by name rather than stored on the `TripRecord` — see #34's design
   notes on why the folder isn't part of the trip's own persisted shape.
   Mirrors `cairnFolder.ts`'s list/create pattern exactly, scoped to a
   `parents` filter instead of `'root'`. */

import { DriveAuthError, DriveRequestError } from './rootFolder'
import { reportDriveAuthError } from './authEvents'

export { DriveAuthError, DriveRequestError }

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

interface DriveFile {
  id: string
  createdTime: string
}

async function driveFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    // #96: this was the one `drive/*.ts` module that threw `DriveAuthError`
    // without reporting it — every caller (`useDraftTrip.save()` directly,
    // `DriveTripStore`'s flush/migrate internally) saw a bare thrown error
    // with no way to learn the token had actually expired, and the account
    // never transitioned to `token-expired`/`Reconnect`.
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  return response.json()
}

async function listTripFolders(
  accessToken: string,
  cairnFolderId: string,
  tripId: string,
): Promise<DriveFile[]> {
  const query = [
    `name='${tripId}'`,
    `mimeType='${FOLDER_MIME_TYPE}'`,
    `'${cairnFolderId}' in parents`,
    'trashed=false',
  ].join(' and ')

  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,createdTime)`
  const body = (await driveFetch(url, accessToken)) as { files?: DriveFile[] }
  return body.files ?? []
}

async function createTripFolder(
  accessToken: string,
  cairnFolderId: string,
  tripId: string,
): Promise<DriveFile> {
  return (await driveFetch(DRIVE_FILES_URL, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tripId,
      mimeType: FOLDER_MIME_TYPE,
      parents: [cairnFolderId],
    }),
  })) as DriveFile
}

async function resolveTripFolder(
  accessToken: string,
  cairnFolderId: string,
  tripId: string,
): Promise<string> {
  const existing = await listTripFolders(accessToken, cairnFolderId, tripId)
  if (existing.length > 0) {
    const oldest = [...existing].sort((a, b) => a.createdTime.localeCompare(b.createdTime))[0]
    return oldest.id
  }
  const created = await createTripFolder(accessToken, cairnFolderId, tripId)
  return created.id
}

/** Keyed by `cairnFolderId:tripId`, holding the in-flight lookup for a trip
    folder that hasn't resolved yet. `DriveTripStore`, `DriveLooseStore`,
    `useDraftTrip` and `useTripImport` all resolve the same trip's folder
    independently rather than through one shared queue — the list-then-create
    below is only race-safe against a *sequential* second caller, and two of
    those calls landing in the same tick (creating a trip and immediately
    uploading a track to it, say) each see the folder doesn't exist yet
    before either's create request lands, so both create one. Sharing the
    pending promise here closes that: every concurrent caller for the same
    id awaits the one lookup/create in flight instead of racing it. */
const pending = new Map<string, Promise<string>>()

/** Reuses an existing per-trip folder rather than creating a duplicate. If
    more than one exists — e.g. a race between two tabs, which this
    in-process cache can't cover — the oldest by `createdTime` wins, same
    tie-break as `findOrCreateRootFolder`. */
export async function findOrCreateTripFolder(
  accessToken: string,
  cairnFolderId: string,
  tripId: string,
): Promise<string> {
  const key = `${cairnFolderId}:${tripId}`
  const existing = pending.get(key)
  if (existing) return existing

  const promise = resolveTripFolder(accessToken, cairnFolderId, tripId).finally(() => {
    pending.delete(key)
  })
  pending.set(key, promise)
  return promise
}
