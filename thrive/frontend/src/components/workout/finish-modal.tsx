// #667 — the finish sheet: a bottom sheet in the exercise picker's frame (#641), in place of the
// centred dialog. A summary line, session effort, notes, Save workout and Keep logging. The dialog
// semantics are kept: role="dialog", focus in the notes, and Escape or the scrim do nothing while saving.

import { useId, useRef } from 'preact/hooks';
import { useModalFocus } from '../shared/use-modal-focus';
import { EffortPills } from './set-row';
import type { Effort } from '../../api/types';

interface FinishWorkoutSheetProps {
  notes: string;
  onNotesChange: (e: Event) => void;
  effort: Effort | '';
  onEffortChange: (effort: Effort | '') => void;
  onFinish: () => void;
  onCancel: () => void;
  finishing: boolean;
  /** "14 of 17 sets logged · 3 need effort" */
  summary: string;
}

const HEADING_ID = 'finish-workout-heading';

export function FinishWorkoutSheet({
  notes,
  onNotesChange,
  effort,
  onEffortChange,
  onFinish,
  onCancel,
  finishing,
  summary,
}: FinishWorkoutSheetProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const uid = useId();
  const notesId = `finish-notes-${uid}`;
  const effortLabelId = `finish-effort-label-${uid}`;
  // Escape and the scrim do nothing while the save is in flight.
  useModalFocus(
    dialog,
    () => {
      if (!finishing) onCancel();
    },
    { initialFocus: 'textarea' },
  );

  const handleScrimClick = (e: MouseEvent) => {
    if (finishing) return;
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div class="lb-sheet-overlay" onClick={handleScrimClick}>
      <div class="lb-sheet" role="dialog" aria-modal="true" aria-labelledby={HEADING_ID} ref={dialog}>
        <span class="picker-grab" aria-hidden="true" />
        <div class="lb-sheet-body">
          <h2 id={HEADING_ID} class="lb-sheet-title">
            Finish workout
          </h2>
          <p class="lb-sheet-summary">{summary}</p>

          <div class="lb-sheet-field">
            <span class="lb-field-label" id={effortLabelId}>
              Session effort
            </span>
            <EffortPills value={effort} onChange={onEffortChange} labelledBy={effortLabelId} />
          </div>

          <div class="lb-sheet-field">
            <label class="lb-field-label" htmlFor={notesId}>
              Notes
            </label>
            <textarea
              id={notesId}
              class="form-textarea lb-notes"
              placeholder="How did it go?"
              rows={3}
              value={notes}
              onInput={onNotesChange}
            />
          </div>

          <div class="lb-sheet-actions">
            <button type="button" class="btn btn-primary lb-save-btn" onClick={onFinish} disabled={finishing}>
              {finishing ? 'Saving…' : 'Save workout'}
            </button>
            <button type="button" class="btn btn-secondary lb-keep-btn" onClick={onCancel} disabled={finishing}>
              Keep logging
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
