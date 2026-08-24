import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { fitTracksToBounds } = vi.hoisted(() => ({ fitTracksToBounds: vi.fn() }))
vi.mock('../map/fitBounds', () => ({ fitTracksToBounds, zoomToFitCluster: vi.fn(), FIT_PADDING: 48 }))

const { fakeMap } = vi.hoisted(() => ({ fakeMap: { id: 'fake-map' } }))
vi.mock('@vis.gl/react-google-maps', () => ({ useMap: () => fakeMap }))

const { is3DOnResult, requestReset } = vi.hoisted(() => ({
  is3DOnResult: { current: false },
  requestReset: vi.fn(),
}))
vi.mock('./Map3DControl', () => ({
  useMap3DControl: () => ({ on: is3DOnResult.current, requestReset }),
}))

import { HomeResetOnNavigate } from './HomeResetOnNavigate'

afterEach(() => {
  fitTracksToBounds.mockClear()
  requestReset.mockClear()
  is3DOnResult.current = false
})

/* A tiny stand-in for the app's own route tree, with `HomeResetOnNavigate`
   mounted once at the top the same way it sits in `App.tsx` — a sibling of
   the routed content, not inside any one route's element — plus the
   navigation controls a real test needs to move between routes and back,
   exercising the same history stack the browser's own Back/Forward do. */
function Nav() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/trips/42')}>Go to trip</button>
      <button onClick={() => navigate('/trips/99')}>Go to another trip</button>
      <button onClick={() => navigate('/')}>Go home</button>
      <button onClick={() => navigate(-1)}>Browser back</button>
    </>
  )
}

function TestHarness({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={['/', initialPath]} initialIndex={1}>
      <HomeResetOnNavigate />
      <Nav />
      <Routes>
        <Route path="/" element={<div>home</div>} />
        <Route path="/trips/:id" element={<div>trip</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('HomeResetOnNavigate (#314)', () => {
  it('does not fire on the initial mount at "/" — the map already opens home via defaultBounds', () => {
    render(<TestHarness initialPath="/" />)

    expect(fitTracksToBounds).not.toHaveBeenCalled()
    expect(requestReset).not.toHaveBeenCalled()
  })

  it('does not fire mounting straight onto a non-home route', () => {
    render(<TestHarness initialPath="/trips/42" />)

    expect(fitTracksToBounds).not.toHaveBeenCalled()
    expect(requestReset).not.toHaveBeenCalled()
  })

  it('resets the 2D camera to the home extent when an in-app Back navigates to "/"', () => {
    render(<TestHarness initialPath="/trips/42" />)

    fireEvent.click(screen.getByRole('button', { name: 'Go home' }))

    expect(fitTracksToBounds).toHaveBeenCalledWith(fakeMap, expect.anything(), expect.anything())
  })

  it('resets the same way when the browser\'s own Back lands on "/"', () => {
    render(<TestHarness initialPath="/trips/42" />)

    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))

    expect(fitTracksToBounds).toHaveBeenCalledWith(fakeMap, expect.anything(), expect.anything())
  })

  it('requests the 3D reset instead of the 2D fit, when 3D is on', () => {
    is3DOnResult.current = true
    render(<TestHarness initialPath="/trips/42" />)

    fireEvent.click(screen.getByRole('button', { name: 'Go home' }))

    expect(requestReset).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('does not fire navigating between two non-home routes', () => {
    render(<TestHarness initialPath="/trips/42" />)

    fireEvent.click(screen.getByRole('button', { name: 'Go to another trip' }))

    expect(fitTracksToBounds).not.toHaveBeenCalled()
    expect(requestReset).not.toHaveBeenCalled()
  })
})
