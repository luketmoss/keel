import type { ImportedFile } from '../import/types'

/* The seam a future Drive-backed store's async updates hook into: consumers
   depend only on this interface, never on a concrete implementation, so
   swapping local storage for Drive touches this module and nothing else. */
export interface TrackStore {
  getFiles(): ImportedFile[]
  addFile(file: ImportedFile): void
  removeFile(id: string): void
  toggleVisibility(id: string): void
  /** Notified after any mutation. Returns an unsubscribe function — the shape
      `useSyncExternalStore` expects directly. */
  subscribe(listener: () => void): () => void
}

/* The only implementation for now — an array in a closure, backing exactly
   today's behaviour with no persistence. `getFiles` returns the same array
   reference until the next mutation, which is what lets
   `useSyncExternalStore` avoid re-rendering on every call. */
export class InMemoryTrackStore implements TrackStore {
  private files: ImportedFile[] = []
  private readonly listeners = new Set<() => void>()

  getFiles = (): ImportedFile[] => {
    return this.files
  }

  addFile = (file: ImportedFile): void => {
    this.files = [...this.files, file]
    this.notify()
  }

  removeFile = (id: string): void => {
    this.files = this.files.filter((file) => file.id !== id)
    this.notify()
  }

  toggleVisibility = (id: string): void => {
    this.files = this.files.map((file) =>
      file.id === id ? { ...file, visible: !file.visible } : file,
    )
    this.notify()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
