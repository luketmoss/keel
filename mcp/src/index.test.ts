import { describe, expect, it } from 'vitest'
import { handle } from './index'

describe('handle', () => {
  it('answers /health', async () => {
    const res = await handle(new Request('https://example.test/health'), {})
    expect(res.status).toBe(200)
  })

  it('404s everything else', async () => {
    const res = await handle(new Request('https://example.test/nope'), {})
    expect(res.status).toBe(404)
  })
})
