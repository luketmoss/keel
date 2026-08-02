import type { Track } from '../kml/parse'

export interface ImportedFile {
  id: string
  name: string
  tracks: Track[]
  /** Assigns this file's map colour by insertion order, independent of its
      position in the array — so removing an earlier file (#6) never
      recolours the ones after it. */
  colorIndex: number
}

export interface ImportFailure {
  id: string
  name: string
  message: string
}

export interface ImportProgress {
  name: string
  index: number
  total: number
}
