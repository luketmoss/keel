// #237 AC2, #486 — the Day screen's header: a meta line (date, sunrise–sunset), the
// title row ("Today" or the weekday, the controls, the sync icon) and, under it, the
// sync status and request lines.

import type { Ref } from 'preact';
import { fullDate, metaDate, weekdayName } from '../../day/format';
import { sunLine } from '../../day/sun';
import { navigate } from '../../router/router';
import { calendarHref, monthOf } from '../../calendar/dates';
import { SunIcon } from '../shared/icons';
import type { SyncNow } from '../settings/sync-now';
import { DaySyncButton, DaySyncLines, useDaySync } from './day-sync-line';

interface DayHeaderProps {
  date: string;
  today: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  headingRef: Ref<HTMLHeadingElement>;
  todayButtonRef: Ref<HTMLButtonElement>;
  /** The shared Sync now flow (#409); its button ends the controls, its lines sit under them. */
  sync: SyncNow;
}

/** A month page: drawn in currentColor, so it takes the button's own colour. */
function CalendarIcon() {
  return (
    <svg class="day-calendar-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path
        d="M3 8.5h14M7 2.5v4M13 2.5v4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
  );
}

export function DayHeader({
  date,
  today,
  onPrevious,
  onNext,
  onToday,
  headingRef,
  todayButtonRef,
  sync,
}: DayHeaderProps) {
  const isToday = date === today;
  const sun = sunLine(date);
  const full = fullDate(date);
  const daySync = useDaySync(sync);
  return (
    <header class="day-header">
      <p class="day-meta">
        <span>{metaDate(date)}</span>
        <span class="day-meta-dot" aria-hidden="true" />
        <span class="day-meta-sun">
          <span class="day-meta-sun-icon" aria-hidden="true">
            <SunIcon />
          </span>
          <span class="sr-only">Sunrise </span>
          {sun.sunrise} – <span class="sr-only">sunset </span>
          {sun.sunset}
        </span>
      </p>
      <div class="day-header-row">
        <h1 class="day-title" tabIndex={-1} ref={headingRef}>
          {isToday ? 'Today' : weekdayName(date)}
          <span class="sr-only">, {full}</span>
        </h1>
        <div class="day-nav">
          {!isToday && (
            <button type="button" class="day-today-btn" ref={todayButtonRef} onClick={onToday}>
              Today
            </button>
          )}
          <button type="button" class="day-arrow" aria-label="Previous day" onClick={onPrevious}>
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" class="day-arrow" aria-label="Next day" onClick={onNext}>
            <span aria-hidden="true">›</span>
          </button>
          {/* #241 AC1: last, so it never moves when Today comes or goes. Pushes. */}
          <button
            type="button"
            class="day-arrow day-calendar-btn"
            data-focus-key="day-calendar"
            aria-label="Calendar"
            onClick={() => navigate(calendarHref(monthOf(date), today))}
          >
            <CalendarIcon />
          </button>
          {/* #486: last, so the arrows never move when its state changes. */}
          <DaySyncButton view={daySync} />
        </div>
      </div>
      <DaySyncLines view={daySync} />
    </header>
  );
}
