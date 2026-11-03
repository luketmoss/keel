# #785 — A save shows on screen the moment its sheet closes

The rule for every tab: **when a sheet closes after a write, the screen behind it already shows the result.** The
write's own reply is what the screen shows. A refresh still follows, but quietly, only to bring figures the reply
can't give (totals, counts) up to date.

Nothing new is drawn. This note changes when existing things happen, not what they look like. No new tokens and no
new copy. Every string below is already in the app (#709, #712, #718, #719).

## The main path

The Amount sheet (#712), logging Greek yogurt to Dinner:

1. **Log it** is tapped. The button is disabled with `aria-busy`, and the stepper, unit and meal chips are disabled,
   as today (712 §Amount sheet, "Saving").
2. `logEntry` answers the stored entry, with its snapshot.
3. In one update, the entry goes into the day's entries in `logged_at` order under Dinner (the same order a reload
   gives), the sheet closes, and the toast "Logged Greek yogurt" shows. No frame shows Dinner without it.
4. In the background, the day reloads without changing `dayState`. When it answers, the day card's totals, the
   entries and the planned rows are replaced with what came back. If nothing else changed, nothing visibly moves.

Every other write follows the same three beats: busy, then patch, close and toast together, then a quiet refresh.

| Tab | Write | Patched from the reply | Refreshed quietly |
|---|---|---|---|
| Eaten | Log, edit amount or meal | The entry, inserted or replaced | Day card totals |
| Eaten | Delete entry | The entry, removed once `deleteLogEntry` answers | Day card totals |
| Eaten | Log a planned meal (row button) | The entry. The planned row goes, since `unloggedPlan` hides it | Day card totals |
| Plan | Plan, move, edit, remove a meal | The plan entry, inserted, replaced or removed | Banner count, late meals |
| Library | Save, create or delete a food; set a weight; add starters | The food in `libraryFoods` | — |
| Library | Recipe nutrition line matched, cook saved, recipe deleted | The recipe detail, cook or list row | The recipe list (its rating and last cooked are derived) |
| Shop | Every trip write | The trip the reply carries (`showTrip`) | — |

Where a reply is the whole object the screen shows (a `Trip`, a `Food`), nothing needs a refresh.

## States

| State | Shows |
|---|---|
| Saving | Unchanged: the sheet open, its primary button disabled with `aria-busy`, its inputs disabled |
| Saved | The sheet gone, the change in place, the tab's existing toast |
| Refreshing after a save | Nothing different. No skeleton, no "Updating…", no spinner. Old totals stay until new ones arrive |
| Refresh failed after a save | Nothing different. The patched screen stays and the error state is not shown. The next visit, focus or save loads again |
| Save failed | Unchanged: the sheet stays open with its existing error line, and the screen behind is untouched |
| First load, Retry, coming back to the app | Unchanged: the skeleton while `dayState` / `planState` / `shopState` is `loading` |

The skeleton means "we have nothing to show yet". After a save there is always something to show, so it never
appears.

## Edge cases

- **Two saves close together.** The second sheet can open while the first one's refresh is still out. Each patch
  goes in when its write answers, and each store's existing sequence counter means only the latest refresh lands.
  A refresh that started before a later patch could overwrite the newer row with older data, so a refresh's answer
  is dropped if a patch landed after the refresh began. The next refresh brings it.
- **Double tap on Log it.** The button is disabled from the first tap, so one write goes out (unchanged).
- **The entry's day isn't the day shown.** The Amount sheet logs to the day on screen, so this can't happen from
  the app. If a reply's `date` differs from `eatenDate` anyway, it isn't inserted, and the refresh decides.
- **Moving an entry to another meal.** It's replaced in place, and it renders under its new slot.
- **Plan move to a date outside the visible week.** The entry is removed from the list instead of replaced.
- **A write the server refuses as gone** (Plan's `not_found`, Shop's list closed): handled as today, with the notice
  and a full load. Those are not saves.
- **Demo mode.** The demo API returns the same shapes, so the same path runs.

## Transitions

The sheet's close, the patch and the toast are one render. No animation is added. The sheet's existing close (no
slide under reduced motion, per 712) is the only motion.

## Measured

Nothing here is a quantity, so there is nothing to measure.
