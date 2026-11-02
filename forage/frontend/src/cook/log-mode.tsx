// Log mode (#708): the route `#/cook/<recipe id>[?plan=<plan id>]`, full screen
// with no tab bar. The source's ingredient lines and steps as a checklist, an
// elapsed clock and quick timers. A timer counts down and rings; it never
// checks, advances or finishes anything. The cook in progress is kept in
// localStorage (cook-store.ts), so a reload returns to it exactly.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import { SLOTS, type Cook, type RecipeDetail, type Slot } from '../api/types';
import { librarySection } from '../library/foods-store';
import { recipesNotice, reopenRecipe } from '../library/recipes-store';
import { cookHash, setLeaveGuard } from '../shell/routes';
import { Sheet } from '../ui/sheet';
import { clearCook, readCook, writeCook, type ActiveCook, type CookTimer } from './cook-store';
import {
  clockText,
  durationWords,
  localDate,
  newCookId,
  servingsText,
  shortDate,
  slotForTime,
  timerLabel,
} from './format';

interface Props {
  api: ForageApi;
  recipeId: string;
  planId: string;
}

/** The most timers at once. */
export const MAX_TIMERS = 6;
const QUICK = [5, 10, 30, 60];

type Phase = 'cooking' | 'saving' | 'failed' | 'done';

/** Rows in source order, a heading row wherever the section changes. Empty text is skipped. */
function grouped<T extends { section: string; text: string }>(items: T[]): ({ heading: string } | { item: T })[] {
  const out: ({ heading: string } | { item: T })[] = [];
  let section = '';
  for (const item of items) {
    if (!item.text.trim()) continue;
    if (item.section && item.section !== section) out.push({ heading: item.section });
    section = item.section;
    out.push({ item });
  }
  return out;
}

/** Go to a hash, keeping the query (and so `?demo=true`). */
function goTo(hash: string, replace = false): void {
  const { pathname, search } = window.location;
  if (replace) window.location.replace(`${pathname}${search}${hash}`);
  else window.location.hash = hash;
}

function CheckRow({
  checked,
  onToggle,
  children,
  testId,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ComponentChildren;
  testId: string;
}) {
  return (
    <li>
      <button type="button" class="check-row" aria-pressed={checked} onClick={onToggle} data-testid={testId}>
        <span class="check-circle" aria-hidden="true">
          {checked ? '✓' : ''}
        </span>
        <span class="check-text">{children}</span>
      </button>
    </li>
  );
}

