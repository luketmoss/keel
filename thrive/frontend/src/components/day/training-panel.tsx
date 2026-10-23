// #238 — the Day screen's Training panel: what was done, what is planned and,
// on a past day, what was planned and never happened. Reads the `workouts` and
// `sets` signals the app already holds; it makes no read of its own.
//
// #347: today also carries every planned workout whose date has passed, above
// today's own, each with Move to today, Reschedule and Start now. That is a
// separate step here (`overdueForToday`), never part of `trainingOrder`, which
// the Calendar's day summary shares.
//
// #489 redraws the cards (a sets ring or type icon on a done card; a date block
// and a dashed outline on a planned one), adds one Up next card on today and,
// under the cards, the 7-day training load from `dailyHealth`.

import type { ComponentType } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { workouts, sets, activeWorkoutId, showToast, dailyHealth } from '../../state/store';
import { rescheduleWorkout, startPlannedWorkout } from '../../state/actions';
import { useAuth } from '../../auth/auth-context';
import { navigate } from '../../router/router';
import type { WorkoutType, WorkoutWithRow } from '../../api/types';
import { formatDistance, parse } from '../../api/units';
import { formatDuration, formatEstimate } from '../../api/duration';
import { isSetLogged } from '../../api/set-logged';
import { addDays } from '../../day/dates';
import { dayOfMonth, weekdayMonthDay, weekdayName } from '../../day/format';
import { formatPlannedDate } from '../activities/activities-helpers';
import { DumbbellIcon, StretchIcon, BikeIcon, MountainIcon, RunIcon, FootprintsIcon } from '../shared/icons';
import { Panel, PanelNote, type DayPanelProps } from './panel';
import { ChoiceSheet, type StartMode } from '../workout/choice-sheet';

const isPlanned = (w: WorkoutWithRow) => w.status === 'planned';

/** By `time` ascending; no time last. Stable, so equal times keep sheet order. */
function byTime(list: readonly WorkoutWithRow[]): WorkoutWithRow[] {
  return list
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const ta = a.w.time;
      const tb = b.w.time;
      if (ta && tb) return ta < tb ? -1 : ta > tb ? 1 : a.i - b.i;
      if (ta) return -1;
      if (tb) return 1;
      return a.i - b.i;
    })
    .map((x) => x.w);
}

export type TrainingKind = 'done' | 'planned' | 'overdue';

/**
 * A day's workouts in the panel's order (#238), shared with the Calendar's
 * day summary (#241): a past day reads what happened first, then what was
 * planned and missed; today and later read what is planned, then what is done.
 * Done ones are by time, planned ones in sheet order.
 */
export function trainingOrder(
  day: readonly WorkoutWithRow[],
  state: DayPanelProps['state'],
): Array<{ w: WorkoutWithRow; kind: TrainingKind }> {
  const planned = day.filter(isPlanned);
  const done = byTime(day.filter((w) => !isPlanned(w)));
  return state === 'past'
    ? [...done.map((w) => ({ w, kind: 'done' as const })), ...planned.map((w) => ({ w, kind: 'overdue' as const }))]
    : [...planned.map((w) => ({ w, kind: 'planned' as const })), ...done.map((w) => ({ w, kind: 'done' as const }))];
}

/**
 * The planned workouts carried onto today (#347 AC1): `status` `planned` and a
 * date before `today`, oldest date first, equal dates in sheet order. Pure; a
 * separate step from `trainingOrder`, which it never changes.
 */
export function overdueForToday(all: readonly WorkoutWithRow[], today: string): WorkoutWithRow[] {
  return all
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => isPlanned(w) && !!w.date && w.date < today)
    .sort((a, b) => (a.w.date < b.w.date ? -1 : a.w.date > b.w.date ? 1 : a.i - b.i))
    .map((x) => x.w);
}

/**
 * Up next (#489): the first planned workout dated after `today`, by date then
 * sheet order, or none. Pure; like `overdueForToday`, never part of `trainingOrder`.
 */
export function upNextFor(all: readonly WorkoutWithRow[], today: string): WorkoutWithRow | undefined {
  let best: WorkoutWithRow | undefined;
  for (const w of all) {
    if (isPlanned(w) && !!w.date && w.date > today && (!best || w.date < best.date)) best = w;
  }
  return best;
}

