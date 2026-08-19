import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrackLayer } from './TrackLayer'
import { CairnLayer, type PositionedCairn } from './CairnLayer'
import { TrackList } from './TrackList'
import { CairnList } from './CairnList'
import { Lightbox } from './Lightbox'
import { TrackFace } from './TrackFace'
import { trackColor } from '../map/palette'
import { TripImportPanel } from './TripImportPanel'
import { TripMetadataHeader } from './TripMetadataHeader'
import { TripStats } from './TripStats'
import { TripNotFound } from './TripNotFound'
import { MissingFileRow } from './MissingFileRow'
import { googleMapsMapId } from '../env'
import { isPhotoFile, isTrackFile } from '../import/fileKinds'
import { expandArchives, isArchiveFile } from '../import/archive'
import { useTripImport } from '../import/useTripImport'
import { useCairnImport, type CairnRecord, type NewTripCairn } from '../photo/useCairnImport'
import { buildCairnListRows, flattenCairnListRows, orderCairnListItems } from '../photo/cairnListGroups'
import { unattachedCairnIds, visibleCairnIds } from '../photo/cairnAttachment'
import { effectiveElevationProfile } from '../kml/stats'
import type { TripStore } from '../store/tripStore'
import { cairnMatchesFacet, type CairnFacet } from '../store/cairnRules'
import {
  ATTACH_IMAGE_FAILED_MESSAGE,
  MOVE_FAILED_MESSAGE,
  MOVE_WRITE_FAILED_MESSAGE,
  ONLY_ONE_PHOTO_MESSAGE,
  SIGNED_OUT_PHOTO_MESSAGE,
  extraPhotosMessage,
} from '../store/looseStore'
import type { ImportedFile } from '../import/types'
import type { PlacementQueueItem } from '../import/placementQueue'
import type { LatLng } from '../map/geo'
import './TripDetail.css'

export const UNRECOGNISED_TYPE_MESSAGE =
  'trips take .kml, .kmz or .gpx tracks, JPEG, PNG or WebP photos, and .zip archives'
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
    `CairnList`. Escape or a pointerdown anywhere outside whichever row is
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
  /** #156: registers this trip's "create a cairn here" with the shell, the
      same shape and for the same reason `onDropTargetChange` already
      registers its drop handler — the gesture happens on the shell's map,
      but a cairn placed while a trip is open belongs to that trip, and the
      hook that can write into its folder lives here. `null` on unmount, so
      the gesture falls back to creating a loose cairn the moment the trip
      face closes. */
  onCreateTargetChange: (handler: ((input: NewTripCairn) => Promise<boolean>) | null) => void
  /** #157: reports which cairn's detail (the lightbox) is currently open, so
      the shell's drop overlay can name it — `null` while none is. The shell
      owns the overlay because it owns the one drop target the whole map is;
      this only tells it what to say. */
  onCairnDetailChange: (detail: { name: string; hasImage: boolean } | null) => void
  /** #158: false while dragging is refused for reasons the shell owns —
      disconnected, or the #155 placement queue owns the map. */
  cairnsDraggable: boolean
  /** #226: the id from a `/tracks/:id` match the shell couldn't resolve
      against the loose store — a candidate for one of *this* trip's own
      tracks. `undefined` whenever no such id is in the URL. Looked up
      against `tripImport.tracks` rather than passed a resolved file,
      since only this component has that list. */
  openTrackId?: string
  /** #226: reports the open track's name up, the same way
      `onCairnDetailChange` already reports a cairn's — so the shell's
      search card can show it instead of the trip's own name, and so its
      Back button knows to return here rather than to `/`. `null` while no
      track from this trip is open. */
  onTrackDetailChange?: (detail: { name: string } | null) => void
}

