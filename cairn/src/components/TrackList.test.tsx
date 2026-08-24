import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackList } from './TrackList'
import type { ImportedFile } from '../import/types'

function importedFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  const tracks = overrides.tracks ?? [{ name: 'Track', points: [] }]
  return {
    id: 'f1',
    name: 'trip.kml',
    sourceName: 'trip.kml',
    driveFileId: 'drive-f1',
    colorIndex: 0,
    visible: true,
    tracks,
    trackStats: tracks.map(() => ({
      distanceMeters: 0,
      durationSeconds: undefined,
      elevationGainMeters: undefined,
      elevationLossMeters: undefined,
      highPointMeters: undefined,
      lowPointMeters: undefined,
    })),
    ...overrides,
  }
}

/* #193 — both exits live behind the row's `⋮` now, so reaching either one
   is two steps. Same helper shape `TripsPanel.test.tsx` already uses. */
function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Row actions for ${name}` }))
}

describe('TrackList', () => {
  it('shows an empty state pointing at the import control when nothing is imported', () => {
    render(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

    expect(screen.getByText('No tracks yet')).toBeDefined()
    expect(screen.getByText(/Import tracks/)).toBeDefined()
  })

  it('renders one row per imported file', () => {
    render(
      <TrackList
        files={[importedFile({ id: 'a' }), importedFile({ id: 'b', name: 'other.kmz' })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('trip.kml', { exact: false })).toBeDefined()
    expect(screen.getByText('other.kmz', { exact: false })).toBeDefined()
  })

  it('shows a swatch matching the file colour and names how many tracks a multi-track file holds', () => {
    const { container } = render(
      <TrackList
        files={[
          importedFile({
            tracks: [
              { name: 'a', points: [] },
              { name: 'b', points: [] },
              { name: 'c', points: [] },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    const swatch = container.querySelector('.track-row__swatch') as HTMLElement
    expect(swatch.style.backgroundColor).toBe('rgb(255, 59, 48)') // #FF3B30
    expect(screen.getByText('3 tracks', { exact: false })).toBeDefined()
  })

  it('shows the formatted statistics line for a single-track file', () => {
    render(
      <TrackList
        files={[
          importedFile({
            trackStats: [
              {
                distanceMeters: 8.1 * 1609.344,
                durationSeconds: 47 * 60,
                elevationGainMeters: 0,
                elevationLossMeters: 0,
                highPointMeters: 100,
                lowPointMeters: 100,
              },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('8.1 mi · 47m · 0 ft ↑')).toBeDefined()
  })

  it('shows no statistics line for a multi-track file — aggregation is out of scope', () => {
    render(
      <TrackList
        files={[
          importedFile({
            tracks: [
              { name: 'a', points: [] },
              { name: 'b', points: [] },
            ],
            trackStats: [
              {
                distanceMeters: 1000,
                durationSeconds: 60,
                elevationGainMeters: 10,
                elevationLossMeters: 5,
                highPointMeters: 110,
                lowPointMeters: 100,
              },
              {
                distanceMeters: 2000,
                durationSeconds: 120,
                elevationGainMeters: 20,
                elevationLossMeters: 15,
                highPointMeters: 120,
                lowPointMeters: 100,
              },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    expect(document.querySelector('.track-row__stats')).toBeNull()
  })

  it('keeps the statistics line present when the row is hidden', () => {
    render(
      <TrackList
        files={[
          importedFile({
            visible: false,
            trackStats: [
              {
                distanceMeters: 1609.344,
                durationSeconds: 60,
                elevationGainMeters: 5,
                elevationLossMeters: 0,
                highPointMeters: 105,
                lowPointMeters: 100,
              },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    expect(document.querySelector('.track-row__stats')).not.toBeNull()
  })

  it('says nothing about count for a single-track file', () => {
    render(
      <TrackList
        files={[importedFile({ tracks: [{ name: 'a', points: [] }] })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    expect(screen.queryByText(/track(s)?$/)).toBeNull()
  })

  it('carries the full name in the title attribute for hover', () => {
    render(
      <TrackList
        files={[importedFile({ name: '2024-08-01T09-14-22Z-morning-run.kml' })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    const name = screen.getByTitle('2024-08-01T09-14-22Z-morning-run.kml')
    expect(name).toBeDefined()
  })

  it('toggles visibility via an accessible button and reflects the hidden state', () => {
    const onToggleVisibility = vi.fn()
    const { rerender } = render(
      <TrackList
        files={[importedFile({ visible: true })]}
        onToggleVisibility={onToggleVisibility}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    const hideButton = screen.getByRole('button', { name: 'Hide trip.kml' })
    fireEvent.click(hideButton)
    expect(onToggleVisibility).toHaveBeenCalledWith('f1')

    rerender(
      <TrackList
        files={[importedFile({ visible: false })]}
        onToggleVisibility={onToggleVisibility}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Show trip.kml' })).toBeDefined()
  })

  // #235 — the emoji it replaced ('👁'/'🚫') is gone from the accessible
  // tree; the icon is a decorative SVG carrying no text a screen reader
  // would read, and the hidden state adds a second path (the slash) rather
  // than swapping to a different glyph.
  it('draws the show/hide control as an aria-hidden SVG, struck through only when hidden', () => {
    const { rerender } = render(
      <TrackList files={[importedFile({ visible: true })]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />,
    )

    const visibleButton = screen.getByRole('button', { name: 'Hide trip.kml' })
    expect(visibleButton.textContent).toBe('')
    const svg = visibleButton.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.querySelectorAll('path')).toHaveLength(1)

    rerender(
      <TrackList files={[importedFile({ visible: false })]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />,
    )

    const hiddenButton = screen.getByRole('button', { name: 'Show trip.kml' })
    expect(hiddenButton.querySelector('svg')?.querySelectorAll('path')).toHaveLength(2)
  })

  it('returns to the empty state after the last file is removed', () => {
    const { rerender } = render(
      <TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />,
    )
    expect(screen.queryByText('No tracks yet')).toBeNull()

    rerender(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

    expect(screen.getByText('No tracks yet')).toBeDefined()
  })

  it('reports the hovered file id on mouse enter and null on mouse leave (#49)', () => {
    const onHoverFile = vi.fn()
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onHoverFile={onHoverFile}
      />,
    )

    const row = screen.getByText('trip.kml', { exact: false }).closest('li')!
    fireEvent.mouseEnter(row)
    expect(onHoverFile).toHaveBeenCalledWith('f1')

    fireEvent.mouseLeave(row)
    expect(onHoverFile).toHaveBeenCalledWith(null)
  })

  it('does nothing on hover when onHoverFile is omitted', () => {
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

    const row = screen.getByText('trip.kml', { exact: false }).closest('li')!
    expect(() => fireEvent.mouseEnter(row)).not.toThrow()
  })

  it('does not render a drag handle or colour button when their handlers are omitted (#46)', () => {
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

    expect(screen.queryByLabelText('Reorder trip.kml')).toBeNull()
    expect(screen.queryByLabelText('Change colour for trip.kml')).toBeNull()
  })

  it('offers no Rename action when onRename is omitted (#219)', () => {
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

    openRowMenu('trip.kml')
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull()
  })

  it('renames a track via the row menu and calls onRename with the trimmed value (#46, #219)', () => {
    const onRename = vi.fn().mockResolvedValue(true)
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onRename={onRename}
      />,
    )

    openRowMenu('trip.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByDisplayValue('trip.kml')
    fireEvent.change(input, { target: { value: '  Ridge day  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRename).toHaveBeenCalledWith('f1', 'Ridge day')
  })

  it('reverts to read mode without saving on an empty rename commit (#46)', () => {
    const onRename = vi.fn()
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onRename={onRename}
      />,
    )

    openRowMenu('trip.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByDisplayValue('trip.kml')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('trip.kml', { exact: false })).toBeDefined()
  })

  it('discards an in-progress rename on Escape (#46)', () => {
    const onRename = vi.fn()
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onRename={onRename}
      />,
    )

    openRowMenu('trip.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByDisplayValue('trip.kml')
    fireEvent.change(input, { target: { value: 'Something else' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByText('trip.kml', { exact: false })).toBeDefined()
  })

  it('shows a save-failure message beneath the list when a rename fails, without changing the name (#46)', async () => {
    const onRename = vi.fn().mockResolvedValue(false)
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onRename={onRename}
      />,
    )

    openRowMenu('trip.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByDisplayValue('trip.kml'), { target: { value: 'New name' } })
    fireEvent.keyDown(screen.getByDisplayValue('New name'), { key: 'Enter' })

    expect(await screen.findByText("Couldn't save name — reverted.")).toBeDefined()
    expect(screen.getByText('trip.kml', { exact: false })).toBeDefined()
  })

  it('opens a colour popover from the swatch button and calls onRecolor with the chosen index (#46)', () => {
    const onRecolor = vi.fn().mockResolvedValue(true)
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onRecolor={onRecolor}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Change colour for trip.kml' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cyan' }))

    expect(onRecolor).toHaveBeenCalledWith('f1', 1)
    expect(screen.queryByRole('button', { name: 'Cyan' })).toBeNull()
  })

  it('reorders tracks by dragging one row onto another and calls onReorder with the new id order (#46)', () => {
    const onReorder = vi.fn().mockResolvedValue(true)
    render(
      <TrackList
        files={[importedFile({ id: 'a', name: 'a.kml' }), importedFile({ id: 'b', name: 'b.kml' })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onReorder={onReorder}
      />,
    )

    const handleA = screen.getByLabelText('Reorder a.kml')
    const rowB = screen.getByText('b.kml', { exact: false }).closest('li')!
    Object.defineProperty(rowB, 'getBoundingClientRect', {
      value: () => ({ top: 0, height: 40 }),
      configurable: true,
    })

    fireEvent.dragStart(handleA)
    // Below the row's vertical midpoint — a drop here lands "a" after "b".
    fireEvent.dragOver(rowB, { clientY: 40 })
    fireEvent.drop(rowB)

    expect(onReorder).toHaveBeenCalledWith(['b', 'a'])
  })

  describe('#77 removal', () => {
    it('starts the confirm rather than removing on a single activation, when the parent supplies onStartConfirm', () => {
      const onStartConfirm = vi.fn()
      const onRemove = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={onRemove}
          onStartConfirm={onStartConfirm}
        />,
      )

      openRowMenu('trip.kml')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
      expect(onStartConfirm).toHaveBeenCalledWith('f1')
      expect(onRemove).not.toHaveBeenCalled()
    })

    it('renders the confirm for the confirming row and calls onRemove only from its Remove action', () => {
      const onRemove = vi.fn()
      const onCancelConfirm = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={onRemove}
          onStartConfirm={vi.fn()}
          onCancelConfirm={onCancelConfirm}
          confirmingId="f1"
        />,
      )

      expect(screen.getByText('Delete "trip.kml"?')).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(onRemove).toHaveBeenCalledWith('f1')
      expect(onCancelConfirm).toHaveBeenCalled()
    })

    it('cancelling the confirm removes nothing', () => {
      const onRemove = vi.fn()
      const onCancelConfirm = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={onRemove}
          onStartConfirm={vi.fn()}
          onCancelConfirm={onCancelConfirm}
          confirmingId="f1"
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onRemove).not.toHaveBeenCalled()
      expect(onCancelConfirm).toHaveBeenCalled()
    })

    it('shows Removing… and hides the remove control while a row is mid-removal', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          removingIds={new Set(['f1'])}
        />,
      )

      expect(screen.getByText('Removing…')).toBeDefined()
      expect(screen.queryByRole('button', { name: 'Row actions for trip.kml' })).toBeNull()
    })

    it('shows a failure line beneath a row whose removal failed, without removing it', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          removeErrors={{ f1: "Couldn't remove trip.kml — try again." }}
        />,
      )

      expect(screen.getByText("Couldn't remove trip.kml — try again.")).toBeDefined()
      expect(screen.getByTitle('trip.kml')).toBeDefined()
    })

    it('disables the remove control while disconnected', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          disableRemove
        />,
      )

      // #73's Disabled treatment on the menu item, not a hidden trigger.
      openRowMenu('trip.kml')
      expect(screen.getByRole('menuitem', { name: 'Delete permanently…' })).toHaveProperty(
        'disabled',
        true,
      )
    })
  })

  it('does not attach a drag handler when canReorder is false (#46)', () => {
    const onReorder = vi.fn()
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onStartConfirm={vi.fn()}
        onReorder={onReorder}
        canReorder={false}
      />,
    )

    const handle = screen.getByLabelText('Reorder trip.kml')
    expect(handle.className).toContain('track-row__handle--disabled')
    fireEvent.dragStart(handle)
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('disables rename, recolour, and reorder while disabled (#72), leaving visibility and remove live', () => {
    const onRename = vi.fn()
    const onRecolor = vi.fn()
    const onReorder = vi.fn()
    const onToggleVisibility = vi.fn()
    const onRemove = vi.fn()
    const onStartConfirm = vi.fn()
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
        onStartConfirm={onStartConfirm}
        onRename={onRename}
        onRecolor={onRecolor}
        onReorder={onReorder}
        disabled
      />,
    )

    // #219: the name button opens the detail regardless of `disabled` —
    // opening touches no Drive-backed state. Rename itself is the row
    // menu's own disabled item, per #73's Disabled treatment.
    openRowMenu('trip.kml')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveProperty('disabled', true)
    openRowMenu('trip.kml') // closes it again, for the Delete click below

    // Recolour button is disabled.
    const swatchButton = screen.getByRole('button', { name: 'Change colour for trip.kml' })
    expect(swatchButton).toHaveProperty('disabled', true)

    // Drag handle renders in its existing disabled treatment.
    const handle = screen.getByLabelText('Reorder trip.kml')
    expect(handle.className).toContain('track-row__handle--disabled')
    fireEvent.dragStart(handle)
    expect(onReorder).not.toHaveBeenCalled()

    // Visibility and remove are untouched — neither is Drive-backed.
    fireEvent.click(screen.getByRole('button', { name: 'Hide trip.kml' }))
    expect(onToggleVisibility).toHaveBeenCalledWith('f1')
    openRowMenu('trip.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
    expect(onStartConfirm).toHaveBeenCalledWith('f1')
    expect(onRemove).not.toHaveBeenCalled()
  })

  describe('#110 remove from trip, beside delete', () => {
    it('offers no unlink action when the list is not inside a trip', () => {
      render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

      openRowMenu('trip.kml')
      expect(screen.queryByRole('menuitem', { name: /from trip/ })).toBeNull()
    })

    it('returns the track to the top level without a confirm', () => {
      const onRemoveFromTrip = vi.fn()
      const onRemove = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={onRemove}
          onStartConfirm={vi.fn()}
          onRemoveFromTrip={onRemoveFromTrip}
        />,
      )

      openRowMenu('trip.kml')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))

      // No ellipsis, no confirm — it is reversible by adding it back, which
      // is exactly what makes it the other exit.
      expect(onRemoveFromTrip).toHaveBeenCalledWith('f1')
      expect(onRemove).not.toHaveBeenCalled()
      expect(screen.queryByText('Delete "trip.kml"?')).toBeNull()
    })

    it('keeps deleting one click away, as its own named action', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onRemoveFromTrip={vi.fn()}
        />,
      )

      // Two exits, never one action with a second step.
      openRowMenu('trip.kml')
      expect(screen.getByRole('menuitem', { name: 'Delete permanently…' })).toBeDefined()
      expect(screen.getByRole('menuitem', { name: 'Remove from trip' })).toBeDefined()
    })

    it('disables both exits while disconnected', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onRemoveFromTrip={vi.fn()}
          disableRemove
        />,
      )

      // Disabled items, not a hidden trigger — #73's Disabled treatment.
      openRowMenu('trip.kml')
      expect(screen.getByRole('menuitem', { name: 'Remove from trip' })).toHaveProperty(
        'disabled',
        true,
      )
      expect(screen.getByRole('menuitem', { name: 'Delete permanently…' })).toHaveProperty(
        'disabled',
        true,
      )
    })
  })

  /* #193 — the anatomy itself: the name on its own line at full contrast,
     the meta line beneath it, and no `⤴`/`×` left on the row. */
  describe('#193 row anatomy', () => {
    it('renders the name and the stats line as one block, name first', () => {
      const { container } = render(
        <TrackList
          files={[
            importedFile({
              trackStats: [
                {
                  distanceMeters: 14200,
                  durationSeconds: undefined,
                  elevationGainMeters: 690,
                  elevationLossMeters: 620,
                  highPointMeters: 2100,
                  lowPointMeters: 1500,
                },
              ],
            }),
          ]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
        />,
      )

      const text = container.querySelector('.track-row__text')
      expect(text).not.toBeNull()
      const [first, second] = Array.from(text!.children)
      expect(first.className).toContain('track-row__name')
      expect(second.className).toContain('track-row__stats')
    })

    it('leaves no ⤴ or × anywhere on the row', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onRemoveFromTrip={vi.fn()}
        />,
      )

      expect(screen.queryByText('⤴')).toBeNull()
      expect(screen.queryByText('×')).toBeNull()
      expect(screen.getByRole('button', { name: 'Row actions for trip.kml' })).toBeDefined()
    })

    it('keeps the visibility control on the row rather than in the menu', () => {
      const onToggleVisibility = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={onToggleVisibility}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onRemoveFromTrip={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Hide trip.kml' }))
      expect(onToggleVisibility).toHaveBeenCalledWith('f1')
    })
  })

  /* #199 — every icon-only control names its action *and its row*. The
     assertion is always `title === aria-label`: the criterion is that the
     tooltip and the accessible name cannot disagree, not that either one
     has some particular wording. */
  describe('#199 — icon-only controls carry a tooltip matching their label', () => {
    function expectTooltipMatchesLabel(el: HTMLElement, expected: string) {
      expect(el.getAttribute('aria-label')).toBe(expected)
      expect(el.getAttribute('title')).toBe(el.getAttribute('aria-label'))
    }

    it('names the track on the reorder handle, the swatch, and the ⋮', () => {
      const { container } = render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onRemoveFromTrip={vi.fn()}
          onRecolor={vi.fn().mockResolvedValue(true)}
          onReorder={vi.fn().mockResolvedValue(true)}
        />,
      )

      expectTooltipMatchesLabel(
        container.querySelector('.track-row__handle') as HTMLElement,
        'Reorder trip.kml',
      )
      expectTooltipMatchesLabel(
        screen.getByRole('button', { name: 'Change colour for trip.kml' }),
        'Change colour for trip.kml',
      )
      expectTooltipMatchesLabel(
        screen.getByRole('button', { name: 'Row actions for trip.kml' }),
        'Row actions for trip.kml',
      )
    })

    it("the visibility control's tooltip follows its current state", () => {
      const { rerender } = render(
        <TrackList files={[importedFile({ visible: true })]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />,
      )

      expectTooltipMatchesLabel(screen.getByRole('button', { name: 'Hide trip.kml' }), 'Hide trip.kml')

      rerender(
        <TrackList files={[importedFile({ visible: false })]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />,
      )

      expectTooltipMatchesLabel(screen.getByRole('button', { name: 'Show trip.kml' }), 'Show trip.kml')
    })
  })

  /* #268 — the track detail is back inline, at the row's own content
     width, and `More details` is gone from the `⋮`. TrackList no longer
     owns the open/closed state itself (#219 did) — it's controlled from
     outside via `expandedTrackId`/`onToggleExpand`, the same shape
     `CairnList`'s `expandedCairnId` already uses, so #270 can move it
     later without collapsing the row. */
  describe('#268 expanding a track row', () => {
    function trackWithProfile(overrides: Partial<ImportedFile> = {}) {
      return importedFile({
        tracks: [
          {
            name: 'a',
            points: [
              { lat: 40, lon: -105, elevation: 1500 },
              { lat: 40.01, lon: -105.01, elevation: 1600 },
              { lat: 40.02, lon: -105.02, elevation: 1550 },
            ],
          },
        ],
        trackStats: [
          {
            distanceMeters: 1200,
            durationSeconds: 600,
            elevationGainMeters: 100,
            elevationLossMeters: 50,
            highPointMeters: 1600,
            lowPointMeters: 1500,
          },
        ],
        ...overrides,
      })
    }

    it('calls onToggleExpand with the file id when the header is clicked', () => {
      const onToggleExpand = vi.fn()
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
        />,
      )

      fireEvent.click(screen.getByText('trip.kml', { exact: false }))
      expect(onToggleExpand).toHaveBeenCalledWith('f1')
    })

    it('also toggles on the header row whitespace, outside the name and meta line', () => {
      const onToggleExpand = vi.fn()
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
        />,
      )

      const main = document.querySelector('.track-row__main') as HTMLElement
      fireEvent.click(main)
      expect(onToggleExpand).toHaveBeenCalledWith('f1')
    })

    it('does not toggle from a click on the handle, swatch, visibility control, or ⋮', () => {
      const onToggleExpand = vi.fn()
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
          onRecolor={vi.fn()}
          onReorder={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByLabelText('Reorder trip.kml'))
      fireEvent.click(screen.getByRole('button', { name: 'Change colour for trip.kml' }))
      fireEvent.click(screen.getByRole('button', { name: 'Hide trip.kml' }))
      openRowMenu('trip.kml')

      expect(onToggleExpand).not.toHaveBeenCalled()
    })

    it('does not toggle while renaming, even from a click beside the input', () => {
      const onToggleExpand = vi.fn()
      const onRename = vi.fn()
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
          onRename={onRename}
        />,
      )

      openRowMenu('trip.kml')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      fireEvent.click(document.querySelector('.track-row__main') as HTMLElement)

      expect(onToggleExpand).not.toHaveBeenCalled()
    })

    it('shows the profile, six stat cells, and the points/source footnote for the row named by expandedTrackId', () => {
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          expandedTrackId="f1"
        />,
      )

      expect(document.querySelector('.track-elevation-profile')).not.toBeNull()
      expect(screen.getByText('Distance')).toBeDefined()
      expect(screen.getByText('Ascent')).toBeDefined()
      expect(screen.getByText('Descent')).toBeDefined()
      expect(screen.getByText('High point')).toBeDefined()
      expect(screen.getByText('Low point')).toBeDefined()
      expect(screen.getByText('Duration')).toBeDefined()
      expect(screen.getByText('3 points · trip.kml')).toBeDefined()
    })

    it('draws the detail flush inside the row, not nested in the text column', () => {
      const { container } = render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          expandedTrackId="f1"
        />,
      )

      const li = container.querySelector('li.track-row')!
      const wrap = li.querySelector('.track-row__detail-wrapper')
      expect(wrap).not.toBeNull()
      // A sibling of `.track-row__main`, not inside `.track-row__text`.
      expect(wrap!.parentElement).toBe(li)
    })

    it('marks the open row with aria-expanded and points aria-controls at the detail block', () => {
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          expandedTrackId="f1"
        />,
      )

      const header = document.querySelector('.track-row__text--button')!
      expect(header.getAttribute('aria-expanded')).toBe('true')
      const controlsId = header.getAttribute('aria-controls')!
      expect(document.getElementById(controlsId)).not.toBeNull()
    })

    it('shows the stat grid with em-dash elevation cells and no profile when elevation is unusable', () => {
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          expandedTrackId="f1"
        />,
      )

      expect(document.querySelector('.track-elevation-profile')).toBeNull()
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })

    it('does not expand a multi-track file, carries no aria-expanded, and offers no detail block', () => {
      const onToggleExpand = vi.fn()
      render(
        <TrackList
          files={[
            importedFile({
              tracks: [
                { name: 'a', points: [] },
                { name: 'b', points: [] },
              ],
            }),
          ]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
          expandedTrackId="f1"
        />,
      )

      // No button at all — the name stays a plain span for a file with no
      // unambiguous numbers to show.
      expect(document.querySelector('.track-row__text--button')).toBeNull()
      fireEvent.click(screen.getByText('trip.kml', { exact: false }))
      expect(onToggleExpand).not.toHaveBeenCalled()
      expect(document.querySelector('.track-row__detail-wrapper')).toBeNull()
    })

    /* `expandedTrackId`/`onToggleExpand` are controlled from `TripDetail`
       (the same shape `expandedCairnId` already uses) — this wrapper plays
       that parent's own toggle rule, `current === id ? null : id`, so the
       full open/close/one-at-a-time round trip is exercised the same way a
       real mount would drive it, without pulling in `TripDetail` itself. */
    function Controlled({ files }: { files: ImportedFile[] }) {
      const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null)
      return (
        <TrackList
          files={files}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          expandedTrackId={expandedTrackId}
          onToggleExpand={(id) => setExpandedTrackId((current) => (current === id ? null : id))}
        />
      )
    }

    it('a second click on the header collapses the row it opened', () => {
      render(<Controlled files={[trackWithProfile()]} />)

      const header = screen.getByText('trip.kml', { exact: false }).closest('button')!
      fireEvent.click(header)
      expect(header.getAttribute('aria-expanded')).toBe('true')

      fireEvent.click(header)
      expect(header.getAttribute('aria-expanded')).toBe('false')
    })

    it('expanding one row collapses whichever other row was expanded', () => {
      render(
        <Controlled
          files={[trackWithProfile({ id: 'a', name: 'a.kml' }), trackWithProfile({ id: 'b', name: 'b.kml' })]}
        />,
      )

      const headerA = screen.getByText('a.kml', { exact: false }).closest('button')!
      const headerB = screen.getByText('b.kml', { exact: false }).closest('button')!

      fireEvent.click(headerA)
      expect(headerA.getAttribute('aria-expanded')).toBe('true')
      expect(headerB.getAttribute('aria-expanded')).toBe('false')

      fireEvent.click(headerB)
      expect(headerA.getAttribute('aria-expanded')).toBe('false')
      expect(headerB.getAttribute('aria-expanded')).toBe('true')
    })

    it('offers no More details item in the row menu', () => {
      render(<TrackList files={[trackWithProfile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} onStartConfirm={vi.fn()} />)

      openRowMenu('trip.kml')
      expect(screen.queryByRole('menuitem', { name: 'More details' })).toBeNull()
    })

    it('collapses a removing row even when it names expandedTrackId, and leaves it inert', () => {
      render(
        <TrackList
          files={[trackWithProfile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          expandedTrackId="f1"
          removingIds={new Set(['f1'])}
        />,
      )

      const wrap = document.querySelector('.track-row__detail-wrapper')
      expect(wrap?.className).not.toContain('track-row__detail-wrapper--open')
    })
  })

  /* #269 — clicking a row selects it, whether or not it can also expand:
     "for every row, including a multi-track file's, which has no expanded
     state (#268) and gains a meaning for its click here." */
  describe('#269 selecting a track row', () => {
    it('calls onSelectTrack with the file id when the header is clicked, alongside onToggleExpand', () => {
      const onSelectTrack = vi.fn()
      const onToggleExpand = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
          onSelectTrack={onSelectTrack}
        />,
      )

      fireEvent.click(screen.getByText('trip.kml', { exact: false }))
      expect(onSelectTrack).toHaveBeenCalledWith('f1')
      expect(onToggleExpand).toHaveBeenCalledWith('f1')
    })

    it('also selects from the header row whitespace', () => {
      const onSelectTrack = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onSelectTrack={onSelectTrack}
        />,
      )

      fireEvent.click(document.querySelector('.track-row__main') as HTMLElement)
      expect(onSelectTrack).toHaveBeenCalledWith('f1')
    })

    it('selects a multi-track file on click, even though it cannot expand', () => {
      const onSelectTrack = vi.fn()
      const onToggleExpand = vi.fn()
      render(
        <TrackList
          files={[
            importedFile({
              tracks: [
                { name: 'a', points: [] },
                { name: 'b', points: [] },
              ],
            }),
          ]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onToggleExpand={onToggleExpand}
          onSelectTrack={onSelectTrack}
        />,
      )

      fireEvent.click(screen.getByText('trip.kml', { exact: false }))
      expect(onSelectTrack).toHaveBeenCalledWith('f1')
      expect(onToggleExpand).not.toHaveBeenCalled()
    })

    it('does not select from a click on the handle, swatch, visibility control, or ⋮', () => {
      const onSelectTrack = vi.fn()
      render(
        <TrackList
          files={[importedFile()]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          onSelectTrack={onSelectTrack}
          onRecolor={vi.fn()}
          onReorder={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByLabelText('Reorder trip.kml'))
      fireEvent.click(screen.getByRole('button', { name: 'Change colour for trip.kml' }))
      fireEvent.click(screen.getByRole('button', { name: 'Hide trip.kml' }))
      openRowMenu('trip.kml')

      expect(onSelectTrack).not.toHaveBeenCalled()
    })

    it('marks the row named by selectedTrackId with track-row--selected, and no other row', () => {
      render(
        <TrackList
          files={[importedFile({ id: 'a', name: 'a.kml' }), importedFile({ id: 'b', name: 'b.kml' })]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          selectedTrackId="a"
        />,
      )

      const rowA = screen.getByText('a.kml', { exact: false }).closest('li')!
      const rowB = screen.getByText('b.kml', { exact: false }).closest('li')!
      expect(rowA.className).toContain('track-row--selected')
      expect(rowB.className).not.toContain('track-row--selected')
    })
  })

  describe('#270 hoveredFileId — the map-to-row direction', () => {
    it('marks the row named by hoveredFileId with track-row--hovered, and no other row', () => {
      render(
        <TrackList
          files={[importedFile({ id: 'a', name: 'a.kml' }), importedFile({ id: 'b', name: 'b.kml' })]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={vi.fn()}
          hoveredFileId="b"
        />,
      )

      const rowA = screen.getByText('a.kml', { exact: false }).closest('li')!
      const rowB = screen.getByText('b.kml', { exact: false }).closest('li')!
      expect(rowA.className).not.toContain('track-row--hovered')
      expect(rowB.className).toContain('track-row--hovered')
    })
  })
})
