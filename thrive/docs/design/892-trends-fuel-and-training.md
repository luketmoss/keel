# 892 — Trends Food: a fuel and training card

Part of #889, optional by the owner's choice (the weekly brief is the alternative home). One card at the end of Trends' Food group (#890) with the average kcal eaten on ride days, lift days and rest days over the range, and how many days each covers. Only Thrive can draw it: it needs activities next to Forage's daily totals, and Forage never reads Thrive. Mock: the epic's prototype (`forage/docs/design/889-trends-prototype.html`, "Thrive: Food group", its "Fuel and training" card); this note differs from it where it says so.

It shows three figures and their counts. It compares nothing and concludes nothing: graded "does X change Y" conclusions stay with the nightly brief and the wiki's tests (#830).

Standing documents: `ui/docs/design/keel-wide-rules.md` (blank is not zero, colour never alone, contrast) and `ui/docs/design/suite-language.md` ("Cards are for sources", "a missing value shows as —"). Builds on `890-trends-food-group.md` (the food rows, the group, the gap rule) and `891-custom-shade-ride-days.md` (what a ride day is, and the helper).

## Where it sits

The **last element of the Food group**, after the Fat card, in both the Chart and Table views (in Table view, below the table). Not in Custom and not in the picker: it is a summary of three figures, not a metric with a daily series, and it has no x axis, which is why it can fail on its own (below). It is a card in the trend cards' own style: `section` with an `h2`, the same surface, radius and padding as `.trend-card`.

```
Fuel and training
Average kcal on days with each kind of training, last 3 months.

Ride days    ████████████████   2,310 kcal   12 days
Lift days    █████████████      2,040 kcal    9 days
Rest days    ████████████       1,930 kcal    8 days

3 low days left out.
4 days with a run, hike, walk or stretch are in no row.
A day with a ride and a lift is in both.
```

Three rows (a list, hairline between, never nested cards): the label, a bar, the figure with its unit, the count. The bar is `--metric-food`, from zero, on **one scale for all three rows: the largest average is the full bar.** No row is highlighted, ranked or annotated as larger or smaller. The prototype's single line of counts under the bars ("12 ride · 9 lift · 8 rest days logged") becomes a count on each row, where it cannot be read against the wrong bar; the prototype's "Optional" chip is a note to the owner and is not built.

## What the three kinds are

