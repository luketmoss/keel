# 712 — Forage food log (Eaten)

Specifies [#712](https://github.com/luketmoss/keel/issues/712). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md), including §Showing data ("blank is not zero",
"so far"); the shell, header and account button from [`704-app-shell.md`](704-app-shell.md); bottom sheets, the status
line and the amount parser from [`706-recipe-import.md`](706-recipe-import.md); the Add a food sheet, food form,
recipe Nutrition sheet and chips from [`707-food-library.md`](707-food-library.md). None is restated. The layout
reference is the approved prototype (https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1): the Eaten day card, the
meal cards, the Add sheet and the amount sheet. There are no standing documents in `forage/docs/design/` beyond #702
and #704. Every length is a token; nothing here introduces one.

## Main path

1. Open **Eaten**. The day is today. The day card, then Breakfast, Lunch, Dinner and Snacks.
2. Tap **Add to dinner**. The Add sheet lists recent foods and recipes; type to search.
3. Tap a result. The amount sheet opens on one serving, with its calories and macros. Change the amount or unit,
   check the meal, tap **Log it**.
4. The sheet closes, the entry is in its meal, the day card has updated, and a status line says "Logged Greek
   yogurt".
5. A meal planned for the day sits in its slot as **Planned: Beef Stew**. **Log 1 serving** logs it in one tap.
6. Tap an entry to change its amount or meal, or delete it. Previous day (left arrow) goes back; next (right arrow)
   stops at today.

This replaces #704's copy-only empty state for Eaten: the tab is now always the day view.

## Day view

Header: previous-day button (44px, "Previous day"), the day in the middle, next-day button (44px, "Next day",
disabled on today), then #704's account button. The day reads `Today`, `Yesterday` or a weekday and date
(`Mon 2 Nov`), with the full date in `--text-sm` `--color-text-secondary` under it.

### Day card

One card. Large: the calories in `--text-2xl` with tabular figures, and under it `kcal so far` on today and `kcal`
on other days. To the right or wrapping below at 375px: three figures, `Protein 62 g`, `Carbs 140 g`, `Fat 48 g`
(grams to the whole number). Everything comes from `getFoodLogTotals` for the day; the app adds nothing up.

| State | Shows |
|---|---|
| Loading | Skeleton card in `--color-surface-raised`, static under reduced motion. The meal cards render their Add rows meanwhile |
| Nothing logged | `—` in place of the calories, with "Nothing logged today." (other days: "Nothing logged on Monday."). Macros show `—`. Never `0` |
| Logged | The figures |
| Low (partial or unknown entries) | The figures, then a line in `--color-text-secondary`: "Some entries have no nutrition or are missing ingredients, so this total is low." Preceded by a `Low` chip in `--color-warning` on `--color-warning-light`; it is text and a chip, not colour alone |
| All entries unknown | `—` for calories and macros, with "None of today's entries has nutrition yet." |
| Failed | `role="status"` in `--color-danger-text`: "Couldn't load your log." and **Try again**. The meal cards show nothing |

### Meal cards

A card per meal. Header: the meal name. A row per entry, then the planned rows, then the Add row.

- **Entry row**, 56px or more, a button that opens the amount sheet in edit mode. Line one: the food (brand then name)
  or recipe name. Line two: the amount as the person logged it: `1 bar · 40 g`, `150 g`, `2 servings`, `1.5 cup · 188 g`.
  Right: the calories as a whole number with `kcal` in `--text-sm`; an entry with no nutrition shows a `—` chip and
  "No nutrition" on line two in place of the grams; a partial recipe shows `partial` after its amount.
- **Planned row**, 56px or more. Line one: `Planned: Beef Stew` in `--color-text-secondary`. Line two: `412 kcal a serving`
  (`No nutrition yet` when none; `about 412 kcal a serving, partial` when partial). Right: a small secondary button
  **Log 1 serving** (44px). The row is a ghost: no background change, so it reads as a suggestion.
- **Add row**, 44px or more, `--color-primary`, "Add to dinner" with a plus icon.
- A meal with nothing in it shows only its Add row. There is no per-meal total (the day card is the only sum).

