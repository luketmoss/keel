import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlacementQueuePanel } from './PlacementQueuePanel'
import { enqueuePlacement, EMPTY_PLACEMENT_QUEUE, type PlacementQueueItem } from '../import/placementQueue'

/* jsdom has no `URL.createObjectURL` at all — same gap `App.test.tsx`'s
   #140 suite and `imageCache.ts` both already work around. Stubbed once,
   module-level, rather than added and torn down per test: this suite's own
   component unmounts (and so calls `revokeObjectURL`) inside
   `@testing-library/react`'s `afterEach(cleanup)`, registered in
   `test-setup.ts` before this file ever loads — vitest runs `afterEach`
   hooks in reverse registration order, so a same-shaped teardown here would
   delete the stub before that cleanup's unmount ever ran. */
Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake-url'), revokeObjectURL: vi.fn() })

function item(overrides: Partial<PlacementQueueItem> = {}): PlacementQueueItem {
  return {
    id: 'q1',
    name: 'IMG_4423.jpg',
    file: new File(['x'], 'IMG_4423.jpg', { type: 'image/jpeg' }),
    captureLabel: '17 Jun 2023',
    captureInstantMs: undefined,
    tracks: [],
    save: vi.fn().mockResolvedValue('new-cairn-id'),
    ...overrides,
  }
}

describe('PlacementQueuePanel', () => {
  it('shows the eyebrow, summary, filename and date for the current file', () => {
    const queue = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item()])

    render(<PlacementQueuePanel queue={queue} hasSuggestion={false} onSkip={vi.fn()} onDiscard={vi.fn()} />)

    expect(screen.getByText('Not saved')).toBeDefined()
    expect(screen.getByText('4 photos · 3 placed · 1 needs a location')).toBeDefined()
    expect(screen.getByText(/IMG_4423\.jpg/)).toBeDefined()
    expect(screen.getByText(/17 Jun 2023/)).toBeDefined()
  })

  it('draws one queue-bar cell per file in the whole batch', () => {
    const queue = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' }), item({ id: 'b' })])

    const { container } = render(
      <PlacementQueuePanel queue={queue} hasSuggestion={false} onSkip={vi.fn()} onDiscard={vi.fn()} />,
    )

    expect(container.querySelectorAll('.placement-queue__cell')).toHaveLength(5)
    expect(container.querySelectorAll('.placement-queue__cell--placed')).toHaveLength(3)
    expect(container.querySelectorAll('.placement-queue__cell--current')).toHaveLength(1)
  })

  it('shows the suggestion note when a ring is available, and the no-suggestion note otherwise', () => {
    const queue = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [item()])

    const { rerender } = render(
      <PlacementQueuePanel queue={queue} hasSuggestion={true} onSkip={vi.fn()} onDiscard={vi.fn()} />,
    )
    expect(screen.getByText(/click the pulsing ring/)).toBeDefined()

    rerender(<PlacementQueuePanel queue={queue} hasSuggestion={false} onSkip={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByText(/No GPS, and no track covers its timestamp/)).toBeDefined()
  })

  it('calls onSkip and onDiscard from their buttons', () => {
    const onSkip = vi.fn()
    const onDiscard = vi.fn()
    const queue = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 0, [item({ id: 'a' }), item({ id: 'b' })])

    render(<PlacementQueuePanel queue={queue} hasSuggestion={false} onSkip={onSkip} onDiscard={onDiscard} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip this one' }))
    expect(onSkip).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Discard 2' }))
    expect(onDiscard).toHaveBeenCalled()
  })

  it('disables Skip when only one file remains — nowhere to send it', () => {
    const queue = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 4, [item()])

    render(<PlacementQueuePanel queue={queue} hasSuggestion={false} onSkip={vi.fn()} onDiscard={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Skip this one' })).toHaveProperty('disabled', true)
  })

  it('names the reassurance block by how many are still unplaced', () => {
    const queue = enqueuePlacement(EMPTY_PLACEMENT_QUEUE, 3, [item({ id: 'a' }), item({ id: 'b' })])

    render(<PlacementQueuePanel queue={queue} hasSuggestion={false} onSkip={vi.fn()} onDiscard={vi.fn()} />)

    expect(
      screen.getByText(/These 2 are not in your library and nothing has been written to Drive/),
    ).toBeDefined()
  })

  it('renders nothing once the queue is empty', () => {
    const { container } = render(
      <PlacementQueuePanel
        queue={EMPTY_PLACEMENT_QUEUE}
        hasSuggestion={false}
        onSkip={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
