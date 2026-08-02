import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { MapView } from './components/MapView'
import { ImportPanel } from './components/ImportPanel'
import { TrackList } from './components/TrackList'
import { TripList } from './components/TripList'
import { TripDetail } from './components/TripDetail'
import { DropOverlay } from './components/DropOverlay'
import { useTrackImport } from './import/useTrackImport'
import { dataTransferHasFiles, filesFromDataTransfer } from './import/dataTransfer'
import { InMemoryTrackStore } from './store/trackStore'
import { LocalTripStore, type TripIndexEntry } from './store/tripStore'
import { useGoogleAccount, type GoogleAccount } from './auth/useGoogleAccount'
import { AccountRow } from './auth/AccountRow'
import './App.css'

export function App() {
  return (
    <BrowserRouter>
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
     to import LocalTripStore directly — everything else depends on the
     TripStore interface. */
  const tripStore = useMemo(() => new LocalTripStore(), [])
  const trips = useSyncExternalStore(tripStore.subscribe, tripStore.getTrips)
  const createTrip = useCallback((name: string) => tripStore.createTrip(name), [tripStore])
  const deleteTrip = useCallback((id: string) => tripStore.deleteTrip(id), [tripStore])

  const accessToken = account.state.status === 'signed-in' ? account.state.accessToken : null
  const cairnFolderId = account.state.status === 'signed-in' ? account.state.folderId : null

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
            createTrip={createTrip}
            deleteTrip={deleteTrip}
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
  createTrip: (name: string) => void
  deleteTrip: (id: string) => void
}

/** The map (`/`) and trips list (`/trips`) — v1's shell, unchanged from
    before #34 except for living in its own component so the trip detail
    page can bypass it entirely. */
function DefaultShell({ files, trackImport, account, trips, createTrip, deleteTrip }: DefaultShellProps) {
  const [dragActive, setDragActive] = useState(false)
  /* Nested elements each fire their own enter/leave as the pointer crosses
     them, so a plain boolean flickers the overlay off mid-drag — a depth
     counter only clears it once the drag has actually left the window. */
  const dragDepth = useRef(0)

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
        />
      </Sidebar>
      <div className="app__map">
        <Routes>
          <Route path="/" element={<MapView files={files} />} />
          <Route
            path="/trips"
            element={<TripList trips={trips} onCreate={createTrip} onDelete={deleteTrip} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {dragActive && <DropOverlay />}
    </div>
  )
}
