import { useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Trip } from '../api/types';
import { Sheet } from '../ui/sheet';
import { SAVE_FAILED } from './shop-store';
import { STORE_NAMES, isStore, longDate, plural } from './trip-format';

/** "Done shopping?" (#718): what wasn't bought, and Close the trip. */
export function DoneSheet({
  api,
  trip,
  onClosed,
  onClose,
}: {
  api: ForageApi;
  trip: Trip;
  onClosed: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const toBuy = trip.items.filter((i) => isStore(i.choice));
  const unbought = toBuy.filter((i) => !i.bought);

  async function close() {
    if (busy) return;
    setBusy(true);
    setStatus('');
    try {
      await api.closeTrip(trip.id);
      onClosed();
    } catch {
      setBusy(false);
      setStatus(SAVE_FAILED);
    }
  }

  return (
    <Sheet title="Done shopping?" onClose={onClose} testId="done-sheet">
      <p class="sheet-message">
        {toBuy.length - unbought.length} of {toBuy.length} bought.
      </p>
      {unbought.length > 0 && (
        <>
          <ul class="plain-list done-list" data-testid="unbought">
            {unbought.map((i) => (
              <li key={i.food_id} class="done-row">
                <span>{i.name}</span>
                <span class="recipe-meta">{isStore(i.choice) ? STORE_NAMES[i.choice] : ''}</span>
              </li>
            ))}
          </ul>
          <p class="hint">Not bought. Closing the trip forgets them, and their meals still count as shopped.</p>
        </>
      )}
      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-primary"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void close()}
          data-testid="close-trip"
        >
          Close the trip
        </button>
        <button type="button" class="btn btn-secondary" onClick={onClose}>
          Keep shopping
        </button>
      </div>
      <p class="library-status danger-text" role="status">
        {status}
      </p>
    </Sheet>
  );
}

/** "This trip" (#718): the trip's meals, Change what's where, and Throw this list away, which asks first. */
export function TripMenu({
  api,
  trip,
  shopping,
  onChangeWhere,
  onDiscarded,
  onClose,
}: {
  api: ForageApi;
  trip: Trip;
  shopping: boolean;
  onChangeWhere: () => void;
  onDiscarded: () => void;
  onClose: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const items = plural(trip.items.length, 'item');

  async function discard() {
    if (busy) return;
    setBusy(true);
    setStatus('');
    try {
      await api.discardTrip(trip.id);
      onDiscarded();
    } catch {
      setBusy(false);
      setStatus(SAVE_FAILED);
    }
  }

  return (
    <Sheet title="This trip" onClose={onClose} testId="trip-menu">
      <ul class="plain-list trip-menu-meals" data-testid="trip-menu-meals">
        {trip.meals.length ? (
          trip.meals.map((m) => (
            <li key={m.plan_id} class="hint">
              {m.recipe_name || 'Recipe'} · {longDate(m.date)}
            </li>
          ))
        ) : (
          <li class="hint">No meals</li>
        )}
      </ul>
      {asking ? (
        <div data-testid="discard-question">
          <p class="sheet-message">
            <strong>Throw this list away?</strong>
          </p>
          <p class="sheet-message">Its {items} and your choices on them are deleted. Your meals stay planned.</p>
          <div class="sheet-actions">
            <button
              type="button"
              class="btn btn-danger"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void discard()}
              data-testid="discard-yes"
            >
              Throw away
            </button>
            <button type="button" class="btn btn-secondary" onClick={() => setAsking(false)} data-autofocus>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <ul class="plain-list">
          {shopping && (
            <li>
              <button type="button" class="row-btn" onClick={onChangeWhere} data-testid="menu-change-where">
                Change what's where
              </button>
            </li>
          )}
          <li>
            <button
              type="button"
              class="row-btn menu-danger"
              onClick={() => setAsking(true)}
              data-testid="menu-discard"
            >
              <span class="recipe-text">
                <span class="danger-text">Throw this list away</span>
                <span class="recipe-meta">{items}. Your meals stay planned.</span>
              </span>
            </button>
          </li>
        </ul>
      )}
      <p class="library-status danger-text" role="status">
        {status}
      </p>
    </Sheet>
  );
}
