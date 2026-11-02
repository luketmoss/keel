// The Cook choice sheet (#708): Walkthrough or Log mode, as Thrive's Lift Mode /
// Logbook cards. The last choice is remembered on this device.
import { useState } from 'preact/hooks';
import type { RecipeSummary } from '../api/types';
import { Sheet } from '../ui/sheet';
import { readMode, writeMode, type CookMode } from './cook-store';
import { cookHash } from '../shell/routes';

interface Props {
  recipe: Pick<RecipeSummary, 'id' | 'name' | 'has_walkthrough' | 'walkthrough_ok'>;
  onClose: () => void;
}

/** #711: Walkthrough is selectable only with a walkthrough that passes the API's check. */
export function canWalkthrough(recipe: Pick<RecipeSummary, 'has_walkthrough' | 'walkthrough_ok'>): boolean {
  return recipe.has_walkthrough && recipe.walkthrough_ok !== false;
}

/** Preselected: the last choice when it is still available, else Walkthrough if there is one, else Log mode. */
export function initialMode(hasWalkthrough: boolean): CookMode {
  const last = readMode();
  if (last === 'log' || (last === 'walkthrough' && hasWalkthrough)) return last;
  return hasWalkthrough ? 'walkthrough' : 'log';
}

/** What the Walkthrough card says. */
function walkthroughLine(recipe: Pick<RecipeSummary, 'has_walkthrough' | 'walkthrough_ok'>): string {
  if (!recipe.has_walkthrough) return 'No walkthrough yet.';
  if (recipe.walkthrough_ok === false) return 'Needs an update. Ask Claude to fix it with the Forage connector.';
  return 'Prep first, then step by step with timers';
}

export function CookChoice({ recipe, onClose }: Props) {
  const walkable = canWalkthrough(recipe);
  const [mode, setMode] = useState<CookMode>(() => initialMode(walkable));

  function go() {
    writeMode(mode);
    onClose();
    window.location.hash = cookHash(recipe.id, '', mode === 'walkthrough' && walkable ? 'walkthrough' : 'log');
  }

  const cards: { id: CookMode; title: string; line: string; disabled: boolean }[] = [
    { id: 'walkthrough', title: 'Walkthrough', line: walkthroughLine(recipe), disabled: !walkable },
    { id: 'log', title: 'Log mode', line: 'The recipe as written, checked off as you go', disabled: false },
  ];

  return (
    <Sheet title={`Cook ${recipe.name}`} onClose={onClose} testId="cook-choice">
      <div class="mode-cards" role="radiogroup" aria-label="How to cook">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            class="mode-card"
            aria-checked={mode === c.id}
            aria-disabled={c.disabled}
            disabled={c.disabled}
            data-autofocus={mode === c.id ? true : undefined}
            data-testid={`mode-${c.id}`}
            onClick={() => !c.disabled && setMode(c.id)}
          >
            <span class="recipe-name">{c.title}</span>
            <span class="recipe-meta">{c.line}</span>
          </button>
        ))}
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-primary" onClick={go}>
          Continue
        </button>
        <button type="button" class="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
