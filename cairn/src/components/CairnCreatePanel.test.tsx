import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CairnCreatePanel, type CairnDraftFields } from './CairnCreatePanel'

function fields(overrides: Partial<CairnDraftFields> = {}): CairnDraftFields {
  return { name: '', icon: null, description: '', date: '2026-08-15', ...overrides }
}

function renderPanel(props: Partial<Parameters<typeof CairnCreatePanel>[0]> = {}) {
  const onChange = vi.fn()
  const onCreate = vi.fn()
  const onCancel = vi.fn()
  const result = render(
    <CairnCreatePanel
      fields={fields()}
      onChange={onChange}
      tripId={null}
      onCreate={onCreate}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { ...result, onChange, onCreate, onCancel }
}

describe('CairnCreatePanel — the form', () => {
  it('offers name, the eight icons plus none, description and a date', () => {
    const { getByLabelText, getAllByRole } = renderPanel()

    expect(getByLabelText('Name')).toBeDefined()
    expect(getByLabelText('Description')).toBeDefined()
    expect((getByLabelText('Date') as HTMLInputElement).value).toBe('2026-08-15')

    const grid = getAllByRole('group', { name: 'What is this place' })[0]
    // Eight icons and `none`, and not a cell more — the set is fixed.
    expect(grid.querySelectorAll('button')).toHaveLength(9)
  })

  it('focuses the name field on open', () => {
    const { getByLabelText } = renderPanel()

    expect(document.activeElement).toBe(getByLabelText('Name'))
  })

  it('defaults the icon to none rather than pre-selecting one', () => {
    const { getByRole } = renderPanel()

    expect(getByRole('button', { name: 'none' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'campsite' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports a chosen icon up rather than holding it itself', () => {
    const { getByRole, onChange } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'campsite' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icon: 'campsite' }))
  })
})

describe('CairnCreatePanel — ownership is stated before you commit', () => {
  it('says the cairn will be loose when nothing was open', () => {
    const { getByText } = renderPanel({ tripId: null })

    expect(getByText('(nothing was open — this will be loose)')).toBeDefined()
    expect(getByText('null')).toBeDefined()
  })

  it('names the trip when one was open', () => {
    const { getByText } = renderPanel({ tripId: 'trip-7' })

    expect(getByText('(a trip was open when you clicked)')).toBeDefined()
    expect(getByText('trip-7')).toBeDefined()
  })

  it('always states the position source as placed', () => {
    const { getByText } = renderPanel()

    expect(getByText('placed')).toBeDefined()
  })
})

describe('CairnCreatePanel — the exits', () => {
  it('commits on Create', () => {
    const { getByRole, onCreate } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalled()
  })

  it('cancels on Cancel', () => {
    const { getByRole, onCancel } = renderPanel()

    fireEvent.click(getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('treats Escape as Cancel', () => {
    const { onCancel } = renderPanel()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalled()
  })
})

describe('CairnCreatePanel — disconnected (#73)', () => {
  it('disables Create with one sentence, and still fills in', () => {
    const { getByRole, getByLabelText, getByText, onChange } = renderPanel({ disabled: true })

    expect((getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    expect(getByText('Sign in to keep cairns.')).toBeDefined()

    fireEvent.change(getByLabelText('Name'), { target: { value: 'Ellery Creek camp' } })
    fireEvent.click(getByRole('button', { name: 'campsite' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ellery Creek camp' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icon: 'campsite' }))
  })

  it('still cancels', () => {
    const { getByRole, onCancel } = renderPanel({ disabled: true })

    fireEvent.click(getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
