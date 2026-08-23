import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { CairnRecord } from '../photo/useCairnImport'

/* #55's TripDetail integration — row click opens the lightbox, Escape
   closes it and returns focus, and cairn images resolve only through the
   caching loader (never a bare Drive URL). Separate file from
   TripDetail.test.tsx (#51's mixed-drop partitioning suite) so this one
   can supply real cairn records without disturbing that suite's fixtures. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
  useMap3D: () => null,
  useMapsLibrary: () => null,
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
}))

const { useTripImport } = vi.hoisted(() => ({ useTripImport: vi.fn() }))
vi.mock('../import/useTripImport', () => ({ useTripImport }))

const { useCairnImport } = vi.hoisted(() => ({ useCairnImport: vi.fn() }))
vi.mock('../photo/useCairnImport', () => ({ useCairnImport }))

const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({ photoImageCache: { acquire } }))

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

function baseTripImport(overrides: Record<string, unknown> = {}) {
  return {
    tracks: [],
    missingFiles: [],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    toggleVisibility: vi.fn(),
    removeFile: vi.fn(),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn(),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
    ...overrides,
  }
}

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'p1',
    name: 'sapporo.jpg',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: '2024-06-01T09:14:00Z',
    gpsTimestamp: '2024-06-01T09:14:00Z',
    ...overrides,
  }
}

function baseCairnImport(overrides: Record<string, unknown> = {}) {
  return {
    cairns: [cairnRecord()],
    loading: false,
    // #243: "the Drive read settled successfully", distinct from `!loading`
    // now that a cached trip renders before any read has.
    hydrated: true,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    removeCairn: vi.fn(),
    forgetCairn: vi.fn(),
    removingCairnIds: new Set<string>(),
    cairnRemoveErrors: {},
    ...overrides,
  }
}

function tripFace(
  store: LocalTripStore,
  tripId: string,
  options: {
    onRemovePhotoFromTrip?: (record: CairnRecord) => Promise<boolean>
    onDropTargetChange?: (handler: ((files: File[]) => void) | null) => void
    accessToken?: string | null
  } = {},
) {
  return (
    <MemoryRouter initialEntries={[`/trips/${tripId}`]}>
      <TripDetail
        tripId={tripId}
        tripStore={store}
        accessToken={'accessToken' in options ? (options.accessToken ?? null) : 'token'}
        cairnFolderId="cairn-folder-id"
        onBack={() => {}}
        onDropTargetChange={options.onDropTargetChange ?? (() => {})}
        onGeometryChange={() => {}}
        onNeedsPlacement={() => {}}
        onCreateTargetChange={() => {}}
        onCairnDetailChange={() => {}}
        cairnsDraggable={true}
        onRemovePhotoFromTrip={options.onRemovePhotoFromTrip}
      />
    </MemoryRouter>
  )
}

function renderTrip(
  options: {
    onRemovePhotoFromTrip?: (record: CairnRecord) => Promise<boolean>
    onDropTargetChange?: (handler: ((files: File[]) => void) | null) => void
    accessToken?: string | null
  } = {},
) {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  const view = render(tripFace(store, entry.id, options))
  return { ...view, store, entry }
}

beforeEach(() => {
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  useCairnImport.mockReset().mockReturnValue(baseCairnImport())
  acquire.mockReset().mockResolvedValue({ url: 'blob:fake', release: vi.fn() })
})

/* #193 — a cairn row's exits live behind its `⋮` now, so reaching either
   one is two steps. The lightbox's own `Remove from trip` is a real button
   and is unaffected: menu items carry role `menuitem`, not `button`. */
