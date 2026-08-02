import { describe, expect, it, vi } from 'vitest'
import { InMemoryTrackStore } from './trackStore'
import type { ImportedFile } from '../import/types'

function importedFile(id: string, overrides: Partial<ImportedFile> = {}): ImportedFile {
  return {
    id,
    name: `${id}.kml`,
    driveFileId: `drive-${id}`,
    tracks: [],
    trackStats: [],
    colorIndex: 0,
    visible: true,
    ...overrides,
  }
}

describe('InMemoryTrackStore', () => {
  it('starts empty', () => {
    const store = new InMemoryTrackStore()
    expect(store.getFiles()).toEqual([])
  })

  it('adds a file and notifies subscribers', () => {
    const store = new InMemoryTrackStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.addFile(importedFile('a'))

    expect(store.getFiles()).toHaveLength(1)
    expect(store.getFiles()[0].id).toBe('a')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('removes a file by id, leaving the others in place', () => {
    const store = new InMemoryTrackStore()
    store.addFile(importedFile('a'))
    store.addFile(importedFile('b'))

    store.removeFile('a')

    expect(store.getFiles().map((f) => f.id)).toEqual(['b'])
  })

  it('toggles a file visibility without affecting others', () => {
    const store = new InMemoryTrackStore()
    store.addFile(importedFile('a', { visible: true }))
    store.addFile(importedFile('b', { visible: true }))

    store.toggleVisibility('a')

    expect(store.getFiles().find((f) => f.id === 'a')?.visible).toBe(false)
    expect(store.getFiles().find((f) => f.id === 'b')?.visible).toBe(true)
  })

  it('returns the same array reference until the next mutation', () => {
    const store = new InMemoryTrackStore()
    store.addFile(importedFile('a'))

    const first = store.getFiles()
    const second = store.getFiles()

    expect(first).toBe(second)

    store.toggleVisibility('a')
    expect(store.getFiles()).not.toBe(first)
  })

  it('lets a listener unsubscribe', () => {
    const store = new InMemoryTrackStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.addFile(importedFile('a'))

    expect(listener).not.toHaveBeenCalled()
  })
})
