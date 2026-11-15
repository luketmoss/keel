import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Combo, Food, FoodLogEntry, RecipeSummary, Slot, Usual } from '../api/types';
import { comboKcalText } from '../library/combos-store';
import { FoodName } from '../library/food-name';
import { hasNutrition } from '../library/food-math';
import { foodsInShort, startKcalText } from '../library/usuals-store';
import { Sheet } from '../ui/sheet';
import type { LogTarget } from './amount-sheet';
import { addCombos, addFailed, addLists, refreshAdd } from './add-store';
import { recipeLoggable, wholeKcal } from './format';
import { usualsFor } from './usual-group';
import { TrayView } from './tray-view';
import {
  TRAY_FULL,
  TRAY_MAX,
  closePromptTitle,
  comboItems,
  comboWhen,
  footerText,
  lastEntries,
  liveItems,
  looseItem,
  newItem,
  pickOption,
  removeGroup,
  removeItem,
  rowAmount,
  searchTargets,
  setAmount,
  targetId,
  targetName,
  toggleChip,
  trayTotals,
  usualItems,
  usualsMatching,
  type TrayItem,
} from './tray';

/** How many recents the sheet lists, and how many rows a search shows. */
const RECENT_MAX = 10;
const RESULTS_MAX = 20;
const FALLBACK_RECIPES = 3;
const NO_COMBOS: Combo[] = [];

/** A row of the Add sheet: a food or a recipe. */
type Row = { key: string; target: LogTarget };

interface Props {
  api: ForageApi;
  slot: Slot;
  today: string;
  /** What is going into the meal, held by the screen so it survives a sheet opened over this one. */
  items: TrayItem[];
  onItems: (change: (items: TrayItem[]) => TrayItem[]) => void;
  /** The search text to open with: the pass's, or a starter food just added. */
  initialQuery?: string;
  /** The search text as it changes, so the pass can keep it while another sheet is open. */
  onQuery?: (q: string) => void;
  /** The usuals (#885), most recently used first; empty until they load, or when there are none. */
  usuals?: Usual[];
  /** One with no nutrition: #707's food form, or the recipe's Nutrition sheet. */
  onAddNutrition: (target: LogTarget) => void;
  /** Not here? Add a food: #707's Add a food sheet. */
  onAddFood: () => void;
  /** The footer button, and the close prompt's Add: one `logMeal`, and the sheet is gone. */
  onSave: () => void;
  /** The close prompt's Discard: the sheet closes and the tray is dropped. */
  onDiscard: () => void;
  /** Close, Escape or the backdrop with an empty tray. */
  onClose: () => void;
}

/** The foods and recipes most recently logged, newest first, each once, leaving out foods without nutrition. */
export function recentRows(log: FoodLogEntry[], foods: Food[], recipes: RecipeSummary[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  const newest = [...log].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  for (const e of newest) {
    const key = e.food_id || e.recipe_id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.food_id) {
      const f = foods.find((x) => x.id === e.food_id);
      if (f && hasNutrition(f)) out.push({ key, target: { kind: 'food', food: f } });
    } else {
      const r = recipes.find((x) => x.id === e.recipe_id);
      if (r) out.push({ key, target: { kind: 'recipe', recipe: r } });
    }
    if (out.length === RECENT_MAX) break;
  }
  return out;
}

const loggable = (t: LogTarget) => (t.kind === 'food' ? hasNutrition(t.food) : recipeLoggable(t.recipe));

