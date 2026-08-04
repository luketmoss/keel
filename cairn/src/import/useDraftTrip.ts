import { useCallback, useState } from 'react'
import { parseKmlOrKmz, type Track } from '../kml/parse'
import { isPhotoFile, isTrackFile } from './fileKinds'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import { startResumableUpload, uploadFileContent } from '../drive/trackFiles'
import type { TripStatus, TripStore } from '../store/tripStore'

export interface DraftFile {
  id: string
  name: string
  file: File
  tracks: Track[]
}

export interface DraftState {
  files: DraftFile[]
  name: string
  status: TripStatus
  startDate: string | null
  endDate: string | null
  notes: string
  saving: boolean
  saveError: string | null
}

export interface DraftRejection {
  name: string
  message: string
}

let nextDraftFileId = 0
function generateDraftFileId(): string {
  nextDraftFileId += 1
  return `draft-file-${nextDraftFileId}`
}

/** The dropped filename without its extension, seeding the form's name
    field (#81's Main path, step 4). */
function nameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, '')
}

export interface UseDraftTrip {
  draft: DraftState | null
  /** Parses every incoming file, adding the valid ones to the draft
      (opening one if none is open yet) and returning a rejection — name
      plus copy — for every file that doesn't belong in it. Never throws;
      a file this can't parse is a rejection, not an exception. */
  addFiles: (files: File[]) => Promise<DraftRejection[]>
  updateName: (name: string) => void
  updateStatus: (status: TripStatus) => void
  updateDates: (startDate: string | null, endDate: string | null) => void
  updateNotes: (notes: string) => void
  /** Creates the trip, its overview, and uploads every dropped file to its
      Drive folder. Resolves `true` on success (the draft is cleared);
      `false` leaves the draft open with its route still drawn, for the
      caller to show the failure. Never called while signed out — the
      form swaps `Save` for a sign-in prompt instead (design doc's
      "Signed out" state). */
  save: () => Promise<boolean>
  cancel: () => void
}

/** #81: a trip that doesn't exist yet — parsed client-side from a drop
    outside any trip, held here until `save()` or `cancel()`. Deliberately
    not a `TripStore` method: `createTrip` is what makes a trip real (visible
    in the list, has a Drive folder), and nothing here should do that until
    the user confirms. */
export function useDraftTrip(
  tripStore: TripStore,
  accessToken: string | null,
  cairnFolderId: string | null,
): UseDraftTrip {
  const [draft, setDraft] = useState<DraftState | null>(null)

  const addFiles = useCallback(async (incoming: File[]): Promise<DraftRejection[]> => {
    const rejections: DraftRejection[] = []
    const accepted: DraftFile[] = []

    for (const file of incoming) {
      if (!isTrackFile(file.name)) {
        rejections.push({
          name: file.name,
          message: isPhotoFile(file.name)
            ? 'Photos belong to a trip — open one first.'
            : 'Only .kml and .kmz files can be imported.',
        })
        continue
      }

      const result = await parseKmlOrKmz(file)
      if (!result.ok) {
        rejections.push({ name: file.name, message: `${file.name} is not a valid KML file.` })
        continue
      }
      if (result.tracks.every((track) => track.points.length === 0)) {
        rejections.push({ name: file.name, message: `${file.name} has no tracks in it.` })
        continue
      }

      accepted.push({ id: generateDraftFileId(), name: file.name, file, tracks: result.tracks })
    }

    if (accepted.length > 0) {
      setDraft((prev) => {
        if (prev) return { ...prev, files: [...prev.files, ...accepted] }
        return {
          files: accepted,
          name: nameFromFileName(accepted[0].name),
          status: 'completed',
          startDate: null,
          endDate: null,
          notes: '',
          saving: false,
          saveError: null,
        }
      })
    }

    return rejections
  }, [])

  const updateName = useCallback((name: string) => {
    setDraft((prev) => (prev ? { ...prev, name } : prev))
  }, [])

  const updateStatus = useCallback((status: TripStatus) => {
    setDraft((prev) => (prev ? { ...prev, status } : prev))
  }, [])

  const updateDates = useCallback((startDate: string | null, endDate: string | null) => {
    setDraft((prev) => (prev ? { ...prev, startDate, endDate } : prev))
  }, [])

  const updateNotes = useCallback((notes: string) => {
    setDraft((prev) => (prev ? { ...prev, notes } : prev))
  }, [])

  const cancel = useCallback(() => {
    setDraft(null)
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    if (!draft || !accessToken || !cairnFolderId) return false

    setDraft((prev) => (prev ? { ...prev, saving: true, saveError: null } : prev))

    try {
      // Judgment call: `createTrip` runs before the uploads below, so a
      // failed upload leaves the trip record (and its overview/dot)
      // behind rather than nothing existing at all — `TripStore` has no
      // way to stage a trip under a caller-chosen id and commit it only
      // once every file has landed, and building one is a bigger change
      // than this issue asks for. The failure is still reported and the
      // draft still stays open (below) so the source files aren't lost.
      const entry = tripStore.createTrip(draft.name)
      await tripStore.updateTrip(entry.id, {
        status: draft.status,
        startDate: draft.startDate,
        endDate: draft.endDate,
        notes: draft.notes,
      })
      tripStore.saveOverview(
        entry.id,
        draft.files.flatMap((file) => file.tracks),
      )

      const folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, entry.id)
      for (const draftFile of draft.files) {
        const sessionUri = await startResumableUpload(accessToken, folderId, draftFile.name)
        await uploadFileContent(sessionUri, draftFile.file, accessToken)
      }

      setDraft(null)
      return true
    } catch {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              saveError: 'Could not save. Your tracks are still here — try again.',
            }
          : prev,
      )
      return false
    }
  }, [draft, accessToken, cairnFolderId, tripStore])

  return { draft, addFiles, updateName, updateStatus, updateDates, updateNotes, save, cancel }
}
