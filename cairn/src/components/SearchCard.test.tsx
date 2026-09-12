import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchCard } from './SearchCard'

/** cairn/docs/design/337-pasting-a-coordinate.md — Enter in the field. */

function renderCard(onSubmitQuery?: () => void) {
  return render(
    <SearchCard
      detail={null}
      onBack={() => {}}
      query="47.6205, -122.3493"
      onQueryChange={() => {}}
      onSubmitQuery={onSubmitQuery}
      accountBubble={null}
    />,
  )
}

describe('SearchCard', () => {
  it('chooses the coordinate on Enter', () => {
    const onSubmitQuery = vi.fn()
    renderCard(onSubmitQuery)

    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })

    expect(onSubmitQuery).toHaveBeenCalledTimes(1)
  })

  it('does nothing on Enter when the query is not a coordinate', () => {
    // `onSubmitQuery` is undefined then — the field is a filter, and there
    // is no submission to make.
    renderCard(undefined)

    // Nothing to assert but the absence of a throw: the key is handled and
    // ignored, which is what it has always done here.
    expect(() => fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })).not.toThrow()
  })

  it('ignores keys that are not Enter', () => {
    const onSubmitQuery = vi.fn()
    renderCard(onSubmitQuery)

    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'a' })

    expect(onSubmitQuery).not.toHaveBeenCalled()
  })
})
