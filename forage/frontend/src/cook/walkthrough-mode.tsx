// Walkthrough mode (#711): Before you start, Prep and Cooking, inside #708's
// cook frame (header and clock, the timers bar, the fixed action bar, the Done
// screen). Nothing here moves the cook on by itself: a finished timer, a
// finished Prep or a ticked Meanwhile group change nothing until a tap.
import { useEffect, useRef } from 'preact/hooks';
import type { CookStep, PrepGroup, RecipeDetail, Walkthrough, WalkthroughUse } from '../api/types';
import { minutesText, shownAmount } from './amounts';
import type { ActiveCook, WalkthroughStage } from './cook-store';

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 24;

interface Props {
  recipe: RecipeDetail;
  doc: Walkthrough;
  cook: ActiveCook;
  update: (fn: (c: ActiveCook) => ActiveCook) => void;
  addTimer: (minutes: number, label: string, step: string) => void;
  /** Finish is saving: the button waits. */
  saving: boolean;
  failed: boolean;
  onFinish: () => void;
}

/** The tick of a prep group's task, kept in the cook's `checked`. */
export const taskKey = (group: string, i: number) => `T:${group}:${i}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How many of a group's tasks are ticked. */
function ticked(group: PrepGroup, checked: string[]): number {
  return group.tasks.filter((_, i) => checked.includes(taskKey(group.id, i))).length;
}

/** `{p} prep groups first, then {n} cooking steps: about … The last sentence only when some prep happens during waits. */
export function planText(doc: Walkthrough): string {
  const first = doc.prep.filter((p) => p.when === 'start');
  const later = doc.prep.filter((p) => p.when !== 'start');
  const active = doc.cook.reduce((a, c) => a + (c.timer?.min ?? 0), 0);
  const waited = doc.cook.reduce((a, c) => a + (c.wait?.min ?? 0), 0);
  const out = [
    `${plural(first.length, 'prep group')} first, then ${plural(doc.cook.length, 'cooking step')}: about ` +
      `${minutesText(active)} at the stove and ${minutesText(waited)} of waiting.`,
  ];
  if (later.length) {
    out.push(
      `${later.length} more ${later.length === 1 ? 'prep group' : 'prep groups'} ` +
        `(${later.map((p) => p.title.toLowerCase()).join(', ')}) ` +
        `${later.length === 1 ? 'happens' : 'happen'} during the waiting.`,
    );
  }
  return out.join(' ');
}

