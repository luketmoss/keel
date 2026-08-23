import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LayersControl } from './LayersControl'

function Harness({
  withSibling = false,
  ...props
}: Partial<React.ComponentProps<typeof LayersControl>> & { withSibling?: boolean } = {}) {
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
      {/* Stands in for `Map3DToggle`, the cluster's other member. */}
      {withSibling && (
        <button type="button" aria-label="3D">
          3D
        </button>
      )}
    </div>
  )
}

function open(
  props: Partial<React.ComponentProps<typeof LayersControl>> = {},
  { withSibling = false }: { withSibling?: boolean } = {},
) {
  const onChange = props.onChange ?? vi.fn()
  const onLabelsChange = props.onLabelsChange ?? vi.fn()
  render(<Harness {...props} onChange={onChange} onLabelsChange={onLabelsChange} withSibling={withSibling} />)
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

  it('closes on a pointer press outside the panel', () => {
    open()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
  })

  it('does not close on a press inside the panel', () => {
    open()

    fireEvent.pointerDown(screen.getByRole('group', { name: 'Basemap' }))

    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
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
