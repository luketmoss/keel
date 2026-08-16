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

  it('does not render a drag handle or colour button when their handlers are omitted (#46)', () => {
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.queryByLabelText('Reorder trip.kml')).toBeNull()
    expect(screen.queryByLabelText('Change colour for trip.kml')).toBeNull()
  })

  it('offers no Rename action when onRename is omitted (#219)', () => {
    render(<TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

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
        <TrackList files={[importedFile({ visible: true })]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      expectTooltipMatchesLabel(screen.getByRole('button', { name: 'Hide trip.kml' }), 'Hide trip.kml')

      rerender(
        <TrackList files={[importedFile({ visible: false })]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      expectTooltipMatchesLabel(screen.getByRole('button', { name: 'Show trip.kml' }), 'Show trip.kml')
    })
  })

  /* #219 — the row click opens a detail beneath it, holding the five #218
     stats plus duration and an elevation profile. */
  describe('#219 opened track detail', () => {
    function elevatedTrack(): { tracks: ImportedFile['tracks']; trackStats: ImportedFile['trackStats'] } {
      const elevations = [1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000]
      return {
        tracks: [
          {
            name: 'Track',
            points: elevations.map((elevation, i) => ({ lat: 37 + i * 0.001, lon: -122, elevation })),
          },
        ],
        trackStats: [
          {
            distanceMeters: 10_300,
            durationSeconds: 19_200,
            elevationGainMeters: 50,
            elevationLossMeters: 50,
            highPointMeters: 1050,
            lowPointMeters: 1000,
          },
        ],
      }
    }

    it('opens a detail showing distance, ascent, descent, high point, low point and duration on a row click', () => {
      render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      const nameButton = screen.getByRole('button', { name: 'trip.kml' })
      fireEvent.click(nameButton)

      // The detail's markup is always in the DOM (per the design note: not
      // `display: none` when closed, so it never leaves the tab order
      // mid-animation) — the wrapper's open class is the real signal that
      // this click expanded it rather than the content merely existing.
      expect(nameButton).toHaveProperty('ariaExpanded', 'true')
      expect(document.querySelector('.track-row__detail-wrapper--open')).not.toBeNull()
      expect(screen.getByText('Distance')).toBeDefined()
      expect(screen.getByText('Ascent')).toBeDefined()
      expect(screen.getByText('Descent')).toBeDefined()
      expect(screen.getByText('High point')).toBeDefined()
      expect(screen.getByText('Low point')).toBeDefined()
      expect(screen.getByText('Duration')).toBeDefined()
    })

    it('closes on a second click of the same row', () => {
      render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      const nameButton = screen.getByRole('button', { name: 'trip.kml' })
      fireEvent.click(nameButton)
      expect(nameButton).toHaveProperty('ariaExpanded', 'true')

      fireEvent.click(nameButton)
      expect(nameButton).toHaveProperty('ariaExpanded', 'false')
    })

    it('opening one track closes another that was open', () => {
      render(
        <TrackList
          files={[
            importedFile({ id: 'a', name: 'a.kml', ...elevatedTrack() }),
            importedFile({ id: 'b', name: 'b.kml', ...elevatedTrack() }),
          ]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'a.kml' }))
      expect(screen.getByRole('button', { name: 'a.kml' })).toHaveProperty('ariaExpanded', 'true')

      fireEvent.click(screen.getByRole('button', { name: 'b.kml' }))
      expect(screen.getByRole('button', { name: 'a.kml' })).toHaveProperty('ariaExpanded', 'false')
      expect(screen.getByRole('button', { name: 'b.kml' })).toHaveProperty('ariaExpanded', 'true')
    })

    it('does not open, and shows no affordance, for a multi-track file', () => {
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
        />,
      )

      expect(screen.queryByRole('button', { name: 'trip.kml' })).toBeNull()
      expect(screen.queryByText('Distance')).toBeNull()
    })

    it('opens on a click of the meta line, not only the name', () => {
      render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      const statsLine = document.querySelector('.track-row__stats') as HTMLElement
      fireEvent.click(statsLine)

      expect(screen.getByRole('button', { name: 'trip.kml' })).toHaveProperty('ariaExpanded', 'true')
    })

    it('does not open or close from the swatch, the eye, the handle, or the ⋮', () => {
      render(
        <TrackList
          files={[importedFile(elevatedTrack())]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onRecolor={vi.fn().mockResolvedValue(true)}
          onReorder={vi.fn().mockResolvedValue(true)}
          onRemoveFromTrip={vi.fn()}
        />,
      )

      const nameButton = screen.getByRole('button', { name: 'trip.kml' })

      fireEvent.click(screen.getByRole('button', { name: 'Change colour for trip.kml' }))
      expect(nameButton).toHaveProperty('ariaExpanded', 'false')

      fireEvent.click(screen.getByRole('button', { name: 'Hide trip.kml' }))
      expect(nameButton).toHaveProperty('ariaExpanded', 'false')

      fireEvent.click(screen.getByLabelText('Reorder trip.kml'))
      expect(nameButton).toHaveProperty('ariaExpanded', 'false')

      fireEvent.click(screen.getByRole('button', { name: 'Row actions for trip.kml' }))
      expect(nameButton).toHaveProperty('ariaExpanded', 'false')
    })

    it('clicking the name opens the detail rather than starting a rename', () => {
      const onRename = vi.fn()
      render(
        <TrackList
          files={[importedFile(elevatedTrack())]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onRename={onRename}
        />,
      )

      const nameButton = screen.getByRole('button', { name: 'trip.kml' })
      fireEvent.click(nameButton)

      expect(onRename).not.toHaveBeenCalled()
      expect(screen.queryByDisplayValue('trip.kml')).toBeNull()
      expect(nameButton).toHaveProperty('ariaExpanded', 'true')
    })

    it('shows the grid with em dashes and no profile when elevation is unavailable', () => {
      render(
        <TrackList
          files={[
            importedFile({
              trackStats: [
                {
                  distanceMeters: 1000,
                  durationSeconds: 60,
                  elevationGainMeters: undefined,
                  elevationLossMeters: undefined,
                  highPointMeters: undefined,
                  lowPointMeters: undefined,
                },
              ],
            }),
          ]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))

      expect(screen.getByText('High point')).toBeDefined()
      expect(document.querySelector('.track-elevation-profile')).toBeNull()
      expect(document.querySelectorAll('.stat__value--muted').length).toBe(4)
    })

    it('draws a profile, in the track colour, with an aria-label naming the endpoints and distance', () => {
      render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))

      const profile = screen.getByRole('img', {
        name: 'Elevation profile: 3,281 ft to 3,445 ft over 6.4 mi',
      })
      expect(profile).toBeDefined()
      const line = profile.querySelector('.track-elevation-profile__line') as SVGPathElement
      expect(line.style.stroke).toBe('#FF3B30') // colorIndex 0
    })

    it('restyles the profile immediately when the row colour changes', () => {
      const { rerender } = render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))
      rerender(
        <TrackList
          files={[importedFile({ ...elevatedTrack(), colorIndex: 1 })]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
        />,
      )

      const line = document.querySelector('.track-elevation-profile__line') as SVGPathElement
      expect(line.style.stroke).toBe('#00D4FF') // colorIndex 1
      expect(screen.getByRole('button', { name: 'trip.kml' })).toHaveProperty('ariaExpanded', 'true')
    })

    it('keeps the detail open across a visibility toggle on its own row', () => {
      const { rerender } = render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))
      rerender(
        <TrackList
          files={[importedFile({ ...elevatedTrack(), visible: false })]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
        />,
      )

      expect(screen.getByRole('button', { name: 'trip.kml' })).toHaveProperty('ariaExpanded', 'true')
    })

    it('keeps the detail open across a rename commit on its own row', async () => {
      const onRename = vi.fn().mockResolvedValue(true)
      render(
        <TrackList
          files={[importedFile(elevatedTrack())]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onRename={onRename}
        />,
      )

      const nameButton = screen.getByRole('button', { name: 'trip.kml' })
      fireEvent.click(nameButton)
      expect(nameButton).toHaveProperty('ariaExpanded', 'true')

      openRowMenu('trip.kml')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      const input = screen.getByDisplayValue('trip.kml')
      fireEvent.change(input, { target: { value: 'Ridge day' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onRename).toHaveBeenCalledWith('f1', 'Ridge day')
      expect(screen.getByRole('button', { name: 'trip.kml' })).toHaveProperty('ariaExpanded', 'true')
    })

    it('closes without error when the open track is removed from the list', () => {
      const { rerender } = render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))
      expect(() => rerender(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)).not.toThrow()
    })

    it('collapses the detail when the open row starts dragging', () => {
      render(
        <TrackList
          files={[importedFile(elevatedTrack())]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onReorder={vi.fn().mockResolvedValue(true)}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))
      fireEvent.dragStart(screen.getByLabelText('Reorder trip.kml'))

      expect(screen.getByRole('button', { name: 'trip.kml' })).toHaveProperty('ariaExpanded', 'false')
    })

    it('closes the detail when the row starts confirming removal', () => {
      const onStartConfirm = vi.fn()
      render(
        <TrackList
          files={[importedFile(elevatedTrack())]}
          onToggleVisibility={vi.fn()}
          onRemove={vi.fn()}
          onStartConfirm={onStartConfirm}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'trip.kml' }))
      openRowMenu('trip.kml')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))

      expect(onStartConfirm).toHaveBeenCalledWith('f1')
      expect(screen.getByRole('button', { name: 'trip.kml' })).toHaveProperty('ariaExpanded', 'false')
    })

    it('carries aria-expanded and aria-controls pointing at the detail', () => {
      render(
        <TrackList files={[importedFile(elevatedTrack())]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
      )

      const nameButton = screen.getByRole('button', { name: 'trip.kml' })
      const controlsId = nameButton.getAttribute('aria-controls')
      expect(controlsId).toBeTruthy()
      expect(document.getElementById(controlsId!)).not.toBeNull()
    })
  })
})
