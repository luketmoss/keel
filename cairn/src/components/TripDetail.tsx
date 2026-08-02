import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MapView } from './MapView'
import { TrackList } from './TrackList'
import { TripImportPanel } from './TripImportPanel'
import { TripMetadataHeader } from './TripMetadataHeader'
import { TripNotFound } from './TripNotFound'
import { MissingFileRow } from './MissingFileRow'
import { DropOverlay } from './DropOverlay'
import { dataTransferHasFiles, filesFromDataTransfer } from '../import/dataTransfer'
import { useTripImport } from '../import/useTripImport'
import type { TripStore } from '../store/tripStore'
import './TripDetail.css'

interface TripDetailProps {
  tripStore: TripStore
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
export function TripDetail({ tripStore, accessToken, cairnFolderId, accountRow, onReconnect }: TripDetailProps) {
  const { id } = useParams()
  const tripId = id ?? ''
  const trip = useSyncExternalStore(tripStore.subscribe, () => tripStore.getTrip(tripId))
  const tripImport = useTripImport(tripId, accessToken, cairnFolderId)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)

  // Keeps the trip's precomputed overview (#36, read by `/world`, #37) in
  // step with its actual tracks — regenerated whenever the settled set
  // changes: the initial Drive read-back, and any add/remove afterward.
  // Skipped while `tripImport` is still mid-batch so a trip with many
  // files doesn't write a partial overview once per arrival.
  useEffect(() => {
    if (!trip || tripImport.loading) return
    tripStore.saveOverview(
      trip.id,
      tripImport.tracks.flatMap((file) => file.tracks),
    )
  }, [tripStore, trip, tripImport.loading, tripImport.tracks])

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

  // A broken detail view should never trap the user — the back link works
  // regardless of load state, including when the trip doesn't exist at all.
  const backLink = (
    <Link to="/trips" className="trip-detail-header__back" aria-label="Back to trips">
      ←
    </Link>
  )

  if (!trip) {
    return (
      <div className="app">
        <Sidebar header={<div className="trip-detail-header">{backLink}</div>} accountRow={accountRow}>
          <div />
        </Sidebar>
        <div className="app__map">
          <TripNotFound />
        </div>
      </div>
    )
  }

  const header = <div className="trip-detail-header">{backLink}</div>

  // Fetching — nothing has arrived yet. File list shows nothing beyond the
  // placeholder text; the map shows its own loading treatment via MapView.
  const fetching = tripImport.loading && tripImport.tracks.length === 0 && tripImport.missingFiles.length === 0

  return (
    <div
      className="app"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar header={header} accountRow={accountRow}>
        <TripMetadataHeader trip={trip} onUpdate={(patch) => tripStore.updateTrip(trip.id, patch)} />
        <TripImportPanel
          signedIn={accessToken !== null && cairnFolderId !== null}
          progress={tripImport.progress}
          failures={tripImport.failures}
          importFiles={tripImport.importFiles}
          retryFailure={tripImport.retryFailure}
          dismissFailures={tripImport.dismissFailures}
          onReconnect={onReconnect}
        />
        {fetching ? (
          <p className="trip-detail__loading">Loading tracks…</p>
        ) : tripImport.tracks.length === 0 && tripImport.missingFiles.length === 0 ? (
          // Empty trip — the existing #6 empty state, unmodified: it
          // already describes the way to get files into a trip today.
          <TrackList
            files={tripImport.tracks}
            onToggleVisibility={tripImport.toggleVisibility}
            onRemove={tripImport.removeFile}
            onHoverFile={setHoveredFileId}
          />
        ) : (
          <>
            {tripImport.tracks.length > 0 && (
              <TrackList
                files={tripImport.tracks}
                onToggleVisibility={tripImport.toggleVisibility}
                onRemove={tripImport.removeFile}
                onHoverFile={setHoveredFileId}
              />
            )}
            {tripImport.missingFiles.length > 0 && (
              // Every file missing renders no extra banner — the rows
              // already say it (#35 edge case).
              <ul className="track-list track-list--missing">
                {tripImport.missingFiles.map((file) => (
                  <MissingFileRow key={file.id} file={file} />
                ))}
              </ul>
            )}
          </>
        )}
      </Sidebar>
      <div className="app__map">
        <MapView files={tripImport.tracks} hoveredFileId={hoveredFileId} />
      </div>
      {dragActive && <DropOverlay />}
    </div>
  )
}
