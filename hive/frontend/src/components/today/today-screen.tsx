// Today (#624): what is due across every board, by day, acted on in place.
// The numbers and lists come from `todayView` in board-store; this file only draws them.
import { useAuth } from '../../auth/auth-context';
import {
  accessibleBoards,
  todayView,
  todaySelectedDay,
  todayWeekStart,
  selectTodayDay,
  shiftTodayWeek,
  selectItem,
  openDetailWithTitleEdit,
  showCreateModal,
  showCreateBoardModal,
  createModalInitialDueDate,
} from '../../state/board-store';
import type { TodayRow } from '../../state/board-store';
import { completeItem, reopenItem, moveItemToToday } from '../../state/actions-today';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  WarningIcon,
} from './today-icons';
import { PlusIcon } from '../shell/nav-icons';
import { dayLong, dayShort, parseDay, weekdayLetter, weekdayShort, whenLabel } from './today-format';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function openItem(e: MouseEvent, id: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openDetailWithTitleEdit.value = false;
  selectItem(id);
}

function itemHref(id: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('item', id);
  return url.toString();
}

function rowMeta(row: TodayRow, extra?: string): string {
  const parts = [row.board.name];
  if (row.parentTitle) parts.push(`in ${row.parentTitle}`);
  if (extra) parts.push(extra);
  return parts.join(' · ');
}

export function openCreateForToday() {
  createModalInitialDueDate.value = todaySelectedDay.value;
  showCreateModal.value = true;
}

