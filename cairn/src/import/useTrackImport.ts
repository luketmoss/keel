import { useCallback, useState } from 'react'
import { parseKmlOrKmz } from '../kml/parse'
import type { ImportedFile, ImportFailure, ImportProgress } from './types'

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
  files: ImportedFile[]
  failures: ImportFailure[]
  progress: ImportProgress | null
  importFiles: (incoming: File[]) => Promise<void>
  dismissFailures: () => void
}

/* One file at a time, deliberately — parallel parsing of a large batch
   competes for the main thread and makes every file slower to first render. */
export function useTrackImport(): UseTrackImport {
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [failures, setFailures] = useState<ImportFailure[]>([])
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  const importFiles = useCallback(async (incoming: File[]) => {
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

      setFiles((prev) => [
        ...prev,
        {
          id: generateId('file'),
          name: file.name,
          tracks: result.tracks,
          colorIndex: generateColorIndex(),
        },
      ])
    }

    setProgress(null)
  }, [])

  const dismissFailures = useCallback(() => setFailures([]), [])

  return { files, failures, progress, importFiles, dismissFailures }
}
