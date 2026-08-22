import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './BottomSheet.css'

export type Detent = 'peek' | 'half' | 'full'

const DETENT_TOKENS: Record<Detent, string> = {
  peek: '--sheet-peek',
  half: '--sheet-half',
  full: '--sheet-full',
}

/** Resolves a detent token to pixels. The three are declared in `index.css`
    as either `px` or `vh` and nothing else, which is what lets this be
    arithmetic rather than a hidden probe element measured on every resize. */
function resolveToken(name: string, viewportHeight: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (raw.endsWith('vh')) return (parseFloat(raw) / 100) * viewportHeight
  return parseFloat(raw) || 0
}

interface Heights {
  peek: number
  half: number
  full: number
  /** Peek is dropped when it no longer fits in half the viewport — rotating
      to landscape can leave `--sheet-peek` taller than `--sheet-half`, and a
      detent taller than the space it sits in is not a detent. */
  detents: Detent[]
}

function measureHeights(): Heights {
  const viewportHeight = window.innerHeight
  const peek = resolveToken(DETENT_TOKENS.peek, viewportHeight)
  const half = resolveToken(DETENT_TOKENS.half, viewportHeight)
  const full = resolveToken(DETENT_TOKENS.full, viewportHeight)
  const detents: Detent[] = peek < half ? ['peek', 'half', 'full'] : ['half', 'full']
  return { peek, half, full, detents }
}

interface BottomSheetProps {
  /** #274 — increments once per `Fly over` press. A flyover behind a full
      or half sheet is a control that visibly does nothing, so pressing it
      drops the sheet to its smallest detent — a deliberate, argued
      exception to the rule below (design note's "Mobile"). Decoupled from
      knowing what a flyover even is: any number that changes does this,
      which is what keeps this component map-agnostic. */
  flyoverToken?: number
  /** A **decision** is open — #81's import draft, the placement queue, or
      #156's create panel. The sheet holds full and the detents are
      suspended, because a decision is not something to peek at.

      A detail face is deliberately not in this list: #258 — a trip is a
      place, and a place you cannot lower is a place that has taken the map
      away. */
  suspended: boolean
  /** A **place** is open — a trip, a loose item, a track face. The detents
      stay live; the only thing this changes is that peek is promoted to
      half, since a detail at peek shows nothing actionable and reads as
      the tap having failed. */
  detailOpen: boolean
  /** Rendered above the sheet, fixed to the top of the screen. It does not
      move with the sheet. */
  searchCard: ReactNode
  /** Inside the sheet, directly under the grabber. */
  chips: ReactNode
  children: ReactNode
}

/** The column's phone form. Same search card, same chips, same rows, same
    faces — only the container changes.

    The gesture is deliberately simpler than the iOS convention where a list
    scrolled to its top starts dragging the sheet: that needs scroll
    position, direction and velocity to agree, and gets it wrong often
    enough to feel broken. Here **the grabber owns the sheet and the list
    owns its scroll**, at every detent. A grabber that always works is worth
    more than a gesture that usually does. */
