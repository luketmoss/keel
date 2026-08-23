import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Map3DToggle } from './Map3DToggle'

describe('Map3DToggle (#284)', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <Map3DToggle visible={false} on={false} onChange={vi.fn()} support="available" />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders off, enabled, with no caption when visible and support is available', () => {
    render(<Map3DToggle visible on={false} onChange={vi.fn()} support="available" />)

    const swtch = screen.getByRole('switch', { name: '3D' })
    expect(swtch.getAttribute('aria-checked')).toBe('false')
    expect(swtch.hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText("Cairns don't show in 3D yet.")).toBeNull()
  })

  it('flips on click', () => {
    const onChange = vi.fn()
    render(<Map3DToggle visible on={false} onChange={onChange} support="available" />)

    fireEvent.click(screen.getByRole('switch', { name: '3D' }))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('shows the cairns caption while on', () => {
    render(<Map3DToggle visible on onChange={vi.fn()} support="available" />)
    expect(screen.getByText("Cairns don't show in 3D yet.")).not.toBeNull()
  })

  it('goes disabled with its own sentence when the browser cannot draw 3D', () => {
    render(<Map3DToggle visible on={false} onChange={vi.fn()} support="unavailable" />)

    const swtch = screen.getByRole('switch', { name: '3D' })
    expect(swtch.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText("This browser can't draw 3D. Check that hardware acceleration is on.")).not.toBeNull()
  })

  it('reads as enabled while support is still being checked', () => {
    render(<Map3DToggle visible on={false} onChange={vi.fn()} support="checking" />)
    expect(screen.getByRole('switch', { name: '3D' }).hasAttribute('disabled')).toBe(false)
  })
})
