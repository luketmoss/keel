import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { latLngFromContainerPoint } from '../map/containerPoint'
import type { LatLng } from '../map/geo'

/** How long a touch must be held before it counts as a placement, and how
    far it may travel first. `156-creating-a-cairn.md`: "Long-press is 480ms,
    cancelled by any pointer movement — a press that turns into a pan is a
    pan." The slop is what makes "any movement" mean a deliberate drag
    rather than the two or three pixels a thumb moves while holding still. */
const LONG_PRESS_MS = 480
const LONG_PRESS_SLOP_PX = 10

interface CairnCreateGestureProps {
  /** Off while the placement queue owns the map, and off when the map
      cannot be interacted with at all. `156-creating-a-cairn.md`'s edge
      case: "Right-click during the #155 placement queue — ignored. The
      queue already owns the map click, and two placement intents at once
      has no sensible reading." */
  active: boolean
  onPlace: (position: LatLng) => void
}

/** The create gesture: right-click on desktop, long-press on touch.
 *
 * Renders nothing — it only attaches listeners to the shared map instance,
 * the same shape `PlacementClickCatcher` already uses, and for the same
 * reason: the map belongs to the shell, and a gesture over it is not a
 * thing on it.
 *
 * **There is no armed placement mode.** The gesture carries its own
 * coordinate, so there is nothing to arm, nothing to remember and nothing
 * to get stuck in. That is why this component has no state beyond an
 * in-flight press timer.
 *
 * A right-click on an existing marker never reaches here: Maps dispatches
 * to the marker's own element first, and `contextmenu` on the map fires
 * only for the map surface itself. */
export function CairnCreateGesture({ active, onPlace }: CairnCreateGestureProps) {
  const map = useMap()
  /* The callback through a ref so the effect below depends only on `map`
     and `active`. A caller that hands up a fresh closure every render would
     otherwise tear down and re-attach every listener on every render, and a
     press timer started before that would be cancelled by its own cleanup. */
  const onPlaceRef = useRef(onPlace)
  useEffect(() => {
    onPlaceRef.current = onPlace
  }, [onPlace])

  useEffect(() => {
    if (!map || !active) return
    // Bound inside the effect so the narrowing above survives into the
    // listeners below — a `null` map has already returned by here.
    const liveMap = map
    const div = liveMap.getDiv()

    /* Desktop. Maps' own `contextmenu` carries the coordinate, so this half
       needs no projection arithmetic at all. */
    const listener = google.maps.event.addListener(
      liveMap,
      'contextmenu',
      (event: google.maps.MapMouseEvent) => {
        if (!event.latLng || isOnAMarker(event.domEvent)) return
        onPlaceRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() })
      },
    )

    /* Touch. Timed here rather than left to the browser's own long-press:
       the design note specifies 480ms and cancel-on-movement, and whether a
       given mobile browser synthesizes `contextmenu` over a map canvas —
       and whether Maps lets it through — is not something to build a
       gesture on. */
    let timer: ReturnType<typeof setTimeout> | undefined
    let origin: { x: number; y: number } | null = null

    function cancel() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      origin = null
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType !== 'touch' || isOnAMarker(event)) return
      cancel()
      origin = { x: event.clientX, y: event.clientY }
      const { clientX, clientY } = event
      timer = setTimeout(() => {
        timer = undefined
        origin = null
        const position = pointerLatLng(liveMap, clientX, clientY)
        if (position) onPlaceRef.current(position)
      }, LONG_PRESS_MS)
    }

    function handlePointerMove(event: PointerEvent) {
      if (!origin) return
      // A press that turns into a pan is a pan.
      if (Math.abs(event.clientX - origin.x) > LONG_PRESS_SLOP_PX || Math.abs(event.clientY - origin.y) > LONG_PRESS_SLOP_PX) {
        cancel()
      }
    }

    div.addEventListener('pointerdown', handlePointerDown)
    div.addEventListener('pointermove', handlePointerMove)
    div.addEventListener('pointerup', cancel)
    div.addEventListener('pointercancel', cancel)

    return () => {
      listener.remove()
      cancel()
      div.removeEventListener('pointerdown', handlePointerDown)
      div.removeEventListener('pointermove', handlePointerMove)
      div.removeEventListener('pointerup', cancel)
      div.removeEventListener('pointercancel', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, active])

  return null
}

/** Whether the gesture landed on something already on the map rather than
    on the map itself. `156-creating-a-cairn.md`: "Right-click on an
    existing marker — opens that cairn, no create face. The marker layer
    takes the event first."
 *
 * Tested by role rather than by class: every marker this app draws — a
 * trip's dot, a track's tile, a loose cairn, a clustered one — presents a
 * `<button>` or a `role="button"` as its hit target, so one predicate
 * covers every layer and stays true for a layer written later. Matching
 * class names would be a list to keep in step with five stylesheets. */
function isOnAMarker(domEvent?: Event | null): boolean {
  const target = domEvent?.target
  if (!(target instanceof Element)) return false
  return target.closest('button, [role="button"]') !== null
}

/** Where a screen point is on the map. The bounds and the element's own box
    are read at the moment the press fires rather than when it started, so a
    press held through a camera change resolves against what is on screen
    now. `null` when the map has not drawn yet and has no bounds to read —
    no coordinate is better than a wrong one. */
function pointerLatLng(map: google.maps.Map, clientX: number, clientY: number): LatLng | null {
  const bounds = map.getBounds()
  if (!bounds) return null
  const rect = map.getDiv().getBoundingClientRect()
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()

  return latLngFromContainerPoint(clientX - rect.left, clientY - rect.top, rect.width, rect.height, {
    north: ne.lat(),
    south: sw.lat(),
    west: sw.lng(),
    east: ne.lng(),
  })
}
