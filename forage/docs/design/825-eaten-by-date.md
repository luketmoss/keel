# 825 — Eaten opens on a chosen date

Specifies [#825](https://github.com/luketmoss/keel/issues/825), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). The Eaten day view is
[`712-food-log.md`](712-food-log.md) and the hash routing is
[`704-app-shell.md`](704-app-shell.md); neither is restated. Nothing on screen changes: this note is about the URL.
There are no standing documents in `forage/docs/design/`, and nothing here introduces a token.

## The route

| Hash | Opens |
|---|---|
| `#/eaten` | Eaten on the day it was last on in this page load; today on a fresh load. Unchanged from #712 |
| `#/eaten/2026-03-14` | Eaten on 14 March 2026 |

The date is local `YYYY-MM-DD`, the form the API's `date` fields use. A link from outside the app is the
Pages URL with the hash, for example `https://luketmoss.github.io/keel/forage/#/eaten/2026-03-14`. The `?demo=true`
query, where present, sits before the hash as it does on every route (#704).

**The hash follows the day on screen.** While Eaten shows a day before today the hash is `#/eaten/<that date>`; on
today it is `#/eaten`. So a reload reopens the same day and Back from another tab comes back to it.

Every rewrite is in place (`history.replaceState`), never a new entry: stepping back five days and pressing Back
leaves Eaten for whatever was before it, not the day before. This matches #704's rewrite of an unknown hash.

Chosen over rewriting a dated link to `#/eaten` as soon as it opens, which was less work: a reload or a tab the phone
discarded and reloaded would then land on today, away from the meal the link was for.

## Main path

1. The nightly brief says "Yesterday's lunch isn't logged" and links to `#/eaten/<yesterday>`.
2. Forage opens on Eaten, the Eaten tab current, the header reading `Yesterday` with the full date under it. The
   meal cards show yesterday's entries; Lunch shows only its Add row.
3. Add to lunch, log it. The day card updates as on any day.
4. The next-day arrow goes to today. The hash becomes `#/eaten`.

## Signed out, and demo mode

- Signed out: the sign-in screen, as for any route. Signing in opens the shell on the hash's route, so Eaten
  opens on the dated day. `@keel/auth` signs in through a popup and never touches the hash.
- `?demo=true#/eaten/<date>` opens demo mode on that day. Demo data is today, two entries the day before and nothing
  earlier (#712 §Demo mode), so a dated link to yesterday shows those two entries, and one to two days back shows
  the "Nothing logged" day card.

## Dates that don't open as given

All of these open Eaten **on today**, and the hash is rewritten in place to `#/eaten`. Nothing on screen
says the link was wrong: today's log is a useful place to land, and the brief builds its links from real dates.

| Hash | Why |
|---|---|
| `#/eaten/yesterday`, `#/eaten/2026-3-4`, `#/eaten/20260304` | Not `YYYY-MM-DD` |
| `#/eaten/2026-02-30`, `#/eaten/2026-13-01` | Not a calendar date |
| `#/eaten/<tomorrow or later>` | Eaten never shows a day after the device's today (#712) |
| `#/eaten/<today>` | Today, written the plain way |
| `#/eaten/` (a trailing slash, nothing after it) | No date |

Anything under `#/eaten/` opens Eaten, never Plan: whoever wrote it meant Eaten. A hash outside every route still
opens Plan, as #704 says.

There is no earliest date. A link a year back opens a year back, as the previous-day arrow would have.

## Transitions

- **Previous and next day** work as #712 says, and each move rewrites the hash: `#/eaten/<date>`, or `#/eaten`
  when the move lands on today.
- **Switching tabs.** Leaving Eaten for Plan and tapping Eaten again returns to the day last shown, as now. The
  tab bar's Eaten target stays `#/eaten`, and the Eaten screen puts the date back in the hash when it shows.
- **Tapping Eaten while on Eaten** does nothing but reset the scroll, as #704 says. It does not jump to today.
- **The hash changed while Eaten is open** (by hand, or by another dated link opening in the same tab): Eaten moves
  to the new day, shows the loading card, and loads it. An answer for the day it left that lands late is dropped, by
  the store's rule that a slower, older answer never wins.
- **Midnight.** With Eaten open on today when the device's date rolls over, the day shown doesn't change, as now,
  and its header reads `Yesterday` at the next load. The hash becomes that day's dated form at the same load.

## Copy

None new. The header, day card and meal cards are #712's.

## Out of scope

- A "Today" button or date picker on Eaten.
- Pointing a link at one meal (scrolling to Dinner, or opening its Add sheet).
- Dated routes for Plan, Shop or Library.
