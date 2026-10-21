// #520, #551 - the Day screen's Water and Alcohol tiles (Thrive Sip). Two
// half-width tiles in one slot, after Sleep and before the metric tiles, with a
// collapsed log row under them. The data, the optimistic add and the rules live
// in `state/drinks.ts`; this draws them. Never mounts on a future day. "+ 4 oz"
// and "+ 1" are offered on today only, because the API files a drink under the
// date of the moment it is logged. A tile opens Trends' Intake group (#504).

import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import type { DayState } from '../../day/dates';
import { clock12, weekdayShort } from '../../day/format';
import { ask } from '../../state/confirm';
import {
  addDrink,
  drinkDays,
  drinkErrors,
  drinkHistory,
  editDrinkTime,
  errorKey,
  formatOz,
  loadDrinkHistory,
  loadDrinks,
  newestFirst,
  removeDrink,
  waterGoalMl,
  type DrinkEntry,
} from '../../state/drinks';
import type { DrinkKind } from '../../api/drinks';
import { deleteDrinkCopy } from '../shared/confirm-copy';
import { useFocusHandoff } from '../focus-handoff';
import { Panel, PanelStatus, type DayPanelProps } from './panel';
import { CardChevron, CardLink, cardLinkName } from './card-link';
import { barHeight, drinkWeek, weekLabel } from './drink-week';

const SVG = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  'aria-hidden': 'true' as const,
  focusable: 'false' as const,
};

// Drawn in the house style (#405) and kept here, as the shared icon set is counted by its tests.
function DropIcon() {
  return (
    <svg {...SVG}>
      <path d="M12 3c3.5 4.2 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7.2 12 3z" />
    </svg>
  );
}

function GlassIcon() {
  return (
    <svg {...SVG}>
      <path d="M6 4h12l-1.2 8.2a4.8 4.8 0 0 1-9.6 0z" />
      <path d="M12 16.5V21M8.5 21h7" />
    </svg>
  );
}

const amountText = (e: DrinkEntry) =>
  e.kind === 'water' ? `${formatOz(e.amount)} oz` : `${e.amount} ${e.amount === 1 ? 'drink' : 'drinks'}`;
const hhmm = (time: string) => time.slice(0, 5);
const countText = (n: number) => `${n} ${n === 1 ? 'drink' : 'drinks'}`;