/** The Usuals section (#885): one row per usual. A tap drops its lines into the tray as a group. */
function UsualRows({
  usuals,
  label,
  foods,
  disabled,
  onAdd,
}: {
  usuals: Usual[];
  label: string;
  foods: Map<string, Food>;
  disabled: (u: Usual) => boolean;
  onAdd: (u: Usual) => void;
}) {
  if (!usuals.length) return null;
  return (
    <>
      <p class="card-label" id="usuals-label">
        {label}
      </p>
      <ul class="plain-list" aria-labelledby="usuals-label" data-testid="usuals-list">
        {usuals.map((u) => {
          const short = foodsInShort(u, foods);
          const kcal = startKcalText(u);
          return (
            <li key={u.id}>
              <button
                type="button"
                class="log-row"
                onClick={() => onAdd(u)}
                disabled={disabled(u)}
                aria-label={`${u.name}, ${short}${kcal ? `, ${kcal}` : ''}, add`}
                data-testid="usual-result"
              >
                <span class="recipe-text">
                  <span class="recipe-name">{u.name}</span>
                  <span class="recipe-meta">{short}</span>
                </span>
                {kcal ? <span class="log-row-kcal tabular">{kcal}</span> : <span class="chip-flag">—</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Often eaten together (#888): one collapsed row, closed every time the sheet opens. Open, it lists the combos for
 * this meal. They load behind it, so their arrival moves nothing above it.
 */
function ComboRows({
  combos,
  foods,
  today,
  open,
  onToggle,
  disabled,
  onAdd,
}: {
  combos: Combo[];
  foods: Map<string, Food>;
  today: string;
  open: boolean;
  onToggle: () => void;
  disabled: (c: Combo) => boolean;
  onAdd: (c: Combo) => void;
}) {
  if (!combos.length) return null;
  return (
    <div class="combos-together">
      <button
        type="button"
        class="together-row"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="together-list"
        data-testid="together-toggle"
      >
        <span>Often eaten together ({combos.length})</span>
        <span class="together-chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ul class="plain-list" id="together-list" data-testid="combos-list">
          {combos.map((c) => {
            const kcal = comboKcalText(c, foods);
            const when = comboWhen(c, today);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  class="log-row"
                  onClick={() => onAdd(c)}
                  disabled={disabled(c)}
                  aria-label={`${c.name}, ${when}${kcal ? `, ${kcal}` : ''}, add`}
                  data-testid="combo-result"
                >
                  <span class="recipe-text">
                    <span class="recipe-name usual-foods">{c.name}</span>
                    <span class="recipe-meta">{when}</span>
                  </span>
                  {kcal ? <span class="log-row-kcal tabular">{kcal}</span> : <span class="chip-flag">—</span>}
                  <span class="log-row-plus" aria-hidden="true">
                    +
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A food or recipe: one tap puts it in the tray at the amount last logged, or opens it when it is already there. */
function ResultRow({
  target,
  last,
  inTray,
  full,
  onTap,
  onAddNutrition,
}: {
  target: LogTarget;
  last: Map<string, FoodLogEntry>;
  inTray: boolean;
  full: boolean;
  onTap: () => void;
  onAddNutrition: () => void;
}) {
  const ok = loggable(target);
  const name = targetName(target);
  const amount = ok ? rowAmount(target, last) : null;
  const line = amount
    ? `${amount.text}${amount.kcal === null ? '' : ` · ${wholeKcal(amount.kcal)} kcal`}`
    : 'No nutrition yet';
  const label = !ok
    ? `${name}, no nutrition yet, add nutrition`
    : inTray
      ? `${name}, in the tray, edit`
      : `${name}, ${amount!.text}${amount!.kcal === null ? '' : `, ${wholeKcal(amount!.kcal)} kcal`}, add`;
  return (
    <li>
      <button
        type="button"
        class="log-row"
        onClick={ok ? onTap : onAddNutrition}
        disabled={ok && !inTray && full}
        aria-label={label}
        data-testid="add-result"
      >
        <span class="recipe-text">
          <span class={ok ? 'recipe-name' : 'recipe-name status-muted'}>
            {target.kind === 'food' ? <FoodName food={target.food} /> : name}
          </span>
          <span class="recipe-meta">{line}</span>
        </span>
        {ok ? (
          <span class={inTray ? 'log-row-plus is-in' : 'log-row-plus'} aria-hidden="true">
            {inTray ? '✓' : '+'}
          </span>
        ) : (
          <span class="log-row-action">Add nutrition</span>
        )}
      </button>
    </li>
  );
}

/**
 * The Add sheet (#712, rebuilt around a tray in #933): a search over foods, recipes and usuals; the tray, where one
 * tap puts what was picked at the amount last logged, edited in place; and one button that saves the meal. Its lists
 * are held in `add-store.ts` (#931): what is held shows on the first frame, and one refresh an open swaps in behind it.
 * Nothing is saved while picking.
 */
export function AddSheet({
  api,
  slot,
  today,
  items,
  onItems,
  initialQuery = '',
  onQuery,
  usuals = [],
  onAddNutrition,
  onAddFood,
  onSave,
  onDiscard,
  onClose,
}: Props) {
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [together, setTogether] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const recents = useRef<{ keys: string[]; fallback: boolean } | null>(null);

  const lists = addLists.value;
  /** #888: the combos held for this meal; none until they load, and when that fails, so the sheet works without them. */
  const combos = addCombos.value[slot] ?? NO_COMBOS;
  const failed = addFailed.value;
  const foods = lists?.foods ?? null;
  const recipes = lists?.recipes ?? [];
  const log = lists?.log ?? [];
  const foodMap = useMemo(() => new Map((foods ?? []).map((f) => [f.id, f])), [foods]);
  const last = useMemo(() => lastEntries(log), [log]);

  useEffect(() => {
    void refreshAdd(api, slot, today);
  }, [api]);
  useEffect(() => onQuery?.(q), [q]);

  const meal = slot.toLowerCase();
  const text = q.trim();
  const count = liveItems(items).length;
  const full = count >= TRAY_MAX;
  const totals = trayTotals(items);

  // Recent is worked out once, when the lists first show, and not again while the sheet is open.
  if (foods && !recents.current) {
    const rows = recentRows(log, foods, recipes);
    recents.current = rows.length
      ? { keys: rows.map((r) => r.key), fallback: false }
      : { keys: recipes.slice(0, FALLBACK_RECIPES).map((r) => r.id), fallback: true };
  }

  function say(message: string) {
    setStatus(message);
  }

  /** A food or recipe row tapped: into the tray at its amount, or, when it is already there, its editor. */
  function tap(target: LogTarget) {
    const hit = looseItem(items, target);
    if (hit) {
      setOpen(hit.id);
      setFresh(hit.id);
      return;
    }
    if (full) return;
    const item = newItem(target, last);
    onItems((prev) => (prev.length >= TRAY_MAX ? prev : [...prev, item]));
    setFresh(item.id);
    say(`Added ${targetName(target)}`);
    if (text) {
      setQ('');
      search.current?.focus();
    }
  }

  function addGroup(made: TrayItem[], name: string) {
    if (!made.length) return;
    if (count + liveItems(made).length > TRAY_MAX) {
      say(TRAY_FULL);
      return;
    }
    onItems((prev) => [...prev, ...made]);
    setFresh(made[0].id);
    const shown = liveItems(made).length;
    say(shown === 1 ? `Added ${name}` : `Added ${name}, ${shown} items`);
    if (text) {
      setQ('');
      search.current?.focus();
    }
  }

  /** #942: an optional line's chip: its item comes in at its home amount, or goes out. */
  function toggle(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item || !item.optional) return;
    if (item.off && full) {
      say(TRAY_FULL);
      return;
    }
    onItems((prev) => (item.off && liveItems(prev).length >= TRAY_MAX ? prev : toggleChip(prev, id)));
    setOpen(null);
    setPickOpen(null);
    if (item.off) setFresh(id);
    say(
      `${item.off ? 'Added' : 'Removed'} ${targetName(item.home ? { kind: 'food', food: item.home.food } : item.target)}`,
    );
  }

  function remove(id: string) {
    const item = items.find((i) => i.id === id);
    onItems((prev) => removeItem(prev, id));
    setOpen(null);
    setPickOpen(null);
    if (item) say(`Removed ${targetName(item.target)}`);
  }

  function removeAll(key: string) {
    const name = items.find((i) => i.group?.key === key)?.group?.name ?? '';
    onItems((prev) => removeGroup(prev, key));
    setOpen(null);
    setPickOpen(null);
    say(`Removed ${name}`);
  }

  function requestClose() {
    if (count) setConfirming(true);
    else onClose();
  }

  const groupFits = (n: number) => count + n <= TRAY_MAX;
  const rowFor = (target: LogTarget) => (
    <ResultRow
      key={`${target.kind}:${targetId(target)}`}
      target={target}
      last={last}
      inTray={!!looseItem(items, target)}
      full={full}
      onTap={() => tap(target)}
      onAddNutrition={() => onAddNutrition(target)}
    />
  );

  let body;
  if (failed) {
    body = (
      <div class="library-status danger-text" role="status">
        <p>Couldn't load your foods.</p>
        <button type="button" class="text-btn" onClick={() => void refreshAdd(api, slot, today, true)}>
          Try again
        </button>
      </div>
    );
  } else if (!foods) {
    body = (
      <div data-testid="add-loading">
        <div class="skeleton-row" />
        <div class="skeleton-row" />
        <div class="skeleton-row" />
      </div>
    );
  } else if (!foods.length && !recipes.length) {
    body = <p class="library-status">No foods in your library yet.</p>;
  } else if (text) {
    const targets = searchTargets(text, foods, recipes, RESULTS_MAX);
    const matching = usualsMatching(usuals, slot, text, foodMap);
    body =
      targets.length || matching.length ? (
        <>
          {targets.length > 0 && (
            <>
              <p class="card-label" id="results-label">
                Foods
              </p>
              <ul class="plain-list" aria-labelledby="results-label" data-testid="results-list">
                {targets.map(rowFor)}
              </ul>
            </>
          )}
          <UsualRows
            usuals={matching}
            label={`Usuals with ${text}`}
            foods={foodMap}
            disabled={(u) => !groupFits(u.lines.length)}
            onAdd={(u) => addGroup(usualItems(u, foodMap), u.name)}
          />
        </>
      ) : (
        <p class="library-status" data-testid="add-no-match">
          Nothing matches "{text}".
        </p>
      );
  } else {
    const keys = recents.current?.keys ?? [];
    const rows: LogTarget[] = keys.flatMap((k): LogTarget[] => {
      const f = foodMap.get(k);
      if (f) return hasNutrition(f) ? [{ kind: 'food', food: f }] : [];
      const r = recipes.find((x) => x.id === k);
      return r ? [{ kind: 'recipe', recipe: r }] : [];
    });
    const fallback = recents.current?.fallback;
    body = (
      <>
        <UsualRows
          usuals={usualsFor(usuals, slot, '')}
          label={`Usuals for ${meal}`}
          foods={foodMap}
          disabled={(u) => !groupFits(u.lines.length)}
          onAdd={(u) => addGroup(usualItems(u, foodMap), u.name)}
        />
        {fallback && <p class="library-status">Nothing logged yet. Search for a food or recipe.</p>}
        {rows.length > 0 && (
          <>
            <p class="card-label" id="add-list-label">
              {fallback ? 'Your recipes' : 'Recent'}
            </p>
            <ul class="plain-list" aria-labelledby="add-list-label" data-testid="recent-list">
              {rows.map(rowFor)}
            </ul>
          </>
        )}
        <ComboRows
          combos={combos}
          foods={foodMap}
          today={today}
          open={together}
          onToggle={() => setTogether((o) => !o)}
          disabled={(c) => !groupFits(c.lines.length)}
          onAdd={(c) => addGroup(comboItems(c, foodMap), c.name)}
        />
      </>
    );
  }

  const footer = (
    <button type="button" class="btn btn-primary btn-block" onClick={onSave} disabled={!count} data-testid="tray-save">
      {count ? footerText(totals, slot) : 'Tap foods to add them'}
    </button>
  );

  return (
    <>
      <Sheet title={`Add to ${meal}`} onClose={requestClose} testId="add-sheet" tall footer={footer}>
        <label class="visually-hidden" for="add-search">
          Search foods, recipes, usuals
        </label>
        <input
          id="add-search"
          ref={search}
          class="field"
          type="search"
          placeholder="Search foods, recipes, usuals"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          data-autofocus
          data-testid="add-search"
        />
        <p class="hint add-status" role="status" data-testid="add-status">
          {full ? TRAY_FULL : status}
        </p>
        {items.length > 0 && (
          <TrayView
            items={items}
            meal={meal}
            foods={foodMap}
            open={open}
            pickOpen={pickOpen}
            fresh={fresh}
            onOpen={(id) => {
              setOpen(id);
              setPickOpen(null);
            }}
            onPickOpen={setPickOpen}
            onFreshDone={(id) => setFresh((f) => (f === id ? null : f))}
            onAmount={(id, qty, unit) => onItems((prev) => setAmount(prev, id, qty, unit))}
            onPick={(id, option) => onItems((prev) => pickOption(prev, id, option, foodMap))}
            onRemove={remove}
            onRemoveGroup={removeAll}
            onToggle={toggle}
            full={full}
          />
        )}
        {body}
        <button
          type="button"
          class="btn btn-secondary btn-block add-food-btn"
          onClick={onAddFood}
          data-testid="not-here"
        >
          Not here? Add a food
        </button>
      </Sheet>
      {confirming && (
        <Sheet
          title={closePromptTitle(count, slot)}
          onClose={() => setConfirming(false)}
          closable={false}
          alert
          testId="close-prompt"
        >
          <p class="sheet-message">They're in the tray but not saved yet.</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" onClick={onDiscard} data-testid="prompt-discard">
              Discard
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              onClick={() => setConfirming(false)}
              data-testid="prompt-keep"
            >
              Keep adding
            </button>
            <button type="button" class="btn btn-primary" onClick={onSave} data-autofocus data-testid="prompt-add">
              Add {count}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
