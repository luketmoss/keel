import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LayersControl } from './LayersControl'

function Harness({
  withSibling = false,
  onSiblingClick,
  siblingDisabled = false,
  ...props
}: Partial<React.ComponentProps<typeof LayersControl>> & {
  withSibling?: boolean
  onSiblingClick?: () => void
  siblingDisabled?: boolean
} = {}) {
  const clusterRef = useRef<HTMLDivElement | null>(null)
  return (
    <div ref={clusterRef}>
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        clusterRef={clusterRef}
        {...props}
      />
      {/* Stands in for `Map3DToggle`, the cluster's other member. Its own
          `onClick` lets tests assert ordering — that the sibling's click
          fires before the panel closes, which is exactly what #295's bug
          was: the sibling's click getting swallowed by the panel closing
          first. */}
      {withSibling && (
        <button type="button" aria-label="3D" disabled={siblingDisabled} onClick={onSiblingClick}>
          3D
        </button>
      )}
    </div>
  )
}

function open(
  props: Partial<React.ComponentProps<typeof LayersControl>> = {},
  { withSibling = false, onSiblingClick, siblingDisabled = false }: {
    withSibling?: boolean
    onSiblingClick?: () => void
    siblingDisabled?: boolean
  } = {},
) {
  const onChange = props.onChange ?? vi.fn()
  const onLabelsChange = props.onLabelsChange ?? vi.fn()
  render(
    <Harness
      {...props}
      onChange={onChange}
      onLabelsChange={onLabelsChange}
      withSibling={withSibling}
      onSiblingClick={onSiblingClick}
      siblingDisabled={siblingDisabled}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Layers:/ }))
  return { onChange, onLabelsChange }
}

