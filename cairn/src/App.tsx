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
import { FilterChips, type KindFilter } from './components/FilterChips'
import { CairnFacetChips } from './components/CairnFacetChips'
import { TripsPanel } from './components/TripsPanel'
import { TripDetail } from './components/TripDetail'
import { LooseFace } from './components/LooseFace'
import { LooseLayer } from './components/LooseLayer'
import { Track3DLayer } from './components/Track3DLayer'
import { Cairn3DLayer } from './components/Cairn3DLayer'
import type { PositionedCairn } from './components/CairnLayer'
import { useMap3DControl } from './map/Map3DControl'
import { worldTrackGeometry } from './geo/world3DRoutes'
import { MapEmptyOverlay, WorldLayer, placesForTrips, visibleTripsFor } from './components/WorldMap'
import { DraftPanel } from './components/DraftPanel'
import { DropOverlay } from './components/DropOverlay'
import { ToastStack, type ToastMessage } from './components/ToastStack'
import { DriveTripStore } from './store/driveTripStore'
import {
  ATTACH_IMAGE_FAILED_MESSAGE,
  MOVE_FAILED_MESSAGE,
  MOVE_WRITE_FAILED_MESSAGE,
  ONLY_ONE_PHOTO_MESSAGE,
  SIGNED_OUT_DROP_MESSAGE,
  extraPhotosMessage,
  SIGNED_OUT_PHOTO_MESSAGE,
  cairnDefaultName,
  moveLooseIntoTrip,
  type LooseRecord,
} from './store/looseStore'
import { downloadTrackFile } from './drive/trackFiles'
import { DriveLooseStore } from './store/driveLooseStore'
import type { TripIndexEntry } from './store/tripStore'
import { DEFAULT_TRIP_FILTERS, tripDayIndex, type TripFilters } from './store/tripFilters'
import { readTripTotals } from './geo/tripTotals'
import { dataTransferHasFiles, filesFromDataTransfer } from './import/dataTransfer'
import type { ImportedFile } from './import/types'
import { isPhotoFile } from './import/fileKinds'
import { expandArchives, isArchiveFile } from './import/archive'
import { useLooseImport } from './import/useLooseImport'
import { useDraftTrip } from './import/useDraftTrip'
import { useGoogleAccount } from './auth/useGoogleAccount'
import { AccountBubble } from './auth/AccountBubble'
import { defaultOverridesStore } from './import/useTripImport'
import { carryDisplayNameIntoTrip } from './store/trackOverridesStore'
import type { CairnRecord, NewTripCairn } from './photo/useCairnImport'
import { PlacementQueuePanel } from './components/PlacementQueuePanel'
import { PlacementClickCatcher } from './components/PlacementClickCatcher'
import { SuggestionRing } from './components/SuggestionRing'
import { CairnCreateGesture } from './components/CairnCreateGesture'
import { CairnCreatePanel, type CairnDraftFields } from './components/CairnCreatePanel'
import { CairnDraftMarker } from './components/CairnDraftMarker'
import {
  EMPTY_PLACEMENT_QUEUE,
  discardRemaining,
  enqueuePlacement,
  placeCurrent,
  skipCurrent,
  type PlacementQueueItem,
  type PlacementQueueState,
} from './import/placementQueue'
import { nearestPointByTime } from './photo/interpolate'
import { exportImageName } from './photo/thumbnail'
import { cairnMatchesFacet, type CairnFacet } from './store/cairnRules'
import type { LatLng } from './map/geo'
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
          <Route path="tracks/:id" element={null} />
          {/* #169: "photos" is no longer a kind — a cairn's own route. */}
          <Route path="cairns/:id" element={null} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/** What the search card's centre slot shows on a detail: the item's name,
    and beneath it what kind of thing it is. A loose item says so — "not in
    a trip" is the distinction the whole model turns on. */
function detailForCard(
  trip: TripIndexEntry | undefined,
  loose: LooseRecord | null,
): { name: string; kind: string } | null {
  if (trip) return { name: trip.name, kind: 'trip' }
  if (loose) {
    return {
      name: loose.name,
      kind: loose.kind === 'track' ? 'track · not in a trip' : 'cairn · not in a trip',
    }
  }
  return null
}

let nextToastId = 0
function generateToastId(): string {
  nextToastId += 1
  return `toast-${nextToastId}`
}

/** A cairn being placed by hand: where the gesture landed, which trip the
    gesture's context chose, and what has been typed so far.
 *
 * The position and the fields are separate because re-placing swaps one and
 * keeps the other — "the existing draft is replaced by a pin at the new
 * coordinate; typed values are kept". `tripId` is captured at gesture time
 * rather than read at save time for the same reason the readout exists:
 * what the face said the ownership would be is what it commits. */
interface CairnDraft {
  position: LatLng
  tripId: string | null
  fields: CairnDraftFields
}

/** `156-creating-a-cairn.md`: "a date defaulting to today", in the
    `yyyy-mm-dd` a native date input takes. Local date, not UTC — a cairn
    placed at 9pm in Melbourne is dated today, not tomorrow. */
