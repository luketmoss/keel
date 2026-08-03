import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type ReactNode,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MapView } from './MapView'
import { TrackList } from './TrackList'
import { PhotoList } from './PhotoList'
import { Lightbox } from './Lightbox'
import { TripImportPanel } from './TripImportPanel'
import { TripMetadataHeader } from './TripMetadataHeader'
import { TripNotFound } from './TripNotFound'
import { MissingFileRow } from './MissingFileRow'
import { DropOverlay } from './DropOverlay'
import { dataTransferHasFiles, filesFromDataTransfer } from '../import/dataTransfer'
import { useTripImport } from '../import/useTripImport'
import { usePhotoImport } from '../photo/usePhotoImport'
import { positionPhotos } from '../photo/positionPhotos'
import { buildPhotoListRows, flattenPhotoListRows, orderPhotoListItems } from '../photo/photoListGroups'
import { tripUtcOffsetHours } from '../photo/interpolate'
import type { TripStore } from '../store/tripStore'
import './TripDetail.css'

const TRACK_EXTENSIONS = ['.kml', '.kmz']

/** True for the two file extensions the existing #34 track pipeline
    accepts. Everything else — every image extension `usePhotoImport`
    knows about, HEIC/HEIF (rejected there with its own named copy), and
    any other extension entirely — goes down the photo path instead, which
    already produces the right rejection copy for "not actually a
    photo" (design doc: "Files are partitioned by extension. Tracks take
    the existing #34 path; images enter this one. Anything else is
    rejected by name."). */
