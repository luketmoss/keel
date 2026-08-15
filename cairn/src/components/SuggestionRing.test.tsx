import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SuggestionRing } from './SuggestionRing'

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => ({}),
  AdvancedMarker: ({
    position,
    onClick,
    children,
  }: {
    position: { lat: number; lng: number }
    onClick?: () => void
    children?: React.ReactNode
  }) => (
    <div
      data-testid="advanced-marker"
      data-lat={position.lat}
      data-lng={position.lng}
      onClick={onClick}
    >
      {children}
    </div>
  ),
}))

describe('SuggestionRing', () => {
  it('renders at the given position with an accessible name and a visible "nearest by time" chip', () => {
    const { container } = render(<SuggestionRing position={{ lat: 10, lng: 20 }} onClick={vi.fn()} />)

    const marker = container.querySelector('[data-testid="advanced-marker"]')
    expect(marker?.getAttribute('data-lat')).toBe('10')
    expect(marker?.getAttribute('data-lng')).toBe('20')
    expect(screen.getByRole('button', { name: 'Place it at the suggested location' })).toBeDefined()
    expect(screen.getByText('nearest by time')).toBeDefined()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<SuggestionRing position={{ lat: 10, lng: 20 }} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Place it at the suggested location' }))

    expect(onClick).toHaveBeenCalled()
  })
})
