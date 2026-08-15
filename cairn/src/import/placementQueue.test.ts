import { describe, expect, it, vi } from 'vitest'
import {
  EMPTY_PLACEMENT_QUEUE,
  discardLabel,
  discardRemaining,
  enqueuePlacement,
  placeCurrent,
  placementQueueSummary,
  skipCurrent,
  type PlacementQueueItem,
} from './placementQueue'

function item(overrides: Partial<PlacementQueueItem> = {}): PlacementQueueItem {
  return {
    id: 'q1',
    name: 'IMG_1.jpg',
    file: new File(['x'], 'IMG_1.jpg'),
    captureLabel: '17 Jun 2023',
    captureInstantMs: undefined,
    tracks: [],
    save: vi.fn().mockResolvedValue('new-cairn-id'),
    ...overrides,
  }
}

describe('enqueuePlacement', () => {
  it('folds resolved and unresolved counts into the batch total', () => {
    const state = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' }), item({ id: 'b' })])

    expect(state.totalCount).toBe(5)
    expect(state.placedCount).toBe(3)
    expect(state.items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  // "Rapid repeat drops while the queue is open" — the new batch's total
  // folds into the existing one rather than replacing it.
  it('appends a second drop to an already-open queue rather than replacing it', () => {
    const first = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' })])
    const second = enqueuePlacement(first, 1, [item({ id: 'b' })])

    expect(second.totalCount).toBe(6)
    expect(second.placedCount).toBe(4)
    expect(second.items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('is a no-op when nothing was resolved and nothing needs placing', () => {
    const state = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [])
    expect(state).toBe(EMPTY_PLACEMENT_QUEUE)
  })
})

describe('placeCurrent', () => {
  it('moves the front item from the queue into placedCount', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [item({ id: 'a' }), item({ id: 'b' })])

    const state = placeCurrent(queued)

    expect(state.placedCount).toBe(1)
    expect(state.totalCount).toBe(2)
    expect(state.items.map((i) => i.id)).toEqual(['b'])
  })

  it('does nothing on an empty queue', () => {
    expect(placeCurrent(EMPTY_PLACEMENT_QUEUE)).toBe(EMPTY_PLACEMENT_QUEUE)
  })
})

describe('skipCurrent', () => {
  it('sends the current file to the back, discarding nothing', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c' }),
    ])

    const state = skipCurrent(queued)

    expect(state.items.map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(state.totalCount).toBe(3)
    expect(state.placedCount).toBe(0)
  })

  it('leaves a one-item queue untouched — there is no back to send it to', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [item({ id: 'a' })])
    expect(skipCurrent(queued)).toBe(queued)
  })
})

describe('discardRemaining', () => {
  it('drops only what is still unplaced, keeping the placed count', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' }), item({ id: 'b' })])

    const state = discardRemaining(queued)

    expect(state.items).toEqual([])
    expect(state.placedCount).toBe(3)
    expect(state.totalCount).toBe(5)
  })
})

describe('placementQueueSummary', () => {
  it('reads the batch as a whole, not just the queue', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' }), item({ id: 'b' })])
    expect(placementQueueSummary(queued)).toBe('5 photos · 3 placed · 2 need a location')
  })

  it('singularizes "needs a location" at one remaining', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 4, [item({ id: 'a' })])
    expect(placementQueueSummary(queued)).toBe('5 photos · 4 placed · 1 needs a location')
  })

  it('singularizes "photo" at a batch of one', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [item({ id: 'a' })])
    expect(placementQueueSummary(queued)).toBe('1 photo · 0 placed · 1 needs a location')
  })

  // "A batch where every file needs placing" edge case.
  it('reads 0 placed when the whole batch needs placing', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c' }),
      item({ id: 'd' }),
    ])
    expect(placementQueueSummary(queued)).toBe('4 photos · 0 placed · 4 need a location')
  })
})

describe('discardLabel', () => {
  it('names how many are left, not the batch total', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' }), item({ id: 'b' })])
    expect(discardLabel(queued)).toBe('Discard 2')
  })

  it('singular at one', () => {
    const queued = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 4, [item({ id: 'a' })])
    expect(discardLabel(queued)).toBe('Discard 1')
  })
})