function isTrackFile(name: string): boolean {
  const lower = name.toLowerCase()
  return TRACK_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

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
  const photoImport = usePhotoImport(tripId, accessToken, cairnFolderId)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)
  // Shared with #55's list, not a separate selection (design doc's
  // Selection section) — #54 only has to expose it, not build the list.
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  // Which photo the lightbox shows, `null` when closed. Deliberately
  // separate from `selectedPhotoId` rather than derived from it — a
  // selected marker (from #54) does not open the lightbox by itself, only
  // an *already-selected* one does (design doc's "The lightbox" section).
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  // Whatever had focus when the lightbox opened — the row's button or the
  // marker's hit-target div, whichever it was (criterion 9). Captured at
  // open time, read once by `Lightbox` on close.
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // #52's positionPhoto, wired in here per #54: every photo against every
  // track across the whole trip (not per-file), same pool `saveOverview`
  // below already flattens tracks from. Recomputed only when the settled
  // photo or track sets actually change, not on every render.
  const allTracks = useMemo(() => tripImport.tracks.flatMap((file) => file.tracks), [tripImport.tracks])
  const positionedPhotos = useMemo(
    () => positionPhotos(photoImport.photos, allTracks),
    [photoImport.photos, allTracks],
  )

  // #55's list — every imported photo (located or not), cross-referenced
  // with `positionedPhotos` to know which have a marker and their
  // source, grouped/ordered per the design doc.
  const photoListRows = useMemo(
    () => buildPhotoListRows(photoImport.photos, positionedPhotos, allTracks),
    [photoImport.photos, positionedPhotos, allTracks],
  )
  const photoListItems = useMemo(() => orderPhotoListItems(photoListRows), [photoListRows])
  const flatPhotoRows = useMemo(() => flattenPhotoListRows(photoListItems), [photoListItems])
  const tripOffsetHours = useMemo(() => tripUtcOffsetHours(allTracks), [allTracks])
  const openPhotoRow = openPhotoId ? flatPhotoRows.find((row) => row.id === openPhotoId) : undefined

  // Selects and opens in one action — clicking a row, or clicking an
  // already-selected marker (design doc: "Opening a photo — clicking its
  // row, or its already-selected marker"). `document.activeElement` at
  // this point is already the element the user just clicked/activated:
  // a <button> row takes focus natively on click, and PhotoLayer's
  // PhotoMarker calls `.focus()` on its hit-target before invoking this.
  const openPhoto = useCallback((photoId: string) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    setSelectedPhotoId(photoId)
    setOpenPhotoId(photoId)
  }, [])

  // Arrow-key navigation within the open lightbox — selects and swaps the
  // displayed photo without touching focus-return bookkeeping, since the
  // lightbox stays open and mounted across a navigate (design doc edge
  // case: "Selecting a row while the lightbox is open" can't happen from
  // the list because the lightbox traps focus; arrows are the only way).
  const navigatePhoto = useCallback((photoId: string) => {
    setSelectedPhotoId(photoId)
    setOpenPhotoId(photoId)
  }, [])

  const closeLightbox = useCallback(() => setOpenPhotoId(null), [])

  // One control, one drop target, two pipelines (design doc: "One import
  // control, not two"). Files are partitioned by extension before either
  // pipeline sees them, so a folder containing both tracks and photos
  // imports both without the user having to sort them first.
  const importFiles = useCallback(
    (incoming: File[]) => {
      const tracks = incoming.filter((file) => isTrackFile(file.name))
      const photos = incoming.filter((file) => !isTrackFile(file.name))
      const tasks: Promise<void>[] = []
      if (tracks.length > 0) tasks.push(tripImport.importFiles(tracks))
      if (photos.length > 0) tasks.push(photoImport.importFiles(photos))
      return Promise.all(tasks).then(() => undefined)
    },
    [tripImport, photoImport],
  )

  const combinedProgress = [...tripImport.progress, ...photoImport.progress]
  const combinedFailures = [...tripImport.failures, ...photoImport.failures]

  // Failure ids are prefixed distinctly by their owning hook
  // (`failure-`/`photo-failure-`), which is what lets one `Retry` action on
  // the shared panel route to the pipeline that actually produced the row.
  const retryFailure = useCallback(
    (id: string) => {
      if (tripImport.failures.some((f) => f.id === id)) return tripImport.retryFailure(id)
      return photoImport.retryFailure(id)
    },
    [tripImport, photoImport],
  )

  const dismissFailures = useCallback(() => {
    tripImport.dismissFailures()
    photoImport.dismissFailures()
  }, [tripImport, photoImport])

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
    if (dropped.length > 0) void importFiles(dropped)
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
          progress={combinedProgress}
          failures={combinedFailures}
          importFiles={importFiles}
          retryFailure={retryFailure}
          dismissFailures={dismissFailures}
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
            onRename={tripImport.renameTrack}
            onRecolor={tripImport.recolorTrack}
            onReorder={tripImport.reorderTracks}
            canReorder={!tripImport.loading}
          />
        ) : (
          <>
            {tripImport.tracks.length > 0 && (
              <TrackList
                files={tripImport.tracks}
                onToggleVisibility={tripImport.toggleVisibility}
                onRemove={tripImport.removeFile}
                onHoverFile={setHoveredFileId}
                onRename={tripImport.renameTrack}
                onRecolor={tripImport.recolorTrack}
                onReorder={tripImport.reorderTracks}
                canReorder={!tripImport.loading}
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
        {/* Renders even for a trip with tracks and no photos — the way to
            add photos has to be discoverable from a trip that has none
            (design doc edge case, deliberately not repeating #35's
            mistake with tracks). */}
        <PhotoList
          items={photoListItems}
          totalCount={photoImport.photos.length}
          selectedPhotoId={selectedPhotoId}
          accessToken={accessToken}
          tripOffsetHours={tripOffsetHours}
          onOpenRow={openPhoto}
        />
      </Sidebar>
      <div className="app__map">
        <MapView
          files={tripImport.tracks}
          hoveredFileId={hoveredFileId}
          photos={positionedPhotos}
          accessToken={accessToken}
          selectedPhotoId={selectedPhotoId}
          onSelectPhoto={setSelectedPhotoId}
          onOpenPhoto={openPhoto}
        />
      </div>
      {dragActive && <DropOverlay label="Drop tracks or photos" />}
      {openPhotoRow && (
        <Lightbox
          row={openPhotoRow}
          rows={flatPhotoRows}
          tripOffsetHours={tripOffsetHours}
          accessToken={accessToken}
          onClose={closeLightbox}
          onNavigate={navigatePhoto}
          returnFocusRef={returnFocusRef}
        />
      )}
    </div>
  )
}
