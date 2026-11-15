// The tray block at the top of the Add sheet (#933): what is going into the meal, each item at its amount, edited in
// place. It holds no state of its own beyond what the sheet gives it; every figure is worked out in the app.
import { useEffect } from 'preact/hooks';
import type { Food, UsualOption } from '../api/types';
import { FoodName } from '../library/food-name';
import { labelOf } from '../library/usuals-store';
import { fractionQty, maxQty } from './amount-edit';
import { sheetGrams, wholeKcal } from './format';
import { PickOne } from './group-view';
import {
  amountText,
  atMinimum,
  itemFigures,
  labelFigures,
  liveItems,
  stepItem,
  switchedAmount,
  targetName,
  trayTotals,
  unitChoices,
  type TrayItem,
} from './tray';

interface Props {
  items: TrayItem[];
  /** `Going into breakfast`'s meal word. */
  meal: string;
  foods: Map<string, Food>;
  /** The item whose editor is open, and the pick-one list open under it. */
  open: string | null;
  pickOpen: string | null;
  fresh: string | null;
  onOpen: (id: string | null) => void;
  onPickOpen: (id: string | null) => void;
  onFreshDone: (id: string) => void;
  onAmount: (id: string, qty: number, unit: string) => void;
  onPick: (id: string, option: UsualOption) => void;
  onRemove: (id: string) => void;
  onRemoveGroup: (key: string) => void;
  /** #942: an optional line's chip: turn its item on or off. */
  onToggle: (id: string) => void;
  /** The tray holds 30 live items, so an off chip cannot turn on. */
  full: boolean;
}

type Section = { kind: 'item'; item: TrayItem } | { kind: 'group'; key: string; name: string; items: TrayItem[] };

/** Loose items and groups in the order added; a group's items are together under its heading. */
function sections(items: TrayItem[]): Section[] {
  const out: Section[] = [];
  for (const item of items) {
    if (!item.group) {
      out.push({ kind: 'item', item });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.kind === 'group' && last.key === item.group.key) last.items.push(item);
    else out.push({ kind: 'group', key: item.group.key, name: item.group.name, items: [item] });
  }
  return out;
}

/** A group's items, the loose ones' sections aside: only the live ones are rows; an optional line has a chip. */
const rowsOf = (items: TrayItem[]) => liveItems(items);

const macro = (g: number | null | undefined) => (typeof g === 'number' ? sheetGrams(g) : '—');

