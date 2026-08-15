/* Expands a dropped `.zip` into the files it holds, so everything
   downstream — `fileKinds.ts`'s partition, EXIF, interpolation, the
   placement queue, the draft trip, duplicate refusal — is reached in
   exactly the state it would have been reached in had the user unzipped to
   disk and dragged the folder (#188).

   That is the whole design: a zip is a bag of files, and dropping the bag
   means dropping the files. This module is the doorway and nothing past it
   knows an archive was involved.

   JSZip is already a dependency — `kml/parse.ts` uses it to unpack KMZ.

   **A KMZ is a zip and must not come through here.** Expansion keys on the
   `.zip` extension by name, never on the bytes, or every KMZ drop would be
   flattened into its inner KML and its own parser would never see it. */

import JSZip from 'jszip'
import { isPhotoFile, isTrackFile } from './fileKinds'

/** Above this many importable entries an archive is refused outright,
    before anything is decompressed. Entries are materialised as `File`s
    before the import runs, so this is what bounds memory — a real
    constraint rather than a policy, which is why the message names the
    number rather than scolding. */
export const MAX_ARCHIVE_ENTRIES = 100

export const ARCHIVE_EXTENSION = '.zip'

export function isArchiveFile(name: string): boolean {
  return name.toLowerCase().endsWith(ARCHIVE_EXTENSION)
}

export function tooManyEntriesMessage(count: number): string {
  return `archives are limited to ${MAX_ARCHIVE_ENTRIES} files; this one has ${count}`
}

export const EMPTY_ARCHIVE_MESSAGE = 'no photos or tracks in this archive'
export const UNREADABLE_ARCHIVE_MESSAGE = 'could not be read as a zip archive'
export const NESTED_ARCHIVE_MESSAGE = "archives inside archives aren't unpacked"

/** Named exactly like `ImportRejection` in `useLooseImport.ts` so a caller
    can concatenate the two without mapping. */
export interface ArchiveRejection {
  name: string
  message: string
}

export interface ExpandResult {
  /** The drop's own files with every `.zip` replaced by its contents.
      Non-archives pass through untouched and in order. */
  files: File[]
  rejections: ArchiveRejection[]
}

/* Every zip made on macOS carries `__MACOSX/._IMG_1234.jpg` beside each
   photo — a name that ends in `.jpg`, that `isPhotoFile` accepts, and that
   is an AppleDouble resource fork which cannot decode. Without this filter
   every macOS zip produces one cairn and one failure per photo, so the
   list is load-bearing rather than tidiness. */
const JUNK_SEGMENTS = ['__macosx']
const JUNK_NAMES = ['.ds_store', 'thumbs.db', 'desktop.ini']

function baseNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}

/** Skipped without a word. A direct drop names every unrecognised file
    because the user hand-picked each one; nobody hand-picks the contents of
    a zip, so naming `receipt.pdf` from an archive grabbed whole is noise
    about a file they never claimed to be importing. */
export function isJunkEntry(path: string): boolean {
  const lower = path.toLowerCase()
  if (JUNK_SEGMENTS.some((segment) => lower.split(/[/\\]/).includes(segment))) return true
  const base = baseNameOf(lower)
  if (base.length === 0) return true
  if (JUNK_NAMES.includes(base)) return true
  // AppleDouble forks and dotfiles generally.
  return base.startsWith('.')
}

export function isImportableEntry(path: string): boolean {
  const base = baseNameOf(path)
  return isPhotoFile(base) || isTrackFile(base)
}

/** Reported per decompressed entry so a large archive does not look like a
    drop the app ignored — `index` is 1-based, matching the import progress
    row this is rendered as. */
export type ArchiveProgress = (archiveName: string, index: number, total: number) => void

/** Directory structure is flattened — cairns have no folder concept, so
    there is nothing to do with it. Two photos sharing a name in different
    folders both import; ids are generated and the name is only a row
    label. */
export async function expandArchive(
  archive: File,
  onProgress?: ArchiveProgress,
): Promise<ExpandResult> {
  let zip: JSZip
  try {
    // The `File` goes to JSZip directly rather than through
    // `File#arrayBuffer()`, which jsdom does not implement — the same gap
    // `kml/parse.ts` works around with a `FileReader`. JSZip reads a Blob
    // itself, so there is nothing to work around here.
    zip = await JSZip.loadAsync(archive)
  } catch {
    return { files: [], rejections: [{ name: archive.name, message: UNREADABLE_ARCHIVE_MESSAGE }] }
  }

  const rejections: ArchiveRejection[] = []
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !isJunkEntry(entry.name))

  // Reported once, and only when one is actually present: recursion is not
  // supported and silence here would look like a successful import of files
  // that never arrived.
  const nested = entries.filter((entry) => isArchiveFile(baseNameOf(entry.name)))
  for (const entry of nested) {
    rejections.push({ name: baseNameOf(entry.name), message: NESTED_ARCHIVE_MESSAGE })
  }

  const importable = entries.filter((entry) => isImportableEntry(entry.name))

  if (importable.length === 0) {
    return {
      files: [],
      rejections: [...rejections, { name: archive.name, message: EMPTY_ARCHIVE_MESSAGE }],
    }
  }

  // Counted from the directory, which `loadAsync` has already read, so an
  // oversized archive is refused without decompressing a single entry.
  if (importable.length > MAX_ARCHIVE_ENTRIES) {
    return {
      files: [],
      rejections: [
        ...rejections,
        { name: archive.name, message: tooManyEntriesMessage(importable.length) },
      ],
    }
  }

  const files: File[] = []
  for (const [index, entry] of importable.entries()) {
    onProgress?.(archive.name, index + 1, importable.length)
    try {
      const blob = await entry.async('blob')
      files.push(new File([blob], baseNameOf(entry.name)))
    } catch {
      rejections.push({ name: baseNameOf(entry.name), message: UNREADABLE_ARCHIVE_MESSAGE })
    }
  }

  return { files, rejections }
}

/** The doorway itself: called at every entry point before anything else
    inspects what arrived. A drop with no archive in it costs one `some`
    and is returned unchanged, so the common case pays nothing.
 *
 * One archive failing takes nothing else down with it — the other files in
 * the same drop still import, which is what criterion 10 is about. */
export async function expandArchives(
  files: File[],
  onProgress?: ArchiveProgress,
): Promise<ExpandResult> {
  if (!files.some((file) => isArchiveFile(file.name))) return { files, rejections: [] }

  const expanded: File[] = []
  const rejections: ArchiveRejection[] = []

  for (const file of files) {
    if (!isArchiveFile(file.name)) {
      expanded.push(file)
      continue
    }
    const result = await expandArchive(file, onProgress)
    expanded.push(...result.files)
    rejections.push(...result.rejections)
  }

  return { files: expanded, rejections }
}
