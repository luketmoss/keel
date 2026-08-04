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
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { isPhotoFile, isTrackFile } from '../import/fileKinds'
import { useTripImport } from '../import/useTripImport'
import { usePhotoImport } from '../photo/usePhotoImport'
import { positionPhotos } from '../photo/positionPhotos'
import { buildPhotoListRows, flattenPhotoListRows, orderPhotoListItems } from '../photo/photoListGroups'
import { tripUtcOffsetHours } from '../photo/interpolate'
import type { TripStore } from '../store/tripStore'
import './TripDetail.css'

const UNRECOGNISED_TYPE_MESSAGE = 'trips take .kml or .kmz tracks and JPEG, PNG or WebP photos'
const SIGNED_OUT_DROP_MESSAGE = 'sign in to add files to this trip'

/** A failure row this component produces itself, rather than one that came
    back from `useTripImport`/`usePhotoImport` — a file rejected before
    either pipeline saw it (unrecognised type), or a whole dropped batch
    refused for being signed out. No `retryFile`: neither case has anything
    useful to retry (design doc: the signed-out row "does nothing on its
    own"; an unrecognised file needs a different file, not a repeat). */
interface LocalFailure {
  id: string
  name: string
  message: string
}

/** #77 — the single remove-confirm slot, shared between `TrackList` and
    `PhotoList` (design doc: "tracks and photos sharing one slot" — they're
    one list to the user even though they're two components). Escape or a
    pointerdown anywhere outside whichever row is currently confirming
    reverts it without removing anything, same mechanism `TripList` already
    uses for its own single-row confirm. */
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
    // Starting a second confirm anywhere (track or photo) replaces
    // whichever row was already confirming — there's only ever one slot.
    onStartConfirm: (id: string) => setConfirmingId(id),
    onCancelConfirm: () => setConfirmingId(null),
  }
}

interface TripDetailProps {
  tripStore: TripStore
  accessToken: string | null
  cairnFolderId: string | null
  accountBubble: ReactNode
  /** Wired to #32's re-authentication flow — passed through to
      `TripImportPanel` for its "signed out mid-upload" failures. */
  onReconnect?: () => void
}

/** The `/trips/:id` page: its own panel + map layout, with its own
    Drive-backed import — reusing `TrackList` and `MapView` unmodified.
    Mounted instead of the default shell (never alongside it — see
    `App.tsx`), so its drag-and-drop never has to fight a window-wide
    handler for the same drop. */
export function TripDetail({
  tripStore,
  accessToken,
  cairnFolderId,
  accountBubble,
  onReconnect,
}: TripDetailProps) {
  const { id } = useParams()
  const tripId = id ?? ''
  const navigate = useNavigate()
  const location = useLocation()
  const trip = useSyncExternalStore(tripStore.subscribe, () => tripStore.getTrip(tripId))
  const tripImport = useTripImport(tripId, accessToken, cairnFolderId)
  const photoImport = usePhotoImport(tripId, accessToken, cairnFolderId)
  // #75: files rejected before either pipeline runs — an unrecognised
  // type, or a whole batch refused because nobody's signed in. Separate
  // from each hook's own `failures` because these never touched a hook.
  const [localFailures, setLocalFailures] = useState<LocalFailure[]>([])
  const nextLocalFailureId = useRef(0)
  const removeConfirm = useRemoveConfirm()
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null)
  // #73: also what drives the metadata header's and track list's Disabled
  // treatment below (`!signedIn`) — "disconnected" is exactly "no usable
  // token", the same condition this already existed to check, whether that's
  // never having signed in, a sign-out, or #72's token-expired.
  const signedIn = accessToken !== null && cairnFolderId !== null
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

  const addLocalFailure = useCallback((name: string, message: string) => {
    nextLocalFailureId.current += 1
    setLocalFailures((prev) => [...prev, { id: `local-failure-${nextLocalFailureId.current}`, name, message }])
  }, [])

  // #77 — a photo that's been removed can no longer be selected or open in
  // the lightbox. `Lightbox` already returns focus on unmount (#55's
  // contract), so clearing `openPhotoId` here is enough to close it
  // correctly; a selected id naming nothing is how a stale marker
  // highlight would otherwise survive (design doc edge case).
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

  // One control, one drop target, two pipelines (design doc: "One import
  // control, not two"). Files are partitioned into three buckets — tracks,
  // photos, and neither — before either pipeline sees them, so a folder
  // containing both tracks and photos imports both without the user having
  // to sort them first, and a file that's neither is rejected by name
  // rather than handed to the photo pipeline just because it isn't a track
  // (design doc: "A file the app cannot identify").
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
    [tripImport, photoImport, addLocalFailure],
  )

  const combinedProgress = [...tripImport.progress, ...photoImport.progress]
  const combinedFailures = [...tripImport.failures, ...photoImport.failures, ...localFailures]

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
    setLocalFailures([])
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
    // #75: the overlay is the app's promise that a drop will be handled —
    // while signed out it does not appear at all, same as the disabled
    // Import button (design doc: "A drop the app cannot accept"). The
    // depth counter still increments so a later dragleave/drop on this
    // same drag doesn't see stale state.
    if (signedIn) setDragActive(true)
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
    if (dropped.length === 0) return
    // #75: a drop that lands anyway while signed out — the pointer entered
    // before the session lapsed, or the overlay was suppressed mid-drag —
    // is not swallowed. One failure row for the whole batch, not one per
    // file (design doc: "A drop the app cannot accept").
    if (!signedIn) {
      addLocalFailure(`${dropped.length} file${dropped.length === 1 ? '' : 's'}`, SIGNED_OUT_DROP_MESSAGE)
      return
    }
    void importFiles(dropped)
  }

  // A broken detail view should never trap the user — the back control
  // works regardless of load state, including when the trip doesn't exist
  // at all. Destination is conditional (#78's Back navigation): an in-app
  // entry (opened from a dot on the world map, or a row in the trips
  // list) goes back one step, landing wherever it was opened from; a typed
  // URL or a reload has no such entry and goes home instead.
  const canGoBack = location.key !== 'default'
  function handleBack() {
    if (canGoBack) navigate(-1)
    else navigate('/')
  }
  const backButton = (
    <button type="button" className="trip-detail-header__back" aria-label="Back" onClick={handleBack}>
      ←
    </button>
  )

  if (!trip) {
    return (
      <div className="app">
        <aside className="trip-detail-panel">
          <div className="trip-detail-header">{backButton}</div>
        </aside>
        <div className="app__map">
          <TripNotFound onBack={handleBack} />
        </div>
        {accountBubble}
      </div>
    )
  }

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
      <aside className="trip-detail-panel">
        <div className="trip-detail-header">{backButton}</div>
        <div className="trip-detail-panel__body">
          <TripMetadataHeader
            trip={trip}
            onUpdate={(patch) => tripStore.updateTrip(trip.id, patch)}
            disabled={!signedIn}
          />
          <TripImportPanel
            signedIn={signedIn}
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
            // Empty trip — #6's empty state, with #75's copy fix: it used to
            // point at "Import tracks", a control this page has never had
            // (it's read "Import files" since #51).
            <TrackList
              files={tripImport.tracks}
              onToggleVisibility={tripImport.toggleVisibility}
              onRemove={tripImport.removeFile}
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
              emptyDetail="Drop tracks or photos anywhere, or use Import files above."
            />
          ) : (
            <>
              {tripImport.tracks.length > 0 && (
                <TrackList
                  files={tripImport.tracks}
                  onToggleVisibility={tripImport.toggleVisibility}
                  onRemove={tripImport.removeFile}
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
      </aside>
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
      {accountBubble}
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
