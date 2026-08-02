import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTrackImport } from './useTrackImport'
import { InMemoryTrackStore } from '../store/trackStore'

function loadFixture(name: string): File {
  const buffer = readFileSync(join(__dirname, '../kml/fixtures', name))
  return new File([buffer], name)
}

describe('useTrackImport network behaviour', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('imports entirely client-side — no request carries the file contents', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const xhrOpenSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const store = new InMemoryTrackStore()
    const { result } = renderHook(() => useTrackImport(store))

    await act(() => result.current.importFiles([loadFixture('linestring.kml')]))

    expect(store.getFiles()).toHaveLength(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrOpenSpy).not.toHaveBeenCalled()
  })
})
