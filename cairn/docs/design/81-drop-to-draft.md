# 81 — Drop a KML anywhere to start a trip

Replaces the v1 import surface from [4-file-import.md](4-file-import.md) for
everything outside a trip; in-trip import from
[34-attach-tracks-to-trip.md](34-attach-tracks-to-trip.md) is unchanged. Shell
from [78-full-screen-shell.md](78-full-screen-shell.md), the dot it collapses
into from [79-world-map-dots.md](79-world-map-dots.md). Tokens from
[design-language.md](design-language.md).

## The rule

> **a dot means it is a trip · a route means it is not saved yet**

This is the issue that rule exists for. A dropped KML is the only thing on the
world map drawn as a line, which is what makes "not saved" legible without a
badge, a label, or an italic. Saving collapses the route into a dot; that
collapse *is* the confirmation.

## Main path

1. Drag a `.kml` or `.kmz` anywhere over the app. The drop overlay appears, as
   it does today.
2. Drop. The file parses, its route draws in `--text` at 3px, and the camera
   fits to it over `--motion-slow` — a drop is an explicit *look at this*.
3. The trip form opens as a right-docked panel over the map. Nothing has been
   written anywhere.
4. Name is pre-filled from the filename without its extension. Status defaults
   to `Completed`. Dates and notes are empty.
5. **Save** writes the trip, its overview and its source files. The route fades
   out over `--motion-base` as the trip's dot fades in at its first coordinate.
   The panel closes.
6. Or **Cancel** — the route disappears, the panel closes, nothing existed.

## The draft panel

Right-docked, mirroring the trips panel's left dock so the two never collide,
`--panel-width`, inset `--space-4`. L2. Reuses the trip metadata form from
[35-trip-detail-view.md](35-trip-detail-view.md) rather than a bespoke one — the
fields are identical and a second form would drift.

```
┌────────────────────────────┐
│  NOT SAVED                 │
│  day1.kml · 1 track        │
│                            │
│  Name  [ day1            ] │
│  Status  [ Completed  ▾ ]  │
│  Start   [            ]    │
│  End     [            ]    │
│  Notes   [            ]    │
│                            │
│  [ Cancel ]      [ Save ]  │
└────────────────────────────┘
```

**`NOT SAVED`** — `--text-xs` at 700, uppercase, `0.06em` tracking, in `--text`.
The same near-white as the drawn route, because the panel and the line it
describes are one object. Not `--danger`: nothing is wrong, and not `--accent`,
which is spent on interaction.

**File summary** — `--text-xs` `--text-muted`. One file names it; several give
the count. Track count follows the same rule.

**Save** — `--accent` fill, `--on-accent` text, 700. Disabled at `opacity: 0.4`
with `cursor: default` when the name is empty.
**Cancel** — ghost button, `--border`, `--text-muted`, `--hover` on hover.

Cancel is not styled destructive. It destroys nothing that exists — that is the
entire argument for this design over create-then-delete, and the button should
say so.

### Why status defaults to Completed

A KML you are dropping is almost always a track you already walked; a `planned`
trip is normally created empty and filled later. `TripStore.createTrip` hardcodes
`planned`, which is right for its caller and wrong for this one. The field is
right there in the form, so the cost of the wrong guess is one click.

## States

**Parsing** — between drop and route, the overlay stays up. No separate spinner;
parsing one KML is fast enough that a spinner would flash and vanish.

**Draft open** — as above. The status pills and date range from #79 are hidden
while a draft is open: filtering the saved set is not what the user is doing, and
the controls would compete with the decision in front of them.

**Saving** — `Save` shows `Saving…` and is disabled; the form stays visible and
editable-looking but inert. The route stays drawn. Cancel is disabled too — a
cancel mid-write has no defined meaning and the write is fast.

**Save failed** — the panel stays open, the route stays drawn, and a `--danger`
message appears above the actions:

> **Could not save. Your tracks are still here — try again.**

Nothing is lost, which is the message's whole job. `Save` re-enables.

**Signed out** — the route draws and the form opens normally. `Save` is replaced
by `Sign in to save`, which opens the same sign-in flow as the account bubble.
After signing in, the draft is still there and `Save` returns. A drop while
signed out must not be silently swallowed — that is the fault #75 reports.

**Rejected file** — no draft opens, no route draws. The failure appears as an L2
toast, bottom-centre, `--danger` text, dismissible, auto-clearing after 6s:

| Cause | Copy |
|---|---|
| Wrong extension | `Only .kml and .kmz files can be imported.` |
| Unparseable | `<name> is not a valid KML file.` |
| No tracks inside | `<name> has no tracks in it.` |
| Photo, outside a trip | `Photos belong to a trip — open one first.` |

## Edge cases

- **Dropping more files while a draft is open** — they parse and add to the same
  draft. Each route draws; the camera re-fits to all of them together. The file
  summary becomes `3 files · 7 tracks`. The name, once the user has edited it, is
  not re-seeded by a later drop.
- **Dropping a mix of valid and invalid files** — valid ones enter the draft,
  invalid ones raise their own toasts. One bad file does not discard the batch.
- **Dropping onto an open trip** — attaches to that trip, unchanged. The draft
  flow never engages while a trip is open.
- **Dropping while the trips panel is open** — the panel closes and the draft
  opens. Two docked panels at once is a layout with no winner, and the drop is
  the more recent intent.
- **Navigating away with a draft open** — the draft is kept for the session, and
  returning to `/` shows it again with its route. Losing an unsaved import to a
  misclick is the worst outcome this design can produce, so it does not.
- **Reloading with a draft open** — the draft is gone. Nothing was persisted;
  that is the contract, and the `NOT SAVED` label is what warned about it.
- **A KML whose tracks have no points** — treated as *no tracks in it*.
- **A very large KML** — parses on the main thread as it does today. Not made
  worse here, and not fixed here.
- **Reduced motion** — the route draw-on, the fade-to-dot, and the camera fit all
  collapse to cuts, per the language.
- **Keyboard only** — a keyboard user cannot drop a file. The account bubble is
  not the place for an import control, so the empty state's *Drop a KML anywhere*
  copy (#79) is also a button that opens the file picker. That is the only import
  affordance that is not a drop, and it is deliberate: one control, in the one
  place a user with no trips is already looking.

## Copy

| Context | Copy |
|---|---|
| Panel eyebrow | `NOT SAVED` |
| Summary, one file | `<name> · <n> tracks` |
| Summary, several | `<n> files · <n> tracks` |
| Save | `Save` / `Saving…` / `Sign in to save` |
| Cancel | `Cancel` |
| Save failure | `Could not save. Your tracks are still here — try again.` |
| Name field placeholder | `Trip name` |

## New tokens

None. `--panel-width` comes from #80, and the route colour is `--text` at its
existing weight.
