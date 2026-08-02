/* `photos.json`: one small JSON file per trip folder recording what a
   photo import batch produced — Drive file ids for the original and
   thumbnail, the filename, EXIF capture time (both fields, kept distinct
   per #50), and location when EXIF carried one. Written once at the end of
   a batch (design doc point 4), not once per photo.

   Reuses the same resumable-upload machinery as track files
   (`drive/trackFiles.ts`) rather than a second upload path — a small JSON
   blob still goes through `startResumableUpload`/`uploadFileContent`
   exactly like a track. Reading back reuses `listTrackFiles` (which lists
   every file in a trip folder, not just tracks) to find `photos.json` by
   name, then `downloadTrackFile` for its bytes — the same read-back
   pattern `useTripImport` uses for tracks. */

import {
  downloadTrackFile,
  listTrackFiles,
  startResumableUpload,
  uploadFileContent,
} from '../drive/trackFiles'

export const PHOTOS_INDEX_NAME = 'photos.json'

/** One imported photo's record. `latitude`/`longitude` are both present or
    both absent — EXIF never carries one without the other (see #50). */
export interface PhotoRecord {
  /** Locally-generated, stable only within one loaded session — not
      persisted, regenerated on every read-back. Mirrors `ImportedFile.id`
      for tracks. */
  id: string
  name: string
  originalDriveFileId: string
  thumbnailDriveFileId: string
  latitude?: number
  longitude?: number
  /** Absolute UTC instant from EXIF GPS tags — see `PhotoExif.gpsTimestamp`. */
  gpsTimestamp?: string
  /** Wall-clock capture time with no timezone — see `PhotoExif.dateTimeOriginal`.
      Kept distinct from `gpsTimestamp` rather than collapsed into one
      field, per #50. */
  dateTimeOriginal?: string
}

/** The on-disk shape of `photos.json`. A `version` field is included so a
    future reshape has somewhere to branch on, even though nothing reads it
    yet. */
interface PhotoIndexFile {
  version: 1
  photos: Omit<PhotoRecord, 'id'>[]
}

function isPhotoRecord(value: unknown): value is Omit<PhotoRecord, 'id'> {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.name === 'string' &&
    typeof record.originalDriveFileId === 'string' &&
    typeof record.thumbnailDriveFileId === 'string' &&
    (record.latitude === undefined || typeof record.latitude === 'number') &&
    (record.longitude === undefined || typeof record.longitude === 'number') &&
    (record.gpsTimestamp === undefined || typeof record.gpsTimestamp === 'string') &&
    (record.dateTimeOriginal === undefined || typeof record.dateTimeOriginal === 'string')
  )
}

function isPhotoIndexFile(value: unknown): value is PhotoIndexFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Record<string, unknown>
  return file.version === 1 && Array.isArray(file.photos) && file.photos.every(isPhotoRecord)
}

let nextId = 0
function generateId(): string {
  nextId += 1
  return `photo-${nextId}`
}

/* FileReader rather than File#text(): the same jsdom gap `exif.ts` and
   `kml/parse.ts` already work around — `Blob#text()`/`arrayBuffer()` are
   unimplemented under jsdom, which the test suite runs under. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

/** Writes `photos.json` for a batch. Per the design doc, called once at
    the end of a batch with every photo that succeeded — never for a batch
    where nothing succeeded (the caller's job to skip that call; see
    `usePhotoImport`). Whether a second import's index merges with or
    replaces the first is explicitly left undecided by the design doc; this
    always writes a fresh file, which the "replaces" reading of that
    sentence satisfies without inventing a merge policy the doc doesn't
    ask for. */
export async function writePhotoIndex(
  accessToken: string,
  folderId: string,
  photos: Omit<PhotoRecord, 'id'>[],
): Promise<void> {
  const body: PhotoIndexFile = { version: 1, photos }
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
  const file = new File([blob], PHOTOS_INDEX_NAME, { type: 'application/json' })

  const sessionUri = await startResumableUpload(accessToken, folderId, PHOTOS_INDEX_NAME)
  await uploadFileContent(sessionUri, file, accessToken)
}

/** Reads back the most recently written `photos.json` from a trip folder,
    or an empty list if none exists yet or it can't be read — same "missing
    is not an error" stance as `LocalTripStore`'s corrupted-index handling.
    If more than one `photos.json` exists (a race between two tabs, same as
    `findOrCreateTripFolder`'s folder race), the most recently created one
    wins. */
export async function readPhotoIndex(accessToken: string, folderId: string): Promise<PhotoRecord[]> {
  try {
    const files = await listTrackFiles(accessToken, folderId)
    const indexFiles = files.filter((file) => file.name === PHOTOS_INDEX_NAME)
    if (indexFiles.length === 0) return []
    const target = indexFiles[indexFiles.length - 1]

    const downloaded = await downloadTrackFile(accessToken, target.id, target.name)
    const text = await readAsText(downloaded)
    const parsed = JSON.parse(text)
    if (!isPhotoIndexFile(parsed)) return []
    return parsed.photos.map((record) => ({ ...record, id: generateId() }))
  } catch {
    return []
  }
}
