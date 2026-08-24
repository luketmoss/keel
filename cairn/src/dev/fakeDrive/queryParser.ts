/* Parses the small set of Drive `q=` shapes cairn's own `drive/*` modules
   actually send — not Drive's query grammar in general. An unrecognized
   clause means either a bug in this emulator or a new query shape added to
   the app without updating it; either way, silently matching everything
   (or nothing) would hide that, so it throws instead — see #93's
   acceptance criterion 8. */

import type { FakeFile } from './store'

export type FileFilter = (file: FakeFile) => boolean

const NAME_CLAUSE = /^name='([^']*)'$/
const MIME_CLAUSE = /^mimeType='([^']*)'$/
const NOT_MIME_CLAUSE = /^mimeType!='([^']*)'$/
const PARENTS_CLAUSE = /^'([^']*)' in parents$/
const TRASHED_CLAUSE = /^trashed=(true|false)$/

export function parseDriveQuery(query: string): FileFilter {
  const clauses = query.split(' and ').map((clause) => clause.trim())
  const predicates: FileFilter[] = []

  for (const clause of clauses) {
    const nameMatch = NAME_CLAUSE.exec(clause)
    if (nameMatch) {
      const name = nameMatch[1]
      predicates.push((file) => file.name === name)
      continue
    }
    const mimeMatch = MIME_CLAUSE.exec(clause)
    if (mimeMatch) {
      const mimeType = mimeMatch[1]
      predicates.push((file) => file.mimeType === mimeType)
      continue
    }
    const notMimeMatch = NOT_MIME_CLAUSE.exec(clause)
    if (notMimeMatch) {
      const mimeType = notMimeMatch[1]
      predicates.push((file) => file.mimeType !== mimeType)
      continue
    }
    const parentsMatch = PARENTS_CLAUSE.exec(clause)
    if (parentsMatch) {
      const parentId = parentsMatch[1]
      predicates.push((file) => file.parents.includes(parentId))
      continue
    }
    const trashedMatch = TRASHED_CLAUSE.exec(clause)
    if (trashedMatch) {
      const trashed = trashedMatch[1] === 'true'
      predicates.push((file) => file.trashed === trashed)
      continue
    }
    throw new Error(`fake Drive: unrecognized query clause "${clause}" in "${query}"`)
  }

  return (file) => predicates.every((predicate) => predicate(file))
}
