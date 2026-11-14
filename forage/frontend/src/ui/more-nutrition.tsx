// #756: the "More nutrition" block, one component on the food sheet, the recipe Nutrition sheet, the amount sheet and
// the Eaten day card. It shows the seven values #755 added, as the API gave them: nothing here adds anything up.
import { signal } from '@preact/signals';
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { EXTRA_KEYS, type ExtraCounts, type ExtraKey, type Extras } from '../api/types';
import { PartsBar, type PartTone } from './macro-bar';
import { partShare } from './macro-math';

export const MORE_KEY = 'forage_more_nutrition';

/** Whether the block is open, on every surface at once. Read from the device; storage that throws means collapsed. */
function stored(): boolean {
  try {
    return localStorage.getItem(MORE_KEY) === '1';
  } catch {
    return false;
  }
}

export const moreOpen = signal(stored());

/** Read the remembered state again, as a reload does. */
export function loadMoreOpen() {
  moreOpen.value = stored();
}

function setMoreOpen(open: boolean) {
  moreOpen.value = open;
  try {
    localStorage.setItem(MORE_KEY, open ? '1' : '0');
  } catch {
    // Storage is a convenience: without it the block works and starts collapsed.
  }
}

/** How grams are rounded: whole on the day card and the recipe sheet, to 0.1 on the food and amount sheets. */
export type GramRounding = 'whole' | 'tenth';

const NAMES: Record<ExtraKey, string> = {
  satfat_g: 'Saturated fat',
  transfat_g: 'Trans fat',
  cholesterol_mg: 'Cholesterol',
  sodium_mg: 'Sodium',
  fiber_g: 'Fiber',
  sugars_g: 'Sugars',
  added_sugars_g: 'Added sugars',
};

/** `1,840 mg`, `15 g`, `0.5 g`: a value as the surface shows it. */
export function amountText(key: ExtraKey, value: number, rounding: GramRounding): string {
  if (key === 'cholesterol_mg' || key === 'sodium_mg') return `${Math.round(value).toLocaleString('en-US')} mg`;
  const n = rounding === 'whole' ? Math.round(value) : Math.round(value * 10) / 10;
  return `${n} g`;
}

/** Whether none of the seven is known. */
export const noneKnown = (v: Extras) => EXTRA_KEYS.every((k) => v[k] === null || v[k] === undefined);

const known = (v: number | null | undefined): v is number => typeof v === 'number';

interface ValueProps {
  value: number | null | undefined;
  render: (v: number) => string;
  atLeast?: boolean;
}

function Value({ value, render, atLeast }: ValueProps) {
  if (!known(value)) {
    return (
      <span class="mn-unknown" role="img" aria-label="not known">
        —
      </span>
    );
  }
  return <>{atLeast ? `at least ${render(value)}` : render(value)}</>;
}

interface Props {
  /** The seven, and the two macros that head the groups. */
  values: Extras;
  fat: number | null | undefined;
  carbs: number | null | undefined;
  rounding: GramRounding;
  /** The day card's `unknown` or the recipe's `per_serving_unknown`. Omitted where a surface has no counts. */
  unknown?: ExtraCounts;
  /** "At least: some entries don't have this one." */
  atLeastNote?: string;
  /** Shown in place of the list when none of the seven is known. */
  noneText: string;
  /** `Per 1 bar (40 g)`, above the list (the food sheet). */
  caption?: string;
  testId?: string;
  /** #864: the day card's parts-of-the-whole groups (carbs and fat as bars) in place of the indented list. */
  parts?: boolean;
}