describe('LayersControl (#263)', () => {
  it('offers three tiles and no Hybrid', () => {
    open()

    const group = screen.getByRole('group', { name: 'Basemap' })
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Map',
      'Satellite',
      'Terrain',
    ])
    expect(screen.queryByText('Hybrid')).toBeNull()
  })

  it('shows the labels switch with the stored preference', () => {
    open({ labels: true })

    const swtch = screen.getByRole('switch', { name: /Labels/ })
    expect(swtch.getAttribute('aria-checked')).toBe('true')
    expect(swtch.hasAttribute('disabled')).toBe(false)
  })

  it('reports the switch off when the preference is off', () => {
    open()
    expect(screen.getByRole('switch', { name: /Labels/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('flips the preference on click, and leaves the panel open', () => {
    const { onLabelsChange } = open()

    fireEvent.click(screen.getByRole('switch', { name: /Labels/ }))

    expect(onLabelsChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it.each(['roadmap', 'terrain'] as const)(
    'shows the switch checked and disabled on %s, whatever the preference says',
    (type) => {
      open({ value: type, labels: false })

      const swtch = screen.getByRole('switch', { name: /Labels/ })
      expect(swtch.getAttribute('aria-checked')).toBe('true')
      expect(swtch.hasAttribute('disabled')).toBe(true)
    },
  )

  it('carries the rule as a tooltip on the wrapper, where a disabled button cannot', () => {
    const { container } = render(<Harness value="roadmap" labels={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Layers:/ }))

    expect(container.querySelector('.layers-control__labels-wrap')?.getAttribute('title')).toBe(
      'The map and terrain views always show labels',
    )
  })

  it('names the action in the tooltip while the switch is usable', () => {
    const { container, rerender } = render(<Harness value="satellite" labels={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Layers:/ }))
    const wrap = () => container.querySelector('.layers-control__labels-wrap')?.getAttribute('title')

    expect(wrap()).toBe('Show place labels on the imagery')

    rerender(<Harness value="satellite" labels />)
    expect(wrap()).toBe('Hide place labels on the imagery')
  })

  it("marks the trigger's swatch when satellite is carrying labels, and only then", () => {
    const { container, rerender } = render(<Harness value="satellite" labels />)
    const swatch = () => container.querySelector('.layers-control__trigger .layers-control__swatch')

    expect(swatch()?.className).toContain('layers-control__swatch--labelled')

    rerender(<Harness value="satellite" labels={false} />)
    expect(swatch()?.className).not.toContain('layers-control__swatch--labelled')

    rerender(<Harness value="terrain" labels />)
    expect(swatch()?.className).not.toContain('layers-control__swatch--labelled')
  })
})

describe('LayersControl, one control (#284)', () => {
  it('names the current basemap on the collapsed control, not "Layers"', () => {
    render(<Harness value="terrain" />)

    expect(screen.getByRole('button', { name: 'Layers: Terrain' })).not.toBeNull()
    expect(screen.queryByText('Layers')).toBeNull()
  })

  it('is either the trigger or the panel, never both', () => {
    render(<Harness />)

    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
    expect(screen.getByRole('button', { name: /Layers:/ })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Layers:/ }))

    expect(screen.queryByRole('button', { name: /Layers:/ })).toBeNull()
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('the word "Layers" never appears once the panel is open', () => {
    open()
    expect(screen.queryByText('Layers')).toBeNull()
  })

  it('stays open when a tile is picked', () => {
    const { onChange } = open()

    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))

    expect(onChange).toHaveBeenCalledWith('terrain')
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('stays open across a second tile pick', () => {
    const { onChange } = open()

    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('closes on Escape and returns focus to the collapsed control', () => {
    open()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Layers:/ }))
  })

  it('closes immediately on a pointer press truly outside the cluster', () => {
    open()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
  })

  it('does not close on a press inside the panel', () => {
    open()

    fireEvent.pointerDown(screen.getByRole('group', { name: 'Basemap' }))

    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('closes on a drag that starts inside the panel and releases outside the cluster (#295)', () => {
    // No `click` fires for a drag — only `pointerdown` sees it, and that
    // path is unchanged for anything truly outside the cluster.
    open()

    fireEvent.pointerDown(screen.getByRole('group', { name: 'Basemap' }))
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
  })

  it('closes when focus moves outside the cluster', () => {
    open()

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.focusIn(outside)

    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
    document.body.removeChild(outside)
  })

  it('stays open when focus moves to another element inside the cluster', () => {
    // The sibling stands in for `Map3DToggle` — #284's edge case that
    // tabbing from the panel to the 3D toggle must not collapse the panel
    // out from under a keyboard user.
    open({}, { withSibling: true })

    fireEvent.focusIn(screen.getByRole('button', { name: '3D' }))

    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('has no close button in the panel', () => {
    open()
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    expect(screen.queryByText('✕')).toBeNull()
  })
})

describe('LayersControl, dismissal through a cluster sibling (#295)', () => {
  it('does not close immediately on pointerdown on the sibling', () => {
    open({}, { withSibling: true })

    fireEvent.pointerDown(screen.getByRole('button', { name: '3D' }))

    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('closes on click on the sibling', () => {
    open({}, { withSibling: true })

    fireEvent.click(screen.getByRole('button', { name: '3D' }))

    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
  })

  it("fires the sibling's own onClick before the panel closes, for a tap (pointerdown + click)", () => {
    const onSiblingClick = vi.fn(() => {
      // At the moment the sibling's handler runs, the panel must still be
      // mounted — this is the ordering #295 is about. A fix that closes the
      // panel first would tear the sibling's own click handling out from
      // under it, exactly like the bug.
      expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
    })
    open({}, { withSibling: true, onSiblingClick })

    const sibling = screen.getByRole('button', { name: '3D' })
    fireEvent.pointerDown(sibling)
    fireEvent.click(sibling)

    expect(onSiblingClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
  })

  it('closes on the synthetic click a keyboard Enter/Space produces on the sibling', () => {
    const onSiblingClick = vi.fn()
    open({}, { withSibling: true, onSiblingClick })

    // jsdom doesn't synthesize a click from a keydown the way a real browser
    // does for a native <button>; asserting the same click listener handles
    // it is the point, since #295's fix relies on `Enter`/`Space` already
    // dispatching a real `click`.
    fireEvent.click(screen.getByRole('button', { name: '3D' }))

    expect(onSiblingClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
  })

  it('does nothing when the sibling is disabled — no click, so nothing closes', () => {
    const onSiblingClick = vi.fn()
    open({}, { withSibling: true, onSiblingClick, siblingDisabled: true })

    const sibling = screen.getByRole('button', { name: '3D' })
    fireEvent.pointerDown(sibling)
    // A disabled button dispatches no `click` at all in a real browser;
    // jsdom's fireEvent.click still calls the handler regardless of
    // `disabled`, so this asserts via pointerdown alone plus the fact that
    // no real tap ever reaches a disabled element's click listener — the
    // panel must not have closed from the pointerdown.
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
    expect(onSiblingClick).not.toHaveBeenCalled()
  })
})
