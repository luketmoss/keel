// The Swap sheet (#886): change a usual's Always food for one day. Rows show what each food would log; a tap writes it.
import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry, UsualLine } from '../api/types';
import { Sheet } from '../ui/sheet';
import { wholeKcal } from './format';
import { amountGrams, amountKcal, amountText, swapAmount, swapSections } from './swap';

interface Props {
  api: ForageApi;
  entry: FoodLogEntry;
  /** The entry's food name, and the usual's. */
  name: string;
  usualId: string;
  usualName: string;
  line: UsualLine;
  foods: Food[];
  busy: boolean;
  failed: boolean;
  onPick: (food: Food) => void;
  onClose: () => void;
}

export function SwapSheet({ api, entry, name, usualId, usualName, line, foods, busy, failed, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  // `getUsual` carries the line's swaps (#878); until it answers the first sections simply aren't there.
  const [swaps, setSwaps] = useState<UsualLine['swaps']>([]);
  useEffect(() => {
    let live = true;
    api.getUsual(usualId).then(
      (u) => live && setSwaps(u.lines.find((l) => l.line_id === line.line_id)?.swaps ?? []),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [usualId]);

  const sections = swapSections(entry, line, swaps, foods, q);
  const row = (food: Food, sub: (amount: string, grams: string | null) => string) => {
    const amount = swapAmount(entry, food);
    const grams = amountGrams(food, amount);
    const kcal = amountKcal(food, amount);
    return (
      <li key={food.id}>
        <button
          type="button"
          class="log-row"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => onPick(food)}
          data-testid="swap-row"
        >
          <span class="recipe-text">
            <span class="recipe-name">{food.name}</span>
            <span class="recipe-meta" data-testid="swap-sub">
              {sub(amountText(amount), grams === null ? null : `${Math.round(grams)} g`)}
            </span>
          </span>
          {kcal === null ? (
            <span class="chip-flag">—</span>
          ) : (
            <span class="log-row-kcal tabular">
              {wholeKcal(kcal)} <span class="hint-inline">kcal</span>
            </span>
          )}
        </button>
      </li>
    );
  };
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ');
  const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);

  return (
    <Sheet
      title={`Swap ${name}`}
      onClose={onClose}
      testId="swap-sheet"
      headerEnd={
        <button type="button" class="text-btn" onClick={onClose} disabled={busy} data-testid="swap-cancel">
          Cancel
        </button>
      }
    >
      <p class="hint" data-testid="swap-note">
        Just for this day. Your {usualName} usual stays as it is.
      </p>
      <label class="visually-hidden" for="swap-q">
        Search foods
      </label>
      <input
        id="swap-q"
        class="field"
        type="search"
        placeholder="Search foods"
        value={q}
        autocomplete="off"
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        data-testid="swap-q"
        data-autofocus
      />
      {failed && (
        <p class="danger-text field-error" role="status" data-testid="swap-error">
          Couldn't swap. Try again.
        </p>
      )}
      {sections.usual && (
        <section aria-labelledby="swap-usual">
          <h3 class="field-label" id="swap-usual">
            Your usual
          </h3>
          <ul class="plain-list">{row(sections.usual, (a) => `Back to the usual · ${a}`)}</ul>
        </section>
      )}
      {sections.before.length > 0 && (
        <section aria-labelledby="swap-before">
          <h3 class="field-label" id="swap-before">
            Swapped in before
          </h3>
          <ul class="plain-list">{sections.before.map((s) => row(s.food, (a, g) => join(times(s.count), a, g)))}</ul>
        </section>
      )}
      <section aria-labelledby="swap-any">
        <h3 class="field-label" id="swap-any">
          {sections.searching ? 'Foods' : 'Or any food'}
        </h3>
        {sections.any.length === 0 ? (
          <p class="library-status">{sections.searching ? `No food matches "${q.trim()}".` : 'No other foods.'}</p>
        ) : (
          <ul class="plain-list">{sections.any.map((f) => row(f, (a, g) => join(a, g)))}</ul>
        )}
      </section>
    </Sheet>
  );
}
