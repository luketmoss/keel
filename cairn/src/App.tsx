import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react'
import { BrowserRouter, Navigate, Route, Routes, useMatch, useNavigate } from 'react-router-dom'
import { MapCanvas, MapProvider } from './components/MapCanvas'
import { ShellColumn } from './components/ShellColumn'
import { SearchCard } from './components/SearchCard'
import { FilterChips, type KindFilter } from './components/FilterChips'
import { TripsPanel } from './components/TripsPanel'
import { TripDetail } from './components/TripDetail'
import { LooseFace } from './components/LooseFace'
import { LooseLayer } from './components/LooseLayer'
import { MapEmptyOverlay, WorldLayer, placesForTrips, visibleTripsFor } from './components/WorldMap'
import { DraftPanel } from './components/DraftPanel'
import { DropOverlay } from './components/DropOverlay'
import { ToastStack, type ToastMessage } from './components/ToastStack'
import { DriveTripStore } from './store/driveTripStore'
import { LocalLooseStore, moveLooseIntoTrip, type LooseRecord } from './store/looseStore'
import type { TripIndexEntry } from './store/tripStore'
import { DEFAULT_TRIP_FILTERS, tripDayIndex, type TripFilters } from './store/tripFilters'
import { dataTransferHasFiles, filesFromDataTransfer } from './import/dataTransfer'
import { isPhotoFile } from './import/fileKinds'
import { useLooseImport } from './import/useLooseImport'
import { useDraftTrip } from './import/useDraftTrip'
import { useGoogleAccount } from './auth/useGoogleAccount'
import { AccountBubble } from './auth/AccountBubble'
import { defaultOverridesStore } from './import/useTripImport'
import './App.css'

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* v1's ephemeral scratch map, retired by #78 now that the map is
            the homepage. Both old addresses land on the new one. */}
        <Route path="/map" element={<Navigate to="/" replace />} />
        <Route path="/world" element={<Navigate to="/" replace />} />
        <Route path="/trips" element={<Navigate to="/" replace />} />
        {/* One shell, with `/trips/:id` nested inside it rather than beside
            it. Two sibling routes rendering the same element type do happen
            to reconcile into one instance today, but that is React
            reconciling by position, not a guarantee anyone declared —
            adding a third route or a key would silently end it, and what
            gets lost is the map. Nesting says it outright: one mounted
            shell, and the path only decides which face the panel shows.
            The child renders nothing; `AppShell` reads the id with
            `useMatch`. */}
        <Route path="/" element={<AppShell />}>
          <Route path="trips/:id" element={null} />
          <Route path="tracks/:id" element={null} />
          <Route path="photos/:id" element={null} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/** What the search card's centre slot shows on a detail: the item's name,
    and beneath it what kind of thing it is. A loose item says so — "not in
    a trip" is the distinction the whole model turns on. */
function detailForCard(
  trip: TripIndexEntry | undefined,
  loose: LooseRecord | null,
): { name: string; kind: string } | null {
  if (trip) return { name: trip.name, kind: 'trip' }
  if (loose) {
    return {
      name: loose.name,
      kind: loose.kind === 'track' ? 'track · not in a trip' : 'photo · not in a trip',
    }
  }
  return null
}

let nextToastId = 0
function generateToastId(): string {
  nextToastId += 1
  return `toast-${nextToastId}`
}

/** The whole app: one map that is never unmounted, one column over it.

    Everything that used to be lifted above a route split — filters, the
    hovered trip, the open draft — is ordinary state here, because there is
    no longer a route split to survive. The map's camera survives navigation
    for the same reason, which is why #79's module-level snapshot and #80's
    scroll snapshot are both gone. */
