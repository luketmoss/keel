// The recipe sheet's #708 parts: the "How was it?" card, the steps, and the
// cook history. Every write is the API's `upsertCook` or `deleteCook`; the
// sheet refetches after each, so what shows is what was stored.
import { useState } from 'preact/hooks';
import type { Cook, Step } from '../api/types';
import { shortDate } from '../cook/format';
import { StarButtons } from '../cook/stars';
import { ConfirmSheet } from '../ui/sheet';

interface RateCardProps {
  cook: Cook;
  /** Save a rating or a note on this cook; rejects when it couldn't be saved. */
  onSave: (fields: { rating?: number; note?: string }) => Promise<void>;
  onNotNow: () => void;
}

/** "How was it? You cooked this on Oct 31." Five stars that save at once, then an optional note. */
export function RateCard({ cook, onSave, onNotNow }: RateCardProps) {
  const [rated, setRated] = useState<number | null>(cook.rating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(cook.note);
  const [noteSaved, setNoteSaved] = useState(false);

  async function rate(n: number) {
    const before = rated;
    setRated(n);
    setSaving(true);
    setError(null);
    try {
      await onSave({ rating: n });
    } catch {
      setRated(before);
      setError("Couldn't save the rating.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ note });
      setNoteSaved(true);
    } catch {
      setError("Couldn't save the note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class="card rate-card" data-testid="rate-card">
      {rated === null ? (
        <p>
          <strong>How was it?</strong> You cooked this on {shortDate(cook.date)}.
        </p>
      ) : (
        <p>Rated {rated === 1 ? '1 star' : `${rated} stars`}</p>
      )}
      <StarButtons rating={rated} label="How was it?" onRate={(n) => void rate(n)} disabled={saving} />
      {rated !== null && !noteSaved && (
        <div class="inline-add">
          <label class="visually-hidden" for={`note-${cook.id}`}>
            Add a note (optional)
          </label>
          <input
            id={`note-${cook.id}`}
            class="field"
            placeholder="Add a note (optional)"
            value={note}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn btn-secondary" disabled={saving} onClick={() => void saveNote()}>
            Save
          </button>
        </div>
      )}
      {noteSaved && note && <p class="hint">{note}</p>}
      {rated === null && (
        <button type="button" class="text-btn" onClick={onNotNow}>
          Not now
        </button>
      )}
      {error && (
        <p role="status" class="danger-text">
          {error}
        </p>
      )}
    </section>
  );
}

/** "Steps (10)", collapsed: a card per section, each step "1. Brown the beef" over its text. Read-only. */
export function StepsSection({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  const shown = steps.filter((s) => s.text.trim());
  if (!shown.length) return null;
  const groups: { section: string; steps: Step[] }[] = [];
  for (const s of shown) {
    const last = groups[groups.length - 1];
    if (last && last.section === s.section) last.steps.push(s);
    else groups.push({ section: s.section, steps: [s] });
  }
  return (
    <section class="steps-section">
      <button
        type="button"
        class="row-btn"
        aria-expanded={open}
        aria-controls="recipe-steps"
        onClick={() => setOpen(!open)}
        data-testid="steps-toggle"
      >
        <span>Steps ({shown.length})</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div id="recipe-steps">
          {groups.map((g, i) => (
            <div key={i} class="card" data-testid="step-group">
              {g.section && <p class="card-label">{g.section}</p>}
              <ol class="step-list plain-list">
                {g.steps.map((s) => (
                  <li key={s.position} data-testid="sheet-step">
                    <span>
                      {s.position}. {s.name && <strong>{s.name}</strong>}
                    </span>
                    <span class="step-text">{s.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface HistoryProps {
  cooks: Cook[];
  /** The cook being saved or removed: "Updating…" in place of its stars. */
  busy: string | null;
  onRate: (cook: Cook, rating: number | null) => void;
  onRemove: (cook: Cook) => void;
}

function HistoryRow({ cook, busy, onRate, onRemove }: { cook: Cook } & Omit<HistoryProps, 'cooks'>) {
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState(false);
  return (
    <li class="history-row" data-testid="history-row">
      <div class="history-main">
        <span class="history-date">{shortDate(cook.date)}</span>
        {busy === cook.id ? (
          <span class="status-muted">Updating…</span>
        ) : (
          <StarButtons
            rating={cook.rating}
            label={`Rating for ${shortDate(cook.date)}`}
            // Tapping the filled last star clears the rating.
            onRate={(n) => onRate(cook, n === cook.rating ? null : n)}
          />
        )}
        <div class="account">
          <button
            type="button"
            class="icon-btn"
            aria-label={`More for the cook from ${shortDate(cook.date)}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            …
          </button>
          {menu && (
            <div class="account-menu" role="menu">
              <button
                type="button"
                class="account-signout danger-text"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  setAsking(true);
                }}
              >
                Remove this cook
              </button>
            </div>
          )}
        </div>
      </div>
      {cook.note && <p class="hint">{cook.note}</p>}
      {asking && (
        <ConfirmSheet
          title={`Remove the cook from ${shortDate(cook.date)}?`}
          confirm="Remove"
          cancel="Cancel"
          danger
          onConfirm={() => {
            setAsking(false);
            onRemove(cook);
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </li>
  );
}

/** "Cooked 3 times", then one row per cook, newest first. */
export function HistorySection({ cooks, busy, onRate, onRemove }: HistoryProps) {
  return (
    <section class="history" data-testid="history">
      <h3 class="history-heading">
        {cooks.length ? `Cooked ${cooks.length === 1 ? 'once' : `${cooks.length} times`}` : 'History'}
      </h3>
      {cooks.length === 0 ? (
        <p class="hint">Not cooked yet.</p>
      ) : (
        <ul class="plain-list">
          {cooks.map((c) => (
            <HistoryRow key={c.id} cook={c} busy={busy} onRate={onRate} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}
