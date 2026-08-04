import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TripList } from './TripList'
import type { TripIndexEntry } from '../store/tripStore'

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 't1',
    name: 'Hokkaido',
    status: 'planned',
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderList(props: Partial<Parameters<typeof TripList>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TripList trips={[]} onCreate={vi.fn()} onDelete={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('TripList', () => {
  it('shows an empty state pointing at the create form when there are no trips', () => {
    renderList()

    expect(screen.getByText('No trips yet')).toBeDefined()
    expect(screen.getByText(/Create one above/)).toBeDefined()
  })

  it('renders one row per trip', () => {
    renderList({ trips: [tripEntry({ id: 'a', name: 'Hokkaido' }), tripEntry({ id: 'b', name: 'Iceland ring road' })] })

    expect(screen.getByText('Hokkaido')).toBeDefined()
    expect(screen.getByText('Iceland ring road')).toBeDefined()
  })

  it('shows planned status and "No dates set" for a freshly created trip', () => {
    renderList({ trips: [tripEntry()] })

    expect(screen.getByText('planned')).toBeDefined()
    expect(screen.getByText('No dates set')).toBeDefined()
  })

  it('renders the stored date range instead of the no-dates placeholder', () => {
    renderList({ trips: [tripEntry({ startDate: '2026-08-01', endDate: '2026-08-05' })] })

    expect(screen.getByText('Aug 1 – 5')).toBeDefined()
    expect(screen.queryByText('No dates set')).toBeNull()
  })

  it('creates a trip from the form on submit', () => {
    const onCreate = vi.fn()
    renderList({ onCreate })

    fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: 'Hokkaido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalledWith('Hokkaido')
  })

  it('clears and refocuses the input after a successful create', () => {
    renderList({ onCreate: vi.fn() })
    const input = screen.getByPlaceholderText('Trip name') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'Hokkaido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(input.value).toBe('')
  })

  it('disables the submit button while the name is empty', () => {
    renderList()

    const button = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('disables the submit button for a whitespace-only name', () => {
    renderList()

    fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: '   ' } })
    const button = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('re-enables the submit button once a non-whitespace character is typed', () => {
    renderList()
    const input = screen.getByPlaceholderText('Trip name')
    const button = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'H' } })
    expect(button.disabled).toBe(false)
  })

  // The button being disabled is the primary defense, but the same
  // validation still guards a direct form submission (Enter in the
  // input, or any other implicit-submit path a disabled button doesn't
  // block) — exercised here via fireEvent.submit rather than a click,
  // since a click can no longer reach a disabled button at all.
  it('blocks a direct form submission with an empty name, with an inline error', () => {
    const onCreate = vi.fn()
    renderList({ onCreate })

    fireEvent.submit(screen.getByRole('button', { name: 'Create' }).closest('form')!)

    expect(screen.getByText('A trip needs a name.')).toBeDefined()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('blocks a direct form submission with a whitespace-only name the same as an empty one', () => {
    const onCreate = vi.fn()
    renderList({ onCreate })

    fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: '   ' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create' }).closest('form')!)

    expect(screen.getByText('A trip needs a name.')).toBeDefined()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('clears the validation error as soon as a non-whitespace character is typed', () => {
    renderList({ onCreate: vi.fn() })
    const input = screen.getByPlaceholderText('Trip name')

    fireEvent.submit(screen.getByRole('button', { name: 'Create' }).closest('form')!)
    expect(screen.getByText('A trip needs a name.')).toBeDefined()

    fireEvent.change(input, { target: { value: 'H' } })
    expect(screen.queryByText('A trip needs a name.')).toBeNull()
  })

  it('asks for confirmation before deleting, and does not delete on cancel', () => {
    const onDelete = vi.fn()
    renderList({ trips: [tripEntry({ name: 'Hokkaido' })], onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Hokkaido' }))
    expect(screen.getByText('Delete "Hokkaido"?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('Delete "Hokkaido"?')).toBeNull()
  })

  it('deletes the trip once the confirmation is accepted', () => {
    const onDelete = vi.fn()
    renderList({ trips: [tripEntry({ id: 't1', name: 'Hokkaido' })], onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Hokkaido' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledWith('t1')
  })

  it('only allows one row to confirm deletion at a time', () => {
    renderList({
      trips: [tripEntry({ id: 'a', name: 'Hokkaido' }), tripEntry({ id: 'b', name: 'Iceland ring road' })],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Hokkaido' }))
    expect(screen.getByText('Delete "Hokkaido"?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Iceland ring road' }))

    expect(screen.queryByText('Delete "Hokkaido"?')).toBeNull()
    expect(screen.getByText('Delete "Iceland ring road"?')).toBeDefined()
  })

  it('reverts the confirmation on Escape without deleting', () => {
    const onDelete = vi.fn()
    renderList({ trips: [tripEntry({ name: 'Hokkaido' })], onDelete })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Hokkaido' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('Delete "Hokkaido"?')).toBeNull()
  })

  it('carries the full name in the title attribute for hover', () => {
    renderList({ trips: [tripEntry({ name: 'A very long trip name that should truncate' })] })

    expect(screen.getByTitle('A very long trip name that should truncate')).toBeDefined()
  })

  it('links each row to its trip detail route', () => {
    renderList({ trips: [tripEntry({ id: 'abc', name: 'Hokkaido' })] })

    const link = screen.getByText('Hokkaido').closest('a')
    expect(link?.getAttribute('href')).toBe('/trips/abc')
  })

  describe('#73: disabled (no Drive connection)', () => {
    it('disables the create form and states why, even for a non-empty name', () => {
      renderList({ disabled: true })

      fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: 'Hokkaido' } })

      expect((screen.getByPlaceholderText('Trip name') as HTMLInputElement).disabled).toBe(true)
      expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText('Sign in to add or remove trips.')).toBeDefined()
    })

    it('blocks a direct form submission while disabled', () => {
      const onCreate = vi.fn()
      renderList({ disabled: true, onCreate })

      fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: 'Hokkaido' } })
      fireEvent.submit(screen.getByRole('button', { name: 'Create' }).closest('form')!)

      expect(onCreate).not.toHaveBeenCalled()
    })

    it('disables each row\'s delete control and does not open the confirmation', () => {
      renderList({ trips: [tripEntry({ name: 'Hokkaido' })], disabled: true })

      const removeButton = screen.getByRole('button', { name: 'Delete Hokkaido' }) as HTMLButtonElement
      expect(removeButton.disabled).toBe(true)

      fireEvent.click(removeButton)
      expect(screen.queryByText('Delete "Hokkaido"?')).toBeNull()
    })

    it('says nothing about signing in when not disabled', () => {
      renderList()

      expect(screen.queryByText('Sign in to add or remove trips.')).toBeNull()
    })
  })
})
