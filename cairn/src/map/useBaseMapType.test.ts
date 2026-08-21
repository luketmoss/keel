import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBaseMapType } from './useBaseMapType'

/** Same minimal in-memory `Storage` `trackOverridesStore.test.ts` uses, so
    tests don't depend on jsdom's `localStorage` persisting across files. */
function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

describe('useBaseMapType', () => {
  it('defaults to satellite with labels off when nothing is stored', () => {
    const { result } = renderHook(() => useBaseMapType(fakeStorage()))

    expect(result.current.type).toBe('satellite')
    expect(result.current.labels).toBe(false)
    expect(result.current.mapTypeId).toBe('satellite')
  })

  it('reads back a previously stored tile and labels preference', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapType', 'terrain')
    storage.setItem('cairn.baseMapLabels', 'true')

    const { result } = renderHook(() => useBaseMapType(storage))

    expect(result.current.type).toBe('terrain')
    expect(result.current.labels).toBe(true)
  })

  it('falls back to satellite for a corrupted or hand-edited tile', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapType', 'not-a-real-type')

    const { result } = renderHook(() => useBaseMapType(storage))
    expect(result.current.type).toBe('satellite')
  })

  it('falls back to labels off for a labels value that is not a boolean', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapLabels', 'yes-please')

    const { result } = renderHook(() => useBaseMapType(storage))
    expect(result.current.labels).toBe(false)
  })

  // #263 removed the Hybrid tile. Anyone who had picked it must land on the
  // same picture they had, not on the default.
  it('migrates a stored hybrid to satellite with labels on', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapType', 'hybrid')

    const { result } = renderHook(() => useBaseMapType(storage))

    expect(result.current.type).toBe('satellite')
    expect(result.current.labels).toBe(true)
    expect(result.current.mapTypeId).toBe('hybrid')
  })

  it('writes the normalised pair back on the next change, retiring the hybrid value', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapType', 'hybrid')
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current.setLabels(false))

    expect(storage.getItem('cairn.baseMapType')).toBe('satellite')
    expect(storage.getItem('cairn.baseMapLabels')).toBe('false')
    expect(result.current.mapTypeId).toBe('satellite')
  })

  it('resolves satellite plus labels to Google hybrid, and nothing else to it', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current.setLabels(true))
    expect(result.current.mapTypeId).toBe('hybrid')

    act(() => result.current.setType('roadmap'))
    expect(result.current.mapTypeId).toBe('roadmap')

    act(() => result.current.setType('terrain'))
    expect(result.current.mapTypeId).toBe('terrain')
  })

  // The switch is disabled on roadmap and terrain, but the preference it
  // would have set is not cleared — it is waiting for satellite to come back.
  it('keeps the labels preference across a round trip through another tile', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current.setLabels(true))
    act(() => result.current.setType('roadmap'))
    act(() => result.current.setType('satellite'))

    expect(result.current.labels).toBe(true)
    expect(result.current.mapTypeId).toBe('hybrid')
  })

  it('updates the returned value and persists the write', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current.setType('roadmap'))

    expect(result.current.type).toBe('roadmap')
    expect(storage.getItem('cairn.baseMapType')).toBe('roadmap')
  })

  it('shares the stored preference across two independent mounts', () => {
    const storage = fakeStorage()
    const first = renderHook(() => useBaseMapType(storage))
    act(() => first.result.current.setType('terrain'))
    act(() => first.result.current.setLabels(true))

    const second = renderHook(() => useBaseMapType(storage))

    expect(second.result.current.type).toBe('terrain')
    expect(second.result.current.labels).toBe(true)
  })

  it('keeps the in-memory selection when the write throws', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('quota exceeded')
    }
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current.setLabels(true))

    expect(result.current.labels).toBe(true)
    expect(result.current.mapTypeId).toBe('hybrid')
  })
})
