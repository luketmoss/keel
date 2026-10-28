// #638 — what a template looks like in a list: three figures, a section-mix bar with words, and when it was last
// done. Shared with the template detail (#639). Pure functions first, so the visible words and the accessible
// name come from the same data and cannot drift.
import type { Template, WorkoutWithRow } from '../../api/types';
import { secondsToMinutes } from '../../api/duration';
import { spokenElapsed, spokenDay, toLocalDateStr } from '../activities/activities-helpers';

/** A bar segment: one section's total sets, and the token that colours it. */
export interface MixSegment {
  key: string;
  sets: number;
  color: string;
}

/** A legend item: a swatch colour and its words. */
export interface MixLegendItem {
  key: string;
  color: string;
  text: string;
}

export interface LastTook {
  value: string;
  unit: string;
  spoken: string;
}

export interface LastDone {
  /** Drawn: "Last done Thu, Oct 22". */
  text: string;
  /** Spoken, for the accessible name: "last done Thursday October 22". */
  spoken: string;
}

export interface TemplateStats {
  exercises: number;
  workingSets: number;
  segments: MixSegment[];
  legend: MixLegendItem[];
}

const SECTION_COLOR: Record<string, string> = {
  warmup: 'var(--sec-warmup)',
  primary: 'var(--sec-primary)',
  SS1: 'var(--sec-ss)',
  SS2: 'var(--sec-ss)',
  SS3: 'var(--sec-ss)',
  burnout: 'var(--sec-burnout)',
  cooldown: 'var(--color-border-strong)',
};

