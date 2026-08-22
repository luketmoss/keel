# 268 — expanding a track row

The numbers come back into the list, at the width they were always measured
for.

Standing documents: [shell-and-content-model.md](shell-and-content-model.md)
(the column, `--panel-width`, the row anatomy, the phone sheet),
[design-language.md](design-language.md) (states, motion, scale). Prior notes:
[250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) — the pattern this
follows and the width finding it produced —
[226-track-face.md](226-track-face.md) — **revised here**, see *What this
revises in #226* — [219-opened-track-detail.md](219-opened-track-detail.md)
(the profile, the one-at-a-time rule and the click rule, all reinstated),
[218-track-and-trip-stats.md](218-track-and-trip-stats.md) (the numbers and the
em-dash rule, unchanged and authoritative),
[193-trip-row-anatomy.md](193-trip-row-anatomy.md) (the row and its `⋮`),
[224-sampled-elevation.md](224-sampled-elevation.md) (the sampled footnote),
[251-linked-hover.md](251-linked-hover.md) (row hover, untouched here).

## Why

> *"I like how photos expand in the side view to show a preview. I would like
> clicking on a track to also expand the details of that track."*

#250's *Why* applies unchanged: reading a trip's tracks is a sequence, not one
lookup. `More details` answers it with a menu and a route change, and the list
you were comparing against is gone by the time the answer arrives.

## What this revises in #226

#226 removed the inline detail and moved it to the face. Its reason was
specific and correct:

> *"#219 measured 99.3px stat cells in the trip totals block — which sits at
> the panel's full inner width — and then specified the same six-cell grid into
> the track row's **146px** text column."*

and it drew the general conclusion that *"a row disclosure is capped at the
row's width forever"*.

**The measurement is what is overturned, not the lesson.** #226's own lesson —
a measurement belongs to a container — is what fixes it: the container was
never the text column. #250 drew a preview at the **row's content width**,
`--panel-width` less the row's own padding, and that is ~344px, the same
container `StatGrid` was measured in for #218's totals block. Six cells land at
the ~99px they were designed for. #219 failed because it indented; this does
not indent.

Everything else #226 established stands and is reused verbatim: the unified
`TrackFaceBody`, the one formatter, the footnote line, the `/tracks/:id` route
and the face itself.

**What #226 keeps.** The face is not deleted. A loose track reaches it from the
shell list, which this note does not touch, and `/tracks/:id` stays
deep-linkable for both kinds. Only the **trip** track row's `More details` item
goes, because the row now answers the question the item existed to answer.

## The main path

1. The trip's track list renders as it does today — `⠿`, swatch, name, meta
   line, `👁`, `⋮`.
2. **Click the row's name, meta line, or the whitespace around them.** The row
   expands: the profile and the stat grid draw beneath the header, inside the
   same `<li>`.
3. **Click the header again.** The row collapses.
4. **Click another row.** The first collapses and the second expands. One at a
   time.

## The expanded row