function Entry({
  entry,
  token,
  open,
  onToggle,
}: {
  entry: DrinkEntry;
  token: string | null;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const time = clock12(entry.time);
  const water = entry.kind === 'water';
  // A deleted entry takes its button with it: focus goes to the log row, or to the first tile's heading
  // when that was the last entry, never `body`.
  useFocusHandoff(moreRef, (el) => {
    const slot = el.closest('.drinks');
    return (
      slot?.querySelector<HTMLElement>('.drinks-log-toggle') ?? slot?.querySelector<HTMLElement>('.day-panel-title')
    );
  });

  async function save() {
    if (!token || editing === null || editing === '' || busy) return;
    setBusy(true);
    const done = await editDrinkTime(entry, editing === hhmm(entry.time) ? entry.time : `${editing}:00`, token);
    setBusy(false);
    if (done) {
      setEditing(null);
      onToggle(false);
    }
  }

  async function remove() {
    if (!token) return;
    onToggle(false);
    if (!(await ask(deleteDrinkCopy(`${time} · ${amountText(entry)}${water ? ' of water' : ''}`)))) return;
    await removeDrink(entry, token);
  }

  return (
    <li class={entry.pending ? 'drink-entry drink-entry-pending' : 'drink-entry'} data-entry-id={entry.id}>
      <span class={water ? 'drink-entry-icon drink-icon-water' : 'drink-entry-icon drink-icon-alcohol'}>
        {water ? <DropIcon /> : <GlassIcon />}
      </span>
      <span class="drink-entry-time">{time}</span>
      <span class="drink-entry-amount">{amountText(entry)}</span>
      {entry.pending ? (
        <span class="drink-entry-saving">Saving…</span>
      ) : (
        <button
          type="button"
          ref={moreRef}
          class="btn-icon drink-more"
          aria-label={`More actions for the ${time} ${entry.kind} entry`}
          aria-expanded={open}
          onClick={() => {
            setEditing(null);
            onToggle(!open);
          }}
        >
          <span aria-hidden="true">⋯</span>
        </button>
      )}
      {open && !entry.pending && editing === null && (
        <div class="drink-entry-tools">
          <button type="button" class="btn btn-secondary" onClick={() => setEditing(hhmm(entry.time))}>
            Edit time
          </button>
          <button type="button" class="btn btn-secondary" onClick={() => void remove()}>
            Delete
          </button>
        </div>
      )}
      {open && !entry.pending && editing !== null && (
        <div class="drink-entry-tools">
          <input
            type="time"
            class="form-input drink-time-input"
            aria-label={`Time for the ${time} ${entry.kind} entry`}
            value={editing}
            required
            onInput={(e) => setEditing((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="button" class="btn btn-primary" onClick={() => void save()}>
            Save
          </button>
          <button type="button" class="btn btn-secondary" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

interface TileProps {
  kind: DrinkKind;
  date: string;
  state: DayState;
  loaded: boolean;
  entries: DrinkEntry[];
  token: string | null;
}

/** One half-width tile: the figure, the bar toward the goal (water), the last 7 days, and the add button. */
function DrinkTile({ kind, date, state, loaded, entries, token }: TileProps) {
  const water = kind === 'water';
  const total = entries.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.amount, 0);
  const goal = waterGoalMl.value;
  const error = drinkErrors.value[errorKey(date, kind)];
  const totalOz = formatOz(total);
  const goalText = formatOz(goal);
  const reached = water && loaded && total >= goal;
  const pct = water && goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const unit = water ? 'oz' : total === 1 ? 'drink' : 'drinks';
  const shown = loaded ? `${water ? totalOz : total} ${unit}` : null;
  const spokenTotal = water
    ? `Water ${totalOz} ${totalOz === '1' ? 'ounce' : 'ounces'} of ${goalText}`
    : `Alcohol ${total} ${total === 1 ? 'drink' : 'drinks'}`;

  const days = drinkWeek(kind, date, drinkHistory.value, drinkDays.value[date]);
  const title = water ? 'Water' : 'Alcohol';

  const icon = (
    <span class={water ? 'drink-icon drink-icon-water' : 'drink-icon drink-icon-alcohol'}>
      {water ? <DropIcon /> : <GlassIcon />}
    </span>
  );

  return (
    <div class={`drink-tile drink-tile-${kind}`} data-drink={kind}>
      <Panel title={title} icon={icon} action={<CardChevron />} linked>
        <p class="drink-figure" aria-hidden="true">
          {loaded ? (
            <>
              <span class={reached ? 'drink-total drink-total-reached' : 'drink-total'}>
                {water ? totalOz : total}
                <span class="drink-unit">{unit}</span>
              </span>
              {water && <span class="drink-goal">{`of ${goalText}`}</span>}
            </>
          ) : (
            <span class="drink-total drink-total-blank">—</span>
          )}
        </p>
        {loaded && (
          <p class="sr-only" role="status">
            {spokenTotal}
          </p>
        )}
        {loaded && water && (
          <div
            class="drink-bar"
            role="progressbar"
            aria-label="Water today"
            aria-valuemin={0}
            aria-valuemax={Number(goalText)}
            aria-valuenow={Math.min(Number(totalOz), Number(goalText))}
            aria-valuetext={spokenTotal}
          >
            <span class="drink-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        {loaded && (
          <div class="drink-week" role="img" aria-label={weekLabel(kind, days)}>
            {water && <span class="drink-week-goal" />}
            {days.map((v, i) => (
              <span key={i} class="drink-week-slot">
                {v !== null && (
                  <span
                    class={i === days.length - 1 ? 'drink-week-bar drink-week-bar-viewed' : 'drink-week-bar'}
                    style={{ height: `${Math.round(barHeight(kind, v, goal) * 1000) / 10}%` }}
                  />
                )}
              </span>
            ))}
          </div>
        )}
        {state === 'today' && (
          <button
            type="button"
            class="btn btn-secondary btn-sm drink-add"
            disabled={!loaded}
            aria-label={water ? 'Add 4 ounces of water' : 'Add one alcoholic drink'}
            onClick={() => {
              if (token) void addDrink(kind, token);
            }}
          >
            {water ? '+ 4 oz' : '+ 1'}
          </button>
        )}
        {error && (
          <p class="drink-error" role="alert">
            {error}
          </p>
        )}
        {loaded && (
          <CardLink group="intake" date={date} name={cardLinkName(title, shown)} focusKey={`day-link-${kind}`} />
        )}
      </Panel>
    </div>
  );
}

/** The collapsed log row and, opened, #520's entry list. */
function DrinkLog({
  date,
  state,
  entries,
  token,
}: {
  date: string;
  state: DayState;
  entries: DrinkEntry[];
  token: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const listId = useId();
  const list = newestFirst(entries);

  if (list.length === 0) return <p class="drinks-log-empty">Nothing logged yet.</p>;
  const label = `${state === 'today' ? "Today's" : `${weekdayShort(date)}'s`} log · ${countText(list.length)}`;
  return (
    <div class="drinks-log">
      <button
        type="button"
        class="btn-ghost drinks-log-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span>
        <span class={open ? 'drinks-log-chevron drinks-log-chevron-open' : 'drinks-log-chevron'} aria-hidden="true">
          <svg {...SVG} width={18} height={18}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <ul class="drink-list" id={listId} aria-label="Drinks logged">
          {list.map((e) => (
            <Entry
              key={e.id}
              entry={e}
              token={token}
              open={openId === e.id}
              onToggle={(o) => setOpenId(o ? e.id : null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function DrinkCards({ date, state }: DayPanelProps) {
  const { token } = useAuth();
  useEffect(() => {
    if (token) void loadDrinks(date, token);
  }, [date, token]);
  // The last 7 days' bars read the history Trends reads, once for the screen.
  useEffect(() => {
    if (token) void loadDrinkHistory(token);
  }, [token]);

  const day = drinkDays.value[date];
  const status = day?.status ?? 'loading';
  const entries = day?.entries ?? [];
  const retry = () => {
    if (token) void loadDrinks(date, token);
  };

  if (status === 'error') {
    return (
      <div class="drinks">
        <Panel title="Water and alcohol">
          <PanelStatus status="error" what="your drinks" onRetry={retry} />
        </Panel>
      </div>
    );
  }
  const loaded = status === 'loaded';
  return (
    <div class="drinks">
      <div class="drinks-grid">
        <DrinkTile kind="water" date={date} state={state} loaded={loaded} entries={entries} token={token} />
        <DrinkTile kind="alcohol" date={date} state={state} loaded={loaded} entries={entries} token={token} />
      </div>
      {loaded && <DrinkLog date={date} state={state} entries={entries} token={token} />}
    </div>
  );
}
