import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LooseFace } from './LooseFace'
import type { LooseRecord } from '../store/looseStore'

/* #134 — the detail face's image resolves through #53's caching loader,
   mocked here the same way `CairnList.test.tsx` mocks it: at the module
   boundary, not the hook, since `usePhotoImage` (the hook in between) is
   already exhaustively covered by its own test file. */
const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire },
}))

beforeEach(() => {
  acquire.mockReset()
})

function looseCairn(overrides: Partial<Extract<LooseRecord, { kind: 'cairn' }>> = {}): LooseRecord {
  return {
    kind: 'cairn',
    id: 'cairn-1',
    name: 'sapporo.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    date: '2024-11-03T00:00:00.000Z',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    uploadState: 'ok',
    ...overrides,
  }
}

function renderFace(item: LooseRecord, accessToken: string | null = 'token') {
  const onSetIcon = vi.fn().mockResolvedValue(true)
  return {
    ...render(
      <LooseFace
        item={item}
        trips={[]}
        accessToken={accessToken}
        onAddToTrip={vi.fn()}
        onCreateTripWith={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn().mockResolvedValue(true)}
        onRecolor={vi.fn().mockResolvedValue(true)}
        onSetIcon={onSetIcon}
        onExport={vi.fn()}
        disabled={false}
      />,
    ),
    onSetIcon,
  }
}

describe('LooseFace — #134 the cairn image', () => {
  it("shows the image once the caching loader resolves the thumbnail's url", async () => {
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
    const { container } = renderFace(looseCairn())

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'thumb-1'))
    await waitFor(() =>
      expect(container.querySelector('.loose-face__image img')).not.toBeNull(),
    )

    const img = container.querySelector('.loose-face__image img')
    expect(img?.getAttribute('src')).toBe('blob:fake-thumb')
  })

  it('shows only the fallback fill — no broken-image glyph — while loading', () => {
    acquire.mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = renderFace(looseCairn())

    expect(container.querySelector('.loose-face__image img')).toBeNull()
    expect(container.querySelector('.loose-face__image')).not.toBeNull()
  })

  it('shows only the fallback fill when the load fails', async () => {
    acquire.mockRejectedValue(new Error('network error'))
    const { container } = renderFace(looseCairn())

    await waitFor(() => expect(acquire).toHaveBeenCalled())
    expect(container.querySelector('.loose-face__image img')).toBeNull()
  })

  it('shows no image box at all for an icon-only cairn, and never calls acquire', () => {
    const { container } = renderFace(looseCairn({ image: null, icon: 'campsite' }))

    expect(acquire).not.toHaveBeenCalled()
    expect(container.querySelector('.loose-face__image')).toBeNull()
  })

  it('fetches nothing while signed out', () => {
    renderFace(looseCairn(), null)

    expect(acquire).not.toHaveBeenCalled()
  })

  it("does not touch the image loader for a track's face", () => {
    renderFace({
      kind: 'track',
      id: 'track-1',
      name: 'Mount Rosea',
      createdAt: '2026-01-01T00:00:00.000Z',
      date: '2024-03-09T00:00:00.000Z',
      distanceMeters: 14200,
      ascentMeters: 690,
      elevationLossMeters: 620,
      highPointMeters: 2100,
      lowPointMeters: 1500,
      durationSeconds: 19_200,
      elevationProfile: null,
      pointCount: 512,
      sourceName: 'rosea.kml',
      colorIndex: 0,
      position: { lat: -37, lng: 142 },
      driveFileId: null,
      uploadState: 'ok',
    })

    expect(acquire).not.toHaveBeenCalled()
  })
})

/* #169 rendered the current icon read-only and left choosing one to #156.
   The picker replaces that display rather than sitting beside it: the
   selected cell *is* the current icon, so a separate row saying the same
   thing would be a second place for it to be wrong. */
