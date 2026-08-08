import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraftPanel } from './DraftPanel'
import type { DraftState } from '../import/useDraftTrip'

function draftState(overrides: Partial<DraftState> = {}): DraftState {
  return {
    files: [
      { id: 'f1', name: 'day1.kml', file: new File(['x'], 'day1.kml'), tracks: [{ name: 'Day 1', points: [] }] },
    ],
    name: 'day1',
    startDate: null,
    endDate: null,
    notes: '',
    saving: false,
    saveError: null,
    ...overrides,
  }
}

function baseProps(overrides: Partial<Parameters<typeof DraftPanel>[0]> = {}) {
  return {
    draft: draftState(),
    updateName: vi.fn(),
    updateDates: vi.fn(),
    updateNotes: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onKeepLoose: vi.fn(),
    signedIn: true,
    onSignIn: vi.fn(),
    ...overrides,
  }
}

describe('DraftPanel', () => {
  it('shows the NOT SAVED eyebrow and a file summary for one file', () => {
    render(<DraftPanel {...baseProps()} />)

    expect(screen.getByText('NOT SAVED')).toBeDefined()
    expect(screen.getByText('day1.kml · 1 track')).toBeDefined()
  })

  it('pluralizes the summary for several files', () => {
    render(
      <DraftPanel
        {...baseProps({
          draft: draftState({
            files: [
              { id: 'f1', name: 'day1.kml', file: new File(['x'], 'day1.kml'), tracks: [{ name: 'Day 1', points: [] }] },
              {
                id: 'f2',
                name: 'day2.kml',
                file: new File(['x'], 'day2.kml'),
                tracks: [
                  { name: 'A', points: [] },
                  { name: 'B', points: [] },
                ],
              },
            ],
          }),
        })}
      />,
    )

    expect(screen.getByText('2 files · 3 tracks')).toBeDefined()
  })

  it('seeds the name field from the draft and calls updateName on edit', () => {
    const updateName = vi.fn()
    render(<DraftPanel {...baseProps({ updateName })} />)

    const heading = screen.getByText('day1')
    fireEvent.click(heading)
    const input = screen.getByDisplayValue('day1')
    fireEvent.change(input, { target: { value: 'Hokkaido' } })
    fireEvent.blur(input)

    expect(updateName).toHaveBeenCalledWith('Hokkaido')
  })

  it('calls onSave when Save is clicked', () => {
    const onSave = vi.fn()
    render(<DraftPanel {...baseProps({ onSave })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<DraftPanel {...baseProps({ onCancel })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables Save when the name is empty', () => {
    render(<DraftPanel {...baseProps({ draft: draftState({ name: '' }) })} />)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
  })

  it('shows Saving… and disables both actions while saving', () => {
    render(<DraftPanel {...baseProps({ draft: draftState({ saving: true }) })} />)

    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true)
  })

  it('shows the failure message and re-enables Save when a save has failed', () => {
    render(
      <DraftPanel
        {...baseProps({
          draft: draftState({ saveError: 'Could not save. Your tracks are still here — try again.' }),
        })}
      />,
    )

    expect(
      screen.getByText('Could not save. Your tracks are still here — try again.'),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false)
  })

  it('replaces Save with a sign-in control while signed out', () => {
    const onSignIn = vi.fn()
    render(<DraftPanel {...baseProps({ signedIn: false, onSignIn })} />)

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to save' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})
