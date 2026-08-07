import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'

/* jsdom loads no stylesheet, so the detent tokens have to be put on the
   root the way `index.css` puts them there. Same values, so the arithmetic
   under test is the arithmetic that ships. */
const PEEK = 140
const HALF_VH = 52
const FULL_VH = 92

/* jsdom implements no `PointerEvent`, so `fireEvent.pointerDown` falls back
   to a bare `Event` that carries no coordinates — the drag under test would
   read `clientY: undefined` and go nowhere. `MouseEvent` carries the
   coordinates and dispatches under the same type names, which is all these
   handlers read. */
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

function renderSheet(props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
  return render(
    <BottomSheet
      forceFull={props.forceFull ?? false}
      searchCard={props.searchCard ?? <div data-testid="card">card</div>}
      chips={props.chips ?? <div data-testid="chips">chips</div>}
    >
      {props.children ?? <div data-testid="face">list</div>}
    </BottomSheet>,
  )
}

function sheet(): HTMLElement {
  return document.querySelector('.bottom-sheet') as HTMLElement
}

function sheetHeight(): number {
  return parseFloat(sheet().style.height)
}

function grabber(): HTMLElement {
  return screen.getByRole('button', { name: 'Resize sheet' })
}

function drag(fromY: number, toY: number) {
  const handle = grabber()
  fireEvent.pointerDown(handle, { pointerId: 1, clientY: fromY })
  fireEvent.pointerMove(handle, { pointerId: 1, clientY: toY })
  fireEvent.pointerUp(handle, { pointerId: 1, clientY: toY })
}

