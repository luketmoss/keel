import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackList } from './TrackList'
import type { ImportedFile } from '../import/types'

function importedFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  const tracks = overrides.tracks ?? [{ name: 'Track', points: [] }]
  return {
    id: 'f1',
    name: 'trip.kml',
    driveFileId: 'drive-f1',
    colorIndex: 0,
    visible: true,
    tracks,
    trackStats: tracks.map(() => ({
      distanceMeters: 0,
      durationSeconds: undefined,
      elevationGainMeters: undefined,
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
    render(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('No tracks yet')).toBeDefined()
    expect(screen.getByText(/Import tracks/)).toBeDefined()
  })

  it('renders one row per imported file', () => {
    render(
      <TrackList
        files={[importedFile({ id: 'a' }), importedFile({ id: 'b', name: 'other.kmz' })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
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
              { distanceMeters: 8.1 * 1609.344, durationSeconds: 47 * 60, elevationGainMeters: 0 },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
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
              { distanceMeters: 1000, durationSeconds: 60, elevationGainMeters: 10 },
              { distanceMeters: 2000, durationSeconds: 120, elevationGainMeters: 20 },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
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
            trackStats: [{ distanceMeters: 1609.344, durationSeconds: 60, elevationGainMeters: 5 }],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
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
      />,
    )

    expect(screen.getByRole('button', { name: 'Show trip.kml' })).toBeDefined()
  })

  it('removes a file via a named action in the row menu', () => {
    const onRemove = vi.fn()
    render(
      <TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={onRemove} />,
    )

    openRowMenu('trip.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
    expect(onRemove).toHaveBeenCalledWith('f1')
  })

  it('returns to the empty state after the last file is removed', () => {
    const { rerender } = render(
      <TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(screen.queryByText('No tracks yet')).toBeNull()

    rerender(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('No tracks yet')).toBeDefined()
  })

  it('reports the hovered file id on mouse enter and null on mouse leave (#49)', () => {
    const onHoverFile = vi.fn()
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
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
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    const row = screen.getByText('trip.kml', { exact: false }).closest('li')!
    expect(() => fireEvent.mouseEnter(row)).not.toThrow()
  })

  it('does not render a drag handle, editable name, or colour button when their handlers are omitted (#46)', () => {
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.queryByLabelText('Reorder trip.kml')).toBeNull()
    expect(screen.queryByLabelText('Change colour for trip.kml')).toBeNull()
    expect(screen.getByText('trip.kml', { exact: false })).not.toHaveProperty(
      'onclick',
      expect.anything(),
    )
  })

  it('renames a track via click-to-edit and calls onRename with the trimmed value (#46)', () => {
    const onRename = vi.fn().mockResolvedValue(true)
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
        onRename={onRename}
      />,
    )

    fireEvent.click(screen.getByText('trip.kml', { exact: false }))
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
        onRename={onRename}
      />,
    )

    fireEvent.click(screen.getByText('trip.kml', { exact: false }))
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
        onRename={onRename}
      />,
    )

    fireEvent.click(screen.getByText('trip.kml', { exact: false }))
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
        onRename={onRename}
      />,
    )

    fireEvent.click(screen.getByText('trip.kml', { exact: false }))
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
    render(
      <TrackList
        files={[importedFile()]}
        onToggleVisibility={onToggleVisibility}
        onRemove={onRemove}
        onRename={onRename}
        onRecolor={onRecolor}
        onReorder={onReorder}
        disabled
      />,
    )

    // Rename doesn't even start editing.
    fireEvent.click(screen.getByText('trip.kml', { exact: false }))
    expect(screen.queryByDisplayValue('trip.kml')).toBeNull()
    expect(onRename).not.toHaveBeenCalled()

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
    expect(onRemove).toHaveBeenCalledWith('f1')
  })

  describe('#110 remove from trip, beside delete', () => {
    it('offers no unlink action when the list is not inside a trip', () => {
      render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

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
                { distanceMeters: 14200, durationSeconds: undefined, elevationGainMeters: 690 },
              ],
            }),
          ]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
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
          onRemoveFromTrip={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Hide trip.kml' }))
      expect(onToggleVisibility).toHaveBeenCalledWith('f1')
    })
  })
})
