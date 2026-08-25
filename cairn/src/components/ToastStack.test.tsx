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

  /* #327 — a toast that announces a state (the Drive session ending)
     rather than a one-off event stays until the user acts, unlike every
     existing rejected-file toast above. */
  it('does not auto-dismiss a persistent toast', () => {
    const onDismiss = vi.fn()
    render(<ToastStack toasts={[{ id: '1', text: 'Session ended', persistent: true }]} onDismiss={onDismiss} />)

    vi.advanceTimersByTime(60_000)

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('still dismisses a persistent toast by hand', () => {
    const onDismiss = vi.fn()
    render(<ToastStack toasts={[{ id: '1', text: 'Session ended', persistent: true }]} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledWith('1')
  })

  it('renders an action and calls it on click', () => {
    const onClick = vi.fn()
    render(
      <ToastStack
        toasts={[{ id: '1', text: 'Session ended', persistent: true, action: { label: 'Sign in', onClick } }]}
        onDismiss={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onClick).toHaveBeenCalled()
  })

  it('disables the action and swaps its label while pending', () => {
    render(
      <ToastStack
        toasts={[
          {
            id: '1',
            text: 'Session ended',
            persistent: true,
            action: { label: 'Sign in', pendingLabel: 'Signing in…', pending: true, onClick: vi.fn() },
          },
        ]}
        onDismiss={vi.fn()}
      />,
    )

    const action = screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement
    expect(action.disabled).toBe(true)
  })

  it('applies the default tone class instead of the danger default', () => {
    const { container } = render(
      <ToastStack toasts={[{ id: '1', text: 'Session ended', tone: 'default' }]} onDismiss={vi.fn()} />,
    )

    expect(container.querySelector('.toast')?.className).toContain('toast--default')
  })
})
