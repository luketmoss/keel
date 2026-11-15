# 916 — Forage Trends: the Foods tab (top foods, your usuals, most cooked)

Specifies [#916](https://github.com/luketmoss/keel/issues/916), part of epic
[#889](https://github.com/luketmoss/keel/issues/889). It builds on [`913-trends-screen.md`](913-trends-screen.md), which owns
the route, the range control and its stored choice, **§States** and the empty states, and on
[`914-trends-macros-nutrients.md`](914-trends-macros-nutrients.md) (the tab row, whole-number and one-decimal rules) and
[`915-trends-meals.md`](915-trends-meals.md) (the five-tab row fit, the disabled Average control's form); this note cites
them by name and does not restate them. The layout reference is the prototype's Foods tab
([`889-trends-prototype.html`](889-trends-prototype.html), the "Meals and foods" scene); its numbers are example data.
The entry, group and usual fields are [`712-food-log.md`](712-food-log.md) and #878 (`group_id`, `usual_id`); the cook
history is #708. Tokens, spacing and "blank is not zero" are
[`suite-language.md`](../../../ui/docs/design/suite-language.md) (standing).

**What this adds:** the fifth tab, `Energy · Macros · Nutrients · Meals · Foods`, with three cards: **What drives it**,
**Your usuals** and **Most cooked**. This is the one tab that ranks and counts instead of charting days. It has no chart, so
it uses none of #913's chart rules except the range.

## Reads

| Card | Reads | Notes |
|---|---|---|
| What drives it, Your usuals | `getFoodLog(from, to)`, plus `getFoods()` and `getRecipes()` for names | One load, two cards. The entries carry `food_id`, `recipe_id`, the snapshot figures, the seven nutrients, `slot`, `group_id`, `group_name` and `usual_id` |
| Most cooked | `getCooks()`, filtered to the range in the app | All cooks, as the call has no range; a cook is in range when its `date` is |

The range is #913's: the last 7, 30, 91, 182 or 365 days ending today, or **All**. For All the app passes a start date
before anything can be logged (the client's `from` is a string), so the whole log is read. The Average control does nothing on
this tab and is **disabled** with `No average on this tab` under the controls, the form #915 uses. The tab's own choices
are below.

**Each card loads and fails alone.** The log-based cards share one load; Most cooked has its own. A failure shows in that
card only (`Couldn't load your log.` or `Couldn't load your cooks.`, with **Try again**); the other card still shows. A
slower, older answer never replaces a newer one when the range changes quickly (#913's rule).

**Slow ranges.** A year of entries is one `getFoodLog` call, and **how long it takes was not measured**: it needs the deployed
API and a real sheet, which a refinement session does not have. `/develop` times 1Y and All against the deployed app. If a year
takes longer than **about 8 seconds** (a proposed bar, not a measured one: an Apps Script call that cold-starts takes a few),
the fallback the issue names applies, a counting action in the API, which is its own issue because it adds an action, its
MCP tool and its parity entry. Until then a load that runs past 3 seconds adds one line under the skeleton, `Reading a long
range can take a moment.`

## What drives it

Heading `What drives it`, the range in words (#913's phrases) beside it. Under it, a four-way segmented control:
`Calories  Protein  Sodium  Added sugars`, 44px targets, one selected (default **Calories**), **remembered between visits**
(`localStorage` `forage-trends-food-metric`, wrapped as #913's prefs are) and set by `?tab=foods&by=kcal|protein|sodium|added_sugars`
in the hash (`by`, not `metric`: `metric=protein` and `metric=sodium` already name charts on the Macros and Nutrients
tabs). The control's choice is a swap.

### Ranking

- **An item** is a food (by `food_id`) or a recipe (by `recipe_id`). **A logged recipe ranks as itself**: the log holds one
  entry for it, so its figure is the entry's, never split into its ingredients. A food logged in two units is one item.
- **The amount** is the sum, over the item's entries in the range, of the entry's value for the metric: `kcal`, `protein_g`,
  `sodium_mg` or `added_sugars_g`.
- **Entries with that value blank don't count** (null: a food or recipe with no nutrition, or one that doesn't report
  that nutrient, or an entry from before #755). They add nothing to an item and nothing to the total. A measured `0` counts,
  and an item whose amount is 0 is not listed (it drives nothing).
- **The share** is the item's amount over the metric's total across **all** items (not only the ranked ones), whole numbers,
  `<1%` for a real value that would round to 0. The shares of the top items do not add to 100.
- **How many times** is the number of the item's entries in the range, `14×`, whether or not the value was blank.
- **The list** is the top **7** by amount, then by times, then by name. Fewer than 7 items show fewer rows.
- **Today's entries are included.** #913 leaves today out of *averages*; this card ranks and counts, so it uses everything in
  the range, and its figures are not "so far" claims.

### A row

Rank number (`--text-sm`, `--color-text-secondary`), then the name with a meter under it, then the share. The name is
the food as Eaten shows it (brand in secondary text, then the name, `FoodName`) or the recipe's name, one line, wrapping to
two. The meter is a bar in `--chart-bar` on `--color-border-light`, its width the item's amount over the top item's, so the top
row is full. On the right, the share in `--text-base` weight 600 (`31%`), and under it, in `--text-xs`
`--color-text-secondary`, the amount and times: `1,240 mg · 14×`. Calories and sodium are whole numbers with a thousands
separator; protein is whole grams; added sugars is whole grams, or one decimal under 10 (#914's rule). The row is not a
button. Its accessible name is one sentence: `Greek yogurt, 31% of sodium, 1,240 milligrams, logged 14 times`.

An item whose food or recipe no longer exists (a food can be deleted while log entries still use it) is named
`Removed food` or `Removed recipe`; it still ranks, as its entries still hold the figures.

### Blanks, in words

When any entry in the range has the metric blank, the card says so under the list, in `--text-sm`
`--color-text-secondary`, in the voice #864 uses for "at least": `Shares are of what entries reported. 12 of 310 entries
have no sodium value and are left out.` (`no calories`, `no protein value`, `no added sugars value`, by metric). With none
blank the line reads `Share of all the sodium logged in the range. A logged recipe ranks as itself.`, and the second
sentence stays in both forms. It is words, never colour alone.

### States

| State | Shows |
|---|---|
| Loading | Skeleton rows in `--color-surface-raised`, static under reduced motion; the controls work |
| Nothing logged in the range | `Nothing logged in this range.` |
| Logged, but nothing has a value for the metric | `None of the entries in this range report sodium.` (`have nutrition`, `report protein`, `report added sugars`), no rows; the blanks line is not repeated |
| Fewer than 7 items | The rows there are |
| Failed | `Couldn't load your log.` and **Try again** |

## Your usuals

Heading `Your usuals`, `times added` beside it. The usuals added most often in the range (#876).

- **A time added is one `group_id`** among entries with that `usual_id` in the range. A usual added with five lines is one,
  however many entries it wrote. A copied meal (#884) writes new groups that keep the usual, and counts again, being another
  time it was added.
- **A usual's name** is the heading it was last logged under (`group_name` of its most recent group by date, then
  `logged_at`), so a rename shows from the next logging. **A deleted usual** has had its `usual_id` cleared by the API (#878),
  so it no longer appears and the entries it wrote are ordinary: say so nowhere; it is simply not a usual any more.
- **Usually for** is the meal the usual was most often added to in the range (the slot most common among its groups; a tie goes
  to the most recent group's slot): `usually Dinner`. It is the slot the entries were in, not the usual's saved slot.
- **The list** is the top 7 by times added, then by most recent, then by name. A row has the rank, the name with a meter
  (`--chart-bar`, width over the top usual's count), `12×` on the right and `usually Dinner` under it. The accessible name:
  `Weekday oats, added 12 times, usually for Breakfast`.
- Empty: `No usuals added in this range.` Failed: the log card's failure.

## Most cooked

Heading `Most cooked`, `from cook history` beside it.

- **A cook in range** is a Cooks row whose `date` is within the range, today included. Cooks are counted per recipe
  (`recipe_id`, named by the row's `recipe_name`).
- **The rating** is the recipe's latest non-blank rating **across all its cooks, not only the ones in the range**, the same
  figure the Library shows for the recipe, so the two never disagree. The stars are #708's `Stars`, with `4 of 5` as the
  words; a recipe never rated reads `Not rated`. Never 0 stars.
- **The list** is the top 7 by cooks in range, then by the most recent cook, then by name. A row has the rank, the recipe's
  name, `5×` and, under it, the rating. A recipe deleted since has no cooks (the API deletes them with it), so it is not here.
- Empty: `Nothing cooked in this range.` Failed: `Couldn't load your cooks.` and **Try again**.
- The row's accessible name: `Sheet-pan chicken fajitas, cooked 5 times, rated 4 of 5`.

## Copy

| Where | Text |
|---|---|
| Tab | `Foods` |
| Controls | `Calories`, `Protein`, `Sodium`, `Added sugars` (a group named `Rank by`); `No average on this tab` |
| What drives it | `What drives it`, `31%`, `<1%`, `1,240 mg · 14×`, `Removed food`, `Removed recipe`, `Shares are of what entries reported. 12 of 310 entries have no sodium value and are left out.`, `Share of all the sodium logged in the range. A logged recipe ranks as itself.`, `None of the entries in this range report sodium.` |
| Usuals | `Your usuals`, `times added`, `12×`, `usually Dinner`, `No usuals added in this range.` |
| Most cooked | `Most cooked`, `from cook history`, `5×`, `4 of 5`, `Not rated`, `Nothing cooked in this range.` |
| Shared | `Nothing logged in this range.`, `Reading a long range can take a moment.`, `Couldn't load your log.`, `Couldn't load your cooks.`, `Try again` |

## New tokens

None: `--chart-bar` and `--color-border-light` (from #913), `--space-*`, `--text-*`.

## Edge cases

- **One item:** one row, a full meter, a share of 100%.
- **A recipe and a food of the same name** are two items, told apart by their entries' ids.
- **An entry with both ids blank** does not occur (exactly one is set, #712); an unreadable one is skipped.
- **A range with a lot of entries** is read whole and counted in the app: nothing is paged or sampled, so the ranking is
  exact.
- **The metric switches** keep the range and rebuild the list from the entries already read: no new request.
- **A usual with every line swapped** still counts: it is the usual that was added.
- **Midnight, rapid range changes, time zone:** as #913.

## Out of scope

- Tapping a row to open a food, recipe or usual, or drilling into the days that item was logged.
- A fourth ranking (a different nutrient), a cost or a count of ingredients, and per-meal rankings.
- A counting action in the API (the named fallback, its own issue, only if a year proves slow).
- Shopping or plan trends, and any sentence that judges what is eaten or cooked most.