function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Row actions for ${name}` }))
}

/** #250 — a row with an image expands on click now, rather than opening the
    lightbox directly; the inline preview is what opens it. Every test below
    that wants the lightbox open does both steps through this. */
async function openLightbox(name: string) {
  fireEvent.click(screen.getByText(name))
  fireEvent.click(await screen.findByRole('button', { name: `View ${name} larger` }))
}

describe('TripDetail — #55 photo list and lightbox', () => {
  it('shows the photo section empty state pointing at the import control when the trip has no cairns (criterion 13)', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))

    renderTrip()

    expect(screen.getByText('No cairns yet')).toBeDefined()
    expect(screen.getByText('Drop photos onto this trip to see them here.')).toBeDefined()
  })

  it('expands the row on a first click rather than opening the lightbox, and opens it from the inline preview (#250, revises criterion 7)', async () => {
    renderTrip()

    fireEvent.click(screen.getByText('sapporo.jpg'))
    expect(screen.queryByRole('dialog')).toBeNull()

    const preview = await screen.findByRole('button', { name: 'View sapporo.jpg larger' })
    fireEvent.click(preview)

    expect(screen.getByRole('dialog', { name: 'sapporo.jpg' })).toBeDefined()
  })

  it('closes on Escape and returns focus to the preview that opened it (#250, revises criterion 9)', async () => {
    renderTrip()

    fireEvent.click(screen.getByText('sapporo.jpg'))
    const preview = await screen.findByRole('button', { name: 'View sapporo.jpg larger' })
    preview.focus()
    fireEvent.click(preview)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(preview)
  })

  it('requests photo images through the caching loader, never a bare Drive URL (criterion 12)', async () => {
    renderTrip()

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'thumb-1'))

    fireEvent.click(screen.getByText('sapporo.jpg'))

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'orig-1'))
  })

  it('#294: closing the lightbox after arrow-navigating to an image-less cairn leaves that row expanded', async () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({
        cairns: [
          cairnRecord({ id: 'a', name: 'sapporo.jpg', date: '2024-06-01' }),
          cairnRecord({
            id: 'b',
            name: 'Camp 2',
            icon: 'campsite',
            image: null,
            date: '2024-06-02',
            description: 'Flat bench above the creek.',
          }),
        ],
      }),
    )
    renderTrip()

    fireEvent.click(screen.getByText('sapporo.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'View sapporo.jpg larger' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Camp 2'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Camp 2').closest('button')?.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Flat bench above the creek.')).toBeDefined()
  })

  describe('#169 — the detail face folded into the lightbox', () => {
    it('shows the description and the position-source sentence when a cairn opens', async () => {
      useCairnImport.mockReturnValue(
        baseCairnImport({ cairns: [cairnRecord({ description: 'A good ramen spot.' })] }),
      )

      renderTrip()
      await openLightbox('sapporo.jpg')

      expect(screen.getByText('A good ramen spot.')).toBeDefined()
      expect(screen.getByText(/Position came from the photo’s EXIF GPS/)).toBeDefined()
    })

    it('shows the icon and photo clauses in the meta line', async () => {
      useCairnImport.mockReturnValue(
        baseCairnImport({ cairns: [cairnRecord({ icon: 'campsite' })] }),
      )

      renderTrip()
      await openLightbox('sapporo.jpg')

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/campsite · photo/)).toBeDefined()
    })

    it('Remove from trip in the lightbox calls onRemovePhotoFromTrip and closes it', async () => {
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(true)
      renderTrip({ onRemovePhotoFromTrip })

      await openLightbox('sapporo.jpg')
      await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

      fireEvent.click(screen.getByRole('button', { name: 'Remove from trip' }))

      expect(onRemovePhotoFromTrip).toHaveBeenCalledWith(cairnRecord())
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('an icon-only cairn (no image) opens its lightbox as a detail face with no photo to show, via its expanded summary (#294)', async () => {
      // #157: the lightbox is a cairn's whole detail face now, not only a
      // photo viewer — an icon-only cairn opens one same as any other, so a
      // photo dropped while it's open has somewhere to land. #294: the row
      // click no longer opens the lightbox directly — it expands the row
      // into a summary first, same as a photo cairn expands into its
      // preview, and the summary's own click is what opens the lightbox.
      useCairnImport.mockReturnValue(
        baseCairnImport({ cairns: [cairnRecord({ icon: 'campsite', image: null })] }),
      )

      renderTrip()
      fireEvent.click(screen.getByText('sapporo.jpg'))
      expect(screen.queryByRole('dialog')).toBeNull()

      fireEvent.click(await screen.findByRole('button', { name: 'Open sapporo.jpg' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/campsite/)).toBeDefined()
      expect(within(dialog).queryByRole('img', { name: 'sapporo.jpg' })).toBeNull()
    })

    it('an icon-only cairn expands into its summary rather than opening the lightbox on the first click (#294)', async () => {
      useCairnImport.mockReturnValue(
        baseCairnImport({
          cairns: [cairnRecord({ icon: 'campsite', image: null, description: 'Flat bench above the creek.' })],
        }),
      )

      renderTrip()
      fireEvent.click(screen.getByText('sapporo.jpg'))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(await screen.findByText('Flat bench above the creek.')).toBeDefined()
    })
  })

  describe('#77 removing a photo', () => {
    it('requires the confirm before removing, and calls removeCairn only from it', () => {
      const removeCairn = vi.fn()
      useCairnImport.mockReturnValue(baseCairnImport({ removeCairn }))

      renderTrip()

      openRowMenu('sapporo.jpg')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
      expect(removeCairn).not.toHaveBeenCalled()
      expect(screen.getByText('Remove "sapporo.jpg"?')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(removeCairn).toHaveBeenCalledWith('p1')
    })

    it('closes the lightbox and returns focus when the open photo is removed', async () => {
      const { rerender, store, entry } = renderTrip()

      fireEvent.click(screen.getByText('sapporo.jpg'))
      const preview = await screen.findByRole('button', { name: 'View sapporo.jpg larger' })
      preview.focus()
      fireEvent.click(preview)
      await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

      // Simulates the removal landing while the lightbox is still open
      // (design doc edge case) — the cairn drops out of the settled list.
      useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))
      rerender(tripFace(store, entry.id))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })

  describe('#132 removing a photo from a trip', () => {
    it('calls onRemovePhotoFromTrip with the cairn record and forgets it on success', async () => {
      const forgetCairn = vi.fn()
      useCairnImport.mockReturnValue(baseCairnImport({ forgetCairn }))
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(true)

      renderTrip({ onRemovePhotoFromTrip })

      openRowMenu('sapporo.jpg')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))

      await waitFor(() => expect(onRemovePhotoFromTrip).toHaveBeenCalledWith(cairnRecord()))
      expect(forgetCairn).toHaveBeenCalledWith('p1')
      // No confirm and no delete — reversible by adding it back.
      expect(screen.queryByText('Remove "sapporo.jpg"?')).toBeNull()
    })

    it('shows the move-failed message and keeps the row when the move fails', async () => {
      const forgetCairn = vi.fn()
      useCairnImport.mockReturnValue(baseCairnImport({ forgetCairn }))
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(false)

      renderTrip({ onRemovePhotoFromTrip })

      openRowMenu('sapporo.jpg')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))

      await waitFor(() => expect(screen.getByText("Couldn't move — still on the map.")).toBeDefined())
      expect(forgetCairn).not.toHaveBeenCalled()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
    })

    it('offers no unlink action when the shell has no handler for it', () => {
      renderTrip()

      openRowMenu('sapporo.jpg')
      expect(screen.queryByRole('menuitem', { name: /from trip/ })).toBeNull()
    })
  })
})

describe('TripDetail — #121 caching the cairn count', () => {
  it('caches the count for the picker to read, without a second Drive read', () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a' }), cairnRecord({ id: 'b' })] }),
    )
    const { store, entry } = renderTrip()

    // Backfilled by the trip simply being opened — no migration pass, and
    // `useCairnImport` was listing `trips/<id>/cairns/` on mount anyway.
    expect(store.getTrips().find((t) => t.id === entry.id)?.cairnCount).toBe(2)
  })

  it('records a genuine zero once the index has been read', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.cairnCount).toBe(0)
  })

  /* Before the read-back lands, `cairns` is the empty array the hook was
     initialised with. Writing `0` from that would clobber a real count with
     a wrong one on every open, which is the same lie in a new place. */
  it('writes nothing while the cairn list is still loading', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [], loading: true, hydrated: false }))
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.cairnCount).toBeNull()
  })

  /* #243 splits the two halves of the old `loading`. A trip rendering from
     cache is not loading and its count is still not known — Drive has not
     answered, and a count written from a cache that is one deletion out of
     date is #121's bug wearing a new hat. */
  it('writes nothing from cached cairns alone, before the Drive read settles', () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({
        cairns: [cairnRecord({ id: 'a' }), cairnRecord({ id: 'b' })],
        loading: false,
        hydrated: false,
      }),
    )
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.cairnCount).toBeNull()
  })

  it('writes nothing after a failed Drive read, cached cairns still on screen', () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a' })], loading: false, hydrated: false }),
    )
    const { store, entry, rerender } = renderTrip()
    expect(store.getTrip(entry.id)?.cairnCount).toBeNull()

    // The read settles — successfully this time — and the count lands.
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a' })], loading: false, hydrated: true }),
    )
    rerender(tripFace(store, entry.id))

    expect(store.getTrip(entry.id)?.cairnCount).toBe(1)
  })

  it('follows the count down when a cairn is removed', () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a' }), cairnRecord({ id: 'b' })] }),
    )
    const { store, entry, rerender } = renderTrip()
    expect(store.getTrip(entry.id)?.cairnCount).toBe(2)

    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [cairnRecord({ id: 'a' })] }))
    rerender(tripFace(store, entry.id))

    expect(store.getTrip(entry.id)?.cairnCount).toBe(1)
  })
})

describe('TripDetail — attaching a photo while a cairn is open (#157)', () => {
  function capture() {
    let handler: ((files: File[]) => void) | null = null
    return {
      onDropTargetChange: (h: ((files: File[]) => void) | null) => {
        handler = h
      },
      drop: (files: File[]) => handler?.(files),
    }
  }

  it('routes a drop to attachImage rather than importFiles while a cairn is open, and refuses the rest', async () => {
    const attachImage = vi.fn().mockResolvedValue({ ok: true })
    const importFiles = vi.fn().mockResolvedValue(undefined)
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a', image: null, icon: 'campsite' })], attachImage, importFiles }),
    )
    const { onDropTargetChange, drop } = capture()
    renderTrip({ onDropTargetChange })

    // #294: the row click expands into the summary now, image or not — the
    // summary's own click is what opens the lightbox.
    fireEvent.click(screen.getByText('sapporo.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open sapporo.jpg' }))
    await screen.findByRole('dialog')

    await act(async () => {
      drop([new File(['a'], 'first.jpg'), new File(['b'], 'second.jpg')])
    })

    expect(attachImage).toHaveBeenCalledWith('a', expect.objectContaining({ name: 'first.jpg' }))
    expect(importFiles).not.toHaveBeenCalled()
    expect(await screen.findByText(/second\.jpg/)).toBeDefined()
    expect(screen.getByText(/only one photo per cairn/)).toBeDefined()
  })

  it('still imports as new cairns when the drop lands with no cairn open', async () => {
    const attachImage = vi.fn().mockResolvedValue({ ok: true })
    const importFiles = vi.fn().mockResolvedValue({ resolvedCount: 0, needsPlacement: [] })
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [cairnRecord({ id: 'a' })], attachImage, importFiles }))
    const { onDropTargetChange, drop } = capture()
    renderTrip({ onDropTargetChange })

    await act(async () => {
      drop([new File(['a'], 'new.jpg')])
    })

    expect(importFiles).toHaveBeenCalled()
    expect(attachImage).not.toHaveBeenCalled()
  })

  it('reports "Sign in to keep photos." rather than the generic drop message while a cairn is open and disconnected', async () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a', image: null, icon: 'campsite' })] }),
    )
    const { onDropTargetChange, drop } = capture()
    renderTrip({ onDropTargetChange, accessToken: null })

    // #294: the row click expands into the summary now, image or not — the
    // summary's own click is what opens the lightbox.
    fireEvent.click(screen.getByText('sapporo.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open sapporo.jpg' }))
    await screen.findByRole('dialog')

    await act(async () => {
      drop([new File(['a'], 'first.jpg')])
    })

    expect(await screen.findByText('Sign in to keep photos.')).toBeDefined()
  })
})
