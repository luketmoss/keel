import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { MapView } from './components/MapView'
import { ImportPanel } from './components/ImportPanel'
import { TrackList } from './components/TrackList'
import { TripList } from './components/TripList'
import { TripDetail } from './components/TripDetail'
import { WorldMap } from './components/WorldMap'
import { DropOverlay } from './components/DropOverlay'
import { useTrackImport } from './import/useTrackImport'
import { dataTransferHasFiles, filesFromDataTransfer } from './import/dataTransfer'
import { InMemoryTrackStore } from './store/trackStore'
import { DriveTripStore } from './store/driveTripStore'
import type { TripIndexEntry, TripStore } from './store/tripStore'
import { useGoogleAccount, type GoogleAccount } from './auth/useGoogleAccount'
import { AccountRow } from './auth/AccountRow'
import { defaultOverridesStore } from './import/useTripImport'
import './App.css'

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  /* Constructed once per app instance; this is the one module allowed to
     import InMemoryTrackStore directly — everything else depends on the
     TrackStore interface. */
  const store = useMemo(() => new InMemoryTrackStore(), [])
  const files = useSyncExternalStore(store.subscribe, store.getFiles)
  const trackImport = useTrackImport(store)
  const account = useGoogleAccount()
  /* Same rule as InMemoryTrackStore above: this is the one module allowed
     to import DriveTripStore directly — everything else depends on the
     TripStore interface. */
  const tripStore = useMemo(() => new DriveTripStore(), [])
  const trips = useSyncExternalStore(tripStore.subscribe, tripStore.getTrips)
  const createTrip = useCallback((name: string) => tripStore.createTrip(name), [tripStore])
  const deleteTrip = useCallback((id: string) => tripStore.deleteTrip(id), [tripStore])

  const accessToken = account.state.status === 'signed-in' ? account.state.accessToken : null
  const cairnFolderId = account.state.status === 'signed-in' ? account.state.folderId : null
  // #73: "disconnected" covers every state that leaves `accessToken` null —
  // never signed in this session, signed out, or #72's token-expired — and
  // all three get the same read-only treatment (design note: "One state,
  // one rule, stated once"). Superseded #72's narrower `driveExpired`,
  // which only covered the last of the three and left the other two
  // silently mutating a store with no way to reach Drive.
  const disconnected = accessToken === null

  // Hydrates every trip's index/overview from Drive and migrates any
  // local-only trip up, per #59's design note. Re-runs whenever the token
  // changes (a fresh sign-in, or a reconnect after expiry) — each run is
  // idempotent, so there's no harm re-hydrating on a token refresh that
  // didn't actually need it.
  useEffect(() => {
    if (!accessToken || !cairnFolderId) return
    void tripStore.connect(accessToken, cairnFolderId)
  }, [tripStore, accessToken, cairnFolderId])

  // #73: the mirror image of the effect above — every store holding Drive
  // credentials drops them the moment the account has no usable token, so a
  // mutation attempted afterward can't reach Drive and the read-only rule
  // has something to check. Runs on mount too (a no-op — neither store has
  // connected yet), and again on every transition into a disconnected
  // state, never on transitions between two disconnected states.
  useEffect(() => {
    if (!disconnected) return
    tripStore.disconnect?.()
    defaultOverridesStore.disconnect?.()
  }, [tripStore, disconnected])

  return (
    <Routes>
      {/* The trip detail page owns its own full shell (sidebar + map) —
          see TripDetail — rather than slotting into the v1 sidebar below,
          since its header and import panel differ from v1's. Matched
          first and exclusively: it is never mounted alongside the v1
          shell, which is what lets its drag-and-drop target this trip
          without fighting a window-wide v1 handler for the same drop. */}
      <Route
        path="/trips/:id"
        element={
          <TripDetail
            tripStore={tripStore}
            accessToken={accessToken}
            cairnFolderId={cairnFolderId}
            accountRow={<AccountRow account={account} />}
            onReconnect={() => void account.reconnect()}
          />
        }
      />
      <Route
        path="*"
        element={
          <DefaultShell
            files={files}
            trackImport={trackImport}
            account={account}
            trips={trips}
            tripStore={tripStore}
            createTrip={createTrip}
            deleteTrip={deleteTrip}
            disconnected={disconnected}
          />
        }
      />
    </Routes>
  )
}

interface DefaultShellProps {
  files: ReturnType<InMemoryTrackStore['getFiles']>
  trackImport: ReturnType<typeof useTrackImport>
  account: GoogleAccount
  trips: TripIndexEntry[]
  tripStore: TripStore
  createTrip: (name: string) => void
  deleteTrip: (id: string) => void
  /** #73: no usable token — creating or deleting a trip goes to the
      language's Disabled treatment rather than staying live against a
      store that will refuse the write. */
  disconnected: boolean
}

/** The map (`/`), trips list (`/trips`), and world map (`/world`, #37) —
    v1's shell, unchanged from before #34 except for living in its own
    component so the trip detail page can bypass it entirely. */
function DefaultShell({
  files,
  trackImport,
  account,
  trips,
  tripStore,
  createTrip,
  deleteTrip,
  disconnected,
}: DefaultShellProps) {
  const [dragActive, setDragActive] = useState(false)
  /* Nested elements each fire their own enter/leave as the pointer crosses
     them, so a plain boolean flickers the overlay off mid-drag — a depth
     counter only clears it once the drag has actually left the window. */
  const dragDepth = useRef(0)
  /* Lifted here rather than held by either TrackList or MapView (#49) —
     they're siblings, and the hover originates in the sidebar's track row
     but the glow it drives is drawn on the map. */
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
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
    if (files.length > 0) void trackImport.importFiles(files)
  }

  return (
    <div
      className="app"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar accountRow={<AccountRow account={account} />}>
        <ImportPanel
          failures={trackImport.failures}
          progress={trackImport.progress}
          importFiles={trackImport.importFiles}
          dismissFailures={trackImport.dismissFailures}
        />
        <TrackList
          files={files}
          onToggleVisibility={trackImport.toggleVisibility}
          onRemove={trackImport.removeFile}
          onHoverFile={setHoveredFileId}
        />
      </Sidebar>
      <div className="app__map">
        <Routes>
          <Route path="/" element={<MapView files={files} hoveredFileId={hoveredFileId} />} />
          <Route
            path="/trips"
            element={
              <TripList
                trips={trips}
                onCreate={createTrip}
                onDelete={deleteTrip}
                disabled={disconnected}
              />
            }
          />
          <Route path="/world" element={<WorldMap trips={trips} tripStore={tripStore} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {dragActive && <DropOverlay />}
    </div>
  )
}
