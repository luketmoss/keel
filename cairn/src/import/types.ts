import type { Track } from '../kml/parse'

export interface ImportedFile {
  id: string
  name: string
  tracks: Track[]
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
