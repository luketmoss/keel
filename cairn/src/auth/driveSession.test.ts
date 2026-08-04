import { beforeEach, describe, expect, it } from 'vitest'
import { clearStoredSession, readStoredSession, writeStoredSession } from './driveSession'

describe('driveSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('returns null when nothing is stored', () => {
    expect(readStoredSession()).toBeNull()
  })

  it('round-trips a written session', () => {
    writeStoredSession({ accessToken: 'tok', expiresAt: 1_700_000_000_000 })
    expect(readStoredSession()).toEqual({ accessToken: 'tok', expiresAt: 1_700_000_000_000 })
  })

  it('clears a stored session', () => {
    writeStoredSession({ accessToken: 'tok', expiresAt: 1_700_000_000_000 })
    clearStoredSession()
    expect(readStoredSession()).toBeNull()
  })

  it('treats malformed JSON as nothing stored', () => {
    window.sessionStorage.setItem('cairn:drive-session', 'not json')
    expect(readStoredSession()).toBeNull()
  })

  it('treats a value missing the expected shape as nothing stored', () => {
    window.sessionStorage.setItem('cairn:drive-session', JSON.stringify({ accessToken: 'tok' }))
    expect(readStoredSession()).toBeNull()
  })

  it('reads and writes against an injected storage rather than the global by default', () => {
    const calls: string[] = []
    const fakeStorage: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: (key: string) => {
        calls.push(`get:${key}`)
        return null
      },
      setItem: (key: string) => {
        calls.push(`set:${key}`)
      },
      removeItem: (key: string) => {
        calls.push(`remove:${key}`)
      },
    }

    readStoredSession(fakeStorage)
    writeStoredSession({ accessToken: 'tok', expiresAt: 1 }, fakeStorage)
    clearStoredSession(fakeStorage)

    expect(calls).toEqual([
      'get:cairn:drive-session',
      'set:cairn:drive-session',
      'remove:cairn:drive-session',
    ])
    // The global sessionStorage was never touched.
    expect(window.sessionStorage.getItem('cairn:drive-session')).toBeNull()
  })
})
