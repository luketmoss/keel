// #667 — a set in the Logbook: a tile in its exercise's row, and the one editor that opens under the
// row. Board 1 and 2 of the prototype; thrive/docs/design/667-logbook-redesign.md.

import { useId } from 'preact/hooks';
import type { Effort } from '../../api/types';
import { effortShort, isLogged, stepField, tileLabel, tileValue } from './tracker-model';

export interface TrackerSet {
  set_number: number;
  planned_reps: string;
  weight: string;
  reps: string;
  effort: Effort | '';
  saved: boolean;
  sheetRow: number;
}

export const EFFORTS: readonly Effort[] = ['Easy', 'Medium', 'Hard'];

/** What the editor's status line reads: nothing before a change, then Saving…, then Saved. */
export type SaveStatus = '' | 'Saving…' | 'Saved';

/** One set as a tile: its value over its effort, or its planned reps on a dashed tile. */
export function SetTile({
  set,
  open,
  removing,
  onToggle,
}: {
  set: TrackerSet;
  open: boolean;
  removing: boolean;
  onToggle: () => void;
}) {
  const logged = isLogged(set);
  return (
    <button
      type="button"
      class={`lb-tile${logged ? '' : ' lb-tile-undone'}${open ? ' lb-tile-open' : ''}`}
      data-set={set.set_number}
      aria-label={tileLabel(set)}
      aria-expanded={open ? 'true' : 'false'}
      aria-disabled={removing ? 'true' : undefined}
      onClick={() => {
        if (!removing) onToggle();
      }}
    >
      <span class="lb-tile-face" aria-hidden="true">
        {logged ? (
          <>
            <span class="lb-tile-value">{tileValue(set)}</span>
            {set.effort && (
              <span class={`lb-tile-note lb-tile-effort-${set.effort.toLowerCase()}`}>{effortShort(set.effort)}</span>
            )}
          </>
        ) : (
          <>
            <span class="lb-tile-value">{set.planned_reps ? `×${set.planned_reps}` : '—'}</span>
            <span class="lb-tile-note" aria-hidden="true">
              SET {set.set_number}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/** Easy / Medium / Hard as three pills; tapping the selected one clears it. */
export function EffortPills({
  value,
  onChange,
  labelledBy,
  label,
}: {
  value: Effort | '';
  onChange: (effort: Effort | '') => void;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <div class="lb-effort" role="group" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {EFFORTS.map((effort) => {
        const active = value === effort;
        return (
          <button
            key={effort}
            type="button"
            class={`lb-effort-pill lb-effort-${effort.toLowerCase()}${active ? ' active' : ''}`}
            aria-pressed={active ? 'true' : 'false'}
            onClick={() => onChange(active ? '' : effort)}
          >
            {effort}
          </button>
        );
      })}
    </div>
  );
}

/** A weight or reps field that takes only what the column holds: digits, and one point for a weight. */
function clean(kind: 'weight' | 'reps', raw: string): string {
  return kind === 'weight' ? raw.replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1') : raw.replace(/\D/g, '');
}

function StepperField({
  kind,
  label,
  value,
  placeholder,
  onChange,
}: {
  kind: 'weight' | 'reps';
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const less = kind === 'weight' ? 'Less weight' : 'Fewer reps';
  const more = kind === 'weight' ? 'More weight' : 'More reps';
  return (
    <div class="lb-stepper-col">
      <label class="lb-field-label" htmlFor={id}>
        {label}
      </label>
      <div class="lb-stepper">
        <button
          type="button"
          class="lb-step-btn"
          aria-label={less}
          onClick={() => onChange(stepField(kind, value, -1))}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          id={id}
          class="form-input lb-step-input"
          type="text"
          inputMode={kind === 'weight' ? 'decimal' : 'numeric'}
          autocomplete="off"
          placeholder={placeholder}
          value={value}
          onInput={(e) => {
            const input = e.target as HTMLInputElement;
            const next = clean(kind, input.value);
            if (next !== input.value) input.value = next;
            onChange(next);
          }}
        />
        <button type="button" class="lb-step-btn" aria-label={more} onClick={() => onChange(stepField(kind, value, 1))}>
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}

/** The editor of the one open set: steppers you can type into, effort, Same for all sets, Remove, Next. */
export function SetEditor({
  exerciseName,
  set,
  status,
  canCopyToAll,
  isLast,
  removing,
  onChange,
  onSameForAll,
  onRemove,
  onNext,
}: {
  exerciseName: string;
  set: TrackerSet;
  /** '' in edit mode too, where nothing is saved until Save. */
  status: SaveStatus;
  canCopyToAll: boolean;
  isLast: boolean;
  removing: boolean;
  onChange: (updates: Partial<TrackerSet>) => void;
  onSameForAll: () => void;
  onRemove: () => void;
  onNext: () => void;
}) {
  return (
    <div class="lb-editor" role="group" aria-label={`${exerciseName}, set ${set.set_number}`}>
      <div class="lb-editor-head">
        <span class="lb-editor-title">Set {set.set_number}</span>
        {set.planned_reps && <span class="lb-editor-target">target {set.planned_reps}</span>}
        <span class="lb-editor-status" role="status">
          {status}
        </span>
      </div>

      <div class="lb-steppers">
        <StepperField
          kind="weight"
          label="Weight (lb)"
          value={set.weight}
          placeholder="BW"
          onChange={(weight) => onChange({ weight })}
        />
        <StepperField
          kind="reps"
          label="Reps"
          value={set.reps}
          placeholder={set.planned_reps || 'reps'}
          onChange={(reps) => onChange({ reps })}
        />
      </div>

      {canCopyToAll && (
        <button type="button" class="lb-text-btn lb-same-btn" onClick={onSameForAll}>
          Same for all sets
        </button>
      )}

      <EffortPills value={set.effort} onChange={(effort) => onChange({ effort })} label="Effort" />

      <div class="lb-editor-actions">
        <button
          type="button"
          class="lb-text-btn lb-remove-set"
          aria-disabled={removing ? 'true' : undefined}
          onClick={() => {
            if (!removing) onRemove();
          }}
        >
          <span>Remove set</span>
        </button>
        <button type="button" class="btn btn-primary lb-next-btn" onClick={onNext}>
          {isLast ? 'Done' : 'Next set'}
        </button>
      </div>
    </div>
  );
}