function todayAsDateValue(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function emptyDraftFields(): CairnDraftFields {
  // Icons default to none: pre-selecting `campsite` would put a tent on
  // every cairn made by someone who did not look at the grid.
  return { name: '', icon: null, description: '', date: todayAsDateValue() }
}

/** The whole app: one map that is never unmounted, one column over it.

    Everything that used to be lifted above a route split — filters, the
    hovered trip, the open draft — is ordinary state here, because there is
    no longer a route split to survive. The map's camera survives navigation
    for the same reason, which is why #79's module-level snapshot and #80's
    scroll snapshot are both gone. */
function AppShell() {
  /* #226 — the id `/trips/:id` itself names, before any track-face
     fallback below widens what counts as "a trip is open". Kept apart
     from `openTripId` so the sticky-context effect can tell "the URL
     really is a trip" from "a trip is open because a track face inside
     one needs it to stay mounted". */
  const routeTripId = useMatch('/trips/:id')?.params.id
  const openTrackId = useMatch('/tracks/:id')?.params.id
  const openCairnId = useMatch('/cairns/:id')?.params.id
  const openLooseId = openTrackId ?? openCairnId
  const navigate = useNavigate()
  const account = useGoogleAccount()
  /** #274 — read only for the phone sheet's own detent drop; `MapCanvas`
      reads the rest of this same context for the actual 3D switch and
      surface. */
  const flyover = useMap3DControl()
  /* The one module allowed to import DriveTripStore directly — everything
     else depends on the TripStore interface. */
  const tripStore = useMemo(() => new DriveTripStore(), [])
  const trips = useSyncExternalStore(tripStore.subscribe, tripStore.getTrips)
  /* The tracks and photos no trip owns. A separate store rather than a
     `tripId` on each record: ownership is *where the file lives*, so an
     owned item is not in this store at all — and since #120 that sentence
     is literal, because the file is in Drive. */
  const looseStore = useMemo(() => new DriveLooseStore(), [])
  const looseItems = useSyncExternalStore(looseStore.subscribe, looseStore.getItems)
  const looseImport = useLooseImport(looseStore)

  const [filters, setFilters] = useState<TripFilters>(DEFAULT_TRIP_FILTERS)
  const [kind, setKind] = useState<KindFilter>('all')
  /** #159: which cairns the `Cairns` chip's facet row narrows to — only
      meaningful while `kind === 'cairns'`. Reset to `any` on every
      top-level chip change (`handleKindChange` below), never persisted:
      "the facet resets rather than being remembered." */
  const [cairnFacet, setCairnFacet] = useState<CairnFacet>('any')
  const handleKindChange = useCallback((next: KindFilter) => {
    setKind(next)
    setCairnFacet('any')
  }, [])
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  /** #120: a move is a Drive round trip, so the picker has something to
      wait on. Disables its options rather than closing over the top of an
      operation that has not happened yet. */
  const [moving, setMoving] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const dragDepth = useRef(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  /* #188: what a large archive shows while it is being unpacked. Without
     it a zip of two hundred photos is a drop that appears to have been
     ignored — nothing exists to show a row for until the files are out. */
  const [archiveProgress, setArchiveProgress] = useState<
    { name: string; index: number; total: number } | null
  >(null)
  /** #157: which trip-owned cairn's lightbox is open, reported up by
      `TripDetail` — `null` while none is, or while no trip is open at all.
      Read together with a loose cairn's own `openLoose` below to decide
      whether a drop attaches rather than imports. */
  const [tripCairnDetail, setTripCairnDetail] = useState<{ name: string; hasImage: boolean } | null>(null)
  const handleCairnDetailChange = useCallback(
    (detail: { name: string; hasImage: boolean } | null) => setTripCairnDetail(detail),
    [],
  )
  /** #226 — the mirror of `tripCairnDetail`, for a trip-owned track's face:
      reported up so the search card shows the track's own name rather than
      the trip's, and so its Back button knows to return to the trip
      instead of `/`. */
  const [tripTrackDetail, setTripTrackDetail] = useState<{ name: string } | null>(null)
  const handleTrackDetailChange = useCallback(
    (detail: { name: string } | null) => setTripTrackDetail(detail),
    [],
  )
  /** #157: a loose cairn's own attach state — the mirror of `TripDetail`'s
      `attachingCairnId`/`attachCairnError`, held here because a loose
      cairn's detail face (`LooseFace`) is rendered from this component
      rather than from one that owns an upload hook of its own. */
  const [attachingLooseId, setAttachingLooseId] = useState<string | null>(null)
  const [attachLooseError, setAttachLooseError] = useState<string | null>(null)
  /** #158: a loose cairn's own drag-write failure — the mirror of
      `TripDetail`'s `moveCairnError`, for the same reason `attachLooseError`
      already is one. */
  const [moveLooseError, setMoveLooseError] = useState<string | null>(null)
  /** #140: ids with an export currently in flight, so a second click on the
      same item's `Export` is a no-op rather than a second download — other
      items are unaffected, which is why this is a set and not a flag. */
  const [exportingIds, setExportingIds] = useState<ReadonlySet<string>>(new Set())
  /** #168: images that resolved neither by EXIF nor by interpolation, fed
      by whichever import path they were dropped through (top-level loose,
      or a trip's own drop) — the shell owns this rather than either import
      hook because the placement queue's map interaction (crosshair,
      click-to-place, the suggestion ring) belongs to the one map instance,
      not to a hook scoped to a trip that might not even be open. */
  const [queue, setQueue] = useState<PlacementQueueState>(EMPTY_PLACEMENT_QUEUE)
  /** #156: the cairn being placed by hand, or `null`. The shell owns this
      rather than either store because the gesture, the pin and the
      ownership decision are all the map's, and the map is the shell's —
      the same reasoning `queue` above is held here for. */
  const [cairnDraft, setCairnDraft] = useState<CairnDraft | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  /* Registered by the trip face while one is open, so a drop anywhere still
     imports into that trip rather than starting a draft. Refs, not state:
     the import hooks return a fresh object on every render, so storing what
     they hand up in state would re-render this component from an effect
     that then re-runs — a loop. Nothing here is read during render. */
  const tripDropRef = useRef<((files: File[]) => void) | null>(null)
  /** #156's sibling of `tripDropRef`, registered by the trip face for the
      same reason: a cairn placed while a trip is open belongs to that trip,
      and only the trip face holds the hook that can write into its
      folder. */
  const tripCreateRef = useRef<((input: NewTripCairn) => Promise<boolean>) | null>(null)
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
    // #120: loose items hydrate from `/Cairn/loose/` the same way, and any
    // that exist only locally migrate up behind it.
    void looseStore.connect(accessToken, cairnFolderId)
  }, [tripStore, looseStore, accessToken, cairnFolderId])

  // #73: the mirror image of the effect above — every store holding Drive
  // credentials drops them the moment the account has no usable token.
  useEffect(() => {
    if (!disconnected) return
    tripStore.disconnect?.()
    looseStore.disconnect?.()
    defaultOverridesStore.disconnect?.()
  }, [tripStore, looseStore, disconnected])

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

  // #95 again: loose items are withheld while disconnected for the same
  // reason trips are — the cache underneath is untouched.
  const visibleLoose = disconnected ? [] : looseItems
  // What the list face and the map actually draw for the current kind
  // filter — pulled out once so #271's 3D world view reads the same
  // filtered set `LooseLayer` does, rather than a second copy that could
  // drift from it.
  const visibleLooseForKind = visibleLoose.filter(
    (item) =>
      kind === 'all' ||
      (kind === 'tracks' && item.kind === 'track') ||
      (kind === 'cairns' && item.kind === 'cairn' && cairnMatchesFacet(item, cairnFacet)),
  )
  /* #273 — the same set, flattened to what `Cairn3DLayer` draws. Parity with
     the world view's 2D `LooseLayer`: no trip's own cairns here, only loose
     ones, from the same one filter. */
  const worldCairns: PositionedCairn[] = useMemo(
    () =>
      visibleLooseForKind
        .filter((item): item is Extract<LooseRecord, { kind: 'cairn' }> => item.kind === 'cairn')
        .map((item) => ({
          id: item.id,
          name: item.name,
          thumbnailDriveFileId: item.image?.thumbnailDriveFileId ?? null,
          icon: item.icon,
          latitude: item.position.lat,
          longitude: item.position.lng,
          source: item.positionSource,
        })),
    [visibleLooseForKind],
  )
  // Read from the *visible* set, not the raw one: #95's rule is that a
  // disconnected account shows nothing rather than a cache, and a typed URL
  // must not be the one way around that.
  const openLoose = openLooseId
    ? (visibleLoose.find((item) => item.id === openLooseId) ?? null)
    : null
  const openLooseCairn = openLoose && openLoose.kind === 'cairn' ? openLoose : null

  // #157: whichever cairn's detail is open right now, loose or trip-owned —
  // the one piece of context the drop overlay's copy and `handleDrop`'s
  // routing both need. `null` means a drop should import, not attach.
  const cairnDropDetail = openLooseCairn
    ? { name: openLooseCairn.name, hasImage: openLooseCairn.image !== null }
    : tripCairnDetail

  // #157: the overlay names its target rather than describing the gesture —
  // "import five photos" and "attach one photo" produce very different
  // results from an identical drop. Truncation to one line is CSS
  // (`DropOverlay`'s own `text-overflow: ellipsis`), not done here.
  const dropOverlayLabel = cairnDropDetail
    ? disconnected
      ? SIGNED_OUT_PHOTO_MESSAGE
      : cairnDropDetail.hasImage
        ? `Replace the photo on ${cairnDropDetail.name}`
        : `Add a photo to ${cairnDropDetail.name}`
    : 'Drop tracks or photos'

  useEffect(() => {
    setAttachLooseError(null)
    setMoveLooseError(null)
  }, [openLooseId])

  /* #226 — a trip-owned track has no id of its own in the URL (`/tracks/:id`
     carries only the track's id, the same address a loose track uses), so
     reaching it from a bare `/tracks/:id` needs to remember which trip was
     open when `More details` was clicked. Cleared the moment the URL points
     at neither a trip nor an unresolved track id — actually leaving. Left
     alone on a bare `/tracks/:id` that *did* resolve as loose, or on one
     that resolves against neither store (see `TripDetail`'s own "removed
     while open" effect, which is what corrects a stale sticky id). */
  const trackIsLoose = Boolean(openTrackId) && visibleLoose.some((item) => item.id === openTrackId)
  const [stickyTripId, setStickyTripId] = useState<string | null>(null)
  useEffect(() => {
    if (routeTripId) {
      setStickyTripId(routeTripId)
      return
    }
    if (!openTrackId || trackIsLoose) setStickyTripId(null)
  }, [routeTripId, openTrackId, trackIsLoose])

  // The trip actually rendered below: the URL's own trip id, or — while a
  // bare `/tracks/:id` names a track that isn't loose — whichever trip was
  // open when that track's face was reached, so `TripDetail` stays mounted
  // (map layers, scroll position) across the navigation instead of losing
  // both and rebuilding them the moment the face closes again.
  const openTripId = routeTripId ?? (openTrackId && !trackIsLoose ? (stickyTripId ?? undefined) : undefined)
  /** #226 — `undefined` while no such track is open, or while the open one
      turned out to be loose. Passed to `TripDetail`, which resolves it (or
      corrects a stale one) against its own `tripImport.tracks`. */
  const openTripTrackId = openTripId && openTrackId && !trackIsLoose ? openTrackId : undefined

  const openTrip = openTripId ? trips.find((trip) => trip.id === openTripId) : undefined
  const draftOpen = Boolean(draftTrip.draft)
  const detailOpen = Boolean(openTripId) || Boolean(openLooseId)

  // #168: the placement queue replaces the panel's list face for as long as
  // anything is waiting to be placed — `cairns.md`'s "Replaces the panel's
  // list face for the duration", regardless of whether a trip happened to
  // be open when the drop landed.
  const currentQueueItem: PlacementQueueItem | null = queue.items[0] ?? null
  const queueOpen = currentQueueItem !== null

  // #158: disconnected (#73), or the placement queue owns the map — either
  // one refuses the gesture entirely, the same read-only treatment every
  // other mutating control on a cairn already takes.
  const cairnsDraggable = !disconnected && !queueOpen

  const suggestionPosition: LatLng | undefined =
    currentQueueItem && currentQueueItem.captureInstantMs !== undefined
      ? nearestPointByTime(currentQueueItem.captureInstantMs, currentQueueItem.tracks)
      : undefined

  /** Every visible trip's track count, keyed by id — read from the
      precomputed overview every trip already hydrates on `connect()`, never
      by opening a trip's folder. #131's row and the picker below both read
      counts, and this is the one place either costs a call to
      `getOverview`.
   *
   * Computed on every render rather than memoized on `visibleTrips`:
   * `saveOverview` notifies subscribers but only changes the trip index's
   * own array reference when a trip's `origin` moves with it, so a track
   * added to a trip whose first point doesn't change would leave a memo
   * keyed on `visibleTrips` showing a stale count after the user returns
   * to the list. Cheap at cairn's scale — a handful of trips, each one
   * `localStorage` read. */
  const trackCounts = new Map(
    visibleTrips.map((entry) => [entry.id, tripStore.getOverview(entry.id)?.features.length ?? 0]),
  )

  /** Every visible trip's totals (#225), read from the same sidecar and for
      the same reason `trackCounts` above is: never by opening a trip's
      folder or parsing a KML, just the precomputed `overview.geojson`
      every trip already hydrates on `connect()`. `null` for a trip with no
      tracks, an unreadable sidecar, or one stamped under an older
      `SIDECAR_VERSION` — `readTripTotals` collapses all three to the same
      "nothing to show" case the row already handles. */
  const tripTotals = new Map(
    visibleTrips.map((entry) => [entry.id, readTripTotals(tripStore.getOverview(entry.id))]),
  )

  /** What the picker shows beside each trip. Counts come from the index the
      list already reads rather than opening every trip's folder to count
      its files — a picker that costs one Drive round trip per trip would
      take longer to open than the move it starts. */
  const tripChoices = visibleTrips.map((entry) => ({
    entry,
    trackCount: trackCounts.get(entry.id) ?? 0,
    // #121: cached on the index when the trip's cairns were last read, and
    // `null` until something has read them. The picker shows no cairn
    // count in that case rather than a zero it cannot stand behind.
    cairnCount: entry.cairnCount,
  }))

  /** #150: a track's name is stored by whichever trip owns it, so a move has
      to write one — otherwise the track arrives showing its filename and the
      name the user gave it is gone. This is the trip-overrides half of the
      move, handed to `moveLooseIntoTrip`; the loose half is
      `removeTrackFromTrip` below. Both live here for the same reason every
      other ownership bookkeeping does: a move needs stores that must not
      know about each other. */
  const carryTrackName = useCallback(
    (tripId: string, driveFileId: string, name: string) =>
      carryDisplayNameIntoTrip(
        defaultOverridesStore,
        tripId,
        driveFileId,
        name,
        accessToken && cairnFolderId ? { accessToken, folderId: cairnFolderId } : null,
      ),
    [accessToken, cairnFolderId],
  )

  /** Moves a loose item into a trip and opens that trip, so the result is
      visible rather than asserted. The record only leaves the loose store
      once the move has settled — a half-moved item that belongs to nothing
      is worse than a move that visibly did not happen.
   *
   * #120: the move is Drive file work now, so the picker stays open with
   * its options disabled until it settles and the navigation happens after.
   * Landing inside a trip that does not hold the item yet, and being thrown
   * back out of it on a failure, is worse than waiting a moment. */
  async function moveLooseToTrip(itemId: string, tripId: string) {
    setMoveError(null)
    setMoving(true)
    try {
      if (!(await moveLooseIntoTrip(looseStore, tripStore, itemId, tripId, carryTrackName))) {
        setMoveError(MOVE_FAILED_MESSAGE)
        return
      }
    } finally {
      setMoving(false)
    }
    // Landing on the destination is the confirmation — no toast.
    navigate(`/trips/${tripId}`)
  }

  async function createTripWithLoose(itemId: string, name: string) {
    // Created with `planned` status and no dates, and the item moves into
    // it in one step — creating an empty trip is not a state the user
    // passes through.
    const entry = tripStore.createTrip(name)
    await moveLooseToTrip(itemId, entry.id)
  }

  /** `Remove from trip`: the reverse move. The loose record is created
      first, around the file that already exists in the trip's folder, and
      the file relocates into that record's own loose folder. A failure
      un-creates the record — the track never left the trip, and a loose row
      pointing at a file still owned by a trip is exactly the duplicate this
      issue exists to stop.
   *
   * #150: a name the user typed comes out with the track. `displayName` is
   * present only when the trip held an override, which is exactly the case
   * where the name would otherwise be left behind in `overrides.json` — a
   * track nobody renamed passes `undefined` and keeps the derivation it has
   * always had. */
  async function removeTrackFromTrip(file: ImportedFile, tripId: string): Promise<boolean> {
    const record = looseImport.addParsedTracks(file.name, file.tracks, {
      driveFileId: file.driveFileId,
      ...(file.displayName !== undefined ? { name: file.displayName } : {}),
    })
    if (!record) return false
    if (!(await looseStore.claimFromTrip(record.id, tripId))) {
      looseStore.forget(record.id)
      return false
    }
    setToasts((prev) => [...prev, { id: generateToastId(), text: 'Moved back to the map.' }])
    return true
  }

  /** #132's `Remove from trip` for a cairn — the cairn mirror of
      `removeTrackFromTrip`, and the same failure order for the same
      reason: the loose record is created first, around the folder that
      already exists under the trip, and a failed claim un-creates it
      rather than leaving a loose row beside files the trip still owns.
      `record.id` is carried straight across (see `NewLooseCairn.id`), which
      is what lets `claimFromTrip` find `trips/<tripId>/cairns/<id>/` by
      name alone. */
  async function removeCairnFromTrip(record: CairnRecord, tripId: string): Promise<boolean> {
    const loose = looseImport.addCairnFromTrip(record)
    if (!(await looseStore.claimFromTrip(loose.id, tripId))) {
      looseStore.forget(loose.id)
      return false
    }
    setToasts((prev) => [...prev, { id: generateToastId(), text: 'Moved back to the map.' }])
    return true
  }

  /** #140: downloads a loose item's source file exactly as Drive holds it —
      a track's KML under its `sourceName`, a cairn's image under its
      `name`, never the thumbnail `imageCache.ts` already has a URL for.
      Client-side only: fetch the bytes, hand them to the browser via an
      Object URL and a synthetic anchor click, and let the browser's own
      download UI be the confirmation — the same "the result is on screen"
      reasoning #110 gives `Add to a trip`. */
  async function handleExport(id: string) {
    if (!accessToken || exportingIds.has(id)) return
    const item = looseStore.getItem(id)
    if (!item) return
    const fileId = item.kind === 'track' ? item.driveFileId : (item.image?.originalDriveFileId ?? null)
    if (!fileId) return
    const filename = item.kind === 'track' ? item.sourceName : item.name

    setExportingIds((prev) => new Set(prev).add(id))
    try {
      const file = await downloadTrackFile(accessToken, fileId, filename)
      // #187: a cairn's stored image is a downscaled JPEG, so a `sunset.png`
      // cairn would otherwise download JPEG bytes under a `.png` name. Named
      // from what Drive served rather than from the record, which is also
      // what leaves a cairn imported before the downscale exporting under
      // its own original extension.
      const downloadName =
        item.kind === 'track' ? filename : exportImageName(filename, file.type)
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = downloadName
      // Firefox only fires a download from a click on an anchor that's
      // actually in the document — attached, clicked, removed, in one tick.
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Not revoked in this same tick: the click starts the download
      // asynchronously, and some browsers (Firefox in particular) can lose
      // the file if the blob URL dies before they've actually read it. The
      // delay costs a few milliseconds of memory, not correctness.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setToasts((prev) => [
        ...prev,
        { id: generateToastId(), text: `Couldn't export ${item.name} — try again.` },
      ])
    } finally {
      setExportingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

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
    // inside a trip while signed out it does not appear at all. It still
    // appears at the top level while signed out, and #120 does not change
    // that: a dropped track opens #81's draft, which is a real outcome with
    // its own sign-in prompt. Only the *loose* half of a top-level drop has
    // nowhere to go, and that is refused per file below rather than by
    // withdrawing the promise for the whole batch.
    //
    // #157: a cairn's own detail is the one exception — disconnected still
    // gets the overlay there, naming the reason ("Sign in to keep photos.")
    // rather than staying silent, since the whole promise of that face is
    // "drop a photo here" and disappearing without a word breaks it.
    if (cairnDropDetail || !detailOpen || !disconnected) setDragActive(true)
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
    // #157: a loose cairn's detail is open — the drop is aimed at it, not
    // at the top-level list, so it attaches rather than importing. A trip-
    // owned cairn's equivalent lives inside `TripDetail`'s own drop handler,
    // reached through `tripDropRef` below, since that's the component that
    // holds the hook that can write into it.
    if (openLooseCairn) {
      void attachPhotoToLooseCairn(openLooseCairn.id, files)
      return
    }
    // A trip is open: the drop belongs to it, exactly as it did when the
    // trip owned the whole page.
    if (tripDropRef.current) {
      tripDropRef.current(files)
      return
    }
    // Outside any trip: tracks still open #81's draft, because a drop the
    // user wants to become a trip is exactly what that flow is for. What
    // changed is that *not* becoming one is now a valid outcome — the
    // draft's `Keep loose` takes that exit. Photos have no draft to open,
    // so they import loose directly.
    void importDroppedLoose(files)
  }

  /** #188: the loose doorway. A `.zip` becomes the files it holds before
      the photo/track split, so a zip of tracks opens the draft and a zip of
      photos imports loose, exactly as their contents would have. */
  async function importDroppedLoose(dropped: File[]) {
    const expansion = await expandArchives(dropped, (name, index, total) =>
      setArchiveProgress({ name, index, total }),
    )
    setArchiveProgress(null)
    addToasts(expansion.rejections)
    const files = expansion.files
    if (files.length === 0) return
    // Unlike the trip path, this one opens the archive before checking the
    // connection — it has to. #81/#120 keep the draft working while signed
    // out, so a zip of tracks still opens one; only the photo half below
    // needs somewhere to write, and only that half is refused.

    const photos = files.filter((file) => isPhotoFile(file.name))
    const rest = files.filter((file) => !isPhotoFile(file.name))
    // #120: the draft is unaffected by being signed out — it is visible,
    // it survives a sign-in, and #81 designed it that way. The loose path
    // has no such holding pen: it used to write to `localStorage` and let
    // #95 hide the result, which is a file going somewhere the user cannot
    // see. One toast for the batch rather than one per file, because the
    // reason is the same for all of them (#75).
    if (photos.length > 0) {
      if (disconnected) refuseLooseImport()
      else
        void looseImport.importFiles(photos).then((result) => {
          addToasts(result.rejections)
          enqueueNeedsPlacement(result.resolvedCount, result.needsPlacement)
        })
    }
    if (rest.length > 0) await draftTrip.addFiles(rest).then(addToasts)
  }

  /** #120: a loose import needs somewhere to put the file, and while
      disconnected there is nowhere. Says so once rather than accepting the
      files into a store that cannot keep them. */
  function refuseLooseImport() {
    setToasts((prev) => [...prev, { id: generateToastId(), text: SIGNED_OUT_DROP_MESSAGE }])
  }

  /** #157: attaches the first dropped file to a loose cairn's own detail,
      and refuses everything else — one toast per refused file, since a
      loose face has no failure-row list of its own the way a trip's import
      panel does. */
  async function attachPhotoToLooseCairn(id: string, files: File[]) {
    if (disconnected) {
      setToasts((prev) => [...prev, { id: generateToastId(), text: SIGNED_OUT_PHOTO_MESSAGE }])
      return
    }
    // #188: expanded only once there is somewhere to put the result — the
    // signed-out refusal above returns before an archive is ever opened.
    const expansion = await expandArchives(files, (name, index, total) =>
      setArchiveProgress({ name, index, total }),
    )
    setArchiveProgress(null)
    addToasts(expansion.rejections)

    const [first, ...rest] = expansion.files
    // An archive holding nothing importable has already said so.
    if (!first) return
    const archive = files.find((file) => isArchiveFile(file.name))
    if (rest.length > 0) {
      const texts =
        archive !== undefined
          ? [extraPhotosMessage(rest.length)]
          : rest.map(() => ONLY_ONE_PHOTO_MESSAGE)
      setToasts((prev) => [...prev, ...texts.map((text) => ({ id: generateToastId(), text }))])
    }
    setAttachingLooseId(id)
    setAttachLooseError(null)
    const result = await looseStore.attachImage(id, first)
    setAttachingLooseId(null)
    if (!result.ok) setAttachLooseError(result.error ?? ATTACH_IMAGE_FAILED_MESSAGE)
  }

  /** #158: writes a dragged loose cairn's new position. `openLooseId`'s own
      face is the only place a failure has anywhere to show — a cairn that
      isn't open has no error slot, and the marker's own animated revert is
      the only signal for that case. */
  async function handleMoveLooseCairn(id: string, position: LatLng): Promise<boolean> {
    const ok = await looseStore.update(id, { position })
    if (id === openLooseId) setMoveLooseError(ok ? null : MOVE_WRITE_FAILED_MESSAGE)
    return ok
  }

  /** The draft's third exit: keep the files, don't make a trip of them. */
  function keepDraftLoose() {
    const draft = draftTrip.draft
    if (!draft) return
    // The same refusal as a photo dropped while signed out — `Keep loose`
    // is a loose import, and the draft stays open so nothing is lost. Its
    // `Save` is already a sign-in prompt in this state, so the panel is
    // consistent about what signing in is for.
    if (disconnected) {
      refuseLooseImport()
      return
    }
    for (const file of draft.files) {
      // The draft still holds the dropped `File`, so the loose store gets
      // the bytes here exactly as it would have on a direct import.
      looseImport.addParsedTracks(file.name, file.tracks, { source: file.file })
    }
    draftTrip.cancel()
  }

  const handleDropTargetChange = useCallback((handler: ((files: File[]) => void) | null) => {
    tripDropRef.current = handler
  }, [])

  /** #168: folds one drop's resolved/unresolved split into the shared
      queue — the loose path and a trip's own drop both call this, so
      "rapid repeat drops" (`155-cairns-replace-photos.md`'s edge case)
      append to whatever is already open rather than replacing it. */
  const enqueueNeedsPlacement = useCallback((resolvedCount: number, items: PlacementQueueItem[]) => {
    setQueue((current) => enqueuePlacement(current, resolvedCount, items))
  }, [])

  /** Clicking the map, or the suggestion ring, places the queue's current
      file. A failed save leaves the item at the front of the queue — the
      same "still on the map" stance a failed ownership move already
      takes — and reports it with a toast rather than losing the file. */
  async function placeCurrentQueueItem(position: LatLng) {
    const item = currentQueueItem
    if (!item) return
    const result = await item.save(position)
    if (result === false) {
      setToasts((prev) => [...prev, { id: generateToastId(), text: `Couldn't save ${item.name} — try again.` }])
      return
    }
    const wasLast = queue.items.length === 1
    setQueue((current) => placeCurrent(current))
    // "Queue empties. Face closes, last placed cairn's detail face opens."
    // Only the loose route has a detail of its own to open here — a
    // trip-scoped cairn's detail face opens inline within TripDetail
    // instead (#169).
    if (wasLast && !openTripId) navigate(`/cairns/${result}`)
  }

  const handleCreateTargetChange = useCallback(
    (handler: ((input: NewTripCairn) => Promise<boolean>) | null) => {
      tripCreateRef.current = handler
    },
    [],
  )

  /** The gesture landed. Opens the create face with the pin already dropped
      and selected — there is no armed mode to enter, because the gesture
      carried its own coordinate.
   *
   * A second gesture while the face is open replaces the coordinate and
   * keeps everything typed: a mis-click during placement is far more likely
   * than a deliberate second cairn, and re-typing the name to fix a
   * coordinate would be the wrong tax. The trip is re-read too — the face
   * cannot have been navigated away from without being cancelled, so this
   * only ever confirms what it already said. */
  const beginCairnDraft = useCallback(
    (position: LatLng) => {
      setCreateError(null)
      setCairnDraft((current) => ({
        position,
        tripId: openTripId ?? null,
        fields: current?.fields ?? emptyDraftFields(),
      }))
    },
    [openTripId],
  )

  /** Cancel, Back and Escape are one action: the pin goes and nothing was
      ever written — no record and no Drive file, because nothing has been
      attempted until `Create`. */
  const cancelCairnDraft = useCallback(() => {
    setCairnDraft(null)
    setCreateError(null)
  }, [])

  /** Commits the draft. The gesture's context decided ownership when the
      pin dropped, so this only follows it: a trip was open, so the trip
      face's registered writer takes it; nothing was, so it becomes a loose
      cairn.
   *
   * An empty name commits the icon's label, or `Cairn` — the "empty is an
   * aborted edit" rule the model owns, read from `cairnDefaultName` rather
   * than spelled out here. */
  async function commitCairnDraft() {
    const draft = cairnDraft
    if (!draft || creating) return
    setCreateError(null)
    setCreating(true)
    try {
      const input: NewTripCairn = {
        name: draft.fields.name.trim() || cairnDefaultName(draft.fields.icon),
        position: draft.position,
        icon: draft.fields.icon,
        description: draft.fields.description,
        // An emptied date field is a cairn with no date, which the row
        // already knows how to say — it is not a reason to invent today a
        // second time.
        date: draft.fields.date || null,
      }

      if (draft.tripId) {
        const write = tripCreateRef.current
        if (!write || !(await write(input))) {
          setCreateError("Couldn't save this cairn — try again.")
          return
        }
        // The trip face is already showing; its list and its layer pick the
        // new cairn up from the hook that just wrote it.
        setCairnDraft(null)
        return
      }

      const record = looseStore.addCairn({
        name: input.name,
        position: input.position,
        // A person put it here. Interpolation will never move it again.
        positionSource: 'placed',
        icon: input.icon,
        description: input.description,
        date: input.date,
      })
      setCairnDraft(null)
      // Landing on the new cairn's own face is the confirmation, the same
      // stance the placement queue takes when it empties.
      navigate(`/cairns/${record.id}`)
    } finally {
      setCreating(false)
    }
  }

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

  const createOpen = cairnDraft !== null

  /* Held as an element rather than inlined because it appears in two
     branches of the panel's face chain: on its own when nothing is open,
     and beside the hidden trip face when one is. */
  const createFace = cairnDraft && (
    <CairnCreatePanel
      fields={cairnDraft.fields}
      onChange={(fields) => setCairnDraft((current) => (current ? { ...current, fields } : current))}
      tripId={cairnDraft.tripId}
      onCreate={() => void commitCairnDraft()}
      onCancel={cancelCairnDraft}
      disabled={disconnected}
      busy={creating}
      error={createError}
    />
  )
  /* The queue already owns the map click and two placement intents at once
     has no sensible reading, so the create gesture stands down for it. It
     stays live while the create face itself is open — that is the re-place
     the design note calls for. */
  const createGestureActive = !queueOpen && !draftOpen
  // #270: "a decision owns the map" — an import draft, the placement queue,
  // or the cairn-create gesture's own face — the same condition
  // `ShellColumn`'s `suspended` already reads for the sheet's detents,
  // reused here so the map's reveal and its route hit lines suspend for
  // exactly the surfaces the sheet already does.
  const mapDecisionActive = draftOpen || queueOpen || createOpen

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
        {/* #168: the map itself is the placement queue's input — a
            crosshair cursor and a click-to-place listener while anything is
            waiting, plus a pulsing suggestion ring when the current file's
            capture time falls near the open trip's own tracks. */}
        <PlacementClickCatcher active={queueOpen} onPlace={(position) => void placeCurrentQueueItem(position)} />
        {/* #156: right-click, or long-press on touch, places a cairn where
            you clicked. No armed mode — the gesture carries its own
            coordinate, so there is nothing to enter and nothing to leave. */}
        <CairnCreateGesture active={createGestureActive} onPlace={beginCairnDraft} />
        {cairnDraft && (
          <CairnDraftMarker position={cairnDraft.position} icon={cairnDraft.fields.icon} />
        )}
        {queueOpen && suggestionPosition && (
          <SuggestionRing
            position={suggestionPosition}
            onClick={() => void placeCurrentQueueItem(suggestionPosition)}
          />
        )}
        {/* The world's markers are hidden while a trip is open — its own
            tracks and photos are what the map shows then. A loose detail
            keeps them: the item is still one of the things on this map, and
            hiding everything around it would lose the context that makes
            its position mean anything. */}
        {!openTripId && (
          <>
            {(kind === 'all' || kind === 'trips') && (
              <WorldLayer
                trips={visibleTrips}
                filters={filters}
                hoveredTripId={hoveredTripId}
                onHoverTrip={setHoveredTripId}
                onSelectTrip={(tripId) => navigate(`/trips/${tripId}`)}
                draftTracks={draftTrip.draft?.files.flatMap((file) => file.tracks)}
              />
            )}
            <LooseLayer
              items={visibleLooseForKind}
              store={looseStore}
              accessToken={accessToken}
              hoveredId={hoveredTripId}
              onHover={setHoveredTripId}
              selectedId={openLooseId ?? null}
              onSelect={(item) =>
                navigate(item.kind === 'track' ? `/tracks/${item.id}` : `/cairns/${item.id}`)
              }
              draggable={cairnsDraggable}
              onMoveCairn={handleMoveLooseCairn}
              revealSuspended={mapDecisionActive}
            />
            {/* #271 — the world view in 3D: every visible trip's and loose
                track's route at rest, since there are no markers on that
                surface. `Track3DLayer` no-ops until the 3D surface actually
                mounts, so this costs nothing while 3D has never been
                turned on. */}
            <Track3DLayer
              tracks={worldTrackGeometry(
                kind === 'all' || kind === 'trips' ? visibleTripsFor(visibleTrips, filters) : [],
                tripStore,
                visibleLooseForKind.filter(
                  (item): item is Extract<LooseRecord, { kind: 'track' }> => item.kind === 'track',
                ),
                looseStore,
              )}
            />
            {/* #273 — the world view's loose cairns in 3D, at parity with
                `LooseLayer` above: no trip's own cairns here (design note's
                "Which cairns draw, on which face"), no dragging, and hover
                shares the same single hovered-id state a loose track and a
                trip dot already write. */}
            <Cairn3DLayer
              cairns={worldCairns}
              accessToken={accessToken}
              selectedCairnId={openLooseId ?? null}
              onSelectCairn={(id) => navigate(`/cairns/${id}`)}
              hoveredCairnIds={hoveredTripId ? new Set([hoveredTripId]) : undefined}
              onHoverCairn={(ids) => setHoveredTripId(ids.size > 0 ? [...ids][0] : null)}
            />
          </>
        )}
        {!detailOpen &&
          !draftOpen &&
          !queueOpen &&
          !createOpen &&
          (noPlaces ? (
            disconnected ? (
              <MapEmptyOverlay heading="Sign in to see your map." />
            ) : (
              <MapEmptyOverlay
                heading="Nothing here yet"
                detail="Drop a KML, GPX or a photo anywhere to start."
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
          flyoverToken={flyover.flyover?.token}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((wasCollapsed) => !wasCollapsed)}
          collapsible={!detailOpen && !draftOpen && !queueOpen && !createOpen}
          // #258: the sheet's detents are suspended by decisions and by
          // nothing else. A detail is a place — it keeps its grabber, and
          // the map behind it stays reachable.
          suspended={draftOpen || queueOpen || createOpen}
          detailOpen={detailOpen}
          searchCard={
            <SearchCard
              // #168: "Place this photo" over "needs a location" — the same
              // name/kind slots a detail already uses, so `SearchCard`
              // itself needs no placement-specific case. #156's create face
              // uses them the same way: the typed name over `new cairn`.
              detail={
                cairnDraft
                  ? { name: cairnDraft.fields.name || 'New cairn', kind: 'new cairn' }
                  : queueOpen
                    ? { name: 'Place this photo', kind: 'needs a location' }
                    : tripTrackDetail
                      ? { name: tripTrackDetail.name, kind: 'track · in a trip' }
                      : detailForCard(openTrip, openLoose)
              }
              // "Back, in the search card, discards the remaining queue —
              // it is the same action as Discard n, reached from the other
              // end. It does not silently save them." #156's Back is
              // likewise identical to its Cancel.
              //
              // #226: a trip-owned track's face returns to the trip it came
              // from, not to `/` — "leaving returns to where it was opened
              // from", the same stance a loose track's own Back (unchanged,
              // below) already takes by landing on the top-level list.
              onBack={() =>
                createOpen
                  ? cancelCairnDraft()
                  : queueOpen
                    ? setQueue(discardRemaining)
                    : tripTrackDetail && openTripId
                      ? navigate(`/trips/${openTripId}`)
                      : navigate('/')
              }
              query={filters.name}
              onQueryChange={(name) => setFilters((current) => ({ ...current, name }))}
              accountBubble={<AccountBubble account={account} />}
            />
          }
          chips={
            // Hidden on a detail — filtering a list you are no longer
            // looking at is noise — and while a draft or the placement
            // queue is open, for the reason #81 already gives.
            // #156 adds the create face to that list, for the same reason:
            // it is a draft, and nothing it shows is a filterable list.
            detailOpen || draftOpen || queueOpen || createOpen ? null : (
              <>
                <FilterChips kind={kind} onChange={handleKindChange} />
                {/* #159: the facet row, subordinate to the main row and
                    shown only while its own chip is active. */}
                {kind === 'cairns' && (
                  <CairnFacetChips facet={cairnFacet} onChange={setCairnFacet} />
                )}
              </>
            )
          }
        >
          {/* #156's create face replaces whatever face was showing — except
              that a trip's face is *hidden* rather than replaced, below.
              The placement queue still comes first: it is the one flow the
              create gesture stands down for entirely. */}
          {queueOpen ? (
            <PlacementQueuePanel
              queue={queue}
              hasSuggestion={suggestionPosition !== undefined}
              onSkip={() => setQueue(skipCurrent)}
              onDiscard={() => setQueue(discardRemaining)}
            />
          ) : cairnDraft && !openTripId ? (
            createFace
          ) : draftTrip.draft ? (
            <DraftPanel
              draft={draftTrip.draft}
              updateName={draftTrip.updateName}
              updateDates={draftTrip.updateDates}
              updateNotes={draftTrip.updateNotes}
              onSave={() => void draftTrip.save()}
              onCancel={draftTrip.cancel}
              onKeepLoose={keepDraftLoose}
              signedIn={!disconnected}
              onSignIn={() => void account.signIn()}
            />
          ) : openTripId ? (
            /* The trip face is hidden while the create face is up, never
               unmounted. Unmounting it would take with it both the writer
               that owns this trip's `cairns/` folder — the thing Create is
               about to call — and the trip's own track and cairn layers,
               which are exactly what the new pin is being placed relative
               to. `hidden` on a flex child is `display: none`, so the panel
               lays out around whichever of the two is showing. */
            <>
              {cairnDraft && createFace}
              <div className="shell-column__hidden-face" hidden={createOpen}>
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
                  // Back to the top level, with everything about it intact.
                  // Reversible by adding it back, which is why it needs no
                  // confirm — `Delete permanently` is the neighbouring one.
                  onRemoveFromTrip={(file) => removeTrackFromTrip(file, openTripId)}
                  onRemovePhotoFromTrip={(record) => removeCairnFromTrip(record, openTripId)}
                  onNeedsPlacement={enqueueNeedsPlacement}
                  onCreateTargetChange={handleCreateTargetChange}
                  onCairnDetailChange={handleCairnDetailChange}
                  cairnsDraggable={cairnsDraggable}
                  openTrackId={openTripTrackId}
                  onTrackDetailChange={handleTrackDetailChange}
                  revealSuspended={mapDecisionActive}
                />
              </div>
            </>
          ) : openLooseId ? (
            openLoose ? (
              <LooseFace
                key={openLooseId}
                item={openLoose}
                store={looseStore}
                trips={tripChoices}
                accessToken={accessToken}
                disabled={disconnected}
                busy={moving}
                error={moveError}
                onAddToTrip={(tripId) => void moveLooseToTrip(openLooseId, tripId)}
                onCreateTripWith={(name) => void createTripWithLoose(openLooseId, name)}
                onRename={(id, name) => looseStore.update(id, { name })}
                onRecolor={(id, color) => looseStore.update(id, { colorIndex: color })}
                // #156: retyping writes `icon` and nothing else — the
                // store's patch shape is what makes that literal.
                onSetIcon={(id, icon) => looseStore.update(id, { icon })}
                // #196: the same one-field patch, for the free text. The
                // store is already optimistic — local first, Drive after,
                // revert on failure — so the face gets its outcome without
                // the user waiting on a round trip to see their own typing.
                onSetDescription={(id, description) => looseStore.update(id, { description })}
                onExport={(id) => void handleExport(id)}
                exporting={exportingIds.has(openLooseId)}
                attaching={attachingLooseId === openLooseId}
                attachError={attachLooseError}
                moveWriteError={moveLooseError}
                onDelete={() => {
                  // Trashes the Drive folder as well now. Best-effort and
                  // not awaited: the row is gone either way, and a failed
                  // trash leaves a folder nothing reads again.
                  void looseStore.remove(openLooseId)
                  navigate('/')
                }}
              />
            ) : (
              <div className="trips-panel__empty">
                <p className="trips-panel__empty-title">Not found</p>
                <p className="trips-panel__empty-detail">It may have been deleted.</p>
              </div>
            )
          ) : (
            <TripsPanel
              trips={visibleTrips}
              trackCounts={trackCounts}
              tripTotals={tripTotals}
              looseItems={visibleLoose}
              kind={kind}
              facet={cairnFacet}
              onFacetChange={setCairnFacet}
              filters={filters}
              onFiltersChange={setFilters}
              dateSpan={dateSpan}
              hoveredId={hoveredTripId}
              onHover={setHoveredTripId}
              onCreate={(name) => tripStore.createTrip(name)}
              onDelete={(tripId) => tripStore.deleteTrip(tripId)}
              onDeleteLoose={(id) => looseStore.remove(id)}
              onRenameLoose={(id, name) => looseStore.update(id, { name })}
              onRecolorLoose={(id, color) => looseStore.update(id, { colorIndex: color })}
              onExportLoose={(id) => void handleExport(id)}
              exportingIds={exportingIds}
              onAddLooseToTrip={(id) =>
                navigate(
                  looseStore.getItem(id)?.kind === 'track' ? `/tracks/${id}` : `/cairns/${id}`,
                )
              }
              disabled={disconnected}
            />
          )}
        </ShellColumn>

        {dragActive && <DropOverlay label={dropOverlayLabel} />}
        {archiveProgress && (
          <p className="archive-progress" role="status">
            {archiveProgress.name} — {archiveProgress.index} of {archiveProgress.total}
          </p>
        )}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </MapProvider>
  )
}
