// Rest times (#576): the Settings defaults, a template section's rest, and the
// `rest_target_s` a new workout's sets are written with.
//
// REST_SETTINGS mirrors REST_SETTINGS in apps-script/src/types.js, and
// resolveRestTargets mirrors resolveRestTargets in apps-script/src/sets.js (the
// MCP's scheduled workouts are resolved there); rest-times.test.ts fails if the
// keys, defaults or ranges drift. The SPA reads and writes the defaults through
// the API (`getSettings`, `updateSetting`), never the Settings tab directly.

import { callAction, type ActionOutcome } from './thrive-api';
import type { Section, TemplateRow, WorkoutSet } from './types';

export const REST_SETTING_KEYS = [
  'rest_primary_s',
  'rest_superset_s',
  'switch_superset_s',
  'rest_burnout_s',
  'switch_burnout_s',
] as const;
export type RestSettingKey = (typeof REST_SETTING_KEYS)[number];
export type RestSettings = Record<RestSettingKey, number>;

/** What the API reports when a key, or the whole tab, is absent. */
export const DEFAULT_REST_SETTINGS: RestSettings = {
  rest_primary_s: 90,
  rest_superset_s: 45,
  switch_superset_s: 15,
  rest_burnout_s: 45,
  switch_burnout_s: 10,
};

/** A rest moves by 15 s from 0:15 to 10:00; a switch by 5 s from 0:00 to 2:00 (the API's ranges). */
export const REST_RANGE = { min: 15, max: 600, step: 15 } as const;
export const SWITCH_RANGE = { min: 0, max: 120, step: 5 } as const;
export type RestKind = 'rest' | 'switch';
export const rangeOf = (kind: RestKind) => (kind === 'rest' ? REST_RANGE : SWITCH_RANGE);
export const kindOfKey = (key: RestSettingKey): RestKind => (key.startsWith('switch_') ? 'switch' : 'rest');

/** Sections with a rest, and those of them with a switch too. Warmup and cooldown have neither. */
export const REST_SECTIONS: readonly string[] = ['primary', 'SS1', 'SS2', 'SS3', 'burnout'];
export const SWITCH_SECTIONS: readonly string[] = ['SS1', 'SS2', 'SS3', 'burnout'];

/** The default that applies to a section's rest or switch, or null where there is none. */
export function defaultKeyFor(section: Section | string, kind: RestKind): RestSettingKey | null {
  if (kind === 'rest') {
    if (section === 'primary') return 'rest_primary_s';
    if (section === 'burnout') return 'rest_burnout_s';
    return SWITCH_SECTIONS.includes(section) ? 'rest_superset_s' : null;
  }
  if (section === 'burnout') return 'switch_burnout_s';
  return SWITCH_SECTIONS.includes(section) ? 'switch_superset_s' : null;
}

/** 90 -> "1:30", 0 -> "0:00", 600 -> "10:00". */
export function formatMSS(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** One section's stored values: '' means "use the default". */
export interface SectionRest {
  rest_s: string;
  switch_s: string;
}

/** { section: { rest_s, switch_s } } from a template's rows: the first row of each section wins. */
export function sectionRestOf(rows: readonly Pick<TemplateRow, 'section' | 'rest_s' | 'switch_s'>[]) {
  const out: Record<string, SectionRest> = {};
  for (const r of rows) {
    if (!(r.section in out)) out[r.section] = { rest_s: r.rest_s ?? '', switch_s: r.switch_s ?? '' };
  }
  return out;
}

/**
 * The rest planned after each set, as text parallel to `sets` (one workout's
 * rows). A round is one section's sets with the same set number; an exercise
 * with fewer sets drops out of later rounds. In a superset or burnout every
 * exercise but the last in its round (by exercise_order) gets the switch time
 * and the last the round rest. A primary set always gets the primary rest.
 * Warmup, cooldown and anything else are blank. Each value is the section's
 * own, else the default.
 */
export function resolveRestTargets(
  sets: readonly Pick<WorkoutSet, 'section' | 'exercise_order' | 'set_number'>[],
  sectionRest: Record<string, SectionRest>,
  defaults: RestSettings,
): string[] {
  const pick = (section: string, kind: RestKind): string => {
    const own = sectionRest[section]?.[kind === 'rest' ? 'rest_s' : 'switch_s'] ?? '';
    if (own !== '') return own;
    const key = defaultKeyFor(section, kind);
    return key ? String(defaults[key]) : '';
  };

  const round = (s: Pick<WorkoutSet, 'section' | 'set_number'>) => `${s.section}\u0000${Number(s.set_number)}`;
  const lastInRound = new Map<string, number>();
  for (const s of sets) {
    const order = Number(s.exercise_order) || 0;
    const k = round(s);
    if (!lastInRound.has(k) || order > lastInRound.get(k)!) lastInRound.set(k, order);
  }

  return sets.map((s) => {
    if (!REST_SECTIONS.includes(s.section)) return '';
    if (!SWITCH_SECTIONS.includes(s.section)) return pick(s.section, 'rest');
    const last = lastInRound.get(round(s)) === (Number(s.exercise_order) || 0);
    return pick(s.section, last ? 'rest' : 'switch');
  });
}

/** `sets` with `rest_target_s` resolved, for rows about to be written for the first time. */
export function withRestTargets<T extends WorkoutSet>(
  sets: readonly T[],
  sectionRest: Record<string, SectionRest>,
  defaults: RestSettings,
): T[] {
  const targets = resolveRestTargets(sets, sectionRest, defaults);
  return sets.map((s, i) => ({ ...s, rest_target_s: targets[i] }));
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** The five defaults from `getSettings`. Never throws; a failure is an outcome with a `kind`. */
export async function getRestSettings(token: string): Promise<ActionOutcome<RestSettings>> {
  const out = await callAction<Record<string, unknown>>('getSettings', token);
  if (!out.ok) return out;
  const d = out.data;
  if (!d || typeof d !== 'object') return { ok: false, kind: 'bad_response' };
  const settings = {} as RestSettings;
  for (const key of REST_SETTING_KEYS) {
    const v = d[key];
    if (!isWhole(v)) return { ok: false, kind: 'bad_response' };
    settings[key] = v;
  }
  return { ok: true, data: settings };
}
