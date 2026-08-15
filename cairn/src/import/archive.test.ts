import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import {
  EMPTY_ARCHIVE_MESSAGE,
  MAX_ARCHIVE_ENTRIES,
  NESTED_ARCHIVE_MESSAGE,
  UNREADABLE_ARCHIVE_MESSAGE,
  expandArchive,
  expandArchives,
  isArchiveFile,
  isImportableEntry,
  isJunkEntry,
  tooManyEntriesMessage,
} from './archive'

/** Builds a real zip, so these tests exercise JSZip rather than a fake of
    it — the entry names and the directory read are the whole subject. */
async function zipOf(entries: Record<string, string>, name = 'photos.zip'): Promise<File> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) zip.file(path, content)
  const blob = await zip.generateAsync({ type: 'blob' })
  return new File([blob], name)
}

describe('isArchiveFile', () => {
  it('matches .zip by name, case-insensitively', () => {
    expect(isArchiveFile('photos.zip')).toBe(true)
    expect(isArchiveFile('PHOTOS.ZIP')).toBe(true)
  })

  // A KMZ *is* a zip. Keying on the bytes would flatten every KMZ drop into
  // its inner KML and its own parser would never see it.
  it('does not match .kmz, which is a zip but is a track', () => {
    expect(isArchiveFile('rosea.kmz')).toBe(false)
  })
})

describe('isJunkEntry', () => {
  it('skips the AppleDouble forks every macOS zip carries', () => {
    // These end in .jpg and pass isPhotoFile — without the filter each one
    // becomes a failure row beside its real photo.
    expect(isJunkEntry('__MACOSX/._IMG_1234.jpg')).toBe(true)
    expect(isJunkEntry('trip/__MACOSX/._IMG_1234.jpg')).toBe(true)
    expect(isJunkEntry('._IMG_1234.jpg')).toBe(true)
  })

  it('skips the usual desktop droppings', () => {
    expect(isJunkEntry('.DS_Store')).toBe(true)
    expect(isJunkEntry('trip/Thumbs.db')).toBe(true)
    expect(isJunkEntry('desktop.ini')).toBe(true)
  })

  it('leaves real files alone', () => {
    expect(isJunkEntry('IMG_1234.jpg')).toBe(false)
    expect(isJunkEntry('trip/day one/IMG_1234.jpg')).toBe(false)
  })
})

describe('isImportableEntry', () => {
  it('takes photos and tracks, by their base name inside folders', () => {
    expect(isImportableEntry('trip/day one/IMG_1234.jpg')).toBe(true)
    expect(isImportableEntry('trip/rosea.kml')).toBe(true)
    expect(isImportableEntry('trip/rosea.kmz')).toBe(true)
  })

  it('leaves anything else', () => {
    expect(isImportableEntry('notes.txt')).toBe(false)
    expect(isImportableEntry('receipt.pdf')).toBe(false)
  })
})

