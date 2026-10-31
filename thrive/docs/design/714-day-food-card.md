# 714 — Day: Food card from Forage's daily totals

Part of #700. Depends on #712 (the totals read, specified in `forage/docs/design/712-food-log.md` §Daily totals) and #703 (the API's auth). One card on Thrive's Day screen, in the pattern of #520's drinks cards and #489/#490's cards, drawing only what Forage's `getFoodLogTotals` returns. Thrive never edits food, never adds up nutrition, and never reads Forage's Sheet. Mock: the prototype's "Thrive Day" view (`thriveScreen`); this note differs from it where it says so.

## How Thrive is allowed to call Forage

**Decided: Forage's API gets a third caller kind, scoped to one action.** Thrive's app signs in with its own Google OAuth client, and Forage's token caller (#703) checks `FORAGE_GOOGLE_CLIENT_ID`, so Thrive's token is refused today. The alternatives were worse: reading Forage's Sheet from Thrive means a second copy of the row mapping and of the partial rule; a shared key cannot live in a browser.

- A new script property on the Forage API, `TOKEN_THRIVE_CLIENT_ID`: Thrive's OAuth client ID (the value of Thrive's `VITE_GOOGLE_CLIENT_ID`; an identifier, not a secret).
- `auth.js` accepts an `access_token` whose client ID equals `TOKEN_THRIVE_CLIENT_ID` **and** whose email is `TOKEN_ALLOWED_EMAIL`, and lets that caller run `getFoodLogTotals` only. Every other action is refused for it, with the same refusal an unlisted action gets today. A token from `FORAGE_GOOGLE_CLIENT_ID` is unchanged.
- The property unset means no Thrive caller exists: every Thrive call is refused. A test names the one allowed action and fails if a second appears on that list.
- Thrive's call is a token call through `callAction` (`thrive/frontend/src/api/thrive-api.ts`) with its `url` option set to Forage's API URL, so the existing form-encoded POST, timeout and error `kind`s are reused. The token is never logged or sent anywhere else.
- Thrive's build gets `VITE_FORAGE_API_URL`, passed by `thrive-pages.yml` from the repository variable `FORAGE_API_URL` (the same one `forage-pages.yml` uses, #705).

## Layout

One `Panel` (`components/day/panel.tsx`), slot `food`, mounted by `slots.ts` between `sleep` and `drinks`: the two intake cards sit together. It never mounts on a future day (`PAST_AND_TODAY_ONLY`), like drinks. It is a read-only card: no buttons except Try again and the link below.

```
(fork) Food · from Forage              Open Forage ›
1,240   kcal so far
Protein 62 g    Carbs 140 g    Fat 48 g
4 items
Last 7 days, kcal
 ▂ ▆ ▇ ·  ▅ ▆ █       (· is a gap)
 T F S S  M T W
```

