// #864: the macro bars. `MacroBar` is the split bar of protein, carbs and fat by calories (the day card's, and #866's
// meal cards'); `PartsBar` is a macro's own parts of the whole. Both are drawings of figures that are also text beside
// them, so neither carries a meaning alone.
import { MACRO_KEYS, macroLabel, macroShares, partsScale, type MacroGrams } from './macro-math';

interface MacroBarProps extends MacroGrams {
  /** `day` is the day card's height; `meal` a thinner one for the meal cards. */
  size: 'day' | 'meal';
}

/** The split bar alone: three segments in the order Protein, Carbs, Fat, or an empty track when there is no share. */
export function MacroBar({ protein, carbs, fat, size }: MacroBarProps) {
  const grams = { protein, carbs, fat };
  const s = macroShares(grams);
  return (
    <div class={`macro-bar macro-bar-${size}`} role="img" aria-label={macroLabel(grams)} data-testid="macro-bar">
      {s.state === 'shares' ? (
        MACRO_KEYS.filter((k) => s.kcal[k] > 0).map((k) => (
          <span key={k} class={`macro-seg macro-${k}`} data-testid={`macro-seg-${k}`} style={{ flexGrow: s.kcal[k] }} />
        ))
      ) : (
        <span class="macro-seg macro-track" data-testid="macro-empty" style={{ flexGrow: 1 }} />
      )}
    </div>
  );
}

export type PartTone = 'sugars' | 'added' | 'fiber' | 'satfat' | 'trans';

export interface BarPart {
  key: string;
  /** null: unknown, no slice. */
  grams: number | null | undefined;
  tone: PartTone;
  /** Drawn inside the previous slice, at its left end, instead of after it. */
  inside?: boolean;
}

interface PartsBarProps {
  /** The parent's grams. */
  parent: number | null | undefined;
  /** In the bar's order. */
  parts: BarPart[];
}

/**
 * A parent macro's bar: each part as wide as its grams over the parent's, then the unnamed rest as the track. An
 * `inside` part (added sugars) is drawn inside the slice before it; with that slice unknown it stands alone.
 */
export function PartsBar({ parent, parts }: PartsBarProps) {
  const slices: { part: BarPart; inner?: BarPart }[] = [];
  for (const p of parts) {
    const prev = slices[slices.length - 1];
    if (p.inside && prev && typeof prev.part.grams === 'number') prev.inner = p;
    else slices.push({ part: p });
  }
  const g = (p: BarPart) => (typeof p.grams === 'number' && p.grams > 0 ? p.grams : 0);
  const scale = partsScale(
    parent,
    slices.map((s) => g(s.part)),
  );
  const used = slices.reduce((a, s) => a + g(s.part), 0);
  const rest = scale - used;
  return (
    <div class="parts-bar" aria-hidden="true" data-testid="parts-bar">
      {scale <= 0 ? (
        <span class="macro-seg macro-track" style={{ flexGrow: 1 }} />
      ) : (
        <>
          {slices
            .filter((s) => g(s.part) > 0)
            .map((s) => (
              <span
                key={s.part.key}
                class={`macro-seg part-${s.part.tone}`}
                data-testid={`part-${s.part.key}`}
                style={{ flexGrow: g(s.part) }}
              >
                {s.inner && g(s.inner) > 0 && (
                  <span
                    class="part-inner part-added"
                    data-testid={`part-${s.inner.key}`}
                    style={{ width: `${Math.min(100, (g(s.inner) / g(s.part)) * 100)}%` }}
                  />
                )}
              </span>
            ))}
          {rest > 1e-9 && <span class="macro-seg macro-track" style={{ flexGrow: rest }} />}
        </>
      )}
    </div>
  );
}
