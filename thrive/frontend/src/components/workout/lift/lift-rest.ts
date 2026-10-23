// #577 — today's rest for a section, on the start screen: what the section's
// sets say now, and the `rest_target_s` writes a change makes. #576's rules do
// the resolving, so a change here and a plan written fresh cannot disagree.

import { SWITCH_SECTIONS, defaultKeyFor, resolveRestTargets, type RestSettings } from '../../../api/rest-times';
import type { SetWithRow } from '../../../api/types';
import type { SetTimingsPatch } from '../../../state/actions';

export interface SectionValues {
  rest: number;
  /** null where the section has no switch (primary). */
  switch: number | null;
}

const seconds = (text: string | undefined): number | null => {
  if (text === undefined || text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/**
 * What a section's sets are set to now: the round rest from the last exercise
 * of a round, the switch from any other. Blank falls back to the Settings
 * default, which is what the sets would be written with.
 */
export function sectionValues(rows: readonly SetWithRow[], section: string, defaults: RestSettings): SectionValues {
  const hasSwitch = SWITCH_SECTIONS.includes(section);
  const mine = rows.filter((r) => r.section === section);
  const restKey = defaultKeyFor(section, 'rest');
  const switchKey = defaultKeyFor(section, 'switch');
  let rest: number | null = null;
  let sw: number | null = null;
  for (const r of mine) {
    const stored = seconds(r.rest_target_s);
    if (stored === null) continue;
    if (hasSwitch && isNonLast(mine, r)) sw ??= stored;
    else rest ??= stored;
  }
  return {
    rest: rest ?? (restKey ? defaults[restKey] : 0),
    switch: hasSwitch ? (sw ?? (switchKey ? defaults[switchKey] : 0)) : null,
  };
}

/** Whether another exercise of the same section follows `row` in its round. */
function isNonLast(mine: readonly SetWithRow[], row: SetWithRow): boolean {
  return mine.some((o) => o.set_number === row.set_number && o.exercise_order > row.exercise_order);
}

/** The `rest_target_s` writes that bring a section's sets to `values`: only the rows whose target changes. */
export function retargetSection(
  rows: readonly SetWithRow[],
  section: string,
  values: SectionValues,
  defaults: RestSettings,
): SetTimingsPatch[] {
  const mine = rows.filter((r) => r.section === section);
  const next = resolveRestTargets(
    mine,
    { [section]: { rest_s: String(values.rest), switch_s: values.switch === null ? '' : String(values.switch) } },
    defaults,
  );
  const out: SetTimingsPatch[] = [];
  mine.forEach((r, i) => {
    if ((r.rest_target_s ?? '') !== next[i]) out.push({ sheetRow: r.sheetRow, patch: { rest_target_s: next[i] } });
  });
  return out;
}
