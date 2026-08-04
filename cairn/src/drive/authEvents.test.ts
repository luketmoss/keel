import { describe, expect, it, vi } from 'vitest'
import { onDriveAuthError, reportDriveAuthError } from './authEvents'

describe('authEvents', () => {
  it('calls every listener with the token that failed', () => {
    const listener = vi.fn()
    const unsubscribe = onDriveAuthError(listener)

    reportDriveAuthError('expired-token')

    expect(listener).toHaveBeenCalledWith('expired-token')
    unsubscribe()
  })

  it('stops calling a listener once unsubscribed', () => {
    const listener = vi.fn()
    const unsubscribe = onDriveAuthError(listener)
    unsubscribe()

    reportDriveAuthError('expired-token')

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies more than one listener', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = onDriveAuthError(a)
    const unsubB = onDriveAuthError(b)

    reportDriveAuthError('tok')

    expect(a).toHaveBeenCalledWith('tok')
    expect(b).toHaveBeenCalledWith('tok')
    unsubA()
    unsubB()
  })
})
