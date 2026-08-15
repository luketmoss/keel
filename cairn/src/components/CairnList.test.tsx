import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CairnList } from './CairnList'
import { orderCairnListItems, type CairnListRow } from '../photo/cairnListGroups'
import type { CairnFacet } from '../store/cairnRules'

vi.mock('../photo/imageCache', () => ({
  photoImageCache: {
    acquire: vi.fn().mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() }),
  },
}))

function row(overrides: Partial<CairnListRow> = {}): CairnListRow {
  return {
    id: 'p1',
    name: 'a.jpg',
    icon: null,
    thumbnailDriveFileId: 'thumb-1',
    originalDriveFileId: 'orig-1',
    date: '2023-06-16',
    source: 'exif',
    ...overrides,
  }
}

/* State this list does not own, supplied on every render: #77's remove
   control shares its confirm slot with `TrackList`, and #192's facet is
   the trip's, not the list's — both live in `TripDetail`. Kept as one
   spreadable default object rather than repeating eight props on every
   call site, and overridable per test. */
function ownedProps(overrides: Partial<{
  onRemove: ReturnType<typeof vi.fn>
  confirmingId: string | null
  onStartConfirm: ReturnType<typeof vi.fn>
  onCancelConfirm: ReturnType<typeof vi.fn>
  removingIds: Set<string>
  removeErrors: Record<string, string>
  disableRemove: boolean
  facet: CairnFacet
  onFacetChange: ReturnType<typeof vi.fn>
}> = {}) {
  return {
    onRemove: vi.fn(),
    confirmingId: null,
    onStartConfirm: vi.fn(),
    onCancelConfirm: vi.fn(),
    confirmingRowRef: { current: null },
    removingIds: new Set<string>(),
    removeErrors: {},
    disableRemove: false,
    facet: 'any' as CairnFacet,
    onFacetChange: vi.fn(),
    ...overrides,
  }
}