From `DailySummary` (derived, one row per local day, `activity_types` sorted labels `type` or `type:sub_type`, `activity_count`), which Trends already loads and never re-sums from `Workouts` (#245):

| Kind | A date is one when |
|---|---|
| **Ride day** | its row's `activity_types` has a label `bike` or starting `bike:` (road, mountain, indoor, Spin: all). The same rule as #891's shade |
| **Lift day** | its row's `activity_types` has the label `weight` |
| **Rest day** | its row exists and `activity_count` is 0 or blank |

- **Not exclusive.** A day with a ride and a lift is in both Ride days and Lift days: each row answers "what do I eat on days like that", and the card says so ("A day with a ride and a lift is in both."). The prototype's rest rule (no ride and no lift) is **not** used: it would call a day with a 10-mile run a rest day.
- **Other days are in no row.** A date whose only activities are runs, hikes, walks or stretches is not a ride, a lift or a rest. The card says how many such days in range it left out, instead of dropping them silently.
- **No row, no kind.** A date with no `DailySummary` row is unknown, not rest. It is in no row and is not counted anywhere.
- **Planned workouts are not activities:** `DailySummary` leaves them out, so a planned ride does not make a ride day.
- **One helper.** `ride-days.ts` (from #891; created here with `rideDays` if this is built first) gains `liftDays` and `restDays`, over the same rows, pure and tested alone. #891 and this card cannot disagree about a ride.

## What a counted day is

A date counts toward a row's average and count only when all of these hold:

- Forage reported it, its `kcal` has a value, and it is **not low (`partial`)**.
- It is in the Range control's range (`from`..`to` of the group's cards, so All begins where the cards do).
- It is not today (still being logged, as #890).

**Decided: low days are left out here, though the four food cards include them.** On a chart a low day is drawn hatched and the reader sees it; in an average of three numbers meant to be compared, a day known to be short on nutrition would make a row look lower than the eating was. So leaving it out is the lesser distortion, and the card says how many it left out ("3 low days left out.", only when above 0). The count on each row is therefore days *counted*, not days logged.

**A gap is never 0.** A date with nothing logged, or with `kcal` null, is not counted: it does not enter the sum and does not enter the count, so the average is over days with food only. A row with no counted date shows `—`, no bar and "no days", never `0 kcal`.

The average is the mean of the counted days' `kcal` in Forage's figures, shown as whole kcal with a thousands separator (`formatWhole`), like Calories on the cards. Thrive adds nothing else up.

## States

| Case | Shows |
|---|---|
| Build without `VITE_FORAGE_API_URL`, not demo | No Food group, so no card |
| Loading (Forage totals or `DailySummary` not yet loaded) | The card with "Loading…" (`role="status"`) in place of the rows |
| Loaded | The rows and the notes |
| A row with no counted date | `—`, no bar, "no days" (its label and the rest of the card unchanged) |
| Nothing counted in any row | Three rows of "—"; the notes still say what was left out |
| Food read failed | The Food group's own error state (#890) replaces the whole group, this card with it |
| Food loaded, `DailySummary` failed | The four food cards draw as normal. This card shows **"Couldn't load your activity data."** with **Try again**, which re-reads the health tabs (`loadHealth`). Nothing else on the screen changes |
| Food loaded, `DailySummary` has no rows in range | Three rows of "—" |
| Range changed | Recomputed from the rows held, no request |
| Average control, selected day | No effect |
| Demo mode | Built-in food history and demo activities (ride, lift and rest days all present in range); no call |

**Decided: this card fails alone** when `DailySummary` fails, unlike the food cards (#890: a failed source stops the group). Those cards share one x axis, so some drawing before others would move every chart; this card has no axis and shares nothing with them, so one source failing is its own news. The cost is a second kind of error text in the group, which is why it names what failed.

## Reading the data

No new request. It reads the food rows the Food group already holds (#890's one read) and the `DailySummary` rows `loadHealth` already loads on entry. It is computed once per (range, today, food rows, `DailySummary` rows), keyed by row references like the series are (#270), so an average change or a selected day recomputes nothing.

## Copy

"Fuel and training", "Average kcal on days with each kind of training, last 3 months." (the range's own phrase from `RANGE_PHRASE`: "last 7 days", "last 30 days", "last year", "all time"), "Ride days", "Lift days", "Rest days", "kcal", "12 days", "1 day", "no days", "—", "N low days left out." ("1 low day left out."), "N days with a run, hike, walk or stretch are in no row." ("1 day with a run, hike, walk or stretch is in no row."), "A day with a ride and a lift is in both.", "Loading…", "Couldn't load your activity data.", "Try again".

## Accessibility

- A `section` with an `h2` ("Fuel and training"), `aria-labelledby`, as every trend card. The subtitle is its description.
- The rows are a list. Each item reads as one sentence: "Ride days, 2,310 kcal on average, 12 days", or "Rest days, no days". The bars are `aria-hidden`; the figure and the count carry the data in text.
- A row with no days is `—` plus "no days", not an empty bar. Colour is never the cue: the bars are one hue and the labels are words.
- No controls except Try again in its error state, which is a standard secondary button (all six states, #404, at least `--touch-target`).
- Under `prefers-reduced-motion` nothing moves: the bars are drawn at their widths, with no grow-in.

## Measured

Not measured here: no criterion asserts a size. The bar fill is `--metric-food` (5.50:1 on `--color-surface` in light, 7.14:1 in dark, from `global.css`, against 3:1 for a fill), and the card's rows must fit 320 px with the label, figure and count, which is judged by eye in demo mode (the longest row, "Ride days ... 2,310 kcal 12 days", is checked at 320 px by `/develop`, where the bar is the part that shrinks).

## New tokens

None. `--metric-food`, `.trend-card`'s surface and spacing, `--text-sm` and `--text-xs`. The row layout (label, bar, figure, count) is the card's own CSS.

## Not here

Any comparison or conclusion; macros per kind; a trend of the averages over time; planned workouts; a lift or rest shade (#891 shades ride days); the weekly brief; reading `Workouts`; changes to `DailySummary`, the Apps Script or the four food cards.
