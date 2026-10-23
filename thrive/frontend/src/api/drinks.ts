// Drinks and Settings (#519) - Thrive Sip's water and alcohol intake.
//
// Unlike most tabs, the SPA never reads or writes these two directly: every
// read and write goes through the Apps Script API, so the id that makes a retry
// safe, the Denver date and the limits live in one place. This file is the row
// mapping mirrored from apps-script/src/types.js (DRINK_FIELDS, SETTING_FIELDS;
// CLAUDE.md: change both together, drinks.test.ts fails if they drift) and a
// typed client for the six actions. No UI.
//
// Every call is a token call (`callAction`): form-encoded POST, the Google
// access token in the body. None throws; a failure is an outcome with a `kind`.

import { callAction, type ActionOutcome } from './thrive-api';
import type { RestSettingKey } from './rest-times';

/** Drinks' A:I order. */
export const DRINK_FIELDS = [
  'id',
  'kind',
  'amount',
  'date',
  'time',
  'logged_at_utc',
  'source',
  'created',
  'updated',
] as const;

/** Settings' A:C order. */
export const SETTING_FIELDS = ['key', 'value', 'updated'] as const;

export const DRINK_KINDS = ['water', 'alcohol', 'coffee', 'unwind'] as const;
/** What one Unwind entry is, in mg (#590): the API refuses any other amount. */
export const UNWIND_AMOUNT_MG = 5;
// 'mcp' (#595): a drink logged from a chat. rowToDrink drops a source it does
// not know, so a row the MCP wrote would otherwise vanish from Day and Trends.
export const DRINK_SOURCES = ['widget', 'app', 'mcp'] as const;
export type DrinkKind = (typeof DRINK_KINDS)[number];
export type DrinkSource = (typeof DRINK_SOURCES)[number];

/** The water goal's key. The rest defaults (#576) are in rest-times.ts. */
export const WATER_GOAL_KEY = 'water_goal_ml';
/** What the API reports when the row, or the whole tab, is absent: 64 oz. */
export const WATER_GOAL_DEFAULT_ML = 1893;
export const WATER_GOAL_MIN_ML = 250;
export const WATER_GOAL_MAX_ML = 10000;
/** The most one water entry may be. */
export const WATER_AMOUNT_MAX_ML = 2000;
/** The widest range getDrinks accepts, inclusive. */
export const DRINKS_MAX_RANGE_DAYS = 400;

/**
 * One drink. `amount` is whole ml for water, standard drinks for alcohol and
 * cups for coffee (always 1), and mg for unwind (always 5). `date`/`time` are local America/Denver; `logged_at_utc` is
 * the instant the caller says it was taken and is never rewritten.
 */
export interface Drink {
  id: string;
  kind: DrinkKind;
  amount: number;
  date: string;
  time: string;
  logged_at_utc: string;
  source: DrinkSource;
  created: string;
  updated: string;
}

export interface Setting {
  key: string;
  value: string;
  updated: string;
}

export interface DrinkTotals {
  date: string;
  water_ml: number;
  alcohol_drinks: number;
  coffee_cups: number;
  /** Unwind, in mg (#590). 0 from an API that predates it. */
  unwind_mg: number;
  water_goal_ml: number;
}

export interface LogDrinkInput {
  /** A UUID the caller generates: logging the same id twice leaves one row. */
  id: string;
  kind: DrinkKind;
  amount: number;
  /** ISO 8601 UTC: the moment of the tap. */
  logged_at_utc: string;
  source: DrinkSource;
}

export type DrinkOutcome<T> = ActionOutcome<T>;

/** A Drinks sheet row (or the API's string-valued object) as a Drink; null when it is not one. */
export function rowToDrink(row: readonly unknown[] | Record<string, unknown>): Drink | null {
  const cells: unknown[] = Array.isArray(row) ? [...row] : DRINK_FIELDS.map((f) => (row as Record<string, unknown>)[f]);
  const text = (i: number) => (cells[i] === undefined || cells[i] === null ? '' : String(cells[i]));
  const kind = text(1);
  const source = text(6);
  const amount = Number(text(2));
  if (!text(0) || !(DRINK_KINDS as readonly string[]).includes(kind)) return null;
  if (!(DRINK_SOURCES as readonly string[]).includes(source)) return null;
  if (!Number.isInteger(amount) || amount < 1) return null;
  return {
    id: text(0),
    kind: kind as DrinkKind,
    amount,
    date: text(3),
    time: text(4),
    logged_at_utc: text(5),
    source: source as DrinkSource,
    created: text(7),
    updated: text(8),
  };
}

