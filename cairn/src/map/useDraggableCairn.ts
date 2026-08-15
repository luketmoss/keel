import { useEffect, useRef, useState } from 'react'
import type { LatLng } from './geo'
import { prefersReducedMotion } from './motion'

/* #158 — the shared drag behaviour for a cairn's marker, on both the map's
   trip-owned path (`CairnLayer`) and its loose one (`LooseLayer`). Kept as
   one hook rather than duplicated in each, since the rule (any movement is
   a drag, zero movement is a click, a failed write reverts) does not differ
   between them — only which store the caller's `onMove` writes through
   does.

   `--motion-base` from index.css, transcribed — a CSS transition cannot
   apply to `AdvancedMarker`'s `position`, which Google's own element
   repositions outside React's render, so a failed write's revert is
   animated by hand instead, the same reasoning `TrackLayer`'s draw-on
   already gives for its own `requestAnimationFrame` loop. */
const REVERT_DURATION_MS = 180

export interface UseDraggableCairnOptions {
  /** The cairn's real, store-held position. */
  position: LatLng
  /** #73/#155: false disables the gesture entirely — the marker takes the
      default cursor and ignores drag events, the same read-only treatment
      every other mutating control takes. */
  draggable: boolean
  /** Called once, on drop, only when the marker actually moved — never for
      a zero-distance press. Resolves whether the write landed; a `false`
      triggers the animated revert. */
  onMove: (position: LatLng) => Promise<boolean>
}

export interface UseDraggableCairn {
  /** Render the marker here, not at the raw store position — this is the
      store position except mid-write or mid-revert, when it is held
      locally so neither fights the pointer or jumps. */
  position: LatLng
  dragging: boolean
  draggable: boolean
  onDragStart: () => void
  onDrag: () => void
  onDragEnd: (event: google.maps.MapMouseEvent) => void
  /** Call from the marker's own click handler before doing anything else —
      `true` means this click is the one that always follows a real drag,
      and must be swallowed rather than treated as a select/open. */
  consumeDragClick: () => boolean
}

export function useDraggableCairn({ position, draggable, onMove }: UseDraggableCairnOptions): UseDraggableCairn {
  const [dragging, setDragging] = useState(false)
  const [override, setOverride] = useState<LatLng | null>(null)
  const dragStartRef = useRef<LatLng>(position)
  const suppressClickRef = useRef(false)
  const revertFrameRef = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      if (revertFrameRef.current !== undefined) cancelAnimationFrame(revertFrameRef.current)
    },
    [],
  )

  function handleDragStart() {
    dragStartRef.current = position
    setDragging(true)
  }

  // The marker follows the pointer on its own — Google's AdvancedMarkerElement
  // repositions itself during a native drag without React re-rendering, which
  // is exactly what the design note requires ("the marker layer is not
  // re-rendered until it ends"). Nothing to do here but satisfy the prop.
  function handleDrag() {}

  function handleDragEnd(event: google.maps.MapMouseEvent) {
    setDragging(false)
    const latLng = event.latLng
    if (!latLng) return
    const dropped = { lat: latLng.lat(), lng: latLng.lng() }
    const start = dragStartRef.current

    // Any movement at all is a drag — not a pixel budget (design note).
    // No movement is a click, and the marker's own click handler is left
    // to run normally.
    if (dropped.lat === start.lat && dropped.lng === start.lng) return

    suppressClickRef.current = true
    setOverride(dropped)
    void onMove(dropped).then((ok) => {
      if (ok) {
        setOverride(null)
        return
      }
      if (prefersReducedMotion()) {
        setOverride(null)
        return
      }
      const from = dropped
      const to = start
      const startTime = performance.now()
      function step(now: number) {
        const elapsed = Math.min(1, (now - startTime) / REVERT_DURATION_MS)
        setOverride({
          lat: from.lat + (to.lat - from.lat) * elapsed,
          lng: from.lng + (to.lng - from.lng) * elapsed,
        })
        if (elapsed < 1) {
          revertFrameRef.current = requestAnimationFrame(step)
        } else {
          setOverride(null)
        }
      }
      revertFrameRef.current = requestAnimationFrame(step)
    })
  }

  function consumeDragClick(): boolean {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }

  return {
    position: override ?? position,
    dragging,
    draggable,
    onDragStart: handleDragStart,
    onDrag: handleDrag,
    onDragEnd: handleDragEnd,
    consumeDragClick,
  }
}
