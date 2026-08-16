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

/* #193 — both exits live behind the row's `⋮` now, so reaching either one
   is two steps. Same helper shape `TripsPanel.test.tsx` already uses. */
function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Row actions for ${name}` }))
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

  it('#198: renders a Not on a track divider for a cairn no track covers and never drops it', () => {
    const rows = [row({ id: 'dated', name: 'z.jpg', date: '2023-06-01' }), row({ id: 'undated', name: 'a.jpg', date: null })]
    const items = orderCairnListItems(rows, new Set(['undated']))

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

    expect(screen.getByText('Not on a track')).toBeDefined()
    expect(screen.getByText('a.jpg')).toBeDefined()
  })

  it('#198: the group heading carries its own count of the rows beneath it', () => {
    const rows = [
      row({ id: 'attached', name: 'z.jpg', date: '2023-06-01' }),
      row({ id: 'u1', name: 'a.jpg', date: null }),
      row({ id: 'u2', name: 'b.jpg', date: null }),
    ]
    const items = orderCairnListItems(rows, new Set(['u1', 'u2']))

    const { container } = render(
      <CairnList
        items={items}
        totalCount={3}
        selectedCairnId={null}
        accessToken="token"
        onOpenRow={vi.fn()}
        {...ownedProps()}
      />,
    )

    // 2 beneath the heading, while the section header still says 3.
    expect((container.querySelector('.cairn-list__divider-count') as HTMLElement).textContent).toBe('2')
    expect((container.querySelector('.cairn-list__count') as HTMLElement).textContent).toBe('3')
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
    it('starts the confirm rather than removing on a single activation of Delete permanently…', () => {
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

      openRowMenu('a.jpg')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
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
      expect(screen.queryByRole('button', { name: 'Row actions for a.jpg' })).toBeNull()
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

      // #73's Disabled treatment on the menu item, not a hidden trigger.
      openRowMenu('a.jpg')
      expect(screen.getByRole('menuitem', { name: 'Delete permanently…' })).toHaveProperty(
        'disabled',
        true,
      )
    })
  })

  describe('#132 remove from trip, beside delete', () => {
    it('offers no unlink action when the caller has nowhere to put a detached photo', () => {
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

      openRowMenu('a.jpg')
      expect(screen.queryByRole('menuitem', { name: /from trip/ })).toBeNull()
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

      openRowMenu('a.jpg')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))

      // No ellipsis, no confirm — reversible by adding it back, which is
      // exactly what makes it the other exit.
      expect(onRemoveFromTrip).toHaveBeenCalledWith('a')
      expect(onRemove).not.toHaveBeenCalled()
      expect(screen.queryByText('Remove "a.jpg"?')).toBeNull()
    })

    it('keeps deleting one click away, as its own named action', () => {
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
      openRowMenu('a.jpg')
      expect(screen.getByRole('menuitem', { name: 'Delete permanently…' })).toBeDefined()
      expect(screen.getByRole('menuitem', { name: 'Remove from trip' })).toBeDefined()
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

      // Disabled items, not a hidden trigger — #73's Disabled treatment.
      openRowMenu('a.jpg')
      expect(screen.getByRole('menuitem', { name: 'Remove from trip' })).toHaveProperty(
        'disabled',
        true,
      )
      expect(screen.getByRole('menuitem', { name: 'Delete permanently…' })).toHaveProperty(
        'disabled',
        true,
      )
    })

    it('hides both exits along with the row menu while a row is mid-removal', () => {
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
      expect(screen.queryByRole('button', { name: 'Row actions for a.jpg' })).toBeNull()
    })
  })

  /* #193 — the anatomy itself: the name first and at full contrast, the
     meta line beneath it, and no `⤴`/`×` left on the row. */
  describe('#193 row anatomy', () => {
    it('renders the name above the meta line, in that order', () => {
      const items = orderCairnListItems([row({ id: 'a' })])
      const { container } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps()}
        />,
      )

      const text = container.querySelector('.cairn-row__text')
      expect(text).not.toBeNull()
      const [first, second] = Array.from(text!.children)
      expect(first.className).toContain('cairn-row__name')
      expect(first.textContent).toBe('a.jpg')
      expect(second.className).toContain('cairn-row__meta')
    })

    it('leaves the meta line exactly what cairns.md specifies', () => {
      const items = orderCairnListItems([
        row({ id: 'a', icon: 'campsite', date: '2023-06-13' }),
        row({ id: 'b', icon: null, date: null, thumbnailDriveFileId: null, originalDriveFileId: null }),
      ])
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

      // The date itself is `formatShortDate`'s and therefore locale-driven,
      // so this pins the clauses either side of it: a date-or-`undated`
      // first, then exactly what `cairns.md` lists and nothing more — no
      // time clause, which is Out of Scope and stays that way.
      expect(screen.getByText(/^.+ · campsite · photo$/)).toBeDefined()
      expect(screen.getByText('undated · cairn')).toBeDefined()
    })

    it('leaves no ⤴ or × anywhere on the row', () => {
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

      expect(screen.queryByText('⤴')).toBeNull()
      expect(screen.queryByText('×')).toBeNull()
      expect(screen.getByRole('button', { name: 'Row actions for a.jpg' })).toBeDefined()
    })
  })

  /* #199 — the cairn row's own icon-only controls. Same assertion as
     `TrackList`'s: the tooltip is the accessible name, character for
     character, so the two cannot drift apart. */
  describe('#199 — icon-only controls carry a tooltip matching their label', () => {
    function expectTooltipMatchesLabel(el: HTMLElement, expected: string) {
      expect(el.getAttribute('aria-label')).toBe(expected)
      expect(el.getAttribute('title')).toBe(el.getAttribute('aria-label'))
    }

    it("names the cairn on the row's ⋮", () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'Notch Mountain' })])
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

      expectTooltipMatchesLabel(
        screen.getByRole('button', { name: 'Row actions for Notch Mountain' }),
        'Row actions for Notch Mountain',
      )
    })

    it("the unattached group's eye names its action and follows its state", () => {
      const items = orderCairnListItems([row({ id: 'a' })], new Set(['a']))
      const { rerender } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          unattachedVisible
          onToggleUnattached={vi.fn()}
          {...ownedProps()}
        />,
      )

      expectTooltipMatchesLabel(
        screen.getByRole('button', { name: 'Hide cairns not on a track' }),
        'Hide cairns not on a track',
      )

      rerender(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          unattachedVisible={false}
          onToggleUnattached={vi.fn()}
          {...ownedProps()}
        />,
      )

      expectTooltipMatchesLabel(
        screen.getByRole('button', { name: 'Show cairns not on a track' }),
        'Show cairns not on a track',
      )
    })
  })
})
