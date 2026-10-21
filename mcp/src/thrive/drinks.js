// Narration for thrive_drinks (#522): Thrive Sip's water, coffee and alcohol log.
//
// Pure. The API's getDrinks (#519) answers { drinks, water_goal_ml }, each
// drink a domain object ({ id, kind, amount, date, time, logged_at_utc,
// source, created, updated }); nothing here knows a column. Water `amount` is
// whole ml, coffee `amount` cups (#562), alcohol `amount` standard drinks. A
// kind this file does not know is narrated by its raw kind and amount, never
// as one it does. Read-only: no tool logs, edits or deletes a drink. The owner
// logs from the widget or the app.

import { datesBetween, describeDateRuns } from './daily.js';
import { mlToOz } from './domain.js';

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

/** One entry -> "  - 07:45 water 4 oz (118 ml) [app]". */
export function describeDrink(d) {
  const time = String(d.time ?? '').slice(0, 5) || '—';
  const n = amountOf(d);
  const say = Object.prototype.hasOwnProperty.call(AMOUNT_OF_KIND, d.kind) ? AMOUNT_OF_KIND[d.kind] : null;
  const what = `${d.kind ?? ''} ${n === null || !say ? String(d.amount ?? '') : say(n)}`.trim();
  return `  - ${time} ${what}${d.source ? ` [${d.source}]` : ''}`;
}

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
