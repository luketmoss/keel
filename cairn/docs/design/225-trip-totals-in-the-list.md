# 225 — a trip's numbers, before you open it

Standing documents read first: [shell-and-content-model.md](shell-and-content-model.md)
(the row anatomy, and the `4T · 128P` counts convention this has to sit beside),
[design-language.md](design-language.md). Prior notes:
[218-track-and-trip-stats.md](218-track-and-trip-stats.md) (the numbers and their
rules), [7-track-statistics.md](7-track-statistics.md) (the meta line shape and
the unavailable rule), [80-trips-panel.md](80-trips-panel.md),
[131-trip-row-counts.md](131-trip-row-counts.md), [193-trip-row-anatomy.md](193-trip-row-anatomy.md).

## The shape

```
┌────────────────────────────────────────────────┐
│    ●   Holy Cross, four days                 ⋮ │
│        4–7 Aug 2026 · 26.6 mi · 6,960 ft ↑     │
└────────────────────────────────────────────────┘
```

The meta line the row already has, with two values appended. Same
`--text-xs` `--text-muted`, same ` · ` separator, same line — **not a third
line**, which would change every row's height and cost the list a third of its
visible rows to buy a number.

## What goes on it, and what does not

Three values were proposed: distance, ascent, track count. **The count comes
off.**

`shell-and-content-model.md` already puts a trip's contents on the row as
`4T · 128P` in the monospace face, and that convention is standing. A second
count in a different format on the same row is the kind of near-duplicate that
makes a list harder to read, not easier. Distance and ascent are what the count
convention cannot express and what the issue was raised for.

So: **date range · distance · ascent**, in that order. Dates first because they
are already there and already anchor the row; distance before ascent because #7
set that order and every other stats line in the app follows it.

## Why the date range survives and nothing else is dropped

The row is 236px of text width (#193's arithmetic for the trip face's sibling).
`4–7 Aug 2026 · 26.6 mi · 6,960 ft ↑` is a real risk of ellipsis on a long date
range, and the honest answer is that it ellipsises from the right — losing the
ascent first, then the distance, keeping the dates.

That ordering is the decision: **the dates identify the trip and the numbers
describe it.** A row that has lost its numbers is still a usable list row; a row
that has lost its dates is two trips that look the same.

`text-overflow: ellipsis` on the single line handles it, and the full set is one
click away inside the trip, where #218's grid has room for all six.

## States

| State | Meta line |
|---|---|
| Tracks with elevation | `4–7 Aug 2026 · 26.6 mi · 6,960 ft ↑` |
| Tracks, none with elevation | `4–7 Aug 2026 · 18.3 mi` |
| No tracks | `12–14 Sep 2026` — dates alone, no dashes |
| No dates, has tracks | `26.6 mi · 6,960 ft ↑` |
| Neither | Empty meta line, row is one line tall |
| Sidecar missing or unreadable | Dates alone, no error |
| Totals stale (version mismatch) | Dates alone, until the recompute lands |
| Sampled elevation (#224) | `~6,960 ft ↑` — the mark travels |

**No em dashes on this row, unlike #218's grid.** The two surfaces differ on
purpose and the reason matters: a grid with a labelled `Ascent` cell has
*promised* a value, so its absence needs a dash to explain the empty cell. An
inline ` · `-separated line has promised nothing — a shorter line is simply
shorter, and #7 already ruled that trailing dashes make a row "look broken".

This is the same rule #7 applied to track rows, reaching the trip row unchanged.

## The empty and the unreadable read identically

A trip whose sidecar is missing shows dates alone — the same as a trip with no
tracks. That is deliberate. The alternative is an error affordance on a list row
for a condition the reader cannot act on and that resolves itself the next time
the trip is saved. #73's rule that one sentence per surface beats one indicator
per item applies: nothing is claimed, so nothing is wrong.

The numbers appearing later, once a recompute lands, is a row quietly getting
better. No transition, no flash — see below.

## Transitions

**None.** The meta line changes when the underlying data changes, with no
animation.

A number that tweens is a number you cannot read while it does, which #219
already established for the same reason. And a list where rows visibly reflow as
sidecars load reads as instability rather than progress.

## What must not trigger a rewrite

The acceptance criteria name it and the reason belongs here: **renaming,
recolouring or reordering a track does not rewrite the totals.**

Those are `overrides.json` concerns and they do not change a single number. A
sidecar rewritten on every rename is a Drive write per keystroke-commit, a new
revision each time, and an invitation to conflicts on a store whose whole design
avoids them. The regeneration contract is *when the track set changes* — added,
removed, or replaced — and nothing else.

## Version stamp

#218's constants live in code. A retune of `ELEVATION_THRESHOLD_METERS` would
otherwise leave every stored total computed under the old value with nothing to
reveal it, and the list would disagree with the trip detail for as long as
nobody noticed.

A stamp in the sidecar, compared on read, recomputing on mismatch. Cheap now,
unpleasant later.

**Shared with #224**, which needs the same stamp for the same reason. Whichever
lands first defines it and the second reads it — two stamps in one sidecar would
be the bug this is meant to prevent.

## Copy

No new strings. The line is composed from `formatTripDateRange`,
`formatDistance` and `formatElevationGain`, all of which exist and all of which
already obey #7's rules.

Composition, not a new formatter: joining present values with ` · ` and omitting
absent ones is exactly what `formatStatsLine` does for tracks, and this is the
same shape with a date on the front.

## Edge cases

- **A trip whose tracks are all hidden on the map.** Totals unchanged.
  Visibility is a map control, per #218.
- **A very long trip name.** The name line ellipsises independently; the meta
  line is its own line and is unaffected.
- **A trip open in the detail view while its row is visible.** Both read the
  same numbers from different places — the detail from parsed tracks, the row
  from the sidecar — and an acceptance criterion pins them equal. If they ever
  disagree, the stamp is wrong.
- **A loose track's row.** Untouched. It already carries its own #7 line
  computed from the single file it has, and it needs no sidecar to do it.
- **Phone.** The row is the same row in the sheet; the meta line ellipsises
  earlier and drops ascent first, per the ordering above.
- **A trip with one track.** Reads identically to a trip with six. No "1 track"
  special case, because the count is not on this line.

## New tokens

None.

## Out of scope

Everything in the issue's Out of Scope, plus:

- **Changing the `4T · 128P` counts convention** or where it sits. Standing, and
  this note only declines to duplicate it.
- **A totals line on the world map's hover cards.** Same data, different surface,
  different note.
