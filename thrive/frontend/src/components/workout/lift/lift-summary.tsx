// #578 — Lift Mode's summary: what the session came to, every set open to
// correction, and the session's effort and notes. It replaces the finish modal
// in Lift Mode. The header, the action bar and Save belong to lift-mode.tsx.

import { useId } from 'preact/hooks';
import { formatMSS } from '../../../api/rest-times';
import type { Effort } from '../../../api/types';
import { EffortToggle } from '../../shared/effort-toggle';
import { signedMSS, summaryTotals, type LiftStep } from './lift-plan';
import { SetsList } from './lift-sets-list';

/** A total as m:ss, or "—" when nothing was measured: never "0:00" for no data. */
const total = (s: number | null): string => (s === null ? '—' : formatMSS(s));

export function SummaryScreen({
  steps,
  sessionSeconds,
  workoutId,
  token,
  notes,
  effort,
  onNotes,
  onEffort,
}: {
  steps: readonly LiftStep[];
  /** Start workout to opening the summary. */
  sessionSeconds: number | null;
  workoutId: string;
  token: string;
  notes: string;
  effort: Effort | '';
  onNotes: (notes: string) => void;
  onEffort: (effort: Effort | '') => void;
}) {
  const t = summaryTotals(steps);
  const uid = useId();
  const effortId = `lift-session-effort-${uid}`;
  const notesId = `lift-notes-${uid}`;
  const restLabel =
    t.restingS !== null && t.restVsPlanS !== null ? `Resting · avg ${signedMSS(t.restVsPlanS)} vs plan` : 'Resting';
  return (
    <div class="lift-content">
      <div class="lift-totals">
        <Tile value={total(sessionSeconds)} label="Session" />
        <Tile value={`${t.setsDone}/${t.setsTotal}`} label="Sets" />
        <Tile value={total(t.liftingS)} label="Under the bar" />
        <Tile value={total(t.restingS)} label={restLabel} />
      </div>
      <div class="lift-sets-heading">
        <h2 class="lift-eyebrow">Sets · tap one to view or edit</h2>
        {t.needEffort > 0 && <span class="lift-need-effort">{t.needEffort} need effort</span>}
      </div>
      <SetsList steps={steps} current={null} summary workoutId={workoutId} token={token} />
      <section class="lift-card" aria-label="Session">
        <h2 class="lift-eyebrow" id={effortId}>
          Session effort
        </h2>
        <div class="lift-session-effort">
          <EffortToggle
            value={effort}
            onChange={onEffort}
            size="session"
            label="Session effort"
            labelledBy={effortId}
          />
        </div>
        <label class="lift-eyebrow lift-notes-label" htmlFor={notesId}>
          Notes
        </label>
        <textarea
          id={notesId}
          class="form-textarea lift-notes"
          placeholder="How did it go?"
          rows={3}
          value={notes}
          onInput={(e) => onNotes((e.target as HTMLTextAreaElement).value)}
        />
      </section>
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div class="lift-tile">
      <div class="lift-tile-value">{value}</div>
      <div class="lift-tile-label">{label}</div>
    </div>
  );
}
