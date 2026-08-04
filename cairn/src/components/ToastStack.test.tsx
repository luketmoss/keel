import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastStack } from './ToastStack'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastStack', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastStack toasts={[]} onDismiss={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders every toast', () => {
    render(
      <ToastStack
        toasts={[
          { id: '1', text: 'Only .kml and .kmz files can be imported.' },
          { id: '2', text: 'notes.txt is not a valid KML file.' },
        ]}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('Only .kml and .kmz files can be imported.')).toBeDefined()
    expect(screen.getByText('notes.txt is not a valid KML file.')).toBeDefined()
  })

  it('dismisses a toast when its close control is clicked', () => {
    const onDismiss = vi.fn()
    render(<ToastStack toasts={[{ id: '1', text: 'Rejected' }]} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledWith('1')
  })

  it('auto-dismisses after 6 seconds', () => {
    const onDismiss = vi.fn()
    render(<ToastStack toasts={[{ id: '1', text: 'Rejected' }]} onDismiss={onDismiss} />)

    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(6000)
    expect(onDismiss).toHaveBeenCalledWith('1')
  })
})