describe('CairnList', () => {
  it('shows the empty state pointing at the import control when the trip has no cairns', () => {
    render(
      <CairnList
        items={[]}
        totalCount={0}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    expect(screen.getByText('No cairns yet')).toBeDefined()
    expect(screen.getByText('Drop photos onto this trip to see them here.')).toBeDefined()
    // No count shown next to the header when there are no cairns.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('renders one row per cairn and the header count', () => {
    const rows = [row({ id: 'a', date: '2023-06-01' }), row({ id: 'b', date: '2023-06-02' })]
    const items = orderCairnListItems(rows)

    const { container } = render(
      <CairnList
        items={items}
        totalCount={2}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    expect(screen.getByText('2')).toBeDefined()
    // Two open buttons plus two remove buttons, one pair per row. Scoped
    // to the rows: #192's facet row is buttons too, and it is not a row.
    expect(container.querySelectorAll('.cairn-list__rows button')).toHaveLength(4)
  })

  it('#169: includes an icon-only cairn (no image) in the same list', () => {
    const rows = [row({ id: 'a', icon: 'campsite', thumbnailDriveFileId: null })]
    const items = orderCairnListItems(rows)

    render(
      <CairnList
        items={items}
        totalCount={1}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    expect(screen.getByText('a.jpg')).toBeDefined()
  })

  it('renders a No date divider for an undated cairn and never drops it', () => {
    const rows = [row({ id: 'dated', name: 'z.jpg', date: '2023-06-01' }), row({ id: 'undated', name: 'a.jpg', date: null })]
    const items = orderCairnListItems(rows)

    render(
      <CairnList
        items={items}
        totalCount={2}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    expect(screen.getByText('No date')).toBeDefined()
    expect(screen.getByText('a.jpg')).toBeDefined()
  })

  it('the meta line reads clauses for icon and photo (cairns.md "The row")', () => {
    const items = orderCairnListItems([row({ id: 'a', icon: 'campsite', thumbnailDriveFileId: 'thumb-1' })])

    render(
      <CairnList
        items={items}
        totalCount={1}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    expect(screen.getByText(/campsite · photo/)).toBeDefined()
  })

  it('calls onOpenRow when a row is clicked (selection + open in one action)', () => {
    const onOpenRow = vi.fn()
    const rows = [row({ id: 'a', name: 'a.jpg' })]
    const items = orderCairnListItems(rows)

    render(
      <CairnList
        items={items}
        totalCount={1}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={onOpenRow}
        {...ownedProps()}
      />,
    )

    fireEvent.click(screen.getByText('a.jpg'))
    expect(onOpenRow).toHaveBeenCalledWith('a')
  })

  it('marks the selected row distinctly (design language selected state)', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const items = orderCairnListItems(rows)

    const { container } = render(
      <CairnList
        items={items}
        totalCount={2}
        selectedCairnId="b"
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    const listItems = container.querySelectorAll('.cairn-row')
    expect(listItems[0].className).not.toContain('cairn-row--selected')
    expect(listItems[1].className).toContain('cairn-row--selected')
  })

  it('scrolls the selected row into view with block: nearest when selection changes', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const items = orderCairnListItems(rows)

    const { rerender } = render(
      <CairnList
        items={items}
        totalCount={2}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(
      <CairnList
        items={items}
        totalCount={2}
        selectedCairnId="b"
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
  })

  describe('#77 removal', () => {
    it('starts the confirm rather than removing on a single activation of the remove control', () => {
      const items = orderCairnListItems([row({ id: 'a' })])
      const onStartConfirm = vi.fn()
      const onRemove = vi.fn()

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ onStartConfirm, onRemove })}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Delete a.jpg permanently' }))
      expect(onStartConfirm).toHaveBeenCalledWith('a')
      expect(onRemove).not.toHaveBeenCalled()
    })

    it('renders the confirm for the confirming row and calls onRemove only from its Remove action', () => {
      const items = orderCairnListItems([row({ id: 'a' })])
      const onRemove = vi.fn()
      const onCancelConfirm = vi.fn()

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ confirmingId: 'a', onRemove, onCancelConfirm })}
        />,
      )

      expect(screen.getByText('Remove "a.jpg"?')).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(onRemove).toHaveBeenCalledWith('a')
      expect(onCancelConfirm).toHaveBeenCalled()
    })

    it('cancelling the confirm removes nothing', () => {
      const items = orderCairnListItems([row({ id: 'a' })])
      const onRemove = vi.fn()
      const onCancelConfirm = vi.fn()

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ confirmingId: 'a', onRemove, onCancelConfirm })}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onRemove).not.toHaveBeenCalled()
      expect(onCancelConfirm).toHaveBeenCalled()
    })

    it('shows Removing… and hides the remove control while a row is mid-removal', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ removingIds: new Set(['a']) })}
        />,
      )

      expect(screen.getByText('Removing…')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Delete a.jpg permanently' })).toBeNull()
    })

    it('shows a failure line beneath a row whose removal failed, without removing it', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ removeErrors: { a: "Couldn't remove a.jpg — try again." } })}
        />,
      )

      expect(screen.getByText("Couldn't remove a.jpg — try again.")).toBeDefined()
      expect(screen.getByText('a.jpg')).toBeDefined()
    })

    it('disables the remove control while disconnected', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ disableRemove: true })}
        />,
      )

      expect(screen.getByRole('button', { name: 'Delete a.jpg permanently' })).toHaveProperty('disabled', true)
    })
  })

  describe('#132 remove from trip, beside delete', () => {
    it('offers no unlink control when the caller has nowhere to put a detached photo', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps()}
        />,
      )

      expect(screen.queryByRole('button', { name: /from trip/ })).toBeNull()
    })

    it('returns the cairn to the top level without a confirm', () => {
      const items = orderCairnListItems([row({ id: 'a' })])
      const onRemoveFromTrip = vi.fn()
      const onRemove = vi.fn()

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onRemoveFromTrip={onRemoveFromTrip}
          {...ownedProps({ onRemove })}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg from trip' }))

      // No ellipsis, no confirm — reversible by adding it back, which is
      // exactly what makes it the other exit.
      expect(onRemoveFromTrip).toHaveBeenCalledWith('a')
      expect(onRemove).not.toHaveBeenCalled()
      expect(screen.queryByText('Remove "a.jpg"?')).toBeNull()
    })

    it('keeps deleting one click away, as its own named control', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onRemoveFromTrip={vi.fn()}
          {...ownedProps()}
        />,
      )

      // Two exits, never one action with a second step.
      expect(screen.getByRole('button', { name: 'Delete a.jpg permanently' })).toBeDefined()
      expect(screen.getByRole('button', { name: 'Remove a.jpg from trip' })).toBeDefined()
    })

    it('disables both exits while disconnected', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onRemoveFromTrip={vi.fn()}
          {...ownedProps({ disableRemove: true })}
        />,
      )

      expect(screen.getByRole('button', { name: 'Remove a.jpg from trip' })).toHaveProperty(
        'disabled',
        true,
      )
      expect(screen.getByRole('button', { name: 'Delete a.jpg permanently' })).toHaveProperty(
        'disabled',
        true,
      )
    })

    it('hides the unlink control alongside the delete control while a row is mid-removal', () => {
      const items = orderCairnListItems([row({ id: 'a' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onRemoveFromTrip={vi.fn()}
          {...ownedProps({ removingIds: new Set(['a']) })}
        />,
      )

      expect(screen.getByText('Removing…')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Remove a.jpg from trip' })).toBeNull()
    })
  })
})