describe('LooseFace — #156 the detail face offers the icon picker', () => {
  it('marks the cairn’s current icon as the selected cell', () => {
    const { getByRole } = renderFace(looseCairn({ icon: 'campsite', image: null }))

    expect(getByRole('button', { name: 'campsite' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'none' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks `none` as selected when the cairn has no icon', () => {
    const { getByRole } = renderFace(looseCairn({ icon: null, image: null }))

    expect(getByRole('button', { name: 'none' }).getAttribute('aria-pressed')).toBe('true')
  })

  /* The retype that matters: a photo becomes a campsite, and the patch that
     goes to the store carries `icon` and nothing else — which is what makes
     the marker stop being a thumbnail without the image going anywhere. */
  it('retypes a photographed cairn, sending only the icon', () => {
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
    const cairn = looseCairn({ icon: null })
    const { getByRole, onSetIcon } = renderFace(cairn)

    fireEvent.click(getByRole('button', { name: 'campsite' }))

    expect(onSetIcon).toHaveBeenCalledWith(cairn.id, 'campsite')
  })

  it('returns a cairn to a thumbnail by choosing none', () => {
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
    const cairn = looseCairn({ icon: 'campsite' })
    const { getByRole, onSetIcon } = renderFace(cairn)

    fireEvent.click(getByRole('button', { name: 'none' }))

    expect(onSetIcon).toHaveBeenCalledWith(cairn.id, null)
  })
})

describe('LooseFace — #158 dragging a cairn', () => {
  it('shows the disconnected sentence while signed out', () => {
    acquire.mockResolvedValue({ url: undefined, release: vi.fn() })
    const { getByText } = render(
      <LooseFace
        item={looseCairn()}
        trips={[]}
        accessToken={null}
        onAddToTrip={vi.fn()}
        onCreateTripWith={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn().mockResolvedValue(true)}
        onRecolor={vi.fn().mockResolvedValue(true)}
        onSetIcon={vi.fn().mockResolvedValue(true)}
        onExport={vi.fn()}
        disabled={true}
      />,
    )

    expect(getByText('Sign in to move cairns.')).toBeDefined()
  })

  it('does not show the disconnected sentence while signed in', () => {
    acquire.mockResolvedValue({ url: undefined, release: vi.fn() })
    const { queryByText } = renderFace(looseCairn())

    expect(queryByText('Sign in to move cairns.')).toBeNull()
  })

  it('shows the move-write failure line', () => {
    acquire.mockResolvedValue({ url: undefined, release: vi.fn() })
    const { getByText } = render(
      <LooseFace
        item={looseCairn()}
        trips={[]}
        accessToken="token"
        onAddToTrip={vi.fn()}
        onCreateTripWith={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn().mockResolvedValue(true)}
        onRecolor={vi.fn().mockResolvedValue(true)}
        onSetIcon={vi.fn().mockResolvedValue(true)}
        onExport={vi.fn()}
        disabled={false}
        moveWriteError="Couldn't move it — put back where it was."
      />,
    )

    expect(getByText("Couldn't move it — put back where it was.")).toBeDefined()
  })
})

/* #196 — loose parity. `shell-and-content-model.md` is explicit that
   adding a cairn to a trip is a move and not a promotion, so the
   description is editable here under the same rules and the same copy as
   on the trip face. The name half is #133's and is untouched. */
describe('LooseFace — #196 editing the description', () => {
  function renderCairn(
    options: { description?: string; onSetDescription?: ReturnType<typeof vi.fn>; disabled?: boolean } = {},
  ) {
    // The suite's `beforeEach` resets `acquire` with no default, and this
    // cairn carries an image — `usePhotoImage` would call `.then` on
    // `undefined` without one.
    acquire.mockResolvedValue({ url: 'blob:fake-thumb', release: vi.fn() })
    const onSetDescription = options.onSetDescription ?? vi.fn().mockResolvedValue(true)
    const view = render(
      <LooseFace
        item={looseCairn({ description: options.description ?? '' })}
        trips={[]}
        accessToken="token"
        onAddToTrip={vi.fn()}
        onCreateTripWith={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn().mockResolvedValue(true)}
        onRecolor={vi.fn().mockResolvedValue(true)}
        onSetIcon={vi.fn().mockResolvedValue(true)}
        onSetDescription={onSetDescription}
        onExport={vi.fn()}
        disabled={options.disabled ?? false}
      />,
    )
    return { ...view, onSetDescription }
  }

  function field(): HTMLElement {
    return document.querySelector('.loose-face__description') as HTMLElement
  }

  function input(): HTMLTextAreaElement {
    return document.querySelector('.loose-face__description-input') as HTMLTextAreaElement
  }

  it('shows the same placeholder as the trip face when empty, rather than nothing', () => {
    renderCairn({ description: '' })

    expect(field().textContent).toBe('Add a description')
  })

  it('opens a textarea on click and commits on Enter', async () => {
    const { onSetDescription } = renderCairn()

    fireEvent.click(field())
    fireEvent.change(input(), { target: { value: 'Sheltered from the wind.' } })
    fireEvent.keyDown(input(), { key: 'Enter' })

    await waitFor(() => expect(onSetDescription).toHaveBeenCalledWith('cairn-1', 'Sheltered from the wind.'))
  })

  it('reverts on Escape without writing', () => {
    const { onSetDescription } = renderCairn({ description: 'Original.' })

    fireEvent.click(field())
    fireEvent.change(input(), { target: { value: 'Discarded.' } })
    fireEvent.keyDown(input(), { key: 'Escape' })

    expect(onSetDescription).not.toHaveBeenCalled()
    expect(field().textContent).toBe('Original.')
  })

  it('saves an empty description, matching the trip face', async () => {
    const { onSetDescription } = renderCairn({ description: 'To be cleared.' })

    fireEvent.click(field())
    fireEvent.change(input(), { target: { value: '' } })
    fireEvent.keyDown(input(), { key: 'Enter' })

    await waitFor(() => expect(onSetDescription).toHaveBeenCalledWith('cairn-1', ''))
  })

  it('shows the same failure copy as the trip face on a failed write', async () => {
    const onSetDescription = vi.fn().mockResolvedValue(false)
    renderCairn({ onSetDescription })

    fireEvent.click(field())
    fireEvent.change(input(), { target: { value: 'Doomed.' } })
    fireEvent.keyDown(input(), { key: 'Enter' })

    await waitFor(() =>
      expect(document.body.textContent).toContain("Couldn't save — description reverted."),
    )
  })

  it('takes the field to Disabled while disconnected, and clicking does not start an edit', () => {
    renderCairn({ description: 'A good spot.', disabled: true })

    fireEvent.click(field())

    expect(input()).toBeNull()
    expect(field().className).not.toContain('loose-face__description--editable')
  })
})
