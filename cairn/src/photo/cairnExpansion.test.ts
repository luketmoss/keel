import { describe, expect, it } from 'vitest'
import { cairnClickOutcome, expandedIdAfterNavigate } from './cairnExpansion'

describe('cairnClickOutcome', () => {
  it('expands a collapsed cairn with an image', () => {
    expect(cairnClickOutcome('a', null)).toEqual({ expandedCairnId: 'a' })
  })

  it('expands a collapsed cairn with no image, the same as one with an image', () => {
    expect(cairnClickOutcome('a', null)).toEqual({ expandedCairnId: 'a' })
  })

  it('collapses the cairn it is already expanded, on a second click', () => {
    expect(cairnClickOutcome('a', 'a')).toEqual({ expandedCairnId: null })
  })

  it('switches expansion to a different cairn, implicitly collapsing the first', () => {
    expect(cairnClickOutcome('b', 'a')).toEqual({ expandedCairnId: 'b' })
  })
})

describe('expandedIdAfterNavigate', () => {
  it('follows the arrow to a cairn with an image', () => {
    expect(expandedIdAfterNavigate('a')).toBe('a')
  })

  it('follows the arrow to a cairn with no image, the same as one with an image', () => {
    expect(expandedIdAfterNavigate('b')).toBe('b')
  })
})
