import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TripMetadataHeader } from './TripMetadataHeader'
import type { TripRecord } from '../store/tripStore'

function trip(overrides: Partial<TripRecord> = {}): TripRecord {
  return {
    id: 'trip-1',
    name: 'Hokkaido',
    status: 'planned',
    startDate: null,
    endDate: null,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    origin: null,
    ...overrides,
  }
}

describe('TripMetadataHeader', () => {
  it('renders the name, status, and dates in read mode', () => {
    render(<TripMetadataHeader trip={trip()} onUpdate={vi.fn()} />)

    expect(screen.getByText('Hokkaido')).toBeDefined()
    expect(screen.getByText('planned')).toBeDefined()
    expect(screen.getByText('No dates set')).toBeDefined()
  })

  it('saves a name edit on blur', async () => {
    const onUpdate = vi.fn().mockResolvedValue(trip({ name: 'Iceland' }))
    render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Hokkaido'))
    const input = screen.getByDisplayValue('Hokkaido')
    fireEvent.change(input, { target: { value: 'Iceland' } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledWith({ name: 'Iceland' })
  })

  it('discards an empty name without calling onUpdate', () => {
    const onUpdate = vi.fn()
    render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Hokkaido'))
    const input = screen.getByDisplayValue('Hokkaido')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('Hokkaido')).toBeDefined()
  })

  it('discards an edit on Escape without saving', () => {
    const onUpdate = vi.fn()
    render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Hokkaido'))
    const input = screen.getByDisplayValue('Hokkaido')
    fireEvent.change(input, { target: { value: 'Something else' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('Hokkaido')).toBeDefined()
  })

  it('shows a failure message and reverts when the update resolves null', async () => {
    const onUpdate = vi.fn().mockResolvedValue(null)
    render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Hokkaido'))
    const input = screen.getByDisplayValue('Hokkaido')
    fireEvent.change(input, { target: { value: 'Iceland' } })
    fireEvent.blur(input)

    expect(await screen.findByText("Couldn't save — name reverted.")).toBeDefined()
  })

  it('renders notes and lets them be edited', async () => {
    const onUpdate = vi.fn().mockResolvedValue(trip({ notes: 'Great trip' }))
    render(<TripMetadataHeader trip={trip({ notes: 'Draft notes' })} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Draft notes'))
    const textarea = screen.getByDisplayValue('Draft notes')
    fireEvent.change(textarea, { target: { value: 'Great trip' } })
    fireEvent.blur(textarea)

    expect(onUpdate).toHaveBeenCalledWith({ notes: 'Great trip' })
  })

  it('changes status via the selector', () => {
    const onUpdate = vi.fn().mockResolvedValue(trip({ status: 'completed' }))
    render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('planned'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'completed' } })

    expect(onUpdate).toHaveBeenCalledWith({ status: 'completed' })
  })

  it('renders the same no-dates string for a completed trip as a planned one, naming no status', () => {
    render(<TripMetadataHeader trip={trip({ status: 'completed' })} onUpdate={vi.fn()} />)

    expect(screen.getByText('completed')).toBeDefined()
    const dates = screen.getByText('No dates set')
    expect(dates.textContent).not.toMatch(/planned|completed/i)
  })

  it('renders the real stored date range instead of a placeholder', () => {
    render(
      <TripMetadataHeader
        trip={trip({ startDate: '2026-08-01', endDate: '2026-08-05' })}
        onUpdate={vi.fn()}
      />,
    )

    expect(screen.getByText('Aug 1 – 5')).toBeDefined()
  })

  describe('notes clamping', () => {
    // jsdom performs no layout, so scrollHeight/clientHeight are stubbed at
    // the prototype level to simulate a clamped (overflowing) paragraph.
    function stubClamped(clamped: boolean) {
      Object.defineProperty(HTMLParagraphElement.prototype, 'scrollHeight', {
        configurable: true,
        value: clamped ? 120 : 40,
      })
      Object.defineProperty(HTMLParagraphElement.prototype, 'clientHeight', {
        configurable: true,
        value: 40,
      })
    }

    afterEach(() => {
      Reflect.deleteProperty(HTMLParagraphElement.prototype, 'scrollHeight')
      Reflect.deleteProperty(HTMLParagraphElement.prototype, 'clientHeight')
    })

    it('renders no "Show more" when the note is not actually clamped', () => {
      stubClamped(false)
      render(<TripMetadataHeader trip={trip({ notes: 'A short note.' })} onUpdate={vi.fn()} />)

      expect(screen.queryByText('Show more')).toBeNull()
    })

    it('renders "Show more" for a clamped note, and toggles to "Show less" and back', () => {
      stubClamped(true)
      render(<TripMetadataHeader trip={trip({ notes: 'A very long note that overflows.' })} onUpdate={vi.fn()} />)

      const showMore = screen.getByText('Show more')
      fireEvent.click(showMore)
      expect(screen.getByText('Show less')).toBeDefined()

      fireEvent.click(screen.getByText('Show less'))
      expect(screen.getByText('Show more')).toBeDefined()
    })

    it('does not start editing when the "Show more" control is clicked', () => {
      stubClamped(true)
      const onUpdate = vi.fn()
      render(<TripMetadataHeader trip={trip({ notes: 'A very long note that overflows.' })} onUpdate={onUpdate} />)

      fireEvent.click(screen.getByText('Show more'))

      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('collapses an expanded note back to clamped when the note is edited', async () => {
      stubClamped(true)
      const onUpdate = vi.fn().mockResolvedValue(trip({ notes: 'A different, still long note here.' }))
      const { rerender } = render(
        <TripMetadataHeader trip={trip({ notes: 'A very long note that overflows.' })} onUpdate={onUpdate} />,
      )

      fireEvent.click(screen.getByText('Show more'))
      expect(screen.getByText('Show less')).toBeDefined()

      rerender(
        <TripMetadataHeader trip={trip({ notes: 'A different, still long note here.' })} onUpdate={onUpdate} />,
      )

      expect(screen.queryByText('Show less')).toBeNull()
      expect(screen.getByText('Show more')).toBeDefined()
    })
  })

  it('does not start editing while disabled, and renders the Disabled treatment', () => {
    const onUpdate = vi.fn()
    const { container } = render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} disabled />)

    fireEvent.click(screen.getByText('Hokkaido'))

    expect(screen.queryByDisplayValue('Hokkaido')).toBeNull()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(container.querySelector('.trip-metadata__fields--disabled')).not.toBeNull()
  })

  it('#73: states why editing is unavailable while disabled, and says nothing when not', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} disabled />)

    expect(screen.getByText('Sign in to edit this trip.')).toBeDefined()

    rerender(<TripMetadataHeader trip={trip()} onUpdate={onUpdate} />)

    expect(screen.queryByText('Sign in to edit this trip.')).toBeNull()
  })
})
