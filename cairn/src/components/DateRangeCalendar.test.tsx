import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateRangeCalendar } from './DateRangeCalendar'

/* Every assertion about "the current month" is otherwise a bet on the day
   the suite runs. Frozen mid-month so nothing straddles a boundary by
   accident — the boundary cases get their own tests. */
const TODAY = new Date(2026, 6, 15) // 15 Jul 2026

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
})

function renderCalendar(
  props: Partial<React.ComponentProps<typeof DateRangeCalendar>> = {},
) {
  const onCommit = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <DateRangeCalendar
      start={props.start ?? null}
      end={props.end ?? null}
      onCommit={props.onCommit ?? onCommit}
      onCancel={props.onCancel ?? onCancel}
    />,
  )
  return { ...view, onCommit, onCancel }
}

function grid() {
  return screen.getByRole('grid')
}

/** Picks a day by its ISO date rather than its number — two cells show "3"
    in a month whose grid spills into a neighbour — and rather than its
    accessible label, which is written in whatever locale the run has. */
function day(iso: string): HTMLButtonElement {
  const cell = grid().querySelector(`[data-date="${iso}"]`)
  if (!cell) throw new Error(`no cell for ${iso}`)
  return cell as HTMLButtonElement
}

function monthHeading() {
  return document.querySelector('.date-range__month')?.textContent
}