export function TodayScreen() {
  const { token, user } = useAuth();
  const actor = user?.name || 'web';
  const v = todayView.value;
  const boardCount = accessibleBoards.value.length;
  const isToday = v.selected === v.today;
  const dayName = isToday ? 'today' : dayShort(v.selected);

  const total = v.dueOpenCount + v.dueDoneCount;
  const allDone = total > 0 && v.dueOpenCount === 0;
  const fraction = total === 0 ? 0 : (v.dueDoneCount / total) * 100;

  const check = (row: TodayRow) => {
    if (!token) return;
    if (row.done) reopenItem(row.item.id, actor, token);
    else completeItem(row.item.id, actor, token);
  };

  const emptyDue = !v.anyDated
    ? 'Nothing has a due date yet. Dates you add appear here.'
    : `Nothing due ${isToday ? 'today' : dayLong(v.selected)}.`;

  return (
    <div class="today-screen" data-testid="today-screen">
      <header class="today-header">
        <p class="today-subline" data-testid="today-subline">
          {dayLong(v.selected)} {'\u00B7'} {plural(boardCount, 'board')}
        </p>
        <div class="today-title-row">
          <h1 class="today-title" data-testid="today-title">
            {isToday ? (
              'Today'
            ) : (
              <>
                <span class="today-title-short">{dayShort(v.selected)}</span>
                <span class="today-title-long">{dayLong(v.selected)}</span>
              </>
            )}
          </h1>
          <div class="today-header-actions">
            <button type="button" class="today-round-btn" aria-label="Previous week" onClick={() => shiftTodayWeek(-1)}>
              <ChevronLeftIcon />
            </button>
            <button type="button" class="today-round-btn" aria-label="Next week" onClick={() => shiftTodayWeek(1)}>
              <ChevronRightIcon />
            </button>
            {boardCount > 0 && (
              <button type="button" class="btn btn-primary today-new-btn" onClick={openCreateForToday}>
                New item
              </button>
            )}
          </div>
        </div>
      </header>

      <nav class="today-strip" aria-label="Week" data-testid="today-strip">
        {v.days.map((day) => {
          const due = day.open + day.done;
          const selected = day.date === v.selected;
          const isTodayCell = day.date === v.today;
          const dots = [
            ...Array.from({ length: day.open }, () => 'open'),
            ...Array.from({ length: day.done }, () => 'done'),
          ].slice(0, 3);
          return (
            <button
              key={day.date}
              type="button"
              class={`today-day${selected ? ' today-day-selected' : ''}${isTodayCell ? ' today-day-today' : ''}`}
              aria-pressed={selected ? 'true' : 'false'}
              aria-label={`${dayLong(day.date)}, ${due === 0 ? 'nothing due' : `${due} due`}`}
              onClick={() => selectTodayDay(day.date)}
              data-testid={`today-day-${day.date}`}
            >
              <span class="today-day-letter today-day-letter-phone" aria-hidden="true">
                {weekdayLetter(day.date)}
              </span>
              <span class="today-day-letter today-day-letter-wide" aria-hidden="true">
                {weekdayShort(day.date)}
              </span>
              <span class="today-day-num" aria-hidden="true">
                {parseDay(day.date).getDate()}
              </span>
              <span class="today-dots" aria-hidden="true">
                {dots.map((kind, i) => (
                  <span key={i} class={`today-dot today-dot-${kind}`} />
                ))}
              </span>
              <span class="today-day-words" aria-hidden="true">
                {due === 0 ? 'nothing due' : day.open === 0 ? 'all done' : `${day.open} open`}
              </span>
            </button>
          );
        })}
      </nav>

      <section class="today-glance" aria-label="At a glance" data-testid="today-glance">
        <div class="today-glance-side">
          <span class="today-glance-icon today-glance-icon-danger">
            <WarningIcon />
          </span>
          <span
            class={`today-glance-figure${v.overdue.length > 0 ? ' today-glance-figure-danger' : ''}`}
            data-testid="today-overdue-count"
          >
            {v.overdue.length}
          </span>
          <span class="today-glance-word">overdue</span>
        </div>
        <div class="today-ring" data-testid="today-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle class="today-ring-track" cx="50" cy="50" r="44" />
            {fraction > 0 && (
              <circle
                class="today-ring-arc"
                cx="50"
                cy="50"
                r="44"
                pathLength="100"
                stroke-dasharray={`${fraction} 100`}
                data-testid="today-ring-arc"
              />
            )}
          </svg>
          <div class="today-ring-text">
            {total === 0 ? (
              <>
                <span class="today-ring-label" data-testid="today-ring-label">
                  Nothing due
                </span>
                <span class="today-ring-sub">{dayName}</span>
              </>
            ) : allDone ? (
              <>
                <span class="today-ring-check" data-testid="today-ring-check">
                  <CheckIcon />
                </span>
                <span class="today-ring-label" data-testid="today-ring-label">
                  All done
                </span>
                <span class="today-ring-sub">
                  {v.dueDoneCount} of {total} done
                </span>
              </>
            ) : (
              <>
                <span class="today-ring-number" data-testid="today-left-count">
                  {v.dueOpenCount}
                </span>
                <span class="today-ring-label" data-testid="today-ring-label">
                  left {dayName}
                </span>
                <span class="today-ring-sub">
                  {v.dueDoneCount} of {total} done
                </span>
              </>
            )}
          </div>
        </div>
        <div class="today-glance-side">
          <span class="today-glance-icon today-glance-icon-primary">
            <ClockIcon />
          </span>
          <span class="today-glance-figure" data-testid="today-more-count">
            {v.moreThisWeek}
          </span>
          <span class="today-glance-word">more this week</span>
        </div>
      </section>

      {boardCount === 0 ? (
        <div class="today-empty" data-testid="today-no-boards">
          <p>No boards yet.</p>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              showCreateBoardModal.value = true;
            }}
          >
            New board
          </button>
        </div>
      ) : (
        <div class="today-columns">
          <div class="today-col today-col-main">
            {v.overdue.length > 0 && (
              <section class="today-card" aria-labelledby="today-overdue-h" data-testid="today-overdue">
                <div class="today-card-head">
                  <span class="today-card-icon today-card-icon-danger">
                    <WarningIcon />
                  </span>
                  <h2 id="today-overdue-h">Overdue</h2>
                  <span class="today-card-meta">{plural(v.overdue.length, 'item')}</span>
                </div>
                {v.overdue.map((row) => (
                  <div key={row.item.id} class="today-overdue-item" data-testid={`today-overdue-${row.item.id}`}>
                    <div class="today-overdue-top">
                      <div class="today-overdue-date" aria-hidden="true">
                        <span class="today-overdue-wd">{weekdayShort(row.item.due_date)}</span>
                        <span class="today-overdue-day">{parseDay(row.item.due_date).getDate()}</span>
                      </div>
                      <div class="today-row-text">
                        <a
                          class="today-row-title"
                          href={itemHref(row.item.id)}
                          onClick={(e) => openItem(e as MouseEvent, row.item.id)}
                        >
                          {row.item.title}
                        </a>
                        <span class="today-row-meta">{rowMeta(row)}</span>
                      </div>
                      <span class="today-overdue-pill">OVERDUE</span>
                    </div>
                    <div class="today-overdue-actions">
                      <button
                        type="button"
                        class="today-action-btn"
                        onClick={() => token && moveItemToToday(row.item.id, actor, token)}
                      >
                        Move to today
                      </button>
                      {row.canComplete && (
                        <button
                          type="button"
                          class="today-action-btn"
                          onClick={() => token && completeItem(row.item.id, actor, token)}
                        >
                          <CheckIcon />
                          Mark done
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section class="today-card" aria-labelledby="today-due-h" data-testid="today-due">
              <div class="today-card-head">
                <span class="today-card-icon today-card-icon-primary">
                  <CalendarIcon />
                </span>
                <h2 id="today-due-h">{isToday ? 'Due today' : `Due ${dayShort(v.selected)}`}</h2>
                {total > 0 && (
                  <span class="today-card-meta">
                    {v.dueDoneCount} done {'·'} {v.dueOpenCount} open
                  </span>
                )}
              </div>
              {v.due.length === 0 ? (
                <p class="today-card-empty" data-testid="today-due-empty">
                  {emptyDue}
                </p>
              ) : (
                <ul class="today-rows">
                  {v.due.map((row) => (
                    <li key={row.item.id} class="today-row" data-testid={`today-due-${row.item.id}`}>
                      {row.done || row.canComplete ? (
                        <button
                          type="button"
                          class="today-check"
                          aria-pressed={row.done ? 'true' : 'false'}
                          aria-label={`${row.done ? 'Mark not done' : 'Mark done'}: ${row.item.title}`}
                          onClick={() => check(row)}
                        >
                          <span class={`today-check-circle${row.done ? ' today-check-circle-done' : ''}`}>
                            {row.done && <CheckIcon />}
                          </span>
                        </button>
                      ) : (
                        <span class="today-check-spacer" aria-hidden="true" />
                      )}
                      <div class="today-row-text">
                        <a
                          class={`today-row-title${row.done ? ' today-row-title-done' : ''}`}
                          href={itemHref(row.item.id)}
                          onClick={(e) => openItem(e as MouseEvent, row.item.id)}
                        >
                          {row.item.title}
                        </a>
                        <span class="today-row-meta">{rowMeta(row)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div class="today-col today-col-side">
            {v.inProgress.length > 0 && (
              <section class="today-card" aria-labelledby="today-progress-h" data-testid="today-in-progress">
                <div class="today-card-head">
                  <span class="today-card-icon today-card-icon-primary">
                    <ArrowRightIcon />
                  </span>
                  <h2 id="today-progress-h">In progress</h2>
                  <span class="today-card-meta">
                    {v.inProgress.length} started {'·'} due later
                  </span>
                </div>
                <ul class="today-rows">
                  {v.inProgress.slice(0, 5).map((row) => (
                    <li key={row.item.id} class="today-row" data-testid={`today-progress-${row.item.id}`}>
                      <div class="today-row-text">
                        <a
                          class="today-row-title"
                          href={itemHref(row.item.id)}
                          onClick={(e) => openItem(e as MouseEvent, row.item.id)}
                        >
                          {row.item.title}
                        </a>
                        <span class="today-row-meta">
                          {rowMeta(
                            row,
                            `due ${parseDay(row.item.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section class="today-upnext" aria-labelledby="today-next-h" data-testid="today-up-next">
              <div class="today-upnext-head">
                <h2 id="today-next-h">Up next</h2>
                <span class="today-card-meta">
                  {v.upNext.length > 0 ? `${v.upNext.length} coming up` : 'Nothing dated after today'}
                </span>
              </div>
              {v.upNext.length > 0 && (
                <ul class="today-upnext-list">
                  {v.upNext.map((row, i) => {
                    const when = whenLabel(row.item.due_date, v.today);
                    const showWhen = i === 0 || whenLabel(v.upNext[i - 1].item.due_date, v.today) !== when;
                    return (
                      <li key={row.item.id} class="today-upnext-item" data-testid={`today-next-${row.item.id}`}>
                        <span class={`today-upnext-when${showWhen ? '' : ' today-upnext-when-repeat'}`}>{when}</span>
                        <a
                          class="today-row-title"
                          href={itemHref(row.item.id)}
                          onClick={(e) => openItem(e as MouseEvent, row.item.id)}
                        >
                          {row.item.title}
                        </a>
                        <span class="today-row-meta">{row.board.name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {boardCount > 0 && (
        <button type="button" class="fab today-fab" aria-label="New item" onClick={openCreateForToday}>
          <PlusIcon />
        </button>
      )}
    </div>
  );
}