/** A Settings row as a Setting. */
export function rowToSetting(row: readonly unknown[]): Setting {
  const text = (i: number) => (row[i] === undefined || row[i] === null ? '' : String(row[i]));
  return { key: text(0), value: text(1), updated: text(2) };
}

function parsed<T>(outcome: ActionOutcome<unknown>, map: (data: unknown) => T | null): DrinkOutcome<T> {
  if (!outcome.ok) return outcome;
  const value = map(outcome.data);
  return value === null ? { ok: false, kind: 'bad_response' } : { ok: true, data: value };
}

const asDrink = (data: unknown): Drink | null =>
  data && typeof data === 'object' ? rowToDrink(data as Record<string, unknown>) : null;

const isNonNegativeInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Log one drink. Repeating an id returns the existing row and writes nothing. */
export async function logDrink(input: LogDrinkInput, token: string): Promise<DrinkOutcome<Drink>> {
  return parsed(await callAction('logDrink', token, { payload: input }), asDrink);
}

/**
 * Drinks on an inclusive range of local dates, oldest first, with the current
 * goal. No range means today (Denver); `from` and `to` are given together.
 */
export async function getDrinks(
  range: { from: string; to: string } | undefined,
  token: string,
): Promise<DrinkOutcome<{ drinks: Drink[]; water_goal_ml: number }>> {
  const outcome = await callAction('getDrinks', token, { fields: range ? { from: range.from, to: range.to } : {} });
  return parsed(outcome, (data) => {
    const d = data as { drinks?: unknown; water_goal_ml?: unknown } | null;
    if (!d || !Array.isArray(d.drinks) || !isNonNegativeInt(d.water_goal_ml)) return null;
    const drinks = d.drinks.map(asDrink);
    return drinks.every((x): x is Drink => x !== null) ? { drinks, water_goal_ml: d.water_goal_ml } : null;
  });
}

/** Today's totals (Denver): zeros, never blanks, on a quiet day. */
export async function getDrinkTotals(token: string): Promise<DrinkOutcome<DrinkTotals>> {
  return parsed(await callAction('getDrinkTotals', token), (data) => {
    const d = data as Partial<DrinkTotals> | null;
    return d &&
      typeof d.date === 'string' &&
      isNonNegativeInt(d.water_ml) &&
      isNonNegativeInt(d.alcohol_drinks) &&
      isNonNegativeInt(d.coffee_cups) &&
      (d.unwind_mg === undefined || isNonNegativeInt(d.unwind_mg)) &&
      isNonNegativeInt(d.water_goal_ml)
      ? {
          date: d.date,
          water_ml: d.water_ml,
          alcohol_drinks: d.alcohol_drinks,
          coffee_cups: d.coffee_cups,
          unwind_mg: d.unwind_mg ?? 0,
          water_goal_ml: d.water_goal_ml,
        }
      : null;
  });
}

/** Change a drink's local time only (`HH:MM:SS`); its date stays. */
export async function updateDrinkTime(id: string, time: string, token: string): Promise<DrinkOutcome<Drink>> {
  return parsed(await callAction('updateDrinkTime', token, { payload: { id, time } }), asDrink);
}

/** Change a water drink's amount (whole ml, 1 to WATER_AMOUNT_MAX_ML) and nothing else (#588). */
export async function updateDrinkAmount(id: string, amount: number, token: string): Promise<DrinkOutcome<Drink>> {
  return parsed(await callAction('updateDrinkAmount', token, { payload: { id, amount } }), asDrink);
}

/** Remove a drink. An unknown id is a failure, not a silent success. */
export async function deleteDrink(id: string, token: string): Promise<DrinkOutcome<Drink>> {
  return parsed(await callAction('deleteDrink', token, { payload: { id } }), asDrink);
}

/**
 * Set a setting: `water_goal_ml` (whole ml, 250 to 10000) or one of the five
 * rest defaults (#576, whole seconds; api/rest-times.ts has the ranges).
 */
export async function updateSetting(
  key: typeof WATER_GOAL_KEY | RestSettingKey,
  value: number,
  token: string,
): Promise<DrinkOutcome<Setting>> {
  return parsed(await callAction('updateSetting', token, { payload: { key, value } }), (data) => {
    const d = data as Partial<Setting> | null;
    return d && d.key === key && typeof d.value === 'string' && typeof d.updated === 'string'
      ? { key: d.key, value: d.value, updated: d.updated }
      : null;
  });
}