describe('BottomSheet', () => {
  it('opens at half, with the map above it and the sheet below', () => {
    renderSheet()

    expect(sheetHeight()).toBeCloseTo((HALF_VH / 100) * 800, 0)
    // Half the viewport is still map.
    expect(sheetHeight()).toBeLessThan(800)
  })

  it('never reaches full screen even at its tallest detent', () => {
    renderSheet()

    fireEvent.keyDown(grabber(), { key: 'ArrowUp' })

    expect(sheetHeight()).toBeCloseTo((FULL_VH / 100) * 800, 0)
    expect(sheetHeight()).toBeLessThan(800)
  })

  it('keeps the search card outside the sheet so it does not move with it', () => {
    renderSheet()

    const card = screen.getByTestId('card')
    expect(card.closest('.bottom-sheet')).toBeNull()
    expect(card.closest('.bottom-sheet__top')).not.toBeNull()
  })

  it('puts the chips inside the sheet, under the grabber', () => {
    renderSheet()

    const chips = screen.getByTestId('chips')
    expect(chips.closest('.bottom-sheet__chips')).not.toBeNull()
    expect(chips.closest('.bottom-sheet')).not.toBeNull()
  })

  it('renders the face inside the sheet body, which is what scrolls', () => {
    renderSheet()

    expect(screen.getByTestId('face').closest('.bottom-sheet__body')).not.toBeNull()
  })

  describe('the grabber', () => {
    it('cycles the detents by keyboard', () => {
      renderSheet()
      const half = (HALF_VH / 100) * 800

      fireEvent.keyDown(grabber(), { key: 'ArrowDown' })
      expect(sheetHeight()).toBeCloseTo(PEEK, 0)

      fireEvent.keyDown(grabber(), { key: 'ArrowUp' })
      expect(sheetHeight()).toBeCloseTo(half, 0)

      fireEvent.keyDown(grabber(), { key: 'ArrowUp' })
      expect(sheetHeight()).toBeCloseTo((FULL_VH / 100) * 800, 0)
    })

    it('steps twice for two presses in the same tick', () => {
      renderSheet()

      // Both keydowns dispatch before React re-renders. Computing the next
      // detent from the rendered one would make the second a no-op.
      fireEvent.keyDown(grabber(), { key: 'ArrowDown' })
      fireEvent.keyDown(grabber(), { key: 'ArrowUp' })
      fireEvent.keyDown(grabber(), { key: 'ArrowUp' })

      expect(sheetHeight()).toBeCloseTo((FULL_VH / 100) * 800, 0)
    })

    it('reports whether the sheet is at full', () => {
      renderSheet()
      expect(grabber().getAttribute('aria-expanded')).toBe('false')

      fireEvent.keyDown(grabber(), { key: 'ArrowUp' })
      expect(grabber().getAttribute('aria-expanded')).toBe('true')
    })

    it('announces the detent on change', () => {
      renderSheet()
      expect(document.querySelector('.bottom-sheet__detent')?.textContent).toBe('Half')

      fireEvent.keyDown(grabber(), { key: 'ArrowDown' })
      expect(document.querySelector('.bottom-sheet__detent')?.textContent).toBe('Peek')
    })
  })

  describe('dragging', () => {
    it('follows the pointer while the drag is in flight, with no transition', () => {
      renderSheet()
      const handle = grabber()

      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 340 })

      // Dragging up by 60px grows the sheet by 60px.
      expect(sheetHeight()).toBeCloseTo((HALF_VH / 100) * 800 + 60, 0)
      expect(sheet().className).toContain('--dragging')
    })

    it('settles on the nearest detent on release', () => {
      renderSheet()

      // A small drag up from half — nowhere near full.
      drag(400, 380)

      expect(sheetHeight()).toBeCloseTo((HALF_VH / 100) * 800, 0)
      expect(sheet().className).not.toContain('--dragging')
    })

    it('crossing more than half the gap settles on the next detent, not the one it left', () => {
      renderSheet()
      const half = (HALF_VH / 100) * 800
      const full = (FULL_VH / 100) * 800
      // Just past the midpoint between half and full.
      const travel = (full - half) / 2 + 10

      drag(400, 400 - travel)

      expect(sheetHeight()).toBeCloseTo(full, 0)
    })

    it('a drag that stops short of the midpoint returns to where it started', () => {
      renderSheet()
      const half = (HALF_VH / 100) * 800
      const full = (FULL_VH / 100) * 800
      const travel = (full - half) / 2 - 10

      drag(400, 400 - travel)

      expect(sheetHeight()).toBeCloseTo(half, 0)
    })
  })

  describe('a detail or a draft', () => {
    it('takes the sheet to full', () => {
      const view = renderSheet()
      expect(sheetHeight()).toBeCloseTo((HALF_VH / 100) * 800, 0)

      view.rerender(
        <BottomSheet forceFull searchCard={<div />} chips={null}>
          <div data-testid="face">detail</div>
        </BottomSheet>,
      )

      expect(sheetHeight()).toBeCloseTo((FULL_VH / 100) * 800, 0)
    })

    it('returns to the detent the sheet was at before, not to full', () => {
      const view = renderSheet()
      fireEvent.keyDown(grabber(), { key: 'ArrowDown' })
      expect(sheetHeight()).toBeCloseTo(PEEK, 0)

      view.rerender(
        <BottomSheet forceFull searchCard={<div />} chips={null}>
          <div>detail</div>
        </BottomSheet>,
      )
      expect(sheetHeight()).toBeCloseTo((FULL_VH / 100) * 800, 0)

      view.rerender(
        <BottomSheet forceFull={false} searchCard={<div />} chips={<div />}>
          <div>list</div>
        </BottomSheet>,
      )

      expect(sheetHeight()).toBeCloseTo(PEEK, 0)
    })

    it('suspends the detents while it is open', () => {
      renderSheet({ forceFull: true })
      const full = (FULL_VH / 100) * 800

      fireEvent.keyDown(grabber(), { key: 'ArrowDown' })
      drag(400, 600)

      expect(sheetHeight()).toBeCloseTo(full, 0)
    })
  })

  it('publishes its current height for the map controls to sit above', () => {
    renderSheet()

    const published = document.documentElement.style.getPropertyValue('--sheet-current')
    expect(parseFloat(published)).toBeCloseTo((HALF_VH / 100) * 800, 0)

    fireEvent.keyDown(grabber(), { key: 'ArrowDown' })
    expect(parseFloat(document.documentElement.style.getPropertyValue('--sheet-current'))).toBe(PEEK)
  })

  describe('rotation', () => {
    it('drops peek when it no longer fits in half the viewport', () => {
      // Landscape: --sheet-half resolves to 52% of 300px = 156px, barely
      // above --sheet-peek's fixed 140px. At 260px it falls below it.
      setViewportHeight(260)
      renderSheet()

      // Half is now 135px, shorter than peek's 140 — peek is dropped, so
      // ArrowDown cannot go below half.
      fireEvent.keyDown(grabber(), { key: 'ArrowDown' })

      expect(sheetHeight()).toBeCloseTo((HALF_VH / 100) * 260, 0)
      expect(document.querySelector('.bottom-sheet__detent')?.textContent).toBe('Half')
    })
  })
})