/** The More nutrition button and, open, the seven in label order with fat's and carbs' parts indented. */
export function MoreNutrition({
  values,
  fat,
  carbs,
  rounding,
  unknown,
  atLeastNote,
  noneText,
  caption,
  testId,
  parts,
}: Props) {
  const id = useRef(`more-${++seq}`).current;
  const open = moreOpen.value;
  const none = noneKnown(values);
  const atLeast = (k: ExtraKey) => known(values[k]) && (unknown?.[k] ?? 0) > 0;
  const anyAtLeast = !none && EXTRA_KEYS.some(atLeast);
  const g = (v: number) => amountText('satfat_g', v, rounding);

  const row = (key: ExtraKey, level: 1 | 2 | 3) => (
    <div class={`mn-row mn-l${level}`} data-testid={`more-${key}`}>
      <dt>{NAMES[key]}</dt>
      <dd>
        <Value value={values[key]} render={(v) => amountText(key, v, rounding)} atLeast={atLeast(key)} />
      </dd>
    </div>
  );
  const head = (name: string, v: number | null | undefined) => (
    <div class="mn-row mn-l0">
      <dt>{name}</dt>
      <dd>
        <Value value={v} render={g} />
      </dd>
    </div>
  );

  /** #864: a part row with its swatch, its figure, and its share of its parent (`34% of carbs`). */
  const partRow = (
    key: ExtraKey,
    tone: PartTone,
    parentName: string,
    parent: number | null | undefined,
    indent = false,
  ) => {
    const v = values[key];
    const al = atLeast(key);
    const share = partShare(v, parent);
    return (
      <div class={`mn-row mn-part${indent ? ' mn-indent' : ''}`} data-testid={`more-${key}`}>
        <dt>
          <span class={`mn-swatch part-${tone}`} aria-hidden="true" />
          <span class="mn-name">
            {NAMES[key]}
            {share !== null && (
              <span class="mn-share" data-testid={`share-${key}`}>
                {al ? 'at least ' : ''}
                {share} of {parentName}
              </span>
            )}
            {share === null && key === 'added_sugars_g' && known(v) && !known(parent) && (
              <span class="mn-share" data-testid={`share-${key}`}>
                <span class="mn-unknown" role="img" aria-label="share of sugars not known">
                  —
                </span>
              </span>
            )}
          </span>
        </dt>
        <dd>
          <Value value={v} render={(n) => amountText(key, n, rounding)} atLeast={al} />
        </dd>
      </div>
    );
  };
  const group = (
    name: string,
    parent: number | null | undefined,
    barParts: { key: string; grams: number | null | undefined; tone: PartTone; inside?: boolean }[],
    rows: JSX.Element[],
  ) => (
    <div class="mn-group" data-testid={`group-${name.toLowerCase()}`}>
      <dl class="mn-list tabular">{head(name, parent)}</dl>
      <PartsBar parent={parent} parts={barParts} />
      <dl class="mn-list tabular">{rows}</dl>
    </div>
  );

  return (
    <div class="more-nutrition" data-testid={testId ?? 'more-nutrition'}>
      <button
        type="button"
        class="text-btn more-toggle"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setMoreOpen(!open)}
      >
        More nutrition
        <span class="more-chevron" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div id={id} class="more-body">
          {caption && <p class="hint">{caption}</p>}
          {none ? (
            <p class="hint" data-testid="more-none">
              {noneText}
            </p>
          ) : (
            <>
              {parts && (
                <>
                  {group(
                    'Carbs',
                    carbs,
                    [
                      { key: 'sugars_g', grams: values.sugars_g, tone: 'sugars' },
                      { key: 'added_sugars_g', grams: values.added_sugars_g, tone: 'added', inside: true },
                      { key: 'fiber_g', grams: values.fiber_g, tone: 'fiber' },
                    ],
                    [
                      partRow('sugars_g', 'sugars', 'carbs', carbs),
                      partRow('added_sugars_g', 'added', 'sugars', values.sugars_g, true),
                      partRow('fiber_g', 'fiber', 'carbs', carbs),
                    ],
                  )}
                  {group(
                    'Fat',
                    fat,
                    [
                      { key: 'satfat_g', grams: values.satfat_g, tone: 'satfat' },
                      { key: 'transfat_g', grams: values.transfat_g, tone: 'trans' },
                    ],
                    [partRow('satfat_g', 'satfat', 'fat', fat), partRow('transfat_g', 'trans', 'fat', fat)],
                  )}
                  <dl class="mn-list mn-plain tabular">
                    {row('cholesterol_mg', 1)}
                    {row('sodium_mg', 1)}
                  </dl>
                </>
              )}
              {!parts && (
                <dl class="mn-list tabular">
                  {head('Fat', fat)}
                  {row('satfat_g', 2)}
                  {row('transfat_g', 2)}
                  {row('cholesterol_mg', 1)}
                  {row('sodium_mg', 1)}
                  {head('Carbs', carbs)}
                  {row('fiber_g', 2)}
                  {row('sugars_g', 2)}
                  {row('added_sugars_g', 3)}
                </dl>
              )}
              {anyAtLeast && atLeastNote && (
                <p class="hint" data-testid="more-at-least">
                  {atLeastNote}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

let seq = 0;
