// #577 — Lift Mode's screens. Presentational: the run, the clocks and every
// write belong to lift-mode.tsx, which passes in what each one shows.

import { useRef, useState } from 'preact/hooks';
import type { SetWithRow } from '../../../api/types';
import { formatMSS, type RestKind, type RestSettings } from '../../../api/rest-times';
import { DurationStepper } from '../../shared/duration-stepper';
import { sectionBadgeClass } from '../../shared/section-utils';
import { useModalFocus } from '../../shared/use-modal-focus';
import { sectionTitle } from '../../activities/exercise-detail';
import { restRowsFor } from '../../templates/template-rest';
import {
  isWorkingSection,
  lastTimeLine,
  restTargetOf,
  targetParts,
  targetWeight,
  weightText,
  type LastTime,
  type LiftStep,
} from './lift-plan';
import { sectionValues, type SectionValues } from './lift-rest';
import { SetControls } from './lift-set-controls';
import { SetsList } from './lift-sets-list';
import type { RestView } from './lift-run';

const SECTION_CLASS = (section: string): string => (section.startsWith('SS') ? 'ss' : section);

/** "Superset 1 · A" inside a round, the section's title elsewhere. */
function StepBadge({ step }: { step: LiftStep }) {
  const title = sectionTitle(step.section);
  return <span class={sectionBadgeClass(step.section)}>{step.letter ? `${title} · ${step.letter}` : title}</span>;
}

// ── Header ──────────────────────────────────────────────────────────

