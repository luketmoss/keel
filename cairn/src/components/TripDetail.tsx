import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MapView } from './MapView'
import { TrackList } from './TrackList'
import { TripImportPanel } from './TripImportPanel'
import { DropOverlay } from './DropOverlay'
import { dataTransferHasFiles, filesFromDataTransfer } from '../import/dataTransfer'
import { useTripImport } from '../import/useTripImport'
import type { TripIndexEntry } from '../store/tripStore'
import './TripDetail.css'

interface TripDetailProps {
  trips: TripIndexEntry[]
  accessToken: string | null
  cairnFolderId: string | null
  accountRow: ReactNode
  /** Wired to #32's re-authentication flow — passed through to
      `TripImportPanel` for its "signed out mid-upload" failures. */
  onReconnect?: () => void
}

/** The `/trips/:id` page: same map-shell layout as `/`, but with its own
    sidebar header and its own Drive-backed import — reusing `TrackList` and
    `MapView` unmodified. Mounted instead of the v1 shell (never alongside
    it — see `App.tsx`), so its drag-and-drop never has to fight the
    window-wide v1 handlers for the same drop. */
export function TripDetail({ trips, accessToken, cairnFolderId, accountRow, onReconnect }: TripDetailProps) {
  const { id } = useParams()
  const trip = trips.find((entry) => entry.id === id)
  const tripImport = useTripImport(id ?? '', accessToken, cairnFolderId)
  const [dragActive, setDragActive] = useState(false)
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
    const dropped = filesFromDataTransfer(event.dataTransfer)
    if (dropped.length > 0) void tripImport.importFiles(dropped)
  }

  const header = (
    <div className="trip-detail-header">
      <Link to="/trips" className="trip-detail-header__back" aria-label="Back to trips">
        ←
      </Link>
      <h1 className="trip-detail-header__name" title={trip?.name ?? ''}>
        {trip?.name ?? 'Trip'}
      </h1>
    </div>
  )

  return (
    <div
      className="app"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar header={header} accountRow={accountRow}>
        <TripImportPanel
          signedIn={accessToken !== null && cairnFolderId !== null}
          progress={tripImport.progress}
          failures={tripImport.failures}
          importFiles={tripImport.importFiles}
          retryFailure={tripImport.retryFailure}
          dismissFailures={tripImport.dismissFailures}
          onReconnect={onReconnect}
        />
        {tripImport.loading ? (
          <p className="trip-detail__loading">Loading tracks…</p>
        ) : (
          <TrackList
            files={tripImport.tracks}
            onToggleVisibility={tripImport.toggleVisibility}
            onRemove={tripImport.removeFile}
          />
        )}
      </Sidebar>
      <div className="app__map">
        <MapView files={tripImport.tracks} />
      </div>
      {dragActive && <DropOverlay />}
    </div>
  )
}
