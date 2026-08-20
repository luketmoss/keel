import { describe, expect, it } from 'vitest'
import { cairnClickOutcome, expandedIdAfterNavigate } from './cairnExpansion'

describe('cairnClickOutcome', () => {
  it('expands a collapsed cairn with an image, and does not open the lightbox', () => {
    expect(cairnClickOutcome('a', true, null)).toEqual({ expandedCairnId: 'a' })
  })

  it('collapses the cairn it is already expanded, on a second click', () => {
    expect(cairnClickOutcome('a', true, 'a')).toEqual({ expandedCairnId: null })
  })

  it('switches expansion to a different cairn, implicitly collapsing the first', () => {
    expect(cairnClickOutcome('b', true, 'a')).toEqual({ expandedCairnId: 'b' })
  })

  it('opens the lightbox for an icon-only cairn, and leaves expansion untouched', () => {
    const outcome = cairnClickOutcome('a', false, 'b')
    expect(outcome).toEqual({ openCairnId: 'a' })
    expect(outcome.expandedCairnId).toBeUndefined()
  })
})

describe('expandedIdAfterNavigate', () => {
  it('follows the arrow to a cairn with an image', () => {
    expect(expandedIdAfterNavigate('a', true)).toBe('a')
  })

  it('expands nothing when arrowing to an icon-only cairn', () => {
    expect(expandedIdAfterNavigate('a', false)).toBeNull()
  })
})
