# 588 — Add drinks on a past day, and edit a water amount

Two changes to the Day view's drinks slot. Everything else stays as earlier notes
specified it: storage, optimistic adds, rollback, Edit time and Delete come
from #520 (`520-day-drinks-cards.md`), the tile anatomy from #551
(`551-day-drinks-tiles.md`), and the two-row layout from #560
(`560-day-coffee-tile.md`). The widget is unchanged.

1. **A past day gets the add buttons.** Same buttons, same place, one tap.
2. **A water entry gets "Edit amount"** in its ⋯ menu, on any day.

## Adding on a past day

### Main path

1. Open a past day (the week strip, a swipe, or the header's date).
2. The Water, Coffee and Alcohol tiles each show their add button, exactly
   as on today: `.btn .btn-secondary .btn-sm .drink-add`, "+ 4 oz" / "+ 1",
   at the bottom of the tile. #551 §A tile item 5's "today only" no longer
   applies, and the tile no longer ends after the value on a past day.
3. Tap one. The drink is filed under **the viewed date** at **11:59 PM**
   America/Denver: `time` `23:59:00`, with `logged_at_utc` the UTC instant of
   that local time (06:59Z on an MST date, 05:59Z on an MDT date, next
   calendar day). `source` is `app`, and the amount is the tap's usual amount
   (118 ml, or 1).
4. Optimistically, as on today: the tile's value counts it at once, the log
   row's count goes up, and the viewed day's bar in the 7-day bars grows. In
   the open entry list it sits at the top as "11:59 PM … Saving…", because it
   is the latest entry of that day.
5. Once saved it behaves as any entry does. ⋯ → Edit time is how to give it its
   real time, and the list re-sorts.

**Why 11:59 PM and no prompt:** the owner chose a fixed time over a time field
(refinement, 2026-10-23). The usual case is the drink before bed noticed the
next morning, for which the day's total is what matters. 11:59 PM keeps it
last, which is also where it most likely belongs, and it reads plainly as a
placeholder. Edit time already corrects it.

### Which date a tap uses

The rule is **the viewed date, always**, decided when the tap happens:

- Viewed date = today in Denver → the current instant (`denverClock(now)`),
  unchanged.
- Viewed date before today → 23:59:00 Denver on that date.
- A screen left open across midnight: the date that was today is now a past
  date, so a tap files the drink under it at 11:59 PM rather than at the new
  day's current time. The drink stays on the day you're looking at.

### States

| Case | Shows |
|---|---|
| Loading | as #551: "—", buttons disabled (past days too) |
| Pending add | value already counts it, entry "Saving…" |
| Log failed | as #520: rolled back, `ERROR_LOG` ("Couldn't save that drink. Try again.") under the tile that was tapped |
| Read failed | as #551: one `PanelStatus` error, no tiles, no buttons |
| Future day | not mounted, unchanged |
| Demo mode | in-memory store, same behaviour |

### Edge cases

- **Rapid repeat taps** on a past day are separate drinks, each with its own
  id, as on today. Several entries at 11:59 PM are fine. `newestFirst` breaks
  a tie in `time` by `logged_at_utc` and then by id.
- **Days far back:** any past day the Day view can show takes adds. There is
  no cutoff.
- **The widget** isn't involved. Its `getDrinkTotals` reads today only, so a
  past-day add never changes what the widget shows.
- **Offline:** fails like any API failure (#520). The SPA has no queue.

### Copy

The caption "Drinks can only be added today." is **removed** (it was #520's
past-day caption). Visible labels are unchanged. The accessible names gain the
day on a past day, so a screen reader doesn't imply "now":

| Button | Today | Past day |
|---|---|---|
| Water | "Add 4 ounces of water" | "Add 4 ounces of water to Thu, Oct 22" |
| Coffee | "Add one cup of coffee" | "Add one cup of coffee to Thu, Oct 22" |
| Alcohol | "Add one alcoholic drink" | "Add one alcoholic drink to Thu, Oct 22" |

The day is `metaDate` ("Thu, Oct 22"), the Day header's own meta-line format.

## Edit amount (water)

### Main path

1. Open the log row and tap a water entry's ⋯. The tools show **Edit time ·
   Edit amount · Delete**, in that order, as `.btn .btn-secondary`. Alcohol
   and coffee entries keep Edit time · Delete. Their amount is always 1.
2. Tap "Edit amount". The tools row is replaced by the same inline editor Edit
   time uses: a number field, the unit, then Save (`.btn-primary`) and Cancel
   (`.btn-secondary`) in `.drink-entry-tools`.
   - The field is `type="number"`, `inputmode="numeric"`, `min` 1, `max` 67,
     `step` 1, class `form-input drink-amount-input` (the same rules as
     `.drink-time-input`: `width: auto`, the 44px minimum height), sized for
     two digits. It's prefilled with the entry's ounces rounded to a whole
     number (118 ml → 4).
   - "oz" follows the field, `--text-sm` `--color-text-secondary`.
3. Save: if the field still holds its prefilled value, nothing is sent and the
   editor closes. That holds even for an odd-ml entry whose rounding the user
   never touched. Otherwise it calls `updateDrinkAmount` with
   `round(oz × 29.5735)` ml. While the call is in flight Save is disabled, as
   Edit time's `busy` is. On success the editor and the menu close, and the
   entry, the tile value, the bar toward the goal and the 7-day bar all show
   the new amount.
4. Cancel goes back to the tools row with nothing changed.

The maximum is **67 oz** because `WATER_AMOUNT_MAX_ML` is 2000 ml, and 67 oz
(1981 ml) is the largest whole ounce under it.

### States

| Case | Shows |
|---|---|
| Field blank, 0, over 67, or not whole | Save disabled. No message: the bounds are in the field |
| Saving | Save disabled, the entry keeps its old amount until the API answers |
| Save failed | the editor stays open with the typed value, and "Couldn't save that amount." (`ERROR_AMOUNT`, beside `ERROR_TIME`) shows inline in the entry, as a failed Edit time does |
| Entry deleted elsewhere | the API's not-found refusal shows as the failure above, and the next read drops the entry |

The amount edit isn't optimistic, unlike adds. It follows Edit time, the other
in-place edit, so a failure never shows a number that was never saved.

### Accessibility

- The field's accessible name is "Amount in ounces for the 2:15 PM water
  entry", matching Edit time's "Time for the … entry".
- After a save, the totals' live region announces the new water total as it
  does after an add.
- Focus: on Save or Cancel, focus returns to the entry's ⋯ button.

### Copy

"Edit amount", "oz", "Couldn't save that amount."

## New tokens

None. `.drink-amount-input` reuses `.drink-time-input`'s rules.
