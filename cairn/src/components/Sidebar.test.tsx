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
  it('shows "Map", "Trips", and "World" links, in that order', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Map' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Trips' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'World' })).toBeDefined()

    const links = screen.getAllByRole('link').map((link) => link.textContent)
    expect(links).toEqual(['Map', 'Trips', 'World'])
  })

  it('marks only "Map" active at the exact root path', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Map' }).className).toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'Trips' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'World' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
  })

  it('marks "Trips" active on the trip detail path, not "Map" or "World"', () => {
    renderAt('/trips/xyz')
    expect(screen.getByRole('link', { name: 'Trips' }).className).toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'Map' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'World' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
  })

  it('marks "World" active on the world map path', () => {
    renderAt('/world')
    expect(screen.getByRole('link', { name: 'World' }).className).toContain(
      'sidebar__nav-link--active',
    )
    expect(screen.getByRole('link', { name: 'Map' }).className).not.toContain(
      'sidebar__nav-link--active',
    )
  })
})
