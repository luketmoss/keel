import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Sidebar } from './Sidebar'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar nav', () => {
  it('shows "Map" and "Trips" links', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Map' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Trips' })).toBeDefined()
  })

  it('marks only "Map" active at the exact root path', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Map' }).className).toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'Trips' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
  })

  it('marks "Trips" active on the trip detail path, not "Map"', () => {
    renderAt('/trips/xyz')
    expect(screen.getByRole('link', { name: 'Trips' }).className).toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'Map' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
  })
})
