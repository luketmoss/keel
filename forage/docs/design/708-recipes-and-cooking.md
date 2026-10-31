# 708 — Forage recipes and log-mode cooking

Specifies [#708](https://github.com/luketmoss/keel/issues/708). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell, header and account button from
[`704-app-shell.md`](704-app-shell.md); bottom sheets, the status line and the Library's Recipes list from
[`706-recipe-import.md`](706-recipe-import.md); the recipe sheet's nutrition card, banner and ingredients table from
[`707-food-library.md`](707-food-library.md). This note reuses them and does not restate them. The layout reference is
the approved prototype (https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1): `libScreen`, the recipe sheet, `cookChoice`
and the log-mode branch of `cookScreen`. The choice sheet follows Thrive's Lift Mode / Logbook sheet
(`thrive/frontend/src/components/workout/choice-sheet.tsx`). Walkthrough mode is #711's and is not specified here. There
are no standing documents in `forage/docs/design/` beyond #702 and #704. Every length is a token; nothing here
introduces one.

## Library → Recipes

- **Search field** "Search recipes" under the Recipes | Foods switch, shown once the library holds 8 or more
  recipes (as #707 does for foods). Case-insensitive substring over the recipe name, every ingredient line's text, and
  the name of the food matched to a line. Filtering is done by the API (`getRecipes` `q`), debounced 250 ms.
- **Sort chips** under it, shown with 2 or more recipes: **Newest** (default), **Name**, **Rating**, **Last cooked**.
  A single-select chip group (`aria-pressed`), remembered for the session. Newest keeps #706's order. Rating is highest
  first, unrated last. Last cooked is most recent first, never-cooked last. Name is A to Z. Ties fall back to Newest.
- **Row** (one card, 44px or more, a button that opens the recipe sheet; the "…" delete button of #706 stays and does
  not open it). Line one: the name. Line two: stars (`★★★★☆`, `aria-label="4 of 5 stars"`, or "Not rated" in
  `--color-text-muted`), then ` · cooked Oct 28` (year added when not this year) or ` · never cooked`, then
  ` · 520 kcal` (`partial` replacing the figure when partial; nothing when no food has nutrition). When the match is on
  an ingredient and not the name: a third line in `--color-text-muted`, `has 2 lb chicken thighs` (the first matching
  line, verbatim). When the latest cook is unrated: a **Rate it** chip at the right, `--color-primary` on
  `--color-primary-light`.

| State | Shows |
|---|---|
| Loaded | The rows |
| Searching | The rows stay; line two of the field's helper is "Searching…" in `role="status"` |
| No match | "No recipe matches "<text>"." and a text button **Clear search** |
| Failed | `role="status"` in `--color-danger-text`: "Couldn't load your recipes." and **Try again** |
| Empty | #704's/#706's, unchanged |

Delete recipe's confirmation (#706) reads "Delete <name>? Its ingredients, steps and cook history go with it." The
"used by planned or logged meals" refusal is unchanged.

## Recipe sheet

#707's sheet, extended. Top to bottom:

1. **Title block:** the site (`--text-xs`, uppercase label), the recipe name, then
   `★★★★☆ · serves 6 · 10 steps · last cooked Oct 28` (stars become "Not rated"; "never cooked" replaces the last
   clause).
2. **"How was it?" card,** only while the latest cook has no rating and was not dismissed on this device. Text: "How was
   it? You cooked this on Oct 31." Five star buttons (44px each, `role="radiogroup"`, each `aria-label` "1 star" to "5
   stars"). A star saves at once (`upsertCook` with `rating`); the card then shows "Rated 4 stars" and a one-line field
   "Add a note (optional)" with **Save**. A text button **Not now** hides the card for that cook (`localStorage` key
   `forage_rate_skip`, a list of cook ids; the row's chip stays, so it can be rated later).
3. **Nutrition card and banner** (#707).
4. **Cook** (primary, full width). Under it one line in `--color-text-secondary`: "A walkthrough is ready." when the
   recipe has one, else "No walkthrough yet. Cook it in log mode: the source's steps as a checklist."
5. **Ingredients, as the source wrote them** (#707's table, unchanged).
6. **Steps (10)** — one row, collapsed, `aria-expanded`. Expanded: a card per section (the heading as its label; none
   for a recipe without sections), each step "1. Brown the beef" (its `name` bold when it has one) over its text. Read-only.
   A recipe without steps shows no row.
7. **History** — "Cooked 3 times" (`--text-lg`), then one row per cook, newest first: the date, five stars as buttons
   (44px) with the cook's rating filled, the note under in `--color-text-secondary`. Tapping a star rates or re-rates
   that cook; tapping the filled last star clears it. A cook row's "…" has **Remove this cook** (asks "Remove the cook
   from Oct 28?", **Remove** danger / **Cancel**). No cooks: "Not cooked yet." and nothing else.

Rating or removing refreshes the sheet and the Library row behind it ("Updating…" in place of the stars while it runs).

## Cook choice sheet

Opens from **Cook**, title "Cook <name>". Two radio cards (`role="radiogroup"`, `role="radio"`, `aria-checked`), as
Thrive's `lift-choice-cards`:

| Card | Title | Line |
|---|---|---|
| Walkthrough | Walkthrough | "Prep first, then step by step with timers". Disabled, with "Not built yet for this recipe", when the recipe has none |
| Log mode | Log mode | "The recipe as written, checked off as you go" |

Preselected: the last choice (`localStorage` key `forage_cook_mode`, written on Continue) when it is still available,
else Walkthrough if the recipe has one, else Log mode. Buttons **Continue** and **Cancel**. Escape or the scrim cancels.
Continue goes to `#/cook/<recipe id>` for log mode; Walkthrough goes to #711's screen. Storage failing just means the
default is used every time.

## Log mode

A full-screen route `#/cook/<recipe id>` (outside the tab bar; the tab bar is not drawn). `?plan=<plan id>` is accepted
and kept for #709, and is stored as the cook's `plan_id`. An unknown recipe id: back to Library with a status line
"That recipe isn't in your library."

**Header** (sticky, `--color-surface`, bottom border `--color-border-light`): ✕ (44px, `aria-label` "Leave"), the
recipe name (one line, ellipsis), the elapsed clock (`--text-sm`, tabular figures, `m:ss`, `h:mm:ss` from one hour).
Under it, when there are timers, a horizontally scrolling row of timer chips.

**Body**, top to bottom, three cards:

1. **Ingredients** — label "Ingredients", `as written · serves 6` at the right. One row per line, in recipe order, with
   the section's heading between groups (a heading row in `--color-text-secondary`, not checkable). Each row is a
   button, 56px or more, `aria-pressed`: a check circle and the verbatim `text`. Optional lines add " (optional)".
   Checked: circle filled `--color-primary`, text `--color-text-muted` struck through.
2. **Steps** — label "Steps", `from example.com` at the right. Same row, with `1. Brown the beef` (bold) over the text
   when the step has a title, else `1.` and the text. Section headings between groups. A recipe with no steps shows
   "This recipe has no steps. Cook from the ingredients." in place of the list.
3. **Timers** — label "Timers"; chips **5 min**, **10 min**, **30 min**, **1 hr** and **Custom**. Custom reveals a number
   field (`inputmode="numeric"`, placeholder "Minutes", 1 to 600) with **Start**. Up to 6 timers at once; a seventh
   shows the status line "Six timers is the most. Remove one first."

**Action bar** (fixed to the bottom, safe-area padded; width as the prototype): one primary **Finish**, 52px.

### Timers

A chip is `Browning` or the duration (`10 min`), the time left (`9:41`, tabular figures) and a ✕ (44px,
`aria-label` "Remove the 10 min timer"). It is a countdown to an end timestamp, so it is right after the tab slept.

- **At zero:** the chip becomes "Done" in `--color-warning` on `--color-warning-light` and stays until removed. The
  device vibrates (`navigator.vibrate([200, 100, 200])`, ignored where missing), and a `role="status"` region says
  "10 min timer is done". The page title becomes "Timer done · Forage" until a timer is removed or the cook ends.
- **A timer that ended while the tab was hidden** shows "Done" on return, with the same announcement.
- **Nothing is moved by a timer:** no item is checked, the step is not advanced, the cook does not finish.
- Rapid taps on a quick timer start one timer each; the second identical timer is a separate chip.

### Persistence and the screen

State lives in `localStorage` under `forage_cook` (recipe id, start time, checked keys, timers with their end times,
`plan_id`). A reload, or returning to the tab, restores the screen exactly. Opening a different recipe's cook while one is
in progress asks first, in a small sheet: "You're already cooking <name>." with **Go to it** (primary) and **Start this
one instead** (replaces the stored cook). Storage unavailable: the cook works for the session and nothing says so.
The screen requests a wake lock while the route is open (`navigator.wakeLock`, best effort, released on leave) so the phone
does not sleep over the stove; it is requested again when the tab becomes visible.

**Leaving.** ✕ asks "Leave this cook?" / "Nothing is recorded." with **Keep cooking** (primary) and **Leave**. Leave clears
the stored cook and returns to the sheet it came from. The browser Back button does the same ask.

## Finishing

**Finish** records the cook at once, with no confirm, so a hurried tap at the stove is not lost:

1. The button reads "Saving…" and is disabled; the clock stops at the moment of the tap.
2. `upsertCook` is called with a new `id`, `recipe_id`, today's date (local, `America/Denver` via the API), a blank
   rating, and `plan_id` when there is one. Timers are cleared and the stored cook is cleared on success.
3. The done screen replaces the body (header stays, clock stopped):
   - "Done cooking" (`--text-2xl`);
   - a card with the elapsed time (`--text-xl`, tabular figures) and `Log mode · serves 6`, then "Cook recorded for Oct 31.";
   - "How was it? Forage asks when you open this recipe next, once you've eaten." in `--color-text-secondary`;
   - a stepper "Servings eaten" (1 to 12, default 1) and a slot row of four chips (Breakfast, Lunch, Dinner, Snacks),
     preselected from the plan entry's slot when there is one, else by the time of day (before 11:00 Breakfast, before
     15:00 Lunch, before 21:00 Dinner, else Snacks);
   - action bar: **Close** (secondary) and **Log 1 serving to Eaten** (primary; the count follows the stepper, "1 serving"
     or "2 servings").
4. **Log to Eaten** calls `logFood` with `recipe_id`, `qty` = the stepper, `unit` = `serving`, today's date and the slot.
   On success the button becomes "Logged 2 servings to Eaten (Dinner)" with a **View** link to `#/eaten`, and the status
   line says the same. A second tap is not possible; changing the stepper after logging does nothing. Failure: "Couldn't
   log it to Eaten." with **Try again**; the cook stays recorded.
5. **Undo this cook** — a text button under the card, available until the screen is closed. It calls `deleteCook`, and the
   screen says "Cook removed." It is not offered after the serving has been logged to Eaten.
6. **Close** returns to the recipe sheet (history refreshed), or to `#/plan` when the cook came from a plan entry.

A failed save of the cook shows `role="status"` in `--color-danger-text`: "Couldn't save the cook." and the button
becomes **Try again**; the checklist, timers and clock (still running) are kept. Retrying with the same `id` leaves one row.

## Demo mode

Library shows 5 sample recipes: Beef Stew (with its steps, 4 stars, cooked twice), Turkey Taco Lettuce Wraps (5 stars),
Sheet-Pan Chicken (unrated, one unrated cook, so it carries "Rate it"), Banana Bread (never cooked) and One-Pot Chili.
Beef Stew has a walkthrough so the choice sheet shows both cards; the Walkthrough card goes to the "Not available in
demo" sheet of #711 until that exists. A demo cook records in memory and nothing is saved. The wake lock and vibration
are real.

## MCP tools (registered by this issue)

Specified here for the PR that adds them to `mcp/src/forage/tools.ts` and `mcp/docs/forage-tools.md`. The read tools go
on the read connector; the three writes on the write connector, each added to `CHANGE_LOGGED_ACTIONS` (#713) and each
ending with the connector's "Forage (write) is on" reminder, naming the recipe.

| Tool | Inputs | Calls | Result |
|---|---|---|---|
| `forage_search_recipes` (read) | `q` (name, ingredient text or food name), `sort` (`newest` default, `name`, `rating`, `last_cooked`), `limit` (default 20) | `getRecipes` | Compact recipes: `id, name, source_site, servings, rating, last_cooked, cook_count, kcal_per_serving, partial, has_walkthrough, matched_line` (the first matching ingredient line, when the match was not the name) |
| `forage_get_recipe` (read) | `id` | `getRecipe`, `getCooks` | The recipe: lines (verbatim, with `line_id`, section, food and weight), steps (section, name, text), per-serving nutrition and `missing`, rating, last cooked, `has_walkthrough`, and the last 5 cooks |
| `forage_cook_history` (read) | `recipe_id` (optional: omitted lists every recipe), `since` (date), `limit` (default 20) | `getCooks` | Cooks newest first: `id, recipe_id, recipe_name, date, rating, note, plan_id` |
| `forage_update_recipe` (write) | `id` plus any of `name`, `servings`, `total_min`, `notes`, `source_url`; `lines` (patches by `line_id`: `text`, `food_id`, `grams`, `optional`); `steps` (the full replacement list `{section?, name?, text}`) | `getRecipe`, `upsertRecipe` | The stored recipe. Lines not named keep their ids and values; a `food_id` that does not exist is refused and named (#703) |
| `forage_log_cook` (write) | `recipe_id`, `date` (default today), `note`, `rating` (1 to 5, optional), `plan_id` (optional), `id` (optional: a retry with the same id leaves one cook) | `upsertCook` | The stored cook. It records the cook only: eating is `logFood` (#712's tool) |
| `forage_rate_cook` (write) | `cook_id` (optional: the recipe's latest cook when `recipe_id` is given instead), `recipe_id`, `rating` (1 to 5, or null to clear), `note` | `getCooks`, `upsertCook` | The stored cook. A recipe with no cooks is refused: "<name> has not been cooked yet. Log a cook first." |

- `forage_rate_cook` is for after the owner says they ate it. The tool description says so; an agent does not rate a
  cook it just logged.
- **Undo** is #713's: a logged cook is undone by deleting it, a rating or update by restoring the prior row.
- `deleteCook` is app-only (the finish screen's Undo and the history row's Remove). It goes in the parity test's
  `NO_TOOL` with the reason "removed in the app; an agent's cook is undone with forage_undo". `getRecipes`, `getRecipe`,
  `getCooks`, `upsertCook` and `upsertRecipe` come off `PENDING_TOOLS`.
- The API changes behind them are in the issue: `getRecipes` `q`/`sort`/`unrated_cook_id`, `getCooks` optional
  `recipe_id` with `recipe_name`, merging `upsertCook`, and `deleteRecipe` removing the recipe's cooks.

## Accessibility and layout

- 375px: no horizontal scroll except the timer row and sort chips, which scroll on purpose; long ingredient lines wrap.
- Every control is at least 44px; checklist rows 56px or more. Sheets trap focus, restore it to the opener and close on
  Escape. The log-mode route moves focus to its heading on entry, and back to **Cook** on leaving.
- Checked state is the circle, the strike-through and `aria-pressed`, not colour alone. Stars carry text labels; the
  "Rate it" chip is text.
- The clock is not announced every second: it is `aria-hidden`, with a visually hidden button "Elapsed time" whose label
  reads the time when focused. Timer completion and status changes are in `role="status"` regions.
- Reduced motion: sheets appear without sliding; nothing animates in log mode.
- Content centres in the shell's column on wide screens, and the action bar matches that width.

## Edge cases

- Recipe with 80 ingredient lines or 30 steps: one scrolling page, no pagination; the action bar clears the last row by
  `--nav-height`.
- A step or line with an empty `text`: its row is skipped.
- Finishing twice from two tabs: the stored cook is cleared by the first; the second tab's Finish creates a second cook,
  which the history shows and Remove can delete.
- A cook left open overnight: it restores as-is; the clock shows `h:mm:ss` and the owner can Leave or Finish. Nothing
  caps the length.
- Rating a cook while offline: the star shows "Couldn't save the rating." and reverts.
- `?plan=` naming a plan entry that does not exist: `upsertCook` refuses it (#703's referential rule) and Finish shows the
  failed state. #709 owns creating those links.
- A search for text that is only whitespace: treated as no search.

## Measured

Nothing is measured: there is no running Forage app yet (it is created by #701 and #704). The 375px, 44px and 56px
criteria are verified at `/test` by `getBoundingClientRect()`, per stack-web. The timer and clock behaviour is verified
with fake timers in Vitest, and the persistence by reloading the preview mid-cook.

## New tokens

None.
