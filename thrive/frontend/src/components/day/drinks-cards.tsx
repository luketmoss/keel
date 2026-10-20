// #520 - the Day screen's Water and Alcohol cards (Thrive Sip). Two cards in one
// slot, after Sleep and before the metric tiles. The data, the optimistic add and
// the rules live in `state/drinks.ts`; this draws them. Never mounts on a future
// day. "+ 4 oz" and "+ 1 drink" are offered on today only, because the API files
// a drink under the date of the moment it is logged.

import { useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../../auth/auth-context';
import type { DayState } from '../../day/dates';
import { clock12, weekdayName } from '../../day/format';
import { ask } from '../../state/confirm';
import {
  addDrink,
  drinkDays,
  drinkErrors,
  editDrinkTime,
  errorKey,
  formatOz,
  loadDrinks,
  newestFirst,
  removeDrink,
  waterGoalMl,
  type DrinkEntry,
} from '../../state/drinks';
import type { DrinkKind } from '../../api/drinks';
import { deleteDrinkCopy } from '../shared/confirm-copy';
import { useFocusHandoff } from '../focus-handoff';
import { Panel, PanelNote, PanelStatus, type DayPanelProps } from './panel';

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

function CheckIcon() {
  return (
    <svg {...SVG}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const amountText = (e: DrinkEntry) =>
  e.kind === 'water' ? `${formatOz(e.amount)} oz` : `${e.amount} ${e.amount === 1 ? 'drink' : 'drinks'}`;
const spokenAmount = (e: DrinkEntry) =>
  e.kind === 'water'
    ? `${formatOz(e.amount)} ${formatOz(e.amount) === '1' ? 'ounce' : 'ounces'} of water`
    : `${e.amount} ${e.amount === 1 ? 'alcoholic drink' : 'alcoholic drinks'}`;
const hhmm = (time: string) => time.slice(0, 5);

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
  // A deleted entry takes its button with it: focus goes to the card's heading, never `body`.
  useFocusHandoff(moreRef, (el) => el.closest('.day-panel')?.querySelector<HTMLElement>('.day-panel-title'));

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
    if (!(await ask(deleteDrinkCopy(`${time} · ${amountText(entry)}${entry.kind === 'water' ? ' of water' : ''}`))))
      return;
    await removeDrink(entry, token);
  }

  return (
    <li class={entry.pending ? 'drink-entry drink-entry-pending' : 'drink-entry'} data-entry-id={entry.id}>
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

interface CardProps {
  kind: DrinkKind;
  date: string;
  state: DayState;
  status: 'loading' | 'loaded' | 'error';
  entries: DrinkEntry[];
  token: string | null;
  onRetry: () => void;
}

function DrinkCard({ kind, date, state, status, entries, token, onRetry }: CardProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const water = kind === 'water';
  const mine = newestFirst(entries.filter((e) => e.kind === kind));
  const total = mine.reduce((sum, e) => sum + e.amount, 0);
  const goal = waterGoalMl.value;
  const error = drinkErrors.value[errorKey(date, kind)];
  const loaded = status === 'loaded';

  const totalOz = formatOz(total);
  const goalText = formatOz(goal);
  const reached = water && loaded && total >= goal;
  const spokenTotal = water
    ? `Water ${totalOz} ${totalOz === '1' ? 'ounce' : 'ounces'} of ${goalText}`
    : `Alcohol ${total} ${total === 1 ? 'drink' : 'drinks'}`;
  const pct = water && goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const icon = (
    <span class={water ? 'drink-icon drink-icon-water' : 'drink-icon drink-icon-alcohol'}>
      {water ? <DropIcon /> : <GlassIcon />}
    </span>
  );

  return (
    <Panel title={water ? 'Water' : 'Alcohol'} icon={icon} meta={state === 'today' ? 'today' : weekdayName(date)}>
      {loaded ? (
        <>
          <p class="drink-figure" aria-hidden="true">
            <span class={reached ? 'drink-total drink-total-reached' : 'drink-total'}>
              {reached && (
                <span class="drink-check">
                  <CheckIcon />
                </span>
              )}
              {water ? totalOz : total}
              <span class="drink-unit">{water ? 'oz' : total === 1 ? 'drink' : 'drinks'}</span>
            </span>
            {water && <span class="drink-goal">{`of ${goalText} oz`}</span>}
          </p>
          <p class="sr-only" role="status">
            {spokenTotal}
          </p>
          {water && (
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
        </>
      ) : (
        <PanelStatus status={status === 'error' ? 'error' : 'loading'} what="your drinks" onRetry={onRetry} />
      )}
      {state === 'today' ? (
        <button
          type="button"
          class="btn btn-primary drink-add"
          disabled={!loaded}
          aria-label={water ? 'Add 4 ounces of water' : 'Add one alcoholic drink'}
          onClick={() => {
            if (token) void addDrink(kind, token);
          }}
        >
          {water ? '+ 4 oz' : '+ 1 drink'}
        </button>
      ) : (
        loaded && <PanelNote>Drinks can only be added today.</PanelNote>
      )}
      {error && (
        <p class="drink-error" role="alert">
          {error}
        </p>
      )}
      {loaded &&
        (mine.length === 0 ? (
          <PanelNote>Nothing logged yet.</PanelNote>
        ) : (
          <ul class="drink-list" aria-label={`${water ? 'Water' : 'Alcohol'} entries`}>
            {mine.map((e) => (
              <Entry
                key={e.id}
                entry={e}
                token={token}
                open={openId === e.id}
                onToggle={(open) => setOpenId(open ? e.id : null)}
              />
            ))}
          </ul>
        ))}
    </Panel>
  );
}

export function DrinkCards({ date, state }: DayPanelProps) {
  const { token } = useAuth();
  useEffect(() => {
    if (token) void loadDrinks(date, token);
  }, [date, token]);

  const day = drinkDays.value[date];
  const status = day?.status ?? 'loading';
  const entries = day?.entries ?? [];
  const retry = () => {
    if (token) void loadDrinks(date, token);
  };
  return (
    <>
      <DrinkCard
        kind="water"
        date={date}
        state={state}
        status={status}
        entries={entries}
        token={token}
        onRetry={retry}
      />
      <DrinkCard
        kind="alcohol"
        date={date}
        state={state}
        status={status}
        entries={entries}
        token={token}
        onRetry={retry}
      />
    </>
  );
}