```
┌──────────────────────────────────────────────┐
│ ⠿ ●  Belford & Oxford traverse         👁  ⋮ │  ← header, unchanged
│      6.4 mi · 5h 20m · 2,780 ft ↑            │
│ ┌──────────────────────────────────────────┐ │
│ │     ▁▃▅▇█▇▅▆█▇▅▃▂▁                       │ │
│ │                                          │ │
│ │ DISTANCE     ASCENT       DESCENT        │ │
│ │ 6.4 mi       2,780 ft ↑   2,140 ft ↓     │ │
│ │                                          │ │
│ │ HIGH POINT   LOW POINT    DURATION       │ │
│ │ 14,153 ft    12,020 ft    5h 20m         │ │
│ │ ────────────────────────────────────     │ │
│ │ 1,284 points · Belford-Oxford.kml        │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Content | `TrackFaceBody`, unchanged — profile, `StatGrid`, sampled footnote, points/source footnote |
| Width | The row's content width — `--panel-width` less the row's own padding. **Not** the text column's |
| Left edge | The row's own left edge, flush with `⠿`. It is a block inside the row, not a hanging indent off the name |
| Profile height | `--profile-height` |
| Gap | `--space-3` between the header and the block |
| Ground | The row's own. **No `--surface-lift` fill and no border box.** #250 needed a ground because a photograph needs a seam; a profile and six labelled numbers are already type on the panel |

Drawing it flush rather than indented is the whole point of the issue, and it
is the one line of this note that is load-bearing.

## What a click does, per target

| You click | Effect |
|---|---|
| Name, meta line, or the header's whitespace | Toggles this row's expansion |
| `⠿`, the swatch, the swatch's popover | Their own behaviour. **Never toggles** |
| `👁`, `⋮`, a `⋮` item | Their own behaviour. **Never toggles** |
| The rename input, the delete confirm's buttons | Their own behaviour. **Never toggles** |
| Anywhere inside the expanded block | **Nothing.** The block is inert |
| A multi-track file's row | **Nothing.** It has no expanded state — #269 gives that click a meaning by making it select |

The rule is #219's and is reinstated as it was written: **ignore any click
whose target sits inside an interactive descendant**, in one place, rather than
`stopPropagation` in five handlers — so a control added to the row later is not
silently swallowed.

**The expanded block is inert**, which differs from #219, where the whole row
toggled. #250 is the reason: there, the header collapses and the content is its
own control, and *"a second click anywhere on the row … makes the row's own
area mean two different things depending on invisible state"*. A profile is not
a control today, so the block does nothing at all rather than doing the
opposite of what the header does.

### The keyboard path

**`track-row__text` becomes a `<button>` again**, carrying `aria-expanded` and
`aria-controls` pointing at the block's id — #219's name-as-button, restored.

#226 deleted it for one stated reason: it *"existed only to open the row's own
detail, which is gone"*. The detail is back, so the reason is spent. The button
wraps the name and the meta line and nothing else; the swatch and the
visibility control stay outside it, since a button inside a button is not a
thing.

`Rename` stays in the `⋮`. #226's argument holds and is not re-litigated —
click-to-rename was undiscoverable, and moving it back costs discoverability to
buy nothing.

## One at a time

Expanding a row collapses any other expanded row. #219's reason, unchanged: the
column's height is the scarce resource, and the comparison the reader is making
is against the trip totals block above, not against a second track.

State lives in `TripDetail` as `expandedTrackId`, beside `hoveredFileId`. It is
**not** derived from anything, for #250's reason at one remove — there is no
track selection to derive it from today, and #270 will add one that must be
able to move without collapsing the row.

## States

| State | The row |
|---|---|
| Single-track file, elevation present | Expands: profile, six values, footnote |
| No usable elevation | Expands: **no profile**, four em dashes, distance and duration real |
| No timestamps | Duration em dash, everything else real |
| Single-point track | Distance `0`, no profile, elevation and duration em dashes |
| Elevation sampled (#224) | Values carry #224's mark; its footnote draws above the points line |
| Multi-track file | **Does not expand.** No `aria-expanded`, no pointer affordance, no `More details` — it must not look like it opens |
| Renaming | The input replaces the name; an expanded block stays expanded |
| Removing (`track-row--removing`) | Collapses, and cannot be expanded — the row is inert already |
| Confirming a delete (#77) | Collapses. The confirm replaces the row's contents in place |
| Hidden from the map (visibility off) | Expands normally, **at full contrast**. #193's rule: hiding a track on the map does not make its numbers less true |
| Hovered (#251) | `--hover` on the header only. The block is not tinted, matching #251's treatment of #250's preview |
| Disconnected (#73) | Expands and reads at full contrast; only the `⋮`'s items disable. #218's rule — derived data with no control in it |
| Trip still loading rows (#35) | A row that is present expands. Nothing waits on the rest of the list |

## Scrolling

Expanding scrolls the row into view with `block: 'nearest'` on the **`<li>`**,
once the block has laid out.

This differs from #250, which anchors `nearest` on the header and says so
deliberately. The difference is that #250 hangs its scroll on *selection*,
which happens before the height changes; a track row has no selection to hang
it on. `nearest` on the whole row does the right thing at both sizes: a row
shorter than the remaining scrollport scrolls up just far enough to reveal the
block, and a row taller than it aligns its start edge — which is the header,
where the pointer already is.

## Edge cases

- **The expanded track is removed, or removed from the trip.** The row unmounts
  and takes the block with it. `expandedTrackId` is cleared by the same guard
  that clears it when the id stops matching any file — the self-cleaning
  property `expandedCairnId` already has.
- **The expanded row is dragged.** Reordering collapses it first, #219's rule:
  dragging a row three times its normal height past its neighbours makes the
  drop indicator unreadable.
- **The colour changes while expanded.** The profile restyles immediately — it
  reads the same value the swatch and the polyline do.
- **The colour popover open while expanded.** Both stay. Neither traps.
- **Visibility toggled while expanded.** Stays expanded, at full contrast.
- **Rapid clicking.** The header toggles; nothing is in flight, so every click
  lands. A double-click expands and collapses, which is what a toggle means.
- **A cairn row is expanded (#250) and a track row is then expanded.** Both
  stay. The two lists are separate sections with separate state, and #219's
  one-at-a-time rule is per list — a trip's tracks and its cairns are not
  competing answers to one question.
- **A very long track.** One path from the stored filtered series, as #219
  specified. No resampling; a 10,000-point path measuring slow is a finding for
  a follow-up, not a pre-emptive simplification.
- **Reduced motion.** The height transition collapses under the global block
  and the row snaps open. Nothing else here moves.
- **Touch.** Tap is the click. Rows keep `--row-touch`.
- **The phone sheet at peek.** Expanding raises the sheet to `--sheet-half`,
  exactly as #250 does — a stat grid drawn inside 140px of sheet is a grid
  nobody can see. From half or full the detent does not change.

## Copy

**No visible copy is added.** The block's own strings are #218's cell labels
and #226's footnote, unchanged.

| String | Where |
|---|---|
| `Elevation profile: {low} to {high} over {distance}` | The profile's `aria-label`, #219's, unchanged |

**Removed:** `More details`, from the trip track row's `⋮`. The remaining items
are `Rename` · `Remove from trip` · `Delete permanently…`, in #193's
safe-to-destructive order.

The header button carries `aria-expanded` — `true` while expanded, `false`
while collapsed, and **absent** on a multi-track file's row, which is not an
expandable thing and must not claim to be one. That is #250's rule for an
icon-only cairn, applied to the case that has no numbers instead of no image.

## Motion

Expand and collapse over `--motion-base` with `--ease`, using
`grid-template-rows: 0fr → 1fr` on a wrapper — #219's mechanism, which animates
to content height without measuring anything. Transition the named property,
never `all`.

The block is not `display: none` when collapsed; it is a collapsed grid row
taking `visibility: hidden` at the end of the transition, so it leaves the tab
order without the layout jump `display` causes mid-animation. #219's rule,
restored with it.

**The numbers do not animate.** No count-up, no cross-fade. A figure that
tweens is a figure you cannot read while it does.

## New tokens

None. `--profile-height` (#219) survives, `--space-3`, `--motion-base` and
`--ease` all exist, and the block's width is `--panel-width` less the row's own
padding rather than a value of its own.

## Decisions taken here

- **The block draws flush at the row's content width, not indented off the
  name.** This is what #226 could not do and #250 proved was available. An
  indented block is #219 again.
- **The block is inert; only the header toggles.** See *What a click does*.
- **The face survives.** Deleting `/tracks/:id` would strand loose tracks,
  which this issue deliberately does not touch.
- **`More details` is removed rather than kept alongside.** Two routes to one
  set of numbers, one of which navigates away, is the ambiguity the issue was
  filed about. This is the decision that could most reasonably have gone the
  other way, and it is reversible by re-adding one menu item.

## Out of scope

- **Loose track rows in the shell panel.** #250 drew the same line for loose
  cairn rows. Different component, its own issue.
- **A per-track detail for multi-track files** — still #219's named gap.
- **Scrubbing the profile**, hover readouts, or a marker tracking the map. The
  profile is a picture here, as it was in #219.
- **What the map does when a row expands** — highlighting the track (#269) and
  moving the camera to it (#270). Both land on this row's state and neither
  changes a decision here.
- **Editing anything in the block.** #46 and #133 own editing.
