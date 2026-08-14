/* `/Cairn/trips/<trip-id>/cairns/` and `/Cairn/trips/<trip-id>/cairns/<cairn-id>/`
   — where a trip-owned cairn lives, per `cairn/docs/design/cairns.md`'s
   storage layout. A cairn is a folder, the same shape as a loose one
   (`looseFolder.ts`'s `findOrCreateLooseItemFolder`), just one level under
   the trip's own folder instead of under `loose/`. That symmetry is what
   lets `Add to a trip`/`Remove from trip` be a single-call folder move
   (`moveDriveFile` on the item's own folder id) rather than the
   per-file-plus-index bookkeeping the old `photos.json` needed. */

import { findOrCreateChild } from './looseFolder'
import { findOrCreateTripFolder } from './tripFolder'

const CAIRNS_FOLDER_NAME = 'cairns'

/** `/Cairn/trips/<trip-id>/cairns/`, creating every level that's missing. */
export async function findOrCreateTripCairnsFolder(
  accessToken: string,
  cairnFolderId: string,
  tripId: string,
): Promise<string> {
  const tripFolderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
  return findOrCreateChild(accessToken, tripFolderId, CAIRNS_FOLDER_NAME)
}

/** `/Cairn/trips/<trip-id>/cairns/<cairn-id>/` — one folder per trip-owned
    cairn, named by its id for the same reason a loose item's is: hydration
    reads the folder name back as the id rather than needing an index. */
export async function findOrCreateTripCairnItemFolder(
  accessToken: string,
  cairnFolderId: string,
  tripId: string,
  cairnId: string,
): Promise<string> {
  const cairnsFolderId = await findOrCreateTripCairnsFolder(accessToken, cairnFolderId, tripId)
  return findOrCreateChild(accessToken, cairnsFolderId, cairnId)
}
