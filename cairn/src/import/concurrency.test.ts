import { describe, expect, it } from 'vitest'
import { runWithConcurrency } from './concurrency'

function defer<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('runWithConcurrency', () => {
  it('runs every item and never exceeds the concurrency limit', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let active = 0
    let maxActive = 0
    const completed: number[] = []

    await runWithConcurrency(items, 3, async (item) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      completed.push(item)
    })

    expect(maxActive).toBeLessThanOrEqual(3)
    expect(completed.sort((a, b) => a - b)).toEqual(items)
  })

  it('does not let one item throwing stop the others from completing', async () => {
    const items = [1, 2, 3, 4]
    const completed: number[] = []

    await runWithConcurrency(items, 2, async (item) => {
      if (item === 2) throw new Error('boom')
      completed.push(item)
    })

    expect(completed.sort((a, b) => a - b)).toEqual([1, 3, 4])
  })

  it('resolves once all items are done, not before', async () => {
    const first = defer<void>()
    const order: string[] = []

    const run = runWithConcurrency([1, 2], 1, async (item) => {
      order.push(`start-${item}`)
      if (item === 1) await first.promise
      order.push(`end-${item}`)
    })

    // With a limit of 1, the second item cannot start until the first
    // finishes — proving the queue, not just the final result.
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['start-1'])

    first.resolve()
    await run

    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('resolves immediately for an empty batch', async () => {
    let ran = false
    await runWithConcurrency([], 3, async () => {
      ran = true
    })
    expect(ran).toBe(false)
  })
})
