# 890 — Trends: a Food group, and Food in Custom

Part of #889. Adds four metrics to Trends, Calories, Protein, Carbs and Fat, as a group of their own and as a Custom section, using the registry, the icon toolbar (#503) and the cards of #521's Intake group. No new control. Data: Forage's `getFoodLogTotals`, the call the Day screen's Food card makes (#714), read once for the whole log. Mock: the epic's prototype (`forage/docs/design/889-trends-prototype.html`, scenes "Thrive: Food group" and "Thrive: side by side"); numbers in it are example data and this note differs from it where it says so.

Standing documents this answers to: `ui/docs/design/keel-wide-rules.md` ("Blank is not zero", contrast, touch targets, interaction states) and `ui/docs/design/suite-language.md` ("Blank days break the line", "a total that is still growing says so far"). Notes it builds on: `714-day-food-card.md` (the read, `--metric-food`, hatching, the link), `521-trends-drinks.md` (bars, the group's place), `503-trends-icon-toolbar.md`, `504-day-metric-trend.md`.

## The rule that decides everything: a gap is not a zero

Intake fills every day from the first drink to today with `0` (`intakePoints`), because "logged nothing" is a real value for a drink. For food it is not: a day nobody logged is unknown, and the chart must say so. So the food metrics' `points()` return **only days Forage reported with a figure**, and every consumer already treats an absent day as a gap (no bar, "—", not in the average or the day count). No food code path writes or draws a 0 for a missing day. A reply that does contain a figure of `0` (someone logged water) draws a zero-height bar like any real zero.

| Forage's day | Calories card | Protein card (say) |
|---|---|---|
| Absent from the reply | gap | gap |
| Present, `kcal` and `protein_g` have values | bar | bar |
| Present, `kcal` null (every entry lacks nutrition), `protein_g` null | gap | gap |
| Present, `kcal` has a value, `protein_g` null | bar | gap (that metric only) |
| Present, `partial: true` | hatched bar, "low" | hatched bar, "low" |
| Dated after today | not drawn | not drawn |

## Where it sits

- **Group:** `Food`, after Intake and before Custom in `TREND_GROUPS`. Cards in order **Calories, Protein, Carbs, Fat**.
- **Custom picker:** a **Food** section after Intake with the same four, in the same order. `CUSTOM_SECTIONS` is the canonical order a Custom set renders in, so a set holding Protein, Training Load, HRV and Weight draws HRV, Training Load, Weight, Protein, not the prototype's order. The cap of four, the stored ids and `normaliseCustom` are unchanged: a stored set with no food ids is exactly what it was.
- **Ids:** `calories`, `protein`, `carbs`, `fat`. (`--metric-calories` is the Day glance's calories *burned*; the food metrics do not use it.)
- **Titles:** "Calories", "Protein", "Carbs", "Fat", with units `kcal`, `g`, `g`, `g`. Each carries the card note **"Eaten, from Forage"** (the registry's `note`, announced with the summary). It separates eaten calories from the burned calories on Day, and it matters most in Custom, where the card sits among metrics from other sources.

## The card

Same card as every Trends metric (`TrendCard`): title and unit, the note, the summary and readout cell, the plot. Differences:

- **Bars**, one per logged day (`bars: true`, as Intake), `zeroBased`, in **`--metric-food`** for all four. The bar fill is `--metric-<id>` today, so a food metric names its token explicitly instead (a `token` field on the metric, default its id); `--metric-calories` is never picked up by accident.
- **Hatched bars for low days.** A day with `partial: true` fills with a hatch built from `--metric-food`, the same stripes and 25% tint as the Day card's week strip (`.food-week`, #714), as an SVG `<pattern>` in the plot. A pattern, so it reads without colour. The bar's outline is the solid `--metric-food`.
- **Average line.** The Average control (Off, 7d, 14d, 30d) applies by the existing rule (`rolling`: a day has an average point when it has a value and at least two readings fall in its window). The prototype's "at least 4 of 7 days" is its own and is not copied; one rule across Trends.
- **Summary line:** `Average 2,040 kcal · 25 of 30 days`, `Average 98 g · 25 of 30 days`. The average is the mean of days with a value, low days included (Forage's own energy summary includes them, #913); a day without one is not in either number. No average over a single day (the existing `bars` rule).
- **No reference line.** No goals (#714, epic decision).
- **Number format:** whole numbers with a thousands separator for kcal, whole grams for the macros (`formatWhole`); the axis the same. Forage sends 0.1 precision; Thrive rounds for display, as Forage's own Eaten tab does, so the two apps read the same figure.

### Today

Today is **not plotted** and not in the average (`excludesToday`, as Steps): it is the one day still being logged, and a half-logged day drawn as a bar reads as a dip. The Day card shows today ("kcal so far"). Selecting today's slot reads "—", with the words **"today isn't counted until it's over"**.

### The words for a blank day

The existing readout prints `—`. "Blank is not zero" asks for words saying why, so a food metric adds them through the same slot a held value uses for its note (`note`/`tableNote` in `dayCells`):

| Cell | Words |
|---|---|
| Readout and keyboard announcement, a gap | `— · nothing logged` ("Calories —, nothing logged.") |
| Readout, today | `— · today isn't counted until it's over` |
| Readout, a low day | `1,240 kcal (low)` (the short form, so the line stays one line at 320 px, #303) |
| Table cell, a gap | `—` then `nothing logged` in the cell's muted `.trend-partial` span |
| Table cell, a low day | `1,240` then `low: some items have no nutrition` in the same span |
| Announcement, a low day | "Calories 1,240 kcal low: some items have no nutrition." |

In Custom the table already lists several metrics per row; the words repeat per gap cell. That is wordy and deliberate: a bare dash is how a gap gets mistaken for a zero or an error.

### Caption

The caption under the group tabs is built from the group's metrics. For a group that is all food, and for any group that has a food card:

> Bars are each day · line is the 7-day average. A day with nothing logged is a gap.

with the band clause as today if a card draws one. It replaces "Blank days stay blank." when a food card is present. When the range holds a low day, a second sentence: **"Hatched bars are low days: some items have no nutrition."**

## Reading the data

One call, the whole log: `getFoodLogTotals` with no `from` and no `to` (Forage's `dateRange` takes both as optional), through the same `callAction` with Forage's `url`. **Decided: the whole log, once, rather than a window per range.** Forage reads its whole FoodLog sheet for any range and filters afterwards, so a narrower window saves no work there; and one read means every control (range, average, view, All) redraws from rows held, which is the contract every other Trends source keeps (#503: "no sheet read"). The cost is a reply that grows with the log (about one object per logged day; a year is about 365). If that is ever too slow it is a `from` of the oldest range plus the average's lead-in and a re-read on All, and a later issue's call.

- **When:** on entering Trends on a group that shows food (the Food group, or a Custom set holding a food metric), as Intake reads drinks (#521): on every entry, not once, so a day logged in Forage is there on the next visit. Rows already held stay up while it reads, so a revisit does not flash "Loading…".
- **State:** a `foodHistory` source beside `drinkHistory` (`status`, `rows`), in `state/food.ts` with the Day card's windows, which it does not touch. `TrendSource` gains `'food'`, so the screen waits on, and reports errors from, exactly the sources the group reads. The reply is held as Forage sent it, parsed by `parseDay`; nothing is added up.
- **Rows used:** `date`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `partial`. The seven label values are ignored here.
- **Not stored:** nothing about food goes to `localStorage` except the existing Custom ids.
- **Forage unreachable:** the call's own timeout (`THRIVE_API_TIMEOUT_MS`) bounds "Loading…".

### States

| Case | Shows |
|---|---|
| Build without `VITE_FORAGE_API_URL`, not demo | No Food tab, no Food section in the picker, no request. A stored `food` group choice falls back to the first group and stored food ids drop from the Custom set, as an unknown id does today (`foodEnabled()` is #714's test) |
| Loading, first read | The group's `Loading…` (`role="status"`) |
| Loading, rows already held | The charts, as they were, with no flash |
| Loaded, nothing in the log | Each food card: **"Nothing logged in Forage yet."** |
| Loaded, nothing in this range | Each food card: "No calories in this range." (the label, lower-cased) |
| Loaded | The cards above |
| Failed, a Food group | `Couldn't load your food.` with **Try again**, in the group's existing error container (`TrendsState`; Try again focuses it and hands focus to the heading when data lands, #290) |
| Failed, a Custom set holding food | The same container. The text is **"Couldn't load your food."** when food is the only source that failed, else the existing "Couldn't load your health data." Try again re-reads whichever failed |
| Demo mode | Built-in history: the last 400 days, with gaps (about one in seven), a low day about every three weeks, and day-to-day variation, all for the macros too. No call |
| Offline | The failed state |

**Decided: a failed food read stops the whole group, as any failed source does today**, rather than drawing a Custom set's other cards beside an error card. Trends builds one shared x domain from every card in the group, and All begins at the earliest day any card has, so drawing some cards first and the rest later would move every chart. (Day's card can fail alone because its cards share nothing, #714.) A person who wants Custom without food removes it in the picker.

## Explore in Forage

The last element of every food card in a **chart** view: a link row after the plot, `Explore in Forage ›`, in `--text-sm`, `--color-primary-text`, same tab, `rel="noopener"`, at least `--touch-target` tall, left-aligned. Under the row, nothing. The Table view has no cards and no link.

| Card | Opens |
|---|---|
| Calories | `https://luketmoss.github.io/keel/forage/#/eaten/trends?metric=kcal&range=<R>` |
| Protein | `...?metric=protein&range=<R>` |
| Carbs | `...?metric=carbs&range=<R>` |
| Fat | `...?metric=fat&range=<R>` |

`<R>` is the Range control's current key, `1W`, `1M`, `3M`, `6M`, `1Y` or `All`, which are also #913's. `metric` names a chart and implies its tab, as `forage/docs/design/913-trends-screen.md` §The route specifies: `kcal` is Energy, and #914 adds `protein`, `carbs` and `fat` (Macros). A metric whose tab is not built yet opens Energy at the range, #913's stated fallback, so until #914 ships the three macro links land on Energy. No `tab` is sent. The base is `FORAGE_EATEN_URL` with `/trends` after `#/eaten` (`api/forage-food.ts`).

- **Accessible name:** "Explore Calories in Forage" (the visible text with the card's name added, so the four links differ).
- **If #913 has not shipped, there is no link.** `/develop` checks that #913 is closed. If it is not, the cards end at the plot, nothing else here changes, the PR says the link is deferred, and a one-line follow-up issue adds it. It is a constant with the URL, not a feature flag read at runtime.
- **States (#404):** the link takes the Day card's "Open Forage" treatment, `.food-link`, which is already in the Quiet buttons row of `404-interaction-states.md` (`interaction-states.test.ts` enforces that table, so a second class would have to be added to it): rest, hover under `@media (hover: hover)`, pressed, the global focus ring. No selected or disabled state. The class is the existing one reused or its rule shared, not a second copy.

## Accessibility

- The chart's name and description are the existing ones ("Calories, last 3 months", summary id), so the screen reader gets the same text alternative as every card, and the Table view is the long form.
- Gaps and hatching are shapes and words. Low is spoken ("low: some items have no nutrition") and printed ("(low)"); colour is never the cue.
- Moving by keyboard announces the day in group order, one clause per card, as every group does: "Fri, Nov 6. Calories 2,100 kcal, 7-day avg 2,040 kcal. Protein —, nothing logged." A low day announces "Calories 1,240 kcal low: some items have no nutrition."
- Bars are `aria-hidden` as Intake's are; the table and summary carry the data.
- The link is a real link, in the tab order after its card's chart region, and is announced with its destination.

## Copy

"Food", "Calories", "Protein", "Carbs", "Fat", "kcal", "g", "Eaten, from Forage", "Nothing logged in Forage yet.", "No calories in this range." (and "No protein in this range." and so on), "nothing logged", "today isn't counted until it's over", "(low)", "low: some items have no nutrition", "Bars are each day · line is the 7-day average. A day with nothing logged is a gap.", "Hatched bars are low days: some items have no nutrition.", "Couldn't load your food.", "Try again", "Loading…", "Explore in Forage ›", "Explore Calories in Forage".

## Measured

Not measured here: no criterion asserts a size. The link row's height is the existing token (`--touch-target`, 44px, measured in #503 for the toolbar controls), and the bar fill's contrast is the existing `--metric-food`: 5.50:1 on `--color-surface` in light and 7.14:1 in dark (WCAG relative luminance, computed from `global.css`), against 3:1 for a fill. The Food tab is the eighth of nine tabs in a row that scrolls sideways by design (#503), so no width is asserted.

## New tokens

None. `--metric-food` (#714) is the colour, `--touch-target` the target, `--color-primary-text` the link. The registry gains one optional field, `token`, naming a bar colour other than `--metric-<id>`.

## Not here

Other nutrients, per-meal and per-food views, goals, a link from the Day card into this group, the fuel and training card (#892), ride-day shading (#891), anything in Forage. Drinks keep zero-filled days.
