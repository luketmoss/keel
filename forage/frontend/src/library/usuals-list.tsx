// The Usuals segment's list (#887): one row per usual, most recently used first.
import { useMemo } from 'preact/hooks';
import { localDate } from '../cook/format';
import { libraryFoods } from './foods-store';
import { foodsInShort, sortedUsuals, startKcalText, usageLine, usuals, usualsState } from './usuals-store';

interface Props {
  onOpen: (id: string) => void;
  onRetry: () => void;
}

export function UsualsList({ onOpen, onRetry }: Props) {
  const state = usualsState.value;
  const list = sortedUsuals(usuals.value);
  const foods = useMemo(() => new Map(libraryFoods.value.map((f) => [f.id, f])), [libraryFoods.value]);
  const today = localDate();

  if (state === 'error' && list.length === 0) {
    return (
      <div class="library-status danger-text" role="status" data-testid="usuals-error">
        <p>Couldn't load your usuals.</p>
        <button type="button" class="text-btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (state !== 'ready' && list.length === 0) {
    return (
      <div data-testid="usuals-loading" aria-hidden="true">
        <div class="skeleton-row" />
        <div class="skeleton-row" />
        <div class="skeleton-row" />
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <p class="library-status" data-testid="usuals-empty">
        No usuals yet. Save one from a meal in Eaten, or start one with ＋ New usual.
      </p>
    );
  }
  return (
    <ul class="card recipe-list" aria-label="Usuals">
      {list.map((u) => {
        const kcal = startKcalText(u);
        return (
          <li class="recipe-row" key={u.id} data-testid="usual-row">
            <button type="button" class="recipe-text recipe-open" onClick={() => onOpen(u.id)}>
              <span class="recipe-name">{u.name}</span>
              <span class="recipe-meta usual-foods" data-testid="usual-foods">
                {foodsInShort(u, foods) || 'No foods yet.'}
              </span>
              <span class="recipe-meta" data-testid="usual-usage">
                {usageLine(u, today)}
              </span>
            </button>
            {kcal && (
              <span class="usual-kcal tabular" data-testid="usual-kcal">
                {kcal}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