/** A row's Sets as a number; blank or garbled counts as 1, as saving already treats it. */
function rowSets(sets: string): number {
  const n = parseInt(sets, 10);
  return Number.isNaN(n) ? 1 : n;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Counts, segments and legend for a template's rows. */
export function templateStats(tpl: { exercises: readonly { section: string; sets: string }[] }): TemplateStats {
  const totals = new Map<string, number>();
  const rowCounts = new Map<string, number>();
  let workingSets = 0;
  for (const r of tpl.exercises) {
    const section = String(r.section);
    const n = rowSets(r.sets);
    totals.set(section, (totals.get(section) ?? 0) + n);
    rowCounts.set(section, (rowCounts.get(section) ?? 0) + 1);
    if (section !== 'warmup' && section !== 'cooldown') workingSets += n;
  }

  // Segments go in the order sections first appear.
  const segments: MixSegment[] = [...totals].map(([key, sets]) => ({
    key,
    sets,
    color: SECTION_COLOR[key] ?? SECTION_COLOR.primary,
  }));

  const count = (s: string) => rowCounts.get(s) ?? 0;
  const supersets = ['SS1', 'SS2', 'SS3'].filter((s) => rowCounts.has(s)).length;
  const legend: MixLegendItem[] = [];
  if (count('warmup')) legend.push({ key: 'warmup', color: SECTION_COLOR.warmup, text: `${count('warmup')} warm-up` });
  if (count('primary')) {
    legend.push({ key: 'primary', color: SECTION_COLOR.primary, text: `${count('primary')} primary` });
  }
  if (supersets) legend.push({ key: 'ss', color: SECTION_COLOR.SS1, text: plural(supersets, 'superset') });
  if (count('burnout')) {
    legend.push({ key: 'burnout', color: SECTION_COLOR.burnout, text: `${count('burnout')} burnout` });
  }
  if (count('cooldown')) {
    legend.push({ key: 'cooldown', color: SECTION_COLOR.cooldown, text: `${count('cooldown')} cool-down` });
  }

  return { exercises: tpl.exercises.length, workingSets, segments, legend };
}

/** The most recent finished workout of each template, by date then time. Not planned, not in progress. */
export function lastDoneByTemplate(
  workouts: readonly WorkoutWithRow[],
  activeId: string | null,
): Map<string, WorkoutWithRow> {
  const out = new Map<string, WorkoutWithRow>();
  for (const w of workouts) {
    if (!w.template_id || w.status || w.id === activeId) continue;
    const cur = out.get(w.template_id);
    if (!cur || `${w.date} ${w.time}` > `${cur.date} ${cur.time}`) out.set(w.template_id, w);
  }
  return out;
}

/** Most recently done first; never-done templates after, by name. */
export function orderTemplates(templates: readonly Template[], last: Map<string, WorkoutWithRow>): Template[] {
  return [...templates].sort((a, b) => {
    const wa = last.get(a.id);
    const wb = last.get(b.id);
    if (wa && wb) {
      const ka = `${wa.date} ${wa.time}`;
      const kb = `${wb.date} ${wb.time}`;
      if (ka !== kb) return ka < kb ? 1 : -1;
    } else if (wa) {
      return -1;
    } else if (wb) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/** Elapsed by #528's duration rule: "58" + "min" under an hour, "1:02" + "h" from an hour. Null when blank or 0. */
export function lastTook(w: WorkoutWithRow | undefined): LastTook | null {
  if (!w) return null;
  const mins = secondsToMinutes(w.elapsed_seconds);
  if (mins === null || mins <= 0) return null;
  const spoken = spokenElapsed(mins * 60);
  if (mins < 60) return { value: String(mins), unit: 'min', spoken };
  return { value: `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`, unit: 'h', spoken };
}

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** "Last done today / yesterday / Thu, Oct 22 / Oct 22, 2025", or "Not done yet". */
export function lastDone(w: WorkoutWithRow | undefined, todayStr = toLocalDateStr(new Date())): LastDone {
  if (!w) return { text: 'Not done yet', spoken: 'not done yet' };
  const diff = dayNumber(todayStr) - dayNumber(w.date);
  if (diff === 0) return { text: 'Last done today', spoken: 'last done today' };
  if (diff === 1) return { text: 'Last done yesterday', spoken: 'last done yesterday' };
  const date = new Date(w.date + 'T00:00:00');
  const sameYear = w.date.slice(0, 4) === todayStr.slice(0, 4);
  const shown = sameYear
    ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const day = spokenDay(w.date);
  return { text: `Last done ${shown}`, spoken: `last done ${sameYear ? day : `${day} ${w.date.slice(0, 4)}`}` };
}

/** The card's accessible name: name, counts, last took, last done. A missing part is left out. */
export function templateAriaLabel(name: string, stats: TemplateStats, took: LastTook | null, done: LastDone): string {
  return [
    name,
    plural(stats.exercises, 'exercise'),
    plural(stats.workingSets, 'working set'),
    took ? `last took ${took.spoken}` : '',
    done.spoken,
  ]
    .filter(Boolean)
    .join(', ');
}

interface TemplateSummaryProps {
  stats: TemplateStats;
  took?: LastTook | null;
  /**
   * The builder's summary (#640): exercises and working sets only, no last took and no mix bar, and the
   * figures sit in a polite live region so an add or remove is heard.
   */
  plan?: boolean;
}

/** The three figures, the section-mix bar and its legend. Spans only, so it can sit inside a button. */
export function TemplateSummary({ stats, took = null, plan = false }: TemplateSummaryProps) {
  return (
    <span class="tpl-summary">
      <span
        class={plan ? 'tpl-figures tpl-figures-plan' : 'tpl-figures'}
        {...(plan ? { 'aria-live': 'polite', 'aria-atomic': 'true' } : {})}
      >
        <span class="tpl-figure">
          <span class="tpl-figure-value">{stats.exercises}</span>
          <span class="tpl-figure-word">{stats.exercises === 1 ? 'exercise' : 'exercises'}</span>
        </span>
        <span class="tpl-figure">
          <span class="tpl-figure-value">{stats.workingSets}</span>
          <span class="tpl-figure-word">{stats.workingSets === 1 ? 'working set' : 'working sets'}</span>
        </span>
        {!plan && (
          <span class="tpl-figure">
            <span class="tpl-figure-line">
              {took ? (
                <>
                  <span class="tpl-figure-value">{took.value}</span>
                  <span class="tpl-figure-unit">{took.unit}</span>
                </>
              ) : (
                <span class="tpl-figure-value tpl-figure-none">—</span>
              )}
            </span>
            <span class="tpl-figure-word">last took</span>
          </span>
        )}
      </span>
      {!plan && stats.segments.length > 0 && (
        <>
          <span class="tpl-mix" aria-hidden="true">
            {stats.segments.map((s) => (
              <span key={s.key} class="tpl-mix-seg" style={{ flexGrow: s.sets, background: s.color }} />
            ))}
          </span>
          <span class="tpl-legend">
            {stats.legend.map((l) => (
              <span key={l.key} class="tpl-legend-item">
                <span class="tpl-legend-swatch" style={{ background: l.color }} aria-hidden="true" />
                {l.text}
              </span>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
