// #577 — Lift Mode's screens. Presentational: the run, the clocks and every
// write belong to lift-mode.tsx, which passes in what each one shows.

import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { saveSet } from '../../../state/actions';
import type { Effort, SetWithRow } from '../../../api/types';
import { formatMSS, type RestKind, type RestSettings } from '../../../api/rest-times';
import { DurationStepper } from '../../shared/duration-stepper';
import { EffortToggle } from '../../shared/effort-toggle';
import { sectionBadgeClass } from '../../shared/section-utils';
import { useModalFocus } from '../../shared/use-modal-focus';
import { sectionTitle } from '../../activities/exercise-detail';
import { restRowsFor } from '../../templates/template-rest';
import {
  isWorkingSection,
  lastTimeFor,
  lastTimeLine,
  restTargetOf,
  stepState,
  stepWeight,
  targetParts,
  targetWeight,
  weightText,
  type LastTime,
  type LiftStep,
} from './lift-plan';
import { sectionValues, type SectionValues } from './lift-rest';
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
}: {
  name: string;
  /** The session clock, absent on the start screen. */
  clock: string | null;
  done: number;
  total: number;
  onAllSets: (() => void) | null;
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
}: {
  clock: string;
  target: number;
  label: string;
  view: RestView;
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
        <div class="lift-hint">
          {view.up ? "Still counting. Start when you're ready." : 'Counting until you start the next set'}
        </div>
      </div>
    </section>
  );
}

// Every mounted LogItem's "save what is held", so Finish can wait for them.
const flushers = new Set<() => Promise<void>>();

/** Writes every held stepper change in the Log card; resolves when they have all settled. */
export async function flushLogDrafts(): Promise<void> {
  await Promise.all([...flushers].map((f) => f()));
}

/** One set in the Log card: steppers, and an effort that saves. Leaving the card saves a held change. */
function LogItem({ step, workoutId, token }: { step: LiftStep; workoutId: string; token: string }) {
  const row = step.row;
  const rowRef = useRef(row);
  rowRef.current = row;
  const last = lastTimeFor(row, workoutId);
  const [draft, setDraft] = useState(() => ({
    weight: row.weight || last.set?.weight || '',
    reps: row.reps || row.planned_reps || '',
    effort: row.effort as Effort | '',
  }));
  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const busy = useRef(false);
  const uid = useId();

  const write = async (d: typeof draft) => {
    busy.current = true;
    try {
      await saveSet(
        { ...rowRef.current, weight: d.weight, reps: d.reps, effort: d.effort },
        token,
        rowRef.current.sheetRow,
      );
      dirty.current = false;
    } catch {
      // saveSet showed its toast; the controls keep the values for another try.
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    const flush = async () => {
      if (dirty.current && !busy.current) await write(draftRef.current);
    };
    flushers.add(flush);
    return () => {
      flushers.delete(flush);
      void flush();
    };
  }, []);

  const edit = (next: typeof draft, save: boolean) => {
    if (busy.current) return;
    draftRef.current = next;
    setDraft(next);
    if (save) void write(next);
    else dirty.current = true;
  };

  const weight = Number(draft.weight);
  const reps = Number(draft.reps) || 0;
  const hasWeight = draft.weight !== '';
  const name = row.exercise_name;
  return (
    <li class="lift-log-item" aria-label={`${name} set ${row.set_number}`}>
      <div class="lift-log-head">
        <strong>{name}</strong>
        <span class="lift-log-meta">
          Set {row.set_number}
          {row.set_s ? ` · ${formatMSS(Number(row.set_s))}` : ''}
        </span>
      </div>
      <div class="lift-steppers">
        {hasWeight ? (
          <Stepper
            label="lb"
            value={String(Number(weight.toFixed(2)))}
            onLess={() => edit({ ...draft, weight: String(stepWeight(weight, -1)) }, false)}
            onMore={() => edit({ ...draft, weight: String(stepWeight(weight, 1)) }, false)}
            what={`${name} weight`}
          />
        ) : (
          <span class="lift-bodyweight">Bodyweight</span>
        )}
        <Stepper
          label="reps"
          value={String(reps)}
          onLess={() => edit({ ...draft, reps: String(Math.max(0, reps - 1)) }, false)}
          onMore={() => edit({ ...draft, reps: String(reps + 1) }, false)}
          what={`${name} reps`}
        />
      </div>
      <div class="lift-effort" id={`lift-effort-${uid}`}>
        <EffortToggle
          value={draft.effort}
          onChange={(e) => edit({ ...draft, effort: e }, true)}
          size="session"
          label={`${name} set ${row.set_number} effort`}
        />
      </div>
    </li>
  );
}

function Stepper({
  label,
  value,
  onLess,
  onMore,
  what,
}: {
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
  what: string;
}) {
  return (
    <div class="lift-stepper" role="group" aria-label={what}>
      <button type="button" class="btn-icon duration-stepper-btn" aria-label={`Less ${what}`} onClick={onLess}>
        <span aria-hidden="true">−</span>
      </button>
      <span class="lift-stepper-value">
        <span class="lift-stepper-number">{value}</span> <span class="lift-stepper-unit">{label}</span>
      </span>
      <button type="button" class="btn-icon duration-stepper-btn" aria-label={`More ${what}`} onClick={onMore}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
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
  onClose,
  onFinish,
}: {
  steps: readonly LiftStep[];
  current: number | null;
  onClose: () => void;
  onFinish: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, onClose);
  const sections: string[] = [];
  for (const s of steps) if (!sections.includes(s.section)) sections.push(s.section);
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
        {sections.map((section) => (
          <section class="lift-card" key={section} aria-label={sectionTitle(section)}>
            <div class="lift-card-head">
              <span class={sectionBadgeClass(section)}>{sectionTitle(section)}</span>
            </div>
            <ul class="lift-plan-list">
              {steps
                .filter((s) => s.section === section)
                .map((s) => (
                  <li key={s.key} class="lift-plan-row">
                    <span class="lift-plan-name">
                      Set {s.row.set_number} · {s.row.exercise_name}
                    </span>
                    <StateText step={s} state={stepState(s, current)} />
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <button type="button" class="btn btn-secondary lift-sheet-finish" onClick={onFinish}>
          Finish workout now
        </button>
      </div>
    </div>
  );
}

function StateText({ step, state }: { step: LiftStep; state: ReturnType<typeof stepState> }) {
  const row = step.row;
  if (state === 'now') return <span class="lift-state lift-state-now">lifting now</span>;
  if (state === 'skipped') return <span class="lift-state lift-state-skipped">skipped</span>;
  if (state === 'logged' || state === 'no-effort') {
    const figures = `${row.weight ? Number(row.weight) : 'BW'} × ${row.reps || '?'}`;
    return state === 'logged' ? (
      <span class="lift-state">
        {figures} · {row.effort}
      </span>
    ) : (
      <span class="lift-state lift-state-warn">{row.reps || row.weight ? `${figures} · ` : ''}no effort</span>
    );
  }
  const t = targetParts(step, row.weight);
  return <span class="lift-state lift-state-muted">{[t.reps, t.weight].filter(Boolean).join(' · ')}</span>;
}
