// #522 — narration for thrive_drinks. Pure; run with `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkDrinksRange, dayTotals, describeDrink, describeDrinkDay, describeDrinksRange } from './drinks.js';
import { mlToOz } from './domain.js';

/** A drink as getDrinks returns it (#519). */
const drink = (id, kind, amount, date, time, source = 'app') => ({
  id, kind, amount, date, time, logged_at_utc: `${date}T14:00:00.000Z`, source,
  created: `${date}T14:00:01.000Z`, updated: `${date}T14:00:01.000Z`,
});

const DAY = [
  drink('d1', 'water', '118', '2026-10-19', '07:45:00', 'widget'),
  drink('d2', 'water', '118', '2026-10-19', '10:20:00'),
  drink('d3', 'water', '118', '2026-10-19', '12:05:00'),
  drink('d4', 'alcohol', '1', '2026-10-19', '19:10:00'),
  drink('d5', 'alcohol', '1', '2026-10-19', '20:30:00'),
];

test('ml converts to US fl oz to one decimal, as the app shows it, and blank stays blank', () => {
  assert.equal(mlToOz(1893), '64');
  assert.equal(mlToOz('354'), '12');
  assert.equal(mlToOz('250'), '8.5');
  assert.equal(mlToOz(''), '');
});

test('a day sums its water ml and its alcohol drinks', () => {
  assert.deepEqual(dayTotals(DAY), { water: 354, waterCount: 3, alcohol: 2, alcoholCount: 2 });
});

test('each entry shows its local time, kind, amount and source', () => {
  assert.equal(describeDrink(DAY[0]), '  - 07:45 water 4 oz (118 ml) [widget]');
  assert.equal(describeDrink(DAY[3]), '  - 19:10 alcohol 1 drink [app]');
});

test('a day line gives water in oz and ml with the % of goal, and alcohol in drinks', () => {
  assert.equal(
    describeDrinkDay('2026-10-19', DAY, 1893),
    '- 2026-10-19: water 12 oz (354 ml), 19% of goal · alcohol 2 drinks (5 entries)',
  );
});

test('a kind not logged says so, never 0', () => {
  const waterOnly = describeDrinkDay('2026-10-19', DAY.slice(0, 1), 1893);
  assert.match(waterOnly, /· no alcohol logged/);
  const alcoholOnly = describeDrinkDay('2026-10-19', DAY.slice(3, 4), 1893);
  assert.match(alcoholOnly, /^- 2026-10-19: no water logged · alcohol 1 drink \(1 entry\)$/);
  assert.doesNotMatch(waterOnly + alcoholOnly, /\b0 (oz|drinks)/);
});

test('one day: the entries, the totals and the goal', () => {
  const text = describeDrinksRange({ drinks: DAY, water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-19' });
  assert.match(text, /^Drinks, 2026-10-19: 5 entries on 1 day\./);
  assert.match(text, /Water goal: 64 oz \(1893 ml\) a day/);
  assert.match(text, /unknown, not zero/);
  assert.match(text, /- 2026-10-19: water 12 oz \(354 ml\), 19% of goal · alcohol 2 drinks/);
  assert.match(text, / {2}- 20:30 alcohol 1 drink \[app\]/);
  // A single day has no range summary.
  assert.doesNotMatch(text, /Across the range/);
});

test('a day with nothing logged says "no drinks logged", not zero', () => {
  const text = describeDrinksRange({ drinks: [], water_goal_ml: 1893 }, { from: '2026-10-20', to: '2026-10-20' });
  assert.match(text, /^Drinks, 2026-10-20: no drinks logged\./);
  assert.doesNotMatch(text, /0 oz|0 drinks|0%/);
});

test('several days: the missing days, the average water on logged days and the total alcohol', () => {
  const drinks = [
    ...DAY,
    drink('d6', 'water', '500', '2026-10-21', '09:00:00'),
    drink('d7', 'water', '500', '2026-10-21', '15:00:00'),
  ];
  const text = describeDrinksRange({ drinks, water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-22' });
  assert.match(text, /^Drinks, 2026-10-19 to 2026-10-22: 7 entries on 2 days\./);
  assert.match(text, /No drinks logged for 2 days: 2026-10-20, 2026-10-22\./);
  // (354 + 1000) / 2 = 677 ml
  assert.match(text, /Across the range: water logged on 2 of 4 days, averaging 22\.9 oz \(677 ml\) \(36% of goal\) on those days; alcohol 2 drinks in total, on 1 day\./);
  assert.ok(text.indexOf('- 2026-10-19:') < text.indexOf('- 2026-10-21:'));
});

test('a range with nothing at all is one "no drinks logged" line, no averages', () => {
  const text = describeDrinksRange({ drinks: [], water_goal_ml: 2000 }, { from: '2026-10-13', to: '2026-10-19' });
  assert.match(text, /^Drinks, 2026-10-13 to 2026-10-19: no drinks logged\./);
  assert.doesNotMatch(text, /Across the range|averaging/);
});

test('a range over 400 days is refused with a clear message; 400 is allowed', () => {
  assert.throws(
    () => checkDrinksRange({ from: '2025-01-01', to: '2026-02-05' }),
    /thrive_drinks reads at most 400 days at a time; 2025-01-01 to 2026-02-05 is 401 days\. Narrow date_from or date_to\./,
  );
  assert.doesNotThrow(() => checkDrinksRange({ from: '2025-01-01', to: '2026-02-04' }));
});
