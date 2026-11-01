import { useState } from 'preact/hooks';
import type { Food } from '../api/types';
import { Sheet } from '../ui/sheet';
import type { DraftLine } from './review-state';

const SHOWN = 8;

interface Props {
  line: DraftLine;
  library: Food[];
  onChoose: (food: Food) => void;
  onCreate: (name: string) => void;
  onLeave: () => void;
  onClose: () => void;
}

/** Which food is this? Suggestions first, then the library filtered by typing, and a new food. */
export function FoodChooser({ line, library, onChoose, onCreate, onLeave, onClose }: Props) {
  const [query, setQuery] = useState(line.name);
  const [all, setAll] = useState(false);
  const q = query.trim().toLowerCase();
  const suggested = line.suggestions.map((s) => library.find((f) => f.id === s.food_id)).filter((f): f is Food => !!f);
  const matches = library
    .filter((f) => !q || f.name.toLowerCase().includes(q))
    .filter((f) => !suggested.includes(f))
    .sort((a, b) => a.name.localeCompare(b.name));
  const shown = all ? matches : matches.slice(0, SHOWN);
  const exact = library.some((f) => f.name.trim().toLowerCase() === q);

  return (
    <Sheet title="Which food is this?" onClose={onClose} testId="food-chooser">
      <p class="sheet-source">{line.text}</p>
      <label for="food-search" class="visually-hidden">
        Search your foods
      </label>
      <input
        id="food-search"
        class="field"
        type="search"
        placeholder="Search your foods"
        autoComplete="off"
        value={query}
        data-autofocus
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <ul class="choice-list">
        {q && !exact && (
          <li>
            <button type="button" class="choice choice-new" onClick={() => onCreate(query.trim())}>
              New food: {query.trim()}
            </button>
          </li>
        )}
      </ul>
      {suggested.length > 0 && (
        <>
          <h3 class="choice-heading">Suggested</h3>
          <ul class="choice-list">
            {suggested.map((f) => (
              <li key={f.id}>
                <button type="button" class="choice" onClick={() => onChoose(f)}>
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {library.length === 0 ? (
        <p class="hint">Your library is empty. The first foods you add here are kept for the next recipe.</p>
      ) : (
        shown.length > 0 && (
          <>
            <h3 class="choice-heading">Your foods</h3>
            <ul class="choice-list">
              {shown.map((f) => (
                <li key={f.id}>
                  <button type="button" class="choice" onClick={() => onChoose(f)}>
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
            {!all && matches.length > SHOWN && (
              <button type="button" class="text-btn" onClick={() => setAll(true)}>
                Show more
              </button>
            )}
          </>
        )
      )}
      <button type="button" class="choice choice-leave" onClick={onLeave}>
        Leave unmatched
      </button>
    </Sheet>
  );
}