export function LogMode({ api, recipeId, planId }: Props) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [cook, setCook] = useState<ActiveCook | null>(null);
  const [other, setOther] = useState<ActiveCook | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('cooking');
  const [saved, setSaved] = useState<Cook | null>(null);
  const [asking, setAsking] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const announced = useRef(new Set<string>());
  const title = useRef(document.title);
  const live = useRef({ cook, phase });
  live.current = { cook, phase };

  function start(r: RecipeDetail) {
    const c: ActiveCook = {
      recipe_id: r.id,
      recipe_name: r.name,
      started_at: Date.now(),
      checked: [],
      timers: [],
      plan_id: planId,
      cook_id: newCookId(),
    };
    writeCook(c);
    setCook(c);
    setNow(Date.now());
  }

  function update(fn: (c: ActiveCook) => ActiveCook) {
    setCook((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      writeCook(next);
      return next;
    });
  }

  // The recipe, then the cook: resumed, asked about, or started.
  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    api
      .getRecipe(recipeId)
      .then((r) => {
        if (!alive) return;
        setRecipe(r);
        const stored = readCook();
        if (stored && stored.recipe_id === r.id) setCook(stored);
        else if (stored) setOther(stored);
        else start(r);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && /not found/i.test(err.message)) {
          recipesNotice.value = "That recipe isn't in your library.";
          librarySection.value = 'recipes';
          goTo('#/library', true);
        } else setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [api, recipeId, attempt]);

  // The clock and the timers, once a second and whenever the tab comes back.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Keep the screen on over the stove: best effort, asked again when the tab returns.
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    let alive = true;
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    const request = async () => {
      try {
        const got = await nav.wakeLock?.request('screen');
        if (alive) lock = got ?? null;
        else void got?.release().catch(() => {});
      } catch {
        // Refused or unsupported: the cook works without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      if (live.current.phase !== 'done') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release?.().catch(() => {});
      document.title = title.current;
    };
  }, []);

  // Back mid-cook asks first, as ✕ does.
  useEffect(() => {
    setLeaveGuard(() => {
      const { cook: c, phase: p } = live.current;
      if (!c || p === 'done') return false;
      setAsking(true);
      return true;
    });
    return () => setLeaveGuard(null);
  }, []);

  // Focus the heading once the screen is there.
  useEffect(() => {
    if (recipe && cook) heading.current?.focus();
  }, [!!recipe && !!cook]);

  // A timer at zero: "Done", a vibration, an announcement and the page title. Once each.
  useEffect(() => {
    if (!cook || phase === 'done') return;
    const fresh = cook.timers.filter((t) => t.ends_at <= now && !announced.current.has(t.id));
    if (!fresh.length) return;
    fresh.forEach((t) => announced.current.add(t.id));
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // Not everywhere.
    }
    setAnnounce(fresh.map((t) => `${timerLabel(t.minutes)} timer is done`).join('. '));
    document.title = 'Timer done · Forage';
  }, [now, cook, phase]);

  function toggle(key: string) {
    if (phase === 'done') return;
    update((c) => ({
      ...c,
      checked: c.checked.includes(key) ? c.checked.filter((k) => k !== key) : [...c.checked, key],
    }));
  }

  function addTimer(minutes: number) {
    if (!cook) return;
    if (cook.timers.length >= MAX_TIMERS) {
      setStatus('Six timers is the most. Remove one first.');
      return;
    }
    setStatus(null);
    const t: CookTimer = {
      id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      minutes,
      ends_at: Date.now() + minutes * 60000,
    };
    update((c) => ({ ...c, timers: [...c.timers, t] }));
    setNow(Date.now());
  }

  function removeTimer(id: string) {
    update((c) => ({ ...c, timers: c.timers.filter((t) => t.id !== id) }));
    announced.current.delete(id);
    setStatus(null);
    document.title = title.current;
  }

  function leave() {
    clearCook();
    setLeaveGuard(null);
    document.title = title.current;
    reopenRecipe.value = { id: recipeId, focusCook: true };
    librarySection.value = 'recipes';
    goTo('#/library');
  }

  function close() {
    setLeaveGuard(null);
    document.title = title.current;
    if (cook?.plan_id) {
      goTo('#/plan');
      return;
    }
    reopenRecipe.value = { id: recipeId, focusCook: true };
    librarySection.value = 'recipes';
    goTo('#/library');
  }

  async function finish() {
    if (!cook) return;
    const at = Date.now();
    setStoppedAt(at);
    setNow(at);
    setPhase('saving');
    setStatus(null);
    try {
      const fields: Partial<Cook> & { id: string } = { id: cook.cook_id, recipe_id: cook.recipe_id, rating: null };
      if (cook.plan_id) fields.plan_id = cook.plan_id;
      const stored = await api.saveCook(fields);
      clearCook();
      setSaved(stored);
      setPhase('done');
      document.title = title.current;
    } catch {
      // The clock keeps running, and the checklist and timers stay.
      setStoppedAt(null);
      setPhase('failed');
    }
  }

  if (loadFailed || (!recipe && !other)) {
    return (
      <div class="cook-screen" data-testid="log-mode">
        <header class="cook-header">
          <div class="cook-header-row">
            <button type="button" class="icon-btn" aria-label="Leave" onClick={() => goTo('#/library')}>
              ✕
            </button>
            <h1 class="cook-title">Log mode</h1>
          </div>
        </header>
        <div class="cook-body">
          {loadFailed ? (
            <div role="status" class="library-status danger-text">
              <p>Couldn't load this recipe.</p>
              <button type="button" class="text-btn" onClick={() => setAttempt(attempt + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <p role="status">Loading…</p>
          )}
        </div>
      </div>
    );
  }

  if (other && !cook) {
    return (
      <div class="cook-screen" data-testid="log-mode">
        <Sheet
          title={`You're already cooking ${other.recipe_name}.`}
          onClose={() => {}}
          closable={false}
          testId="cook-conflict"
        >
          <div class="sheet-actions">
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => goTo(cookHash(other.recipe_id, other.plan_id))}
            >
              Go to it
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              onClick={() => {
                setOther(null);
                if (recipe) start(recipe);
              }}
            >
              Start this one instead
            </button>
          </div>
        </Sheet>
      </div>
    );
  }

  if (!recipe || !cook) return null;

  const elapsed = (stoppedAt ?? now) - cook.started_at;
  const lines = grouped(recipe.lines);
  const steps = grouped(recipe.steps);
  const serves = recipe.servings ? `serves ${recipe.servings}` : '';

  return (
    <div class="cook-screen" data-testid="log-mode">
      <header class="cook-header">
        <div class="cook-header-row">
          <button
            type="button"
            class="icon-btn"
            aria-label="Leave"
            onClick={() => (phase === 'done' ? close() : setAsking(true))}
            data-testid="cook-leave"
          >
            ✕
          </button>
          <h1 class="cook-title" ref={heading} tabIndex={-1}>
            {recipe.name}
          </h1>
          <span class="cook-clock" aria-hidden="true" data-testid="cook-clock">
            {clockText(elapsed)}
          </span>
          <button type="button" class="visually-hidden" aria-label={`Elapsed time, ${durationWords(elapsed)}`}>
            Elapsed time
          </button>
        </div>
        {phase !== 'done' && cook.timers.length > 0 && (
          <div class="timer-row" data-testid="timer-row">
            {cook.timers.map((t) => {
              const left = t.ends_at - now;
              const done = left <= 0;
              const label = timerLabel(t.minutes);
              return (
                <div key={t.id} class={done ? 'timer-chip is-done' : 'timer-chip'} data-testid="timer-chip">
                  <span>{label}</span>
                  <span class="tabular" data-testid="timer-left">
                    {done ? 'Done' : clockText(Math.ceil(left / 1000) * 1000)}
                  </span>
                  <button
                    type="button"
                    class="icon-btn timer-remove"
                    aria-label={`Remove the ${label} timer`}
                    onClick={() => removeTimer(t.id)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </header>
      <p class="visually-hidden" role="status" data-testid="timer-announce">
        {announce}
      </p>

      {phase === 'done' && saved ? (
        <DoneScreen api={api} recipe={recipe} cook={saved} elapsed={elapsed} onClose={close} />
      ) : (
        <>
          <div class="cook-body">
            <section class="card" aria-labelledby="cook-ingredients">
              <div class="cook-card-head">
                <h2 class="card-label" id="cook-ingredients">
                  Ingredients
                </h2>
                <span class="hint">{['as written', serves].filter(Boolean).join(' · ')}</span>
              </div>
              <ul class="plain-list">
                {lines.map((row, i) =>
                  'heading' in row ? (
                    <li key={`h${i}`} class="check-heading">
                      {row.heading}
                    </li>
                  ) : (
                    <CheckRow
                      key={row.item.line_id}
                      checked={cook.checked.includes(row.item.line_id)}
                      onToggle={() => toggle(row.item.line_id)}
                      testId="check-line"
                    >
                      {row.item.text}
                      {row.item.optional && ' (optional)'}
                    </CheckRow>
                  ),
                )}
              </ul>
            </section>

            <section class="card" aria-labelledby="cook-steps">
              <div class="cook-card-head">
                <h2 class="card-label" id="cook-steps">
                  Steps
                </h2>
                {recipe.source_site && <span class="hint">from {recipe.source_site}</span>}
              </div>
              {steps.length === 0 ? (
                <p class="hint">This recipe has no steps. Cook from the ingredients.</p>
              ) : (
                <ul class="plain-list">
                  {steps.map((row, i) =>
                    'heading' in row ? (
                      <li key={`h${i}`} class="check-heading">
                        {row.heading}
                      </li>
                    ) : (
                      <CheckRow
                        key={`S${row.item.position}`}
                        checked={cook.checked.includes(`S${row.item.position}`)}
                        onToggle={() => toggle(`S${row.item.position}`)}
                        testId="check-step"
                      >
                        {row.item.name ? (
                          <>
                            <strong>
                              {row.item.position}. {row.item.name}
                            </strong>
                            <span class="step-text">{row.item.text}</span>
                          </>
                        ) : (
                          <>
                            {row.item.position}. {row.item.text}
                          </>
                        )}
                      </CheckRow>
                    ),
                  )}
                </ul>
              )}
            </section>

            <section class="card" aria-labelledby="cook-timers">
              <h2 class="card-label" id="cook-timers">
                Timers
              </h2>
              <div class="chip-row">
                {QUICK.map((m) => (
                  <button key={m} type="button" class="chip" onClick={() => addTimer(m)} data-testid={`timer-${m}`}>
                    {timerLabel(m)}
                  </button>
                ))}
                <button
                  type="button"
                  class="chip"
                  aria-expanded={custom !== null}
                  onClick={() => setCustom(custom === null ? '' : null)}
                  data-testid="timer-custom"
                >
                  Custom
                </button>
              </div>
              {custom !== null && (
                <form
                  class="inline-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Number(custom);
                    if (!Number.isInteger(n) || n < 1 || n > 600) {
                      setStatus('A timer is 1 to 600 minutes.');
                      return;
                    }
                    addTimer(n);
                    setCustom(null);
                  }}
                >
                  <label class="visually-hidden" for="custom-minutes">
                    Minutes
                  </label>
                  <input
                    id="custom-minutes"
                    class="field"
                    inputMode="numeric"
                    placeholder="Minutes"
                    value={custom}
                    onInput={(e) => setCustom((e.target as HTMLInputElement).value)}
                    data-testid="custom-minutes"
                  />
                  <button type="submit" class="btn btn-secondary">
                    Start
                  </button>
                </form>
              )}
              {status && (
                <p role="status" class="hint">
                  {status}
                </p>
              )}
            </section>
            {phase === 'failed' && (
              <p role="status" class="danger-text" data-testid="finish-failed">
                Couldn't save the cook.
              </p>
            )}
          </div>
          <div class="cook-actions">
            <button
              type="button"
              class="btn btn-primary btn-finish"
              disabled={phase === 'saving'}
              onClick={() => void finish()}
              data-testid="finish"
            >
              {phase === 'saving' ? 'Saving…' : phase === 'failed' ? 'Try again' : 'Finish'}
            </button>
          </div>
        </>
      )}

      {asking && (
        <Sheet title="Leave this cook?" onClose={() => setAsking(false)} closable={false} testId="leave-cook">
          <p class="sheet-message">Nothing is recorded.</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-primary" onClick={() => setAsking(false)} data-autofocus>
              Keep cooking
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              onClick={() => {
                setAsking(false);
                leave();
              }}
            >
              Leave
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

interface DoneProps {
  api: ForageApi;
  recipe: RecipeDetail;
  cook: Cook;
  elapsed: number;
  onClose: () => void;
}

/** "Done cooking": the time it took, the cook recorded, and an offer to log servings to Eaten. No rating here. */
function DoneScreen({ api, recipe, cook, elapsed, onClose }: DoneProps) {
  const [servings, setServings] = useState(1);
  const [slot, setSlot] = useState<Slot>(() => slotForTime());
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState<{ n: number; slot: Slot } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [logId] = useState(() => `lg_${newCookId().slice(3)}`);

  async function log() {
    setLogging(true);
    setStatus(null);
    try {
      await api.logFood({
        id: logId,
        date: cook.date || localDate(),
        slot,
        recipe_id: recipe.id,
        qty: servings,
        unit: 'serving',
      });
      setLogged({ n: servings, slot });
      setStatus(`Logged ${servingsText(servings)} to Eaten (${slot})`);
    } catch {
      setStatus("Couldn't log it to Eaten.");
    } finally {
      setLogging(false);
    }
  }

  async function undo() {
    setStatus(null);
    try {
      await api.deleteCook(cook.id);
      setRemoved(true);
      setStatus('Cook removed.');
    } catch {
      setStatus("Couldn't remove the cook. Try again.");
    }
  }

  const failedLog = status === "Couldn't log it to Eaten.";
  return (
    <>
      <div class="cook-body" data-testid="cook-done">
        <h2 class="done-title">Done cooking</h2>
        <section class="card">
          <p class="done-time" data-testid="done-time">
            {clockText(elapsed)}
          </p>
          <p class="hint">
            {['Log mode', recipe.servings ? `serves ${recipe.servings}` : ''].filter(Boolean).join(' · ')}
          </p>
          <p>{removed ? 'Cook removed.' : `Cook recorded for ${shortDate(cook.date)}.`}</p>
        </section>
        {!removed && (
          <>
            <p class="hint">How was it? Forage asks when you open this recipe next, once you've eaten.</p>
            <div class="stepper" role="group" aria-label="Servings eaten">
              <span class="field-label">Servings eaten</span>
              <button
                type="button"
                class="icon-btn"
                aria-label="One fewer serving"
                disabled={servings <= 1 || !!logged}
                onClick={() => setServings(servings - 1)}
              >
                −
              </button>
              <span class="stepper-value" data-testid="servings">
                {servings}
              </span>
              <button
                type="button"
                class="icon-btn"
                aria-label="One more serving"
                disabled={servings >= 12 || !!logged}
                onClick={() => setServings(servings + 1)}
              >
                +
              </button>
            </div>
            <div class="chip-row" role="group" aria-label="Meal">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  class="chip"
                  aria-pressed={slot === s}
                  disabled={!!logged}
                  onClick={() => setSlot(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {!logged && (
              <button type="button" class="text-btn" onClick={() => void undo()} data-testid="undo-cook">
                Undo this cook
              </button>
            )}
          </>
        )}
        {status && !removed && (
          <p role="status" class={failedLog ? 'danger-text' : 'hint'} data-testid="done-status">
            {status}
            {logged && (
              <>
                {' '}
                <a href="#/eaten">View</a>
              </>
            )}
          </p>
        )}
        {removed && (
          <p role="status" class="hint">
            Cook removed.
          </p>
        )}
      </div>
      <div class="cook-actions">
        <button type="button" class="btn btn-secondary" onClick={onClose} data-testid="done-close">
          Close
        </button>
        {!removed && (
          <button
            type="button"
            class="btn btn-primary"
            disabled={logging || !!logged}
            onClick={() => void log()}
            data-testid="log-eaten"
          >
            {logged
              ? `Logged ${servingsText(logged.n)} to Eaten (${logged.slot})`
              : failedLog
                ? 'Try again'
                : `Log ${servingsText(servings)} to Eaten`}
          </button>
        )}
      </div>
    </>
  );
}
