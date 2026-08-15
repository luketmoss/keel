import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CairnFacetChips } from './CairnFacetChips'

describe('CairnFacetChips (#159)', () => {
  it('offers Any, Photo, then one chip per place icon, in the fixed order', () => {
    render(<CairnFacetChips facet="any" onChange={vi.fn()} />)

    const group = screen.getByRole('group', { name: 'Filter cairns' })
    const buttons = Array.from(group.querySelectorAll('button'))
    expect(buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
      'Any',
      'Photo',
      'campsite',
      'water',
      'hut',
      'viewpoint',
      'summit',
      'hazard',
      'parking',
      'junction',
    ])
  })

  it('place chips render icon-only, carrying an aria-label of the facet name', () => {
    render(<CairnFacetChips facet="any" onChange={vi.fn()} />)

    const campsite = screen.getByRole('button', { name: 'campsite' })
    expect(campsite.textContent).toBe('')
    expect(campsite.querySelector('svg')).not.toBeNull()
  })

  it('marks the active facet selected via aria-pressed, and nothing else', () => {
    render(<CairnFacetChips facet="campsite" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'campsite' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Any' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Photo' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'water' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports the clicked facet', () => {
    const onChange = vi.fn()
    render(<CairnFacetChips facet="any" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Photo' }))
    expect(onChange).toHaveBeenCalledWith('photo')

    fireEvent.click(screen.getByRole('button', { name: 'hut' }))
    expect(onChange).toHaveBeenCalledWith('hut')
  })
})
