import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LayersControl } from './LayersControl'

function open(props: Partial<Parameters<typeof LayersControl>[0]> = {}) {
  const onChange = vi.fn()
  const onLabelsChange = vi.fn()
  const onChange3D = vi.fn()
  render(
    <LayersControl
      value="satellite"
      labels={false}
      onChange={onChange}
      onLabelsChange={onLabelsChange}
      panelCollapsed={false}
      is3DOn={false}
      onChange3D={onChange3D}
      maps3DSupport="available"
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
  return { onChange, onLabelsChange, onChange3D }
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

  it('collapses the panel when a tile is picked, as #109 specifies', () => {
    const { onChange } = open()

    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))

    expect(onChange).toHaveBeenCalledWith('terrain')
    expect(screen.queryByRole('group', { name: 'Basemap' })).toBeNull()
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
    const { container } = render(
      <LayersControl
        value="roadmap"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))

    expect(container.querySelector('.layers-control__labels-wrap')?.getAttribute('title')).toBe(
      'The map and terrain views always show labels',
    )
  })

  it('names the action in the tooltip while the switch is usable', () => {
    const { container, rerender } = render(
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
    const wrap = () => container.querySelector('.layers-control__labels-wrap')?.getAttribute('title')

    expect(wrap()).toBe('Show place labels on the imagery')

    rerender(
      <LayersControl
        value="satellite"
        labels
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    expect(wrap()).toBe('Hide place labels on the imagery')
  })

  it("marks the trigger's swatch when satellite is carrying labels, and only then", () => {
    const { container, rerender } = render(
      <LayersControl
        value="satellite"
        labels
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    const swatch = () => container.querySelector('.layers-control__trigger .layers-control__swatch')

    expect(swatch()?.className).toContain('layers-control__swatch--labelled')

    rerender(
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    expect(swatch()?.className).not.toContain('layers-control__swatch--labelled')

    rerender(
      <LayersControl
        value="terrain"
        labels
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    expect(swatch()?.className).not.toContain('layers-control__swatch--labelled')
  })
})

describe('LayersControl 3D switch (#271)', () => {
  it('offers the switch off, enabled, with its caption', () => {
    open()

    const swtch = screen.getByRole('switch', { name: /3D/ })
    expect(swtch.getAttribute('aria-checked')).toBe('false')
    expect(swtch.hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Satellite only')).not.toBeNull()
  })

  it('flips on click, and leaves the panel open', () => {
    const { onChange3D } = open()

    fireEvent.click(screen.getByRole('switch', { name: /3D/ }))

    expect(onChange3D).toHaveBeenCalledWith(true)
    expect(screen.getByRole('group', { name: 'Basemap' })).not.toBeNull()
  })

  it('shows the "cairns don\'t draw yet" line only while on', () => {
    const { rerender } = render(
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
    expect(screen.queryByText("Cairns don't show in 3D yet.")).toBeNull()

    rerender(
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    expect(screen.getByText("Cairns don't show in 3D yet.")).not.toBeNull()
  })

  it('goes disabled with its own sentence when the browser cannot draw 3D', () => {
    open({ maps3DSupport: 'unavailable' })

    const swtch = screen.getByRole('switch', { name: /3D/ })
    expect(swtch.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText("This browser can't draw 3D. Check that hardware acceleration is on.")).not.toBeNull()
  })

  it('reads as enabled while support is still being checked', () => {
    open({ maps3DSupport: 'checking' })
    expect(screen.getByRole('switch', { name: /3D/ }).hasAttribute('disabled')).toBe(false)
  })

  it('badges the trigger while on, and only then', () => {
    const { container, rerender } = render(
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn={false}
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    expect(container.querySelector('.layers-control__badge')).toBeNull()

    rerender(
      <LayersControl
        value="satellite"
        labels={false}
        onChange={vi.fn()}
        onLabelsChange={vi.fn()}
        panelCollapsed={false}
        is3DOn
        onChange3D={vi.fn()}
        maps3DSupport="available"
      />,
    )
    expect(container.querySelector('.layers-control__badge')).not.toBeNull()
  })
})