describe('DateRangeCalendar', () => {
  it('opens on the start date’s month with the range selected', () => {
    const { container } = renderCalendar({ start: '2023-06-12', end: '2023-06-19' })

    expect(monthHeading()).toMatch(/June 2023/)
    expect(container.querySelectorAll('.date-range__day--end')).toHaveLength(2)
    // 13th to 18th inclusive sit between the ends.
    expect(container.querySelectorAll('.date-range__day--in-range')).toHaveLength(6)
  })

  it('opens on the current month with nothing selected when the trip has no dates', () => {
    const { container } = renderCalendar()

    expect(monthHeading()).toMatch(/July 2026/)
    expect(container.querySelectorAll('.date-range__day--end')).toHaveLength(0)
    expect(container.querySelectorAll('.date-range__day--in-range')).toHaveLength(0)
    expect(screen.getByText('no dates set')).toBeDefined()
  })

  it('says the end is still to come while only the start is chosen', () => {
    renderCalendar()

    fireEvent.click(day('2026-07-12'))

    // The day itself is written in the run's locale; what matters is that
    // the readout says the range is unfinished rather than showing one.
    const readout = screen.getByText(/pick the end/)
    expect(readout.textContent).toMatch(/12/)
  })

  it('shows a committed range the way the rest of the app will', () => {
    renderCalendar({ start: '2026-08-01', end: '2026-08-05' })

    // Identical to what `formatTripDateRange` gives the header and the list
    // rows, because it is the same function.
    expect(screen.getByText('Aug 1 – 5')).toBeDefined()
  })

  it('builds the same range whichever end is picked first', () => {
    const forwards = renderCalendar()
    fireEvent.click(day('2026-07-10'))
    fireEvent.click(day('2026-07-20'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(forwards.onCommit).toHaveBeenCalledWith('2026-07-10', '2026-07-20')
    forwards.unmount()

    const backwards = renderCalendar()
    fireEvent.click(day('2026-07-20'))
    fireEvent.click(day('2026-07-10'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(backwards.onCommit).toHaveBeenCalledWith('2026-07-10', '2026-07-20')
  })

  it('treats the same day chosen twice as a single-day trip', () => {
    const { onCommit } = renderCalendar()

    fireEvent.click(day('2026-07-09'))
    fireEvent.click(day('2026-07-09'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onCommit).toHaveBeenCalledWith('2026-07-09', '2026-07-09')
  })

  it('commits a start with no end as a single day rather than half a range', () => {
    const { onCommit } = renderCalendar()

    fireEvent.click(day('2026-07-09'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onCommit).toHaveBeenCalledWith('2026-07-09', '2026-07-09')
  })

  it('Clear commits no dates at all', () => {
    const { onCommit } = renderCalendar({ start: '2023-06-12', end: '2023-06-19' })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onCommit).toHaveBeenCalledWith(null, null)
  })

  it('Escape closes without committing', () => {
    const { onCommit, onCancel } = renderCalendar({ start: '2023-06-12', end: '2023-06-19' })

    fireEvent.click(day('2023-06-01'))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('a pointer outside discards the same way, pending start and all', () => {
    const { onCommit, onCancel } = renderCalendar()

    fireEvent.click(day('2026-07-12'))
    fireEvent.pointerDown(document.body)

    expect(onCancel).toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  describe('month navigation', () => {
    it('moves one month per activation', () => {
      renderCalendar()

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      expect(monthHeading()).toMatch(/August 2026/)

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      expect(monthHeading()).toMatch(/July 2026/)
    })

    it('crosses a year boundary forwards', () => {
      renderCalendar({ start: '2026-12-05', end: '2026-12-09' })
      expect(monthHeading()).toMatch(/December 2026/)

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

      expect(monthHeading()).toMatch(/January 2027/)
    })

    it('crosses a year boundary backwards', () => {
      renderCalendar({ start: '2026-01-05', end: '2026-01-09' })
      expect(monthHeading()).toMatch(/January 2026/)

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

      expect(monthHeading()).toMatch(/December 2025/)
    })
  })

  describe('keyboard', () => {
    it('arrows move which day holds the tab stop', () => {
      const { container } = renderCalendar({ start: '2026-07-10', end: null })

      fireEvent.keyDown(grid(), { key: 'ArrowRight' })

      const tabbable = container.querySelector('.date-range__day[tabindex="0"]')
      expect(tabbable?.getAttribute('data-date')).toBe('2026-07-11')
    })

    it('arrows crossing a month edge page the view with them', () => {
      renderCalendar({ start: '2026-07-31', end: null })

      fireEvent.keyDown(grid(), { key: 'ArrowRight' })

      expect(monthHeading()).toMatch(/August 2026/)
    })

    it('PageDown and PageUp move by month', () => {
      renderCalendar()

      fireEvent.keyDown(grid(), { key: 'PageDown' })
      expect(monthHeading()).toMatch(/August 2026/)

      fireEvent.keyDown(grid(), { key: 'PageUp' })
      expect(monthHeading()).toMatch(/July 2026/)
    })

    it('keeps exactly one cell in the tab order', () => {
      const { container } = renderCalendar({ start: '2026-07-10', end: '2026-07-12' })

      const tabbable = [...container.querySelectorAll('.date-range__day')].filter(
        (cell) => cell.getAttribute('tabindex') === '0',
      )
      expect(tabbable).toHaveLength(1)
      expect(tabbable[0].getAttribute('data-date')).toBe('2026-07-10')
    })
  })

  it('keeps days from a neighbouring month selectable', () => {
    const { onCommit } = renderCalendar({ start: '2026-07-30', end: null })

    // July 2026 ends on a Friday, so the grid spills into August.
    const spill = day('2026-08-01')
    expect(spill.className).toContain('--outside')

    fireEvent.click(spill)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onCommit).toHaveBeenCalledWith('2026-07-30', '2026-08-01')
  })

  it('renders no native date input', () => {
    const { container } = renderCalendar()

    expect(container.querySelector('input[type="date"]')).toBeNull()
  })

  // #147: today's cell is visually distinct — a dot, not a ring (which
  // would collide with the global focus outline) or bold (already the
  // end-of-range treatment) — and stays marked through every combination
  // the grid can put it in.
  describe('today (#147)', () => {
    it('marks today, and only today, unselected', () => {
      const { container } = renderCalendar()

      expect(day('2026-07-15').className).toContain('date-range__day--today')
      expect(day('2026-07-14').className).not.toContain('date-range__day--today')
      expect(container.querySelectorAll('.date-range__day--today')).toHaveLength(1)
    })

    it('names today in the cell’s accessible label', () => {
      renderCalendar()

      expect(day('2026-07-15').getAttribute('aria-label')).toMatch(/, today$/)
      expect(day('2026-07-14').getAttribute('aria-label')).not.toMatch(/today/)
    })

    it('stays marked when today is a range end', () => {
      renderCalendar({ start: '2026-07-10', end: '2026-07-15' })

      const cell = day('2026-07-15')
      expect(cell.className).toContain('date-range__day--today')
      expect(cell.className).toContain('date-range__day--end')
    })

    it('stays marked when today falls inside a range', () => {
      renderCalendar({ start: '2026-07-10', end: '2026-07-20' })

      const cell = day('2026-07-15')
      expect(cell.className).toContain('date-range__day--today')
      expect(cell.className).toContain('date-range__day--in-range')
    })

    it('stays marked while focused', () => {
      const { container } = renderCalendar({ start: '2026-07-14', end: null })

      fireEvent.keyDown(grid(), { key: 'ArrowRight' })

      const tabbable = container.querySelector('.date-range__day[tabindex="0"]')
      expect(tabbable?.getAttribute('data-date')).toBe('2026-07-15')
      expect(tabbable?.className).toContain('date-range__day--today')
    })

    it('stays marked, and dims with the rest of the cell, when today lands in a neighbouring month', () => {
      // A boundary date rather than the file's frozen mid-month TODAY:
      // August 2026 opens on a Saturday, so its grid's leading week spills
      // back into the last days of July — the one shape that puts "today"
      // in a neighbouring month's page after a single navigation.
      vi.setSystemTime(new Date(2026, 6, 29)) // 29 Jul 2026
      renderCalendar()

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

      const cell = day('2026-07-29')
      expect(cell.className).toContain('date-range__day--today')
      expect(cell.className).toContain('date-range__day--outside')
    })
  })
})
