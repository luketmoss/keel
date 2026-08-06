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
import { FilterChips } from './components/FilterChips'
import { TripsPanel } from './components/TripsPanel'
import { TripDetail } from './components/TripDetail'
import { MapEmptyOverlay, WorldLayer, placesForTrips, visibleTripsFor } from './components/WorldMap'
import { DraftPanel } from './components/DraftPanel'
import { DropOverlay } from './components/DropOverlay'
import { ToastStack, type ToastMessage } from './components/ToastStack'
import { DriveTripStore } from './store/driveTripStore'
import type { TripIndexEntry } from './store/tripStore'
import { DEFAULT_TRIP_FILTERS, tripDayIndex, type TripFilters } from './store/tripFilters'
import { dataTransferHasFiles, filesFromDataTransfer } from './import/dataTransfer'
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
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
  const navigate = useNavigate()
  const account = useGoogleAccount()
  /* The one module allowed to import DriveTripStore directly — everything
     else depends on the TripStore interface. */
  const tripStore = useMemo(() => new DriveTripStore(), [])
  const trips = useSyncExternalStore(tripStore.subscribe, tripStore.getTrips)

  const [filters, setFilters] = useState<TripFilters>(DEFAULT_TRIP_FILTERS)
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(null)
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

  const openTrip = openTripId ? trips.find((trip) => trip.id === openTripId) : undefined
  const draftOpen = Boolean(draftTrip.draft)
  const detailOpen = Boolean(openTripId)

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
    void draftTrip.addFiles(files).then(addToasts)
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
            tracks and photos are what the map shows then. */}
        {!detailOpen && (
          <WorldLayer
            trips={visibleTrips}
            filters={filters}
            hoveredTripId={hoveredTripId}
            onHoverTrip={setHoveredTripId}
            onSelectTrip={(tripId) => navigate(`/trips/${tripId}`)}
            draftTracks={draftTrip.draft?.files.flatMap((file) => file.tracks)}
          />
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
              detail={openTrip ? { name: openTrip.name, kind: 'trip' } : null}
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
              <FilterChips
                status={filters.status}
                onChange={(status) => setFilters((current) => ({ ...current, status }))}
              />
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
            />
          ) : (
            <TripsPanel
              trips={visibleTrips}
              filters={filters}
              onFiltersChange={setFilters}
              dateSpan={dateSpan}
              hoveredTripId={hoveredTripId}
              onHoverTrip={setHoveredTripId}
              onCreate={(name) => tripStore.createTrip(name)}
              onDelete={(tripId) => tripStore.deleteTrip(tripId)}
              onSetStatus={(tripId, status: TripIndexEntry['status']) =>
                tripStore.updateTrip(tripId, { status })
              }
              disabled={disconnected}
            />
          )}
        </ShellColumn>

        {dragActive && <DropOverlay label={detailOpen ? 'Drop tracks or photos' : undefined} />}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </MapProvider>
  )
}