/** A workout row, a link to `href` when there is an id to open. */
function CardShell({
  id,
  href,
  className,
  label,
  children,
}: {
  id: string;
  href: string;
  className: string;
  label?: string;
  children: preact.ComponentChildren;
}) {
  return id ? (
    <a class={className} href={href} data-workout-id={id} aria-label={label}>
      {children}
    </a>
  ) : (
    <div class={className}>{children}</div>
  );
}

/** Each type's #405 icon, as the type picker draws it. */
const TYPE_ICONS: Record<WorkoutType, ComponentType> = {
  weight: DumbbellIcon,
  stretch: StretchIcon,
  bike: BikeIcon,
  hike: MountainIcon,
  run: RunIcon,
  walk: FootprintsIcon,
};

/** The type's icon on a 52px `--color-primary-light` circle, in a done card's ring place. */
function TypeMark({ type }: { type: WorkoutType }) {
  const Icon = TYPE_ICONS[type] ?? DumbbellIcon;
  return (
    <span class="training-mark training-type-mark" aria-hidden="true">
      <Icon />
    </span>
  );
}

/** Circumference units: the arcs use `pathLength`, so a share is a dash length. */
const RING_R = 23;

/** Logged / planned sets as a ring from 12 o'clock, the logged count inside. Decoration: the meta line says it. */
function SetsRing({ logged, total }: { logged: number; total: number }) {
  const share = total > 0 ? Math.min(100, (logged / total) * 100) : 0;
  return (
    <span class="training-mark training-ring" aria-hidden="true">
      <svg viewBox="0 0 52 52" width="52" height="52" focusable="false">
        <circle class="training-ring-track" cx="26" cy="26" r={RING_R} fill="none" stroke-width="5" />
        {share > 0 && (
          <circle
            class="training-ring-value"
            cx="26"
            cy="26"
            r={RING_R}
            fill="none"
            stroke-width="5"
            stroke-linecap="round"
            pathLength="100"
            stroke-dasharray={`${share} 100`}
            transform="rotate(-90 26 26)"
          />
        )}
      </svg>
      <span class="training-ring-count">{logged}</span>
    </span>
  );
}

function DoneCard({ w }: { w: WorkoutWithRow }) {
  const duration = (w.moving_seconds && formatDuration(w.moving_seconds)) || formatDuration(w.elapsed_seconds);
  const own = w.type === 'weight' ? sets.value.filter((s) => s.workout_id === w.id) : [];
  const logged = own.filter((s) => isSetLogged(s, false)).length;
  const distance = w.type === 'weight' ? '' : formatDistance(w.distance_m);
  // #362: an in-progress workout goes straight back into the tracker, as the
  // Activities In Progress card does, with the same accessible name.
  const active = w.status === 'active';
  const hasMeta = !!duration || own.length > 0 || !!distance;
  return (
    <CardShell
      id={w.id}
      href={active ? `#/workout/${w.id}` : `#/history/${w.id}`}
      label={active ? `${w.name || w.type}, in progress. Resume workout.` : undefined}
      className="workout-card training-card training-done"
    >
      {own.length > 0 ? <SetsRing logged={logged} total={own.length} /> : <TypeMark type={w.type} />}
      <div class="workout-card-center">
        <span class="workout-name">{w.name || w.type}</span>
        {hasMeta && (
          <span class="workout-meta training-meta">
            {duration && <b>{duration}</b>}
            {duration && (own.length > 0 || distance) && ' · '}
            {own.length > 0 && (
              <>
                <b>{`${logged}/${own.length}`}</b> sets
              </>
            )}
            {distance && <b>{distance}</b>}
          </span>
        )}
      </div>
      <span class="workout-card-badges">
        <span class={`type-badge badge-${w.type} training-type`}>
          {w.sub_type ? `${w.type} · ${w.sub_type}` : w.type}
        </span>
        {active && <span class="type-badge badge-active">Active</span>}
        {w.effort && <span class={`workout-effort workout-effort-${w.effort.toLowerCase()}`}>{w.effort}</span>}
      </span>
    </CardShell>
  );
}

/** "Wednesday October 21": a planned card's date in its accessible name. */
const dateWords = (date: string) => weekdayMonthDay(date).replace(', ', ' ');