export function BottomSheet({
  flyoverToken,
  suspended,
  detailOpen,
  searchCard,
  chips,
  children,
}: BottomSheetProps) {
  const [heights, setHeights] = useState<Heights>(() =>
    typeof window === 'undefined'
      ? { peek: 0, half: 0, full: 0, detents: ['half', 'full'] }
      : measureHeights(),
  )
  const [detent, setDetent] = useState<Detent>('half')
  /** Non-null only while a drag is in flight — the sheet follows the
      pointer with no transition, then settles. */
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStartRef = useRef<{ y: number; height: number } | null>(null)
  /** The detent something moved the sheet off against the user's intent —
      a decision opening, or peek promoting because a detail did. Restored
      when that thing closes, and cleared the moment the user moves the
      sheet themselves, because restoring after that would undo their drag
      rather than ours. */
  const restoreRef = useRef<Detent | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    function remeasure() {
      setHeights(measureHeights())
    }
    remeasure()
    window.addEventListener('resize', remeasure)
    window.addEventListener('orientationchange', remeasure)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('orientationchange', remeasure)
    }
  }, [])

  // A detent that stopped existing (rotation dropping peek) falls back to
  // the next one up rather than leaving the sheet at a height no control
  // can return it to.
  useEffect(() => {
    if (!heights.detents.includes(detent)) setDetent(heights.detents[0])
  }, [heights.detents, detent])

  const restore = useCallback(() => {
    const previous = restoreRef.current
    if (previous === null) return
    restoreRef.current = null
    setDetent(previous)
  }, [])

  useEffect(() => {
    if (suspended) {
      setDetent((current) => {
        if (current === 'full') return current
        // A promotion has already recorded where the user was. Overwriting
        // it here would replace that with the height the promotion left
        // behind, and the peek they chose would be unrecoverable.
        if (restoreRef.current === null) restoreRef.current = current
        return 'full'
      })
      return
    }
    restore()
  }, [suspended, restore])

  // Opening a place leaves the detent alone. Peek is the one exception,
  // and it is the only move this makes — a detail is not a navigation to
  // full, which is what #112's original rule made it.
  useEffect(() => {
    if (detailOpen) {
      setDetent((current) => {
        if (current !== 'peek') return current
        restoreRef.current = 'peek'
        return 'half'
      })
      return
    }
    restore()
  }, [detailOpen, restore])

  /** #274 — `Fly over` pressed: drops to the smallest available detent, a
      one-gesture exception (design note's "Mobile") rather than a restore
      candidate — the user drags straight back up, they do not get it back
      by whatever closed. Guarded so mounting with a non-zero token already
      set (a face that opened after a flyover had already started once
      elsewhere) does not drop the sheet on arrival. */
  const seenFlyoverToken = useRef(flyoverToken)
  useEffect(() => {
    if (flyoverToken === undefined || flyoverToken === seenFlyoverToken.current) return
    seenFlyoverToken.current = flyoverToken
    restoreRef.current = null
    setDetent(heights.detents[0])
  }, [flyoverToken, heights.detents])

  const height = dragHeight ?? heights[detent]

  // The map's corner controls sit above the sheet's top edge and move with
  // it. Published as a custom property rather than plumbed through props so
  // the controls' own stylesheet owns the offset, and so the transition
  // stays in CSS where it matches the sheet's.
  useEffect(() => {
    document.documentElement.style.setProperty('--sheet-current', `${Math.round(height)}px`)
    return () => {
      document.documentElement.style.removeProperty('--sheet-current')
    }
  }, [height])

  const settle = useCallback(
    (raw: number) => {
      const candidates = heights.detents
      let best = candidates[0]
      let bestDistance = Infinity
      for (const candidate of candidates) {
        const distance = Math.abs(heights[candidate] - raw)
        if (distance < bestDistance) {
          bestDistance = distance
          best = candidate
        }
      }
      // Nearest by distance, which is also what "crossing more than half the
      // gap commits to the next one" means once both neighbours are
      // considered. No fling: velocity would make the same gesture do
      // different things on different days.
      restoreRef.current = null
      setDetent(best)
      setDragHeight(null)
    },
    [heights],
  )

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (suspended) return
    // Capture keeps the drag alive when the pointer leaves the grabber,
    // which it does immediately — the grabber moves with the sheet. It
    // throws for a pointer id that is not currently active, which the drag
    // itself does not depend on, so a failure here must not abort it.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      /* no capture — the drag still tracks while the pointer is over us */
    }
    dragStartRef.current = { y: event.clientY, height: heights[detent] }
    setDragHeight(heights[detent])
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStartRef.current
    if (!start) return
    // Dragging up grows the sheet, so the delta is inverted.
    const next = start.height + (start.y - event.clientY)
    setDragHeight(Math.min(heights.full, Math.max(heights[heights.detents[0]] * 0.5, next)))
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStartRef.current
    if (!start) return
    dragStartRef.current = null
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }
    } catch {
      /* never captured — nothing to release */
    }
    settle(dragHeight ?? start.height)
  }

  /* Computed from the previous detent rather than the rendered one: two
     presses inside one tick would otherwise both step from the same
     starting point and the second would do nothing. */
  function cycle(direction: 1 | -1) {
    restoreRef.current = null
    setDetent((current) => {
      const candidates = heights.detents
      const index = candidates.indexOf(current)
      return candidates[Math.min(candidates.length - 1, Math.max(0, index + direction))]
    })
  }

  function handleGrabberKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (suspended) return
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      cycle(1)
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      cycle(-1)
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      restoreRef.current = null
      // Wraps, so one repeated key reaches every detent.
      setDetent((current) => {
        const candidates = heights.detents
        const index = candidates.indexOf(current)
        return candidates[(index + 1) % candidates.length]
      })
    }
  }

  return (
    <div className="bottom-sheet-root">
      <div className="bottom-sheet__top">{searchCard}</div>
      <div
        className={`bottom-sheet${dragHeight === null ? '' : ' bottom-sheet--dragging'}`}
        ref={sheetRef}
        style={{ height: `${height}px` }}
      >
        <button
          type="button"
          className="bottom-sheet__grabber"
          aria-label="Resize sheet"
          aria-expanded={detent === 'full'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleGrabberKeyDown}
        >
          <span className="bottom-sheet__grabber-bar" aria-hidden="true" />
        </button>
        {/* Announced on change, so a screen reader hears the detent rather
            than only a height that changed. */}
        <span className="bottom-sheet__detent" aria-live="polite">
          {detent === 'peek' ? 'Peek' : detent === 'half' ? 'Half' : 'Full'}
        </span>
        {chips && <div className="bottom-sheet__chips">{chips}</div>}
        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>
  )
}
