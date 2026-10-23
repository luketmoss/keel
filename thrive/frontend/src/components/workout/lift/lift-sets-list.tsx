// #578 — Lift Mode's list of working sets, one card per section: All sets during
// the workout and the summary at the end. A row that can open shows the same
// steppers and effort pills as the Log card, in place; opening one closes any
// other.

import { useState } from 'preact/hooks';
import { sectionBadgeClass } from '../../shared/section-utils';
import { sectionTitle } from '../../activities/exercise-detail';
import { figuresText, isEditable, stepState, targetParts, type LiftStep, type StepState } from './lift-plan';
import { SetControls } from './lift-set-controls';

export function SetsList({
  steps,
  current,
  summary,
  workoutId,
  token,
}: {
  steps: readonly LiftStep[];
  /** The set on screen, or null (the summary). */
  current: number | null;
  /** The workout is over: every set opens, and what was not done reads skipped. */
  summary: boolean;
  workoutId: string;
  token: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sections: string[] = [];
  for (const s of steps) if (!sections.includes(s.section)) sections.push(s.section);
  return (
    <>
      {sections.map((section) => (
        <section class="lift-card" key={section} aria-label={sectionTitle(section)}>
          <div class="lift-card-head">
            <span class={sectionBadgeClass(section)}>{sectionTitle(section)}</span>
          </div>
          <ul class="lift-set-list">
            {steps
              .filter((s) => s.section === section)
              .map((s) => (
                <SetRow
                  key={s.key}
                  step={s}
                  state={stepState(s, current, summary)}
                  summary={summary}
                  open={open === s.key}
                  onToggle={() => setOpen(open === s.key ? null : s.key)}
                  workoutId={workoutId}
                  token={token}
                />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function SetRow({
  step,
  state,
  summary,
  open,
  onToggle,
  workoutId,
  token,
}: {
  step: LiftStep;
  state: StepState;
  summary: boolean;
  open: boolean;
  onToggle: () => void;
  workoutId: string;
  token: string;
}) {
  const row = step.row;
  const editable = isEditable(state, summary);
  const label = (
    <>
      <span class="lift-set-no">Set {row.set_number}</span>
      <span class="lift-set-name">{row.exercise_name}</span>
      <StateText step={step} state={state} />
    </>
  );
  return (
    <li class="lift-set-row">
      {editable ? (
        <button
          type="button"
          class={`lift-set-line lift-set-btn${open ? ' lift-set-open' : ''}`}
          aria-expanded={open ? 'true' : 'false'}
          onClick={onToggle}
        >
          {label}
        </button>
      ) : (
        <div class="lift-set-line">{label}</div>
      )}
      {open && editable && (
        <div class="lift-set-editor">
          <SetControls
            step={step}
            workoutId={workoutId}
            token={token}
            revertOnFail
            footer={state === 'skipped' && <p class="lift-hint lift-set-hint">Tap an effort to log this set.</p>}
          />
        </div>
      )}
    </li>
  );
}

function StateText({ step, state }: { step: LiftStep; state: StepState }) {
  const row = step.row;
  if (state === 'now') return <span class="lift-state lift-state-now">lifting now</span>;
  if (state === 'skipped') return <span class="lift-state lift-state-muted">skipped</span>;
  if (state === 'logged')
    return (
      <span class="lift-state">
        {figuresText(row)} · {row.effort}
      </span>
    );
  if (state === 'no-effort')
    return (
      <span class="lift-state">
        {row.reps || row.weight ? `${figuresText(row)} · ` : ''}
        <span class="lift-state-warn">needs effort</span>
      </span>
    );
  const t = targetParts(step, row.weight);
  return <span class="lift-state lift-state-muted">{[t.reps, t.weight].filter(Boolean).join(' · ')}</span>;
}