function UsesRows({
  uses,
  recipe,
  doc,
  cook,
}: {
  uses: WalkthroughUse[];
  recipe: RecipeDetail;
  doc: Walkthrough;
  cook: ActiveCook;
}) {
  const servings = cook.servings ?? recipe.servings ?? 1;
  return (
    <ul class="plain-list uses-list" data-testid="uses">
      {uses.map((u, i) => {
        if ('prep' in u) {
          const group = doc.prep.find((p) => p.id === u.prep);
          const left = group ? group.tasks.length - ticked(group, cook.checked) : 0;
          return (
            <li key={`p${i}`} class="uses-row" data-testid="uses-row">
              <span class="uses-amount">From prep</span>
              <span class="uses-name">
                {group?.makes ?? u.prep}
                {group && left > 0 && (
                  <span class="uses-left" data-testid="tasks-left">
                    {left} of {group.tasks.length} tasks not ticked
                  </span>
                )}
              </span>
            </li>
          );
        }
        const line = recipe.lines.find((l) => l.line_id === u.line);
        const shown = shownAmount(line, u.share, servings, recipe.servings);
        return (
          <li key={`l${i}`} class="uses-row" data-testid="uses-row">
            <span class="uses-amount" data-testid="uses-amount">
              {shown.amount}
            </span>
            <span class="uses-name">{shown.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PrepCard({
  group,
  recipe,
  doc,
  cook,
  toggle,
}: {
  group: PrepGroup;
  recipe: RecipeDetail;
  doc: Walkthrough;
  cook: ActiveCook;
  toggle: (key: string) => void;
}) {
  const done = ticked(group, cook.checked);
  return (
    <section class="card prep-card" data-testid={`prep-${group.id}`} aria-labelledby={`prep-title-${group.id}`}>
      <div class="cook-card-head">
        <h3 class="prep-title" id={`prep-title-${group.id}`}>
          {group.title}
        </h3>
        <span class="hint tabular">
          {done}/{group.tasks.length}
        </span>
      </div>
      {(group.uses ?? []).length > 0 && <UsesRows uses={group.uses ?? []} recipe={recipe} doc={doc} cook={cook} />}
      <ul class="plain-list">
        {group.tasks.map((task, i) => {
          const key = taskKey(group.id, i);
          const on = cook.checked.includes(key);
          return (
            <li key={key}>
              <button
                type="button"
                class="check-row"
                aria-pressed={on}
                onClick={() => toggle(key)}
                data-testid="task-row"
              >
                <span class="check-circle" aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                <span class="check-text">{task}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p class="prep-makes">Makes: {group.makes}</p>
    </section>
  );
}

export function WalkthroughMode({ recipe, doc, cook, update, addTimer, saving, failed, onFinish }: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  const stage: WalkthroughStage = cook.stage ?? 'start';
  const firstPrep = doc.prep.filter((p) => p.when === 'start');
  const last = Math.max(0, doc.cook.length - 1);
  const stepIndex = Math.min(Math.max(0, cook.step ?? 0), last);
  const servings = cook.servings ?? recipe.servings ?? 1;

  // A new stage or step starts at its title.
  useEffect(() => {
    title.current?.focus();
  }, [stage]);

  const go = (next: WalkthroughStage, step?: number) => {
    update((c) => ({ ...c, stage: next, step: step ?? c.step ?? 0 }));
    window.scrollTo?.(0, 0);
  };
  const toggle = (key: string) =>
    update((c) => ({
      ...c,
      checked: c.checked.includes(key) ? c.checked.filter((k) => k !== key) : [...c.checked, key],
    }));
  const setServings = (n: number) =>
    update((c) => ({ ...c, servings: Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, n)) }));

  let body;
  let back: { label: string; onClick: () => void } | null = null;
  let primary: { label: string; onClick: () => void; testId: string };

  if (stage === 'start') {
    body = (
      <>
        <p class="stage-label">Walkthrough</p>
        <h2 class="stage-title" ref={title} tabIndex={-1}>
          Before you start
        </h2>
        <section class="card">
          <div class="plan-row">
            <div class="stepper" role="group" aria-label="Servings">
              <span class="field-label">
                Servings
                <span class="hint">Amounts scale. Times don't.</span>
              </span>
              <button
                type="button"
                class="icon-btn"
                aria-label="One fewer serving"
                disabled={servings <= MIN_SERVINGS}
                onClick={() => setServings(servings - 1)}
              >
                −
              </button>
              <span class="stepper-value" data-testid="walk-servings">
                {servings}
              </span>
              <button
                type="button"
                class="icon-btn"
                aria-label="One more serving"
                disabled={servings >= MAX_SERVINGS}
                onClick={() => setServings(servings + 1)}
              >
                +
              </button>
            </div>
          </div>
          <div class="plan-row">
            <h3 class="card-label">The plan</h3>
            <p data-testid="walk-plan">{planText(doc)}</p>
          </div>
          {(doc.equipment ?? []).length > 0 && (
            <div class="plan-row">
              <h3 class="card-label">You'll need</h3>
              <p data-testid="walk-equipment">{(doc.equipment ?? []).join(' · ')}</p>
            </div>
          )}
        </section>
        {doc.note && <p class="hint walk-note">{doc.note}</p>}
      </>
    );
    primary = firstPrep.length
      ? { label: 'Start prep', onClick: () => go('prep'), testId: 'walk-primary' }
      : { label: 'Start cooking', onClick: () => go('cook', 0), testId: 'walk-primary' };
  } else if (stage === 'prep') {
    const tasks = firstPrep.reduce((a, p) => a + p.tasks.length, 0);
    const done = firstPrep.reduce((a, p) => a + ticked(p, cook.checked), 0);
    body = (
      <>
        <p class="stage-label" data-testid="prep-label">
          Prep · {done} of {tasks} done
        </p>
        <h2 class="stage-title" ref={title} tabIndex={-1}>
          Get these ready
        </h2>
        {firstPrep.map((g) => (
          <PrepCard key={g.id} group={g} recipe={recipe} doc={doc} cook={cook} toggle={toggle} />
        ))}
      </>
    );
    back = { label: 'Back', onClick: () => go('start') };
    primary = {
      label: done < tasks ? 'Start cooking anyway' : 'Start cooking',
      onClick: () => go('cook', 0),
      testId: 'walk-primary',
    };
  } else {
    body = (
      <>
        <p class="stage-label" data-testid="cook-label">
          Cooking · step {stepIndex + 1} of {doc.cook.length}
        </p>
        <h2 class="visually-hidden" ref={title} tabIndex={-1}>
          Cooking
        </h2>
        <ol class="card steps-card plain-list" data-testid="steps">
          {doc.cook.map((s, i) => (
            <StepItem
              key={s.id}
              step={s}
              index={i}
              current={stepIndex}
              recipe={recipe}
              doc={doc}
              cook={cook}
              toggle={toggle}
              addTimer={addTimer}
              open={() => update((c) => ({ ...c, step: i }))}
            />
          ))}
        </ol>
      </>
    );
    back =
      stepIndex > 0
        ? { label: 'Back', onClick: () => update((c) => ({ ...c, step: Math.max(0, (c.step ?? 0) - 1) })) }
        : firstPrep.length
          ? { label: 'Prep', onClick: () => go('prep') }
          : { label: 'Before you start', onClick: () => go('start') };
    primary =
      stepIndex < last
        ? {
            label: `Next: ${doc.cook[stepIndex + 1].title}`,
            onClick: () => update((c) => ({ ...c, step: Math.min(last, (c.step ?? 0) + 1) })),
            testId: 'walk-primary',
          }
        : {
            label: saving ? 'Saving…' : failed ? 'Try again' : 'Finish',
            onClick: onFinish,
            testId: 'finish',
          };
  }

  return (
    <>
      <div class="cook-body walkthrough" data-testid={`walk-${stage}`}>
        {body}
        {failed && (
          <p role="status" class="danger-text" data-testid="finish-failed">
            Couldn't save the cook.
          </p>
        )}
      </div>
      <div class="cook-actions">
        {back && (
          <button type="button" class="btn btn-secondary walk-back" onClick={back.onClick} data-testid="walk-back">
            {back.label}
          </button>
        )}
        <button
          type="button"
          class="btn btn-primary btn-finish walk-next"
          disabled={saving && primary.testId === 'finish'}
          onClick={primary.onClick}
          data-testid={primary.testId}
        >
          {primary.label}
        </button>
      </div>
    </>
  );
}

function StepItem({
  step,
  index,
  current,
  recipe,
  doc,
  cook,
  toggle,
  addTimer,
  open,
}: {
  step: CookStep;
  index: number;
  current: number;
  recipe: RecipeDetail;
  doc: Walkthrough;
  cook: ActiveCook;
  toggle: (key: string) => void;
  addTimer: (minutes: number, label: string, step: string) => void;
  open: () => void;
}) {
  const now = index === current;
  const past = index < current;
  const clock = step.timer ?? step.wait;
  const running = cook.timers.some((t) => t.step === step.id);
  const meanwhile = (step.meanwhile ?? [])
    .map((id) => doc.prep.find((p) => p.id === id))
    .filter((g): g is PrepGroup => !!g);
  const uses = step.uses ?? [];
  return (
    <li class={now ? 'step-item is-now' : past ? 'step-item is-past' : 'step-item'} data-testid="step-item">
      <button
        type="button"
        class="step-head"
        aria-expanded={now}
        onClick={open}
        data-testid="step-head"
        id={`step-head-${step.id}`}
      >
        <span class="step-num" aria-current={now ? 'step' : undefined}>
          {past ? '✓' : index + 1}
        </span>
        <span class="step-title">{step.title}</span>
        {clock && <span class="step-chip">{clock.min} min</span>}
      </button>
      {now && (
        <div class="step-body" data-testid="step-body">
          {step.heat && <p class="heat-chip">Heat: {step.heat}</p>}
          <p class="step-do">{step.do}</p>
          {uses.length > 0 && (
            <div class="uses-card">
              <UsesRows uses={uses} recipe={recipe} doc={doc} cook={cook} />
            </div>
          )}
          {step.lookFor && (
            <p class="look-for">
              <strong>Look for:</strong> {step.lookFor}
            </p>
          )}
          {clock &&
            (running ? (
              <p class="hint timer-running" data-testid="timer-running">
                {step.timer ? 'Timer' : 'Wait'} running above. It doesn't move you on; tap Next when it's ready.
              </p>
            ) : (
              <button
                type="button"
                class="btn btn-secondary btn-block step-timer"
                onClick={() => addTimer(clock.min, clock.label, step.id)}
                data-testid="step-timer"
              >
                Start {clock.min} min {step.timer ? 'timer' : 'wait'}
              </button>
            ))}
          {meanwhile.map((g) => (
            <div key={g.id} class="meanwhile" data-testid="meanwhile">
              <p class="card-label">Meanwhile</p>
              <PrepCard group={g} recipe={recipe} doc={doc} cook={cook} toggle={toggle} />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
