import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import type { PlanEntry, StartTripResult, Trip } from '../api/types';
import { SLOTS } from '../api/types';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';
import { Sheet } from '../ui/sheet';
import { SAVE_FAILED } from './shop-store';
import { chipDay, ingredientsLine, longDate, unmatchedCountLine } from './trip-format';

/** The through-date choices, in days after today. The default is the middle one. */
const AHEAD = [3, 5, 7];
const DEFAULT_AHEAD = 5;
/** How long the count waits after the last change before it asks again. */
export const COUNT_DELAY_MS = 300;

/** `tr_` + 8 hex, made when the sheet opens, so a double tap or a retry builds one trip. */
export function newTripId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `tr_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const mealOrder = (a: PlanEntry, b: PlanEntry) =>
  a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);

type Count = { state: 'counting' } | { state: 'failed' } | { state: 'ready'; result: StartTripResult };

/**
 * The trip setup sheet (#718): a through date, the meals to shop for, a live count from a `startTrip` dry
 * run, and Build the list. Opened from Shop's empty state and from the Plan banner.
 */
export function TripSetupSheet({
  api,
  onBuilt,
  onClose,
}: {
  api: ForageApi;
  onBuilt: (trip: Trip) => void;
  onClose: () => void;
}) {
  // Computed once: a sheet left open past midnight keeps its chips (#718's edge case).
  const [today] = useState(() => localDate());
  const [tripId] = useState(newTripId);
  const [ahead, setAhead] = useState(DEFAULT_AHEAD);
  const [meals, setMeals] = useState<PlanEntry[] | null>(null);
  const [mealsFailed, setMealsFailed] = useState(false);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<Count>({ state: 'counting' });
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState('');
  const seq = useRef(0);

  const through = addDays(today, ahead);

  async function loadMeals() {
    try {
      const out = await api.getPlan(addDays(today, 1), addDays(today, AHEAD[AHEAD.length - 1]), today);
      setMeals(out.entries.filter((e) => e.recipe_id && !e.trip_id && e.date > today).sort(mealOrder));
      setMealsFailed(false);
    } catch {
      setMeals([]);
      setMealsFailed(true);
    }
  }

  useEffect(() => {
    void loadMeals();
  }, []);

  const inRange = useMemo(() => (meals ?? []).filter((m) => m.date <= through), [meals, through]);
  const ticked = inRange.filter((m) => !unticked.has(m.id)).map((m) => m.id);
  const tickKey = ticked.join(',');

  // The count: a dry run when the meals arrive, then 300 ms after the last change. An older answer is ignored.
  useEffect(() => {
    if (meals === null) return;
    const mine = ++seq.current;
    setCount({ state: 'counting' });
    const run = async () => {
      try {
        const result = await api.startTrip({ id: tripId, through, plan_ids: ticked, today, dry_run: true });
        if (mine === seq.current) setCount({ state: 'ready', result });
      } catch {
        if (mine === seq.current) setCount({ state: 'failed' });
      }
    };
    const first = seq.current === 1;
    if (first) {
      void run();
      return;
    }
    const t = setTimeout(() => void run(), COUNT_DELAY_MS);
    return () => clearTimeout(t);
  }, [meals, through, tickKey]);

  function toggle(id: string) {
    const next = new Set(unticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setUnticked(next);
  }

  async function build() {
    if (building) return;
    setBuilding(true);
    setStatus('');
    try {
      const res = await api.startTrip({ id: tripId, through, plan_ids: ticked, today, dry_run: false });
      onBuilt(res.trip);
    } catch (err) {
      setBuilding(false);
      if (err instanceof ApiError && ['ineligible', 'trip_open'].includes(err.code)) {
        setStatus(err.message);
        void loadMeals();
      } else {
        setStatus(SAVE_FAILED);
      }
    }
  }

  let countLines: string[];
  if (count.state === 'counting') countLines = ['Counting…'];
  else if (count.state === 'failed') countLines = ["Couldn't count the ingredients."];
  else {
    const t = count.result.trip;
    countLines = [ingredientsLine(t.counts.all), unmatchedCountLine(t.unmatched.length)].filter(Boolean);
  }

  return (
    <Sheet title="Plan a trip" onClose={onClose} testId="trip-setup">
      <p class="field-label" id="through-label">
        Shop for meals through
      </p>
      <div class="chip-row" role="group" aria-labelledby="through-label">
        {AHEAD.map((n) => (
          <button
            key={n}
            type="button"
            class="chip"
            aria-pressed={ahead === n}
            onClick={() => setAhead(n)}
            data-testid="through-chip"
          >
            {chipDay(addDays(today, n))}
          </button>
        ))}
      </div>

      <p class="field-label" id="trip-meals-label">
        Meals on this trip
      </p>
      {meals === null ? (
        <div class="skeleton-row" />
      ) : inRange.length ? (
        <ul class="plain-list" aria-labelledby="trip-meals-label">
          {inRange.map((m) => {
            const on = !unticked.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  class="tick-row"
                  aria-pressed={on}
                  onClick={() => toggle(m.id)}
                  data-testid="trip-meal"
                >
                  <span class={on ? 'tick is-on' : 'tick'} aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                  <span class="recipe-text">
                    <span class="recipe-name">{m.recipe_name || 'Recipe'}</span>
                    <span class="recipe-meta">
                      {longDate(m.date)} · {m.slot}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="hint" data-testid="no-trip-meals">
          {mealsFailed ? "Couldn't load your meals." : 'No planned meals in these dates'}
        </p>
      )}

      <div class="trip-count" data-testid="trip-count">
        {countLines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>

      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-primary btn-block"
          disabled={building}
          aria-busy={building}
          onClick={() => void build()}
          data-testid="build-trip"
        >
          {building ? 'Building…' : ticked.length ? 'Build the list' : 'Start a list with no meals'}
        </button>
      </div>
      <p class="library-status danger-text" role="status" data-testid="trip-setup-status">
        {status}
      </p>
    </Sheet>
  );
}