- Title **Food · from Forage**; `meta` is the item count: "4 items" ("1 item"). Icon: a drawn fork-and-knife in the house style (#405), kept in the card's file as drinks keeps its icons, in `--metric-food`.
- Figure: calories at `--figure-lg` with tabular figures, "kcal so far" on today and "kcal" on a past day in `--text-sm` `--color-text-secondary`. Whole kcal, thousands separator ("1,240"). The totals are Forage's to 0.1, shown rounded to whole numbers, as Forage's Eaten tab does, so the two read the same number.
- Macros: three figures in one row, "Protein 62 g", "Carbs 140 g", "Fat 48 g", whole grams, wrapping at 375 px. **No bars and no goal:** the prototype's macro bars were scaled to an invented 200 g, and goals are out of scope for the epic. A bar needs a scale nobody has chosen.
- Week strip: seven bars for the viewed date and the six days before it, oldest left, the viewed day last and marked. Height = that day's kcal ÷ the highest of the seven. A day absent from Forage's reply is a **gap**: a short dashed baseline mark and no bar, never a zero-height bar. Weekday initials under each bar; the viewed day's is in `--color-text-primary`. Caption above in `--text-xs` `--color-text-muted`: "Last 7 days, kcal. A day with nothing logged is a gap." A day whose figures are `partial` has a hatched fill (a pattern, not just a tint). Bars are drawn in `--metric-food`.
- A link "Open Forage" in `--text-sm`, `--color-primary`, in the title row: `https://luketmoss.github.io/keel/forage/#/eaten`, opened in the same tab (`rel="noopener"`). It is not a whole-card link: the other Day cards open Trends, and this one leaves the app.

### Not from the prototype

The prototype's line "Dinner is planned: … It counts once you log it in Forage." is **not built here.** Whether dinner is planned and unlogged needs Forage's plan and the log together, and #712 owns that rule (a planned row is hidden once the log has the same recipe, date and slot). It would need Thrive to call `getPlan` too and repeat that rule; Thrive's caller is held to one action. If it is wanted, it is a later issue that adds a derived field to the totals read.

## States

| Case | Shows |
|---|---|
| `VITE_FORAGE_API_URL` unset (not demo) | The card is not mounted. The Day screen is as it was |
| Loading | A skeleton card (`--color-surface-raised`, static under reduced motion) |
| Logged | The layout above |
| Nothing logged on the day shown | `—` in place of the calories, the macros as "Protein —", "Carbs —", "Fat —", and "Nothing logged today." (past day: "Nothing logged on Monday."). The week strip still shows the other days. Never `0` |
| Day has entries but every figure is `null` | `—` for calories and macros, and "None of today's items has nutrition yet." (past day: "None of Monday's items has nutrition yet.") |
| Partial (`partial: true`) | The figures, a `Low` chip in `--color-warning` on `--color-warning-light`, and the line "Some items have no nutrition, so this total is low." (the chip and the line are text; colour is not the signal) |
| One macro `null` while calories are present | That one shows "—" |
| Week reply has gaps | Gap marks, as above |
| Failed (any outcome except ok) | `PanelStatus` error: "Couldn't load your food." with **Try again**. The rest of the Day screen is untouched |
| Forage down, slow or refusing | The same failed state, after `THRIVE_API_TIMEOUT_MS` at most. No other panel waits for it |
| Demo mode | Synthetic totals for the day and the week with one gap and one partial day; no call made |
| Offline | Failed state |

The read is one call, `getFoodLogTotals({from: date − 6 days, to: date})`, made on show, on the page becoming visible (throttled like health, `onPageVisible`) and by Try again. Moving between days re-reads for the new window (the card remounts per date, as every slot does); a window already read this session is shown at once and refreshed behind it. The card owns its own status: a failed food read never marks another panel failed, and a failed health read never marks this one.

## Edge cases

- **Midnight rollover:** "so far" follows `today` from the Day screen's own watcher; no second clock.
- **First entry just logged in Forage:** it appears on the next visible/refresh; there is no push.
- **Forage's day vs Thrive's:** both are `America/Denver` calendar dates, so the dates match without conversion.
- **A day with unknown entries only:** `entries` > 0 and every figure `null`: counted in the item count, drawn as a gap in the week strip, with the "None of … has nutrition yet" line when it is the day shown.
- **Highest of seven is absent (all gaps):** no bars, seven gap marks.
- **Very large day:** the figure wraps rather than truncating; bars scale to the window's highest day.
- **Token expired:** the same as any Thrive API call; the failure is the failed state, not a sign-out.

## Copy

"Food · from Forage", "kcal so far", "kcal", "Protein", "Carbs", "Fat", "g", "1 item", "N items", "Open Forage", "Last 7 days, kcal. A day with nothing logged is a gap.", "Nothing logged today.", "Nothing logged on Monday.", "None of today's items has nutrition yet.", "Low", "Some items have no nutrition, so this total is low.", "Couldn't load your food.", "Try again".

## Accessibility

- The card is a `section` with an `h2`, as every Day card (#485). Figures are announced in a polite live region only on a refresh that changes them.
- The week strip is a list of seven items, each with a name: "Monday, 1,240 kcal", "Tuesday, nothing logged", "Wednesday, 980 kcal, low". The bars are `aria-hidden`; the names carry the data.
- Gaps and hatching are visible shapes, not colour. The `Low` chip has text.
- "Open Forage" is at least the app's tap-target minimum.

## New tokens

In `global.css`, light and dark, chosen against `--color-surface` for 4.5:1 text contrast and added to the test that covers the metric colours (`metric-contrast.test.ts`):

- `--metric-food` — the food metric colour (icon, title, week bars). Not green (that is Forage's accent, and Thrive is cobalt); a warm hue distinct from `--metric-water`, `--metric-alcohol` and `--metric-sleep`.

The week strip reuses the drinks week strip's seven-day window (`drink-week.ts`) and its `.drink-week` layout where they fit. Unlike drinks (#521, a day with none is a zero-height bar), a food day with nothing is a gap mark; no second token is added.

## Not here

Editing, logging or deleting food. Calorie or macro goals and bars against them. A trend page for food. A planned-dinner note. A link per day. The other drinks (Sip's).
