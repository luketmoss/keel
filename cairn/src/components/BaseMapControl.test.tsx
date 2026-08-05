import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BaseMapControl } from './BaseMapControl'

describe('BaseMapControl', () => {
  it('renders all four base map types', () => {
    render(<BaseMapControl value="satellite" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Map' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Satellite' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Hybrid' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Terrain' })).toBeDefined()
  })

  it('marks the current value as active', () => {
    render(<BaseMapControl value="hybrid" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Hybrid' }).className).toContain(
      'basemap-control__segment--active',
    )
    expect(screen.getByRole('button', { name: 'Satellite' }).className).not.toContain(
      'basemap-control__segment--active',
    )
  })

  it('calls onChange with the selected type', () => {
    const onChange = vi.fn()
    render(<BaseMapControl value="satellite" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))

    expect(onChange).toHaveBeenCalledWith('terrain')
  })
})
