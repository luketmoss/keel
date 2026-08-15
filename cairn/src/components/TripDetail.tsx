import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TrackLayer } from './TrackLayer'
import { PhotoLayer, type PositionedPhoto } from './PhotoLayer'
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
import { useCairnImport, type CairnRecord } from '../photo/useCairnImport'
import { buildPhotoListRows, flattenPhotoListRows, orderPhotoListItems } from '../photo/photoListGroups'
import { tripUtcOffsetHours } from '../photo/interpolate'
import type { TripStore } from '../store/tripStore'
import { MOVE_FAILED_MESSAGE } from '../store/looseStore'
import type { ImportedFile } from '../import/types'
import type { PlacementQueueItem } from '../import/placementQueue'
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
      up rather than reaching for a second store of its own.
   *
   * #120: resolves whether the move actually happened. It is a Drive file
      move now, not a local write, so it can fail — and this trip only lets
      go of the track once the loose side has hold of it. */
  onRemoveFromTrip?: (file: ImportedFile) => Promise<boolean>
  /** #132: the same contract as `onRemoveFromTrip`, for a cairn — returns a
      trip's `CairnRecord` to the top level with its data intact, resolving
      whether the move actually happened. */
  onRemovePhotoFromTrip?: (record: CairnRecord) => Promise<boolean>
  /** #168: an import that resolved some files and left others needing a
      location — the shell owns the map the placement queue draws on, so
      this trip only reports what needs placing rather than holding a queue
      of its own. `resolvedCount` is how many of *this* drop saved
      immediately, folded into the queue's running batch total alongside
      whatever a previous drop (loose or trip-scoped) already contributed. */
  onNeedsPlacement: (resolvedCount: number, items: PlacementQueueItem[]) => void
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
  onRemovePhotoFromTrip,
  onNeedsPlacement,
}: TripDetailProps) {
  const trip = useSyncExternalStore(tripStore.subscribe, () => tripStore.getTrip(tripId))
  const tripImport = useTripImport(tripId, accessToken, cairnFolderId)
  const allTracks = useMemo(() => tripImport.tracks.flatMap((file) => file.tracks), [tripImport.tracks])
  // Position resolution (EXIF, then interpolation against these same
  // tracks) happens once, at import time, inside the hook — a cairn's
  // `position` is already final by the time it reaches `cairns` below,
  // unlike the old pipeline's render-time `positionPhotos` pass.
  const cairnImport = useCairnImport(tripId, accessToken, cairnFolderId, allTracks)
  const [localFailures, setLocalFailures] = useState<LocalFailure[]>([])
  const nextLocalFailureId = useRef(0)
  const removeConfirm = useRemoveConfirm()
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)
  /** #120 — a failed `Remove from trip`, keyed by track id. Separate from
      the hook's `trackRemoveErrors` because the hook owns deleting and this
      is the other exit; merged into one map where the list reads them. */
  const [detachErrors, setDetachErrors] = useState<Record<string, string>>({})
  /** #132 — the cairn mirror of `detachErrors`, keyed by cairn id. */
  const [photoDetachErrors, setPhotoDetachErrors] = useState<Record<string, string>>({})
  // #73: "disconnected" is exactly "no usable token", whether that's never
  // having signed in, a sign-out, or #72's token-expired.
  const signedIn = accessToken !== null && cairnFolderId !== null

  /* #121 — this is the one place in the app that knows how many cairns a
     trip holds, because `useCairnImport` lists `trips/<id>/cairns/` on
     mount and this component's own import/remove calls change it from
     there. Caching it here covers all three moments with one effect, and
     backfills the count for every trip that predates the field the first
     time the user opens one — no migration pass, and no Drive read the app
     was not already making.

     Gated on `loading`: before the read-back lands, `cairns` is the empty
     array it was initialised with, and writing `0` from that would clobber
     a real count with a wrong one on every single open. */
  useEffect(() => {
    if (cairnImport.loading) return
    tripStore.saveCairnCount(tripId, cairnImport.cairns.length)
  }, [tripStore, tripId, cairnImport.loading, cairnImport.cairns.length])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  // Deliberately separate from `selectedPhotoId` rather than derived from
  // it — a selected marker does not open the lightbox by itself, only an
  // *already-selected* one does.
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  // The subset `PhotoLayer` (still the old photo-marker treatment — the
  // marker/list rework is the issue that redraws this as a pin-or-thumbnail
  // predicate) can draw: a cairn carrying an image. A cairn with no image
  // is not rendered by this layer at all yet.
  const positionedPhotos: PositionedPhoto[] = useMemo(
    () =>
      cairnImport.cairns
        .filter((cairn): cairn is CairnRecord & { image: NonNullable<CairnRecord['image']> } => cairn.image !== null)
        .map((cairn) => ({
          id: cairn.id,
          name: cairn.name,
          thumbnailDriveFileId: cairn.image.thumbnailDriveFileId,
          latitude: cairn.position.lat,
          longitude: cairn.position.lng,
          source: cairn.positionSource,
        })),
    [cairnImport.cairns],
  )

  const photoListRows = useMemo(
    () => buildPhotoListRows(cairnImport.cairns, allTracks),
    [cairnImport.cairns, allTracks],
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
    if (selectedPhotoId && !cairnImport.cairns.some((photo) => photo.id === selectedPhotoId)) {
      setSelectedPhotoId(null)
    }
  }, [cairnImport.cairns, selectedPhotoId])

  useEffect(() => {
    if (openPhotoId && !cairnImport.cairns.some((photo) => photo.id === openPhotoId)) {
      setOpenPhotoId(null)
    }
  }, [cairnImport.cairns, openPhotoId])

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
      if (photos.length > 0) {
        tasks.push(
          cairnImport.importFiles(photos).then((result) => {
            // #168: a file that resolved neither by EXIF nor by
            // interpolation waits in the shell's placement queue rather
            // than being rejected — reported up the same way a drop target
            // and the trip's geometry already are.
            onNeedsPlacement(result.resolvedCount, result.needsPlacement)
          }),
        )
      }
      return Promise.all(tasks).then(() => undefined)
    },
    // The individual callbacks, not the hook results — `useTripImport` and
    // `useCairnImport` both return a fresh object literal on every render,
    // so depending on the objects would make this a new function every
    // render, and everything downstream of it churn with it.
    [tripImport.importFiles, cairnImport.importFiles, addLocalFailure, onNeedsPlacement],
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
        (async (id) => {
          const file = tripImport.tracks.find((candidate) => candidate.id === id)
          if (!file) return
          setDetachErrors((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
          })
          // The loose side takes hold first: the track exists in both
          // places for an instant rather than in neither. Only once the
          // file has actually moved does this trip forget it — and it is
          // forgotten, not trashed, because the file is now somewhere else
          // rather than gone.
          if (!(await onRemoveFromTrip(file))) {
            setDetachErrors((prev) => ({ ...prev, [id]: MOVE_FAILED_MESSAGE }))
            return
          }
          await tripImport.forgetFile(id)
        })
      }
      confirmingId={removeConfirm.confirmingId}
      onStartConfirm={removeConfirm.onStartConfirm}
      onCancelConfirm={removeConfirm.onCancelConfirm}
      confirmingRowRef={removeConfirm.confirmingRowRef}
      removingIds={tripImport.removingTrackIds}
      removeErrors={{ ...tripImport.trackRemoveErrors, ...detachErrors }}
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
          progress={[...tripImport.progress, ...cairnImport.progress]}
          failures={[...tripImport.failures, ...cairnImport.failures, ...localFailures]}
          importFiles={importFiles}
          retryFailure={(id) =>
            tripImport.failures.some((f) => f.id === id)
              ? tripImport.retryFailure(id)
              : cairnImport.retryFailure(id)
          }
          dismissFailures={() => {
            tripImport.dismissFailures()
            cairnImport.dismissFailures()
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
          totalCount={cairnImport.cairns.length}
          selectedPhotoId={selectedPhotoId}
          accessToken={accessToken}
          tripOffsetHours={tripOffsetHours}
          onOpenRow={openPhoto}
          onRemove={cairnImport.removeCairn}
          onRemoveFromTrip={
            onRemovePhotoFromTrip &&
            (async (id) => {
              const record = cairnImport.cairns.find((candidate) => candidate.id === id)
              if (!record) return
              setPhotoDetachErrors((prev) => {
                if (!(id in prev)) return prev
                const next = { ...prev }
                delete next[id]
                return next
              })
              // The loose side takes hold first: the photo exists in both
              // places for an instant rather than in neither. Only once the
              // files have actually moved does this trip forget it — and it
              // is forgotten, not trashed, because it's now somewhere else
              // rather than gone.
              if (!(await onRemovePhotoFromTrip(record))) {
                setPhotoDetachErrors((prev) => ({ ...prev, [id]: MOVE_FAILED_MESSAGE }))
                return
              }
              cairnImport.forgetCairn(id)
            })
          }
          confirmingId={removeConfirm.confirmingId}
          onStartConfirm={removeConfirm.onStartConfirm}
          onCancelConfirm={removeConfirm.onCancelConfirm}
          confirmingRowRef={removeConfirm.confirmingRowRef}
          removingIds={cairnImport.removingCairnIds}
          removeErrors={{ ...cairnImport.cairnRemoveErrors, ...photoDetachErrors }}
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
