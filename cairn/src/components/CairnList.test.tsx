import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  expandedCairnId: string | null
  onOpenPreview: ReturnType<typeof vi.fn>
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
    // #250 — defaulted here the same way every other owned prop is, so the
    // 25+ existing call sites above don't each need updating for a state
    // this suite's older tests don't exercise.
    expandedCairnId: null,
    onOpenPreview: vi.fn(),
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

  it('calls onOpenRow when a row is clicked (#250: selection and expand/open live in the caller now)', () => {
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

    // #235 — the same mark and states as the track row's toggle: an
    // aria-hidden SVG, one path when visible, a second (the slash) when not.
    it("draws the unattached group's toggle as the same eye the track row uses", () => {
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

      const visibleButton = screen.getByRole('button', { name: 'Hide cairns not on a track' })
      expect(visibleButton.textContent).toBe('')
      const svg = visibleButton.querySelector('svg')
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
      expect(svg?.querySelectorAll('path')).toHaveLength(1)

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

      const hiddenButton = screen.getByRole('button', { name: 'Show cairns not on a track' })
      expect(hiddenButton.querySelector('svg')?.querySelectorAll('path')).toHaveLength(2)
    })
  })

  /* #251 — the list's half of "hover lights the marker and the row lights
     back" (251-linked-hover.md). `hoveredCairnIds`/`onHoverCairn` are plain
     props here, same as `expandedCairnId` above: the set itself, and which
     ids resolve to which markers, live in `TripDetail`/`CairnLayer`, and
     this suite only checks that a row reads and writes its own half. */
  describe('#251 linked hover', () => {
    it('applies the hovered class to the row named by hoveredCairnIds, and no other', () => {
      const items = orderCairnListItems([row({ id: 'a' }), row({ id: 'b' })])
      const { container } = render(
        <CairnList
          items={items}
          totalCount={2}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          hoveredCairnIds={new Set(['b'])}
          {...ownedProps()}
        />,
      )

      const rows = container.querySelectorAll('.cairn-row')
      expect(rows[0].className).not.toContain('cairn-row--hovered')
      expect(rows[1].className).toContain('cairn-row--hovered')
    })

    it('calls onHoverCairn with the id on mouseenter and null on mouseleave', () => {
      const onHoverCairn = vi.fn()
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])
      const { container } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onHoverCairn={onHoverCairn}
          {...ownedProps()}
        />,
      )

      const li = container.querySelector('.cairn-row') as HTMLElement
      fireEvent.mouseEnter(li)
      expect(onHoverCairn).toHaveBeenLastCalledWith('a')
      fireEvent.mouseLeave(li)
      expect(onHoverCairn).toHaveBeenLastCalledWith(null)
    })

    it('focus and blur on the row header drive the identical write as mouseenter/mouseleave', () => {
      const onHoverCairn = vi.fn()
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])
      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onHoverCairn={onHoverCairn}
          {...ownedProps()}
        />,
      )

      const button = screen.getByText('a.jpg').closest('button') as HTMLElement
      fireEvent.focus(button)
      expect(onHoverCairn).toHaveBeenLastCalledWith('a')
      fireEvent.blur(button)
      expect(onHoverCairn).toHaveBeenLastCalledWith(null)
    })

    it('a hidden row still takes the hovered class and forwards hover, keeping its hidden treatment (#198)', () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])
      const onHoverCairn = vi.fn()
      const { container } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          onHoverCairn={onHoverCairn}
          hoveredCairnIds={new Set(['a'])}
          hiddenCairnIds={new Set(['a'])}
          {...ownedProps()}
        />,
      )

      const li = container.querySelector('.cairn-row') as HTMLElement
      expect(li.className).toContain('cairn-row--hidden')
      expect(li.className).toContain('cairn-row--hovered')
      fireEvent.mouseEnter(li)
      expect(onHoverCairn).toHaveBeenLastCalledWith('a')
    })

    it('a selected row keeps its selected class alongside the hovered one — hover never replaces selection', () => {
      const items = orderCairnListItems([row({ id: 'a' })])
      const { container } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId="a"
          accessToken="token"
          onOpenRow={vi.fn()}
          hoveredCairnIds={new Set(['a'])}
          {...ownedProps()}
        />,
      )

      const li = container.querySelector('.cairn-row') as HTMLElement
      expect(li.className).toContain('cairn-row--selected')
      expect(li.className).toContain('cairn-row--hovered')
    })

    it('hovering a row never changes the selection, the expansion, or scrolls the list', () => {
      const scrollIntoView = vi.fn()
      Element.prototype.scrollIntoView = scrollIntoView
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])
      const onOpenRow = vi.fn()
      const { container } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={onOpenRow}
          {...ownedProps()}
        />,
      )

      fireEvent.mouseEnter(container.querySelector('.cairn-row') as HTMLElement)
      fireEvent.focus(screen.getByText('a.jpg').closest('button') as HTMLElement)

      expect(onOpenRow).not.toHaveBeenCalled()
      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })

  /* #250 — the expanded row's inline preview. `expandedCairnId` is a plain
     prop here: the toggle/single-expanded-at-a-time rules live in
     `cairnExpansion.ts` and `TripDetail`, and this suite only checks that
     the row renders what the prop says. */
  describe('#250 expanded row preview', () => {
    it('draws the inline preview only for the row named by expandedCairnId', async () => {
      const rows = [row({ id: 'a', name: 'a.jpg' }), row({ id: 'b', name: 'b.jpg' })]
      const items = orderCairnListItems(rows)

      render(
        <CairnList
          items={items}
          totalCount={2}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: 'a' })}
        />,
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'View a.jpg larger' })).toBeDefined()
      })
      expect(screen.queryByRole('button', { name: 'View b.jpg larger' })).toBeNull()
    })

    it('carries aria-expanded on the header of a cairn with an image, true or false', () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])

      const { rerender } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: null })}
        />,
      )
      expect(screen.getByText('a.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('false')

      rerender(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: 'a' })}
        />,
      )
      expect(screen.getByText('a.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('true')
    })

    it('omits aria-expanded entirely on an icon-only cairn — it is not an expandable thing', () => {
      const items = orderCairnListItems([
        row({ id: 'a', name: 'a.jpg', icon: 'campsite', thumbnailDriveFileId: null, originalDriveFileId: null }),
      ])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: 'a' })}
        />,
      )

      expect(screen.getByText('a.jpg').closest('button')?.hasAttribute('aria-expanded')).toBe(false)
      // Nothing to expand — no preview button either.
      expect(screen.queryByRole('button', { name: 'View a.jpg larger' })).toBeNull()
    })

    it('clicking the preview calls onOpenPreview, not onOpenRow', async () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])
      const onOpenRow = vi.fn()
      const onOpenPreview = vi.fn()

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={onOpenRow}
          {...ownedProps({ expandedCairnId: 'a', onOpenPreview })}
        />,
      )

      const preview = await waitFor(() => screen.getByRole('button', { name: 'View a.jpg larger' }))
      fireEvent.click(preview)

      expect(onOpenPreview).toHaveBeenCalledWith('a')
      expect(onOpenRow).not.toHaveBeenCalled()
    })

    it('draws the preview immediately from the glyph thumbnail already in hand, with no blank frame before the original lands', async () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])

      const { rerender } = render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: null })}
        />,
      )

      // Let the glyph's own thumbnail request land, as it already will have
      // for a row that's been sitting in the list a while before it's
      // clicked — that's the "already loaded" half of the criterion.
      await waitFor(() => {
        expect(document.querySelector('.cairn-row__glyph img')).not.toBeNull()
      })

      // Expanding now must not pass through the loading placeholder: the
      // preview's own `usePhotoImage` for the display-size original hasn't
      // resolved yet at this point (it starts fetching only once mounted),
      // so an immediate blank frame here would mean the design doc's rule
      // — draw the thumbnail already in hand, swap to the original later —
      // was not honoured.
      rerender(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: 'a' })}
        />,
      )

      const preview = screen.getByRole('button', { name: 'View a.jpg larger' })
      expect(preview.querySelector('.cairn-row__preview-image')).not.toBeNull()
      expect(preview.querySelector('.cairn-row__preview-loading')).toBeNull()
    })

    it('renders the row header and the preview as native buttons, so Enter and Space activate both for free', async () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: 'a' })}
        />,
      )

      expect(screen.getByText('a.jpg').closest('button')?.tagName).toBe('BUTTON')
      const preview = await waitFor(() => screen.getByRole('button', { name: 'View a.jpg larger' }))
      expect(preview.tagName).toBe('BUTTON')
    })

    it('never draws a preview for a removing row, even when it names expandedCairnId', () => {
      const items = orderCairnListItems([row({ id: 'a', name: 'a.jpg' })])

      render(
        <CairnList
          items={items}
          totalCount={1}
          selectedCairnId={null}
          accessToken="token"
          onOpenRow={vi.fn()}
          {...ownedProps({ expandedCairnId: 'a', removingIds: new Set(['a']) })}
        />,
      )

      expect(screen.queryByRole('button', { name: 'View a.jpg larger' })).toBeNull()
    })
  })
})
