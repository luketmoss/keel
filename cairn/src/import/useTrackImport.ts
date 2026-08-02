import { useCallback, useState } from 'react'
import { parseKmlOrKmz } from '../kml/parse'
import { computeTrackStats } from '../kml/stats'
import type { ImportFailure, ImportProgress } from './types'
import type { TrackStore } from '../store/trackStore'

const ACCEPTED_EXTENSIONS = ['.kml', '.kmz']

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

let nextId = 0
function generateId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

let nextColorIndex = 0
function generateColorIndex(): number {
  const index = nextColorIndex
  nextColorIndex += 1
  return index
}

export interface UseTrackImport {
  failures: ImportFailure[]
  progress: ImportProgress | null
  importFiles: (incoming: File[]) => Promise<void>
  dismissFailures: () => void
  toggleVisibility: (id: string) => void
  removeFile: (id: string) => void
}

/* One file at a time, deliberately — parallel parsing of a large batch
   competes for the main thread and makes every file slower to first render.

   Owns parsing, batching, progress and failure reporting — everything that
   isn't storage. The file list itself lives in `store`; this hook reads and
   writes it exclusively through the `TrackStore` interface, never through
   its own state. */
export function useTrackImport(store: TrackStore): UseTrackImport {
  const [failures, setFailures] = useState<ImportFailure[]>([])
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  const importFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return

      setFailures([])

      for (let i = 0; i < incoming.length; i++) {
        const file = incoming[i]
        setProgress({ name: file.name, index: i + 1, total: incoming.length })

        if (!hasAcceptedExtension(file.name)) {
          setFailures((prev) => [
            ...prev,
            {
              id: generateId('failure'),
              name: file.name,
              message: 'only .kml and .kmz files can be imported',
            },
          ])
          continue
        }

        const result = await parseKmlOrKmz(file)
        if (!result.ok) {
          setFailures((prev) => [
            ...prev,
            { id: generateId('failure'), name: file.name, message: result.error },
          ])
          continue
        }

        if (result.tracks.length === 0) {
          setFailures((prev) => [
            ...prev,
            { id: generateId('failure'), name: file.name, message: 'no tracks found in this file' },
          ])
          continue
        }

        store.addFile({
          id: generateId('file'),
          name: file.name,
          // No Drive file behind the v1 import path — #46's overrides are
          // trip-scoped and never apply here.
          driveFileId: '',
          tracks: result.tracks,
          trackStats: result.tracks.map(computeTrackStats),
          colorIndex: generateColorIndex(),
          visible: true,
        })
      }

      setProgress(null)
    },
    [store],
  )

  const dismissFailures = useCallback(() => setFailures([]), [])

  const toggleVisibility = useCallback((id: string) => store.toggleVisibility(id), [store])

  const removeFile = useCallback((id: string) => store.removeFile(id), [store])

  return {
    failures,
    progress,
    importFiles,
    dismissFailures,
    toggleVisibility,
    removeFile,
  }
}
