import { useEffect, useRef, useState } from 'react'
import { formatTripDateRange, parseLocalDate, toIsoDate } from '../format/dates'
import './DateRangeCalendar.css'

/* Monday first. Derived from a known week rather than hard-coded initials,
   so the header follows the user's locale even though the column order
   does not — a locale-dependent first day would make the grid's own
   arithmetic locale-dependent too, for a week that reads the same either
   way. */
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) =>
  // 2024-01-01 was a Monday.
  new Date(2024, 0, 1 + index).toLocaleDateString(undefined, { weekday: 'narrow' }),
)

interface Month {
  year: number
  month: number
}

function monthOf(date: Date): Month {
  return { year: date.getFullYear(), month: date.getMonth() }
}

function shiftMonth({ year, month }: Month, delta: number): Month {
  // `new Date` normalises month -1 and 12 into the neighbouring year, which
  // is the whole of the year-boundary handling.
  const shifted = new Date(year, month + delta, 1)
  return monthOf(shifted)
}

function monthLabel({ year, month }: Month): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Every day drawn in the grid: the month itself, plus enough of its
    neighbours to fill whole weeks. Six rows always, so the calendar does not
    change height as the user pages through months. */
function daysFor({ year, month }: Month): Date[] {
  const first = new Date(year, month, 1)
  // getDay() is Sunday-based; this is the offset back to the Monday on or
  // before the 1st.
  const offset = (first.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + index)
    return day
  })
}

function shiftDays(iso: string, delta: number): string {
  const date = parseLocalDate(iso) ?? new Date()
  date.setDate(date.getDate() + delta)
  return toIsoDate(date)
}

interface DateRangeCalendarProps {
  start: string | null
  end: string | null
  /** Both `null` means the trip has no dates — `Clear` commits exactly
      that, rather than leaving the picker open with nothing selected. */
  onCommit: (start: string | null, end: string | null) => void
  onCancel: () => void
}

/** The trip's date range, as one calendar bounded by the panel.

    Replaces two native `<input type="date">` that could not fit side by
    side in `--panel-width` and brought the browser's own typography and
    popup into a panel built entirely from the design language. Nothing here
    has a width in pixels: the cells size from the grid, so the calendar
    fits whatever the column is. */
export function DateRangeCalendar({ start, end, onCommit, onCancel }: DateRangeCalendarProps) {
  const [pendingStart, setPendingStart] = useState<string | null>(start)
  const [pendingEnd, setPendingEnd] = useState<string | null>(end)
  const [view, setView] = useState<Month>(() => {
    const anchor = (start && parseLocalDate(start)) || new Date()
    return monthOf(anchor)
  })
  const [focused, setFocused] = useState<string>(() => start ?? toIsoDate(new Date()))
  const rootRef = useRef<HTMLDivElement | null>(null)
  const focusedCellRef = useRef<HTMLButtonElement | null>(null)
  const shouldFocusRef = useRef(false)

  // Escape and click-away both discard — consistent with every other editor
  // in `TripMetadataHeader`. A pending start is not a value.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onCancel])

  // Only moves focus when the keyboard asked for it — otherwise every
  // re-render would drag focus back into the grid and away from `Done`.
  useEffect(() => {
    if (!shouldFocusRef.current) return
    shouldFocusRef.current = false
    focusedCellRef.current?.focus()
  })

  function choose(iso: string) {
    // A complete range, or none at all, starts a new one. Otherwise this is
    // the second day: the user picked two days, not a direction, so the
    // earlier of the pair becomes the start.
    if (pendingStart === null || pendingEnd !== null) {
      setPendingStart(iso)
      setPendingEnd(null)
      return
    }
    if (iso < pendingStart) {
      setPendingEnd(pendingStart)
      setPendingStart(iso)
      return
    }
    setPendingEnd(iso)
  }

  function moveFocus(next: string) {
    shouldFocusRef.current = true
    setFocused(next)
    const date = parseLocalDate(next)
    if (date) setView(monthOf(date))
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (event.key in moves) {
      event.preventDefault()
      moveFocus(shiftDays(focused, moves[event.key]))
      return
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const date = parseLocalDate(focused) ?? new Date()
      const shifted = new Date(date)
      shifted.setMonth(date.getMonth() + (event.key === 'PageDown' ? 1 : -1))
      moveFocus(toIsoDate(shifted))
    }
  }

  const days = daysFor(view)
  // #147: recomputed per render rather than held in state — today never
  // changes mid-session in a way this component needs to react to, and a
  // session left open across midnight catches up the next time it renders,
  // same as `deriveTripStatus`'s own stance on the same question.
  const todayIso = toIsoDate(new Date())

  return (
    <div className="date-range" ref={rootRef}>
      <p className="date-range__readout">{readout(pendingStart, pendingEnd)}</p>

      <div className="date-range__nav">
        <button
          type="button"
          className="date-range__nav-button"
          aria-label="Previous month"
          onClick={() => setView((current) => shiftMonth(current, -1))}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="date-range__month">{monthLabel(view)}</span>
        <button
          type="button"
          className="date-range__nav-button"
          aria-label="Next month"
          onClick={() => setView((current) => shiftMonth(current, 1))}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="date-range__weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label, index) => (
          <span key={index} className="date-range__weekday">
            {label}
          </span>
        ))}
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div className="date-range__grid" role="grid" onKeyDown={handleGridKeyDown}>
        {days.map((day) => {
          const iso = toIsoDate(day)
          const outside = day.getMonth() !== view.month
          const isStart = iso === pendingStart
          const isEnd = iso === pendingEnd
          const inRange =
            pendingStart !== null && pendingEnd !== null && iso > pendingStart && iso < pendingEnd
          const isFocused = iso === focused
          const isToday = iso === todayIso
          const classes = [
            'date-range__day',
            outside ? 'date-range__day--outside' : '',
            isStart || isEnd ? 'date-range__day--end' : '',
            inRange ? 'date-range__day--in-range' : '',
            isToday ? 'date-range__day--today' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const label = day.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })

          return (
            <button
              key={iso}
              type="button"
              ref={isFocused ? focusedCellRef : undefined}
              className={classes}
              role="gridcell"
              /* The cell's identity, independent of the locale its label is
                 written in. The aria-label is for people and follows their
                 locale; this is for code that needs to name a day. */
              data-date={iso}
              // Roving tabindex — one stop for the whole grid, then arrows.
              tabIndex={isFocused ? 0 : -1}
              aria-selected={isStart || isEnd || inRange}
              aria-label={isToday ? `${label}, today` : label}
              onClick={() => {
                setFocused(iso)
                choose(iso)
              }}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      <div className="date-range__actions">
        <button type="button" className="date-range__clear" onClick={() => onCommit(null, null)}>
          Clear
        </button>
        <button
          type="button"
          className="date-range__done"
          onClick={() => onCommit(pendingStart, pendingEnd ?? pendingStart)}
        >
          Done
        </button>
      </div>
    </div>
  )
}

/** The three shapes a trip's dates take, said out loud. The pair of native
    inputs could not express the middle one at all.

    A completed range goes through `formatTripDateRange` — the same function
    the trip header and the list rows read — so the picker cannot disagree
    with what the trip will say the moment it closes. Only the half-picked
    state is formatted here, because no other surface has one. */
function readout(start: string | null, end: string | null): string {
  if (start === null) return 'no dates set'
  if (end !== null) return formatTripDateRange(start, end)
  const startDate = parseLocalDate(start)
  const startText = startDate
    ? startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : start
  return `${startText} – pick the end`
}