export function LiftHeader({
  name,
  clock,
  done,
  total,
  onAllSets,
  showProgress = true,
}: {
  name: string;
  /** The session clock, absent on the start screen. */
  clock: string | null;
  done: number;
  total: number;
  onAllSets: (() => void) | null;
  /** False on the summary, which has no progress bar. */
  showProgress?: boolean;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <header class="lift-header">
      <div class="lift-header-row">
        <h1 class="lift-title">{name}</h1>
        {clock !== null && (
          <span class="lift-session-clock" aria-label={`Session time ${clock}`}>
            {clock}
          </span>
        )}
        {onAllSets && (
          <button type="button" class="btn btn-ghost lift-chip" onClick={onAllSets}>
            All sets
          </button>
        )}
      </div>
      {showProgress && (
        <div
          class="lift-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={`${done} of ${total} sets done`}
        >
          <div class="lift-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </header>
  );
}

// ── Start screen ────────────────────────────────────────────────────

interface PlanRow {
  exercise_order: number;
  name: string;
  sets: number;
  reps: string;
  weight: string;
}

function planRows(rows: readonly SetWithRow[], section: string): PlanRow[] {
  const out: PlanRow[] = [];
  for (const r of rows.filter((x) => x.section === section).sort((a, b) => a.exercise_order - b.exercise_order)) {
    const seen = out.find((o) => o.exercise_order === r.exercise_order);
    if (seen) seen.sets += 1;
    else
      out.push({
        exercise_order: r.exercise_order,
        name: r.exercise_name,
        sets: 1,
        reps: r.planned_reps,
        weight: r.weight,
      });
  }
  return out;
}

export function StartScreen({
  rows,
  warmupNames,
  defaults,
  onRestChange,
}: {
  rows: readonly SetWithRow[];
  /** Warm-up exercises with no row yet (a plan from before warm-ups were stored). */
  warmupNames: readonly string[];
  defaults: RestSettings;
  onRestChange: (section: string, values: SectionValues) => void;
}) {
  const sections: string[] = [];
  for (const r of [...rows].sort((a, b) => a.exercise_order - b.exercise_order))
    if (!sections.includes(r.section)) sections.push(r.section);
  if (warmupNames.length > 0 && !sections.includes('warmup')) sections.unshift('warmup');

  return (
    <div class="lift-content">
      {sections.map((section) => (
        <SectionCard
          key={section}
          section={section}
          rows={rows}
          extraNames={section === 'warmup' && !rows.some((r) => r.section === 'warmup') ? warmupNames : []}
          defaults={defaults}
          onRestChange={onRestChange}
        />
      ))}
      <div class="lift-tip">
        <strong>On the watch:</strong> start a Strength activity, then leave it alone until the end.
      </div>
    </div>
  );
}

function SectionCard({
  section,
  rows,
  extraNames,
  defaults,
  onRestChange,
}: {
  section: string;
  rows: readonly SetWithRow[];
  extraNames: readonly string[];
  defaults: RestSettings;
  onRestChange: (section: string, values: SectionValues) => void;
}) {
  const plan = planRows(rows, section);
  const restRows = restRowsFor(section);
  // The values being edited: held here so the steppers move at once, written 800 ms after the last press.
  const [values, setValues] = useState<SectionValues>(() => sectionValues(rows, section, defaults));
  const change = (kind: RestKind, seconds: number) => {
    const next = kind === 'rest' ? { ...values, rest: seconds } : { ...values, switch: seconds };
    setValues(next);
    onRestChange(section, next);
  };
  const title = sectionTitle(section);
  return (
    <section class="lift-card" aria-label={title}>
      <div class="lift-card-head">
        <span class={sectionBadgeClass(section)}>{title}</span>
        {section === 'warmup' && <span class="lift-card-note">Untimed</span>}
      </div>
      <ul class="lift-plan-list">
        {plan.map((p) => (
          <li key={p.exercise_order} class="lift-plan-row">
            <span class="lift-plan-name">{p.name}</span>
            {isWorkingSection(section) && (
              <span class="lift-plan-figures">
                {p.sets} × {p.reps || '—'} · {weightText(p.weight)}
              </span>
            )}
          </li>
        ))}
        {extraNames.map((n) => (
          <li key={n} class="lift-plan-row">
            <span class="lift-plan-name">{n}</span>
          </li>
        ))}
      </ul>
      {restRows.length > 0 && (
        <div class="template-rest-band lift-rest-band" role="group" aria-label={`${title} rest for this workout`}>
          {restRows.map(({ kind, label }) => (
            <div class="rest-row" key={kind}>
              <span class="rest-row-label">{label}</span>
              <DurationStepper
                value={kind === 'rest' ? values.rest : (values.switch ?? 0)}
                kind={kind}
                onChange={(s) => change(kind, s)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Warm-up and cooldown ────────────────────────────────────────────

export interface ChecklistItem {
  key: string;
  name: string;
  /** "8 reps", or '' when none are planned. */
  repsText: string;
  done: boolean;
}

export function ChecklistScreen({
  section,
  hint,
  tip,
  items,
  onToggle,
}: {
  section: 'warmup' | 'cooldown';
  hint: string;
  tip: string | null;
  items: readonly ChecklistItem[];
  onToggle: (key: string) => void;
}) {
  return (
    <div class="lift-content">
      <div class="lift-check-head">
        <span class={sectionBadgeClass(section)}>{sectionTitle(section)}</span>
        <span class="lift-hint">{hint}</span>
      </div>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          class={`lift-check${it.done ? ' lift-check-done' : ''}`}
          aria-pressed={it.done ? 'true' : 'false'}
          onClick={() => onToggle(it.key)}
        >
          <span class="lift-check-circle" aria-hidden="true">
            {it.done ? '✓' : ''}
          </span>
          <span class="lift-check-name">{it.name}</span>
          {it.repsText && <span class="lift-check-reps">{it.repsText}</span>}
        </button>
      ))}
      {tip && <div class="lift-tip">{tip}</div>}
    </div>
  );
}

// ── Set screen ──────────────────────────────────────────────────────

export function SetScreen({
  step,
  clock,
  last,
  nextLine,
}: {
  step: LiftStep;
  clock: string;
  last: LastTime;
  nextLine: string;
}) {
  const t = targetParts(step, targetWeight(step.row, last));
  return (
    <div class="lift-content lift-set">
      <StepBadge step={step} />
      <h2 class="lift-exercise">{step.row.exercise_name}</h2>
      <p class="lift-target">
        {t.setOf}
        {t.reps && (
          <>
            {' · '}
            <strong>{t.reps}</strong>
          </>
        )}
        {' · '}
        <strong>{t.weight}</strong>
      </p>
      <div class="lift-clock-block">
        <div class="lift-clock" role="timer" aria-label={`Set time ${clock}`}>
          {clock}
        </div>
        <div class="lift-clock-caption">SET TIME</div>
      </div>
      <div class="lift-note-card">{lastTimeLine(last, step.row.set_number)}</div>
      <div class="lift-note-card lift-note-card-sm">{nextLine}</div>
    </div>
  );
}

// ── Rest screen ─────────────────────────────────────────────────────

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

export function RestHero({
  clock,
  target,
  label,
  view,
  final = false,
}: {
  clock: string;
  target: number;
  label: string;
  view: RestView;
  /** The rest after the last working set: nothing is coming, so no hint about the next one. */
  final?: boolean;
}) {
  const kind = label.startsWith('Switch') ? 'Switch' : 'Rest';
  const shown = view.up ? (kind === 'Switch' ? "Switch time's up" : "Rest's up") : kind;
  return (
    <section class={`lift-hero lift-card${view.up ? ' lift-hero-up' : ''}`} aria-label={shown}>
      <div class="lift-ring">
        <svg viewBox="0 0 132 132" aria-hidden="true">
          <circle class="lift-ring-track" cx="66" cy="66" r={RING_R} />
          <circle
            class="lift-ring-arc"
            cx="66"
            cy="66"
            r={RING_R}
            stroke-dasharray={RING_C}
            stroke-dashoffset={RING_C * (1 - view.fraction)}
            transform="rotate(-90 66 66)"
          />
        </svg>
        <div class="lift-ring-text">
          <div class="lift-rest-clock" role="timer" aria-label={`${kind} time ${clock}`}>
            {clock}
          </div>
          <div class="lift-overtime">{view.up ? `+${formatMSS(view.over)}` : ''}</div>
        </div>
      </div>
      <div class="lift-hero-side">
        <div class="lift-hero-label">{shown}</div>
        {target > 0 && <div class="lift-hint">Target {formatMSS(target)}</div>}
        {!final && (
          <div class="lift-hint">
            {view.up ? "Still counting. Start when you're ready." : 'Counting until you start the next set'}
          </div>
        )}
      </div>
    </section>
  );
}

/** One set in the Log card: its head, then the controls. Leaving the card saves a held change. */
function LogItem({ step, workoutId, token }: { step: LiftStep; workoutId: string; token: string }) {
  const row = step.row;
  return (
    <li class="lift-log-item" aria-label={`${row.exercise_name} set ${row.set_number}`}>
      <SetControls step={step} workoutId={workoutId} token={token}>
        <div class="lift-log-head">
          <strong>{row.exercise_name}</strong>
          <span class="lift-log-meta">
            Set {row.set_number}
            {row.set_s ? ` · ${formatMSS(Number(row.set_s))}` : ''}
          </span>
        </div>
      </SetControls>
    </li>
  );
}

export function LogCard({
  items,
  workoutId,
  token,
  earlierWithoutEffort,
}: {
  /** The round's performed sets, newest first. */
  items: readonly LiftStep[];
  workoutId: string;
  token: string;
  earlierWithoutEffort: number;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <section class="lift-card" aria-label="Log">
        <h2 class="lift-card-title">{items.length > 1 ? 'Log this round' : 'Log the set you just did'}</h2>
        <ul class="lift-log-list">
          {items.map((s) => (
            <LogItem key={s.key} step={s} workoutId={workoutId} token={token} />
          ))}
        </ul>
      </section>
      {earlierWithoutEffort > 0 && (
        <p class="lift-hint lift-missing">
          {earlierWithoutEffort === 1
            ? "1 earlier set without effort. It's in All sets."
            : `${earlierWithoutEffort} earlier sets without effort. They're in All sets.`}
        </p>
      )}
    </>
  );
}

export function UpNextCard({
  step,
  last,
  inRound,
}: {
  step: LiftStep;
  last: LastTime;
  /** The rest being taken is a switch: the heading and the border say so. */
  inRound: boolean;
}) {
  const t = targetParts(step, targetWeight(step.row, last));
  const then = step.nextInRound;
  return (
    <section
      class={`lift-card lift-next${inRound ? ` lift-next-round lift-next-${SECTION_CLASS(step.section)}` : ''}`}
      aria-label={inRound ? 'Switch to' : 'Up next'}
    >
      <div class="lift-next-heading">{inRound ? 'SWITCH TO' : 'UP NEXT'}</div>
      <StepBadge step={step} />
      <div class="lift-next-exercise">{step.row.exercise_name}</div>
      <div class="lift-target">
        {t.setOf}
        {t.reps && (
          <>
            {' · '}
            <strong>{t.reps}</strong>
          </>
        )}
        {' · '}
        <strong>{t.weight}</strong>
      </div>
      <div class="lift-hint">{lastTimeLine(last, step.row.set_number)}</div>
      {then && (
        <div class="lift-hint">
          Then {then.row.exercise_name}, {formatMSS(restTargetOf(step.row))} switch
        </div>
      )}
    </section>
  );
}

// ── All sets ────────────────────────────────────────────────────────

export function AllSetsSheet({
  steps,
  current,
  workoutId,
  token,
  onClose,
  onFinish,
}: {
  steps: readonly LiftStep[];
  current: number | null;
  workoutId: string;
  token: string;
  onClose: () => void;
  onFinish: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, onClose);
  return (
    <div
      class="modal-overlay lift-sheet-overlay"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('modal-overlay')) onClose();
      }}
    >
      <div
        class="modal-content lift-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lift-all-heading"
        ref={dialog}
      >
        <div class="lift-sheet-head">
          <h2 id="lift-all-heading">All sets</h2>
          <button type="button" class="btn btn-ghost lift-chip" onClick={onClose}>
            Close
          </button>
        </div>
        <SetsList steps={steps} current={current} summary={false} workoutId={workoutId} token={token} />
        <button type="button" class="btn btn-secondary lift-sheet-finish" onClick={onFinish}>
          Finish workout now
        </button>
      </div>
    </div>
  );
}
