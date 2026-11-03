import type { FoodLogEntry } from '../api/types';
import { amountLine, wholeKcal } from './format';

/** A log entry as the day lists it (#712), and as the Add sheet's Added list does (#786); `fresh` fades in. */
export function EntryRow({
  entry,
  name,
  onOpen,
  fresh,
}: {
  entry: FoodLogEntry;
  name: string;
  onOpen: () => void;
  fresh?: boolean;
}) {
  const unknown = entry.kcal === null;
  const line = amountLine(entry);
  return (
    <li>
      <button
        type="button"
        class={fresh ? 'log-row is-fresh' : 'log-row'}
        onClick={onOpen}
        aria-label={`${name}, ${line}, ${unknown ? 'no nutrition' : `${wholeKcal(entry.kcal!)} kcal`}`}
        data-testid="entry-row"
      >
        <span class="recipe-text">
          <span class="recipe-name">{name}</span>
          <span class="recipe-meta">{line}</span>
        </span>
        {unknown ? (
          <span class="chip-flag">—</span>
        ) : (
          <span class="log-row-kcal tabular">
            {wholeKcal(entry.kcal!)} <span class="hint-inline">kcal</span>
          </span>
        )}
      </button>
    </li>
  );
}
