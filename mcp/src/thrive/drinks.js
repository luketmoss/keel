// Narration for thrive_drinks (#522): Thrive Sip's water, coffee and alcohol log,
// and the checks and wording of the drink write tools (#595).
//
// Pure. The API's getDrinks (#519) answers { drinks, water_goal_ml }, each
// drink a domain object ({ id, kind, amount, date, time, logged_at_utc,
// source, created, updated }); nothing here knows a column. Water `amount` is
// whole ml, coffee `amount` cups (#562), alcohol `amount` standard drinks. A
// kind this file does not know is narrated by its raw kind and amount, never
// as one it does.

import { datesBetween, describeDateRuns } from './daily.js';
import { ML_PER_OZ, addDays, mlToOz, normalizeDate, nowTimeStr, startedAtUtc, todayStr } from './domain.js';

/** The API refuses a longer range (DRINKS_MAX_RANGE_DAYS in apps-script/src/types.js). */
export const DRINKS_MAX_RANGE_DAYS = 400;

/** A refusal for a range the API would refuse, said before any request. */
export function checkDrinksRange({ from, to }) {
  const days = datesBetween(from, to).length;
  if (days > DRINKS_MAX_RANGE_DAYS) {
    throw new Error(
      `thrive_drinks reads at most ${DRINKS_MAX_RANGE_DAYS} days at a time; ${from} to ${to} is ${days} days. ` +
      'Narrow date_from or date_to.',
    );
  }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 354 -> "12 oz (354 ml)". */
const water = (ml) => `${mlToOz(ml)} oz (${ml} ml)`;

/** A whole-number amount, or null for anything the API would not have written. */
function amountOf(drink) {
  const s = String(drink.amount ?? '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** One day's entries -> { water, waterCount, coffee, coffeeCount, alcohol, alcoholCount }. */
export function dayTotals(entries) {
  const t = { water: 0, waterCount: 0, coffee: 0, coffeeCount: 0, alcohol: 0, alcoholCount: 0 };
  for (const d of entries) {
    const n = amountOf(d);
    if (n === null) continue;
    if (d.kind === 'water') { t.water += n; t.waterCount += 1; }
    else if (d.kind === 'coffee') { t.coffee += n; t.coffeeCount += 1; }
    else if (d.kind === 'alcohol') { t.alcohol += n; t.alcoholCount += 1; }
  }
  return t;
}

/** "62% of goal", from whole ml against the goal in ml. */
const ofGoal = (ml, goal) => `${Math.round((ml / goal) * 100)}% of goal`;

/** How each known kind says its amount; any other kind is said raw. */
const AMOUNT_OF_KIND = {
  water,
  coffee: (n) => plural(n, 'cup'),
  alcohol: (n) => plural(n, 'drink'),
};

/** One entry -> "07:45 water 4 oz (118 ml) [app] (d1)": its id is what the write tools take (#595). */
export function drinkLine(d) {
  const time = String(d.time ?? '').slice(0, 5) || '—';
  const n = amountOf(d);
  const say = Object.prototype.hasOwnProperty.call(AMOUNT_OF_KIND, d.kind) ? AMOUNT_OF_KIND[d.kind] : null;
  const what = `${d.kind ?? ''} ${n === null || !say ? String(d.amount ?? '') : say(n)}`.trim();
  return `${time} ${what}${d.source ? ` [${d.source}]` : ''}${d.id ? ` (${d.id})` : ''}`;
}

/** One entry -> "  - 07:45 water 4 oz (118 ml) [app] (d1)". */
export const describeDrink = (d) => `  - ${drinkLine(d)}`;

/** One day's heading line: its totals, each kind said as "no ... logged" when absent, never 0. */
export function describeDrinkDay(date, entries, goal) {
  const t = dayTotals(entries);
  const waterPart = t.waterCount
    ? `water ${water(t.water)}, ${ofGoal(t.water, goal)}`
    : 'no water logged';
  const coffeePart = t.coffeeCount ? `coffee ${plural(t.coffee, 'cup')}` : 'no coffee logged';
  const alcoholPart = t.alcoholCount ? `alcohol ${plural(t.alcohol, 'drink')}` : 'no alcohol logged';
  return `- ${date}: ${waterPart} · ${coffeePart} · ${alcoholPart} (${plural(entries.length, 'entry', 'entries')})`;
}

/** The thrive_drinks response. */
export function describeDrinksRange({ drinks, water_goal_ml: goal }, { from, to }) {
  const byDate = new Map();
  for (const d of drinks) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date).push(d);
  }
  const dates = [...byDate.keys()].sort();
  const span = datesBetween(from, to);
  const range = from === to ? from : `${from} to ${to}`;

  const out = [
    drinks.length
      ? `Drinks, ${range}: ${plural(drinks.length, 'entry', 'entries')} on ${plural(dates.length, 'day')}.`
      : `Drinks, ${range}: no drinks logged.`,
    `Water goal: ${mlToOz(goal)} oz (${goal} ml) a day. It is the current setting, applied to every day shown: ` +
      'past goals are not kept.',
    'Water is in US fl oz and ml; coffee in cups; alcohol in standard drinks. A day, or a kind, with nothing logged is unknown, ' +
      'not zero. Times are local (America/Denver).',
  ];

  if (span.length > 1) {
    const missing = span.filter((d) => !byDate.has(d));
    if (missing.length && dates.length) {
      out.push(`No drinks logged for ${plural(missing.length, 'day')}: ${describeDateRuns(missing)}.`);
    }
    if (dates.length) {
      const totals = dates.map((d) => dayTotals(byDate.get(d)));
      const waterDays = totals.filter((t) => t.waterCount);
      const coffeeDays = totals.filter((t) => t.coffeeCount);
      const alcoholDays = totals.filter((t) => t.alcoholCount);
      const waterLine = waterDays.length
        ? (() => {
          const avg = Math.round(waterDays.reduce((s, t) => s + t.water, 0) / waterDays.length);
          return `water logged on ${waterDays.length} of ${span.length} days, averaging ${water(avg)} ` +
            `(${ofGoal(avg, goal)}) on those days`;
        })()
        : 'no water logged';
      const coffeeLine = coffeeDays.length
        ? `coffee ${plural(coffeeDays.reduce((s, t) => s + t.coffee, 0), 'cup')} in total, ` +
          `on ${plural(coffeeDays.length, 'day')}`
        : 'no coffee logged';
      const alcoholLine = alcoholDays.length
        ? `alcohol ${plural(alcoholDays.reduce((s, t) => s + t.alcohol, 0), 'drink')} in total, ` +
          `on ${plural(alcoholDays.length, 'day')}`
        : 'no alcohol logged';
      out.push(`Across the range: ${waterLine}; ${coffeeLine}; ${alcoholLine}.`);
    }
  }

  if (dates.length) {
    out.push('');
    for (const date of dates) {
      const entries = byDate.get(date);
      out.push(describeDrinkDay(date, entries, goal), ...entries.map(describeDrink));
    }
  }
  return out.join('\n');
}

// --- writes (#595) ----------------------------------------------------

/** WATER_AMOUNT_MAX_ML (2000) in apps-script/src/types.js, in whole oz: 67 oz is 1981 ml. */
export const WATER_OZ_MAX = 67;
/** The widget's tap, 4 oz (118 ml). */
export const WATER_OZ_DEFAULT = 4;
/** Entries one thrive_log_drink call may log ("3 beers"). */
export const LOG_COUNT_MAX = 10;

const DRINK_KINDS = ['water', 'coffee', 'alcohol'];
const DATE_FORMS = "YYYY-MM-DD, 'today', 'yesterday' or '-2d'";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whole oz -> whole ml, as stored. 16 -> 473. */
export const ozToMl = (oz) => Math.round(oz * ML_PER_OZ);

/** amount_oz checked against the drink's kind: whole ml, or a refusal naming the field. */
export function checkAmountOz(amountOz, kind) {
  if (kind !== 'water') {
    throw new Error(
      'amount_oz is only for water: coffee and alcohol are always 1 per entry. Use count to log several.',
    );
  }
  if (!Number.isInteger(amountOz) || amountOz < 1 || amountOz > WATER_OZ_MAX) {
    throw new Error(`amount_oz must be a whole number of ounces from 1 to ${WATER_OZ_MAX} (2000 ml); got ${amountOz}.`);
  }
  return ozToMl(amountOz);
}

/** A time as HH:MM, or a refusal naming the field. */
export function checkTime(time) {
  if (typeof time !== 'string' || !TIME_RE.test(time.trim())) {
    throw new Error(`time must be HH:MM, 24-hour local time (America/Denver), such as 22:00; got "${time}".`);
  }
  return time.trim();
}

/** A real calendar date from normalizeDate's forms, or ''. */
function realDate(value, now) {
  const day = normalizeDate(value, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : '';
}

/**
 * thrive_log_drink's arguments -> what to send, or a refusal naming the field.
 * Every check happens here, before any request. `time` defaults to now on today
 * and to 23:59 on a past date, as the Day view does (#588); a date and time
 * after now is refused. `logged_at_utc` is that Denver wall-clock time as a UTC
 * instant, DST-aware, from which the API derives the row's date and time.
 */
export function planDrinkLog({ kind, amount_oz: amountOz, count = 1, date, time }, now = new Date()) {
  if (!DRINK_KINDS.includes(kind)) throw new Error(`kind must be water, coffee or alcohol; got "${kind}".`);
  const amount = amountOz === undefined ? (kind === 'water' ? ozToMl(WATER_OZ_DEFAULT) : 1) : checkAmountOz(amountOz, kind);
  if (!Number.isInteger(count) || count < 1 || count > LOG_COUNT_MAX) {
    throw new Error(`count must be a whole number from 1 to ${LOG_COUNT_MAX}; got ${count}.`);
  }

  const today = todayStr(now);
  const day = date === undefined ? today : realDate(date, now);
  if (!day) throw new Error(`date could not be read as a date: "${date}". Use ${DATE_FORMS}.`);
  if (day > today) throw new Error(`date ${day} is in the future: a drink can be logged for now or earlier.`);

  const at = time === undefined ? (day === today ? nowTimeStr(now) : '23:59') : checkTime(time);
  const local = startedAtUtc(day, at);
  const instant = local ? new Date(local) : null;
  if (!instant || Number.isNaN(instant.getTime())) {
    throw new Error(`date and time could not be read as a time in America/Denver: ${day} ${at}.`);
  }
  if (instant.getTime() > now.getTime()) {
    throw new Error(
      `time ${at} on ${day} is in the future (it is ${nowTimeStr(now)} in America/Denver): ` +
      'a drink can be logged for now or earlier.',
    );
  }
  return { kind, amount, count, date: day, time: at, logged_at_utc: instant.toISOString() };
}

/** The first line of a log's result: "Logged 16 oz (473 ml) of water on 2026-10-22 at 22:00." */
export function describeLogged({ kind, amount, count, date, time }) {
  const when = `on ${date} at ${time}.`;
  if (kind === 'water') {
    return count === 1
      ? `Logged ${water(amount)} of water ${when}`
      : `Logged ${count} water entries of ${water(amount)} each ${when}`;
  }
  if (kind === 'coffee') return `Logged ${plural(count, 'cup')} of coffee ${when}`;
  return `Logged ${plural(count, 'alcohol drink')} ${when}`;
}

/** The first day of the window the write tools find a drink in: the API's longest range, ending today. */
export const findWindowStart = (now = new Date()) => addDays(todayStr(now), -(DRINKS_MAX_RANGE_DAYS - 1));

/** "4 oz → 16 oz (473 ml)", for an amount change. */
export const describeAmountChange = (fromMl, toMl) => `${mlToOz(fromMl)} oz → ${water(toMl)}`;
