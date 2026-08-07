import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TrackLayer } from './TrackLayer'
import { PhotoLayer } from './PhotoLayer'
import { TrackList } from './TrackList'
import { PhotoList } from './PhotoList'
import { Lightbox } from './Lightbox'
import { TripImportPanel } from './TripImportPanel'
import { TripMetadataHeader } from './TripMetadataHeader'
import { TripNotFound } from './TripNotFound'
import { MissingFileRow } from './MissingFileRow'
import { googleMapsMapId } from '../env'
import { isPhotoFile, isTrackFile } from '../import/fileKinds'
import { useTripImport } from '../import/useTripImport'
import { usePhotoImport } from '../photo/usePhotoImport'
import { positionPhotos } from '../photo/positionPhotos'
import { buildPhotoListRows, flattenPhotoListRows, orderPhotoListItems } from '../photo/photoListGroups'
import { tripUtcOffsetHours } from '../photo/interpolate'
import type { TripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'
import './TripDetail.css'

const UNRECOGNISED_TYPE_MESSAGE = 'trips take .kml or .kmz tracks and JPEG, PNG or WebP photos'
const SIGNED_OUT_DROP_MESSAGE = 'sign in to add files to this trip'

/** A failure row this component produces itself, rather than one that came
    back from `useTripImport`/`usePhotoImport` — a file rejected before
    either pipeline saw it (unrecognised type), or a whole dropped batch
    refused for being signed out. */
interface LocalFailure {
  id: string
  name: string
  message: string
}

/** #77 — the single remove-confirm slot, shared between `TrackList` and
    `PhotoList`. Escape or a pointerdown anywhere outside whichever row is
    currently confirming reverts it without removing anything. */
function useRemoveConfirm() {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmingRowRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (confirmingId === null) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setConfirmingId(null)
    }

    function handlePointerDown(event: PointerEvent) {
      if (confirmingRowRef.current && !confirmingRowRef.current.contains(event.target as Node)) {
        setConfirmingId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [confirmingId])

  return {
    confirmingId,
    confirmingRowRef,
    onStartConfirm: (id: string) => setConfirmingId(id),
    onCancelConfirm: () => setConfirmingId(null),
  }
}

interface TripDetailProps {
  tripId: string
  tripStore: TripStore
  accessToken: string | null
  cairnFolderId: string | null
  onBack: () => void
  /** Wired to #32's re-authentication flow — passed through to
      `TripImportPanel` for its "signed out mid-upload" failures. */
  onReconnect?: () => void
  /** The shell's drop handler defers to whatever this registers, so a drop
      anywhere on the map still imports into the open trip rather than
      starting a draft. `TripDetail` no longer owns the whole page and
      cannot catch the drop itself — this keeps #75's behaviour without
      lifting the import pipeline out of the component that owns it. */
  onDropTargetChange: (handler: ((files: File[]) => void) | null) => void
  /** Reported up so "fit to everything" means this trip while it is open. */
  onGeometryChange: (points: { lat: number; lng: number }[]) => void
  /** #110: returns a track to the top level with its data intact. The shell
      owns the loose store, so the trip face hands the track's parsed data
      up rather than reaching for a second store of its own. */
  onRemoveFromTrip?: (file: ImportedFile) => void
}

/** The panel's trip face, and the trip's own map layers.

    `TrackLayer` and `PhotoLayer` are rendered from here even though they
    draw on the map, not in the panel: both attach to the shell's single map
    through `useMap()` and render either nothing or a portal into the map's
    own marker container, so they cost this subtree no DOM. That is what
    lets the component owning a trip's data own its layers too, without the
    map instance ever being unmounted to swap what is drawn on it. */
export function TripDetail({
  tripId,
  tripStore,
  accessToken,
  cairnFolderId,
  onBack,
  onReconnect,
  onDropTargetChange,
  onGeometryChange,
  onRemoveFromTrip,
}: TripDetailProps) {
  const trip = useSyncExternalStore(tripStore.subscribe, () => tripStore.getTrip(tripId))
  const tripImport = useTripImport(tripId, accessToken, cairnFolderId)
  const photoImport = usePhotoImport(tripId, accessToken, cairnFolderId)
  const [localFailures, setLocalFailures] = useState<LocalFailure[]>([])
  const nextLocalFailureId = useRef(0)
  const removeConfirm = useRemoveConfirm()
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)
  // #73: "disconnected" is exactly "no usable token", whether that's never
  // having signed in, a sign-out, or #72's token-expired.
  const signedIn = accessToken !== null && cairnFolderId !== null
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  // Deliberately separate from `selectedPhotoId` rather than derived from
  // it — a selected marker does not open the lightbox by itself, only an
  // *already-selected* one does.
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const allTracks = useMemo(() => tripImport.tracks.flatMap((file) => file.tracks), [tripImport.tracks])
  const positionedPhotos = useMemo(
    () => positionPhotos(photoImport.photos, allTracks),
    [photoImport.photos, allTracks],
  )

  const photoListRows = useMemo(
    () => buildPhotoListRows(photoImport.photos, positionedPhotos, allTracks),
    [photoImport.photos, positionedPhotos, allTracks],
  )
  const photoListItems = useMemo(() => orderPhotoListItems(photoListRows), [photoListRows])
  const flatPhotoRows = useMemo(() => flattenPhotoListRows(photoListItems), [photoListItems])
  const tripOffsetHours = useMemo(() => tripUtcOffsetHours(allTracks), [allTracks])
  const openPhotoRow = openPhotoId ? flatPhotoRows.find((row) => row.id === openPhotoId) : undefined

  const openPhoto = useCallback((photoId: string) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    setSelectedPhotoId(photoId)
    setOpenPhotoId(photoId)
  }, [])

  const navigatePhoto = useCallback((photoId: string) => {
    setSelectedPhotoId(photoId)
    setOpenPhotoId(photoId)
  }, [])

  const closeLightbox = useCallback(() => setOpenPhotoId(null), [])

  const addLocalFailure = useCallback((name: string, message: string) => {
    nextLocalFailureId.current += 1
    setLocalFailures((prev) => [...prev, { id: `local-failure-${nextLocalFailureId.current}`, name, message }])
  }, [])

  // #77 — a photo that's been removed can no longer be selected or open in
  // the lightbox.
  useEffect(() => {
    if (selectedPhotoId && !photoImport.photos.some((photo) => photo.id === selectedPhotoId)) {
      setSelectedPhotoId(null)
    }
  }, [photoImport.photos, selectedPhotoId])

  useEffect(() => {
    if (openPhotoId && !photoImport.photos.some((photo) => photo.id === openPhotoId)) {
      setOpenPhotoId(null)
    }
  }, [photoImport.photos, openPhotoId])

  // One control, one drop target, two pipelines. Files are partitioned into
  // three buckets — tracks, photos, and neither — before either pipeline
  // sees them, so a folder containing both imports both, and a file that is
  // neither is rejected by name rather than handed to the photo pipeline
  // just because it isn't a track.
  const importFiles = useCallback(
    (incoming: File[]) => {
      const tracks = incoming.filter((file) => isTrackFile(file.name))
      const photos = incoming.filter((file) => isPhotoFile(file.name))
      const neither = incoming.filter((file) => !isTrackFile(file.name) && !isPhotoFile(file.name))
      for (const file of neither) addLocalFailure(file.name, UNRECOGNISED_TYPE_MESSAGE)
      const tasks: Promise<void>[] = []
      if (tracks.length > 0) tasks.push(tripImport.importFiles(tracks))
      if (photos.length > 0) tasks.push(photoImport.importFiles(photos))
      return Promise.all(tasks).then(() => undefined)
    },
    // The individual callbacks, not the hook results — `useTripImport` and
    // `usePhotoImport` both return a fresh object literal on every render,
    // so depending on the objects would make this a new function every
    // render, and everything downstream of it churn with it.
    [tripImport.importFiles, photoImport.importFiles, addLocalFailure],
  )

  // #75: a drop that lands while signed out is not swallowed — one failure
  // row for the whole batch, not one per file. Unchanged behaviour; only
  // the component that catches the drop moved.
  const handleDroppedFiles = useCallback(
    (dropped: File[]) => {
      if (dropped.length === 0) return
      if (!signedIn) {
        addLocalFailure(
          `${dropped.length} file${dropped.length === 1 ? '' : 's'}`,
          SIGNED_OUT_DROP_MESSAGE,
        )
        return
      }
      void importFiles(dropped)
    },
    [signedIn, importFiles, addLocalFailure],
  )

  useEffect(() => {
    onDropTargetChange(handleDroppedFiles)
    return () => onDropTargetChange(null)
  }, [onDropTargetChange, handleDroppedFiles])

  const geometry = useMemo(
    () => allTracks.flatMap((track) => track.points.map((point) => ({ lat: point.lat, lng: point.lon }))),
    [allTracks],
  )

  useEffect(() => {
    onGeometryChange(geometry)
    return () => onGeometryChange([])
  }, [onGeometryChange, geometry])

  // Keeps the trip's precomputed overview (#36) in step with its actual
  // tracks. Skipped while `tripImport` is still mid-batch so a trip with
  // many files doesn't write a partial overview once per arrival.
  useEffect(() => {
    if (!trip || tripImport.loading) return
    tripStore.saveOverview(
      trip.id,
      tripImport.tracks.flatMap((file) => file.tracks),
    )
  }, [tripStore, trip, tripImport.loading, tripImport.tracks])

  if (!trip) {
    return (
      <div className="trip-detail">
        <TripNotFound onBack={onBack} />
      </div>
    )
  }

  // Fetching — nothing has arrived yet.
  const fetching =
    tripImport.loading && tripImport.tracks.length === 0 && tripImport.missingFiles.length === 0

  const trackList = (
    <TrackList
      files={tripImport.tracks}
      onToggleVisibility={tripImport.toggleVisibility}
      onRemove={tripImport.removeFile}
      onRemoveFromTrip={
        onRemoveFromTrip &&
        ((id) => {
          const file = tripImport.tracks.find((candidate) => candidate.id === id)
          if (!file) return
          // The loose copy is created first: the track exists in both
          // places for an instant rather than in neither.
          onRemoveFromTrip(file)
          tripImport.removeFile(id)
        })
      }
      confirmingId={removeConfirm.confirmingId}
      onStartConfirm={removeConfirm.onStartConfirm}
      onCancelConfirm={removeConfirm.onCancelConfirm}
      confirmingRowRef={removeConfirm.confirmingRowRef}
      removingIds={tripImport.removingTrackIds}
      removeErrors={tripImport.trackRemoveErrors}
      disableRemove={!signedIn}
      onHoverFile={setHoveredFileId}
      onRename={tripImport.renameTrack}
      onRecolor={tripImport.recolorTrack}
      onReorder={tripImport.reorderTracks}
      canReorder={!tripImport.loading}
      disabled={!signedIn}
      emptyDetail="Drop tracks or photos anywhere, or use Import files above."
    />
  )

  return (
    <div className="trip-detail">
      {/* Drawn on the shell's map, not here — see the component doc. */}
      <TrackLayer files={tripImport.tracks} hoveredFileId={hoveredFileId} />
      {googleMapsMapId && positionedPhotos.length > 0 && (
        <PhotoLayer
          photos={positionedPhotos}
          accessToken={accessToken}
          selectedPhotoId={selectedPhotoId}
          onSelectPhoto={setSelectedPhotoId}
          onOpenPhoto={openPhoto}
        />
      )}

      <div className="trip-detail__body">
        <TripMetadataHeader
          trip={trip}
          onUpdate={(patch) => tripStore.updateTrip(trip.id, patch)}
          disabled={!signedIn}
        />
        <TripImportPanel
          signedIn={signedIn}
          progress={[...tripImport.progress, ...photoImport.progress]}
          failures={[...tripImport.failures, ...photoImport.failures, ...localFailures]}
          importFiles={importFiles}
          retryFailure={(id) =>
            tripImport.failures.some((f) => f.id === id)
              ? tripImport.retryFailure(id)
              : photoImport.retryFailure(id)
          }
          dismissFailures={() => {
            tripImport.dismissFailures()
            photoImport.dismissFailures()
            setLocalFailures([])
          }}
          onReconnect={onReconnect}
        />
        {fetching ? (
          <p className="trip-detail__loading">Loading tracks…</p>
        ) : (
          <>
            {trackList}
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
            add photos has to be discoverable from a trip that has none. */}
        <PhotoList
          items={photoListItems}
          totalCount={photoImport.photos.length}
          selectedPhotoId={selectedPhotoId}
          accessToken={accessToken}
          tripOffsetHours={tripOffsetHours}
          onOpenRow={openPhoto}
          onRemove={photoImport.removePhoto}
          confirmingId={removeConfirm.confirmingId}
          onStartConfirm={removeConfirm.onStartConfirm}
          onCancelConfirm={removeConfirm.onCancelConfirm}
          confirmingRowRef={removeConfirm.confirmingRowRef}
          removingIds={photoImport.removingPhotoIds}
          removeErrors={photoImport.photoRemoveErrors}
          disableRemove={!signedIn}
        />
      </div>

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
