import { useState } from 'preact/hooks';
import type { Food } from '../api/types';
import { Sheet } from '../ui/sheet';
import type { DraftLine } from './review-state';

const SHOWN = 8;

interface Props {
  line: Pick<DraftLine, 'name' | 'text' | 'suggestions'>;
  library: Food[];
  onChoose: (food: Food) => void;
  /** #707: add a starter food and match the line to it. Answers whether it worked. */
  onChooseStarter?: (starterId: string) => Promise<boolean>;
  onCreate: (name: string) => void;
  onLeave: () => void;
  onClose: () => void;
}

/** Which food is this? Suggestions first, then the library filtered by typing, and a new food. */
export function FoodChooser({ line, library, onChoose, onChooseStarter, onCreate, onLeave, onClose }: Props) {
  const [query, setQuery] = useState(line.name);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addFailed, setAddFailed] = useState(false);
  const q = query.trim().toLowerCase();
  const suggested = line.suggestions.map((s) => library.find((f) => f.id === s.food_id)).filter((f): f is Food => !!f);
  // Starter foods come after the library's, three rows in all, and are never pre-selected.
  const starters = onChooseStarter
    ? line.suggestions
        .filter((s): s is { starter_id: string; name: string } => !!s.starter_id)
        .slice(0, Math.max(0, 3 - suggested.length))
    : [];

  async function chooseStarter(id: string) {
    setAdding(true);
    setAddFailed(false);
    const ok = await onChooseStarter!(id);
    setAdding(false);
    if (!ok) setAddFailed(true);
  }
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
      {suggested.length + starters.length > 0 && (
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
            {starters.map((s) => (
              <li key={s.starter_id}>
                <button
                  type="button"
                  class="choice choice-starter"
                  disabled={adding}
                  onClick={() => void chooseStarter(s.starter_id)}
                  data-testid="starter-suggestion"
                >
                  <span aria-hidden="true" class="choice-plus">
                    +
                  </span>
                  <span class="recipe-text">
                    <span>{s.name}</span>
                    <span class="hint">From the starter list</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {addFailed && <p role="status">Couldn't add it. Try again.</p>}
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
