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
  it('defaults to satellite when nothing is stored', () => {
    const { result } = renderHook(() => useBaseMapType(fakeStorage()))
    expect(result.current[0]).toBe('satellite')
  })

  it('reads back a previously stored value', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapType', 'hybrid')

    const { result } = renderHook(() => useBaseMapType(storage))
    expect(result.current[0]).toBe('hybrid')
  })

  it('falls back to satellite for a corrupted or hand-edited value', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.baseMapType', 'not-a-real-type')

    const { result } = renderHook(() => useBaseMapType(storage))
    expect(result.current[0]).toBe('satellite')
  })

  it('updates the returned value and persists the write', () => {
    const storage = fakeStorage()
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current[1]('roadmap'))

    expect(result.current[0]).toBe('roadmap')
    expect(storage.getItem('cairn.baseMapType')).toBe('roadmap')
  })

  it('shares the stored preference across two independent mounts', () => {
    const storage = fakeStorage()
    const first = renderHook(() => useBaseMapType(storage))
    act(() => first.result.current[1]('terrain'))

    const second = renderHook(() => useBaseMapType(storage))
    expect(second.result.current[0]).toBe('terrain')
  })

  it('keeps the in-memory selection when the write throws', () => {
    const storage = fakeStorage()
    storage.setItem = () => {
      throw new Error('quota exceeded')
    }
    const { result } = renderHook(() => useBaseMapType(storage))

    act(() => result.current[1]('hybrid'))

    expect(result.current[0]).toBe('hybrid')
  })
})
