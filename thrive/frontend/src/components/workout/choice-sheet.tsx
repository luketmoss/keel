import { useRef, useState } from 'preact/hooks';
import { useModalFocus } from '../shared/use-modal-focus';

export type StartMode = 'lift' | 'logbook';

/** #579 � the start choice is kept on the device; only the start choice, never a mid-workout switch. */
export const WEIGHT_MODE_KEY = 'thrive.weightMode';

/** The remembered choice, or null when there is none or storage is unavailable. Never throws. */
export function loadWeightMode(): StartMode | null {
  try {
    const v = window.localStorage.getItem(WEIGHT_MODE_KEY);
    return v === 'lift' || v === 'logbook' ? v : null;
  } catch {
    return null;
  }
}

export function saveWeightMode(mode: StartMode): void {
  try {
    window.localStorage.setItem(WEIGHT_MODE_KEY, mode);
  } catch {
    // Storage can be full, blocked or absent: the next sheet just preselects Lift Mode.
  }
}

const OPTIONS: { mode: StartMode; title: string; text: string }[] = [
  { mode: 'lift', title: 'Lift Mode', text: 'Guided set by set, with set and rest timers' },
  { mode: 'logbook', title: 'Logbook', text: 'Log sets when convenient, as today' },
];

/**
 * #577 — how to run a weight workout, asked before anything is written. Two
 * radio cards; Lift Mode is selected to begin with, or the choice last made
 * here (#579). Continue hands back the choice, Cancel leaves everything as it was.
 */
export function ChoiceSheet({
  onContinue,
  onCancel,
  busy = false,
}: {
  onContinue: (mode: StartMode) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [mode, setMode] = useState<StartMode>(() => loadWeightMode() ?? 'lift');
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, () => {
    if (!busy) onCancel();
  });
  return (
    <div
      class="modal-overlay"
      onClick={(e) => {
        if (!busy && (e.target as HTMLElement).classList.contains('modal-overlay')) onCancel();
      }}
    >
      <div
        class="modal-content lift-choice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lift-choice-heading"
        ref={dialog}
      >
        <h2 id="lift-choice-heading" class="lift-choice-heading">
          How do you want to run it?
        </h2>
        <div class="lift-choice-cards" role="radiogroup" aria-labelledby="lift-choice-heading">
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={mode === o.mode ? 'true' : 'false'}
              class={`lift-choice-card${mode === o.mode ? ' lift-choice-card-on' : ''}`}
              onClick={() => setMode(o.mode)}
            >
              <span class="lift-choice-title">{o.title}</span>
              <span class="lift-choice-text">{o.text}</span>
            </button>
          ))}
        </div>
        <div class="lift-choice-actions">
          <button
            type="button"
            class="btn btn-primary"
            disabled={busy}
            onClick={() => {
              saveWeightMode(mode);
              onContinue(mode);
            }}
          >
            {busy ? 'Starting…' : 'Continue'}
          </button>
          <button type="button" class="btn btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
