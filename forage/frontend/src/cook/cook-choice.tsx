// The Cook choice sheet (#708): Walkthrough or Log mode, as Thrive's Lift Mode /
// Logbook cards. The last choice is remembered on this device.
import { useState } from 'preact/hooks';
import type { RecipeSummary } from '../api/types';
import { isDemoMode } from '../demo/is-demo-mode';
import { Sheet } from '../ui/sheet';
import { readMode, writeMode, type CookMode } from './cook-store';
import { cookHash } from '../shell/routes';

interface Props {
  recipe: Pick<RecipeSummary, 'id' | 'name' | 'has_walkthrough'>;
  onClose: () => void;
}

/** Preselected: the last choice when it is still available, else Walkthrough if there is one, else Log mode. */
export function initialMode(hasWalkthrough: boolean): CookMode {
  const last = readMode();
  if (last === 'log' || (last === 'walkthrough' && hasWalkthrough)) return last;
  return hasWalkthrough ? 'walkthrough' : 'log';
}

export function CookChoice({ recipe, onClose }: Props) {
  const [mode, setMode] = useState<CookMode>(() => initialMode(recipe.has_walkthrough));
  const [noWalkthrough, setNoWalkthrough] = useState(false);

  function go() {
    writeMode(mode);
    if (mode === 'log') {
      onClose();
      window.location.hash = cookHash(recipe.id);
      return;
    }
    // #711 builds walkthrough mode; until then the card leads here.
    setNoWalkthrough(true);
  }

  if (noWalkthrough) {
    return (
      <Sheet
        title={isDemoMode() ? 'Not available in demo' : 'Walkthrough not built yet'}
        onClose={onClose}
        testId="no-walkthrough"
      >
        <p class="sheet-message">
          {isDemoMode()
            ? "Walkthroughs aren't in the demo yet. Log mode works: the recipe as written, checked off as you go."
            : "Walkthrough mode isn't built yet. Cook in log mode for now: the recipe as written, checked off as you go."}
        </p>
        <div class="sheet-actions">
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              writeMode('log');
              onClose();
              window.location.hash = cookHash(recipe.id);
            }}
          >
            Use log mode
          </button>
          <button type="button" class="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Sheet>
    );
  }

  const cards: { id: CookMode; title: string; line: string; disabled: boolean }[] = [
    {
      id: 'walkthrough',
      title: 'Walkthrough',
      line: recipe.has_walkthrough ? 'Prep first, then step by step with timers' : 'Not built yet for this recipe',
      disabled: !recipe.has_walkthrough,
    },
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
