import { useEffect, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { SheetPromotionProvider, useSheetPromotion } from '../map/sheetPromotion'

/* #313 — the ordering requirement the design note calls out explicitly:
   "the reveal reads the detent the sheet is settling at, not the one it is
   leaving". A map marker is a descendant of `BottomSheet` (it renders
   inside `TripDetail`, which is `ShellColumn`'s `children`), so calling
   `promote()` synchronously in the same click handler that also changes a
   selection is not enough on its own — it only proves *when the call
   happens*, not *when `--sheet-current` is actually republished*, which
   depends on React's effect-flush order between the two components. This
   file proves the actual thing: a passive effect belonging to a descendant,
   fired by the same click that promoted, reads the post-promotion value. */

const PEEK = 140
const HALF_VH = 52
const FULL_VH = 92

if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent
}

function setViewportHeight(height: number) {
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

beforeEach(() => {
  setViewportHeight(800)
  document.documentElement.style.setProperty('--sheet-peek', `${PEEK}px`)
  document.documentElement.style.setProperty('--sheet-half', `${HALF_VH}vh`)
  document.documentElement.style.setProperty('--sheet-full', `${FULL_VH}vh`)
})

afterEach(() => {
  for (const token of ['--sheet-peek', '--sheet-half', '--sheet-full', '--sheet-current']) {
    document.documentElement.style.removeProperty(token)
  }
})

/** Stands in for a map marker: a descendant of `BottomSheet`, exactly as
    `CairnLayer`'s marker is a descendant of it through `TripDetail`. Its own
    passive effect — the same shape a reveal-on-selection effect takes —
    reads `--sheet-current` the moment the selection it's keyed on changes,
    which is the read this test is actually checking. */
function Marker({ onReveal }: { onReveal: (sheetCurrent: string) => void }) {
  const promote = useSheetPromotion()
  const [selected, setSelected] = useState(false)

  useEffect(() => {
    if (!selected) return
    onReveal(getComputedStyle(document.documentElement).getPropertyValue('--sheet-current'))
  }, [selected])

  function handleClick() {
    setSelected(true)
    promote()
  }

  return (
    <button type="button" onClick={handleClick}>
      tap marker
    </button>
  )
}

describe('BottomSheet promotion ordering (#313)', () => {
  it("a descendant's reveal effect, fired by the same click that promoted, reads the already-promoted --sheet-current", () => {
    const readings: string[] = []
    let promoteFn: (() => void) | null = null

    render(
      <SheetPromotionProvider value={() => promoteFn?.()}>
        <BottomSheet
          suspended={false}
          detailOpen={false}
          searchCard={<div />}
          chips={null}
          onRegisterPromote={(fn) => {
            promoteFn = fn
          }}
        >
          <Marker onReveal={(reading) => readings.push(reading)} />
        </BottomSheet>
      </SheetPromotionProvider>,
    )

    // The sheet defaults to half; get it to peek first so the tap below is
    // an actual promotion, not a no-op at the detent it's already at.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize sheet' }), { key: 'ArrowDown' })
    const peek = Math.round(PEEK)
    expect(document.documentElement.style.getPropertyValue('--sheet-current')).toBe(`${peek}px`)

    fireEvent.click(screen.getByText('tap marker'))

    const half = Math.round((HALF_VH / 100) * 800)
    expect(readings).toEqual([`${half}px`])
  })
})
