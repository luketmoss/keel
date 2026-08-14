# 155 — Cairns replace photos

The model is in [cairns.md](cairns.md), which is standing and outranks this note.
Read it first; this file covers only what is specific to shipping the change —
the states, the copy, and what gets deleted.

Shell and column from [shell-and-content-model.md](shell-and-content-model.md),
tokens from [design-language.md](design-language.md), interpolation from
[52's module](../../src/photo/interpolate.ts). Import feedback follows #75, and
the draft rule follows #81.

## What this issue deletes from the design

Three specified behaviours stop existing. They are listed here so that removing
them reads as a decision rather than an omission.

- **`shell-and-content-model.md`'s *Position, and the photo that has none*.**
  The `no location` row treatment in `--danger`, and the detail-face explanation
  beside it, are both deleted. Nothing can reach that state any more.
- **The `Photos` filter chip.** Becomes `Cairns`. The facet row that restores
  finer filtering is #159.
- **The photo lightbox as a separate surface** is *not* deleted — #55's lightbox
  still opens from a cairn's image. Only the standalone photo list is gone.

## The main path

1. Drag image files anywhere over the app. The existing drop overlay appears,
   reading **Drop photos to import them as cairns**.
2. Drop. Each file resolves in the order [cairns.md](cairns.md) specifies.
3. Files that resolve upload and appear as markers, newest first, exactly as a
   photo import does today. Per-file progress and failure rows follow #75
   unchanged.
4. Files that resolve neither way do not upload. The panel switches to the
   placement face and the map takes a crosshair cursor.
5. Placing the last one opens that cairn's detail face.

## The placement face

Replaces the panel's list face for the duration. The search card's left slot
becomes Back, its centre reads **Place this photo** over `needs a location`, and
the filter chips are hidden — the same treatment a draft already gets.

```
NOT SAVED                     --text-xs, --mono, uppercase, --accent
▓▓▓░░                         one cell per file in the batch
5 photos · 3 placed · 2 need a location

[ the image, 4:3, --radius-sm, 2px --accent border ]
IMG_4423.jpg · 17 Jun 2023    --text-xs, --mono, --text-muted

Click the map to place it, or click the pulsing ring —
the nearest point on your route by time.

  Skip this one        Discard 2
```

**Copy, exactly.**

| Where | String |
|---|---|
| Eyebrow | `Not saved` |
| Summary | `5 photos · 3 placed · 2 need a location` |
| Summary, one left | `5 photos · 4 placed · 1 needs a location` |
| Note, suggestion available | `Click the map to place it, or click the pulsing ring — the nearest point on your route by time.` |
| Note, no suggestion | `No GPS, and no track covers its timestamp. Click the map to place it.` |
| Skip | `Skip this one` |
| Discard | `Discard 2` / `Discard 1` |
| Reassurance | `These 2 are not in your library and nothing has been written to Drive. Placing one is what makes it a cairn; discarding means they were never imported.` |

The reassurance block takes the `--ground` inset treatment at `--text-xs`
`--mono`, the same surface a detail face uses for its record readout.

The queue bar is one cell per file in the whole batch — placed cells `--accent`,
the current cell `--text`, the rest `--surface-lift`, `--radius-full`, 4px tall,
3px apart. It shows progress through the *batch*, not through the queue, so a
drop of forty with two stragglers does not read as a two-item task.

### The suggestion ring

`--marker-size`, `--radius-full`, 2px dashed `--accent`, filled
`color-mix(in srgb, var(--accent) 18%, transparent)`, pulsing between scale 1
and 1.18 over 1.8s. Its name chip reads `nearest by time` and is always visible
rather than revealed on hover — it is an offer, not a label.

Suppressed under `prefers-reduced-motion`: the ring still draws, it does not
pulse.

Absent entirely when no trip is open, or when the open trip has no timed track
points.

## States

| State | Placement face | Map |
|---|---|---|
| Queue has files | As above | Crosshair cursor, ring if a suggestion exists |
| Queue empties | Face closes, last placed cairn's detail opens | Cursor returns to grab |
| Discarded | Face closes, list face returns | Cursor returns to grab |
| Signed out mid-batch | #75's reconnect row, per file; the queue itself is unaffected because nothing in it has been written | Unchanged |
| Disconnected (#73) | Drop is refused up front with `Sign in to keep tracks and cairns.` | Unchanged |

**Back, in the search card, discards the remaining queue** — it is the same
action as `Discard n`, reached from the other end. It does not silently save
them, because there is nothing to save.

## Edge cases

- **A file that is not an image** — refused before any of this, by
  `validateImageFile`, as a #75 failure row. It never enters the queue.
- **Every file in a batch fails to upload** — nothing is written, as today.
- **A batch where every file needs placing** — the queue bar is all
  `--surface-lift`; the summary reads `4 photos · 0 placed · 4 need a location`.
- **Rapid repeat drops while the queue is open** — the new batch's resolved
  files save, and its unresolved files append to the existing queue rather than
  replacing it. The queue bar then reflects the combined batch.
- **Placing a cairn outside the current viewport** is impossible by
  construction; the click is the coordinate.
- **A cairn whose image uploads but whose thumbnail does not** is a failure, not
  a half-present cairn — the `both, or neither` rule, unchanged from #110.

## The detail face

| Row | Treatment |
|---|---|
| Name | `--text-lg` / 700, `letter-spacing: -0.01em` |
| Meta | `--text-xs`, `--mono`, uppercase, `--text-muted` — `13 JUN 2023 · CAMPSITE · PHOTO` |
| Image | Full width, 4:3, `object-fit: cover`, `--radius-sm`; opens #55's lightbox |
| Description | `--text-sm`; `No description.` in `--text-muted` italic when empty |
| Position | The sentence from [cairns.md](cairns.md)'s source table, in the `--accent` left-rule note treatment |
| Primary | `Add to a trip`, or `Remove from trip` when owned |

The icon picker lives here too, but choosing one is #156's — this issue renders
the current icon and nothing more.

## Markers

Pin geometry: a 30 × 38 teardrop, `--surface` fill at 95%, 1.5px
`rgba(255,255,255,.55)` stroke, glyph in `--text` at 1.9px. Selected inverts to
`--accent` fill with the glyph in `--on-accent`. Drop shadow
`drop-shadow(0 6px 14px rgba(6,8,18,.7))` rather than the panel's box shadow —
a teardrop's silhouette needs the shadow to follow it.

Transform origin is `center bottom`, so hover scaling grows the pin upward from
the coordinate rather than sliding its tip off it.

The camera badge is 12px, `--radius-full`, `--text` fill with a 1.5px
`--surface` ring, at the pin's top right.

Hit target stays `--hit-target` for every marker regardless of drawn size.

## New tokens

| Token | Value | For |
|---|---|---|
| `--marker-poi` | `30px` | The pin marker's width; its height is 1.26× |

`--marker-size`, `--marker-ring`, `--dot-size`, `--dot-ring` and
`--marker-track` are all unchanged and reused.

## Accessibility

- Each marker is a button with an accessible name of the cairn's name; the pin's
  icon is `aria-hidden` since the name already carries it.
- The suggestion ring's accessible name is `Place it at the suggested location`.
- The placement face's image carries an empty `alt` — it is decorative in
  context, since the filename directly beneath it names the file.
- Crosshair cursor is not the only affordance: the note text states the action.
