# 156 — Creating a cairn by clicking the map

Model in [cairns.md](cairns.md), which is standing and outranks this note. Shell
from [shell-and-content-model.md](shell-and-content-model.md), tokens from
[design-language.md](design-language.md). The draft stance is #81's.

## The gesture

**Right-click on desktop, long-press on touch.** A plain left click is already
deselect, and taking it would cost the more common action to buy the rarer one.

Long-press is 480ms, cancelled by any pointer movement — a press that turns into
a pan is a pan.

**No armed placement mode.** A mode has to be entered, remembered and left, and
every one of those is a chance to strand the user in it. The gesture carries its
own coordinate, so there is nothing to arm.

### Discoverability, unresolved

Right-click is undiscoverable and this issue does not fix it. What ships is a
hint chip, bottom centre, `--radius-full`, L2, reading:

> Right-click the map to place a cairn &nbsp;&nbsp;`long-press on touch`

with the second half in `--mono` `--text-xs` on a `--surface-lift` inset. It
appears 900ms after first load and hides on the first successful placement.

This is a placeholder for a real affordance and is recorded as such. The
candidates not taken here: a `+` control in the map's bottom-right stack (a
mode, rejected above), and an item in the panel header's `New trip` row (far
from the map, and the gesture is about a coordinate).

## The create face

Replaces the panel's list face. The search card's left slot becomes Back, its
centre reads the typed name over `new cairn`, and the filter chips are hidden —
the same treatment the placement face and any draft already get.

```
NAME
[ Ellery Creek camp                      ]

WHAT IS THIS PLACE
[⛺] [💧] [🛖] [👁] [⛰]
[⚠] [ P] [ Y] [none]

DESCRIPTION
[ Flat ground behind the ghost gums.      ]

DATE
[ 14/08/2026 ]

positionSource placed
trip null  (nothing was open — this will be loose)

  Create        Cancel
```

Field labels are `--text-xs`, `--mono`, uppercase, `--text-muted`. Inputs take
`--surface-lift` with a 1px `--border` and `--radius-sm`. The name field is
focused on open.

The icon grid is five across at `--hit-target` each, `--radius-sm`,
`--surface-lift`, with the selected one in `--accent-soft` / `--accent` per the
language's Selected state. `none` is the ninth cell and carries the word rather
than a glyph — an icon meaning *no icon* is a riddle.

**Icons default to none.** Pre-selecting `campsite` would put a tent on every
cairn made by someone who did not look at the grid.

## Ownership is stated before you commit

The readout above the buttons is not decoration. It reads:

| Context | Line |
|---|---|
| Nothing open | `trip null` · `(nothing was open — this will be loose)` |
| A trip open | `trip <trip-id>` · `(a trip was open when you clicked)` |

Ownership decided by context is the right default and a silent one is a trap, so
the face says which it chose while there is still a Cancel button.

## States

| State | What shows |
|---|---|
| Just opened | Pin dropped and selected in `--accent`, name empty and focused, `Create` enabled |
| Name empty on Create | Commits the icon's label, or `Cairn`. Not an error, not a block |
| Cancel | Pin removed, list face returns, nothing written |
| Back (search card) | Identical to Cancel |
| Disconnected (#73) | `Create` takes the Disabled treatment with one sentence: `Sign in to keep cairns.` The form still fills in |
| Right-click while the create face is open | The existing draft is replaced by a pin at the new coordinate; typed values are kept |

That last one is deliberate: a mis-click during placement is far more likely than
a deliberate second cairn, and re-typing the name to fix a coordinate would be
the wrong tax.

## Edge cases

- **Right-click on an existing marker** — opens that cairn, no create face. The
  marker layer takes the event first.
- **Right-click during the #155 placement queue** — ignored. The queue already
  owns the map click, and two placement intents at once has no sensible reading.
- **Long-press that becomes a drag** — cancelled, treated as a pan.
- **Creating with no map interaction possible** (map failed to load) — the
  gesture is unavailable, and this is not surfaced; the map's own unavailable
  state (#2) already says the map is not there.

## Retyping an existing cairn

The same icon grid appears on a cairn's detail face under the same
`WHAT IS THIS PLACE` label. Choosing an icon writes `icon` and nothing else.

The visible consequence is immediate and is the whole point of the change:
a photo with an icon stops drawing as a thumbnail and starts drawing as a pin
with a camera badge, in the map and in its row together, per
[cairns.md](cairns.md)'s marker rule.

Choosing `none` on a cairn that has an image returns it to a thumbnail.

## Copy

| Where | String |
|---|---|
| Search card kind line | `new cairn` |
| Name label / placeholder | `Name` / `Ellery Creek camp` |
| Icon label | `What is this place` |
| Description label / placeholder | `Description` / `Flat ground behind the ghost gums.` |
| Date label | `Date` |
| Buttons | `Create` · `Cancel` |
| Loose readout | `(nothing was open — this will be loose)` |
| Owned readout | `(a trip was open when you clicked)` |
| Disconnected | `Sign in to keep cairns.` |
| Hint chip | `Right-click the map to place a cairn` · `long-press on touch` |

## New tokens

None. The create face is built from `--hit-target`, `--radius-sm`,
`--surface-lift`, `--accent-soft` and the existing type steps.

## Accessibility

- Every icon cell is a button with an `aria-label` of its name and
  `aria-pressed` reflecting selection; the grid is a labelled group.
- The create face traps nothing — Back and Cancel are both reachable by keyboard,
  and Escape is equivalent to Cancel.
- Right-click is not the only route: with a cairn selected, `Enter` on the map
  surface is not introduced here, and that is precisely the gap the
  discoverability follow-up has to close. Recorded rather than hidden.
