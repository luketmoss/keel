// A group in a meal card (#885): its heading, a pick-one's choice under its row, and the group's ⋯ menu.
import type { Food, UsualOption } from '../api/types';
import { labelOf, pickLayout } from '../library/usuals-store';
import { Sheet } from '../ui/sheet';
import { fractionQty } from './amount-edit';
import { wholeKcal } from './format';
import type { PickOneOffer } from './swap';
import { SUGGEST_AFTER } from './swap';
import { optionKcal } from './usual-group';

interface HeadingProps {
  name: string;
  /** The group came from a usual, and whether it differs from it. */
  usual: boolean;
  changed: boolean;
  kcal: number | null;
  onMenu: () => void;
}

/** The heading above a group's entries: the name, its chips, the total and the ⋯ button. */
export function GroupHeading({ name, usual, changed, kcal, onMenu }: HeadingProps) {
  return (
    <div class="group-head" data-testid="group-head">
      <div class="group-title">
        <span class="group-name" data-testid="group-name">
          {name}
        </span>
        {usual && (
          <span class="group-chip" data-testid="group-usual-chip">
            Usual
          </span>
        )}
        {changed && (
          <span class="chip-flag group-changed" data-testid="group-changed-chip">
            Changed
          </span>
        )}
      </div>
      {kcal === null ? (
        <span class="mn-unknown" role="img" aria-label="not known">
          —
        </span>
      ) : (
        <span class="log-row-kcal tabular" data-testid="group-kcal">
          {wholeKcal(kcal)} <span class="hint-inline">kcal</span>
        </span>
      )}
      <button
        type="button"
        class="icon-btn"
        aria-label={`${name} options`}
        aria-haspopup="dialog"
        onClick={onMenu}
        data-testid="group-menu"
      >
        <span aria-hidden="true">⋯</span>
      </button>
    </div>
  );
}

const amount = (o: UsualOption) => `${fractionQty(o.qty)} ${o.unit}`;

interface PickProps {
  /** The food the line is on now. */
  foodId: string;
  /** The line's options (a usual's, or a combo's in the Add sheet's tray). */
  options: UsualOption[];
  foods: Map<string, Food>;
  /** Whether the list is open (the list form only). */
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPick: (option: UsualOption) => void;
}

/**
 * A pick-one entry's choice (#885): pills when there are 3 options or fewer and every label is 20 characters or fewer,
 * the logged one pressed; otherwise `Pick one · 2 of 5` opening a list of full names. A pick swaps the entry to that
 * option at the option's own amount.
 */
export function PickOne({ foodId, options, foods, open, busy, onToggle, onPick }: PickProps) {
  const at = options.findIndex((o) => o.food_id === foodId);
  if (pickLayout(options, foods).kind === 'buttons') {
    return (
      <div class="chip-row pick-row" role="group" aria-label="Pick one" data-testid="pick-buttons">
        {options.map((o) => (
          <button
            key={o.food_id}
            type="button"
            class="chip"
            aria-pressed={o.food_id === foodId}
            aria-busy={busy || undefined}
            disabled={busy}
            onClick={() => o.food_id !== foodId && onPick(o)}
            data-testid="pick-option"
          >
            {labelOf(foods.get(o.food_id))}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div class="pick-wrap">
      <button
        type="button"
        class="pick-trigger"
        aria-expanded={open}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={onToggle}
        data-testid="pick-trigger"
      >
        Pick one · {at + 1} of {options.length} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div class="pick-list" role="radiogroup" aria-label="Pick one" data-testid="pick-list">
          {options.map((o) => {
            const food = foods.get(o.food_id);
            const kcal = optionKcal(food, o);
            const on = o.food_id === foodId;
            const brand = (food?.brand ?? '').trim();
            return (
              <button
                key={o.food_id}
                type="button"
                role="radio"
                aria-checked={on}
                class={on ? 'pick-row-item is-on' : 'pick-row-item'}
                onClick={() => (on ? onToggle() : onPick(o))}
                data-testid="pick-item"
              >
                <span class="pick-radio" aria-hidden="true" />
                <span class="recipe-text">
                  <span class="recipe-name">{food ? food.name : 'A removed food'}</span>
                  <span class="recipe-meta">{[brand, amount(o)].filter(Boolean).join(' · ')}</span>
                </span>
                {kcal === null ? (
                  <span class="chip-flag">—</span>
                ) : (
                  <span class="log-row-kcal tabular">
                    {wholeKcal(kcal)} <span class="hint-inline">kcal</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface MenuProps {
  name: string;
  count: number;
  /** Null when the group has no usual that still exists (no Update item); else the differences, empty when none. */
  update: { usual: string; changes: string[] } | null;
  /** A swapped Always line each, to turn into a pick-one (#886). */
  pickOnes?: PickOneOffer[];
  busy: boolean;
  onUpdate: () => void;
  onPickOne?: (entryId: string) => void;
  /** Given when the group has no usual: Save as a usual (#886). */
  onSaveUsual?: () => void;
  onCopy: () => void;
  onUngroup: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/** The group's ⋯ menu (#885): Update the usual, Copy to…, Ungroup and Remove all. */
export function GroupMenuSheet({
  name,
  count,
  update,
  pickOnes = [],
  busy,
  onUpdate,
  onPickOne,
  onSaveUsual,
  onCopy,
  onUngroup,
  onRemove,
  onClose,
}: MenuProps) {
  const row = (
    testId: string,
    title: string,
    line: string | null,
    onClick: () => void,
    opts: { disabled?: boolean; danger?: boolean; chip?: boolean } = {},
  ) => (
    <li>
      <button
        type="button"
        class={opts.disabled ? 'log-row is-blocked' : 'log-row'}
        onClick={opts.disabled || busy ? undefined : onClick}
        aria-disabled={opts.disabled || undefined}
        aria-busy={busy || undefined}
        data-testid={testId}
      >
        <span class="recipe-text">
          <span class={opts.danger ? 'recipe-name danger-text' : 'recipe-name'}>
            {opts.chip && (
              <>
                <span class="group-chip suggested-chip" data-testid="suggested-chip">
                  Suggested
                </span>{' '}
              </>
            )}
            {title}
          </span>
          {line && <span class="recipe-meta">{line}</span>}
        </span>
      </button>
    </li>
  );
  const none = !!update && update.changes.length === 0;
  return (
    <Sheet title={name} onClose={onClose} testId="group-menu-sheet">
      <ul class="plain-list">
        {update &&
          row(
            'group-update',
            `Update the ${update.usual} usual`,
            none ? 'Matches your usual' : update.changes.join(' · '),
            onUpdate,
            { disabled: none },
          )}
        {pickOnes.map((o) =>
          row(
            'group-pick-one',
            `Make it a pick-one: ${o.from} / ${o.to}`,
            `${o.count >= SUGGEST_AFTER ? `You've swapped this line ${o.count} times. ` : ''}Both become options, and you choose each time`,
            () => onPickOne?.(o.entryId),
            { chip: o.count >= SUGGEST_AFTER },
          ),
        )}
        {onSaveUsual &&
          row('group-save-usual', 'Save as a usual', `Use these ${count} as a starting point`, onSaveUsual)}
        {row('group-copy', 'Copy to…', 'Another day or meal, exactly as it is', onCopy)}
        {row(
          'group-ungroup',
          'Ungroup',
          `Keep the ${count} ${count === 1 ? 'entry' : 'entries'}, drop the heading`,
          onUngroup,
        )}
        {row('group-remove', `Remove all ${count}`, null, onRemove, { danger: true })}
      </ul>
    </Sheet>
  );
}
