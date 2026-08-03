import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
    ...overrides,
  }
}

describe('TripMetadataHeader', () => {
  it('renders the name, status, and dates in read mode', () => {
    render(<TripMetadataHeader trip={trip()} onUpdate={vi.fn()} />)

    expect(screen.getByText('Hokkaido')).toBeDefined()
    expect(screen.getByText('planned')).toBeDefined()
    expect(screen.getByText('Planned — no dates set')).toBeDefined()
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
})
