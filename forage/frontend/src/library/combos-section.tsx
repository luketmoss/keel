// Library → Usuals, under the list (#888): every combo found in the log, a sheet for each, and the hidden ones back.
import { useMemo } from 'preact/hooks';
import { localDate } from '../cook/format';
import { combos, combosState, comboKcalText, hiddenCombos, libraryMeta } from './combos-store';
import { libraryFoods } from './foods-store';
import type { Combo } from '../api/types';

interface Props {
  onOpen: (combo: Combo) => void;
  onRetry: () => void;
  onShowHidden: () => void;
}

export function CombosSection({ onOpen, onRetry, onShowHidden }: Props) {
  const state = combosState.value;
  const list = combos.value;
  const hidden = hiddenCombos.value;
  const foods = useMemo(() => new Map(libraryFoods.value.map((f) => [f.id, f])), [libraryFoods.value]);
  const today = localDate();

  // Loading: no section yet, and no placeholder.
  if (state === 'idle' || (state === 'loading' && list.length === 0)) return null;
  if (state === 'error' && list.length === 0) {
    return (
      <div class="library-status danger-text" role="status" data-testid="combos-error">
        <p>Couldn't look for combos.</p>
        <button type="button" class="text-btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <section class="combos-section" aria-labelledby="combos-label" data-testid="combos-section">
      <p class="card-label" id="combos-label">
        Combos you've logged
      </p>
      <p class="hint">Foods you've had together in 3 or more meals in the last 60 days.</p>
      {list.length > 0 ? (
        <ul class="card recipe-list" aria-labelledby="combos-label" data-testid="combos-list">
          {list.map((c) => {
            const kcal = comboKcalText(c, foods);
            return (
              <li class="recipe-row" key={c.key} data-testid="combo-row">
                <button type="button" class="recipe-text recipe-open" onClick={() => onOpen(c)}>
                  <span class="recipe-name usual-foods">{c.name}</span>
                  <span class="recipe-meta" data-testid="combo-usage">
                    {libraryMeta(c, today)}
                  </span>
                </button>
                {kcal && <span class="usual-kcal tabular">{kcal}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="library-status" data-testid="combos-empty">
          Nothing new. Combos your usuals already cover don't show here.
        </p>
      )}
      {hidden > 0 && (
        <button type="button" class="text-btn" onClick={onShowHidden} data-testid="combos-show-hidden">
          Show {hidden} hidden
        </button>
      )}
    </section>
  );
}
