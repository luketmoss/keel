import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Map3DControlProvider, useMap3DControl } from './Map3DControl'

const { supportResult } = vi.hoisted(() => ({ supportResult: { current: 'available' as string } }))
vi.mock('./use3DSupport', () => ({
  use3DSupport: () => ({ support: supportResult.current, library: null }),
}))

function Probe() {
  const control = useMap3DControl()
  return (
    <div>
      <span data-testid="on">{String(control.on)}</span>
      <span data-testid="support">{control.support}</span>
      <span data-testid="token">{control.flyover?.token ?? 'none'}</span>
      <button onClick={() => control.setOn(!control.on)}>toggle</button>
      <button onClick={() => control.requestFlyover([{ lat: 1, lng: 2 }])}>fly</button>
      <button onClick={() => control.requestFlyover([])}>fly-empty</button>
    </div>
  )
}

describe('Map3DControlProvider (#274)', () => {
  it('gives a caller outside the provider a safe fallback rather than throwing', () => {
    expect(() => render(<Probe />)).not.toThrow()
    expect(screen.getByTestId('on').textContent).toBe('false')
    expect(screen.getByTestId('support').textContent).toBe('unavailable')
  })

  it('requestFlyover turns 3D on and records the request', () => {
    supportResult.current = 'available'
    render(
      <Map3DControlProvider>
        <Probe />
      </Map3DControlProvider>,
    )
    expect(screen.getByTestId('on').textContent).toBe('false')

    fireEvent.click(screen.getByText('fly'))

    expect(screen.getByTestId('on').textContent).toBe('true')
    expect(screen.getByTestId('token').textContent).toBe('1')
  })

  it('a second requestFlyover increments the token even with the same points — restarts, does not stack', () => {
    render(
      <Map3DControlProvider>
        <Probe />
      </Map3DControlProvider>,
    )
    fireEvent.click(screen.getByText('fly'))
    expect(screen.getByTestId('token').textContent).toBe('1')
    fireEvent.click(screen.getByText('fly'))
    expect(screen.getByTestId('token').textContent).toBe('2')
  })

  it('requestFlyover with no points is a no-op', () => {
    render(
      <Map3DControlProvider>
        <Probe />
      </Map3DControlProvider>,
    )
    fireEvent.click(screen.getByText('fly-empty'))
    expect(screen.getByTestId('on').textContent).toBe('false')
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('turning 3D off clears the flyover request so it cannot replay', () => {
    render(
      <Map3DControlProvider>
        <Probe />
      </Map3DControlProvider>,
    )
    fireEvent.click(screen.getByText('fly'))
    expect(screen.getByTestId('token').textContent).toBe('1')

    fireEvent.click(screen.getByText('toggle')) // off
    expect(screen.getByTestId('on').textContent).toBe('false')
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('3D going unavailable while on turns it off and clears the flyover', () => {
    supportResult.current = 'available'
    const { rerender } = render(
      <Map3DControlProvider>
        <Probe />
      </Map3DControlProvider>,
    )
    fireEvent.click(screen.getByText('fly'))
    expect(screen.getByTestId('on').textContent).toBe('true')

    supportResult.current = 'unavailable'
    rerender(
      <Map3DControlProvider>
        <Probe />
      </Map3DControlProvider>,
    )

    expect(screen.getByTestId('on').textContent).toBe('false')
    expect(screen.getByTestId('token').textContent).toBe('none')
  })
})
