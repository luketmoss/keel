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

test('ml converts to whole US fl oz, as the app shows it, and blank stays blank', () => {
  assert.equal(mlToOz(1893), '64');
  assert.equal(mlToOz('354'), '12');
  assert.equal(mlToOz('250'), '8');
  assert.equal(mlToOz(1180), '40'); // ten + 4 oz taps read 39.9 in tenths (#573)
  for (let taps = 1; taps <= 40; taps++) assert.equal(mlToOz(taps * 118), String(taps * 4));
  assert.equal(mlToOz(''), '');
});

test('a day sums its water ml and its alcohol drinks', () => {
  assert.deepEqual(dayTotals(DAY), { water: 354, waterCount: 3, coffee: 0, coffeeCount: 0, alcohol: 2, alcoholCount: 2 });
});

test('each entry shows its local time, kind, amount, source and id (#595)', () => {
  assert.equal(describeDrink(DAY[0]), '  - 07:45 water 4 oz (118 ml) [widget] (d1)');
  assert.equal(describeDrink(DAY[3]), '  - 19:10 alcohol 1 drink [app] (d4)');
  assert.equal(describeDrink({ ...DAY[3], source: 'mcp' }), '  - 19:10 alcohol 1 drink [mcp] (d4)');
});

test('a day line gives water in oz and ml with the % of goal, and alcohol in drinks', () => {
  assert.equal(
    describeDrinkDay('2026-10-19', DAY, 1893),
    '- 2026-10-19: water 12 oz (354 ml), 19% of goal · no coffee logged · alcohol 2 drinks (5 entries)',
  );
});

test('a kind not logged says so, never 0', () => {
  const waterOnly = describeDrinkDay('2026-10-19', DAY.slice(0, 1), 1893);
  assert.match(waterOnly, /· no alcohol logged/);
  const alcoholOnly = describeDrinkDay('2026-10-19', DAY.slice(3, 4), 1893);
  assert.match(alcoholOnly, /^- 2026-10-19: no water logged · no coffee logged · alcohol 1 drink \(1 entry\)$/);
  assert.doesNotMatch(waterOnly + alcoholOnly, /\b0 (oz|drinks)/);
});

test('one day: the entries, the totals and the goal', () => {
  const text = describeDrinksRange({ drinks: DAY, water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-19' });
  assert.match(text, /^Drinks, 2026-10-19: 5 entries on 1 day\./);
  assert.match(text, /Water goal: 64 oz \(1893 ml\) a day/);
  assert.match(text, /unknown, not zero/);
  assert.match(text, /- 2026-10-19: water 12 oz \(354 ml\), 19% of goal · no coffee logged · alcohol 2 drinks/);
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
  assert.match(text, /Across the range: water logged on 2 of 4 days, averaging 23 oz \(677 ml\) \(36% of goal\) on those days; no coffee logged; alcohol 2 drinks in total, on 1 day\./);
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

// #562: coffee, counted in cups, narrated as itself and never as alcohol.
const MIXED = [
  drink('m1', 'water', '354', '2026-10-19', '06:50:00', 'widget'),
  drink('m2', 'coffee', '1', '2026-10-19', '07:10:00'),
  drink('m3', 'coffee', '1', '2026-10-19', '13:30:00', 'widget'),
  drink('m4', 'alcohol', '1', '2026-10-19', '19:10:00'),
  drink('m5', 'alcohol', '1', '2026-10-19', '20:30:00'),
];

test('#562: each entry is listed under its own kind, coffee in cups', () => {
  assert.equal(describeDrink(MIXED[1]), '  - 07:10 coffee 1 cup [app] (m2)');
  assert.equal(describeDrink(drink('c', 'coffee', '2', '2026-10-19', '08:00:00')), '  - 08:00 coffee 2 cups [app] (c)');
  assert.equal(describeDrink(MIXED[0]), '  - 06:50 water 12 oz (354 ml) [widget] (m1)');
  assert.equal(describeDrink(MIXED[3]), '  - 19:10 alcohol 1 drink [app] (m4)');
});

test('#562: a day with water, coffee and alcohol sums each, and says coffee between water and alcohol', () => {
  assert.deepEqual(dayTotals(MIXED), { water: 354, waterCount: 1, coffee: 2, coffeeCount: 2, alcohol: 2, alcoholCount: 2 });
  assert.equal(
    describeDrinkDay('2026-10-19', MIXED, 1893),
    '- 2026-10-19: water 12 oz (354 ml), 19% of goal · coffee 2 cups · alcohol 2 drinks (5 entries)',
  );
  const text = describeDrinksRange({ drinks: MIXED, water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-19' });
  assert.match(text, /coffee in cups/);
  assert.match(text, / {2}- 07:10 coffee 1 cup \[app\]/);
  assert.match(text, / {2}- 13:30 coffee 1 cup \[widget\]/);
});

test('#562: a day without coffee says "no coffee logged", never 0', () => {
  const line = describeDrinkDay('2026-10-19', DAY, 1893);
  assert.match(line, /· no coffee logged ·/);
  assert.doesNotMatch(line, /coffee 0/);
});

test('#562: an unknown kind is said by its raw kind and amount, never as alcohol', () => {
  const tea = drink('t1', 'tea', '1', '2026-10-19', '15:00:00');
  assert.equal(describeDrink(tea), '  - 15:00 tea 1 [app] (t1)');
  assert.equal(describeDrink({ ...tea, amount: 'a mug' }), '  - 15:00 tea a mug [app] (t1)');
  assert.deepEqual(dayTotals([tea]), { water: 0, waterCount: 0, coffee: 0, coffeeCount: 0, alcohol: 0, alcoholCount: 0 });
  const text = describeDrinksRange({ drinks: [tea], water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-19' });
  assert.match(text, /- 2026-10-19: no water logged · no coffee logged · no alcohol logged \(1 entry\)/);
  assert.doesNotMatch(text.split('\n').filter((l) => l.startsWith('  - ')).join('\n'), /alcohol/);
});

test('#562: over several days the range line adds the coffee total and its days', () => {
  const drinks = [
    ...MIXED,
    drink('m6', 'coffee', '1', '2026-10-21', '07:00:00'),
  ];
  const text = describeDrinksRange({ drinks, water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-22' });
  assert.match(text, /; coffee 3 cups in total, on 2 days; alcohol 2 drinks in total, on 1 day\./);
  const one = describeDrinksRange({ drinks: [drink('c', 'coffee', '1', '2026-10-20', '07:00:00')], water_goal_ml: 1893 },
    { from: '2026-10-19', to: '2026-10-20' });
  assert.match(one, /; coffee 1 cup in total, on 1 day;/);
  const none = describeDrinksRange({ drinks: DAY, water_goal_ml: 1893 }, { from: '2026-10-19', to: '2026-10-20' });
  assert.match(none, /; no coffee logged; alcohol 2 drinks in total/);
});
