import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CoordinateResult } from './CoordinateResult'
import { MapProvider } from './MapCanvas'

/** cairn/docs/design/337-pasting-a-coordinate.md — the result row. */

const SEATTLE = { lat: 47.6205, lng: -122.3493 }

describe('CoordinateResult', () => {
  it('shows the normalised point to five decimal places', () => {
    render(<CoordinateResult point={SEATTLE} onChoose={() => {}} />)
    expect(screen.getByText('47.62050, -122.34930')).toBeTruthy()
  })

  it('says what choosing it will do', () => {
    render(<CoordinateResult point={SEATTLE} onChoose={() => {}} />)
    expect(screen.getByText('go here and place a cairn')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go to 47.62050, -122.34930 and place a cairn' })).toBeTruthy()
  })

  it('chooses the coordinate when the row is clicked', () => {
    const onChoose = vi.fn()
    render(<CoordinateResult point={SEATTLE} onChoose={onChoose} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onChoose).toHaveBeenCalledTimes(1)
  })

  it('does not offer a row when there is no map to go to', () => {
    // No API key in the test environment, so `MapProvider` resolves to its
    // unavailable state — "There is nowhere to go, and the map's own
    // unavailable state already says so."
    render(
      <MapProvider>
        <CoordinateResult point={SEATTLE} onChoose={() => {}} />
      </MapProvider>,
    )

    expect(screen.queryByRole('button')).toBeNull()
  })
})
