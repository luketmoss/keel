import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { controlResult } = vi.hoisted(() => ({
  controlResult: {
    current: {
      support: 'available' as 'checking' | 'available' | 'unavailable',
      on: false,
      setOn: vi.fn(),
      flyover: null,
      requestFlyover: vi.fn(),
    },
  },
}))
vi.mock('../map/Map3DControl', () => ({
  useMap3DControl: () => controlResult.current,
}))

import { FlyoverButton } from './FlyoverButton'

describe('FlyoverButton (#274)', () => {
  it('renders nothing for a subject with no usable geometry', () => {
    const { container } = render(<FlyoverButton label="Ridge Traverse" points={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('names the subject in its accessible name, and the visible label stays "Fly over"', () => {
    render(<FlyoverButton label="Ridge Traverse" points={[{ lat: 1, lng: 2 }]} />)
    const button = screen.getByRole('button', { name: 'Fly over Ridge Traverse' })
    expect(button.textContent).toContain('Fly over')
    expect(button.textContent).not.toContain('Ridge Traverse')
  })

  it('pressing it requests a flyover of the subject\'s own points', () => {
    render(<FlyoverButton label="Ridge Traverse" points={[{ lat: 1, lng: 2 }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fly over Ridge Traverse' }))
    expect(controlResult.current.requestFlyover).toHaveBeenCalledWith([{ lat: 1, lng: 2 }])
  })

  it('goes disabled with #271\'s own sentence when the browser cannot draw 3D', () => {
    controlResult.current = { ...controlResult.current, support: 'unavailable' }
    render(<FlyoverButton label="Ridge Traverse" points={[{ lat: 1, lng: 2 }]} />)
    const button = screen.getByRole('button', { name: 'Fly over Ridge Traverse' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(
      screen.getByText("This browser can't draw 3D. Check that hardware acceleration is on."),
    ).not.toBeNull()
  })

  it('a single point is still usable geometry — the button shows', () => {
    controlResult.current = { ...controlResult.current, support: 'available' }
    render(<FlyoverButton label="One Cairn" points={[{ lat: 1, lng: 2 }]} />)
    expect(screen.getByRole('button', { name: 'Fly over One Cairn' })).not.toBeNull()
  })
})