/** The panel's trip face, and the trip's own map layers.

    `TrackLayer` and `CairnLayer` are rendered from here even though they
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
  onCreateTargetChange,
  onCairnDetailChange,
  cairnsDraggable,
  openTrackId,
  onTrackDetailChange,
}: TripDetailProps) {
  const navigate = useNavigate()
  const trip = useSyncExternalStore(tripStore.subscribe, () => tripStore.getTrip(tripId))
  const tripImport = useTripImport(tripId, accessToken, cairnFolderId, tripStore)
  const allTracks = useMemo(() => tripImport.tracks.flatMap((file) => file.tracks), [tripImport.tracks])
  /* #218 — every track's stats, independent of visibility. Flattened
     alongside `allTracks` rather than derived from it: `trackStats` is
     computed once at import (see `ImportedFile`), and recomputing it here
     from `allTracks` would mean walking each track's points again on every
     render just to throw the result away. */
  const allTrackStats = useMemo(
    () => tripImport.tracks.flatMap((file) => file.trackStats),
    [tripImport.tracks],
  )

  /* #226 — the track face's own lookup. Single-track only, matching the
     row's `More details` gating (`TrackList`'s `canOpenDetail`): a
     multi-track file has no unambiguous numbers for a face to show, so an
     id naming one is treated exactly like an id naming nothing. */
  const openTrackFile = openTrackId
    ? tripImport.tracks.find((file) => file.id === openTrackId && file.tracks.length === 1)
    : undefined

  // Reports the open track's name up, the same shape `onCairnDetailChange`
  // already reports a cairn's — the search card reads it instead of the
  // trip's own name, and knows to send Back here rather than to `/`.
  useEffect(() => {
    onTrackDetailChange?.(openTrackFile ? { name: openTrackFile.name } : null)
    return () => onTrackDetailChange?.(null)
  }, [onTrackDetailChange, openTrackFile])

  // #226 — a track removed (or renamed out of existence — it can't be,
  // but a multi-track file's numbers becoming ambiguous the same way)
  // while its face is open returns to this trip rather than erroring.
  // Guarded on `loading` so the very first render, before anything has
  // arrived, doesn't bounce straight back out.
  useEffect(() => {
    if (!openTrackId || tripImport.loading || openTrackFile) return
    navigate(`/trips/${tripId}`)
  }, [openTrackId, openTrackFile, tripImport.loading, tripId, navigate])

  // Position resolution (EXIF, then interpolation against these same
  // tracks) happens once, at import time, inside the hook — a cairn's
  // `position` is already final by the time it reaches `cairns` below,
  // unlike the old pipeline's render-time `positionPhotos` pass.
  const cairnImport = useCairnImport(tripId, accessToken, cairnFolderId, allTracks)
  const [localFailures, setLocalFailures] = useState<LocalFailure[]>([])
  /* #188: the unpacking row, in the same shape the import progress rows
     use so it renders through `TripImportPanel` with no new markup. One
     slot rather than a list — a drop is unpacked one archive at a time. */
  const [archiveProgress, setArchiveProgress] = useState<
    { id: string; name: string; index: number; total: number } | null
  >(null)
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

  /** #226 — the trip-owned half of `Remove from trip`, shared by the row's
      own `⋮` (via `TrackList`) and the face's primary action so the two
      surfaces can't drift on what the move actually does. */
  const handleRemoveFromTripId = useCallback(
    async (id: string) => {
      if (!onRemoveFromTrip) return
      const file = tripImport.tracks.find((candidate) => candidate.id === id)
      if (!file) return
      setDetachErrors((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
      // The loose side takes hold first: the track exists in both places
      // for an instant rather than in neither. Only once the file has
      // actually moved does this trip forget it.
      if (!(await onRemoveFromTrip(file))) {
        setDetachErrors((prev) => ({ ...prev, [id]: MOVE_FAILED_MESSAGE }))
        return
      }
      await tripImport.forgetFile(id)
    },
    [onRemoveFromTrip, tripImport],
  )

  /* #121 — this is the one place in the app that knows how many cairns a
     trip holds, because `useCairnImport` lists `trips/<id>/cairns/` on
     mount and this component's own import/remove calls change it from
     there. Caching it here covers all three moments with one effect, and
     backfills the count for every trip that predates the field the first
     time the user opens one — no migration pass, and no Drive read the app
     was not already making.

     Gated on `hydrated` rather than `!loading` (#243): before the read-back
     lands, `cairns` is either the empty array it was initialised with or a
     set restored from cache, and writing a count from either would clobber
     a real one with a number Drive has not confirmed. `loading` stopped
     answering that question the moment cairns gained a cache — a cached
     trip is not loading and its count is still not yet known. A failed
     Drive read never sets `hydrated`, so it never writes a count either. */
  useEffect(() => {
    if (!cairnImport.hydrated) return
    tripStore.saveCairnCount(tripId, cairnImport.cairns.length)
  }, [tripStore, tripId, cairnImport.hydrated, cairnImport.cairns.length])
  const [selectedCairnId, setSelectedCairnId] = useState<string | null>(null)
  // Deliberately separate from `selectedCairnId` rather than derived from
  // it — a selected marker does not open the lightbox by itself, only an
  // *already-selected* one does.
  const [openCairnId, setOpenCairnId] = useState<string | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  /* #192 — the trip's own facet, `useState` here and nowhere else: it dies
     with the component, so leaving the trip and coming back gives `Any`.
     The main map's facet is independent state and neither reads the other.
     A filter you cannot see the cause of, restored on arrival, is
     indistinguishable from missing data. */
  const [cairnFacet, setCairnFacet] = useState<CairnFacet>('any')

  /* #198 — the unattached group's own eye. `useState` here for the same
     reason the facet above is: visibility is deliberately not persisted,
     so leaving the trip and coming back shows everything, which is exactly
     how track visibility already behaves. */
  const [unattachedVisible, setUnattachedVisible] = useState(true)

  /* One filter, two views. Narrowing the *records* — upstream of both the
     markers below and the list rows — is what makes "the list and the map
     never disagree" true by construction rather than by a second rule that
     has to be kept in step. */
  const facetedCairns = useMemo(
    () => cairnImport.cairns.filter((cairn) => cairnMatchesFacet(cairn, cairnFacet)),
    [cairnImport.cairns, cairnFacet],
  )

  /* #198 — the second narrowing, and the one that is *not* symmetric
     between the list and the map. A facet takes a row out of the list
     entirely; hiding a track only mutes it. So this set is applied to the
     markers below and, as a treatment rather than a filter, to the rows —
     which is why it is computed here once and consumed twice.

     Derived from every cairn the trip owns rather than from `facetedCairns`
     so that the two narrowings stay independent: whether a cairn's day is
     showing has nothing to do with whether it is a campsite. */
  const showingCairnIds = useMemo(
    () => visibleCairnIds(cairnImport.cairns, tripImport.tracks, unattachedVisible),
    [cairnImport.cairns, tripImport.tracks, unattachedVisible],
  )
  const unattachedIds = useMemo(
    () => unattachedCairnIds(cairnImport.cairns, tripImport.tracks),
    [cairnImport.cairns, tripImport.tracks],
  )
  /* The list's own hidden set: what the facet already keeps is narrowed by
     what the tracks hide. `CairnList` renders these muted, never absent. */
  const hiddenCairnIds = useMemo(
    () => new Set(facetedCairns.filter((cairn) => !showingCairnIds.has(cairn.id)).map((c) => c.id)),
    [facetedCairns, showingCairnIds],
  )

  /* What the map draws — both narrowings applied. Clustering recomputes
     over exactly this array, so a hidden cairn cannot leave a phantom
     behind in a cluster's count. */
  const mappedCairns = useMemo(
    () => facetedCairns.filter((cairn) => showingCairnIds.has(cairn.id)),
    [facetedCairns, showingCairnIds],
  )

  // Every cairn the trip owns, not just the ones carrying an image (#169 —
  // `CairnLayer` draws the pin-vs-thumbnail predicate itself, so an
  // icon-only cairn belongs here too).
  const positionedCairns: PositionedCairn[] = useMemo(
    () =>
      mappedCairns.map((cairn) => ({
        id: cairn.id,
        name: cairn.name,
        thumbnailDriveFileId: cairn.image?.thumbnailDriveFileId ?? null,
        icon: cairn.icon,
        latitude: cairn.position.lat,
        longitude: cairn.position.lng,
        source: cairn.positionSource,
      })),
    [mappedCairns],
  )

  const cairnListRows = useMemo(() => buildCairnListRows(facetedCairns, allTracks), [facetedCairns, allTracks])
  const cairnListItems = useMemo(
    () => orderCairnListItems(cairnListRows, unattachedIds),
    [cairnListRows, unattachedIds],
  )
  const flatCairnRows = useMemo(() => flattenCairnListRows(cairnListItems), [cairnListItems])
  /* Resolved against every cairn the trip owns, not the filtered set:
     retyping a photo as a campsite from inside the lightbox (#156) can
     filter the open cairn out from under itself, and the lightbox stays
     open on the cairn the user is looking at. The `rows` it navigates by
     are still the filtered ones — arrows walk what is showing. */
  const allCairnRows = useMemo(
    () => buildCairnListRows(cairnImport.cairns, allTracks),
    [cairnImport.cairns, allTracks],
  )
  const openCairnRow = openCairnId ? allCairnRows.find((row) => row.id === openCairnId) : undefined
  // The lightbox is a photo viewer first (`cairns.md`'s "Adding a photo…"
  // note: the image is what opens it) — an icon-only cairn has nothing for
  // it to show, so opening one only selects it. `openCairnRow` still
  // resolves for either case; only the *render* below is gated on having
  // an image to view.
  const openCairnRecord = openCairnId ? cairnImport.cairns.find((cairn) => cairn.id === openCairnId) : undefined
  /** #157: this cairn's own attach state — one at a time, since only one
      lightbox can be open. Cleared whenever the open cairn changes so a
      stale error from a previous cairn never bleeds into the next one. */
  const [attachingCairnId, setAttachingCairnId] = useState<string | null>(null)
  const [attachCairnError, setAttachCairnError] = useState<string | null>(null)
  /** #158: the open cairn's own drag-write failure, cleared the same way
      `attachCairnError` is — a stale error from whatever was open before
      must not bleed into the next one. A failure for a cairn that isn't
      open has nowhere to show it (design note: the detail face carries the
      failure line) — the marker's own animated revert is the only signal
      for that case. */
  const [moveCairnError, setMoveCairnError] = useState<string | null>(null)

  useEffect(() => {
    setAttachCairnError(null)
    setMoveCairnError(null)
  }, [openCairnId])

  const handleMoveCairn = useCallback(
    async (cairnId: string, position: LatLng): Promise<boolean> => {
      const ok = await cairnImport.setCairnPosition(cairnId, position)
      if (cairnId === openCairnId) setMoveCairnError(ok ? null : MOVE_WRITE_FAILED_MESSAGE)
      return ok
    },
    [cairnImport.setCairnPosition, openCairnId],
  )

  useEffect(() => {
    onCairnDetailChange(
      openCairnRecord ? { name: openCairnRecord.name, hasImage: openCairnRecord.image !== null } : null,
    )
    return () => onCairnDetailChange(null)
  }, [onCairnDetailChange, openCairnRecord])

  const openCairn = useCallback((cairnId: string) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    setSelectedCairnId(cairnId)
    setOpenCairnId(cairnId)
  }, [])

  const navigateCairn = useCallback((cairnId: string) => {
    setSelectedCairnId(cairnId)
    setOpenCairnId(cairnId)
  }, [])

  const closeLightbox = useCallback(() => setOpenCairnId(null), [])

  const addLocalFailure = useCallback((name: string, message: string) => {
    nextLocalFailureId.current += 1
    setLocalFailures((prev) => [...prev, { id: `local-failure-${nextLocalFailureId.current}`, name, message }])
  }, [])

  // #77 — a cairn that's been removed can no longer be selected or open in
  // the lightbox.
  //
  // #192 widens the selection half from removed to *not showing*: a
  // selection whose row is gone and whose marker is gone is a state with
  // no way to see or undo it. Restoring the facet to `Any` deliberately
  // does not restore it — the user picked a filter, not a navigation.
  //
  // #198 deliberately does *not* extend this to a track-hidden cairn. Its
  // row is still there and still clickable, so the selection is still
  // visible and still undoable — the condition this guard exists for never
  // arises, and clearing it would drop a selection the user can still see.
  useEffect(() => {
    if (selectedCairnId && !facetedCairns.some((cairn) => cairn.id === selectedCairnId)) {
      setSelectedCairnId(null)
    }
  }, [facetedCairns, selectedCairnId])

  useEffect(() => {
    if (openCairnId && !cairnImport.cairns.some((cairn) => cairn.id === openCairnId)) {
      setOpenCairnId(null)
    }
  }, [cairnImport.cairns, openCairnId])

  // One control, one drop target, two pipelines. Files are partitioned into
  // three buckets — tracks, photos, and neither — before either pipeline
  // sees them, so a folder containing both imports both, and a file that is
  // neither is rejected by name rather than handed to the photo pipeline
  // just because it isn't a track.
  const importFiles = useCallback(
    async (dropped: File[]) => {
      // #188: the doorway. A `.zip` is replaced by the files it holds
      // before anything else looks at what arrived, so everything below
      // runs exactly as it would have for the unzipped folder.
      const expansion = await expandArchives(dropped, (name, index, total) =>
        setArchiveProgress({ id: 'archive', name, index, total }),
      )
      setArchiveProgress(null)
      for (const rejection of expansion.rejections) {
        addLocalFailure(rejection.name, rejection.message)
      }
      const incoming = expansion.files

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

  /* #157: attaches the first file to whichever cairn's lightbox is open,
     and reports every other dropped file as refused — the gesture was aimed
     at one cairn, and quietly doing something else with the rest (importing
     them as new cairns) is worse than refusing them. */
  const attachPhotoToCairn = useCallback(
    async (cairnId: string, dropped: File[]) => {
      const expansion = await expandArchives(dropped, (name, index, total) =>
        setArchiveProgress({ id: 'archive', name, index, total }),
      )
      setArchiveProgress(null)
      for (const rejection of expansion.rejections) {
        addLocalFailure(rejection.name, rejection.message)
      }

      const [first, ...rest] = expansion.files
      // An archive holding nothing importable has already been reported.
      if (!first) return
      const archive = dropped.find((file) => isArchiveFile(file.name))
      if (archive && rest.length > 0) {
        addLocalFailure(archive.name, extraPhotosMessage(rest.length))
      } else {
        for (const file of rest) addLocalFailure(file.name, ONLY_ONE_PHOTO_MESSAGE)
      }

      setAttachingCairnId(cairnId)
      setAttachCairnError(null)
      const result = await cairnImport.attachImage(cairnId, first)
      setAttachingCairnId(null)
      if (!result.ok) setAttachCairnError(result.error ?? ATTACH_IMAGE_FAILED_MESSAGE)
    },
    [cairnImport.attachImage, addLocalFailure],
  )

  // #75: a drop that lands while signed out is not swallowed — one failure
  // row for the whole batch, not one per file. Unchanged behaviour; only
  // the component that catches the drop moved.
  //
  // #157: while a cairn's lightbox is open, the drop is aimed at that cairn
  // rather than at the trip — attaching takes over entirely rather than
  // falling back to `importFiles`, which is what "still imports as new
  // cairns" is reserved for the list face's own drops.
  const handleDroppedFiles = useCallback(
    (dropped: File[]) => {
      if (dropped.length === 0) return
      if (!signedIn) {
        if (openCairnId) {
          setAttachCairnError(SIGNED_OUT_PHOTO_MESSAGE)
        } else {
          addLocalFailure(
            `${dropped.length} file${dropped.length === 1 ? '' : 's'}`,
            SIGNED_OUT_DROP_MESSAGE,
          )
        }
        return
      }
      if (openCairnId) {
        void attachPhotoToCairn(openCairnId, dropped)
        return
      }
      void importFiles(dropped)
    },
    [signedIn, importFiles, addLocalFailure, openCairnId, attachPhotoToCairn],
  )

  useEffect(() => {
    onDropTargetChange(handleDroppedFiles)
    return () => onDropTargetChange(null)
  }, [onDropTargetChange, handleDroppedFiles])

  /* #156 — "a trip open gives a cairn in that trip". The gesture's context
     decides ownership, and this is what makes the open trip *be* that
     context: while this face is mounted, a cairn placed on the map is
     written into this trip's folder rather than the loose one. */
  const createCairnHere = useCallback(
    async (input: NewTripCairn): Promise<boolean> => {
      if (!signedIn) return false
      return (await cairnImport.createCairn(input)) !== null
    },
    [signedIn, cairnImport.createCairn],
  )

  useEffect(() => {
    onCreateTargetChange(createCairnHere)
    return () => onCreateTargetChange(null)
  }, [onCreateTargetChange, createCairnHere])

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
      // #224: the trip's full current sampled-elevation cache, so a
      // recompute triggered by an unrelated track-set change (a track
      // added or removed) never drops what's already been sampled, and so
      // a track sampled this session gets written into the sidecar the
      // same pass its stats first show a `~`.
      tripImport.sampledElevation,
    )
  }, [tripStore, trip, tripImport.loading, tripImport.tracks, tripImport.sampledElevation])

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
      onRemoveFromTrip={onRemoveFromTrip && handleRemoveFromTripId}
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
      onOpenTrack={(id) => navigate(`/tracks/${id}`)}
      canReorder={!tripImport.loading}
      disabled={!signedIn}
      emptyDetail="Drop tracks or photos anywhere, or use Import files above."
    />
  )

  return (
    <div className="trip-detail">
      {/* Drawn on the shell's map, not here — see the component doc. */}
      <TrackLayer files={tripImport.tracks} hoveredFileId={hoveredFileId} />
      {googleMapsMapId && positionedCairns.length > 0 && (
        <CairnLayer
          cairns={positionedCairns}
          accessToken={accessToken}
          selectedCairnId={selectedCairnId}
          onSelectCairn={setSelectedCairnId}
          onOpenCairn={openCairn}
          draggable={cairnsDraggable}
          onMoveCairn={handleMoveCairn}
        />
      )}

      {/* #226 — the face for a track this trip owns. Sits beside the
          trip's own body rather than replacing it in the tree: hiding
          (not unmounting) the body is what keeps its scroll position, and
          the map layers above are unaffected either way, matching
          "leaving the face returns to where it was, list scrolled as it
          was" and "the map is never unmounted". */}
      {openTrackFile && (
        <TrackFace
          key={openTrackFile.id}
          name={openTrackFile.name}
          sourceName={openTrackFile.sourceName}
          track={openTrackFile.tracks[0]}
          stats={openTrackFile.trackStats[0]}
          profile={effectiveElevationProfile(
            openTrackFile.tracks[0],
            openTrackFile.tracks[0].key ? tripImport.sampledElevation[openTrackFile.tracks[0].key] : undefined,
          )}
          color={trackColor(openTrackFile.colorIndex)}
          disabled={!signedIn}
          onRename={(name) => tripImport.renameTrack(openTrackFile.id, name)}
          onRemoveFromTrip={() => void handleRemoveFromTripId(openTrackFile.id)}
          onDelete={() => {
            void tripImport.removeFile(openTrackFile.id)
            navigate(`/trips/${tripId}`)
          }}
        />
      )}
      <div className="trip-detail__body" hidden={Boolean(openTrackFile)}>
        <TripMetadataHeader
          trip={trip}
          onUpdate={(patch) => tripStore.updateTrip(trip.id, patch)}
          disabled={!signedIn}
        />
        {/* #218: not rendered while fetching — `TripDetail` already shows
            "Loading tracks…" in its place below, and a totals block full of
            em dashes next to that message would read as a second,
            contradictory loading state. */}
        {!fetching && <TripStats trackStats={allTrackStats} />}
        <TripImportPanel
          signedIn={signedIn}
          progress={[
            ...(archiveProgress ? [archiveProgress] : []),
            ...tripImport.progress,
            ...cairnImport.progress,
          ]}
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
        {/* Renders even for a trip with tracks and no cairns — the way to
            add cairns has to be discoverable from a trip that has none. */}
        <CairnList
          items={cairnListItems}
          totalCount={cairnImport.cairns.length}
          facet={cairnFacet}
          onFacetChange={setCairnFacet}
          selectedCairnId={selectedCairnId}
          accessToken={accessToken}
          onOpenRow={openCairn}
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
          hiddenCairnIds={hiddenCairnIds}
          unattachedVisible={unattachedVisible}
          onToggleUnattached={() => setUnattachedVisible((visible) => !visible)}
        />
      </div>

      {/* #157: the lightbox is now this cairn's whole detail face, open
          whenever a cairn is — not only once it has an image to show, since
          an icon-only cairn is exactly the case a photo gets dropped onto
          to gain one. */}
      {openCairnRow && (
        <Lightbox
          row={openCairnRow}
          rows={flatCairnRows}
          description={openCairnRecord?.description ?? ''}
          accessToken={accessToken}
          onClose={closeLightbox}
          onNavigate={navigateCairn}
          attaching={attachingCairnId === openCairnRow.id}
          attachError={openCairnRow.id === openCairnId ? attachCairnError : null}
          moveError={openCairnRow.id === openCairnId ? moveCairnError : null}
          signedOut={!signedIn}
          onRemoveFromTrip={
            signedIn && onRemovePhotoFromTrip && openCairnRecord
              ? () => {
                  const record = openCairnRecord
                  closeLightbox()
                  setPhotoDetachErrors((prev) => {
                    if (!(record.id in prev)) return prev
                    const next = { ...prev }
                    delete next[record.id]
                    return next
                  })
                  void onRemovePhotoFromTrip(record).then((moved) => {
                    if (moved) {
                      cairnImport.forgetCairn(record.id)
                    } else {
                      setPhotoDetachErrors((prev) => ({ ...prev, [record.id]: MOVE_FAILED_MESSAGE }))
                    }
                  })
                }
              : undefined
          }
          /* #156: retypes this cairn. Fire-and-forget — the grid reflects
             `cairns` state, which only changes once the write has landed,
             so a failure simply leaves the selection where it was rather
             than needing an error slot the dialog has nowhere to put. */
          onSetIcon={
            signedIn && openCairnRecord
              ? (icon) => void cairnImport.setCairnIcon(openCairnRecord.id, icon)
              : undefined
          }
          /* #196: unlike the retype above, this one is not
             fire-and-forget — the face needs the outcome to decide between
             the saved flash and the failure line, and `setCairnText` has
             already put the record back by the time it resolves `false`. */
          onSaveText={
            signedIn && openCairnRecord
              ? (patch) => cairnImport.setCairnText(openCairnRecord.id, patch)
              : undefined
          }
          returnFocusRef={returnFocusRef}
        />
      )}
    </div>
  )
}