function AppShell() {
  const openTripId = useMatch('/trips/:id')?.params.id
  const openTrackId = useMatch('/tracks/:id')?.params.id
  const openPhotoId = useMatch('/photos/:id')?.params.id
  const openLooseId = openTrackId ?? openPhotoId
  const navigate = useNavigate()
  const account = useGoogleAccount()
  /* The one module allowed to import DriveTripStore directly — everything
     else depends on the TripStore interface. */
  const tripStore = useMemo(() => new DriveTripStore(), [])
  const trips = useSyncExternalStore(tripStore.subscribe, tripStore.getTrips)
  /* The tracks and photos no trip owns. A separate store rather than a
     `tripId` on each record: ownership is *where the file lives*, so an
     owned item is not in this store at all. */
  const looseStore = useMemo(() => new LocalLooseStore(), [])
  const looseItems = useSyncExternalStore(looseStore.subscribe, looseStore.getItems)
  const looseImport = useLooseImport(looseStore)

  const [filters, setFilters] = useState<TripFilters>(DEFAULT_TRIP_FILTERS)
  const [kind, setKind] = useState<KindFilter>('all')
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  /* Registered by the trip face while one is open, so a drop anywhere still
     imports into that trip rather than starting a draft. Refs, not state:
     the import hooks return a fresh object on every render, so storing what
     they hand up in state would re-render this component from an effect
     that then re-runs — a loop. Nothing here is read during render. */
  const tripDropRef = useRef<((files: File[]) => void) | null>(null)
  const tripGeometryRef = useRef<{ lat: number; lng: number }[]>([])
  const [tripPointCount, setTripPointCount] = useState(0)

  const accessToken = account.state.status === 'signed-in' ? account.state.accessToken : null
  const cairnFolderId = account.state.status === 'signed-in' ? account.state.folderId : null
  // #73: "disconnected" covers every state that leaves `accessToken` null —
  // never signed in this session, signed out, or #72's token-expired — and
  // all three get the same read-only treatment.
  const disconnected = accessToken === null

  const draftTrip = useDraftTrip(tripStore, accessToken, cairnFolderId)

  // Hydrates every trip's index/overview from Drive and migrates any
  // local-only trip up, per #59's design note.
  useEffect(() => {
    if (!accessToken || !cairnFolderId) return
    void tripStore.connect(accessToken, cairnFolderId)
  }, [tripStore, accessToken, cairnFolderId])

  // #73: the mirror image of the effect above — every store holding Drive
  // credentials drops them the moment the account has no usable token.
  useEffect(() => {
    if (!disconnected) return
    tripStore.disconnect?.()
    defaultOverridesStore.disconnect?.()
  }, [tripStore, disconnected])

  // #95: disconnected is read-only *and* invisible now, not just read-only —
  // the cache underneath is never touched, only what's rendered.
  const visibleTrips = disconnected ? [] : trips

  // The span every trip falls inside. Computed here rather than in the list
  // face so the range filter stays coherent while a trip face is showing
  // and the list is not mounted.
  const dateSpan = useMemo(() => {
    if (visibleTrips.length === 0) return null
    const days = visibleTrips.map((trip) => tripDayIndex(trip))
    return { min: Math.min(...days), max: Math.max(...days) }
  }, [visibleTrips])

  // The range resets to the full span whenever the span itself changes shape
  // (a trip gaining or losing a date) rather than on every render, and
  // refills whenever something clears `filters.range` to `null` — "Clear
  // filters" does exactly that.
  const spanKey = dateSpan ? `${dateSpan.min}-${dateSpan.max}` : ''
  const previousSpanKey = useRef<string | null>(null)
  useEffect(() => {
    const spanChanged = previousSpanKey.current !== spanKey
    if (!spanChanged && filters.range !== null) return
    previousSpanKey.current = spanKey
    setFilters((current) => ({
      ...current,
      range: dateSpan ? [dateSpan.min, dateSpan.max] : null,
    }))
  }, [spanKey, dateSpan, filters.range])

  // #95 again: loose items are withheld while disconnected for the same
  // reason trips are — the cache underneath is untouched.
  const visibleLoose = disconnected ? [] : looseItems
  // Read from the *visible* set, not the raw one: #95's rule is that a
  // disconnected account shows nothing rather than a cache, and a typed URL
  // must not be the one way around that.
  const openLoose = openLooseId
    ? (visibleLoose.find((item) => item.id === openLooseId) ?? null)
    : null

  const openTrip = openTripId ? trips.find((trip) => trip.id === openTripId) : undefined
  const draftOpen = Boolean(draftTrip.draft)
  const detailOpen = Boolean(openTripId) || Boolean(openLooseId)

  /** What the picker shows beside each trip. Counts come from the index the
      list already reads rather than opening every trip's folder to count
      its files — a picker that costs one Drive round trip per trip would
      take longer to open than the move it starts. */
  const tripChoices = useMemo(
    () =>
      visibleTrips.map((entry) => ({
        entry,
        trackCount: tripStore.getOverview(entry.id)?.features.length ?? 0,
        // #121: cached on the index when the trip's photo index was last
        // read, and `null` until something has read it. The picker shows
        // no photo count in that case rather than a zero it cannot stand
        // behind.
        photoCount: entry.photoCount,
      })),
    [visibleTrips, tripStore],
  )

  /** Moves a loose item into a trip and opens that trip, so the result is
      visible rather than asserted. The record only leaves the loose store
      once the move has settled — a half-moved item that belongs to nothing
      is worse than a move that visibly did not happen. */
  function moveLooseToTrip(itemId: string, tripId: string) {
    setMoveError(null)
    if (!moveLooseIntoTrip(looseStore, tripStore, itemId, tripId)) {
      setMoveError("Couldn't move — still on the map.")
      return
    }
    // Landing on the destination is the confirmation — no toast.
    navigate(`/trips/${tripId}`)
  }

  function createTripWithLoose(itemId: string, name: string) {
    // Created with `planned` status and no dates, and the item moves into
    // it in one step — creating an empty trip is not a state the user
    // passes through.
    const entry = tripStore.createTrip(name)
    moveLooseToTrip(itemId, entry.id)
  }

  function addToasts(rejections: { name: string; message: string }[]) {
    if (rejections.length === 0) return
    setToasts((prev) => [
      ...prev,
      ...rejections.map((r) => ({ id: generateToastId(), text: r.message })),
    ])
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth.current += 1
    // #75: the overlay is the app's promise that a drop will be handled —
    // inside a trip while signed out it does not appear at all.
    if (!detailOpen || !disconnected) setDragActive(true)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const files = filesFromDataTransfer(event.dataTransfer)
    if (files.length === 0) return
    // A trip is open: the drop belongs to it, exactly as it did when the
    // trip owned the whole page.
    if (tripDropRef.current) {
      tripDropRef.current(files)
      return
    }
    // Outside any trip: tracks still open #81's draft, because a drop the
    // user wants to become a trip is exactly what that flow is for. What
    // changed is that *not* becoming one is now a valid outcome — the
    // draft's `Keep loose` takes that exit. Photos have no draft to open,
    // so they import loose directly.
    const photos = files.filter((file) => isPhotoFile(file.name))
    const rest = files.filter((file) => !isPhotoFile(file.name))
    if (photos.length > 0) void looseImport.importFiles(photos).then(addToasts)
    if (rest.length > 0) void draftTrip.addFiles(rest).then(addToasts)
  }

  /** The draft's third exit: keep the files, don't make a trip of them. */
  function keepDraftLoose() {
    const draft = draftTrip.draft
    if (!draft) return
    for (const file of draft.files) {
      looseImport.addParsedTracks(file.name, file.tracks)
    }
    draftTrip.cancel()
  }

  const handleDropTargetChange = useCallback((handler: ((files: File[]) => void) | null) => {
    tripDropRef.current = handler
  }, [])

  const handleGeometryChange = useCallback((points: { lat: number; lng: number }[]) => {
    tripGeometryRef.current = points
    // Only the count reaches state, and only when it actually changes —
    // enough to enable or disable "fit to everything", and React bails out
    // of an identical value, so a caller that re-reports the same geometry
    // every render cannot spin.
    setTripPointCount((previous) => (previous === points.length ? previous : points.length))
  }, [])

  const listPlaces = useMemo(
    () => placesForTrips(visibleTripsFor(visibleTrips, filters)),
    [visibleTrips, filters],
  )
  const allPlaces = useMemo(() => placesForTrips(visibleTrips), [visibleTrips])

  const noPlaces = allPlaces.length === 0
  const filteredEmpty = !noPlaces && listPlaces.length === 0

  return (
    <MapProvider>
      <div
        className="shell"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <MapCanvas
          panelCollapsed={collapsed}
          canFit={detailOpen ? tripPointCount > 0 : listPlaces.length > 0}
          getFitPoints={() => (detailOpen ? tripGeometryRef.current : listPlaces)}
        />
        {/* The world's markers are hidden while a trip is open — its own
            tracks and photos are what the map shows then. A loose detail
            keeps them: the item is still one of the things on this map, and
            hiding everything around it would lose the context that makes
            its position mean anything. */}
        {!openTripId && (
          <>
            {(kind === 'all' || kind === 'trips') && (
              <WorldLayer
                trips={visibleTrips}
                filters={filters}
                hoveredTripId={hoveredTripId}
                onHoverTrip={setHoveredTripId}
                onSelectTrip={(tripId) => navigate(`/trips/${tripId}`)}
                draftTracks={draftTrip.draft?.files.flatMap((file) => file.tracks)}
              />
            )}
            <LooseLayer
              items={visibleLoose.filter(
                (item) =>
                  kind === 'all' ||
                  (kind === 'tracks' && item.kind === 'track') ||
                  (kind === 'photos' && item.kind === 'photo'),
              )}
              store={looseStore}
              hoveredId={hoveredTripId}
              onHover={setHoveredTripId}
              selectedId={openLooseId ?? null}
              onSelect={(item) =>
                navigate(item.kind === 'track' ? `/tracks/${item.id}` : `/photos/${item.id}`)
              }
            />
          </>
        )}
        {!detailOpen &&
          !draftOpen &&
          (noPlaces ? (
            disconnected ? (
              <MapEmptyOverlay heading="Sign in to see your map." />
            ) : (
              <MapEmptyOverlay
                heading="Nothing here yet"
                detail="Drop a KML or a photo anywhere to start."
              />
            )
          ) : (
            filteredEmpty && (
              <MapEmptyOverlay
                heading="Nothing in this range"
                detail="Widen the filters to see your trips."
              />
            )
          ))}

        <ShellColumn
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((wasCollapsed) => !wasCollapsed)}
          collapsible={!detailOpen && !draftOpen}
          searchCard={
            <SearchCard
              detail={detailForCard(openTrip, openLoose)}
              onBack={() => navigate('/')}
              query={filters.name}
              onQueryChange={(name) => setFilters((current) => ({ ...current, name }))}
              accountBubble={<AccountBubble account={account} />}
            />
          }
          chips={
            // Hidden on a detail — filtering a list you are no longer
            // looking at is noise — and while a draft is open, for the
            // reason #81 already gives.
            detailOpen || draftOpen ? null : (
              <FilterChips kind={kind} onChange={setKind} />
            )
          }
        >
          {draftTrip.draft ? (
            <DraftPanel
              draft={draftTrip.draft}
              updateName={draftTrip.updateName}
              updateStatus={draftTrip.updateStatus}
              updateDates={draftTrip.updateDates}
              updateNotes={draftTrip.updateNotes}
              onSave={() => void draftTrip.save()}
              onCancel={draftTrip.cancel}
              onKeepLoose={keepDraftLoose}
              signedIn={!disconnected}
              onSignIn={() => void account.signIn()}
            />
          ) : openTripId ? (
            <TripDetail
              key={openTripId}
              tripId={openTripId}
              tripStore={tripStore}
              accessToken={accessToken}
              cairnFolderId={cairnFolderId}
              onBack={() => navigate('/')}
              onReconnect={() => void account.reconnect()}
              onDropTargetChange={handleDropTargetChange}
              onGeometryChange={handleGeometryChange}
              onRemoveFromTrip={(file) => {
                // Back to the top level, with everything about it intact.
                // Reversible by adding it back, which is why it needs no
                // confirm — `Delete permanently` is the neighbouring one.
                looseImport.addParsedTracks(file.name, file.tracks)
                setToasts((prev) => [
                  ...prev,
                  { id: generateToastId(), text: 'Moved back to the map.' },
                ])
              }}
            />
          ) : openLooseId ? (
            openLoose ? (
              <LooseFace
                key={openLooseId}
                item={openLoose}
                trips={tripChoices}
                disabled={disconnected}
                error={moveError}
                onAddToTrip={(tripId) => moveLooseToTrip(openLooseId, tripId)}
                onCreateTripWith={(name) => createTripWithLoose(openLooseId, name)}
                onDelete={() => {
                  looseStore.remove(openLooseId)
                  navigate('/')
                }}
              />
            ) : (
              <div className="trips-panel__empty">
                <p className="trips-panel__empty-title">Not found</p>
                <p className="trips-panel__empty-detail">It may have been deleted.</p>
              </div>
            )
          ) : (
            <TripsPanel
              trips={visibleTrips}
              looseItems={visibleLoose}
              kind={kind}
              filters={filters}
              onFiltersChange={setFilters}
              dateSpan={dateSpan}
              hoveredId={hoveredTripId}
              onHover={setHoveredTripId}
              onCreate={(name) => tripStore.createTrip(name)}
              onDelete={(tripId) => tripStore.deleteTrip(tripId)}
              onSetStatus={(tripId, status: TripIndexEntry['status']) =>
                tripStore.updateTrip(tripId, { status })
              }
              onDeleteLoose={(id) => looseStore.remove(id)}
              onAddLooseToTrip={(id) =>
                navigate(
                  looseStore.getItem(id)?.kind === 'track' ? `/tracks/${id}` : `/photos/${id}`,
                )
              }
              disabled={disconnected}
            />
          )}
        </ShellColumn>

        {dragActive && <DropOverlay label="Drop tracks or photos" />}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </MapProvider>
  )
}