/**
 * A planned, overdue or Up next card (#489): a date block, the name and its
 * counts, a chevron. It opens the read-only detail view, where Start Workout
 * is (#347 AC7), not the editor.
 */
function PlannedCard({
  w,
  overdue,
  plannedFor,
  upNext = false,
  today,
  className = '',
}: {
  w: WorkoutWithRow;
  overdue: boolean;
  /** Today, on a card carried onto it: adds "Planned <formatPlannedDate>". */
  plannedFor?: string;
  /** The one Up next card (#489): "Up next" before its counts and in its name. */
  upNext?: boolean;
  /** When set and equal to the plan's date, the date block reads "Today". */
  today?: string;
  className?: string;
}) {
  let counts = '';
  if (w.type === 'weight') {
    const own = sets.value.filter((s) => s.workout_id === w.id);
    const exercises = new Set(own.map((s) => `${s.exercise_id}__${s.exercise_order}`)).size;
    if (exercises > 0 && own.length > 0) {
      counts = `${exercises} exercise${exercises === 1 ? '' : 's'} · ${own.length} set${own.length === 1 ? '' : 's'}`;
    }
  }
  const meta = [upNext && 'Up next', counts, formatEstimate(w.estimated_seconds)].filter(Boolean).join(' · ');
  const name = w.name || w.type;
  const isToday = !!w.date && w.date === today;
  const lead = upNext ? 'Up next, ' : overdue ? 'Overdue, ' : isToday ? 'Today, ' : '';
  const label = w.date ? `${lead}${dateWords(w.date)}: ${name}, planned` : `${lead}${name}, planned`;
  return (
    <CardShell
      id={w.id}
      href={`#/history/${w.id}`}
      label={label}
      className={`workout-card training-card training-planned${className}`}
    >
      <span class="training-date" aria-hidden="true">
        <span class="training-date-day">{isToday ? 'Today' : w.date ? dateDay(w.date) : ''}</span>
        <span class="training-date-num">{w.date ? dayOfMonth(w.date) : ''}</span>
      </span>
      <div class="workout-card-center">
        <span class="workout-name">{name}</span>
        {meta && <span class="workout-meta training-meta">{meta}</span>}
        {plannedFor && (
          <span class="workout-meta planned-date training-planned-for">
            {`Planned ${formatPlannedDate(w.date, plannedFor)}`}
          </span>
        )}
      </div>
      <span class="training-planned-end">
        {overdue && <span class="type-badge badge-overdue">Overdue</span>}
        <span class="training-chevron" aria-hidden="true">
          ›
        </span>
      </span>
    </CardShell>
  );
}

/** "Wed": the date block's weekday (upper-cased by CSS), and a load day's in the bars' name. */
const dateDay = (date: string) => weekdayName(date).slice(0, 3);

/** "T": a load day's letter under its bar. */
const dayLetter = (date: string) => dateDay(date).charAt(0);

