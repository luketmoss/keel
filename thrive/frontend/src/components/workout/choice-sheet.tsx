import { useRef, useState } from 'preact/hooks';
import { useModalFocus } from '../shared/use-modal-focus';

export type StartMode = 'lift' | 'logbook';

const OPTIONS: { mode: StartMode; title: string; text: string }[] = [
  { mode: 'lift', title: 'Lift Mode', text: 'Guided set by set, with set and rest timers' },
  { mode: 'logbook', title: 'Logbook', text: 'Log sets when convenient, as today' },
];

/**
 * #577 — how to run a weight workout, asked before anything is written. Two
 * radio cards; Lift Mode is selected to begin with (#579 remembers the last
 * choice). Continue hands back the choice, Cancel leaves everything as it was.
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
  const [mode, setMode] = useState<StartMode>('lift');
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
          <button type="button" class="btn btn-primary" disabled={busy} onClick={() => onContinue(mode)}>
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