Order within a meal: logged entries in the order logged, then planned rows in plan order. The planned rows are the
day's `getPlan` entries that name a recipe, joined to `getRecipes` for name and per-serving figures. A plan entry
with a note (a night out, leftovers) is not shown. A plan entry is hidden once the log holds an entry with the same
recipe, date and slot; each log entry hides one plan entry, so a recipe planned twice in a slot still offers the
second.

**Log 1 serving.** The button is `aria-busy` and disabled while the request is in flight; the app sends its own
entry `id` so a retry leaves one row. On success the planned row is replaced by the entry (recipe name, `1 serving`)
and the day card refreshes; a status line says "Logged Beef Stew". On failure the row stays and a line in
`--color-danger-text` under it says "Couldn't log. Try again." A recipe with no counted line has no button: tapping
the row opens its Nutrition sheet (#707) and the line says `No nutrition yet`.

## Add sheet

A bottom sheet, title `Add to dinner`, a "Search foods and recipes" field (focused, `type="search"`), the results,
and a last full-width secondary button **Not here? Add a food**.

**With no text**
- A label `Recent` and up to 10 foods and recipes most recently logged, newest first, each once. They are derived
  from the last 60 days of the log. Foods without nutrition are left out.
- No recents: the label `Your recipes` and up to 3 recipes, then "Nothing logged yet. Search for a food or recipe."
  above them.

**With text:** foods whose name or brand contains it (case-insensitive), then recipes, up to 20 rows.

**A row** is 56px or more, a button. Line one: brand then name. Line two: `Packaged · 190 kcal a bar`,
`Ingredient · 364 kcal / 100 g`, or `Recipe · 412 kcal a serving`. A plus icon at the right. A row for a food or
recipe with no nutrition has line two `No nutrition yet`, a `--color-text-muted` name, and `Add nutrition` in place of
the plus: it opens #707's food form (or recipe Nutrition sheet) rather than the amount sheet, and returns here.

| State | Shows |
|---|---|
| Loading | Three skeleton rows |
| No match | "Nothing matches "<text>"." The **Not here? Add a food** button stays |
| Failed | "Couldn't load your foods." and **Try again** |
| Library empty | "No foods in your library yet." and the same **Not here? Add a food** button |

**Not here? Add a food** opens #707's Add a food sheet over this one. Coming back:

- A food saved from the label or by barcode (it has nutrition): the amount sheet opens for it, meal kept.
- "Already yours": **Open it** opens the amount sheet for that food.
- A starter-list add: back to this sheet with the search field set to the added food's name (empty when several).
- Cancelled: back to this sheet unchanged.

## Amount sheet

The same sheet adds and edits. Title: the food or recipe name. Under it, a `Greek yogurt · 1 cup = 245 g` line in
`--color-text-secondary` for a food (its default weight; omitted when it has none) or `Serves 6` for a recipe.

1. **Amount.** A stepper (44px minus and plus around the field) and a field `inputmode="decimal"`, accepting `1 1/2`,
   `½`, `150` (the #706 parser). Plus and minus step 0.5 in servings and 10 in grams, never below the step.
2. **Unit.** For a food, a select of its named servings (`cup (245 g)`, `bar (40 g)`), then `grams`. For a recipe, the
   fixed word `servings` and no select. The first unit is the food's default weight; a food with none has only
   `grams`. Default amount: `1` serving, or `100` in grams. Changing unit resets to that unit's default.
3. **The numbers.** A card with the calories (`--text-xl`) and `Protein 6 g · Carbs 9 g · Fat 0.4 g`, from `logFood`
   with `dry_run: true`, requested 400ms after the last change. While it is out, the figures stay and a
   `role="status"` "Updating…" replaces the label under them. A recipe that is partial adds `partial` and the one line
   "Some ingredients are left out." There is no nutrition to show only for foods and recipes that are not offered
   here, so there is no empty case. If the preview fails: "Couldn't work out the calories." and **Log it** stays
   enabled (the API computes on save).
4. **Meal.** Chips Breakfast | Lunch | Dinner | Snacks, `aria-pressed`, preset to the slot tapped.
5. Primary **Log it** (**Save** when editing), full width. Disabled when the amount is empty, zero or over 99999,
   and while saving (`aria-busy`).

When editing, a text button **Delete entry** (danger) sits under Save.

| State | Shows |
|---|---|
| Saving | Button disabled, `aria-busy` |
| Save failed | `role="status"` above the button in `--color-danger-text`: "Couldn't save: <fixed reason>" or "Couldn't save. Your changes are kept here. Try again." The sheet stays open |
| Food or recipe was deleted meanwhile | The API's refusal text, fixed |
| Invalid amount | Save disabled; helper "Enter an amount above 0." |

**Delete.** "Delete Greek yogurt from Dinner? Its calories come off today's total." with **Delete** (danger) and
**Cancel**. On delete the sheet closes and a status line says "Deleted Greek yogurt".

Editing keeps what was stored: opening an entry shows its stored numbers (the first preview is the entry itself).
Changing the amount or unit recalculates from the food as it is now; changing only the meal does not. When the
recalculated calories differ from the stored ones, the card says "Recalculated from the food as it is now."

## Edge cases

- **Zero and the maximum:** amounts above 0 up to 99999. `0` or blank disables the button with the helper above.
- **Rapid repeat:** Log it, Log 1 serving and chip taps are disabled while in flight; the entry `id` is fixed per
  sheet open, so a repeated tap or a retry after a lost response leaves one entry.
- **Day change while a sheet is open** (midnight): the entry is saved to the day the sheet was opened for.
- **Logging on a past day** is allowed; the next-day arrow is the only limit. Future days cannot be reached, so
  tomorrow's planned meals are not loggable.
- **Plan changed elsewhere:** the planned rows refetch when the tab opens and after each log; they never
  poll.
- **Food edited after logging:** old entries keep their numbers, by #703. The entry's sheet says so only when the
  amount is changed.
- **A recipe whose last line is edited to no nutrition:** past entries stay; the Add sheet then lists it as `No
  nutrition yet`.
- **Time zone:** days are `America/Denver` dates as #703 pins. "Today" is the device's local date; a device in
  another zone can see yesterday's or tomorrow's log under "Today". Out of scope.
- **Offline:** every list shows its failed state. No queue.
- **375px:** the day card's macros wrap under the calories; rows truncate nothing (the name wraps to a second line);
  no horizontal scroll.

## Accessibility

- Every control 44px or more, including the arrows, stepper, chips and Delete entry. Sheets trap focus, restore it to
  the opener and close on Escape.
- The day heading is an `h1`; each meal card is a region labelled by its heading. The day card's figures are one
  `role="group"` named "Totals for <date>".
- Totals, "Low", "No nutrition" and "partial" are text, never colour alone. "Logged", "Deleted", "Updating…" and
  failures are in `role="status"` regions.
- Reduced motion: sheets appear without sliding; skeletons are static.

## Demo mode

Sample day (today): Breakfast has yogurt with granola (two entries); Lunch has a partial recipe (`partial`) and an
entry with no nutrition; Dinner is empty with one planned meal (Beef Stew); Snacks has a granola bar. The day before
has two entries; the day before that has none (the "—" state). Foods and recipes come from #707's samples. #704's
banner stays visible.

## Daily totals: what Thrive reads (#714)

`getFoodLogTotals({ from, to })` is the only contract. Specified here so #714 does not reread the issue.

```json
{ "from": "2026-11-03", "to": "2026-11-03",
  "days": [ { "date": "2026-11-03", "entries": 4, "unknown_entries": 1,
              "kcal": 1240.5, "protein_g": 62.1, "carbs_g": 140.0, "fat_g": 48.3, "partial": true } ] }
```

| Field | Meaning |
|---|---|
| `days` | Only dates with at least one entry, ascending. **Absent means nothing logged**, not zero |
| `entries` | Number of log entries that date |
| `unknown_entries` | Entries whose stored snapshot is blank (a food or recipe with no nutrition) |
| `kcal`, `protein_g`, `carbs_g`, `fat_g` | Sum over the entries that have a value, to 0.1. `null` when no entry that date has one |
| `partial` | True when any entry is `partial` or unknown: the true total is higher |

A reader shows `—` for a date that is absent or whose figures are `null`, and says "so far" when the date is today
(the API does not know what time the day ends). A reader that gets `partial: true` says the total is low. A day an
agent logged with `forage_log_food` appears the same as one the app logged: `source` is not in this read.

Not decided here, for #714: the API's token caller checks `FORAGE_GOOGLE_CLIENT_ID` (#703), which is Forage's
sign-in, so how Thrive's app is allowed to call `getFoodLogTotals` is #714's to settle.

## MCP tools (registered by this issue)

All go through the Forage API. Wording follows #713: the write tools end with its reminder, and the tool
descriptions say what each does and that the tool is on the write connector.

| Tool | Inputs | Calls | Result |
|---|---|---|---|
| `forage_food_log` (read) | `date` or `from` and `to` (default today; at most 31 days; local `America/Denver`) | `getFoodLog`, `getFoodLogTotals`, `getFoods`, `getRecipes` (names) | Entries by meal, then the totals |
| `forage_log_food` (write) | `food_id` or `recipe_id` (exactly one), `qty`, `unit` (a serving name or `g`; recipes `serving`), `slot`, `date` (default today), `dry_run` (default true) | `logFood` | With `dry_run` true: the entry as it would be stored. False: the stored entry and its `id` |
| `forage_update_log` (write) | `id`, any of `qty`, `unit`, `slot`; `dry_run` (default true) | `updateLogEntry` | Before and after |
| `forage_delete_log` (write) | `id` | `deleteLogEntry` | Confirmation |

**`forage_food_log`**
```
Thu 2026-11-05 — 1,240 kcal so far (low: 1 entry has no nutrition). Protein 62 g · Carbs 140 g · Fat 48 g.
Breakfast
  lg_1a2b3c4d  Greek yogurt · 1 cup (245 g) · 150 kcal
  lg_9e8f7a6b  KIND bar · 2 bar (80 g) · 380 kcal
Lunch
  lg_5d6e7f8a  Beef Stew · 1 serving · 412 kcal (partial)
Dinner
  (nothing)
```
A range lists each day this way, newest last, with the day line first. A day with nothing logged reads `Mon 2026-11-02 —
nothing logged.` An entry without nutrition reads `· no nutrition`. "so far" appears only for today. The totals come
from `getFoodLogTotals`; the tool adds nothing up.

**`forage_log_food`, dry run** (default; no reminder, not counted as a write):
```
Preview — nothing logged.
Dinner · Thu 2026-11-05
Greek yogurt · 1 cup (245 g) · 150 kcal · Protein 6 g · Carbs 9 g · Fat 0.4 g

Call again with dry_run: false to log it.
```
**Saved** (reminder follows):
```
Logged Greek yogurt to Dinner on Thu 2026-11-05: 150 kcal (id lg_1a2b3c4d).
Undo with forage_undo, call 7c1e…
```
**Refused** (no reminder): `Nothing logged. <the API's fixed text>`, for example `Nothing logged. Food fd_ab12cd34 does
not exist.` A food with no nutrition is logged, not refused, and the preview says `No nutrition on this food, so it will
count as unknown.` The tool description tells agents to check `forage_food_log` before retrying a write whose answer was
lost: the app's retry safety (a fixed `id`) is not offered to tools.

`forage_update_log` previews as `Before: … / After: …`; `forage_delete_log` answers `Deleted lg_1a2b3c4d (Greek yogurt,
Dinner, Thu 2026-11-05).` with the reminder and undo line. Undo restores the row as it was (its stored numbers
included), by #713's change log.

## Measured

Nothing is measurable yet: there is no running Forage app. The 44px and 375px criteria are checked in `/test` with
`getBoundingClientRect()`, per `stack-web`.

## New tokens

None.
