// #714 - the Day screen's one read of Forage: `getFoodLogTotals`, the daily totals of the food log.
// Thrive never adds up nutrition, edits food or reads Forage's Sheet; it asks Forage's API, with the
// token Thrive's own sign-in already holds, through `callAction` (so the form-encoded POST, the timeout
// and the error kinds are the app's). Forage lets Thrive's client run this one action and no other.

import { callAction } from './thrive-api';

/** Forage's API URL, from `VITE_FORAGE_API_URL`. Unset: no Food card and no request. Read per call. */
export function forageApiUrl(): string {
  return (import.meta.env.VITE_FORAGE_API_URL ?? '').trim();
}

/** Forage's Eaten tab, opened by the card's link. */
export const FORAGE_EATEN_URL = 'https://luketmoss.github.io/keel/forage/#/eaten';

/**
 * One day of the reply. A date with no entries is absent, never zero. A figure is `null` only when
 * every entry that day lacks it; `partial` means some entry has no nutrition, so the sum is low.
 */
export interface FoodDay {
  date: string;
  entries: number;
  unknown_entries: number;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  partial: boolean;
}

export type FoodTotalsOutcome = { ok: true; days: FoodDay[] } | { ok: false; kind: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const figure = (v: unknown): number | null | undefined =>
  v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function parseDay(raw: unknown): FoodDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kcal = figure(r.kcal);
  const protein = figure(r.protein_g);
  const carbs = figure(r.carbs_g);
  const fat = figure(r.fat_g);
  if (
    typeof r.date !== 'string' ||
    !DATE.test(r.date) ||
    typeof r.entries !== 'number' ||
    typeof r.unknown_entries !== 'number' ||
    kcal === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return null;
  }
  return {
    date: r.date,
    entries: r.entries,
    unknown_entries: r.unknown_entries,
    kcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    partial: r.partial === true,
  };
}

/** The days Forage reports from `from` to `to`, both `YYYY-MM-DD`. Never throws; every failure is a `kind`. */
export async function getFoodLogTotals(token: string, from: string, to: string): Promise<FoodTotalsOutcome> {
  const url = forageApiUrl();
  if (!url) return { ok: false, kind: 'no_api_url' };
  const res = await callAction<{ days?: unknown }>('getFoodLogTotals', token, { fields: { from, to } }, { url });
  if (!res.ok) return { ok: false, kind: res.kind };
  const raw = res.data?.days;
  if (!Array.isArray(raw)) return { ok: false, kind: 'bad_response' };
  const days: FoodDay[] = [];
  for (const d of raw) {
    const day = parseDay(d);
    if (!day) return { ok: false, kind: 'bad_response' };
    days.push(day);
  }
  return { ok: true, days };
}