const loadNum = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * The 7-day training load (#489): the sum of `training_load` over the seven
 * days ending on `date`, and a bar each, oldest left. A blank day draws an
 * empty track and counts nothing; all seven blank, or the tab not loaded, and
 * nothing is drawn. The caller never mounts it on a future day.
 */
function LoadBlock({ date, today }: { date: string; today: boolean }) {
  const tab = dailyHealth.value;
  if (tab.state !== 'loaded') return null;
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const values = days.map((d) => {
    const row = tab.rows.find((r) => r.date === d);
    return row ? parse(row.training_load) : null;
  });
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  const total = present.reduce((a, b) => a + b, 0);
  const max = Math.max(...present);
  const name =
    `Training load, ${dateDay(days[0])} to ${dateDay(days[6])}: ` +
    `${values.map((v) => (v === null ? 'no data' : loadNum(v))).join(', ')}. Total ${loadNum(total)}.`;
  return (
    <div class="training-load">
      <div class="training-load-sum">
        <span class="training-load-label">{today ? '7-day load so far' : '7-day load'}</span>
        <span class="training-load-total">{loadNum(total)}</span>
      </div>
      <div class="training-load-bars" role="img" aria-label={name}>
        {days.map((d, i) => {
          const v = values[i];
          return (
            <span key={d} class={d === date ? 'training-load-day training-load-viewed' : 'training-load-day'}>
              <span class="training-load-track">
                {v !== null && (
                  <span
                    class="training-load-bar"
                    style={{ height: `${max > 0 ? Math.max(0, (v / max) * 100) : 0}%` }}
                  />
                )}
              </span>
              <span class="training-load-letter">{dayLetter(d)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

type Busy = 'move' | 'save' | 'start' | null;

/** Where focus goes once a carried card's write has re-rendered the panel. */
interface FocusRequest {
  panel: Element | null;
  to: 'card' | 'heading';
  id: string;
}

/**
 * A planned workout carried onto today (#347 AC3–AC7, AC9): one visual unit
 * holding the card link and, below it and never inside it, the actions row or,
 * while rescheduling, the date row in its place.
 */
function OverdueCard({
  w,
  today,
  onSettled,
}: {
  w: WorkoutWithRow;
  today: string;
  onSettled: (req: FocusRequest) => void;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState<Busy>(null);
  const [editing, setEditing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const dateRef = useRef<HTMLInputElement>(null);
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  const returnToReschedule = useRef(false);
  const fieldId = useId();
  const name = w.name || w.type;

  useEffect(() => {
    if (editing) {
      dateRef.current?.focus();
    } else if (returnToReschedule.current) {
      returnToReschedule.current = false;
      rescheduleRef.current?.focus();
    }
  }, [editing]);

  const write = async (date: string, kind: 'move' | 'save', from: Element) => {
    if (!token || busy) return;
    const panel = from.closest('.day-panel');
    setBusy(kind);
    try {
      await rescheduleWorkout(w.id, date, token, today);
      // A future date leaves today's panel: focus its heading. Today, or a
      // past date (still overdue), keeps the workout here: focus its card.
      // A past date keeps this card mounted: close the row before focusing.
      setBusy(null);
      setEditing(false);
      onSettled({ panel, to: date > today ? 'heading' : 'card', id: w.id });
    } catch {
      // The action showed its toast; the card stays overdue where it was.
      setBusy(null);
    }
  };

  const start = () => {
    if (!token || busy) return;
    if (activeWorkoutId.value) {
      showToast('Finish your current workout before starting a new one', 'error');
      return;
    }
    // A weight workout asks how to run it first (#577); the plan is not touched until then.
    if (w.type === 'weight') setChoosing(true);
    else void startLogbook();
  };

  const chosen = (mode: StartMode) => {
    setChoosing(false);
    if (mode === 'lift') navigate(`/workout/${w.id}/lift`);
    else void startLogbook();
  };

  const startLogbook = async () => {
    if (!token || busy) return;
    setBusy('start');
    try {
      const id = await startPlannedWorkout(w.id, token);
      navigate(`/workout/${id}`);
    } catch {
      // Error toast shown by the action.
      setBusy(null);
    }
  };

  const closeReschedule = () => {
    returnToReschedule.current = true;
    setEditing(false);
  };

  const moveLabel = busy === 'move' ? 'Moving…' : 'Move to today';
  const startLabel = busy === 'start' ? 'Starting…' : 'Start now';
  const disabled = busy !== null;
  const canSave = !!newDate && newDate !== w.date && !disabled;

  return (
    <div class="training-overdue">
      <PlannedCard w={w} overdue plannedFor={today} className=" training-overdue-link" />
      {editing ? (
        <div class="training-overdue-row training-reschedule">
          <label class="form-label training-reschedule-label" for={fieldId}>
            New date
          </label>
          <input
            ref={dateRef}
            id={fieldId}
            class="form-input training-reschedule-input"
            type="date"
            value={newDate}
            disabled={disabled}
            onInput={(e) => setNewDate((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) closeReschedule();
              }
            }}
          />
          <div class="training-overdue-buttons">
            <button
              type="button"
              class="btn btn-secondary btn-sm training-action"
              disabled={!canSave}
              onClick={(e) => {
                if (canSave) write(newDate, newDate === today ? 'move' : 'save', e.currentTarget as Element);
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm training-action"
              disabled={disabled}
              onClick={closeReschedule}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div class="training-overdue-row training-overdue-buttons">
          <button
            type="button"
            class="btn btn-secondary btn-sm training-action"
            aria-label={`${moveLabel}: ${name}`}
            disabled={disabled}
            onClick={(e) => write(today, 'move', e.currentTarget as Element)}
          >
            {moveLabel}
          </button>
          <button
            ref={rescheduleRef}
            type="button"
            class="btn btn-secondary btn-sm training-action"
            aria-label={`Reschedule: ${name}`}
            disabled={disabled}
            onClick={() => {
              setNewDate(today);
              setEditing(true);
            }}
          >
            Reschedule
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm training-action"
            aria-label={`${startLabel}: ${name}`}
            disabled={disabled}
            onClick={start}
          >
            {startLabel}
          </button>
        </div>
      )}
      {choosing && <ChoiceSheet onContinue={chosen} onCancel={() => setChoosing(false)} />}
    </div>
  );
}

export function TrainingPanel({ date, state, today }: DayPanelProps) {
  const day = workouts.value.filter((w) => w.date === date);
  // #347: a separate step, today only; `trainingOrder` is untouched.
  const carried = state === 'today' ? overdueForToday(workouts.value, today) : [];
  const planHref = `#/workout/new?plan=${date}`;
  const canPlan = state !== 'past';
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  // After a carried card's write has re-rendered the panel: the workout's card
  // link, or the panel heading when the workout has left today.
  useEffect(() => {
    if (!focus) return;
    setFocus(null);
    const { panel, to, id } = focus;
    if (!panel || !panel.isConnected) return;
    const heading = panel.querySelector<HTMLElement>('.day-panel-title');
    const card =
      to === 'card'
        ? [...panel.querySelectorAll<HTMLElement>('a[data-workout-id]')].find((a) => a.dataset.workoutId === id)
        : undefined;
    (card ?? heading)?.focus();
  }, [focus]);

  // #489: Up next on today only; the load block on today and past days, never a future day.
  const upNext = state === 'today' ? upNextFor(workouts.value, today) : undefined;
  const after = (
    <>
      {upNext && (
        <div class="training-list">
          <PlannedCard key={`next-${upNext.id || upNext.sheetRow}`} w={upNext} overdue={false} upNext />
        </div>
      )}
      {state !== 'future' && <LoadBlock date={date} today={state === 'today'} />}
    </>
  );
  const icon = (
    <span class="training-icon">
      <DumbbellIcon />
    </span>
  );

  if (day.length === 0 && carried.length === 0) {
    return (
      <Panel title="Training" icon={icon}>
        <PanelNote>
          {state === 'past' ? 'No activities.' : state === 'today' ? 'Nothing planned today.' : 'Nothing planned.'}
        </PanelNote>
        {canPlan && (
          <a class="btn btn-secondary training-plan-btn" href={planHref}>
            Plan in Thrive
          </a>
        )}
        {after}
      </Panel>
    );
  }

  // A carried row with no id renders as an ordinary overdue card: no link, no actions (AC7).
  const overdueCards = carried.map((w) =>
    w.id ? (
      <OverdueCard key={`overdue-${w.id}`} w={w} today={today} onSettled={setFocus} />
    ) : (
      <PlannedCard key={`overdue-row${w.sheetRow}`} w={w} overdue plannedFor={today} />
    ),
  );
  const order = trainingOrder(day, state);
  const cards = order.map(({ w, kind }) => {
    const key = w.id || `row${w.sheetRow}`;
    return kind === 'done' ? (
      <DoneCard key={key} w={w} />
    ) : (
      <PlannedCard key={key} w={w} overdue={kind === 'overdue'} today={today} />
    );
  });
  // "2 done · 1 planned": what is listed above Up next, which is not counted.
  const done = order.filter((x) => x.kind === 'done').length;
  const planned = carried.length + order.length - done;
  const meta = [done > 0 && `${done} done`, planned > 0 && `${planned} planned`].filter(Boolean).join(' · ');

  return (
    <Panel
      title="Training"
      icon={icon}
      meta={meta || undefined}
      action={
        canPlan ? (
          <a class="training-plan-link" href={planHref}>
            Plan
          </a>
        ) : undefined
      }
    >
      <div class="training-list">
        {overdueCards}
        {cards}
      </div>
      {after}
    </Panel>
  );
}
