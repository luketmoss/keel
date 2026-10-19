import { afterEach, describe, expect, it, vi } from 'vitest'
import { markWrote, runToolCall } from './call-context.js'
import { apiWrite, configureApi } from './thrive/api.js'

afterEach(() => vi.unstubAllGlobals())

const answer = (body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

describe('per-call state (#409)', () => {
  it('records a write only inside the call that made it, even when calls interleave', async () => {
    let open!: () => void
    const gate = { promise: new Promise<void>((resolve) => (open = resolve)) }
    const a = runToolCall(async () => {
      await gate.promise
      markWrote()
    })
    const b = runToolCall(async () => {
      await gate.promise
    })
    open()
    expect((await a).state.wrote).toBe(true)
    expect((await b).state.wrote).toBe(false)
  })

  it('markWrote outside a tool call is a no-op', () => {
    expect(() => markWrote()).not.toThrow()
  })

  it('counts a write the API accepted', async () => {
    configureApi({ url: 'https://script.example/exec', key: 'k' })
    answer({ success: true, data: {} })
    const { state } = await runToolCall(() => apiWrite('createWorkout', { data: {} }))
    expect(state.wrote).toBe(true)
  })

  it('does not count a refused write, or previewSetUpdates, which only resolves', async () => {
    configureApi({ url: 'https://script.example/exec', key: 'k' })
    answer({ success: false, error: 'nope' })
    const refused = await runToolCall(() => apiWrite('createWorkout', { data: {} }).catch(() => undefined))
    expect(refused.state.wrote).toBe(false)

    answer({ success: true, data: [] })
    const preview = await runToolCall(() => apiWrite('previewSetUpdates', { workout_id: 'w', updates: [] }))
    expect(preview.state.wrote).toBe(false)
  })
})