describe('expandArchive', () => {
  it('yields the photos inside, named without their folders', async () => {
    const archive = await zipOf({
      'trip/day one/IMG_1.jpg': 'a',
      'trip/day two/IMG_2.jpg': 'b',
    })

    const result = await expandArchive(archive)

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg', 'IMG_2.jpg'])
    expect(result.rejections).toEqual([])
  })

  it('carries tracks through as well — a zip is a bag of files', async () => {
    const archive = await zipOf({ 'rosea.kml': '<kml/>', 'IMG_1.jpg': 'a' })

    const result = await expandArchive(archive)

    expect(result.files.map((file) => file.name).sort()).toEqual(['IMG_1.jpg', 'rosea.kml'])
  })

  it('skips junk silently rather than reporting it', async () => {
    const archive = await zipOf({
      'IMG_1.jpg': 'a',
      '__MACOSX/._IMG_1.jpg': 'junk',
      '.DS_Store': 'junk',
      'Thumbs.db': 'junk',
    })

    const result = await expandArchive(archive)

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg'])
    expect(result.rejections).toEqual([])
  })

  it('skips unrecognised files silently — nobody hand-picked them', async () => {
    const archive = await zipOf({ 'IMG_1.jpg': 'a', 'notes.txt': 'x', 'receipt.pdf': 'y' })

    const result = await expandArchive(archive)

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg'])
    expect(result.rejections).toEqual([])
  })

  it('reports a nested archive once rather than importing or ignoring it', async () => {
    const archive = await zipOf({ 'IMG_1.jpg': 'a', 'inner.zip': 'PK' })

    const result = await expandArchive(archive)

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg'])
    expect(result.rejections).toEqual([{ name: 'inner.zip', message: NESTED_ARCHIVE_MESSAGE }])
  })

  it('refuses an archive with nothing importable in it, rather than saying nothing', async () => {
    const archive = await zipOf({ 'notes.txt': 'x' })

    const result = await expandArchive(archive)

    expect(result.files).toEqual([])
    expect(result.rejections).toEqual([{ name: 'photos.zip', message: EMPTY_ARCHIVE_MESSAGE }])
  })

  it('refuses an oversized archive before decompressing anything', async () => {
    const entries: Record<string, string> = {}
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES + 1; i++) entries[`IMG_${i}.jpg`] = 'a'
    const archive = await zipOf(entries)

    const result = await expandArchive(archive)

    expect(result.files).toEqual([])
    expect(result.rejections).toEqual([
      { name: 'photos.zip', message: tooManyEntriesMessage(MAX_ARCHIVE_ENTRIES + 1) },
    ])
    // Naming both numbers is what tells the user to split it in four.
    expect(result.rejections[0].message).toContain(String(MAX_ARCHIVE_ENTRIES))
    expect(result.rejections[0].message).toContain(String(MAX_ARCHIVE_ENTRIES + 1))
  })

  it('accepts an archive exactly at the limit', async () => {
    const entries: Record<string, string> = {}
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES; i++) entries[`IMG_${i}.jpg`] = 'a'

    const result = await expandArchive(await zipOf(entries))

    expect(result.files).toHaveLength(MAX_ARCHIVE_ENTRIES)
    expect(result.rejections).toEqual([])
  })

  it('names the archive when the bytes are not a zip at all', async () => {
    const result = await expandArchive(new File(['not a zip'], 'broken.zip'))

    expect(result.files).toEqual([])
    expect(result.rejections).toEqual([{ name: 'broken.zip', message: UNREADABLE_ARCHIVE_MESSAGE }])
  })

  it('reports progress per entry so a large archive does not look ignored', async () => {
    const archive = await zipOf({ 'IMG_1.jpg': 'a', 'IMG_2.jpg': 'b', 'IMG_3.jpg': 'c' })
    const onProgress = vi.fn()

    await expandArchive(archive, onProgress)

    expect(onProgress.mock.calls).toEqual([
      ['photos.zip', 1, 3],
      ['photos.zip', 2, 3],
      ['photos.zip', 3, 3],
    ])
  })
})

describe('expandArchives', () => {
  it('returns a drop with no archive in it untouched', async () => {
    const files = [new File(['a'], 'IMG_1.jpg'), new File(['<kml/>'], 'rosea.kml')]

    const result = await expandArchives(files)

    expect(result.files).toBe(files)
    expect(result.rejections).toEqual([])
  })

  it('leaves a .kmz alone — it is a track, not an archive to flatten', async () => {
    const kmz = await zipOf({ 'doc.kml': '<kml/>' }, 'rosea.kmz')

    const result = await expandArchives([kmz, new File(['a'], 'IMG_1.jpg')])

    expect(result.files.map((file) => file.name)).toEqual(['rosea.kmz', 'IMG_1.jpg'])
  })

  it('replaces each archive with its contents, keeping loose files in place', async () => {
    const archive = await zipOf({ 'IMG_2.jpg': 'b', 'IMG_3.jpg': 'c' })
    const loose = new File(['a'], 'IMG_1.jpg')

    const result = await expandArchives([loose, archive])

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg'])
  })

  it('expands two archives in one drop', async () => {
    const first = await zipOf({ 'IMG_1.jpg': 'a' }, 'one.zip')
    const second = await zipOf({ 'IMG_2.jpg': 'b' }, 'two.zip')

    const result = await expandArchives([first, second])

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg', 'IMG_2.jpg'])
  })

  it('a broken archive does not stop the rest of the drop importing', async () => {
    const good = await zipOf({ 'IMG_1.jpg': 'a' }, 'good.zip')
    const broken = new File(['not a zip'], 'broken.zip')

    const result = await expandArchives([broken, good, new File(['b'], 'IMG_9.jpg')])

    expect(result.files.map((file) => file.name)).toEqual(['IMG_1.jpg', 'IMG_9.jpg'])
    expect(result.rejections).toEqual([
      { name: 'broken.zip', message: UNREADABLE_ARCHIVE_MESSAGE },
    ])
  })
})
