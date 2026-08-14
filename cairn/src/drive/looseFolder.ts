/* `/Cairn/loose/tracks/` and `/Cairn/loose/cairns/` — where a track or a
   cairn lives when no trip owns it. Same list/create pattern as
   `tripFolder.ts`, one level deeper, plus the one call that moves a file
   between folders.

   The storage layout is normative in
   `cairn/docs/design/shell-and-content-model.md`. */

import { DriveAuthError, DriveRequestError } from './rootFolder'
import { reportDriveAuthError } from './authEvents'

export { DriveAuthError, DriveRequestError }

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const LOOSE_FOLDER_NAME = 'loose'

export type LooseKind = 'track' | 'cairn'

/** The folder name each kind lives in. Plural, because the folder holds
    many — and fixed here rather than derived from the kind so a rename of
    the type never silently relocates a user's files. */
const KIND_FOLDER: Record<LooseKind, string> = { track: 'tracks', cairn: 'cairns' }

interface DriveFile {
  id: string
  createdTime: string
}

async function driveFetch(url: string, accessToken: string, init?: RequestInit): Promise<unknown> {
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
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  return response.json()
}

async function listChildFolders(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveFile[]> {
  const query = [
    `name='${name}'`,
    `mimeType='${FOLDER_MIME_TYPE}'`,
    `'${parentId}' in parents`,
    'trashed=false',
  ].join(' and ')

  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,createdTime)`
  const body = (await driveFetch(url, accessToken)) as { files?: DriveFile[] }
  return body.files ?? []
}

async function createChildFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveFile> {
  return (await driveFetch(DRIVE_FILES_URL, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
  })) as DriveFile
}

/** Exported for `tripCairnFolder.ts`, which needs the same generic
    find-or-create-a-named-child-folder primitive one level up: a trip-owned
    cairn's folder is `trips/<id>/cairns/<cairn-id>/`, and duplicating this
    function there would be a second copy of the same race-tiebreak logic to
    keep in step. */
export async function findOrCreateChild(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const existing = await listChildFolders(accessToken, parentId, name)
  if (existing.length > 0) {
    // Oldest by `createdTime` wins a race between two tabs, same tie-break
    // as `findOrCreateRootFolder` and `findOrCreateTripFolder`.
    return [...existing].sort((a, b) => a.createdTime.localeCompare(b.createdTime))[0].id
  }
  return (await createChildFolder(accessToken, parentId, name)).id
}

/** `/Cairn/loose/<tracks|cairns>/`, creating either level if it is missing.
    Sequential rather than parallel: the second call needs the first's id. */
export async function findOrCreateLooseFolder(
  accessToken: string,
  cairnFolderId: string,
  kind: LooseKind,
): Promise<string> {
  const looseId = await findOrCreateChild(accessToken, cairnFolderId, LOOSE_FOLDER_NAME)
  return findOrCreateChild(accessToken, looseId, KIND_FOLDER[kind])
}

/** `/Cairn/loose/<tracks|cairns>/<item-id>/` — one folder per loose item,
    standing to a loose item as a trip's folder does to a trip, and named by
    its id for the same reason: hydration reads the folder name back as the
    id rather than needing a separate index file. */
export async function findOrCreateLooseItemFolder(
  accessToken: string,
  cairnFolderId: string,
  kind: LooseKind,
  itemId: string,
): Promise<string> {
  const kindFolderId = await findOrCreateLooseFolder(accessToken, cairnFolderId, kind)
  return findOrCreateChild(accessToken, kindFolderId, itemId)
}

/** Moves a file between folders.
 *
 * Drive does this in **one** request — `addParents` and `removeParents` on
 * a single `files.update` — so the move is atomic after all. The design
 * note assumed two operations and specified that the item stay where it was
 * unless both succeeded; one call gives that for free, and there is no
 * half-moved state to guard against. */
export async function moveDriveFile(
  accessToken: string,
  fileId: string,
  fromFolderId: string,
  toFolderId: string,
): Promise<void> {
  const url =
    `${DRIVE_FILES_URL}/${fileId}` +
    `?addParents=${encodeURIComponent(toFolderId)}` +
    `&removeParents=${encodeURIComponent(fromFolderId)}` +
    `&fields=id`
  await driveFetch(url, accessToken, { method: 'PATCH' })
}
