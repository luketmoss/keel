// #870: the three macro columns under the split bar, shared by the Eaten day card (#864) and the amount sheet so the
// two cannot drift. It draws figures the API gave: the grams as text, and the shares worked out by `macroShares`.
import { MACRO_KEYS, MACRO_NAMES, macroShares, type MacroGrams } from './macro-math';

interface Props extends MacroGrams {
  /** One column's grams as text, for a known figure: `62 g` on the day card, to a tenth on the amount sheet. */
  format: (grams: number) => string;
}

/** Protein, Carbs and Fat: a swatch and name, the grams, and the share of calories. A null macro reads `—`. */
export function MacroCols({ protein, carbs, fat, format }: Props) {
  const grams = { protein, carbs, fat };
  const shares = macroShares(grams);
  return (
    <div class="macro-cols tabular">
      {MACRO_KEYS.map((k) => {
        const g = grams[k];
        return (
          <div class="macro-col" key={k} data-testid={`macro-col-${k}`}>
            <span class="macro-name">
              <span class={`macro-swatch macro-${k}`} aria-hidden="true" />
              {MACRO_NAMES[k]}
            </span>
            <span class="macro-grams">
              {g === null ? (
                <span class="mn-unknown" role="img" aria-label="not known">
                  —
                </span>
              ) : (
                format(g)
              )}
            </span>
            <span class="macro-share">{shares.state === 'shares' ? `${shares.text[k]} of kcal` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