export function TrayView(p: Props) {
  const totals = trayTotals(p.items);
  // Focus goes to the amount when an editor opens.
  useEffect(() => {
    if (p.open) document.querySelector<HTMLElement>(`[data-tray-qty="${p.open}"]`)?.focus();
  }, [p.open]);

  const row = (item: TrayItem) => <TrayRow key={item.id} item={item} {...p} />;
  return (
    <div class="tray" data-testid="tray">
      <div class="tray-head">
        <p class="card-label tray-label" id="tray-label">
          Going into {p.meal}
        </p>
        <span class="tray-total tabular" data-testid="tray-total">
          {labelFigures(totals)}
        </span>
      </div>
      <ul class="plain-list" aria-labelledby="tray-label" data-testid="tray-list">
        {sections(p.items).map((s) =>
          s.kind === 'item' ? (
            row(s.item)
          ) : (
            <li key={s.key} class="tray-group" data-testid="tray-group">
              <div class="tray-group-head">
                <span class="tray-group-name" id={`tray-group-${s.key}`} data-testid="tray-group-name">
                  {s.name}
                </span>
                <button
                  type="button"
                  class="text-btn tray-remove-all"
                  onClick={() => p.onRemoveGroup(s.key)}
                  aria-label={`Remove all of ${s.name}`}
                  data-testid="tray-remove-all"
                >
                  Remove all
                </button>
              </div>
              <ul class="plain-list" aria-labelledby={`tray-group-${s.key}`}>
                {rowsOf(s.items).map(row)}
              </ul>
              <OptionalChips usual={s.name} items={s.items} foods={p.foods} full={p.full} onToggle={p.onToggle} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** #942: a usual's optional lines, one on/off chip each, under the group's last item. */
function OptionalChips(p: {
  usual: string;
  items: TrayItem[];
  foods: Map<string, Food>;
  full: boolean;
  onToggle: (id: string) => void;
}) {
  const chips = p.items.filter((i) => i.optional);
  if (!chips.length) return null;
  return (
    <div class="chip-row tray-optional" role="group" aria-label={`Optional in ${p.usual}`} data-testid="tray-optional">
      {chips.map((i) => {
        const food = i.target.kind === 'food' ? i.target.food : undefined;
        const disabled = !!i.off && p.full;
        return (
          <button
            key={i.id}
            type="button"
            class={i.off ? 'chip tray-chip is-off' : 'chip tray-chip is-on'}
            aria-pressed={!i.off}
            aria-disabled={disabled ? 'true' : undefined}
            onClick={() => {
              if (!disabled) p.onToggle(i.id);
            }}
            data-testid="tray-chip"
          >
            <span aria-hidden="true">{i.off ? '+ ' : '✓ '}</span>
            {labelOf(food)}
          </button>
        );
      })}
    </div>
  );
}

function TrayRow({ item, ...p }: { item: TrayItem } & Props) {
  const name = targetName(item.target);
  const recipe = item.target.kind === 'recipe';
  const figures = itemFigures(item);
  const open = p.open === item.id;
  const kcal = figures && figures.kcal !== null ? `${wholeKcal(figures.kcal)} kcal` : 'No nutrition';
  const amount = amountText(item.qty, item.unit, recipe);
  return (
    <li data-testid="tray-item">
      <button
        type="button"
        class={p.fresh === item.id ? 'log-row tray-row is-fresh' : 'log-row tray-row'}
        onClick={() => p.onOpen(open ? null : item.id)}
        onAnimationEnd={() => p.onFreshDone(item.id)}
        aria-expanded={open}
        aria-label={`${name}, ${amount}, ${kcal}`}
        data-testid="tray-row"
      >
        <span class="recipe-text">
          <span class="recipe-name">{item.target.kind === 'food' ? <FoodName food={item.target.food} /> : name}</span>
          <span class="recipe-meta tabular" data-testid="tray-kcal">
            {kcal}
            {recipe && figures?.partial && figures.kcal !== null ? ' · partial' : ''}
          </span>
        </span>
        <span class="amount-pill tabular" data-testid="tray-pill">
          {amount} <span aria-hidden="true">▾</span>
        </span>
      </button>
      {open && <TrayEditor item={item} name={name} {...p} />}
    </li>
  );
}

function TrayEditor({ item, name, ...p }: { item: TrayItem; name: string } & Props) {
  const figures = itemFigures(item);
  const food = item.target.kind === 'food' ? item.target.food : null;
  const choices = food ? unitChoices(food) : [];
  const grams = food ? choices.find((o) => o.unit === item.unit)?.grams : null;
  const shownGrams = food && item.unit !== 'g' && typeof grams === 'number' ? Math.round(item.qty * grams) : null;
  const atMin = atMinimum(item);
  const atMax = item.qty >= maxQty(item.unit);
  const words = item.unit === 'g' ? String(item.qty) : fractionQty(item.qty);
  return (
    <div class="amount-editor tray-editor" role="group" aria-label={`Edit amount, ${name}`} data-testid="tray-editor">
      {food && item.options && (
        <PickOne
          foodId={food.id}
          options={item.options}
          foods={p.foods}
          open={p.pickOpen === item.id}
          busy={false}
          onToggle={() => p.onPickOpen(p.pickOpen === item.id ? null : item.id)}
          onPick={(o) => {
            p.onPickOpen(null);
            p.onPick(item.id, o);
          }}
        />
      )}
      <div class="amount-editor-step">
        <button
          type="button"
          class="icon-btn"
          aria-label="Less"
          aria-disabled={atMin ? 'true' : undefined}
          onClick={() => {
            if (!atMin) p.onAmount(item.id, stepItem(item, -1), item.unit);
          }}
        >
          −
        </button>
        <span class="amount-editor-qty tabular" tabIndex={-1} data-tray-qty={item.id} data-testid="tray-qty">
          {words}
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="More"
          aria-disabled={atMax ? 'true' : undefined}
          onClick={() => {
            if (!atMax) p.onAmount(item.id, stepItem(item, 1), item.unit);
          }}
        >
          +
        </button>
        <span class="hint amount-editor-unit">
          {food ? (item.unit === 'g' ? 'g' : item.unit) : item.qty === 1 ? 'serving' : 'servings'}
          {shownGrams !== null && ` · ${shownGrams} g`}
        </span>
      </div>
      {food && (
        <div class="chip-row" role="group" aria-label="Unit">
          {choices.map((o) => (
            <button
              key={o.unit}
              type="button"
              class="chip"
              aria-pressed={item.unit === o.unit}
              onClick={() => item.unit !== o.unit && p.onAmount(item.id, switchedAmount(item, o), o.unit)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <div class="tray-editor-foot">
        <span class="tray-macros tabular" data-testid="tray-macros">
          <span class="tray-macro-protein">P {macro(figures?.protein_g)}</span>{' '}
          <span class="tray-macro-carbs">C {macro(figures?.carbs_g)}</span>{' '}
          <span class="tray-macro-fat">F {macro(figures?.fat_g)}</span>
        </span>
        <button
          type="button"
          class="text-btn tray-remove"
          onClick={() => p.onRemove(item.id)}
          data-testid="tray-remove"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
